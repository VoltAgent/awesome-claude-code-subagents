import type { Message } from "$lib/types/Message";
import type { EndpointMessage } from "./endpoints";
import { downloadFile } from "../files/downloadFile";
import type { ObjectId } from "mongodb";

export async function preprocessMessages(
	messages: Message[],
	convId: ObjectId
): Promise<EndpointMessage[]> {
	return Promise.resolve(messages)
		.then((msgs) => downloadFiles(msgs, convId))
		.then((msgs) => injectClipboardFiles(msgs))
		.then(stripEmptyInitialSystemMessage);
}

async function downloadFiles(messages: Message[], convId: ObjectId): Promise<EndpointMessage[]> {
	return Promise.all(
		messages.map<Promise<EndpointMessage>>((message) =>
			Promise.all((message.files ?? []).map((file) => downloadFile(file.value, convId))).then(
				(files) => ({ ...message, files })
			)
		)
	);
}

async function injectClipboardFiles(messages: EndpointMessage[]) {
	return Promise.all(
		messages.map((message) => {
			const plaintextFiles = message.files
				?.filter((file) => file.mime === "application/vnd.chatui.clipboard")
				.map((file) => Buffer.from(file.value, "base64").toString("utf-8"));

			if (!plaintextFiles || plaintextFiles.length === 0) return message;

			return {
				...message,
				content: `${plaintextFiles.join("\n\n")}\n\n${message.content}`,
				files: message.files?.filter((file) => file.mime !== "application/vnd.chatui.clipboard"),
			};
		})
	);
}

/**
 * Remove an initial system message if its content is empty/whitespace only.
 * This prevents sending an empty system prompt to any provider.
 */
function stripEmptyInitialSystemMessage(messages: EndpointMessage[]): EndpointMessage[] {
	if (!messages?.length) return messages;
	const first = messages[0];
	if (first?.from !== "system") return messages;

	const content = first?.content as unknown;
	const isEmpty = typeof content === "string" ? content.trim().length === 0 : false;

	if (isEmpty) {
		return messages.slice(1);
	}

	return messages;
}
