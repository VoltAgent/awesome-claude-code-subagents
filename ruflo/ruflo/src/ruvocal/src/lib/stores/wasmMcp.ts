/**
 * WASM MCP Server Store
 * Provides a local, browser-based MCP server using rvagent-wasm
 * with IndexedDB persistence for the virtual filesystem
 */

import { writable, derived, get } from "svelte/store";
import { browser } from "$app/environment";
import { loadWasm, isWasmLoaded, getWasm } from "$lib/wasm";
import { isWorkerEnabled, callMcpInWorker } from "$lib/wasm/workerClient";
import type { WasmMcpServer, WasmGallery, GalleryTemplate, SearchResult } from "$lib/wasm";
import * as idb from "$lib/wasm/idb";

// Store state types
interface WasmMcpState {
	loaded: boolean;
	loading: boolean;
	error: string | null;
	mcpServer: WasmMcpServer | null;
	gallery: WasmGallery | null;
	activeTemplateId: string | null;
	activeTemplateName: string | null;
}

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: number | string | null;
	method: string;
	params?: unknown;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
}

// Initial state
const initialState: WasmMcpState = {
	loaded: false,
	loading: false,
	error: null,
	mcpServer: null,
	gallery: null,
	activeTemplateId: null,
	activeTemplateName: null,
};

// Create the store
const wasmMcpState = writable<WasmMcpState>(initialState);

// Derived stores for convenience
export const wasmLoaded = derived(wasmMcpState, ($state) => $state.loaded);
export const wasmLoading = derived(wasmMcpState, ($state) => $state.loading);
export const wasmError = derived(wasmMcpState, ($state) => $state.error);
export const activeTemplate = derived(wasmMcpState, ($state) => ({
	id: $state.activeTemplateId,
	name: $state.activeTemplateName,
}));

// Request ID counter
let requestId = 0;

/**
 * Initialize the WASM MCP server
 */
export async function initWasmMcp(): Promise<boolean> {
	if (!browser) return false;

	const state = get(wasmMcpState);
	if (state.loaded || state.loading) return state.loaded;

	wasmMcpState.update((s) => ({ ...s, loading: true, error: null }));

	try {
		// Load WASM module
		const wasm = await loadWasm();
		if (!wasm) {
			throw new Error("Failed to load WASM module");
		}

		// Create MCP server and gallery instances
		const mcpServer = new wasm.WasmMcpServer();
		const gallery = new wasm.WasmGallery();

		// Initialize the MCP server
		const initResponse = callMcpInternal(mcpServer, "initialize", {
			protocolVersion: "2024-11-05",
			clientInfo: { name: "ruvocal-ui", version: "1.0.0" },
		});

		if (initResponse.error) {
			throw new Error(`MCP initialization failed: ${initResponse.error.message}`);
		}

		// Load persisted filesystem state from IndexedDB
		await syncFromIndexedDB(mcpServer);

		// Check for persisted active template
		const savedTemplateId = await idb.getSetting<string>("activeTemplateId");
		let templateName: string | null = null;

		if (savedTemplateId) {
			try {
				const template = gallery.get(savedTemplateId);
				gallery.setActive(savedTemplateId);
				templateName = template.name;
			} catch {
				// Template not found, ignore
			}
		}

		wasmMcpState.set({
			loaded: true,
			loading: false,
			error: null,
			mcpServer,
			gallery,
			activeTemplateId: savedTemplateId,
			activeTemplateName: templateName,
		});

		console.log("[WASM MCP] Server initialized successfully");
		return true;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : "Unknown error";
		wasmMcpState.update((s) => ({
			...s,
			loading: false,
			error: errorMsg,
		}));
		console.error("[WASM MCP] Initialization failed:", error);
		return false;
	}
}

/**
 * Internal MCP call helper
 */
function callMcpInternal(
	mcpServer: WasmMcpServer,
	method: string,
	params?: unknown
): JsonRpcResponse {
	const request: JsonRpcRequest = {
		jsonrpc: "2.0",
		id: ++requestId,
		method,
		params,
	};

	const responseJson = mcpServer.handle_message(JSON.stringify(request));
	return JSON.parse(responseJson) as JsonRpcResponse;
}

