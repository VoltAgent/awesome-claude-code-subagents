import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import type { GETModelsResponse } from "$lib/server/api/types";

export const GET: RequestHandler = async () => {
	try {
		const { models } = await import("$lib/server/models");
		return superjsonResponse(
			models
				.filter((m) => m.unlisted == false)
				.map((model) => ({
					id: model.id,
					name: model.name,
					websiteUrl: model.websiteUrl,
					modelUrl: model.modelUrl,
					datasetName: model.datasetName,
					datasetUrl: model.datasetUrl,
					displayName: model.displayName,
					description: model.description,
					logoUrl: model.logoUrl,
					providers: model.providers as unknown as Array<
						{ provider: string } & Record<string, unknown>
					>,
					promptExamples: model.promptExamples,
					parameters: model.parameters,
					preprompt: model.preprompt,
					multimodal: model.multimodal,
					multimodalAcceptedMimetypes: model.multimodalAcceptedMimetypes,
					supportsTools: (model as unknown as { supportsTools?: boolean }).supportsTools ?? false,
					unlisted: model.unlisted,
					hasInferenceAPI: model.hasInferenceAPI,
					isRouter: model.isRouter,
				})) satisfies GETModelsResponse
		);
	} catch {
		return superjsonResponse([] as GETModelsResponse);
	}
};
