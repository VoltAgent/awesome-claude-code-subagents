import { ObjectId } from "mongodb";
import { collections } from "$lib/server/database";
import type { User } from "$lib/types/User";
import type { Session } from "$lib/types/Session";
import type { Conversation } from "$lib/types/Conversation";

export function createTestLocals(overrides?: Partial<App.Locals>): App.Locals {
	return {
		sessionId: "test-session-id",
		isAdmin: false,
		user: undefined,
		token: undefined,
		...overrides,
	};
}

export async function createTestUser(): Promise<{
	user: User;
	session: Session;
	locals: App.Locals;
}> {
	const userId = new ObjectId();
	const sessionId = `test-session-${userId.toString()}`;

	const user: User = {
		_id: userId,
		createdAt: new Date(),
		updatedAt: new Date(),
		username: `user-${userId.toString().slice(0, 8)}`,
		name: "Test User",
		avatarUrl: "https://example.com/avatar.png",
		hfUserId: `hf-${userId.toString()}`,
	};

	const session: Session = {
		_id: new ObjectId(),
		createdAt: new Date(),
		updatedAt: new Date(),
		userId,
		sessionId,
		expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
	};

	await collections.users.insertOne(user);
	await collections.sessions.insertOne(session);

	return {
		user,
		session,
		locals: {
			user,
			sessionId,
			isAdmin: false,
			token: undefined,
		},
	};
}

export async function createTestConversation(
	locals: App.Locals,
	overrides?: Partial<Conversation>
): Promise<Conversation> {
	const conv: Conversation = {
		_id: new ObjectId(),
		title: "Test Conversation",
		model: "test-model",
		messages: [],
		createdAt: new Date(),
		updatedAt: new Date(),
		...(locals.user ? { userId: locals.user._id } : { sessionId: locals.sessionId }),
		...overrides,
	};

	await collections.conversations.insertOne(conv);
	return conv;
}

export async function cleanupTestData() {
	await collections.conversations.deleteMany({});
	await collections.abortedGenerations.deleteMany({});
	await collections.users.deleteMany({});
	await collections.sessions.deleteMany({});
	await collections.settings.deleteMany({});
	await collections.sharedConversations.deleteMany({});
	await collections.reports.deleteMany({});
}
