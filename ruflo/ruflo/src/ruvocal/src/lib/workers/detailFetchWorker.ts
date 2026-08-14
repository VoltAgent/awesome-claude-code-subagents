/**
 * DetailFetchWorker — Web Worker for lazy-loading task details with LRU caching.
 *
 * Full tool results are NOT streamed inline — they are stored server-side
 * and fetched on-demand when the user expands a task card.
 *
 * ADR-037 Part 3: Detail Token Lazy Loading
 */

// Messages FROM main thread TO worker
export type DetailWorkerIncoming =
	| { type: "fetch"; detailToken: string; bridgeUrl: string }
	| { type: "prefetch"; detailToken: string; bridgeUrl: string }
	| { type: "evict"; detailToken: string };

// Messages FROM worker TO main thread
export type DetailWorkerOutgoing =
	| { type: "detail"; detailToken: string; content: string }
	| { type: "detail_error"; detailToken: string; error: string };

const cache = new Map<string, string>();
const MAX_CACHE = 20;
const accessOrder: string[] = [];

function evictLRU() {
	while (cache.size > MAX_CACHE) {
		const oldest = accessOrder.shift();
		if (oldest) cache.delete(oldest);
	}
}

function touchAccess(token: string) {
	const idx = accessOrder.indexOf(token);
	if (idx > -1) accessOrder.splice(idx, 1);
	accessOrder.push(token);
}

self.onmessage = async (e: MessageEvent<DetailWorkerIncoming>) => {
	const msg = e.data;

	if (msg.type === "fetch" || msg.type === "prefetch") {
		// Check cache first
		if (cache.has(msg.detailToken)) {
			touchAccess(msg.detailToken);
			if (msg.type === "fetch") {
				const out: DetailWorkerOutgoing = {
					type: "detail",
					detailToken: msg.detailToken,
					content: cache.get(msg.detailToken)!,
				};
				self.postMessage(out);
			}
			return;
		}

		try {
			const res = await fetch(`${msg.bridgeUrl}/autopilot/detail/${msg.detailToken}`);
			if (!res.ok) {
				if (msg.type === "fetch") {
					const out: DetailWorkerOutgoing = {
						type: "detail_error",
						detailToken: msg.detailToken,
						error: `HTTP ${res.status}`,
					};
					self.postMessage(out);
				}
				return;
			}

			const data = (await res.json()) as { content: string };
			cache.set(msg.detailToken, data.content);
			touchAccess(msg.detailToken);
			evictLRU();

			if (msg.type === "fetch") {
				const out: DetailWorkerOutgoing = {
					type: "detail",
					detailToken: msg.detailToken,
					content: data.content,
				};
				self.postMessage(out);
			}
		} catch (err: unknown) {
			if (msg.type === "fetch") {
				const out: DetailWorkerOutgoing = {
					type: "detail_error",
					detailToken: msg.detailToken,
					error: (err as Error).message ?? "Unknown error",
				};
				self.postMessage(out);
			}
		}
	}

	if (msg.type === "evict") {
		cache.delete(msg.detailToken);
		const idx = accessOrder.indexOf(msg.detailToken);
		if (idx > -1) accessOrder.splice(idx, 1);
	}
};
