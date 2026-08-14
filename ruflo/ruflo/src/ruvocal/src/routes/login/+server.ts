import { triggerOauthFlow } from "$lib/server/auth";

export async function GET(event) {
	return await triggerOauthFlow(event);
}
