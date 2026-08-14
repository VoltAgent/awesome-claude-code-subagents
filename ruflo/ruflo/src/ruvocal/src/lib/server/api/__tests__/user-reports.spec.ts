import { describe, it, expect, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import superjson from "superjson";
import { collections } from "$lib/server/database";
import { createTestLocals, createTestUser, cleanupTestData } from "./testHelpers";
import { GET } from "../../../../routes/api/v2/user/reports/+server";
import type { Report } from "$lib/types/Report";

async function parseResponse<T = unknown>(res: Response): Promise<T> {
	return superjson.parse(await res.text()) as T;
}

function mockRequestEvent(locals: App.Locals) {
	return {
		locals,
		url: new URL("http://localhost"),
		request: new Request("http://localhost"),
	} as Parameters<typeof GET>[0];
}

describe("GET /api/v2/user/reports", () => {
	beforeEach(async () => {
		await cleanupTestData();
	}, 20000);

	it("returns empty array for unauthenticated user", async () => {
		const locals = createTestLocals();

		const res = await GET(mockRequestEvent(locals));
		const data = await parseResponse<unknown[]>(res);

		expect(data).toEqual([]);
	});

	it("returns reports for authenticated user", async () => {
		const { user, locals } = await createTestUser();

		const report1: Report = {
			_id: new ObjectId(),
			createdBy: user._id,
			object: "assistant",
			contentId: new ObjectId(),
			reason: "Inappropriate content",
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const report2: Report = {
			_id: new ObjectId(),
			createdBy: user._id,
			object: "tool",
			contentId: new ObjectId(),
			reason: "Broken tool",
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		await collections.reports.insertMany([report1, report2]);

		const res = await GET(mockRequestEvent(locals));
		const data = await parseResponse<Report[]>(res);

		expect(data).toHaveLength(2);
		expect(data[0]._id.toString()).toBe(report1._id.toString());
		expect(data[1]._id.toString()).toBe(report2._id.toString());
		expect(data[0].reason).toBe("Inappropriate content");
		expect(data[1].reason).toBe("Broken tool");
	});

	it("returns empty array when authenticated user has no reports", async () => {
		const { locals } = await createTestUser();

		const res = await GET(mockRequestEvent(locals));
		const data = await parseResponse<unknown[]>(res);

		expect(data).toEqual([]);
	});
});
