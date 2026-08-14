/**
 * RuVocal Database — self-contained RVF document store.
 *
 * Zero external dependencies. All data persisted to a single
 * RVF JSON file on disk. MongoDB Collection interface preserved
 * so all 56 importing files work unchanged.
 */

import type { Conversation } from "$lib/types/Conversation";
import type { SharedConversation } from "$lib/types/SharedConversation";
import type { AbortedGeneration } from "$lib/types/AbortedGeneration";
import type { Settings } from "$lib/types/Settings";
import type { User } from "$lib/types/User";
import type { MessageEvent } from "$lib/types/MessageEvent";
import type { Session } from "$lib/types/Session";
import type { Assistant } from "$lib/types/Assistant";
import type { Report } from "$lib/types/Report";
import type { ConversationStats } from "$lib/types/ConversationStats";
import type { MigrationResult } from "$lib/types/MigrationResult";
import type { Semaphore } from "$lib/types/Semaphore";
import type { AssistantStats } from "$lib/types/AssistantStats";
import type { TokenCache } from "$lib/types/TokenCache";
import type { ConfigKey } from "$lib/types/ConfigKey";

import { building } from "$app/environment";
import { onExit } from "./exitHandler";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";

import {
	RvfCollection,
	RvfGridFSBucket,
	initRvfStore,
	flushToDisk,
} from "./database/rvf";

export const CONVERSATION_STATS_COLLECTION = "conversations.stats";

export class Database {
	private static instance: Database;
	private initialized = false;

	private async init() {
		const dbFolder =
			process.env.RVF_DB_PATH ||
			join(dirname(fileURLToPath(import.meta.url)), "../../../db");

		if (!existsSync(dbFolder)) {
			mkdirSync(dbFolder, { recursive: true });
		}

		const dbPath = join(dbFolder, "ruvocal.rvf.json");

		console.log(`[RuVocal] Database: ${dbPath}`);
		initRvfStore(dbPath);
		this.initialized = true;

		// Flush to disk on exit
		onExit(async () => {
			console.log("[RuVocal] Flushing database to disk");
			flushToDisk();
		});
	}

	public static async getInstance(): Promise<Database> {
		if (!Database.instance) {
			Database.instance = new Database();
			await Database.instance.init();
		}
		return Database.instance;
	}

	public getClient() {
		if (!this.initialized) {
			throw new Error("Database not initialized");
		}
		return {}; // No external client — self-contained
	}

	public getCollections() {
		if (!this.initialized) {
			throw new Error("Database not initialized");
		}

		const conversations = new RvfCollection<Conversation>("conversations");
		const settings = new RvfCollection<Settings>("settings");
		const users = new RvfCollection<User>("users");
		const sessions = new RvfCollection<Session>("sessions");
		const messageEvents = new RvfCollection<MessageEvent>("messageEvents");
		const abortedGenerations = new RvfCollection<AbortedGeneration>("abortedGenerations");
		const semaphores = new RvfCollection<Semaphore>("semaphores");
		const tokenCaches = new RvfCollection<TokenCache>("tokens");
		const configCollection = new RvfCollection<ConfigKey>("config");
		const migrationResults = new RvfCollection<MigrationResult>("migrationResults");
		const sharedConversations = new RvfCollection<SharedConversation>("sharedConversations");
		const assistants = new RvfCollection<Assistant>("assistants");
		const assistantStats = new RvfCollection<AssistantStats>("assistants.stats");
		const conversationStats = new RvfCollection<ConversationStats>(CONVERSATION_STATS_COLLECTION);
		const reports = new RvfCollection<Report>("reports");
		const tools = new RvfCollection<Record<string, unknown>>("tools");
		const bucket = new RvfGridFSBucket();

		return {
			conversations,
			conversationStats,
			assistants,
			assistantStats,
			reports,
			sharedConversations,
			abortedGenerations,
			settings,
			users,
			sessions,
			messageEvents,
			bucket,
			migrationResults,
			semaphores,
			tokenCaches,
			tools,
			config: configCollection,
		};
	}
}

export let collections: ReturnType<typeof Database.prototype.getCollections>;

export const ready = (async () => {
	if (!building) {
		const db = await Database.getInstance();
		collections = db.getCollections();
	} else {
		collections = {} as unknown as ReturnType<typeof Database.prototype.getCollections>;
	}
})();

export async function getCollectionsEarly(): Promise<
	ReturnType<typeof Database.prototype.getCollections>
> {
	await ready;
	if (!collections) {
		throw new Error("Database not initialized");
	}
	return collections;
}
