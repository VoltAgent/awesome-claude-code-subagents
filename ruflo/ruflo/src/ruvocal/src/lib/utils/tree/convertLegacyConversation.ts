import type { Conversation } from "$lib/types/Conversation";
import type { Message } from "$lib/types/Message";
import { v4 } from "uuid";

export function convertLegacyConversation(
	conv: Pick<Conversation, "messages" | "rootMessageId" | "preprompt">
): Pick<Conversation, "messages" | "rootMessageId" | "preprompt"> {
	if (conv.rootMessageId) return conv; // not a legacy conversation
	if (conv.messages.length === 0) return conv; // empty conversation
	const messages = [
		{
			from: "system",
			content: conv.preprompt ?? "",
			createdAt: new Date(),
			updatedAt: new Date(),
			id: v4(),
		} satisfies Message,
		...conv.messages,
	];

	const rootMessageId = messages[0].id;

	const newMessages = messages.map((message, index) => {
		return {
			...message,
			ancestors: messages.slice(0, index).map((m) => m.id),
			children: index < messages.length - 1 ? [messages[index + 1].id] : [],
		};
	});

	return {
		...conv,
		rootMessageId,
		messages: newMessages,
	};
}
