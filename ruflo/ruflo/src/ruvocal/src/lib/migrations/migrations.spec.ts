import { afterEach, assert, beforeAll, describe, expect, it } from "vitest";
import { migrations } from "./routines";
import { acquireLock, isDBLocked, refreshLock, releaseLock } from "./lock";
import { Semaphores } from "$lib/types/Semaphore";
import { collections, ready } from "$lib/server/database";

describe(
	"migrations",
	{
		retry: 3,
	},
	() => {
		beforeAll(async () => {
			await ready;
			try {
				await collections.semaphores.createIndex({ key: 1 }, { unique: true });
			} catch (e) {
				// Index might already exist, ignore error
			}
		}, 20000);

		it("should not have duplicates guid", async () => {
			const guids = migrations.map((m) => m._id.toString());
			const uniqueGuids = [...new Set(guids)];
			expect(uniqueGuids.length).toBe(guids.length);
		});

		it("should acquire only one lock on DB", async () => {
			const results = await Promise.all(
				new Array(1000).fill(0).map(() => acquireLock(Semaphores.TEST_MIGRATION))
			);
			const locks = results.filter((r) => r);

			const semaphores = await collections.semaphores.find({}).toArray();

			expect(locks.length).toBe(1);
			expect(semaphores).toBeDefined();
			expect(semaphores.length).toBe(1);
			expect(semaphores?.[0].key).toBe(Semaphores.TEST_MIGRATION);
		});

		it("should read the lock correctly", async () => {
			const lockId = await acquireLock(Semaphores.TEST_MIGRATION);
			assert(lockId);
			expect(await isDBLocked(Semaphores.TEST_MIGRATION)).toBe(true);
			expect(!!(await acquireLock(Semaphores.TEST_MIGRATION))).toBe(false);
			await releaseLock(Semaphores.TEST_MIGRATION, lockId);
			expect(await isDBLocked(Semaphores.TEST_MIGRATION)).toBe(false);
		});

		it("should refresh the lock", async () => {
			const lockId = await acquireLock(Semaphores.TEST_MIGRATION);

			assert(lockId);

			// get the updatedAt time

			const updatedAtInitially = (await collections.semaphores.findOne({}))?.updatedAt;

			await refreshLock(Semaphores.TEST_MIGRATION, lockId);

			const updatedAtAfterRefresh = (await collections.semaphores.findOne({}))?.updatedAt;

			expect(updatedAtInitially).toBeDefined();
			expect(updatedAtAfterRefresh).toBeDefined();
			expect(updatedAtInitially).not.toBe(updatedAtAfterRefresh);
		});

		afterEach(async () => {
			await collections.semaphores.deleteMany({});
			await collections.migrationResults.deleteMany({});
		});
	}
);
