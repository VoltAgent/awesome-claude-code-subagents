/**
 * PostgreSQL adapter for RuVocal — drop-in replacement for MongoDB collections.
 *
 * Implements the MongoDB Collection interface used by HF Chat UI,
 * translating find/insert/update/delete/aggregate calls to SQL.
 *
 * Uses the `pg` driver with connection pooling. ObjectId fields are
 * mapped to UUID. Messages remain embedded in conversations as JSONB
 * to minimise upstream diff.
 */

import pg from "pg";
import { randomUUID } from "crypto";
import { logger } from "$lib/server/logger";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
	if (!pool) {
		const connectionString =
			process.env.DATABASE_URL ||
			"postgresql://ruvocal:ruvocal@localhost:5432/ruvocal";
		pool = new Pool({
			connectionString,
			max: 20,
			idleTimeoutMillis: 30_000,
			connectionTimeoutMillis: 5_000,
		});
		pool.on("error", (err) => logger.error(err, "Postgres pool error"));
	}
	return pool;
}

export async function closePool(): Promise<void> {
	if (pool) {
		await pool.end();
		pool = null;
	}
}

// ---------------------------------------------------------------------------
// ObjectId compatibility
// ---------------------------------------------------------------------------

/**
 * Minimal ObjectId stand-in that wraps a UUID string.
 * MongoDB's ObjectId is a 24-hex-char string; we use UUID v4 instead.
 */
export class ObjectId {
	private _id: string;
	constructor(id?: string) {
		this._id = id ?? randomUUID();
	}
	toString() {
		return this._id;
	}
	toHexString() {
		return this._id;
	}
	equals(other: ObjectId | string) {
		const otherStr = typeof other === "string" ? other : other.toString();
		return this._id === otherStr;
	}
	toJSON() {
		return this._id;
	}
	static createFromHexString(hex: string) {
		return new ObjectId(hex);
	}
}

// ---------------------------------------------------------------------------
// MongoDB-compatible filter → SQL WHERE
// ---------------------------------------------------------------------------

interface FilterOp {
	text: string;
	values: unknown[];
}

function filterToWhere(
	filter: Record<string, unknown>,
	startIdx = 1
): FilterOp {
	const clauses: string[] = [];
	const values: unknown[] = [];
	let idx = startIdx;

	for (const [key, val] of Object.entries(filter)) {
		if (key === "$or" && Array.isArray(val)) {
			const orClauses: string[] = [];
			for (const sub of val) {
				const r = filterToWhere(sub as Record<string, unknown>, idx);
				orClauses.push(`(${r.text})`);
				values.push(...r.values);
				idx += r.values.length;
			}
			clauses.push(`(${orClauses.join(" OR ")})`);
			continue;
		}

		if (key === "$and" && Array.isArray(val)) {
			for (const sub of val) {
				const r = filterToWhere(sub as Record<string, unknown>, idx);
				clauses.push(`(${r.text})`);
				values.push(...r.values);
				idx += r.values.length;
			}
			continue;
		}

		// Nested dot notation → JSONB path
		const col = key.includes(".") ? jsonbPath(key) : `"${snakeCase(key)}"`;

		if (val === null || val === undefined) {
			clauses.push(`${col} IS NULL`);
		} else if (typeof val === "object" && !Array.isArray(val) && !(val instanceof ObjectId)) {
			const ops = val as Record<string, unknown>;
			for (const [op, opVal] of Object.entries(ops)) {
				switch (op) {
					case "$exists":
						clauses.push(
							opVal ? `${col} IS NOT NULL` : `${col} IS NULL`
						);
						break;
					case "$gt":
						clauses.push(`${col} > $${idx++}`);
						values.push(opVal);
						break;
					case "$gte":
						clauses.push(`${col} >= $${idx++}`);
						values.push(opVal);
						break;
					case "$lt":
						clauses.push(`${col} < $${idx++}`);
						values.push(opVal);
						break;
					case "$lte":
						clauses.push(`${col} <= $${idx++}`);
						values.push(opVal);
						break;
					case "$ne":
						clauses.push(`${col} != $${idx++}`);
						values.push(opVal);
						break;
					case "$in":
						clauses.push(`${col} = ANY($${idx++})`);
						values.push(opVal);
						break;
					case "$nin":
						clauses.push(`${col} != ALL($${idx++})`);
						values.push(opVal);
						break;
					case "$regex": {
						const flags =
							ops.$options === "i" ? "~*" : "~";
						clauses.push(`${col}::text ${flags} $${idx++}`);
						values.push(opVal);
						break;
					}
					default:
						logger.warn(`Unknown filter operator: ${op}`);
				}
			}
		} else {
			const v = val instanceof ObjectId ? val.toString() : val;
			clauses.push(`${col} = $${idx++}`);
			values.push(v);
		}
	}

	return {
		text: clauses.length > 0 ? clauses.join(" AND ") : "TRUE",
		values,
	};
}

