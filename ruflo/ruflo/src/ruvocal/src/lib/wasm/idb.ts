/**
 * IndexedDB Persistence Layer
 * Provides persistent storage for WASM virtual filesystem and RVF containers
 */

import { browser } from "$app/environment";

const DB_NAME = "rvagent-wasm-db";
const DB_VERSION = 1;

// Object store names
const STORES = {
	FILES: "files",
	RVF_CONTAINERS: "rvf-containers",
	GALLERY_CUSTOM: "gallery-custom",
	SETTINGS: "settings",
	SESSIONS: "sessions",
} as const;

// Types
export interface StoredFile {
	path: string;
	content: string;
	createdAt: number;
	updatedAt: number;
}

export interface StoredRvfContainer {
	id: string;
	name: string;
	data: Uint8Array;
	templateId?: string;
	createdAt: number;
	updatedAt: number;
}

export interface StoredSession {
	id: string;
	activeTemplateId?: string;
	config: unknown;
	files: string[];
	createdAt: number;
	updatedAt: number;
}

let db: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open the IndexedDB database
 */
export async function openDatabase(): Promise<IDBDatabase> {
	if (!browser) {
		throw new Error("IndexedDB is only available in browser");
	}

	if (db) {
		return db;
	}

	if (dbPromise) {
		return dbPromise;
	}

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => {
			console.error("[IDB] Failed to open database:", request.error);
			dbPromise = null;
			reject(request.error);
		};

		request.onsuccess = () => {
			db = request.result;
			console.log("[IDB] Database opened successfully");
			resolve(db);
		};

		request.onupgradeneeded = (event) => {
			const database = (event.target as IDBOpenDBRequest).result;

			// Files store (virtual filesystem)
			if (!database.objectStoreNames.contains(STORES.FILES)) {
				const filesStore = database.createObjectStore(STORES.FILES, { keyPath: "path" });
				filesStore.createIndex("updatedAt", "updatedAt", { unique: false });
			}

			// RVF containers store
			if (!database.objectStoreNames.contains(STORES.RVF_CONTAINERS)) {
				const rvfStore = database.createObjectStore(STORES.RVF_CONTAINERS, { keyPath: "id" });
				rvfStore.createIndex("name", "name", { unique: false });
				rvfStore.createIndex("templateId", "templateId", { unique: false });
				rvfStore.createIndex("updatedAt", "updatedAt", { unique: false });
			}

			// Custom gallery templates store
			if (!database.objectStoreNames.contains(STORES.GALLERY_CUSTOM)) {
				const galleryStore = database.createObjectStore(STORES.GALLERY_CUSTOM, { keyPath: "id" });
				galleryStore.createIndex("category", "category", { unique: false });
			}

			// Settings store
			if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
				database.createObjectStore(STORES.SETTINGS, { keyPath: "key" });
			}

			// Sessions store
			if (!database.objectStoreNames.contains(STORES.SESSIONS)) {
				const sessionsStore = database.createObjectStore(STORES.SESSIONS, { keyPath: "id" });
				sessionsStore.createIndex("updatedAt", "updatedAt", { unique: false });
			}

			console.log("[IDB] Database schema created/upgraded");
		};
	});

	return dbPromise;
}

/**
 * Close the database
 */
export function closeDatabase(): void {
	if (db) {
		db.close();
		db = null;
		dbPromise = null;
		console.log("[IDB] Database closed");
	}
}

// ---------------------------------------------------------------------------
// File Operations (Virtual Filesystem)
// ---------------------------------------------------------------------------

/**
 * Write a file to IndexedDB
 */
