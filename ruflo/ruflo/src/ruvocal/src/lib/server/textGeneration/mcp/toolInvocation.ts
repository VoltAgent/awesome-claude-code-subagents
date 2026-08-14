import { randomUUID } from "crypto";
import { logger } from "../../logger";
import type { MessageUpdate } from "$lib/types/MessageUpdate";
import { MessageToolUpdateType, MessageUpdateType } from "$lib/types/MessageUpdate";
import { ToolResultStatus } from "$lib/types/Tool";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { McpToolMapping } from "$lib/server/mcp/tools";
import type { McpServerConfig } from "$lib/server/mcp/httpClient";
import {
	callMcpTool,
	getMcpToolTimeoutMs,
	type McpToolTextResponse,
} from "$lib/server/mcp/httpClient";
import { getClient } from "$lib/server/mcp/clientPool";
import { attachFileRefsToArgs, type FileRefResolver } from "./fileRefs";
import type { Client } from "@modelcontextprotocol/sdk/client";

export type Primitive = string | number | boolean;

export type ToolRun = {
	name: string;
	parameters: Record<string, Primitive>;
	output: string;
};

export interface NormalizedToolCall {
	id: string;
	name: string;
	arguments: string;
}

export interface ExecuteToolCallsParams {
	calls: NormalizedToolCall[];
	mapping: Record<string, McpToolMapping>;
	servers: McpServerConfig[];
	parseArgs: (raw: unknown) => Record<string, unknown>;
	resolveFileRef?: FileRefResolver;
	toPrimitive: (value: unknown) => Primitive | undefined;
	processToolOutput: (text: string) => {
		annotated: string;
		sources: { index: number; link: string }[];
	};
	abortSignal?: AbortSignal;
	toolTimeoutMs?: number;
}

export interface ToolCallExecutionResult {
	toolMessages: ChatCompletionMessageParam[];
	toolRuns: ToolRun[];
	finalAnswer?: { text: string; interrupted: boolean };
}

export type ToolExecutionEvent =
	| { type: "update"; update: MessageUpdate }
	| { type: "complete"; summary: ToolCallExecutionResult };

const serverMap = (servers: McpServerConfig[]): Map<string, McpServerConfig> => {
	const map = new Map<string, McpServerConfig>();
	for (const server of servers) {
		if (server?.name) {
			map.set(server.name, server);
		}
	}
	return map;
};

