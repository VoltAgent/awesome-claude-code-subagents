import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import type { Semaphores } from "$lib/types/Semaphore";

/**
 * Returns the lock id if the lock was acquired, false otherwise
 */
export async function acquireLock(key: Semaphores | string): Promise<ObjectId | false> {
	try {
		const id = new ObjectId();

		const insert = await collections.semaphores.insertOne({
			_id: id,
			key,
			createdAt: new Date(),
			updatedAt: new Date(),
			deleteAt: new Date(Date.now() + 1000 * 60 * 3), // 3 minutes
		});

		return insert.acknowledged ? id : false; // true if the document was inserted
	} catch (e) {
		// unique index violation, so there must already be a lock
		return false;
	}
}

export async function releaseLock(key: Semaphores | string, lockId: ObjectId) {
	await collections.semaphores.deleteOne({
		_id: lockId,
		key,
	});
}

export async function isDBLocked(key: Semaphores | string): Promise<boolean> {
	const res = await collections.semaphores.countDocuments({
		key,
	});
	return res > 0;
}

export async function refreshLock(key: Semaphores | string, lockId: ObjectId): Promise<boolean> {
	const result = await collections.semaphores.updateOne(
		{
			_id: lockId,
			key,
		},
		{
			$set: {
				updatedAt: new Date(),
				deleteAt: new Date(Date.now() + 1000 * 60 * 3), // 3 minutes
			},
		}
	);

	return result.matchedCount > 0;
}