function snakeCase(s: string): string {
	// Common MongoDB field → Postgres column mappings
	const map: Record<string, string> = {
		_id: "_id",
		sessionId: "session_id",
		userId: "user_id",
		hfUserId: "hf_user_id",
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
		expiresAt: "expires_at",
		deleteAt: "delete_at",
		conversationId: "conversation_id",
		assistantId: "assistant_id",
		createdById: "created_by_id",
		createdByName: "created_by_name",
		modelId: "model_id",
		userCount: "user_count",
		useCount: "use_count",
		searchTokens: "search_tokens",
		last24HoursCount: "last24_hours_count",
		last24HoursUseCount: "last24_hours_use_count",
		rootMessageId: "root_message_id",
		tokenHash: "token_hash",
		avatarUrl: "avatar_url",
		isAdmin: "is_admin",
		isEarlyAccess: "is_early_access",
		contentId: "content_id",
		eventType: "event_type",
		messageId: "message_id",
		dateField: "date_field",
		dateSpan: "date_span",
		dateAt: "date_at",
	};
	return map[s] ?? s.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function jsonbPath(dotPath: string): string {
	const parts = dotPath.split(".");
	const col = `"${snakeCase(parts[0])}"`;
	if (parts.length === 1) return col;
	// JSONB deep access: data->'messages'->>'from'
	const jsonParts = parts.slice(1);
	const last = jsonParts.pop()!;
	let expr = col;
	for (const p of jsonParts) {
		expr += `->'${p}'`;
	}
	expr += `->>'${last}'`;
	return expr;
}

// ---------------------------------------------------------------------------
// MongoDB-compatible update → SQL SET
// ---------------------------------------------------------------------------

interface UpdateOp {
	setClauses: string[];
	values: unknown[];
}

function updateToSet(
	update: Record<string, unknown>,
	startIdx: number
): UpdateOp {
	const setClauses: string[] = [];
	const values: unknown[] = [];
	let idx = startIdx;

	const setFields =
		(update.$set as Record<string, unknown>) ?? update;

	// If update has no operators, treat the whole thing as $set
	const hasOperators = Object.keys(update).some((k) => k.startsWith("$"));
	const fields = hasOperators
		? (update.$set as Record<string, unknown>) ?? {}
		: update;

	for (const [key, val] of Object.entries(fields)) {
		if (key === "_id") continue; // never update PK
		const col = snakeCase(key);
		const v = val instanceof ObjectId ? val.toString() : val;
		if (typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date)) {
			setClauses.push(`"${col}" = $${idx++}::jsonb`);
			values.push(JSON.stringify(v));
		} else {
			setClauses.push(`"${col}" = $${idx++}`);
			values.push(v);
		}
	}

	// Handle $push (append to JSONB array)
	if (update.$push) {
		for (const [key, val] of Object.entries(
			update.$push as Record<string, unknown>
		)) {
			const col = snakeCase(key);
			if (typeof val === "object" && val !== null && "$each" in (val as Record<string, unknown>)) {
				const each = (val as Record<string, unknown>).$each as unknown[];
				setClauses.push(
					`"${col}" = "${col}" || $${idx++}::jsonb`
				);
				values.push(JSON.stringify(each));
			} else {
				setClauses.push(
					`"${col}" = COALESCE("${col}", '[]'::jsonb) || $${idx++}::jsonb`
				);
				values.push(JSON.stringify([val]));
			}
		}
	}

	// Handle $inc
	if (update.$inc) {
		for (const [key, val] of Object.entries(
			update.$inc as Record<string, number>
		)) {
			const col = snakeCase(key);
			setClauses.push(`"${col}" = COALESCE("${col}", 0) + $${idx++}`);
			values.push(val);
		}
	}

	// Handle $unset
	if (update.$unset) {
		for (const key of Object.keys(update.$unset as Record<string, unknown>)) {
			const col = snakeCase(key);
			setClauses.push(`"${col}" = NULL`);
		}
	}

	// Always update updated_at
	if (!setClauses.some((c) => c.includes('"updated_at"'))) {
		setClauses.push(`"updated_at" = NOW()`);
	}

	return { setClauses, values };
}

