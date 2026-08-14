import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";

export const GET: RequestHandler = async ({ locals }) => {
	return superjsonResponse(
		locals.user
			? {
					id: locals.user._id.toString(),
					username: locals.user.username,
					avatarUrl: locals.user.avatarUrl,
					email: locals.user.email,
					isAdmin: locals.user.isAdmin ?? false,
					isEarlyAccess: locals.user.isEarlyAccess ?? false,
				}
			: null
	);
};
