import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { insertLegacyConversation, insertSideBranchesConversation } from "./treeHelpers.spec";
import type { Message } from "$lib/types/Message";
import { addSibling } from "./addSibling";
import type { Conversation } from "$lib/types/Conversation";

const newMessage = {
	content: "new message",
	from: "user" as const,
};

Object.freeze(newMessage);

describe("addSibling", async () => {
	it("should fail on empty conversations", () => {
		const conv = {
			_id: new ObjectId(),
			rootMessageId: undefined,
			messages: [] as Message[],
		} satisfies Pick<Conversation, "_id" | "rootMessageId" | "messages">;

		expect(() => addSibling(conv, newMessage, "not-a-real-id-test")).toThrow(
			"Cannot add a sibling to an empty conversation"
		);
	});

	it("should fail on legacy conversations", async () => {
		const convId = await insertLegacyConversation();
		const conv = await collections.conversations.findOne({ _id: new ObjectId(convId) });
		if (!conv) throw new Error("Conversation not found");

		expect(() => addSibling(conv, newMessage, conv.messages[0].id)).toThrow(
			"Cannot add a sibling to a legacy conversation"
		);
	});

	it("should fail if the sibling message doesn't exist", async () => {
		const convId = await insertSideBranchesConversation();
		const conv = await collections.conversations.findOne({ _id: new ObjectId(convId) });
		if (!conv) throw new Error("Conversation not found");

		expect(() => addSibling(conv, newMessage, "not-a-real-id-test")).toThrow(
			"The sibling message doesn't exist"
		);
	});

	// TODO: This behaviour should be fixed, we do not need to fail on the root message.
	it("should fail if the sibling message is the root message", async () => {
		const convId = await insertSideBranchesConversation();
		const conv = await collections.conversations.findOne({ _id: new ObjectId(convId) });
		if (!conv) throw new Error("Conversation not found");
		if (!conv.rootMessageId) throw new Error("Root message not found");

		expect(() => addSibling(conv, newMessage, conv.rootMessageId as Message["id"])).toThrow(
			"The sibling message is the root message, therefore we can't add a sibling"
		);
	});

	it("should add a sibling to a message", async () => {
		const convId = await insertSideBranchesConversation();
		const conv = await collections.conversations.findOne({ _id: new ObjectId(convId) });
		if (!conv) throw new Error("Conversation not found");

		// add sibling and check children count for parnets

		const nChildren = conv.messages[1].children?.length;
		const siblingId = addSibling(conv, newMessage, conv.messages[2].id);
		const nChildrenNew = conv.messages[1].children?.length;

		if (!nChildren) throw new Error("No children found");

		expect(nChildrenNew).toBe(nChildren + 1);

		// make sure siblings have the same ancestors
		const sibling = conv.messages.find((m) => m.id === siblingId);
		expect(sibling?.ancestors).toEqual(conv.messages[2].ancestors);
	});
});
