import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { config } from "$lib/server/config";

export const GET: RequestHandler = async () => {
	return superjsonResponse(await config.getPublicConfig());
};
