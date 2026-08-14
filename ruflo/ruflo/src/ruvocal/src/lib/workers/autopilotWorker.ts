/**
 * AutopilotWorker — Web Worker for non-blocking SSE parsing of autopilot events.
 *
 * Handles the SSE stream from the MCP bridge, parses structured events,
 * and batches UI updates at ~60fps to prevent main thread jank.
 *
 * ADR-037 Part 3: Web Workers for Non-Blocking Execution
 */

export interface TaskState {
	taskId: string;
	tool: string;
	status: "queued" | "running" | "completed" | "failed" | "blocked" | "cancelled";
	summary?: string;
	duration?: number;
	detailToken?: string;
	args?: Record<string, unknown>;
}

export interface GroupState {
	groupId: string;
	step: number;
	tasks: TaskState[];
	duration?: number;
}

// Messages FROM main thread TO worker
export type AutopilotWorkerIncoming =
	| { type: "start"; url: string; headers: Record<string, string>; body: unknown }
	| { type: "stop" };

// Messages FROM worker TO main thread
export type AutopilotWorkerOutgoing =
	| { type: "batch_update"; updates: AutopilotUIUpdate[]; groups: GroupState[] }
	| { type: "text"; content: string }
	| { type: "done"; groups: GroupState[] }
	| { type: "error"; error: string }
	| { type: "stopped"; groups: GroupState[] };

export type AutopilotUIUpdate =
	| { type: "start"; maxSteps: number }
	| { type: "group_start"; group: GroupState }
	| { type: "task_update"; taskId: string; status: string; summary?: string; duration?: number; detailToken?: string }
	| { type: "group_end"; groupId: string; duration: number }
	| { type: "text"; content: string }
	| { type: "end"; totalSteps: number; totalTasks: number; duration: number }
	| { type: "paused"; reason: string; tools?: string[] }
	| { type: "error_event"; error: string };

const groups: Map<string, GroupState> = new Map();
let abortController: AbortController | null = null;
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingUpdates: AutopilotUIUpdate[] = [];

/** Batch UI updates at ~60fps to prevent main thread jank */
function flushUpdates() {
	if (pendingUpdates.length === 0) return;
	const msg: AutopilotWorkerOutgoing = {
		type: "batch_update",
		updates: pendingUpdates,
		groups: [...groups.values()],
	};
	self.postMessage(msg);
	pendingUpdates = [];
	batchTimeout = null;
}

function queueUpdate(update: AutopilotUIUpdate) {
	pendingUpdates.push(update);
	if (!batchTimeout) {
		batchTimeout = setTimeout(flushUpdates, 16); // ~60fps
	}
}

function handleEvent(event: Record<string, unknown>) {
	switch (event.type) {
		case "autopilot_start":
			queueUpdate({ type: "start", maxSteps: (event.maxSteps as number) ?? 20 });
			break;

		case "task_group_start": {
			const group: GroupState = {
				groupId: event.groupId as string,
				step: event.step as number,
				tasks: (event.tasks as TaskState[]) ?? [],
			};
			groups.set(group.groupId, group);
			queueUpdate({ type: "group_start", group });
			break;
		}

		case "task_update":
			for (const [, group] of groups) {
				const task = group.tasks.find((t) => t.taskId === event.taskId);
				if (task) {
					if (event.status) task.status = event.status as TaskState["status"];
					if (event.summary) task.summary = event.summary as string;
					if (event.duration != null) task.duration = event.duration as number;
					if (event.detailToken) task.detailToken = event.detailToken as string;
					queueUpdate({
						type: "task_update",
						taskId: event.taskId as string,
						status: event.status as string,
						summary: event.summary as string | undefined,
						duration: event.duration as number | undefined,
						detailToken: event.detailToken as string | undefined,
					});
					break;
				}
			}
			break;

		case "task_group_end": {
			const g = groups.get(event.groupId as string);
			if (g) g.duration = event.duration as number;
			queueUpdate({
				type: "group_end",
				groupId: event.groupId as string,
				duration: (event.duration as number) ?? 0,
			});
			break;
		}

		case "autopilot_text":
			queueUpdate({ type: "text", content: (event.content as string) ?? "" });
			// Also send as a separate top-level message for immediate streaming
			self.postMessage({ type: "text", content: (event.content as string) ?? "" });
			break;

		case "autopilot_paused":
			queueUpdate({
				type: "paused",
				reason: (event.reason as string) ?? "unknown",
				tools: event.tools as string[] | undefined,
			});
			break;

		case "autopilot_error":
			queueUpdate({ type: "error_event", error: (event.error as string) ?? "Unknown error" });
			break;

		case "autopilot_end":
			queueUpdate({
				type: "end",
				totalSteps: (event.totalSteps as number) ?? 0,
				totalTasks: (event.totalTasks as number) ?? 0,
				duration: (event.duration as number) ?? 0,
			});
			break;
	}
}

self.onmessage = async (e: MessageEvent<AutopilotWorkerIncoming>) => {
	const msg = e.data;

	if (msg.type === "start") {
		abortController = new AbortController();
		groups.clear();
		pendingUpdates = [];

		try {
			const response = await fetch(msg.url, {
				method: "POST",
				headers: { ...msg.headers, "Content-Type": "application/json" },
				body: JSON.stringify(msg.body),
				signal: abortController.signal,
			});

			if (!response.ok) {
				const errText = await response.text().catch(() => "Unknown error");
				self.postMessage({ type: "error", error: `HTTP ${response.status}: ${errText}` });
				return;
			}

			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const data = line.slice(6).trim();
					if (data === "[DONE]") {
						flushUpdates();
						self.postMessage({ type: "done", groups: [...groups.values()] });
						return;
					}

					try {
						const event = JSON.parse(data);
						handleEvent(event);
					} catch {
						// Skip malformed JSON lines
					}
				}
			}

			// Stream ended without [DONE]
			flushUpdates();
			self.postMessage({ type: "done", groups: [...groups.values()] });
		} catch (err: unknown) {
			const error = err as Error;
			if (error.name !== "AbortError") {
				self.postMessage({ type: "error", error: error.message ?? "Unknown error" });
			}
		}
	}

	if (msg.type === "stop") {
		abortController?.abort();
		flushUpdates();
		self.postMessage({ type: "stopped", groups: [...groups.values()] });
	}
};