/**
 * Call an MCP method on the WASM server
 */
export async function callMcp(method: string, params?: unknown): Promise<JsonRpcResponse> {
	// Off-main-thread path (opt-in via ?worker=1 or
	// localStorage.setItem("ruflo:wasm-worker","true")) — see workerClient.ts.
	if (isWorkerEnabled()) {
		try {
			return (await callMcpInWorker(method, params)) as JsonRpcResponse;
		} catch (err) {
			return {
				jsonrpc: "2.0",
				id: null,
				error: {
					code: -32603,
					message: err instanceof Error ? err.message : "worker call failed",
				},
			};
		}
	}

	const state = get(wasmMcpState);

	if (!state.loaded || !state.mcpServer) {
		return {
			jsonrpc: "2.0",
			id: null,
			error: { code: -32603, message: "WASM MCP server not initialized" },
		};
	}

	const response = callMcpInternal(state.mcpServer, method, params);

	// Persist file changes to IndexedDB
	if (method === "tools/call" && response.result) {
		const toolParams = params as { name: string; arguments?: Record<string, unknown> };
		if (
			["write_file", "edit_file", "delete_file"].includes(toolParams.name) &&
			!response.error
		) {
			await syncToIndexedDB(state.mcpServer);
		}
	}

	return response;
}

/**
 * Execute a tool via MCP
 */
export async function executeTool(
	name: string,
	args: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
	const response = await callMcp("tools/call", { name, arguments: args });

	if (response.error) {
		return { success: false, error: response.error.message };
	}

	return { success: true, result: response.result };
}

/**
 * List available MCP tools
 */
export async function listTools(): Promise<
	Array<{ name: string; description: string; inputSchema: unknown }>
> {
	const response = await callMcp("tools/list");

	if (response.error || !response.result) {
		return [];
	}

	const result = response.result as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
	return result.tools || [];
}

/**
 * Get available prompts from active template
 */
export async function listPrompts(): Promise<Array<{ name: string; description: string }>> {
	const response = await callMcp("prompts/list");

	if (response.error || !response.result) {
		return [];
	}

	const result = response.result as { prompts: Array<{ name: string; description: string }> };
	return result.prompts || [];
}

// ---------------------------------------------------------------------------
// Gallery Operations
// ---------------------------------------------------------------------------

/**
 * List all gallery templates
 */
export function listGalleryTemplates(): GalleryTemplate[] {
	const state = get(wasmMcpState);
	if (!state.gallery) return [];

	try {
		return state.gallery.list() as unknown as GalleryTemplate[];
	} catch {
		return [];
	}
}

/**
 * Search gallery templates
 */
export function searchGalleryTemplates(query: string): SearchResult[] {
	const state = get(wasmMcpState);
	if (!state.gallery) return [];

	try {
		return state.gallery.search(query) as unknown as SearchResult[];
	} catch {
		return [];
	}
}

/**
 * Get a gallery template by ID
 */
export function getGalleryTemplate(id: string): GalleryTemplate | null {
	const state = get(wasmMcpState);
	if (!state.gallery) return null;

	try {
		return state.gallery.get(id) as unknown as GalleryTemplate;
	} catch {
		return null;
	}
}

/**
 * Load a gallery template as active
 */
export async function loadGalleryTemplate(id: string): Promise<boolean> {
	const state = get(wasmMcpState);
	if (!state.gallery || !state.mcpServer) return false;

	try {
		// Load via MCP (sets active in both gallery and MCP server)
		const response = await callMcp("gallery/load", { id });

		if (response.error) {
			console.error("[WASM MCP] Failed to load template:", response.error.message);
			return false;
		}

		const result = response.result as { template_id: string; name: string };

		// Update store state
		wasmMcpState.update((s) => ({
			...s,
			activeTemplateId: result.template_id,
			activeTemplateName: result.name,
		}));

		// Persist to IndexedDB
		await idb.setSetting("activeTemplateId", result.template_id);

		console.log(`[WASM MCP] Loaded template: ${result.name}`);
		return true;
	} catch (error) {
		console.error("[WASM MCP] Failed to load template:", error);
		return false;
	}
}

