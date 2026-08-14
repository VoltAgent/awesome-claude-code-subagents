import type { Conversation } from "$lib/types/Conversation";
import type { Message } from "$lib/types/Message";
import type {
	TextGenerationStreamOutput,
	TextGenerationStreamToken,
	InferenceProvider,
} from "@huggingface/inference";
import { z } from "zod";
import { endpointOAIParametersSchema, endpointOai } from "./openai/endpointOai";
import type { Model } from "$lib/types/Model";
import type { ObjectId } from "mongodb";

export type EndpointMessage = Omit<Message, "id">;

// parameters passed when generating text
export interface EndpointParameters {
	messages: EndpointMessage[];
	preprompt?: Conversation["preprompt"];
	generateSettings?: Partial<Model["parameters"]>;
	isMultimodal?: boolean;
	conversationId?: ObjectId;
	locals: App.Locals | undefined;
	abortSignal?: AbortSignal;
	/** Inference provider preference: "auto", "fastest", "cheapest", or a specific provider name */
	provider?: string;
}

export type TextGenerationStreamOutputSimplified = TextGenerationStreamOutput & {
	token: TextGenerationStreamToken;
	routerMetadata?: { route?: string; model?: string; provider?: InferenceProvider };
};
// type signature for the endpoint
export type Endpoint = (
	params: EndpointParameters
) => Promise<AsyncGenerator<TextGenerationStreamOutputSimplified, void, void>>;

// list of all endpoint generators
export const endpoints = {
	openai: endpointOai,
};

export const endpointSchema = z.discriminatedUnion("type", [endpointOAIParametersSchema]);
export default endpoints;
