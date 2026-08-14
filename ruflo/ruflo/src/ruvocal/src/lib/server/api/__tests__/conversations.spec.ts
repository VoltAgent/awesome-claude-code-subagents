import { describe, expect, it, afterEach } from "vitest";
import superjson from "superjson";
import { collections } from "$lib/server/database";
import { CONV_NUM_PER_PAGE } from "$lib/constants/pagination";
import {
	createTestLocals,
	createTestUser,
	createTestConversation,
	cleanupTestData,
} from "./testHelpers";

import { GET, DELETE } from "../../../../routes/api/v2/conversations/+server";

async function parseResponse<T = unknown>(res: Response): Promise<T> {
	return superjson.parse(await res.text()) as T;
}

function mockUrl(params?: Record<string, string>): URL {
	const url = new URL("http://localhost:5173/api/v2/conversations");
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
	}
	return url;
}

describe.sequential("GET /api/v2/conversations", () => {
	afterEach(async () => {
		await cleanupTestData();
	});

	it("returns conversations for authenticated user", { timeout: 30000 }, async () => {
		const { locals } = await createTestUser();
		const conv = await createTestConversation(locals, { title: "My Chat" });

		const res = await GET({
			locals,
			url: mockUrl(),
		} as never);

		expect(res.status).toBe(200);
		const data = await parseResponse<{
			conversations: Array<{ title: string; _id: { toString(): string } }>;
			hasMore: boolean;
		}>(res);
		expect(data.conversations).toHaveLength(1);
		expect(data.conversations[0].title).toBe("My Chat");
		expect(data.conversations[0]._id.toString()).toBe(conv._id.toString());
		expect(data.hasMore).toBe(false);
	});

	it("returns empty array for user with no conversations", async () => {
		const { locals } = await createTestUser();

		const res = await GET({
			locals,
			url: mockUrl(),
		} as never);

		expect(res.status).toBe(200);
		const data = await parseResponse<{ conversations: unknown[]; hasMore: boolean }>(res);
		expect(data.conversations).toHaveLength(0);
		expect(data.hasMore).toBe(false);
	});

	it("supports pagination with p=0 and p=1", async () => {
		const { locals } = await createTestUser();

		// Create CONV_NUM_PER_PAGE + 5 conversations with distinct updatedAt values
		for (let i = 0; i < CONV_NUM_PER_PAGE + 5; i++) {
			await createTestConversation(locals, {
				title: `Conv ${i}`,
				updatedAt: new Date(Date.now() - (CONV_NUM_PER_PAGE + 5 - i) * 1000),
			});
		}

		const resPage0 = await GET({
			locals,
			url: mockUrl({ p: "0" }),
		} as never);

		const dataPage0 = await parseResponse<{
			conversations: Array<{ title: string }>;
			hasMore: boolean;
		}>(resPage0);
		expect(dataPage0.conversations).toHaveLength(CONV_NUM_PER_PAGE);
		expect(dataPage0.hasMore).toBe(true);

		const resPage1 = await GET({
			locals,
			url: mockUrl({ p: "1" }),
		} as never);

		const dataPage1 = await parseResponse<{
			conversations: Array<{ title: string }>;
			hasMore: boolean;
		}>(resPage1);
		expect(dataPage1.conversations).toHaveLength(5);
		expect(dataPage1.hasMore).toBe(false);
	});

	it("returns hasMore=true when more than CONV_NUM_PER_PAGE exist", async () => {
		const { locals } = await createTestUser();

		for (let i = 0; i < CONV_NUM_PER_PAGE + 1; i++) {
			await createTestConversation(locals, {
				title: `Conv ${i}`,
				updatedAt: new Date(Date.now() - i * 1000),
			});
		}

		const res = await GET({
			locals,
			url: mockUrl(),
		} as never);

		const data = await parseResponse<{ conversations: unknown[]; hasMore: boolean }>(res);
		expect(data.conversations).toHaveLength(CONV_NUM_PER_PAGE);
		expect(data.hasMore).toBe(true);
	});

	it("sorts by updatedAt descending", async () => {
		const { locals } = await createTestUser();

		await createTestConversation(locals, {
			title: "Oldest",
			updatedAt: new Date("2024-01-01"),
		});
		await createTestConversation(locals, {
			title: "Newest",
			updatedAt: new Date("2024-06-01"),
		});
		await createTestConversation(locals, {
			title: "Middle",
			updatedAt: new Date("2024-03-01"),
		});

		const res = await GET({
			locals,
			url: mockUrl(),
		} as never);

		const data = await parseResponse<{ conversations: Array<{ title: string }> }>(res);
		expect(data.conversations[0].title).toBe("Newest");
		expect(data.conversations[1].title).toBe("Middle");
		expect(data.conversations[2].title).toBe("Oldest");
	});

	it("throws 401 for unauthenticated request", async () => {
		const locals = createTestLocals({ sessionId: undefined, user: undefined });

		try {
			await GET({
				locals,
				url: mockUrl(),
			} as never);
			expect.fail("Should have thrown");
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(401);
		}
	});

	it("does not return other users' conversations", async () => {
		const { locals: localsA } = await createTestUser();
		const { locals: localsB } = await createTestUser();

		await createTestConversation(localsA, { title: "User A Chat" });
		await createTestConversation(localsB, { title: "User B Chat" });

		const res = await GET({
			locals: localsA,
			url: mockUrl(),
		} as never);

		const data = await parseResponse<{ conversations: Array<{ title: string }> }>(res);
		expect(data.conversations).toHaveLength(1);
		expect(data.conversations[0].title).toBe("User A Chat");
	});
});

describe.sequential("DELETE /api/v2/conversations", () => {
	afterEach(async () => {
		await cleanupTestData();
	});

	it("removes all conversations for authenticated user", async () => {
		const { locals } = await createTestUser();

		await createTestConversation(locals, { title: "Chat 1" });
		await createTestConversation(locals, { title: "Chat 2" });
		await createTestConversation(locals, { title: "Chat 3" });

		const res = await DELETE({ locals } as never);
		expect(res.status).toBe(200);

		const data = await parseResponse<number>(res);
		expect(data).toBe(3);

		const remaining = await collections.conversations.countDocuments();
		expect(remaining).toBe(0);
	});

	it("throws 401 for unauthenticated request", async () => {
		const locals = createTestLocals({ sessionId: undefined, user: undefined });

		try {
			await DELETE({ locals } as never);
			expect.fail("Should have thrown");
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(401);
		}
	});

	it("does not remove other users' conversations", async () => {
		const { locals: localsA } = await createTestUser();
		const { locals: localsB } = await createTestUser();

		await createTestConversation(localsA, { title: "User A Chat" });
		await createTestConversation(localsB, { title: "User B Chat" });

		const res = await DELETE({ locals: localsA } as never);
		const data = await parseResponse<number>(res);
		expect(data).toBe(1);

		const remaining = await collections.conversations.countDocuments();
		expect(remaining).toBe(1);

		const userBConvs = await collections.conversations
			.find({ userId: localsB.user?._id })
			.toArray();
		expect(userBConvs).toHaveLength(1);
		expect(userBConvs[0].title).toBe("User B Chat");
	});
});
