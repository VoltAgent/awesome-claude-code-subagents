import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import {
	insertLegacyConversation,
	insertLinearBranchConversation,
	insertSideBranchesConversation,
} from "./treeHelpers.spec";
import { buildSubtree } from "./buildSubtree";

describe("buildSubtree", () => {
	it("a subtree in a legacy conversation should be just a slice", async () => {
		const convId = await insertLegacyConversation();
		const conv = await collections.conversations.findOne({ _id: new ObjectId(convId) });
		if (!conv) throw new Error("Conversation not found");

		// check middle
		const id = conv.messages[2].id;
		const subtree = buildSubtree(conv, id);
		expect(subtree).toEqual(conv.messages.slice(0, 3));

		// check zero
		const id2 = conv.messages[0].id;
		const subtree2 = buildSubtree(conv, id2);
		expect(subtree2).toEqual(conv.messages.slice(0, 1));

		//check full length
		const id3 = conv.messages[conv.messages.length - 1].id;
		const subtree3 = buildSubtree(conv, id3);
		expect(subtree3).toEqual(conv.messages);
	});

	it("a subtree in a linear branch conversation should be the ancestors and the message", async () => {
		const convId = await insertLinearBranchConversation();
		const conv = await collections.conversations.findOne({ _id: new ObjectId(convId) });
		if (!conv) throw new Error("Conversation not found");

		// check middle
		const id = conv.messages[1].id;
		const subtree = buildSubtree(conv, id);
		expect(subtree).toEqual([conv.messages[0], conv.messages[1]]);

		// check zero
		const id2 = conv.messages[0].id;
		const subtree2 = buildSubtree(conv, id2);
		expect(subtree2).toEqual([conv.messages[0]]);

		//check full length
		const id3 = conv.messages[conv.messages.length - 1].id;
		const subtree3 = buildSubtree(conv, id3);
		expect(subtree3).toEqual(conv.messages);
	});

	it("should throw an error if the message is not found", async () => {
		const convId = await insertLinearBranchConversation();
		const conv = await collections.conversations.findOne({ _id: new ObjectId(convId) });
		if (!conv) throw new Error("Conversation not found");

		const id = "not-a-real-id-test";

		expect(() => buildSubtree(conv, id)).toThrow("Message not found");
	});

	it("should throw an error if the ancestor is not found", async () => {
		const convId = await insertLinearBranchConversation();
		const conv = await collections.conversations.findOne({ _id: new ObjectId(convId) });
		if (!conv) throw new Error("Conversation not found");

		const id = "1-1-1-1-2";

		conv.messages[1].ancestors = ["not-a-real-id-test"];

		expect(() => buildSubtree(conv, id)).toThrow("Ancestor not found");
	});

	it("should work on empty conversations", () => {
		const conv = {
			_id: new ObjectId(),
			rootMessageId: undefined,
			messages: [],
		};

		const subtree = buildSubtree(conv, "not-a-real-id-test");
		expect(subtree).toEqual([]);
	});

	it("should work for conversation with subtrees", async () => {
		const convId = await insertSideBranchesConversation();
		const conv = await collections.conversations.findOne({ _id: new ObjectId(convId) });
		if (!conv) throw new Error("Conversation not found");

		const subtree = buildSubtree(conv, "1-1-1-1-2");
		expect(subtree).toEqual([conv.messages[0], conv.messages[1]]);

		const subtree2 = buildSubtree(conv, "1-1-1-1-4");
		expect(subtree2).toEqual([
			conv.messages[0],
			conv.messages[1],
			conv.messages[2],
			conv.messages[3],
		]);

		const subtree3 = buildSubtree(conv, "1-1-1-1-6");
		expect(subtree3).toEqual([conv.messages[0], conv.messages[4], conv.messages[5]]);

		const subtree4 = buildSubtree(conv, "1-1-1-1-7");
		expect(subtree4).toEqual([conv.messages[0], conv.messages[4], conv.messages[6]]);
	});
});