export async function* executeToolCalls({
	calls,
	mapping,
	servers,
	parseArgs,
	resolveFileRef,
	toPrimitive,
	processToolOutput,
	abortSignal,
	toolTimeoutMs,
}: ExecuteToolCallsParams): AsyncGenerator<ToolExecutionEvent, void, undefined> {
	const effectiveTimeoutMs = toolTimeoutMs ?? getMcpToolTimeoutMs();
	const toolMessages: ChatCompletionMessageParam[] = [];
	const toolRuns: ToolRun[] = [];
	const serverLookup = serverMap(servers);
	// Pre-emit call + ETA updates and prepare tasks
	type TaskResult = {
		index: number;
		output?: string;
		structured?: unknown;
		blocks?: unknown[];
		error?: string;
		uuid: string;
		paramsClean: Record<string, Primitive>;
	};

	const prepared = calls.map((call) => {
		const argsObj = parseArgs(call.arguments);
		const paramsClean: Record<string, Primitive> = {};
		for (const [k, v] of Object.entries(argsObj ?? {})) {
			const prim = toPrimitive(v);
			if (prim !== undefined) paramsClean[k] = prim;
		}
		// Attach any resolved image payloads _after_ computing paramsClean so that
		// logging / status updates continue to show only the lightweight primitive
		// arguments (e.g. "image_1") while the full data: URLs or image blobs are
		// only sent to the MCP tool server.
		attachFileRefsToArgs(argsObj, resolveFileRef);
		return { call, argsObj, paramsClean, uuid: randomUUID() };
	});

	for (const p of prepared) {
		yield {
			type: "update",
			update: {
				type: MessageUpdateType.Tool,
				subtype: MessageToolUpdateType.Call,
				uuid: p.uuid,
				call: { name: p.call.name, parameters: p.paramsClean },
			},
		};
		yield {
			type: "update",
			update: {
				type: MessageUpdateType.Tool,
				subtype: MessageToolUpdateType.ETA,
				uuid: p.uuid,
				eta: 10,
			},
		};
	}

	// Preload clients per distinct server used in this batch
	const distinctServerNames = Array.from(
		new Set(prepared.map((p) => mapping[p.call.name]?.server).filter(Boolean) as string[])
	);
	const clientMap = new Map<string, Client>();
	await Promise.all(
		distinctServerNames.map(async (name) => {
			const cfg = serverLookup.get(name);
			if (!cfg) return;
			try {
				const client = await getClient(cfg, abortSignal);
				clientMap.set(name, client);
			} catch (e) {
				logger.warn({ server: name, err: String(e) }, "[mcp] failed to connect client");
			}
		})
	);

	// Async queue to stream results in finish order
	function createQueue<T>() {
		const items: T[] = [];
		const waiters: Array<(v: IteratorResult<T>) => void> = [];
		let closed = false;
		return {
			push(item: T) {
				const waiter = waiters.shift();
				if (waiter) waiter({ value: item, done: false });
				else items.push(item);
			},
			close() {
				closed = true;
				let waiter: ((v: IteratorResult<T>) => void) | undefined;
				while ((waiter = waiters.shift())) {
					waiter({ value: undefined as unknown as T, done: true });
				}
			},
			async *iterator() {
				for (;;) {
					if (items.length) {
						const first = items.shift();
						if (first !== undefined) yield first as T;
						continue;
					}
					if (closed) return;
					const value: IteratorResult<T> = await new Promise((res) => waiters.push(res));
					if (value.done) return;
					yield value.value as T;
				}
			},
		};
	}

	const updatesQueue = createQueue<MessageUpdate>();
	const results: TaskResult[] = [];

	const tasks = prepared.map(async (p, index) => {
		// Check abort before starting each tool call
		if (abortSignal?.aborted) {
			const message = "Aborted by user";
			results.push({
				index,
				error: message,
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			updatesQueue.push({
				type: MessageUpdateType.Tool,
				subtype: MessageToolUpdateType.Error,
				uuid: p.uuid,
				message,
			});
			return;
		}

		const mappingEntry = mapping[p.call.name];
		if (!mappingEntry) {
			const message = `Unknown MCP function: ${p.call.name}`;
			results.push({
				index,
				error: message,
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			updatesQueue.push({
				type: MessageUpdateType.Tool,
				subtype: MessageToolUpdateType.Error,
				uuid: p.uuid,
				message,
			});
			return;
		}
		const serverCfg = serverLookup.get(mappingEntry.server);
		if (!serverCfg) {
			const message = `Unknown MCP server: ${mappingEntry.server}`;
			results.push({
				index,
				error: message,
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			updatesQueue.push({
				type: MessageUpdateType.Tool,
				subtype: MessageToolUpdateType.Error,
				uuid: p.uuid,
				message,
			});
			return;
		}
		const client = clientMap.get(mappingEntry.server);
		try {
			logger.debug(
				{ server: mappingEntry.server, tool: mappingEntry.tool, parameters: p.paramsClean },
				"[mcp] invoking tool"
			);
			const toolResponse: McpToolTextResponse = await callMcpTool(
				serverCfg,
				mappingEntry.tool,
				p.argsObj,
				{
					client,
					signal: abortSignal,
					timeoutMs: effectiveTimeoutMs,
					onProgress: (progress) => {
						updatesQueue.push({
							type: MessageUpdateType.Tool,
							subtype: MessageToolUpdateType.Progress,
							uuid: p.uuid,
							progress: progress.progress,
							total: progress.total,
							message: progress.message,
						});
					},
				}
			);
			const { annotated } = processToolOutput(toolResponse.text ?? "");
			logger.debug(
				{ server: mappingEntry.server, tool: mappingEntry.tool },
				"[mcp] tool call completed"
			);
			results.push({
				index,
				output: annotated,
				structured: toolResponse.structured,
				blocks: toolResponse.content,
				uuid: p.uuid,
				paramsClean: p.paramsClean,
			});
			updatesQueue.push({
				type: MessageUpdateType.Tool,
				subtype: MessageToolUpdateType.Result,
				uuid: p.uuid,
				result: {
					status: ToolResultStatus.Success,
					call: { name: p.call.name, parameters: p.paramsClean },
					outputs: [
						{
							text: annotated ?? "",
							structured: toolResponse.structured,
							content: toolResponse.content,
						} as unknown as Record<string, unknown>,
					],
					display: true,
				},
			});
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			const errName = err instanceof Error ? err.name : "";
			const isAbortError =
				abortSignal?.aborted ||
				errName === "AbortError" ||
				errName === "APIUserAbortError" ||
				errMsg === "Request was aborted." ||
				errMsg === "This operation was aborted";
			const message = isAbortError ? "Aborted by user" : errMsg;

			if (isAbortError) {
				logger.debug(
					{ server: mappingEntry.server, tool: mappingEntry.tool },
					"[mcp] tool call aborted by user"
				);
			} else {
				logger.warn(
					{ server: mappingEntry.server, tool: mappingEntry.tool, err: message },
					"[mcp] tool call failed"
				);
			}
			results.push({ index, error: message, uuid: p.uuid, paramsClean: p.paramsClean });
			updatesQueue.push({
				type: MessageUpdateType.Tool,
				subtype: MessageToolUpdateType.Error,
				uuid: p.uuid,
				message,
			});
		}
	});

	// kick off and stream as they finish
	Promise.allSettled(tasks).then(() => updatesQueue.close());

	for await (const update of updatesQueue.iterator()) {
		yield { type: "update", update };
	}

	// Collate outputs in original call order
	results.sort((a, b) => a.index - b.index);
	for (const r of results) {
		const name = prepared[r.index].call.name;
		const id = prepared[r.index].call.id;
		if (!r.error) {
			const output = r.output ?? "";
			toolRuns.push({ name, parameters: r.paramsClean, output });
			// For the LLM follow-up call, we keep only the textual output
			toolMessages.push({ role: "tool", tool_call_id: id, content: output });
		} else {
			// Communicate error to LLM so it doesn't hallucinate success
			toolMessages.push({ role: "tool", tool_call_id: id, content: `Error: ${r.error}` });
		}
	}

	yield { type: "complete", summary: { toolMessages, toolRuns } };
}
