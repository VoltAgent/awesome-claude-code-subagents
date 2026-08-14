import { error } from "@sveltejs/kit";

/**
 * Resolve a model by namespace and optional model name.
 * Looks up in the models registry and returns the model, or throws 404 if not found or unlisted.
 */
export async function resolveModel(namespace: string, model?: string) {
	let modelId = namespace;
	if (model) {
		modelId += "/" + model;
	}

	try {
		const { models } = await import("$lib/server/models");
		const found = models.find((m) => m.id === modelId);
		if (!found || found.unlisted) {
			error(404, "Model not found");
		}
		return found;
	} catch (e) {
		// Re-throw SvelteKit HttpErrors
		if (e && typeof e === "object" && "status" in e) {
			throw e;
		}
		error(500, "Models not available");
	}
}
