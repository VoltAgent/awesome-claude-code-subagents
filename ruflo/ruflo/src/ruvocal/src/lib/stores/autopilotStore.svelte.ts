/**
 * Autopilot Store — Svelte 5 runes-based store for managing autopilot Web Worker state.
 *
 * Provides reactive state for autopilot groups, tasks, and text content.
 * Communicates with AutopilotWorker and DetailFetchWorker via postMessage.
 *
 * ADR-037 Part 2+3: Parallel Task UI + Web Workers
 */

import type { GroupState, AutopilotUIUpdate } from "$lib/workers/autopilotWorker";
import type { DetailWorkerOutgoing } from "$lib/workers/detailFetchWorker";

export interface AutopilotState {
	active: boolean;
	maxSteps: number;
	groups: GroupState[];
	textContent: string;
	error: string | null;
	totalSteps: number;
	totalTasks: number;
	duration: number;
	paused: boolean;
	pauseReason: string | null;
}

const defaultState: AutopilotState = {
	active: false,
	maxSteps: 20,
	groups: [],
	textContent: "",
	error: null,
	totalSteps: 0,
	totalTasks: 0,
	duration: 0,
	paused: false,
	pauseReason: null,
};

let state = $state<AutopilotState>({ ...defaultState });

let autopilotWorker: Worker | null = null;
let detailWorker: Worker | null = null;
const detailCallbacks = new Map<string, (content: string | null, error?: string) => void>();

async function ensureWorkers() {
	if (typeof window === "undefined") return;

	if (!autopilotWorker) {
		const mod = await import("$lib/workers/autopilotWorker?worker");
		autopilotWorker = new mod.default();
		autopilotWorker.onmessage = handleWorkerMessage;
	}

	if (!detailWorker) {
		const mod = await import("$lib/workers/detailFetchWorker?worker");
		detailWorker = new mod.default();
		detailWorker.onmessage = handleDetailMessage;
	}
}

function handleWorkerMessage(e: MessageEvent) {
	const msg = e.data;

	switch (msg.type) {
		case "batch_update":
			state.groups = msg.groups;
			for (const update of msg.updates as AutopilotUIUpdate[]) {
				applyUpdate(update);
			}
			break;

		case "text":
			state.textContent += msg.content;
			break;

		case "done":
			state.active = false;
			state.groups = msg.groups;
			break;

		case "error":
			state.active = false;
			state.error = msg.error;
			break;

		case "stopped":
			state.active = false;
			state.groups = msg.groups;
			break;
	}
}

function applyUpdate(update: AutopilotUIUpdate) {
	switch (update.type) {
		case "start":
			state.maxSteps = update.maxSteps;
			break;
		case "end":
			state.totalSteps = update.totalSteps;
			state.totalTasks = update.totalTasks;
			state.duration = update.duration;
			break;
		case "text":
			state.textContent += update.content;
			break;
		case "paused":
			state.paused = true;
			state.pauseReason = update.reason;
			break;
		case "error_event":
			state.error = update.error;
			break;
	}
}

function handleDetailMessage(e: MessageEvent<DetailWorkerOutgoing>) {
	const msg = e.data;
	if (msg.type === "detail") {
		const cb = detailCallbacks.get(msg.detailToken);
		if (cb) {
			cb(msg.content);
			detailCallbacks.delete(msg.detailToken);
		}
	} else if (msg.type === "detail_error") {
		const cb = detailCallbacks.get(msg.detailToken);
		if (cb) {
			cb(null, msg.error);
			detailCallbacks.delete(msg.detailToken);
		}
	}
}

export function useAutopilot() {
	return {
		get state() {
			return state;
		},

		async start(url: string, headers: Record<string, string>, body: unknown) {
			await ensureWorkers();
			Object.assign(state, { ...defaultState, active: true });
			autopilotWorker?.postMessage({ type: "start", url, headers, body });
		},

		stop() {
			autopilotWorker?.postMessage({ type: "stop" });
		},

		async fetchDetail(detailToken: string, bridgeUrl: string): Promise<string> {
			await ensureWorkers();
			return new Promise((resolve, reject) => {
				detailCallbacks.set(detailToken, (content, error) => {
					if (error) reject(new Error(error));
					else resolve(content!);
				});
				detailWorker?.postMessage({ type: "fetch", detailToken, bridgeUrl });
			});
		},

		prefetchDetail(detailToken: string, bridgeUrl: string) {
			detailWorker?.postMessage({ type: "prefetch", detailToken, bridgeUrl });
		},

		evictDetail(detailToken: string) {
			detailWorker?.postMessage({ type: "evict", detailToken });
		},

		destroy() {
			autopilotWorker?.terminate();
			detailWorker?.terminate();
			autopilotWorker = null;
			detailWorker = null;
		},
	};
}
