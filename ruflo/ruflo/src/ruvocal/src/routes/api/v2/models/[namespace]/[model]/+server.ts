import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { resolveModel } from "$lib/server/api/utils/resolveModel";

export const GET: RequestHandler = async ({ params }) => {
	const model = await resolveModel(params.namespace ?? "", params.model ?? "");
	return superjsonResponse(model);
};
