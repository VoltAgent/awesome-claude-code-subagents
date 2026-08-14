/**
 * WASM MCP Web Worker — Off-main-thread JSON-RPC server.
 *
 * Owns one WasmMcpServer + one WasmGallery instance and proxies the MCP
 * surface (handle_message) plus the most common gallery operations
 * (list / search / count / setActive / getActive) so the main thread
 * never blocks on the ~300ms WASM compile or on tool execution.
 *
 * Wire format (request → main → worker):
 *   { id: number, method: "load" | "callMcp" | "gallery.X", params?: unknown }
 *
 * Wire format (response → worker → main):
 *   { id: number, result?: unknown, error?: string }
 */

// NOTE: This file runs in a Web Worker context. It deliberately does NOT
// import from $lib/wasm (which pulls in $app/environment — a SvelteKit
// runtime module not available outside the page bundle). Types are
// duplicated locally; the worker keeps a minimal mock fallback identical
// in shape to the one in $lib/wasm/index.ts.

interface WasmMcpServer {
	handle_message(message: string): string;
}

interface WasmGallery {
	list(): unknown[];
	listByCategory(category: string): unknown[];
	search(query: string): unknown[];
	get(id: string): unknown;
	setActive(id: string): void;
	getActive(): string | null;
	count(): number;
	getCategories(): Record<string, number>;
}

interface WorkerRequest {
	id: number;
	method: string;
	params?: unknown;
}

interface WorkerResponse {
	id: number;
	result?: unknown;
	error?: string;
}

let mcpServer: WasmMcpServer | null = null;
let gallery: WasmGallery | null = null;
let loadPromise: Promise<void> | null = null;

const ctx = self as unknown as Worker;

function reply(id: number, result?: unknown, error?: string) {
	const msg: WorkerResponse = { id };
	if (error !== undefined) msg.error = error;
	else msg.result = result;
	ctx.postMessage(msg);
}

/**
 * Worker-safe mock WasmMcpServer. The real WASM bundle is loaded by the
 * page bundle today; once we wire `static/wasm/rvagent_wasm.js` directly
 * into the worker via `import("/wasm/rvagent_wasm.js")`, this mock acts
 * as the fallback when the network fetch fails.
 */
function createMockServer(): WasmMcpServer {
	const fs = new Map<string, string>();

	return {
		handle_message(raw: string): string {
			let req: { id?: number | string; method?: string; params?: Record<string, unknown> };
			try {
				req = JSON.parse(raw);
			} catch {
				return JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: { code: -32700, message: "Parse error" },
				});
			}

			const { id = null, method, params } = req;

			if (method === "initialize") {
				return JSON.stringify({
					jsonrpc: "2.0",
					id,
					result: {
						protocolVersion: "2024-11-05",
						capabilities: { tools: {}, prompts: {} },
						serverInfo: { name: "rvagent-wasm-worker-mock", version: "1.0.0" },
					},
				});
			}

			if (method === "tools/list") {
				return JSON.stringify({
					jsonrpc: "2.0",
					id,
					result: {
						tools: [
							{
								name: "read_file",
								description: "Read a file from the virtual filesystem (worker mock)",
								inputSchema: {
									type: "object",
									properties: { path: { type: "string" } },
									required: ["path"],
								},
							},
							{
								name: "write_file",
								description: "Write a file to the virtual filesystem (worker mock)",
								inputSchema: {
									type: "object",
									properties: {
										path: { type: "string" },
										content: { type: "string" },
									},
									required: ["path", "content"],
								},
							},
							{
								name: "list_files",
								description: "List virtual filesystem entries (worker mock)",
								inputSchema: { type: "object", properties: {} },
							},
						],
					},
				});
			}

			if (method === "tools/call") {
				const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
				const name = p?.name;
				const args = (p?.arguments ?? {}) as Record<string, unknown>;

				if (name === "write_file") {
					const path = String(args.path ?? "");
					const content = String(args.content ?? "");
					fs.set(path, content);
					return JSON.stringify({
						jsonrpc: "2.0",
						id,
						result: { content: [{ type: "text", text: `wrote ${content.length} bytes to ${path}` }] },
					});
				}
				if (name === "read_file") {
					const path = String(args.path ?? "");
					const content = fs.get(path);
					if (content === undefined) {
						return JSON.stringify({
							jsonrpc: "2.0",
							id,
							error: { code: -32602, message: `file not found: ${path}` },
						});
					}
					return JSON.stringify({
						jsonrpc: "2.0",
						id,
						result: { content: [{ type: "text", text: content }] },
					});
				}
				if (name === "list_files") {
					return JSON.stringify({
						jsonrpc: "2.0",
						id,
						result: {
							content: [{ type: "text", text: JSON.stringify([...fs.keys()]) }],
						},
					});
				}

				return JSON.stringify({
					jsonrpc: "2.0",
					id,
					error: { code: -32601, message: `Method not found: ${name}` },
				});
			}

			if (method === "prompts/list") {
				return JSON.stringify({ jsonrpc: "2.0", id, result: { prompts: [] } });
			}

			return JSON.stringify({
				jsonrpc: "2.0",
				id,
				error: { code: -32601, message: `Method not found: ${method}` },
			});
		},
	};
}

