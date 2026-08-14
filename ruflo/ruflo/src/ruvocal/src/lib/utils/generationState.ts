import type { Message } from "$lib/types/Message";
import { MessageUpdateStatus, MessageUpdateType } from "$lib/types/MessageUpdate";

export function isAssistantGenerationTerminal(message?: Message): boolean {
	if (!message || message.from !== "assistant") return true;

	if (message.interrupted === true) return true;

	const updates = message.updates ?? [];
	const hasFinalAnswer = updates.some((update) => update.type === MessageUpdateType.FinalAnswer);
	if (hasFinalAnswer) return true;

	return updates.some(
		(update) =>
			update.type === MessageUpdateType.Status &&
			(update.status === MessageUpdateStatus.Error ||
				update.status === MessageUpdateStatus.Finished)
	);
}

export function isConversationGenerationActive(messages: Message[]): boolean {
	const lastAssistant = [...messages].reverse().find((message) => message.from === "assistant");
	if (!lastAssistant) return false;

	return !isAssistantGenerationTerminal(lastAssistant);
}
