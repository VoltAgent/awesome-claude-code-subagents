import { authCondition } from "$lib/server/auth";
import { collections } from "$lib/server/database";
import { AbortRegistry } from "$lib/server/abortRegistry";
import { error } from "@sveltejs/kit";
import { ObjectId } from "mongodb";

/**
 * Ideally, we'd be able to detect the client-side abort, see https://github.com/huggingface/chat-ui/pull/88#issuecomment-1523173850
 */
export async function POST({ params, locals }) {
	if (!locals.user && !locals.sessionId) {
		error(401, "Unauthorized");
	}

	const conversationId = new ObjectId(params.id);

	const conversation = await collections.conversations.findOne({
		_id: conversationId,
		...authCondition(locals),
	});

	if (!conversation) {
		error(404, "Conversation not found");
	}

	AbortRegistry.getInstance().abort(conversationId.toString());

	await collections.abortedGenerations.updateOne(
		{ conversationId },
		{ $set: { updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
		{ upsert: true }
	);

	return new Response();
}