/**
 * Get gallery categories with counts
 */
export function getGalleryCategories(): Record<string, number> {
	const state = get(wasmMcpState);
	if (!state.gallery) return {};

	try {
		return state.gallery.getCategories() as unknown as Record<string, number>;
	} catch {
		return {};
	}
}

/**
 * Load a template as RVF bytes and save to IndexedDB
 */
export async function saveTemplateAsRvf(templateId: string): Promise<string | null> {
	const state = get(wasmMcpState);
	if (!state.gallery) return null;

	try {
		const template = state.gallery.get(templateId);
		const rvfBytes = state.gallery.loadRvf(templateId);

		const containerId = crypto.randomUUID();
		await idb.saveRvfContainer(containerId, template.name, rvfBytes, templateId);

		console.log(`[WASM MCP] Saved RVF container: ${containerId}`);
		return containerId;
	} catch (error) {
		console.error("[WASM MCP] Failed to save RVF:", error);
		return null;
	}
}

// ---------------------------------------------------------------------------
// IndexedDB Sync
// ---------------------------------------------------------------------------

/**
 * Sync virtual filesystem from IndexedDB to WASM backend
 */
async function syncFromIndexedDB(mcpServer: WasmMcpServer): Promise<void> {
	try {
		const files = await idb.listFiles();

		for (const file of files) {
			callMcpInternal(mcpServer, "tools/call", {
				name: "write_file",
				arguments: { path: file.path, content: file.content },
			});
		}

		console.log(`[WASM MCP] Synced ${files.length} files from IndexedDB`);
	} catch (error) {
		console.error("[WASM MCP] Failed to sync from IndexedDB:", error);
	}
}

/**
 * Sync virtual filesystem from WASM backend to IndexedDB
 */
async function syncToIndexedDB(mcpServer: WasmMcpServer): Promise<void> {
	try {
		// List all files in WASM backend
		const listResponse = callMcpInternal(mcpServer, "tools/call", {
			name: "list_files",
			arguments: {},
		});

		if (listResponse.error || !listResponse.result) return;

		const result = listResponse.result as { content: Array<{ text: string }> };
		const filesContent = result.content?.[0]?.text;
		if (!filesContent) return;

		const wasmFiles = JSON.parse(filesContent) as string[];

		// Get current IndexedDB files
		const idbFiles = await idb.listFiles();
		const idbPaths = new Set(idbFiles.map((f) => f.path));

		// Sync each file
		for (const path of wasmFiles) {
			const readResponse = callMcpInternal(mcpServer, "tools/call", {
				name: "read_file",
				arguments: { path },
			});

			if (!readResponse.error && readResponse.result) {
				const readResult = readResponse.result as { content: Array<{ text: string }> };
				const content = readResult.content?.[0]?.text;
				if (content) {
					await idb.writeFile(path, content);
					idbPaths.delete(path);
				}
			}
		}

		// Remove files that no longer exist in WASM backend
		for (const path of idbPaths) {
			await idb.deleteFile(path);
		}

		console.log(`[WASM MCP] Synced ${wasmFiles.length} files to IndexedDB`);
	} catch (error) {
		console.error("[WASM MCP] Failed to sync to IndexedDB:", error);
	}
}

/**
 * Force full sync to IndexedDB
 */
export async function forceSyncToIndexedDB(): Promise<void> {
	const state = get(wasmMcpState);
	if (state.mcpServer) {
		await syncToIndexedDB(state.mcpServer);
	}
}

/**
 * Clear all persisted data
 */
export async function clearPersistedData(): Promise<void> {
	await idb.clearFiles();
	await idb.setSetting("activeTemplateId", null);
	console.log("[WASM MCP] Cleared all persisted data");
}

// Auto-initialize on module load in browser
if (browser) {
	// Defer initialization to avoid blocking
	setTimeout(() => {
		initWasmMcp().catch(console.error);
	}, 100);
}
