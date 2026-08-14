import { ObjectId, type WithId } from "mongodb";
import { collections } from "$lib/server/database";

import type { Migration } from ".";
import type { Conversation } from "$lib/types/Conversation";
import type { MessageFile } from "$lib/types/Message";

const updateMessageFiles: Migration = {
	_id: new ObjectId("5f9f5f5f5f5f5f5f5f5f5f5f"),
	name: "Convert message files to the new schema",
	up: async () => {
		const allConversations = collections.conversations.find({}, { projection: { messages: 1 } });

		let conversation: WithId<Pick<Conversation, "messages">> | null = null;
		while ((conversation = await allConversations.tryNext())) {
			const messages = conversation.messages.map((message) => {
				const files = (message.files as string[] | undefined)?.map<MessageFile>((file) => {
					// File is already in the new format
					if (typeof file !== "string") return file;

					// File was a hash pointing to a file in the bucket
					if (file.length === 64) {
						return {
							type: "hash",
							name: "unknown.jpg",
							value: file,
							mime: "image/jpeg",
						};
					}
					// File was a base64 string
					else {
						return {
							type: "base64",
							name: "unknown.jpg",
							value: file,
							mime: "image/jpeg",
						};
					}
				});

				return {
					...message,
					files,
				};
			});

			// Set the new messages array
			await collections.conversations.updateOne({ _id: conversation._id }, { $set: { messages } });
		}

		return true;
	},
	runEveryTime: false,
};

export default updateMessageFiles;
