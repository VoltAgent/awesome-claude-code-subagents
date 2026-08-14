import type { TextGenerationStreamOutput } from "@huggingface/inference";
import type OpenAI from "openai";
import type { Stream } from "openai/streaming";

/**
 * Transform a stream of OpenAI.Chat.ChatCompletion into a stream of TextGenerationStreamOutput
 */
export async function* openAIChatToTextGenerationStream(
	completionStream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>,
	getRouterMetadata?: () => { route?: string; model?: string; provider?: string }
) {
	let generatedText = "";
	let tokenId = 0;
	let toolBuffer = ""; // legacy hack kept harmless
	let metadataYielded = false;
	let thinkOpen = false;

	for await (const completion of completionStream) {
		const retyped = completion as {
			"x-router-metadata"?: { route: string; model: string; provider?: string };
		};
		// Check if this chunk contains router metadata (first chunk from llm-router)
		if (!metadataYielded && retyped["x-router-metadata"]) {
			const metadata = retyped["x-router-metadata"];
			yield {
				token: {
					id: tokenId++,
					text: "",
					logprob: 0,
					special: true,
				},
				generated_text: null,
				details: null,
				routerMetadata: {
					route: metadata.route,
					model: metadata.model,
					provider: metadata.provider,
				},
			} as TextGenerationStreamOutput & {
				routerMetadata: { route: string; model: string; provider?: string };
			};
			metadataYielded = true;
			// Skip processing this chunk as content since it's just metadata
			if (
				!completion.choices ||
				completion.choices.length === 0 ||
				!completion.choices[0].delta?.content
			) {
				continue;
			}
		}
		const { choices } = completion;
		const delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
			reasoning?: string;
			reasoning_content?: string;
		} = choices?.[0]?.delta ?? {};
		const content: string = delta.content ?? "";
		const reasoning: string =
			typeof delta?.reasoning === "string"
				? (delta.reasoning as string)
				: typeof delta?.reasoning_content === "string"
					? (delta.reasoning_content as string)
					: "";
		const last = choices?.[0]?.finish_reason === "stop" || choices?.[0]?.finish_reason === "length";

		// if the last token is a stop and the tool buffer is not empty, yield it as a generated_text
		if (choices?.[0]?.finish_reason === "stop" && toolBuffer.length > 0) {
			yield {
				token: {
					id: tokenId++,
					special: true,
					logprob: 0,
					text: "",
				},
				generated_text: toolBuffer,
				details: null,
			} as TextGenerationStreamOutput;
			break;
		}

		// weird bug where the parameters are streamed in like this
		if (choices?.[0]?.delta?.tool_calls) {
			const calls = Array.isArray(choices[0].delta.tool_calls)
				? choices[0].delta.tool_calls
				: [choices[0].delta.tool_calls];

			if (
				calls.length === 1 &&
				calls[0].index === 0 &&
				calls[0].id === "" &&
				calls[0].type === "function" &&
				!!calls[0].function &&
				calls[0].function.name === null
			) {
				toolBuffer += calls[0].function.arguments;
				continue;
			}
		}

		let combined = "";
		if (reasoning && reasoning.length > 0) {
			if (!thinkOpen) {
				combined += "<think>" + reasoning;
				thinkOpen = true;
			} else {
				combined += reasoning;
			}
		}

		if (content && content.length > 0) {
			const trimmed = content.trim();
			// Allow <think> tags in content to pass through (for models like DeepSeek R1)
			if (thinkOpen && trimmed === "</think>") {
				// close once without duplicating the tag
				combined += "</think>";
				thinkOpen = false;
			} else if (thinkOpen) {
				combined += "</think>" + content;
				thinkOpen = false;
			} else {
				combined += content;
			}
		}

		// Accumulate the combined token into the full text
		generatedText += combined;
		const output: TextGenerationStreamOutput = {
			token: {
				id: tokenId++,
				text: combined,
				logprob: 0,
				special: last,
			},
			generated_text: last ? generatedText : null,
			details: null,
		};
		yield output;

		// Tools removed: ignore tool_calls deltas
	}

	// If metadata wasn't yielded from chunks (e.g., from headers), yield it at the end
	if (!metadataYielded && getRouterMetadata) {
		const routerMetadata = getRouterMetadata();
		// Yield if we have either complete router metadata OR just provider info
		if (
			(routerMetadata && routerMetadata.route && routerMetadata.model) ||
			routerMetadata?.provider
		) {
			yield {
				token: {
					id: tokenId++,
					text: "",
					logprob: 0,
					special: true,
				},
				generated_text: null,
				details: null,
				routerMetadata,
			} as TextGenerationStreamOutput & {
				routerMetadata: { route?: string; model?: string; provider?: string };
			};
		}
	}
}

/**
 * Transform a non-streaming OpenAI chat completion into a stream of TextGenerationStreamOutput
 */
export async function* openAIChatToTextGenerationSingle(
	completion: OpenAI.Chat.Completions.ChatCompletion,
	getRouterMetadata?: () => { route?: string; model?: string; provider?: string }
) {
	const message: NonNullable<OpenAI.Chat.Completions.ChatCompletion.Choice>["message"] & {
		reasoning?: string;
		reasoning_content?: string;
	} = completion.choices?.[0]?.message ?? {};
	let content: string = message?.content || "";
	// Provider-dependent reasoning shapes (non-streaming)
	const r: string =
		typeof message?.reasoning === "string"
			? (message.reasoning as string)
			: typeof message?.reasoning_content === "string"
				? (message.reasoning_content as string)
				: "";
	if (r && r.length > 0) {
		content = `<think>${r}</think>` + content;
	}
	const tokenId = 0;

	// Yield the content as a single token
	yield {
		token: {
			id: tokenId,
			text: content,
			logprob: 0,
			special: false,
		},
		generated_text: content,
		details: null,
		...(getRouterMetadata
			? (() => {
					const metadata = getRouterMetadata();
					return (metadata && metadata.route && metadata.model) || metadata?.provider
						? { routerMetadata: metadata }
						: {};
				})()
			: {}),
	} as TextGenerationStreamOutput & {
		routerMetadata?: { route?: string; model?: string; provider?: string };
	};
}
