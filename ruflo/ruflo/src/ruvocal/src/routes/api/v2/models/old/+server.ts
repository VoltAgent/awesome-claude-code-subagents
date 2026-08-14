import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import type { GETOldModelsResponse } from "$lib/server/api/types";

export const GET: RequestHandler = async () => {
	return superjsonResponse([] as GETOldModelsResponse);
};
