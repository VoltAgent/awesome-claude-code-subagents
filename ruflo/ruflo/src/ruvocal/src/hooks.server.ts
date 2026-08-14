import { building } from "$app/environment";
import type { Handle, HandleServerError, ServerInit, HandleFetch } from "@sveltejs/kit";
import { initServer } from "$lib/server/hooks/init";
import { handleRequest } from "$lib/server/hooks/handle";
import { handleServerError } from "$lib/server/hooks/error";
import { handleFetchRequest } from "$lib/server/hooks/fetch";

export const init: ServerInit = async () => {
	if (building) return;
	return initServer();
};

export const handle: Handle = async (input) => {
	if (building) {
		// During static build, still replace %gaId% placeholder with empty string
		// to prevent the GA script from loading with an invalid ID
		return input.resolve(input.event, {
			transformPageChunk: ({ html }) => html.replace("%gaId%", ""),
		});
	}
	return handleRequest(input);
};

export const handleError: HandleServerError = async (input) => {
	if (building) throw input.error;
	return handleServerError(input);
};

export const handleFetch: HandleFetch = async (input) => {
	if (building) return input.fetch(input.request);
	return handleFetchRequest(input);
};
