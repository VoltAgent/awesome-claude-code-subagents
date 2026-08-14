import { assert, it, describe, afterEach, vi, expect } from "vitest";
import type { Cookies } from "@sveltejs/kit";
import { collections } from "$lib/server/database";
import { updateUser } from "./updateUser";
import { ObjectId } from "mongodb";
import { DEFAULT_SETTINGS } from "$lib/types/Settings";
import { defaultModel } from "$lib/server/models";
import { findUser } from "$lib/server/auth";
import type { TokenSet } from "openid-client";

const userData = {
	preferred_username: "new-username",
	name: "name",
	picture: "https://example.com/avatar.png",
	sub: "1234567890",
};
Object.freeze(userData);

const locals = {
	userId: "1234567890",
	sessionId: "1234567890",
	isAdmin: false,
};

const token = {
	access_token: "access_token",
	refresh_token: "refresh_token",
	expires_at: Math.floor(Date.now() / 1000) + 3600, // Expires 1 hour from now
	expires_in: 3600,
} as TokenSet;

// @ts-expect-error SvelteKit cookies dumb mock
const cookiesMock: Cookies = {
	set: vi.fn(),
};

const insertRandomUser = async () => {
	const res = await collections.users.insertOne({
		_id: new ObjectId(),
		createdAt: new Date(),
		updatedAt: new Date(),
		username: "base-username",
		name: userData.name,
		avatarUrl: userData.picture,
		hfUserId: userData.sub,
	});

	return res.insertedId;
};

const insertRandomConversations = async (count: number) => {
	const res = await collections.conversations.insertMany(
		new Array(count).fill(0).map(() => ({
			_id: new ObjectId(),
			title: "random title",
			messages: [],
			model: defaultModel.id,
			// embedding model removed in this build
			createdAt: new Date(),
			updatedAt: new Date(),
			sessionId: locals.sessionId,
		}))
	);

	return res.insertedIds;
};

describe("login", () => {
	it("should update user if existing", async () => {
		await insertRandomUser();

		await updateUser({ userData, locals, cookies: cookiesMock, token });

		const existingUser = await collections.users.findOne({ hfUserId: userData.sub });

		assert.equal(existingUser?.name, userData.name);

		expect(cookiesMock.set).toBeCalledTimes(1);
	}, 30000);

	it("should migrate pre-existing conversations for new user", async () => {
		const insertedId = await insertRandomUser();

		await insertRandomConversations(2);

		await updateUser({ userData, locals, cookies: cookiesMock, token });

		const conversationCount = await collections.conversations.countDocuments({
			userId: insertedId,
			sessionId: { $exists: false },
		});

		assert.equal(conversationCount, 2);

		await collections.conversations.deleteMany({ userId: insertedId });
	});

	it("should create default settings for new user", async () => {
		await updateUser({ userData, locals, cookies: cookiesMock, token });

		// updateUser creates a new sessionId, so we need to use the updated value
		const user = (await findUser(locals.sessionId, undefined, new URL("http://localhost"))).user;

		assert.exists(user);

		const settings = await collections.settings.findOne({ userId: user?._id });

		expect(settings).toMatchObject({
			userId: user?._id,
			updatedAt: expect.any(Date),
			createdAt: expect.any(Date),
			...DEFAULT_SETTINGS,
		});

		await collections.settings.deleteOne({ userId: user?._id });
	});

	it("should migrate pre-existing settings for pre-existing user", async () => {
		const { insertedId } = await collections.settings.insertOne({
			sessionId: locals.sessionId,
			updatedAt: new Date(),
			createdAt: new Date(),
			...DEFAULT_SETTINGS,
			shareConversationsWithModelAuthors: false,
		});

		await updateUser({ userData, locals, cookies: cookiesMock, token });

		const settings = await collections.settings.findOne({
			_id: insertedId,
			sessionId: { $exists: false },
		});

		assert.exists(settings);

		const user = await collections.users.findOne({ hfUserId: userData.sub });

		expect(settings).toMatchObject({
			userId: user?._id,
			updatedAt: expect.any(Date),
			createdAt: expect.any(Date),
			...DEFAULT_SETTINGS,
			shareConversationsWithModelAuthors: false,
		});

		await collections.settings.deleteOne({ userId: user?._id });
	});
});

afterEach(async () => {
	await collections.users.deleteMany({ hfUserId: userData.sub });
	await collections.sessions.deleteMany({});

	locals.userId = "1234567890";
	locals.sessionId = "1234567890";
	vi.clearAllMocks();
});
