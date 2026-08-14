import { error, type RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { requireAuth } from "$lib/server/api/utils/requireAuth";
import { createConversationFromShare } from "$lib/server/conversation";

export const POST: RequestHandler = async ({ locals, request }) => {
	requireAuth(locals);

	const body = await request.json();
	const shareId = body?.shareId;

	if (!shareId || typeof shareId !== "string" || shareId.length === 0) {
		error(400, "shareId is required");
	}

	const conversationId = await createConversationFromShare(
		shareId,
		locals,
		request.headers.get("User-Agent") ?? undefined
	);

	return superjsonResponse({ conversationId });
};