export async function writeFile(path: string, content: string): Promise<void> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.FILES, "readwrite");
	const store = tx.objectStore(STORES.FILES);

	const now = Date.now();
	const existing = await new Promise<StoredFile | undefined>((resolve) => {
		const request = store.get(path);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(undefined);
	});

	const file: StoredFile = {
		path,
		content,
		createdAt: existing?.createdAt || now,
		updatedAt: now,
	};

	return new Promise((resolve, reject) => {
		const request = store.put(file);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/**
 * Read a file from IndexedDB
 */
export async function readFile(path: string): Promise<string | null> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.FILES, "readonly");
	const store = tx.objectStore(STORES.FILES);

	return new Promise((resolve, reject) => {
		const request = store.get(path);
		request.onsuccess = () => resolve(request.result?.content ?? null);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Delete a file from IndexedDB
 */
export async function deleteFile(path: string): Promise<void> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.FILES, "readwrite");
	const store = tx.objectStore(STORES.FILES);

	return new Promise((resolve, reject) => {
		const request = store.delete(path);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/**
 * List all files in IndexedDB
 */
export async function listFiles(): Promise<StoredFile[]> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.FILES, "readonly");
	const store = tx.objectStore(STORES.FILES);

	return new Promise((resolve, reject) => {
		const request = store.getAll();
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Clear all files
 */
export async function clearFiles(): Promise<void> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.FILES, "readwrite");
	const store = tx.objectStore(STORES.FILES);

	return new Promise((resolve, reject) => {
		const request = store.clear();
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/**
 * Export all files as JSON
 */
export async function exportFilesAsJson(): Promise<string> {
	const files = await listFiles();
	const fileMap: Record<string, string> = {};
	for (const file of files) {
		fileMap[file.path] = file.content;
	}
	return JSON.stringify(fileMap);
}

/**
 * Import files from JSON
 */
export async function importFilesFromJson(json: string): Promise<number> {
	const fileMap: Record<string, string> = JSON.parse(json);
	let count = 0;
	for (const [path, content] of Object.entries(fileMap)) {
		await writeFile(path, content);
		count++;
	}
	return count;
}

// ---------------------------------------------------------------------------
// RVF Container Operations
// ---------------------------------------------------------------------------

/**
 * Save an RVF container
 */
export async function saveRvfContainer(
	id: string,
	name: string,
	data: Uint8Array,
	templateId?: string
): Promise<void> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.RVF_CONTAINERS, "readwrite");
	const store = tx.objectStore(STORES.RVF_CONTAINERS);

	const now = Date.now();
	const existing = await new Promise<StoredRvfContainer | undefined>((resolve) => {
		const request = store.get(id);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(undefined);
	});

	const container: StoredRvfContainer = {
		id,
		name,
		data,
		templateId,
		createdAt: existing?.createdAt || now,
		updatedAt: now,
	};

	return new Promise((resolve, reject) => {
		const request = store.put(container);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/**
 * Load an RVF container
 */
export async function loadRvfContainer(id: string): Promise<StoredRvfContainer | null> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.RVF_CONTAINERS, "readonly");
	const store = tx.objectStore(STORES.RVF_CONTAINERS);

	return new Promise((resolve, reject) => {
		const request = store.get(id);
		request.onsuccess = () => resolve(request.result ?? null);
		request.onerror = () => reject(request.error);
	});
}

/**
 * List all RVF containers
 */
export async function listRvfContainers(): Promise<StoredRvfContainer[]> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.RVF_CONTAINERS, "readonly");
	const store = tx.objectStore(STORES.RVF_CONTAINERS);

	return new Promise((resolve, reject) => {
		const request = store.getAll();
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Delete an RVF container
 */
export async function deleteRvfContainer(id: string): Promise<void> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.RVF_CONTAINERS, "readwrite");
	const store = tx.objectStore(STORES.RVF_CONTAINERS);

	return new Promise((resolve, reject) => {
		const request = store.delete(id);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

// ---------------------------------------------------------------------------
// Settings Operations
// ---------------------------------------------------------------------------

/**
 * Get a setting value
 */
export async function getSetting<T>(key: string): Promise<T | null> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.SETTINGS, "readonly");
	const store = tx.objectStore(STORES.SETTINGS);

	return new Promise((resolve, reject) => {
		const request = store.get(key);
		request.onsuccess = () => resolve(request.result?.value ?? null);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Set a setting value
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.SETTINGS, "readwrite");
	const store = tx.objectStore(STORES.SETTINGS);

	return new Promise((resolve, reject) => {
		const request = store.put({ key, value });
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

// ---------------------------------------------------------------------------
// Session Operations
// ---------------------------------------------------------------------------

/**
 * Save a session
 */
export async function saveSession(session: StoredSession): Promise<void> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.SESSIONS, "readwrite");
	const store = tx.objectStore(STORES.SESSIONS);

	session.updatedAt = Date.now();

	return new Promise((resolve, reject) => {
		const request = store.put(session);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/**
 * Load a session
 */
export async function loadSession(id: string): Promise<StoredSession | null> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.SESSIONS, "readonly");
	const store = tx.objectStore(STORES.SESSIONS);

	return new Promise((resolve, reject) => {
		const request = store.get(id);
		request.onsuccess = () => resolve(request.result ?? null);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Get the most recent session
 */
export async function getLatestSession(): Promise<StoredSession | null> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.SESSIONS, "readonly");
	const store = tx.objectStore(STORES.SESSIONS);
	const index = store.index("updatedAt");

	return new Promise((resolve, reject) => {
		const request = index.openCursor(null, "prev");
		request.onsuccess = () => {
			const cursor = request.result;
			resolve(cursor?.value ?? null);
		};
		request.onerror = () => reject(request.error);
	});
}

/**
 * Delete a session
 */
export async function deleteSession(id: string): Promise<void> {
	const database = await openDatabase();
	const tx = database.transaction(STORES.SESSIONS, "readwrite");
	const store = tx.objectStore(STORES.SESSIONS);

	return new Promise((resolve, reject) => {
		const request = store.delete(id);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}
