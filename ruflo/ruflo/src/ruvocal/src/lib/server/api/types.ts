import type { BackendModel } from "$lib/server/models";

export type GETModelsResponse = Array<{
	id: string;
	name: string;
	websiteUrl?: string;
	modelUrl?: string;
	datasetName?: string;
	datasetUrl?: string;
	displayName: string;
	description?: string;
	logoUrl?: string;
	providers?: Array<{ provider: string } & Record<string, unknown>>;
	promptExamples?: { title: string; prompt: string }[];
	parameters: BackendModel["parameters"];
	preprompt?: string;
	multimodal: boolean;
	multimodalAcceptedMimetypes?: string[];
	supportsTools?: boolean;
	unlisted: boolean;
	hasInferenceAPI: boolean;
	isRouter: boolean;
}>;

export type GETOldModelsResponse = Array<{
	id: string;
	name: string;
	displayName: string;
	transferTo?: string;
}>;

export interface FeatureFlags {
	enableAssistants: boolean;
	loginEnabled: boolean;
	isAdmin: boolean;
	transcriptionEnabled: boolean;
}
