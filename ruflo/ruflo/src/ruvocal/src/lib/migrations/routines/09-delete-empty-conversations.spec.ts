import type { Session } from "$lib/types/Session";
import type { User } from "$lib/types/User";
import type { Conversation } from "$lib/types/Conversation";
import { ObjectId } from "mongodb";
import { deleteConversations } from "./09-delete-empty-conversations";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { collections } from "$lib/server/database";

type Message = Conversation["messages"][number];

const userData = {
	_id: new ObjectId(),
	createdAt: new Date(),
	updatedAt: new Date(),
	username: "new-username",
	name: "name",
	avatarUrl: "https://example.com/avatar.png",
	hfUserId: "9999999999",
} satisfies User;
Object.freeze(userData);

const sessionForUser = {
	_id: new ObjectId(),
	createdAt: new Date(),
	updatedAt: new Date(),
	userId: userData._id,
	sessionId: "session-id-9999999999",
	expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
} satisfies Session;
Object.freeze(sessionForUser);

const userMessage = {
	from: "user",
	id: "user-message-id",
	content: "Hello, how are you?",
} satisfies Message;

const assistantMessage = {
	from: "assistant",
	id: "assistant-message-id",
	content: "I'm fine, thank you!",
} satisfies Message;

const systemMessage = {
	from: "system",
	id: "system-message-id",
	content: "This is a system message",
} satisfies Message;

const conversationBase = {
	_id: new ObjectId(),
	createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
	updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
	model: "model-id",

	title: "title",
	messages: [],
} satisfies Conversation;

describe.sequential("Deleting discarded conversations", async () => {
	test("a conversation with no messages should get deleted", async () => {
		await collections.conversations.insertOne({
			...conversationBase,
			sessionId: sessionForUser.sessionId,
		});

		const result = await deleteConversations(collections);

		expect(result).toBe(1);
	});
	test("a conversation with no messages that is less than 1 hour old should not get deleted", async () => {
		await collections.conversations.insertOne({
			...conversationBase,
			sessionId: sessionForUser.sessionId,
			createdAt: new Date(Date.now() - 30 * 60 * 1000),
		});

		const result = await deleteConversations(collections);

		expect(result).toBe(0);
	});
	test("a conversation with only system messages should get deleted", async () => {
		await collections.conversations.insertOne({
			...conversationBase,
			sessionId: sessionForUser.sessionId,
			messages: [systemMessage],
		});

		const result = await deleteConversations(collections);

		expect(result).toBe(1);
	});
	test("a conversation with a user message should not get deleted", async () => {
		await collections.conversations.insertOne({
			...conversationBase,
			sessionId: sessionForUser.sessionId,
			messages: [userMessage],
		});

		const result = await deleteConversations(collections);

		expect(result).toBe(0);
	});
	test("a conversation with an assistant message should not get deleted", async () => {
		await collections.conversations.insertOne({
			...conversationBase,
			sessionId: sessionForUser.sessionId,
			messages: [assistantMessage],
		});

		const result = await deleteConversations(collections);

		expect(result).toBe(0);
	});
	test("a conversation with a mix of messages should not get deleted", async () => {
		await collections.conversations.insertOne({
			...conversationBase,
			sessionId: sessionForUser.sessionId,
			messages: [systemMessage, userMessage, assistantMessage, userMessage, assistantMessage],
		});

		const result = await deleteConversations(collections);

		expect(result).toBe(0);
	});
	test("a conversation with a userId and no sessionId should not get deleted", async () => {
		await collections.conversations.insertOne({
			...conversationBase,
			messages: [userMessage, assistantMessage],
			userId: userData._id,
		});

		const result = await deleteConversations(collections);

		expect(result).toBe(0);
	});
	test("a conversation with no userId or sessionId should get deleted", async () => {
		await collections.conversations.insertOne({
			...conversationBase,
			messages: [userMessage, assistantMessage],
		});

		const result = await deleteConversations(collections);

		expect(result).toBe(1);
	});
	test("a conversation with a sessionId that exists should not get deleted", async () => {
		await collections.conversations.insertOne({
			...conversationBase,
			messages: [userMessage, assistantMessage],
			sessionId: sessionForUser.sessionId,
		});

		const result = await deleteConversations(collections);

		expect(result).toBe(0);
	});
	test("a conversation with a userId and a sessionId that doesn't exist should NOT get deleted", async () => {
		await collections.conversations.insertOne({
			...conversationBase,
			userId: userData._id,
			messages: [userMessage, assistantMessage],
			sessionId: new ObjectId().toString(),
		});

		const result = await deleteConversations(collections);

		expect(result).toBe(0);
	});
	test("a conversation with only a sessionId that doesn't exist, should get deleted", async () => {
		await collections.conversations.insertOne({
			...conversationBase,
			messages: [userMessage, assistantMessage],
			sessionId: new ObjectId().toString(),
		});

		const result = await deleteConversations(collections);

		expect(result).toBe(1);
	});
	test("many conversations should get deleted", async () => {
		const conversations = Array.from({ length: 10010 }, () => ({
			...conversationBase,
			_id: new ObjectId(),
		}));

		await collections.conversations.insertMany(conversations);

		const result = await deleteConversations(collections);

		expect(result).toBe(10010);
	});
});

beforeAll(async () => {
	await collections.users.insertOne(userData);
	await collections.sessions.insertOne(sessionForUser);
}, 20000);

afterAll(async () => {
	await collections.users.deleteOne({
		_id: userData._id,
	});
	await collections.sessions.deleteOne({
		_id: sessionForUser._id,
	});
	await collections.conversations.deleteMany({});
});

afterEach(async () => {
	await collections.conversations.deleteMany({
		_id: { $in: [conversationBase._id] },
	});
});
