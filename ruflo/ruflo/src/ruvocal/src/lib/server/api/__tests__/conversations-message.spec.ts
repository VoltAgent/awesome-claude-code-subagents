import { describe, expect, it, afterEach } from "vitest";
import { ObjectId } from "mongodb";
import { v4 } from "uuid";
import superjson from "superjson";
import { collections } from "$lib/server/database";
import type { Message } from "$lib/types/Message";
import {
	createTestLocals,
	createTestUser,
	createTestConversation,
	cleanupTestData,
} from "./testHelpers";

import { DELETE } from "../../../../routes/api/v2/conversations/[id]/message/[messageId]/+server";

async function parseResponse<T = unknown>(res: Response): Promise<T> {
	return superjson.parse(await res.text()) as T;
}

/**
 * Build a simple message tree:
 *
 *   root (system)
 *     -> msg1 (user)
 *       -> msg2 (assistant)
 *         -> msg3 (user)
 *     -> unrelated (user) -- sibling branch from root
 */
function buildMessageTree(): {
	messages: Message[];
	rootId: string;
	msg1Id: string;
	msg2Id: string;
	msg3Id: string;
	unrelatedId: string;
} {
	const rootId = v4();
	const msg1Id = v4();
	const msg2Id = v4();
	const msg3Id = v4();
	const unrelatedId = v4();

	const root: Message = {
		id: rootId,
		from: "system",
		content: "System prompt",
		ancestors: [],
		children: [msg1Id, unrelatedId],
	};
	const msg1: Message = {
		id: msg1Id,
		from: "user",
		content: "Hello",
		ancestors: [rootId],
		children: [msg2Id],
	};
	const msg2: Message = {
		id: msg2Id,
		from: "assistant",
		content: "Hi there!",
		ancestors: [rootId, msg1Id],
		children: [msg3Id],
	};
	const msg3: Message = {
		id: msg3Id,
		from: "user",
		content: "How are you?",
		ancestors: [rootId, msg1Id, msg2Id],
		children: [],
	};
	const unrelated: Message = {
		id: unrelatedId,
		from: "user",
		content: "Unrelated branch",
		ancestors: [rootId],
		children: [],
	};

	return {
		messages: [root, msg1, msg2, msg3, unrelated],
		rootId,
		msg1Id,
		msg2Id,
		msg3Id,
		unrelatedId,
	};
}

describe.sequential("DELETE /api/v2/conversations/[id]/message/[messageId]", () => {
	afterEach(async () => {
		await cleanupTestData();
	});

	it("removes target message and its descendants", { timeout: 30000 }, async () => {
		const { locals } = await createTestUser();
		const tree = buildMessageTree();

		const conv = await createTestConversation(locals, {
			messages: tree.messages,
			rootMessageId: tree.rootId,
		});

		// Delete msg1 -> should also remove msg2 and msg3 (descendants)
		const res = await DELETE({
			locals,
			params: { id: conv._id.toString(), messageId: tree.msg1Id },
		} as never);

		expect(res.status).toBe(200);
		const data = await parseResponse<{ success: boolean }>(res);
		expect(data.success).toBe(true);

		const updated = await collections.conversations.findOne({ _id: conv._id });
		expect(updated).not.toBeNull();

		const remainingIds = (updated?.messages ?? []).map((m) => m.id);
		// msg1, msg2, msg3 should all be removed
		expect(remainingIds).not.toContain(tree.msg1Id);
		expect(remainingIds).not.toContain(tree.msg2Id);
		expect(remainingIds).not.toContain(tree.msg3Id);
		// root and unrelated should remain
		expect(remainingIds).toContain(tree.rootId);
		expect(remainingIds).toContain(tree.unrelatedId);
	});

	it("cleans up children arrays referencing deleted message", async () => {
		const { locals } = await createTestUser();
		const tree = buildMessageTree();

		const conv = await createTestConversation(locals, {
			messages: tree.messages,
			rootMessageId: tree.rootId,
		});

		// Delete msg1 -> root's children should no longer include msg1Id
		await DELETE({
			locals,
			params: { id: conv._id.toString(), messageId: tree.msg1Id },
		} as never);

		const updated = await collections.conversations.findOne({ _id: conv._id });
		const rootMsg = updated?.messages.find((m) => m.id === tree.rootId);
		expect(rootMsg).toBeDefined();
		expect(rootMsg?.children).not.toContain(tree.msg1Id);
		// The unrelated sibling should still be in root's children
		expect(rootMsg?.children).toContain(tree.unrelatedId);
	});

	it("throws 404 for non-existent message", async () => {
		const { locals } = await createTestUser();
		const tree = buildMessageTree();

		const conv = await createTestConversation(locals, {
			messages: tree.messages,
			rootMessageId: tree.rootId,
		});

		const fakeMessageId = v4();

		try {
			await DELETE({
				locals,
				params: { id: conv._id.toString(), messageId: fakeMessageId },
			} as never);
			expect.fail("Should have thrown");
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(404);
		}
	});

	it("throws 401 for unauthenticated request", async () => {
		const locals = createTestLocals({ sessionId: undefined, user: undefined });

		try {
			await DELETE({
				locals,
				params: { id: new ObjectId().toString(), messageId: v4() },
			} as never);
			expect.fail("Should have thrown");
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(401);
		}
	});

	it("preserves unrelated messages in the tree", async () => {
		const { locals } = await createTestUser();
		const tree = buildMessageTree();

		const conv = await createTestConversation(locals, {
			messages: tree.messages,
			rootMessageId: tree.rootId,
		});

		// Delete msg3 (a leaf) -> should only remove msg3, everything else stays
		const res = await DELETE({
			locals,
			params: { id: conv._id.toString(), messageId: tree.msg3Id },
		} as never);

		expect(res.status).toBe(200);

		const updated = await collections.conversations.findOne({ _id: conv._id });
		const remainingIds = (updated?.messages ?? []).map((m) => m.id);

		expect(remainingIds).toHaveLength(4);
		expect(remainingIds).toContain(tree.rootId);
		expect(remainingIds).toContain(tree.msg1Id);
		expect(remainingIds).toContain(tree.msg2Id);
		expect(remainingIds).toContain(tree.unrelatedId);
		expect(remainingIds).not.toContain(tree.msg3Id);

		// msg2's children should no longer include msg3Id
		const msg2 = updated?.messages.find((m) => m.id === tree.msg2Id);
		expect(msg2?.children).not.toContain(tree.msg3Id);
	});
});
