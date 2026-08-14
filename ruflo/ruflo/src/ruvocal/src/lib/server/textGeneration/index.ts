import { preprocessMessages } from "../endpoints/preprocessMessages";

import { generateTitleForConversation } from "./title";
import {
	type MessageUpdate,
	MessageUpdateType,
	MessageUpdateStatus,
} from "$lib/types/MessageUpdate";
import { generate } from "./generate";
import { runMcpFlow } from "./mcp/runMcpFlow";
import { mergeAsyncGenerators } from "$lib/utils/mergeAsyncGenerators";
import type { TextGenerationContext } from "./types";

async function* keepAlive(done: AbortSignal): AsyncGenerator<MessageUpdate, undefined, undefined> {
	while (!done.aborted) {
		yield {
			type: MessageUpdateType.Status,
			status: MessageUpdateStatus.KeepAlive,
		};
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

export async function* textGeneration(ctx: TextGenerationContext) {
	const done = new AbortController();

	const titleGen = generateTitleForConversation(ctx.conv, ctx.locals);
	const textGen = textGenerationWithoutTitle(ctx, done);
	const keepAliveGen = keepAlive(done.signal);

	// keep alive until textGen is done

	yield* mergeAsyncGenerators([titleGen, textGen, keepAliveGen]);
}

async function* textGenerationWithoutTitle(
	ctx: TextGenerationContext,
	done: AbortController
): AsyncGenerator<MessageUpdate, undefined, undefined> {
	yield {
		type: MessageUpdateType.Status,
		status: MessageUpdateStatus.Started,
	};

	const { conv, messages } = ctx;
	const convId = conv._id;

	const preprompt = conv.preprompt;

	const processedMessages = await preprocessMessages(messages, convId);

	// Try MCP tool flow first; fall back to default generation if not selected/available
	try {
		const mcpGen = runMcpFlow({
			model: ctx.model,
			conv,
			messages: processedMessages,
			assistant: ctx.assistant,
			forceMultimodal: ctx.forceMultimodal,
			forceTools: ctx.forceTools,
			provider: ctx.provider,
			locals: ctx.locals,
			preprompt,
			abortSignal: ctx.abortController.signal,
			abortController: ctx.abortController,
			promptedAt: ctx.promptedAt,
			autopilot: ctx.autopilot,
			autopilotMaxSteps: ctx.autopilotMaxSteps,
		});

		let step = await mcpGen.next();
		while (!step.done) {
			yield step.value;
			step = await mcpGen.next();
		}
		const mcpResult = step.value;
		if (mcpResult === "not_applicable") {
			// fallback to normal text generation
			yield* generate({ ...ctx, messages: processedMessages }, preprompt);
		}
		// If mcpResult is "completed" or "aborted", don't fall back
	} catch (err) {
		// Don't fall back on abort errors - user intentionally stopped
		const isAbort =
			ctx.abortController.signal.aborted ||
			(err instanceof Error &&
				(err.name === "AbortError" ||
					err.name === "APIUserAbortError" ||
					err.message.includes("Request was aborted")));
		if (!isAbort) {
			// On non-abort MCP error, fall back to normal generation
			yield* generate({ ...ctx, messages: processedMessages }, preprompt);
		}
	}
	done.abort();
}
