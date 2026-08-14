import { config } from "$lib/server/config";

export function getApiToken(locals: App.Locals | undefined) {
	if (config.USE_USER_TOKEN === "true") {
		if (!locals?.token) {
			throw new Error("User token not found");
		}
		return locals.token;
	}
	return config.OPENAI_API_KEY || config.HF_TOKEN;
}
