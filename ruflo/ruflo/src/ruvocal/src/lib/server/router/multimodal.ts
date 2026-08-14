import { config } from "$lib/server/config";
import type { ProcessedModel } from "../models";

/**
 * Returns the configured multimodal model when it exists and is valid.
 * - Requires LLM_ROUTER_MULTIMODAL_MODEL to be set (id or name).
 * - Ignores router aliases and non-multimodal models.
 */
export function findConfiguredMultimodalModel(
	models: ProcessedModel[] | undefined
): ProcessedModel | undefined {
	const preferredModelId = (config.LLM_ROUTER_MULTIMODAL_MODEL || "").trim();
	if (!preferredModelId || !models?.length) return undefined;

	return models.find(
		(candidate) =>
			(candidate.id === preferredModelId || candidate.name === preferredModelId) &&
			!candidate.isRouter &&
			candidate.multimodal
	);
}

export function getConfiguredMultimodalModelId(
	models: ProcessedModel[] | undefined
): string | undefined {
	const model = findConfiguredMultimodalModel(models);
	return model?.id ?? model?.name;
}
