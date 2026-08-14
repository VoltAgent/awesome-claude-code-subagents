import { config } from "$lib/server/config";
import {
	MessageReasoningUpdateType,
	MessageUpdateType,
	type MessageUpdate,
} from "$lib/types/MessageUpdate";
import { AbortedGenerations } from "../abortedGenerations";
import type { TextGenerationContext } from "./types";
import type { EndpointMessage } from "../endpoints/endpoints";
import { generateFromDefaultEndpoint } from "../generateFromDefaultEndpoint";
import { generateSummaryOfReasoning } from "./reasoning";
import { logger } from "../logger";

type GenerateContext = Omit<TextGenerationContext, "messages"> & { messages: EndpointMessage[] };

export async function* generate(
	{
		model,
		endpoint,
		conv,
		messages,
		assistant,
		promptedAt,
		forceMultimodal,
		provider,
		locals,
		abortController,
	}: GenerateContext,
	preprompt?: string
): AsyncIterable<MessageUpdate> {
	// Reasoning mode support
	let reasoning = false;
	let reasoningBuffer = "";
	let lastReasoningUpdate = new Date();
	let status = "";
	const startTime = new Date();
	const modelReasoning = Reflect.get(model, "reasoning") as
		| { type: string; beginToken?: string; endToken?: string; regex?: string }
		| undefined;
	if (
		modelReasoning &&
		(modelReasoning.type === "regex" ||
			modelReasoning.type === "summarize" ||
			(modelReasoning.type === "tokens" && modelReasoning.beginToken === ""))
	) {
		// Starts in reasoning mode and we extract the answer from the reasoning
		reasoning = true;
		yield {
			type: MessageUpdateType.Reasoning,
			subtype: MessageReasoningUpdateType.Status,
			status: "Started reasoning...",
		};
	}

	const stream = await endpoint({
		messages,
		preprompt,
		generateSettings: assistant?.generateSettings,
		// Allow user-level override to force multimodal
		isMultimodal: (forceMultimodal ?? false) || model.multimodal,
		conversationId: conv._id,
		locals,
		abortSignal: abortController.signal,
		provider,
	});

	for await (const output of stream) {
		// Check if this output contains router metadata. Emit if either:
		// 1) route+model are present (router models), or
		// 2) provider-only is present (non-router models exposing x-inference-provider)
		if ("routerMetadata" in output && output.routerMetadata) {
			const hasRouteModel = Boolean(output.routerMetadata.route && output.routerMetadata.model);
			const hasProviderOnly = Boolean(output.routerMetadata.provider);
			if (hasRouteModel || hasProviderOnly) {
				yield {
					type: MessageUpdateType.RouterMetadata,
					route: output.routerMetadata.route || "",
					model: output.routerMetadata.model || "",
					provider:
						(output.routerMetadata
							.provider as unknown as import("@huggingface/inference").InferenceProvider) ||
						undefined,
				};
				continue;
			}
		}
		// text generation completed
		if (output.generated_text) {
			// If an abort happened just before final output, stop here and let
			// the caller emit an interrupted final answer with partial text.
			const abortTime = AbortedGenerations.getInstance().getAbortTime(conv._id.toString());
			if (abortController.signal.aborted || (abortTime && abortTime > promptedAt)) {
				if (!abortController.signal.aborted) {
					abortController.abort();
				}
				break;
			}

			let interrupted =
				!output.token.special && !model.parameters.stop?.includes(output.token.text);

			let text = output.generated_text.trimEnd();
			for (const stopToken of model.parameters.stop ?? []) {
				if (!text.endsWith(stopToken)) continue;

				interrupted = false;
				text = text.slice(0, text.length - stopToken.length);
			}

			let finalAnswer = text;
			if (modelReasoning && modelReasoning.type === "regex" && modelReasoning.regex) {
				const regex = new RegExp(modelReasoning.regex);
				finalAnswer = regex.exec(reasoningBuffer)?.[1] ?? text;
			} else if (modelReasoning && modelReasoning.type === "summarize") {
				yield {
					type: MessageUpdateType.Reasoning,
					subtype: MessageReasoningUpdateType.Status,
					status: "Summarizing reasoning...",
				};
				try {
					const summary = yield* generateFromDefaultEndpoint({
						messages: [
							{
								from: "user",
								content: `Question: ${messages[messages.length - 1].content}\n\nReasoning: ${reasoningBuffer}`,
							},
						],
						preprompt: `Your task is to summarize concisely all your reasoning steps and then give the final answer. Keep it short, one short paragraph at most. If the reasoning steps explicitly include a code solution, make sure to include it in your answer.`,
						modelId: Reflect.get(model, "id") as string | undefined,
						locals,
					});
					finalAnswer = summary;
					yield {
						type: MessageUpdateType.Reasoning,
						subtype: MessageReasoningUpdateType.Status,
						status: `Done in ${Math.round((new Date().getTime() - startTime.getTime()) / 1000)}s.`,
					};
				} catch (e) {
					finalAnswer = text;
					logger.error(e, "Error generating summary of reasoning");
				}
			} else if (modelReasoning && modelReasoning.type === "tokens") {
				// Remove the reasoning segment from final answer to avoid duplication
				const beginIndex = modelReasoning.beginToken
					? reasoningBuffer.indexOf(modelReasoning.beginToken)
					: 0;
				const endIndex = modelReasoning.endToken
					? reasoningBuffer.lastIndexOf(modelReasoning.endToken)
					: -1;

				if (beginIndex !== -1 && endIndex !== -1 && modelReasoning.endToken) {
					finalAnswer =
						text.slice(0, beginIndex) + text.slice(endIndex + modelReasoning.endToken.length);
				}
			}

			yield { type: MessageUpdateType.FinalAnswer, text: finalAnswer, interrupted };
			continue;
		}

		if (modelReasoning && modelReasoning.type === "tokens") {
			if (output.token.text === modelReasoning.beginToken) {
				reasoning = true;
				reasoningBuffer += output.token.text;
				continue;
			} else if (modelReasoning.endToken && output.token.text === modelReasoning.endToken) {
				reasoning = false;
				reasoningBuffer += output.token.text;
				yield {
					type: MessageUpdateType.Reasoning,
					subtype: MessageReasoningUpdateType.Status,
					status: `Done in ${Math.round((new Date().getTime() - startTime.getTime()) / 1000)}s.`,
				};
				continue;
			}
		}

		// ignore special tokens
		if (output.token.special) continue;

		// pass down normal token
		if (reasoning) {
			reasoningBuffer += output.token.text;

			if (modelReasoning && modelReasoning.type === "tokens" && modelReasoning.endToken) {
				if (reasoningBuffer.lastIndexOf(modelReasoning.endToken) !== -1) {
					const endTokenIndex = reasoningBuffer.lastIndexOf(modelReasoning.endToken);
					const textBuffer = reasoningBuffer.slice(endTokenIndex + modelReasoning.endToken.length);
					reasoningBuffer = reasoningBuffer.slice(
						0,
						endTokenIndex + modelReasoning.endToken.length + 1
					);

					yield {
						type: MessageUpdateType.Reasoning,
						subtype: MessageReasoningUpdateType.Stream,
						token: output.token.text,
					};
					yield { type: MessageUpdateType.Stream, token: textBuffer };
					yield {
						type: MessageUpdateType.Reasoning,
						subtype: MessageReasoningUpdateType.Status,
						status: `Done in ${Math.round((new Date().getTime() - startTime.getTime()) / 1000)}s.`,
					};
					reasoning = false;
					continue;
				}
			}

			// yield status update if it has changed
			if (status !== "") {
				yield {
					type: MessageUpdateType.Reasoning,
					subtype: MessageReasoningUpdateType.Status,
					status,
				};
				status = "";
			}

			// create a new status every ~4s (optional)
			if (
				Reflect.get(config, "REASONING_SUMMARY") === "true" &&
				new Date().getTime() - lastReasoningUpdate.getTime() > 4000
			) {
				lastReasoningUpdate = new Date();
				try {
					generateSummaryOfReasoning(reasoningBuffer, model.id, locals).then((summary) => {
						status = summary;
					});
				} catch (e) {
					logger.error(e, "Error generating summary of reasoning");
				}
			}

			yield {
				type: MessageUpdateType.Reasoning,
				subtype: MessageReasoningUpdateType.Stream,
				token: output.token.text,
			};
		} else {
			yield { type: MessageUpdateType.Stream, token: output.token.text };
		}

		// abort check
		const date = AbortedGenerations.getInstance().getAbortTime(conv._id.toString());

		if (date && date > promptedAt) {
			logger.info(`Aborting generation for conversation ${conv._id}`);
			if (!abortController.signal.aborted) {
				abortController.abort();
			}
			break;
		}

		// no output check
		if (!output) break;
	}
}
