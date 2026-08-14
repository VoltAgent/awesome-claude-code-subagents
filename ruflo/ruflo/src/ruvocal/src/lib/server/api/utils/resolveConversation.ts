import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { authCondition } from "$lib/server/auth";
import { convertLegacyConversation } from "$lib/utils/tree/convertLegacyConversation";
import { error } from "@sveltejs/kit";

/**
 * Resolve a conversation by ID.
 * - 7-char IDs → shared conversation lookup
 * - ObjectId strings → owned conversation lookup with auth check
 *
 * Returns the conversation with legacy fields converted and a `shared` flag.
 */
export async function resolveConversation(
	id: string,
	locals: App.Locals,
	fromShare?: string | null
) {
	let conversation;
	let shared = false;

	if (id.length === 7) {
		// shared link of length 7
		conversation = await collections.sharedConversations.findOne({
			_id: id,
		});
		shared = true;
		if (!conversation) {
			error(404, "Conversation not found");
		}
	} else {
		try {
			new ObjectId(id);
		} catch {
			error(400, "Invalid conversation ID format");
		}

		conversation = await collections.conversations.findOne({
			_id: new ObjectId(id),
			...authCondition(locals),
		});

		if (!conversation) {
			const conversationExists =
				(await collections.conversations.countDocuments({
					_id: new ObjectId(id),
				})) !== 0;

			if (conversationExists) {
				error(
					403,
					"You don't have access to this conversation. If someone gave you this link, ask them to use the 'share' feature instead."
				);
			}

			error(404, "Conversation not found.");
		}

		if (fromShare && conversation.meta?.fromShareId === fromShare) {
			shared = true;
		}
	}

	return {
		...conversation,
		...convertLegacyConversation(conversation),
		shared,
	};
}
