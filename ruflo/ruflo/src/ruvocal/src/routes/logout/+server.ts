import { dev } from "$app/environment";
import { base } from "$app/paths";
import { collections } from "$lib/server/database";
import { redirect } from "@sveltejs/kit";
import { config } from "$lib/server/config";

export async function POST({ locals, cookies }) {
	await collections.sessions.deleteOne({ sessionId: locals.sessionId });

	cookies.delete(config.COOKIE_NAME, {
		path: "/",
		// So that it works inside the space's iframe
		sameSite: dev || config.ALLOW_INSECURE_COOKIES === "true" ? "lax" : "none",
		secure: !dev && !(config.ALLOW_INSECURE_COOKIES === "true"),
		httpOnly: true,
	});
	return redirect(302, `${base}/`);
}
