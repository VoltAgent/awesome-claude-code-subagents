import type { HandleFetch } from "@sveltejs/kit";
import { isHostLocalhost } from "$lib/server/isURLLocal";

type HandleFetchInput = Parameters<HandleFetch>[0];

export async function handleFetchRequest({
	event,
	request,
	fetch,
}: HandleFetchInput): Promise<Response> {
	if (isHostLocalhost(new URL(request.url).hostname)) {
		const cookieHeader = event.request.headers.get("cookie");
		if (cookieHeader) {
			const headers = new Headers(request.headers);
			headers.set("cookie", cookieHeader);

			return fetch(new Request(request, { headers }));
		}
	}

	return fetch(request);
}
