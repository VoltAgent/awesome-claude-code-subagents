import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { config } from "$lib/server/config";
import { requireAdmin } from "$lib/server/api/utils/requireAuth";

export const GET: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);
	const { models } = await import("$lib/server/models");
	return superjsonResponse({
		OPENAI_BASE_URL: config.OPENAI_BASE_URL,
		OPENAI_API_KEY_SET: Boolean(config.OPENAI_API_KEY || config.HF_TOKEN),
		LEGACY_HF_TOKEN_SET: Boolean(config.HF_TOKEN && !config.OPENAI_API_KEY),
		MODELS_COUNT: models.length,
		NODE_VERSION: process.versions.node,
	});
};
