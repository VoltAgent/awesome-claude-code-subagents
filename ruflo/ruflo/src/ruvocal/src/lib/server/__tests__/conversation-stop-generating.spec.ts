import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

import { collections } from "$lib/server/database";
import { AbortRegistry } from "$lib/server/abortRegistry";
import {
	cleanupTestData,
	createTestConversation,
	createTestLocals,
	createTestUser,
} from "$lib/server/api/__tests__/testHelpers";
import { POST } from "../../../routes/conversation/[id]/stop-generating/+server";

describe.sequential("POST /conversation/[id]/stop-generating", () => {
	afterEach(async () => {
		vi.restoreAllMocks();
		await cleanupTestData();
	});

	it(
		"creates abort marker and aborts active registry controllers",
		{ timeout: 30000 },
		async () => {
			const { locals } = await createTestUser();
			const conversation = await createTestConversation(locals);
			const abortSpy = vi.spyOn(AbortRegistry.getInstance(), "abort");

			const response = await POST({
				params: { id: conversation._id.toString() },
				locals,
			} as never);

			expect(response.status).toBe(200);
			expect(abortSpy).toHaveBeenCalledWith(conversation._id.toString());

			const marker = await collections.abortedGenerations.findOne({
				conversationId: conversation._id,
			});
			expect(marker).not.toBeNull();
			expect(marker?.createdAt).toBeInstanceOf(Date);
			expect(marker?.updatedAt).toBeInstanceOf(Date);
		}
	);

	it("updates updatedAt while preserving createdAt on repeated stop", async () => {
		const { locals } = await createTestUser();
		const conversation = await createTestConversation(locals);

		await POST({
			params: { id: conversation._id.toString() },
			locals,
		} as never);
		const firstMarker = await collections.abortedGenerations.findOne({
			conversationId: conversation._id,
		});

		await new Promise((resolve) => setTimeout(resolve, 5));

		await POST({
			params: { id: conversation._id.toString() },
			locals,
		} as never);
		const secondMarker = await collections.abortedGenerations.findOne({
			conversationId: conversation._id,
		});

		expect(firstMarker).not.toBeNull();
		expect(secondMarker).not.toBeNull();
		expect(secondMarker?.createdAt.getTime()).toBe(firstMarker?.createdAt.getTime());
		expect(secondMarker?.updatedAt.getTime()).toBeGreaterThan(
			firstMarker?.updatedAt.getTime() ?? 0
		);
	});

	it("throws 404 when conversation is not found", async () => {
		const { locals } = await createTestUser();
		const missingId = new ObjectId().toString();

		try {
			await POST({
				params: { id: missingId },
				locals,
			} as never);
			expect.fail("Expected 404 error");
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(404);
		}
	});

	it("throws 401 for unauthenticated requests", async () => {
		const locals = createTestLocals({ user: undefined, sessionId: undefined });

		try {
			await POST({
				params: { id: new ObjectId().toString() },
				locals,
			} as never);
			expect.fail("Expected 401 error");
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(401);
		}
	});
});