// ---------------------------------------------------------------------------
// Sort/limit/skip helpers
// ---------------------------------------------------------------------------

function sortToOrderBy(sort: Record<string, 1 | -1>): string {
	const parts = Object.entries(sort).map(([key, dir]) => {
		const col = key.includes(".")
			? jsonbPath(key)
			: `"${snakeCase(key)}"`;
		return `${col} ${dir === -1 ? "DESC" : "ASC"}`;
	});
	return parts.length > 0 ? `ORDER BY ${parts.join(", ")}` : "";
}

// ---------------------------------------------------------------------------
// PostgresCollection — MongoDB Collection interface
// ---------------------------------------------------------------------------

export interface FindOptions {
	sort?: Record<string, 1 | -1>;
	limit?: number;
	skip?: number;
	projection?: Record<string, 0 | 1>;
}

export class PostgresCollection<T extends Record<string, unknown>> {
	constructor(public readonly tableName: string) {}

	private get pool() {
		return getPool();
	}

	// Convert Postgres row (snake_case) back to camelCase for app
	private rowToDoc(row: Record<string, unknown>): T {
		// For now, return as-is — the app code uses camelCase field names
		// but we store snake_case. We rely on column aliases or a transform.
		// Since HF Chat UI accesses fields via MongoDB collection refs,
		// we need the row to look like a MongoDB document.
		const doc: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(row)) {
			doc[camelCase(key)] = val;
		}
		return doc as T;
	}

	async findOne(filter: Record<string, unknown> = {}): Promise<T | null> {
		const w = filterToWhere(filter);
		const sql = `SELECT * FROM "${this.tableName}" WHERE ${w.text} LIMIT 1`;
		const result = await this.pool.query(sql, w.values);
		return result.rows.length > 0 ? this.rowToDoc(result.rows[0]) : null;
	}

	find(
		filter: Record<string, unknown> = {},
		options: FindOptions = {}
	): PostgresCursor<T> {
		return new PostgresCursor<T>(this, filter, options);
	}

	async insertOne(
		doc: Partial<T> & Record<string, unknown>
	): Promise<{ insertedId: ObjectId; acknowledged: boolean }> {
		const id = doc._id
			? typeof doc._id === "string"
				? doc._id
				: (doc._id as ObjectId).toString()
			: randomUUID();

		const entries = Object.entries(doc).filter(([k]) => k !== "_id");
		const cols = ["_id", ...entries.map(([k]) => `"${snakeCase(k)}"`)];
		const placeholders = [
			"$1",
			...entries.map((_, i) => `$${i + 2}`),
		];
		const values: unknown[] = [
			id,
			...entries.map(([, v]) => {
				if (v instanceof ObjectId) return v.toString();
				if (typeof v === "object" && v !== null && !(v instanceof Date) && !Array.isArray(v))
					return JSON.stringify(v);
				if (Array.isArray(v)) return JSON.stringify(v);
				return v;
			}),
		];

		const sql = `INSERT INTO "${this.tableName}" (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT DO NOTHING RETURNING _id`;
		await this.pool.query(sql, values);
		return { insertedId: new ObjectId(id), acknowledged: true };
	}

	async insertMany(
		docs: Array<Partial<T> & Record<string, unknown>>
	): Promise<{ insertedIds: ObjectId[]; acknowledged: boolean }> {
		const ids: ObjectId[] = [];
		for (const doc of docs) {
			const result = await this.insertOne(doc);
			ids.push(result.insertedId);
		}
		return { insertedIds: ids, acknowledged: true };
	}

	async updateOne(
		filter: Record<string, unknown>,
		update: Record<string, unknown>
	): Promise<{ matchedCount: number; modifiedCount: number; acknowledged: boolean }> {
		const w = filterToWhere(filter);
		const u = updateToSet(update, w.values.length + 1);
		if (u.setClauses.length === 0) {
			return { matchedCount: 0, modifiedCount: 0, acknowledged: true };
		}
		const sql = `UPDATE "${this.tableName}" SET ${u.setClauses.join(", ")} WHERE ${w.text}`;
		const result = await this.pool.query(sql, [...w.values, ...u.values]);
		const count = result.rowCount ?? 0;
		return { matchedCount: count, modifiedCount: count, acknowledged: true };
	}

	async updateMany(
		filter: Record<string, unknown>,
		update: Record<string, unknown>
	): Promise<{ matchedCount: number; modifiedCount: number; acknowledged: boolean }> {
		return this.updateOne(filter, update); // same SQL, no LIMIT 1
	}

	async deleteOne(
		filter: Record<string, unknown>
	): Promise<{ deletedCount: number; acknowledged: boolean }> {
		const w = filterToWhere(filter);
		const sql = `DELETE FROM "${this.tableName}" WHERE ${w.text}`;
		const result = await this.pool.query(sql, w.values);
		return { deletedCount: result.rowCount ?? 0, acknowledged: true };
	}

	async deleteMany(
		filter: Record<string, unknown>
	): Promise<{ deletedCount: number; acknowledged: boolean }> {
		return this.deleteOne(filter);
	}

	async countDocuments(
		filter: Record<string, unknown> = {}
	): Promise<number> {
		const w = filterToWhere(filter);
		const sql = `SELECT COUNT(*)::int AS count FROM "${this.tableName}" WHERE ${w.text}`;
		const result = await this.pool.query(sql, w.values);
		return result.rows[0]?.count ?? 0;
	}

	async distinct(
		field: string,
		filter: Record<string, unknown> = {}
	): Promise<unknown[]> {
		const col = `"${snakeCase(field)}"`;
		const w = filterToWhere(filter);
		const sql = `SELECT DISTINCT ${col} FROM "${this.tableName}" WHERE ${w.text}`;
		const result = await this.pool.query(sql, w.values);
		return result.rows.map((r) => r[snakeCase(field)]);
	}

	async aggregate(pipeline: Record<string, unknown>[]): Promise<T[]> {
		// Basic aggregation support — handle common patterns
		// For complex pipelines, we'd need a full translator.
		// For now, log a warning and return empty.
		logger.warn(
			{ pipeline, table: this.tableName },
			"aggregate() called — basic translation only"
		);
		return [];
	}

	async createIndex(
		_spec: Record<string, unknown>,
		_options?: Record<string, unknown>
	): Promise<void> {
		// Indexes are pre-created in the migration. This is a no-op.
	}

	async findOneAndUpdate(
		filter: Record<string, unknown>,
		update: Record<string, unknown>,
		options?: { upsert?: boolean; returnDocument?: "before" | "after" }
	): Promise<{ value: T | null }> {
		if (options?.upsert) {
			const existing = await this.findOne(filter);
			if (!existing) {
				const doc = { ...filter, ...((update.$set as Record<string, unknown>) ?? update) };
				await this.insertOne(doc as Partial<T> & Record<string, unknown>);
				const inserted = await this.findOne(filter);
				return { value: inserted };
			}
		}
		await this.updateOne(filter, update);
		const updated = await this.findOne(filter);
		return { value: updated };
	}

	async findOneAndDelete(
		filter: Record<string, unknown>
	): Promise<{ value: T | null }> {
		const doc = await this.findOne(filter);
		if (doc) await this.deleteOne(filter);
		return { value: doc };
	}

	// RuVector extension: semantic search via pgvector
	async semanticSearch(
		queryEmbedding: number[],
		limit = 10,
		filter: Record<string, unknown> = {}
	): Promise<Array<T & { similarity: number }>> {
		const w = filterToWhere(filter);
		const embIdx = w.values.length + 1;
		const limIdx = embIdx + 1;
		const sql = `
			SELECT *, 1 - (embedding <=> $${embIdx}::vector) AS similarity
			FROM "${this.tableName}"
			WHERE ${w.text} AND embedding IS NOT NULL
			ORDER BY embedding <=> $${embIdx}::vector
			LIMIT $${limIdx}
		`;
		const result = await this.pool.query(sql, [
			...w.values,
			`[${queryEmbedding.join(",")}]`,
			limit,
		]);
		return result.rows.map((r) => ({ ...this.rowToDoc(r), similarity: r.similarity }));
	}
}