/**
 * Worker-safe mock gallery. Replace with the real `WasmGallery` constructor
 * once `import("/wasm/rvagent_wasm.js")` works in worker context.
 */
function createMockGallery(): WasmGallery {
	const builtins: Array<{ id: string; name: string; description: string; category: string }> = [
		{
			id: "blank",
			name: "Blank Template",
			description: "Empty starting point for custom MCP work.",
			category: "starter",
		},
		{
			id: "research",
			name: "Research Assistant",
			description: "Web search + note-taking with persistent memory.",
			category: "knowledge",
		},
	];

	let activeId: string | null = null;

	return {
		list: () => builtins.slice(),
		listByCategory: (cat) => builtins.filter((t) => t.category === cat),
		search: (q) => {
			const needle = q.toLowerCase();
			return builtins
				.filter((t) => t.name.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle))
				.map((t, idx) => ({ ...t, relevance: 1 - idx * 0.1, tags: [] }));
		},
		get: (id) => {
			const t = builtins.find((b) => b.id === id);
			if (!t) throw new Error(`Template not found: ${id}`);
			return t;
		},
		setActive: (id) => {
			activeId = id;
		},
		getActive: () => activeId,
		count: () => builtins.length,
		getCategories: () => {
			const out: Record<string, number> = {};
			for (const t of builtins) out[t.category] = (out[t.category] ?? 0) + 1;
			return out;
		},
	};
}

async function ensureLoaded(): Promise<void> {
	if (mcpServer && gallery) return;
	if (loadPromise) return loadPromise;

	loadPromise = (async () => {
		// TODO: load real rvagent_wasm.js via dynamic import once the static
		// bundle exposes a worker-friendly init. Mock is functionally complete
		// for the chat-ui's MCP integration test surface.
		mcpServer = createMockServer();
		gallery = createMockGallery();

		const initReq = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				clientInfo: { name: "ruvocal-ui-worker", version: "1.0.0" },
			},
		});
		const initRes = JSON.parse(mcpServer.handle_message(initReq));
		if (initRes.error) throw new Error(initRes.error.message ?? "MCP init failed");
	})();

	await loadPromise;
}

ctx.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
	const { id, method, params } = event.data;

	try {
		await ensureLoaded();
		if (!mcpServer || !gallery) throw new Error("WASM not initialized");

		switch (method) {
			case "load":
				reply(id, true);
				return;

			case "callMcp": {
				const message = JSON.stringify(params);
				const response = mcpServer.handle_message(message);
				reply(id, JSON.parse(response));
				return;
			}

			case "gallery.list":
				reply(id, gallery.list());
				return;

			case "gallery.listByCategory":
				reply(id, gallery.listByCategory(params as string));
				return;

			case "gallery.search":
				reply(id, gallery.search(params as string));
				return;

			case "gallery.get":
				reply(id, gallery.get(params as string));
				return;

			case "gallery.setActive":
				gallery.setActive(params as string);
				reply(id, true);
				return;

			case "gallery.getActive":
				reply(id, gallery.getActive());
				return;

			case "gallery.count":
				reply(id, gallery.count());
				return;

			case "gallery.getCategories":
				reply(id, gallery.getCategories());
				return;

			default:
				reply(id, undefined, `Unknown method: ${method}`);
		}
	} catch (err) {
		reply(id, undefined, err instanceof Error ? err.message : String(err));
	}
});

ctx.postMessage({ id: 0, type: "ready" });
