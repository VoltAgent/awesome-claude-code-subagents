import { error } from "@sveltejs/kit";

/**
 * Throws 401 if neither a user._id nor sessionId is present in locals.
 */
export function requireAuth(locals: App.Locals): void {
	if (!locals.user?._id && !locals.sessionId) {
		error(401, "Must have a valid session or user");
	}
}

/**
 * Throws 401 if no user/session, 403 if not admin.
 */
export function requireAdmin(locals: App.Locals): void {
	if (!locals.user && !locals.sessionId) {
		error(401, "Unauthorized");
	}
	if (!locals.isAdmin) {
		error(403, "Admin privileges required");
	}
}
