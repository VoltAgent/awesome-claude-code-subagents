/**
 * Main-thread client for the WASM MCP Web Worker.
 *
 * Lazily spawns the worker, multiplexes requests with auto-incrementing IDs,
 * and exposes a typed Promise-returning surface that mirrors the subset of
 * WasmMcpServer / WasmGallery the chat UI needs.
 *
 * Behind a feature flag so the existing main-thread code path remains the
 * default until we've broken everything in `wasmMcp.ts` over to the worker.
 * Toggle with `localStorage.setItem("ruflo:wasm-worker", "true")` from the
 * browser console, or pass `?worker=1` on the URL.
 */

import { browser } from "$app/environment";
import type { GalleryTemplate, SearchResult } from "./index";

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
}

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: number | string;
	method: string;
	params?: unknown;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();
let readyPromise: Promise<void> | null = null;

export function isWorkerEnabled(): boolean {
	if (!browser) return false;
	try {
		const flag = localStorage.getItem("ruflo:wasm-worker");
		if (flag === "true") return true;
		const params = new URLSearchParams(window.location.search);
		return params.get("worker") === "1";
	} catch {
		return false;
	}
}

function ensureWorker(): Worker {
	if (worker) return worker;
	// Vite resolves `?worker` import to a Worker constructor.
	// Using new URL() so vite-plugin-svelte picks it up at build time.
	worker = new Worker(new URL("./wasm.worker.ts", import.meta.url), {
		type: "module",
		name: "ruflo-wasm-mcp",
	});

	worker.addEventListener("message", (event: MessageEvent) => {
		const data = event.data as { id: number; result?: unknown; error?: string; type?: string };
		if (data?.type === "ready") return; // readiness ping
		if (typeof data?.id !== "number") return;
		const slot = pending.get(data.id);
		if (!slot) return;
		pending.delete(data.id);
		if (data.error) slot.reject(new Error(data.error));
		else slot.resolve(data.result);
	});

	worker.addEventListener("error", (e: ErrorEvent) => {
		console.error("[wasm.worker] error:", e.message);
		// Reject all in-flight requests so callers don't hang.
		for (const [, slot] of pending) slot.reject(new Error(`worker error: ${e.message}`));
		pending.clear();
	});

	return worker;
}

function call<T = unknown>(method: string, params?: unknown): Promise<T> {
	const w = ensureWorker();
	const id = nextId++;
	return new Promise<T>((resolve, reject) => {
		pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
		w.postMessage({ id, method, params });
	});
}

/**
 * Ensure the worker has finished its WASM load. Idempotent — first caller
 * pays the ~300ms compile cost off the main thread; subsequent calls are
 * no-ops that resolve when the same in-flight load finishes.
 */
export function ensureReady(): Promise<void> {
	if (!readyPromise) readyPromise = call<boolean>("load").then(() => undefined);
	return readyPromise;
}

/**
 * Send a JSON-RPC message to the WASM MCP server in the worker.
 */
export async function callMcpInWorker(
	method: string,
	params?: unknown
): Promise<JsonRpcResponse> {
	await ensureReady();
	const request: JsonRpcRequest = {
		jsonrpc: "2.0",
		id: nextId++,
		method,
		params,
	};
	return call<JsonRpcResponse>("callMcp", request);
}

export async function listTemplatesInWorker(): Promise<GalleryTemplate[]> {
	await ensureReady();
	return call<GalleryTemplate[]>("gallery.list");
}

export async function searchTemplatesInWorker(query: string): Promise<SearchResult[]> {
	await ensureReady();
	return call<SearchResult[]>("gallery.search", query);
}

export async function getTemplateInWorker(id: string): Promise<GalleryTemplate> {
	await ensureReady();
	return call<GalleryTemplate>("gallery.get", id);
}

export async function setActiveTemplateInWorker(id: string): Promise<void> {
	await ensureReady();
	await call("gallery.setActive", id);
}

export async function getActiveTemplateInWorker(): Promise<string | null> {
	await ensureReady();
	return call<string | null>("gallery.getActive");
}

export async function getCategoriesInWorker(): Promise<Record<string, number>> {
	await ensureReady();
	return call<Record<string, number>>("gallery.getCategories");
}

export async function templateCountInWorker(): Promise<number> {
	await ensureReady();
	return call<number>("gallery.count");
}

/**
 * Tear down the worker (for tests or explicit cleanup).
 */
export function disposeWorker(): void {
	if (worker) {
		worker.terminate();
		worker = null;
	}
	for (const [, slot] of pending) slot.reject(new Error("worker disposed"));
	pending.clear();
	readyPromise = null;
	nextId = 1;
}
