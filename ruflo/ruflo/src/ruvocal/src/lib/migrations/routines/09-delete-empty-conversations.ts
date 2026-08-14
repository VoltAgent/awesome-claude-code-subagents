import type { Migration } from ".";
import { collections } from "$lib/server/database";
import { Collection, FindCursor, ObjectId } from "mongodb";
import { logger } from "$lib/server/logger";
import type { Conversation } from "$lib/types/Conversation";

const BATCH_SIZE = 1000;
const DELETE_THRESHOLD_MS = 60 * 60 * 1000;

async function deleteBatch(conversations: Collection<Conversation>, ids: ObjectId[]) {
	if (ids.length === 0) return 0;
	const deleteResult = await conversations.deleteMany({ _id: { $in: ids } });
	return deleteResult.deletedCount;
}

async function processCursor<T>(
	cursor: FindCursor<T>,
	processBatchFn: (batch: T[]) => Promise<void>
) {
	let batch = [];
	while (await cursor.hasNext()) {
		const doc = await cursor.next();
		if (doc) {
			batch.push(doc);
		}
		if (batch.length >= BATCH_SIZE) {
			await processBatchFn(batch);
			batch = [];
		}
	}
	if (batch.length > 0) {
		await processBatchFn(batch);
	}
}

export async function deleteConversations(
	collections: typeof import("$lib/server/database").collections
) {
	let deleteCount = 0;
	const { conversations, sessions } = collections;

	// First criteria: Delete conversations with no user/assistant messages older than 1 hour
	const emptyConvCursor = conversations
		.find({
			"messages.from": { $not: { $in: ["user", "assistant"] } },
			createdAt: { $lt: new Date(Date.now() - DELETE_THRESHOLD_MS) },
		})
		.batchSize(BATCH_SIZE);

	await processCursor(emptyConvCursor, async (batch) => {
		const ids = batch.map((doc) => doc._id);
		deleteCount += await deleteBatch(conversations, ids);
	});

	// Second criteria: Process conversations without users in batches and check sessions
	const noUserCursor = conversations.find({ userId: { $exists: false } }).batchSize(BATCH_SIZE);

	await processCursor(noUserCursor, async (batch) => {
		const sessionIds = [
			...new Set(batch.map((conv) => conv.sessionId).filter((id): id is string => !!id)),
		];

		const existingSessions = await sessions.find({ sessionId: { $in: sessionIds } }).toArray();
		const validSessionIds = new Set(existingSessions.map((s) => s.sessionId));

		const invalidConvs = batch.filter(
			(conv) => !conv.sessionId || !validSessionIds.has(conv.sessionId)
		);
		const idsToDelete = invalidConvs.map((conv) => conv._id);
		deleteCount += await deleteBatch(conversations, idsToDelete);
	});

	logger.info(`[MIGRATIONS] Deleted ${deleteCount} conversations in total.`);
	return deleteCount;
}

const deleteEmptyConversations: Migration = {
	_id: new ObjectId("000000000000000000000009"),
	name: "Delete conversations with no user or assistant messages or valid sessions",
	up: async () => {
		await deleteConversations(collections);
		return true;
	},
	runEveryTime: false,
	runForHuggingChat: "only",
};

export default deleteEmptyConversations;
