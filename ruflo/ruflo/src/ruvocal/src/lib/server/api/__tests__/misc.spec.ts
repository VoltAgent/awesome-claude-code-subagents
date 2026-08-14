import { describe, it, expect, beforeEach } from "vitest";
import superjson from "superjson";
import { createTestLocals, createTestUser, cleanupTestData } from "./testHelpers";
import { GET as featureFlagsGET } from "../../../../routes/api/v2/feature-flags/+server";
import { GET as publicConfigGET } from "../../../../routes/api/v2/public-config/+server";
import type { FeatureFlags } from "$lib/server/api/types";

async function parseResponse<T = unknown>(res: Response): Promise<T> {
	return superjson.parse(await res.text()) as T;
}

function mockRequestEvent(locals: App.Locals) {
	return {
		locals,
		url: new URL("http://localhost"),
		request: new Request("http://localhost"),
	} as Parameters<typeof featureFlagsGET>[0];
}

describe("GET /api/v2/feature-flags", () => {
	beforeEach(async () => {
		await cleanupTestData();
	}, 20000);

	it("returns correct shape with expected fields", async () => {
		const locals = createTestLocals();

		const res = await featureFlagsGET(mockRequestEvent(locals));
		const data = await parseResponse<FeatureFlags>(res);

		expect(data).toHaveProperty("enableAssistants");
		expect(data).toHaveProperty("loginEnabled");
		expect(data).toHaveProperty("isAdmin");
		expect(data).toHaveProperty("transcriptionEnabled");
		expect(typeof data.enableAssistants).toBe("boolean");
		expect(typeof data.loginEnabled).toBe("boolean");
		expect(typeof data.isAdmin).toBe("boolean");
		expect(typeof data.transcriptionEnabled).toBe("boolean");
	});

	it("reflects isAdmin from locals for non-admin user", async () => {
		const locals = createTestLocals({ isAdmin: false });

		const res = await featureFlagsGET(mockRequestEvent(locals));
		const data = await parseResponse<FeatureFlags>(res);

		expect(data.isAdmin).toBe(false);
	});

	it("reflects isAdmin from locals for admin user", async () => {
		const { locals } = await createTestUser();
		locals.isAdmin = true;

		const res = await featureFlagsGET(mockRequestEvent(locals));
		const data = await parseResponse<FeatureFlags>(res);

		expect(data.isAdmin).toBe(true);
	});
});

describe("GET /api/v2/public-config", () => {
	it("returns an object", async () => {
		const locals = createTestLocals();

		const res = await publicConfigGET(mockRequestEvent(locals));
		const data = await parseResponse<Record<string, unknown>>(res);

		expect(data).toBeDefined();
		expect(typeof data).toBe("object");
		expect(data).not.toBeNull();
	});
});
