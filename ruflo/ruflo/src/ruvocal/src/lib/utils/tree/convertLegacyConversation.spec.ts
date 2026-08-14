import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { convertLegacyConversation } from "./convertLegacyConversation";
import { insertLegacyConversation } from "./treeHelpers.spec";

describe("convertLegacyConversation", () => {
	it("should convert a legacy conversation", async () => {
		const convId = await insertLegacyConversation();
		const conv = await collections.conversations.findOne({ _id: new ObjectId(convId) });
		if (!conv) throw new Error("Conversation not found");

		const newConv = convertLegacyConversation(conv);

		expect(newConv.rootMessageId).toBe(newConv.messages[0].id);
		expect(newConv.messages[0].ancestors).toEqual([]);
		expect(newConv.messages[1].ancestors).toEqual([newConv.messages[0].id]);
		expect(newConv.messages[0].children).toEqual([newConv.messages[1].id]);
	});
	it("should work on empty conversations", async () => {
		const conv = {
			_id: new ObjectId(),
			rootMessageId: undefined,
			messages: [],
		};
		const newConv = convertLegacyConversation(conv);
		expect(newConv.rootMessageId).toBe(undefined);
		expect(newConv.messages).toEqual([]);
	});
});