// ---------------------------------------------------------------------------
// Cursor — implements MongoDB-like chaining (sort/limit/skip/toArray)
// ---------------------------------------------------------------------------

export class PostgresCursor<T extends Record<string, unknown>> {
	private _sort: Record<string, 1 | -1> = {};
	private _limit?: number;
	private _skip?: number;
	private _projection?: Record<string, 0 | 1>;

	constructor(
		private collection: PostgresCollection<T>,
		private filter: Record<string, unknown>,
		options: FindOptions = {}
	) {
		if (options.sort) this._sort = options.sort;
		if (options.limit) this._limit = options.limit;
		if (options.skip) this._skip = options.skip;
		if (options.projection) this._projection = options.projection;
	}

	sort(spec: Record<string, 1 | -1>): this {
		this._sort = { ...this._sort, ...spec };
		return this;
	}

	limit(n: number): this {
		this._limit = n;
		return this;
	}

	skip(n: number): this {
		this._skip = n;
		return this;
	}

	project(spec: Record<string, 0 | 1>): this {
		this._projection = spec;
		return this;
	}

	async toArray(): Promise<T[]> {
		const w = filterToWhere(this.filter);
		const order = sortToOrderBy(this._sort);
		let sql = `SELECT * FROM "${this.collection.tableName}" WHERE ${w.text} ${order}`;
		const values = [...w.values];
		if (this._limit !== undefined) {
			sql += ` LIMIT $${values.length + 1}`;
			values.push(this._limit);
		}
		if (this._skip !== undefined) {
			sql += ` OFFSET $${values.length + 1}`;
			values.push(this._skip);
		}
		const pool = getPool();
		const result = await pool.query(sql, values);
		return result.rows.map((row) => {
			const doc: Record<string, unknown> = {};
			for (const [key, val] of Object.entries(row)) {
				doc[camelCase(key)] = val;
			}
			return doc as T;
		});
	}

