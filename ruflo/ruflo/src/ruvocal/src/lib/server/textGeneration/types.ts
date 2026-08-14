import type { ProcessedModel } from "../models";
import type { Endpoint } from "../endpoints/endpoints";
import type { Conversation } from "$lib/types/Conversation";
import type { Message } from "$lib/types/Message";
import type { Assistant } from "$lib/types/Assistant";

export interface TextGenerationContext {
	model: ProcessedModel;
	endpoint: Endpoint;
	conv: Conversation;
	messages: Message[];
	assistant?: Pick<Assistant, "dynamicPrompt" | "generateSettings">;
	promptedAt: Date;
	ip: string;
	username?: string;
	/** Force-enable multimodal handling for endpoints that support it */
	forceMultimodal?: boolean;
	/** Force-enable tool calling even if model does not advertise support */
	forceTools?: boolean;
	/** Inference provider preference: "auto", "fastest", "cheapest", or a specific provider name */
	provider?: string;
	locals: App.Locals | undefined;
	abortController: AbortController;
	/** Autopilot mode — auto-continue tool calls up to autopilotMaxSteps iterations */
	autopilot?: boolean;
	/** User-configurable cap on autopilot tool-call loops; server falls back to 30 if undefined */
	autopilotMaxSteps?: number;
}
