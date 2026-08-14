import { authCondition } from "$lib/server/auth";
import { collections } from "$lib/server/database";
import { error } from "@sveltejs/kit";
import { ObjectId } from "mongodb";

export async function DELETE({ locals, params }) {
	const messageId = params.messageId;

	if (!messageId || typeof messageId !== "string") {
		error(400, "Invalid message id");
	}

	const conversation = await collections.conversations.findOne({
		...authCondition(locals),
		_id: new ObjectId(params.id),
	});

	if (!conversation) {
		error(404, "Conversation not found");
	}

	const filteredMessages = conversation.messages
		.filter(
			(message) =>
				// not the message AND the message is not in ancestors
				!(message.id === messageId) && message.ancestors && !message.ancestors.includes(messageId)
		)
		.map((message) => {
			// remove the message from children if it's there
			if (message.children && message.children.includes(messageId)) {
				message.children = message.children.filter((child) => child !== messageId);
			}
			return message;
		});

	await collections.conversations.updateOne(
		{ _id: conversation._id, ...authCondition(locals) },
		{ $set: { messages: filteredMessages } }
	);

	return new Response();
}
