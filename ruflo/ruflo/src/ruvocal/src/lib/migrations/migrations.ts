import { Database } from "$lib/server/database";
import { migrations } from "./routines";
import { acquireLock, releaseLock, isDBLocked, refreshLock } from "./lock";
import { Semaphores } from "$lib/types/Semaphore";
import { logger } from "$lib/server/logger";
import { config } from "$lib/server/config";

export async function checkAndRunMigrations() {
	// make sure all GUIDs are unique
	if (new Set(migrations.map((m) => m._id.toString())).size !== migrations.length) {
		throw new Error("Duplicate migration GUIDs found.");
	}

	// check if all migrations have already been run
	const migrationResults = await (await Database.getInstance())
		.getCollections()
		.migrationResults.find()
		.toArray();

	logger.debug("[MIGRATIONS] Begin check...");

	const lockId = await acquireLock(Semaphores.MIGRATION);

	if (!lockId) {
		// another instance already has the lock, so we exit early
		logger.debug(
			"[MIGRATIONS] Another instance already has the lock. Waiting for DB to be unlocked."
		);

		// block until the lock is released
		while (await isDBLocked(Semaphores.MIGRATION)) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
		return;
	}

	// once here, we have the lock
	// make sure to refresh it regularly while it's running
	const refreshInterval = setInterval(async () => {
		await refreshLock(Semaphores.MIGRATION, lockId);
	}, 1000 * 10);

	// iterate over all migrations
	for (const migration of migrations) {
		// check if the migration has already been applied
		const shouldRun =
			migration.runEveryTime ||
			!migrationResults.find((m) => m._id.toString() === migration._id.toString());

		// check if the migration has already been applied
		if (!shouldRun) {
			logger.debug(`[MIGRATIONS] "${migration.name}" already applied. Skipping...`);
		} else {
			// check the modifiers to see if some cases match
			if (
				(migration.runForHuggingChat === "only" && !config.isHuggingChat) ||
				(migration.runForHuggingChat === "never" && config.isHuggingChat)
			) {
				logger.debug(
					`[MIGRATIONS] "${migration.name}" should not be applied for this run. Skipping...`
				);
				continue;
			}

			// otherwise all is good and we can run the migration
			logger.debug(
				`[MIGRATIONS] "${migration.name}" ${
					migration.runEveryTime ? "should run every time" : "not applied yet"
				}. Applying...`
			);

			await (await Database.getInstance()).getCollections().migrationResults.updateOne(
				{ _id: migration._id },
				{
					$set: {
						name: migration.name,
						status: "ongoing",
					},
				},
				{ upsert: true }
			);

			let result = false;

			try {
				// RVF store: no transactions needed, run migration directly
				result = await migration.up(await Database.getInstance());
			} catch (e) {
				logger.error(e, `[MIGRATIONS]  "${migration.name}" failed!`);
			}

			await (await Database.getInstance()).getCollections().migrationResults.updateOne(
				{ _id: migration._id },
				{
					$set: {
						name: migration.name,
						status: result ? "success" : "failure",
					},
				},
				{ upsert: true }
			);
		}
	}

	logger.debug("[MIGRATIONS] All migrations applied. Releasing lock");

	clearInterval(refreshInterval);
	await releaseLock(Semaphores.MIGRATION, lockId);
}