	// Async iterable support
	async *[Symbol.asyncIterator](): AsyncGenerator<T> {
		const rows = await this.toArray();
		for (const row of rows) {
			yield row;
		}
	}
}

// ---------------------------------------------------------------------------
// GridFS replacement — stores files as BYTEA in a `files` table
// ---------------------------------------------------------------------------

export class PostgresGridFSBucket {
	private readonly tableName = "files";

	async openUploadStream(
		filename: string,
		options?: { metadata?: Record<string, unknown>; contentType?: string }
	) {
		const id = randomUUID();
		const chunks: Buffer[] = [];

		return {
			id: new ObjectId(id),
			write(chunk: Buffer) {
				chunks.push(chunk);
			},
			async end() {
				const data = Buffer.concat(chunks);
				const pool = getPool();
				await pool.query(
					`INSERT INTO files (_id, filename, content_type, length, data, metadata) VALUES ($1, $2, $3, $4, $5, $6)`,
					[
						id,
						filename,
						options?.contentType ?? "application/octet-stream",
						data.length,
						data,
						JSON.stringify(options?.metadata ?? {}),
					]
				);
			},
		};
	}

	openDownloadStream(id: ObjectId | string) {
		const fileId = typeof id === "string" ? id : id.toString();
		// Return a readable-like object
		return {
			async toArray(): Promise<Buffer[]> {
				const pool = getPool();
				const result = await pool.query(
					`SELECT data FROM files WHERE _id = $1`,
					[fileId]
				);
				if (result.rows.length === 0) throw new Error("File not found");
				return [result.rows[0].data];
			},
		};
	}

	async delete(id: ObjectId | string) {
		const fileId = typeof id === "string" ? id : id.toString();
		const pool = getPool();
		await pool.query(`DELETE FROM files WHERE _id = $1`, [fileId]);
	}

	async find(filter: Record<string, unknown> = {}) {
		const w = filterToWhere(filter);
		const pool = getPool();
		const result = await pool.query(
			`SELECT _id, filename, content_type, length, metadata, created_at FROM files WHERE ${w.text}`,
			w.values
		);
		return {
			toArray: async () => result.rows,
		};
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function camelCase(s: string): string {
	if (s === "_id") return "_id";
	return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
