import type { Migration } from ".";
import { collections } from "$lib/server/database";
import { ObjectId, type WithId } from "mongodb";
import type { Conversation } from "$lib/types/Conversation";
import type { Message } from "$lib/types/Message";
import type { MessageUpdate } from "$lib/types/MessageUpdate";
import { logger } from "$lib/server/logger";

// -----------

/** Converts the old message update to the new schema */
function convertMessageUpdate(message: Message, update: unknown): MessageUpdate | null {
	try {
		// Trim legacy web search updates entirely
		if (
			typeof update === "object" &&
			update !== null &&
			(update as { type: string }).type === "webSearch"
		) {
			return null;
		}

		return update as MessageUpdate;
	} catch (error) {
		logger.error(error, "Error converting message update during migration. Skipping it..");
		return null;
	}
}

const trimMessageUpdates: Migration = {
	_id: new ObjectId("000000000000000000000006"),
	name: "Trim message updates to reduce stored size",
	up: async () => {
		const allConversations = collections.conversations.find({});

		let conversation: WithId<Pick<Conversation, "messages">> | null = null;
		while ((conversation = await allConversations.tryNext())) {
			const messages = conversation.messages.map((message) => {
				// Convert all of the existing updates to the new schema
				const updates = message.updates
					?.map((update) => convertMessageUpdate(message, update))
					.filter((update): update is MessageUpdate => Boolean(update));

				return { ...message, updates };
			});

			// Set the new messages array
			await collections.conversations.updateOne({ _id: conversation._id }, { $set: { messages } });
		}

		return true;
	},
	runEveryTime: false,
};

export default trimMessageUpdates;
