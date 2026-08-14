import { describe, expect, it, beforeEach, afterAll } from "vitest";
import {
	RvfCollection,
	RvfGridFSBucket,
	ObjectId,
	initRvfStore,
	flushToDisk,
	enableMultiTenant,
	listTenants,
	getTenantStats,
} from "../rvf";
import { existsSync, unlinkSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestDoc {
	_id?: string;
	name: string;
	age?: number;
	tags?: string[];
	createdAt?: Date;
	updatedAt?: Date;
	nested?: { field: string };
}

const TEST_DB_PATH = join(tmpdir(), `rvf-test-${randomUUID()}.json`);

beforeEach(() => {
	// Re-initialize for a fresh store each test
	initRvfStore("");
});

afterAll(() => {
	if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

describe("RvfCollection CRUD", () => {
	it("insertOne and findOne", async () => {
		const coll = new RvfCollection<TestDoc>("test_crud");
		const result = await coll.insertOne({ name: "Alice", age: 30 });
		expect(result.acknowledged).toBe(true);
		expect(result.insertedId).toBeDefined();

		const found = await coll.findOne({ name: "Alice" });
		expect(found).not.toBeNull();
		expect(found!.name).toBe("Alice");
		expect(found!.age).toBe(30);
	});

	it("insertMany and find with toArray", async () => {
		const coll = new RvfCollection<TestDoc>("test_insertmany");
		await coll.insertMany([
			{ name: "Bob", age: 25 },
			{ name: "Carol", age: 35 },
			{ name: "Dave", age: 28 },
		]);

		const all = await coll.find({}).toArray();
		expect(all).toHaveLength(3);
	});

	it("updateOne with $set", async () => {
		const coll = new RvfCollection<TestDoc>("test_update");
		await coll.insertOne({ name: "Eve", age: 22 });
		const result = await coll.updateOne({ name: "Eve" }, { $set: { age: 23 } });
		expect(result.matchedCount).toBe(1);
		expect(result.modifiedCount).toBe(1);

		const updated = await coll.findOne({ name: "Eve" });
		expect(updated!.age).toBe(23);
	});

	it("updateOne with upsert", async () => {
		const coll = new RvfCollection<TestDoc>("test_upsert");
		const result = await coll.updateOne(
			{ name: "Frank" },
			{ $set: { age: 40 } },
			{ upsert: true }
		);
		expect(result.upsertedCount).toBe(1);

		const found = await coll.findOne({ name: "Frank" });
		expect(found).not.toBeNull();
		expect(found!.age).toBe(40);
	});

	it("updateOne with $setOnInsert during upsert", async () => {
		const coll = new RvfCollection<TestDoc>("test_setoninsert");
		await coll.updateOne(
			{ name: "Grace" },
			{ $set: { age: 50 }, $setOnInsert: { tags: ["new"] } },
			{ upsert: true }
		);

		const found = await coll.findOne({ name: "Grace" });
		expect(found!.tags).toEqual(["new"]);
	});

	it("updateMany", async () => {
		const coll = new RvfCollection<TestDoc>("test_updatemany");
		await coll.insertMany([
			{ name: "A", age: 20 },
			{ name: "B", age: 20 },
			{ name: "C", age: 30 },
		]);

		const result = await coll.updateMany({ age: 20 }, { $set: { age: 21 } });
		expect(result.matchedCount).toBe(2);
		expect(result.modifiedCount).toBe(2);
	});

	it("deleteOne", async () => {
		const coll = new RvfCollection<TestDoc>("test_delete");
		await coll.insertOne({ name: "ToDelete", age: 99 });
		const result = await coll.deleteOne({ name: "ToDelete" });
		expect(result.deletedCount).toBe(1);

		const found = await coll.findOne({ name: "ToDelete" });
		expect(found).toBeNull();
	});

	it("deleteMany", async () => {
		const coll = new RvfCollection<TestDoc>("test_deletemany");
		await coll.insertMany([
			{ name: "X", age: 10 },
			{ name: "Y", age: 10 },
			{ name: "Z", age: 20 },
		]);

		const result = await coll.deleteMany({ age: 10 });
		expect(result.deletedCount).toBe(2);
		expect(await coll.countDocuments({})).toBe(1);
	});

	it("countDocuments", async () => {
		const coll = new RvfCollection<TestDoc>("test_count");
		await coll.insertMany([
			{ name: "A", age: 1 },
			{ name: "B", age: 2 },
			{ name: "C", age: 3 },
		]);

		expect(await coll.countDocuments({})).toBe(3);
		expect(await coll.countDocuments({ age: { $gt: 1 } })).toBe(2);
	});

	it("distinct", async () => {
		const coll = new RvfCollection<TestDoc>("test_distinct");
		await coll.insertMany([
			{ name: "A", age: 10 },
			{ name: "B", age: 20 },
			{ name: "C", age: 10 },
		]);

		const ages = await coll.distinct("age");
		expect(ages.sort()).toEqual([10, 20]);
	});

	it("findOneAndUpdate", async () => {
		const coll = new RvfCollection<TestDoc>("test_findoneupdate");
		await coll.insertOne({ name: "Hank", age: 45 });

		const result = await coll.findOneAndUpdate(
			{ name: "Hank" },
			{ $set: { age: 46 } },
			{ returnDocument: "after" }
		);
		expect(result.value).not.toBeNull();
		expect(result.value!.age).toBe(46);
	});

	it("findOneAndDelete", async () => {
		const coll = new RvfCollection<TestDoc>("test_findonedelete");
		await coll.insertOne({ name: "Ivan", age: 60 });

		const result = await coll.findOneAndDelete({ name: "Ivan" });
		expect(result.value).not.toBeNull();
		expect(result.value!.name).toBe("Ivan");
		expect(await coll.countDocuments({})).toBe(0);
	});

	it("bulkWrite", async () => {
		const coll = new RvfCollection<TestDoc>("test_bulkwrite");
		await coll.insertMany([
			{ name: "A", age: 1 },
			{ name: "B", age: 2 },
		]);

		await coll.bulkWrite([
			{ updateOne: { filter: { name: "A" }, update: { $set: { age: 10 } } } },
			{ updateOne: { filter: { name: "B" }, update: { $set: { age: 20 } } } },
		]);

		expect((await coll.findOne({ name: "A" }))!.age).toBe(10);
		expect((await coll.findOne({ name: "B" }))!.age).toBe(20);
	});
});

// ---------------------------------------------------------------------------
// Query operators
// ---------------------------------------------------------------------------

describe("Query operators", () => {
	it("$gt, $gte, $lt, $lte", async () => {
		const coll = new RvfCollection<TestDoc>("test_comparison");
		await coll.insertMany([
			{ name: "A", age: 10 },
			{ name: "B", age: 20 },
			{ name: "C", age: 30 },
		]);

		expect(await coll.countDocuments({ age: { $gt: 15 } })).toBe(2);
		expect(await coll.countDocuments({ age: { $gte: 20 } })).toBe(2);
		expect(await coll.countDocuments({ age: { $lt: 25 } })).toBe(2);
		expect(await coll.countDocuments({ age: { $lte: 20 } })).toBe(2);
	});

	it("$ne", async () => {
		const coll = new RvfCollection<TestDoc>("test_ne");
		await coll.insertMany([
			{ name: "A", age: 10 },
			{ name: "B", age: 20 },
		]);

		expect(await coll.countDocuments({ age: { $ne: 10 } })).toBe(1);
	});

	it("$in and $nin", async () => {
		const coll = new RvfCollection<TestDoc>("test_in");
		await coll.insertMany([
			{ name: "A", age: 10 },
			{ name: "B", age: 20 },
			{ name: "C", age: 30 },
		]);

		expect(await coll.countDocuments({ age: { $in: [10, 30] } })).toBe(2);
		expect(await coll.countDocuments({ age: { $nin: [10, 30] } })).toBe(1);
	});

	it("$exists", async () => {
		const coll = new RvfCollection<TestDoc>("test_exists");
		await coll.insertMany([
			{ name: "A", tags: ["x"] },
			{ name: "B" },
		]);

		expect(await coll.countDocuments({ tags: { $exists: true } })).toBe(1);
		expect(await coll.countDocuments({ tags: { $exists: false } })).toBe(1);
	});

	it("$or and $and", async () => {
		const coll = new RvfCollection<TestDoc>("test_logical");
		await coll.insertMany([
			{ name: "A", age: 10 },
			{ name: "B", age: 20 },
			{ name: "C", age: 30 },
		]);

		expect(await coll.countDocuments({ $or: [{ age: 10 }, { age: 30 }] })).toBe(2);
		expect(
			await coll.countDocuments({ $and: [{ age: { $gte: 10 } }, { age: { $lte: 20 } }] })
		).toBe(2);
	});

	it("$regex", async () => {
		const coll = new RvfCollection<TestDoc>("test_regex");
		await coll.insertMany([
			{ name: "Alice" },
			{ name: "Bob" },
			{ name: "alicia" },
		]);

		expect(await coll.countDocuments({ name: { $regex: "ali", $options: "i" } })).toBe(2);
	});

	it("$not", async () => {
		const coll = new RvfCollection<TestDoc>("test_not");
		await coll.insertMany([
			{ name: "A", age: 10 },
			{ name: "B", age: 20 },
		]);

		expect(await coll.countDocuments({ age: { $not: { $gt: 15 } } })).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Update operators
// ---------------------------------------------------------------------------

describe("Update operators", () => {
	it("$inc", async () => {
		const coll = new RvfCollection<TestDoc>("test_inc");
		await coll.insertOne({ name: "Counter", age: 0 });
		await coll.updateOne({ name: "Counter" }, { $inc: { age: 5 } });
		expect((await coll.findOne({ name: "Counter" }))!.age).toBe(5);
	});

	it("$push", async () => {
		const coll = new RvfCollection<TestDoc>("test_push");
		await coll.insertOne({ name: "Tags", tags: ["a"] });
		await coll.updateOne({ name: "Tags" }, { $push: { tags: "b" } });
		expect((await coll.findOne({ name: "Tags" }))!.tags).toEqual(["a", "b"]);
	});

	it("$push with $each", async () => {
		const coll = new RvfCollection<TestDoc>("test_push_each");
		await coll.insertOne({ name: "Tags", tags: [] });
		await coll.updateOne({ name: "Tags" }, { $push: { tags: { $each: ["x", "y"] } } });
		expect((await coll.findOne({ name: "Tags" }))!.tags).toEqual(["x", "y"]);
	});

	it("$pull", async () => {
		const coll = new RvfCollection<TestDoc>("test_pull");
		await coll.insertOne({ name: "Tags", tags: ["a", "b", "c"] });
		await coll.updateOne({ name: "Tags" }, { $pull: { tags: "b" } });
		expect((await coll.findOne({ name: "Tags" }))!.tags).toEqual(["a", "c"]);
	});

	it("$addToSet", async () => {
		const coll = new RvfCollection<TestDoc>("test_addtoset");
		await coll.insertOne({ name: "Tags", tags: ["a"] });
		await coll.updateOne({ name: "Tags" }, { $addToSet: { tags: "a" } });
		expect((await coll.findOne({ name: "Tags" }))!.tags).toEqual(["a"]);
		await coll.updateOne({ name: "Tags" }, { $addToSet: { tags: "b" } });
		expect((await coll.findOne({ name: "Tags" }))!.tags).toEqual(["a", "b"]);
	});

	it("$unset", async () => {
		const coll = new RvfCollection<TestDoc>("test_unset");
		await coll.insertOne({ name: "Nested", nested: { field: "val" } });
		await coll.updateOne({ name: "Nested" }, { $unset: { nested: "" } });
		const doc = await coll.findOne({ name: "Nested" });
		expect(doc!.nested).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Cursor operations
// ---------------------------------------------------------------------------

describe("Cursor", () => {
	it("sort, limit, skip", async () => {
		const coll = new RvfCollection<TestDoc>("test_cursor");
		await coll.insertMany([
			{ name: "A", age: 30 },
			{ name: "B", age: 10 },
			{ name: "C", age: 20 },
		]);

		const sorted = await coll.find({}).sort({ age: 1 }).toArray();
		expect(sorted.map((d) => d.age)).toEqual([10, 20, 30]);

		const limited = await coll.find({}).sort({ age: 1 }).limit(2).toArray();
		expect(limited).toHaveLength(2);

		const skipped = await coll.find({}).sort({ age: 1 }).skip(1).limit(1).toArray();
		expect(skipped[0].age).toBe(20);
	});

	it("async iterator", async () => {
		const coll = new RvfCollection<TestDoc>("test_asynciter");
		await coll.insertMany([{ name: "X" }, { name: "Y" }]);

		const names: string[] = [];
		for await (const doc of coll.find({})) {
			names.push(doc.name);
		}
		expect(names).toHaveLength(2);
	});

	it("tryNext / hasNext / next", async () => {
		const coll = new RvfCollection<TestDoc>("test_trynext");
		await coll.insertMany([{ name: "A" }, { name: "B" }]);

		const cursor = coll.find({});
		expect(await cursor.hasNext()).toBe(true);
		const first = await cursor.next();
		expect(first).not.toBeNull();
		const second = await cursor.tryNext();
		expect(second).not.toBeNull();
		const third = await cursor.tryNext();
		expect(third).toBeNull();
	});

	it("map transforms results", async () => {
		const coll = new RvfCollection<TestDoc>("test_map");
		await coll.insertMany([{ name: "A", age: 10 }, { name: "B", age: 20 }]);

		const names = await coll.find({}).map((doc) => doc.name).toArray();
		expect(names).toEqual(expect.arrayContaining(["A", "B"]));
	});
});

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

describe("Aggregation", () => {
	it("$match + $sort + $limit", async () => {
		const coll = new RvfCollection<TestDoc>("test_agg");
		await coll.insertMany([
			{ name: "A", age: 10 },
			{ name: "B", age: 20 },
			{ name: "C", age: 30 },
		]);

		const result = await coll
			.aggregate([{ $match: { age: { $gte: 15 } } }, { $sort: { age: -1 } }, { $limit: 1 }])
			.toArray();
		expect(result).toHaveLength(1);
		expect(result[0].age).toBe(30);
	});

	it("aggregate().next()", async () => {
		const coll = new RvfCollection<TestDoc>("test_agg_next");
		await coll.insertMany([{ name: "A", age: 10 }, { name: "B", age: 20 }]);

		const first = await coll.aggregate([{ $sort: { age: 1 } }]).next();
		expect(first).not.toBeNull();
		expect(first!.age).toBe(10);
	});

	it("$group with $sum", async () => {
		const coll = new RvfCollection<TestDoc>("test_agg_group");
		await coll.insertMany([
			{ name: "A", age: 10, tags: ["x"] },
			{ name: "B", age: 20, tags: ["x"] },
			{ name: "C", age: 30, tags: ["y"] },
		]);

		const result = await coll
			.aggregate([
				{ $group: { _id: null, totalAge: { $sum: "$age" }, count: { $sum: 1 } } },
			])
			.toArray();

		expect(result).toHaveLength(1);
		expect(result[0].totalAge).toBe(60);
		expect(result[0].count).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// GridFS replacement
// ---------------------------------------------------------------------------

describe("RvfGridFSBucket", () => {
	it("upload and download", async () => {
		const bucket = new RvfGridFSBucket();
		const stream = bucket.openUploadStream("test.txt", { contentType: "text/plain" });
		stream.write(Buffer.from("Hello, RVF!"));
		await stream.end();

		const chunks = await bucket.openDownloadStream(stream.id).toArray();
		expect(chunks).toHaveLength(1);
	});

	it("delete file", async () => {
		const bucket = new RvfGridFSBucket();
		const stream = bucket.openUploadStream("delete-me.txt");
		stream.write(Buffer.from("data"));
		await stream.end();

		await bucket.delete(stream.id);
		await expect(bucket.openDownloadStream(stream.id).toArray()).rejects.toThrow("File not found");
	});
});

// ---------------------------------------------------------------------------
// Multi-tenant
// ---------------------------------------------------------------------------

describe("Multi-tenant", () => {
	it("tenant-scoped collections are isolated", async () => {
		enableMultiTenant(true);
		const coll = new RvfCollection<TestDoc>("shared_coll");

		const tenantA = coll.forTenant("tenant-a");
		const tenantB = coll.forTenant("tenant-b");

		await tenantA.insertOne({ name: "Alice" });
		await tenantB.insertOne({ name: "Bob" });

		expect(await tenantA.countDocuments({})).toBe(1);
		expect(await tenantB.countDocuments({})).toBe(1);
		expect((await tenantA.findOne({}))!.name).toBe("Alice");
		expect((await tenantB.findOne({}))!.name).toBe("Bob");

		// Global collection should be empty (tenants don't pollute it)
		expect(await coll.countDocuments({})).toBe(0);
	});

	it("listTenants and getTenantStats", async () => {
		enableMultiTenant(true);
		const coll = new RvfCollection<TestDoc>("stats_coll");

		await coll.forTenant("t1").insertMany([{ name: "A" }, { name: "B" }]);
		await coll.forTenant("t2").insertOne({ name: "C" });

		expect(listTenants()).toContain("t1");
		expect(listTenants()).toContain("t2");

		const stats = getTenantStats();
		expect(stats["t1"].documents).toBe(2);
		expect(stats["t2"].documents).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe("Persistence", () => {
	it("flush to disk and reload", async () => {
		initRvfStore(TEST_DB_PATH);
		const coll = new RvfCollection<TestDoc>("persist_test");
		await coll.insertMany([
			{ name: "Persisted1", age: 1 },
			{ name: "Persisted2", age: 2 },
		]);

		flushToDisk();
		expect(existsSync(TEST_DB_PATH)).toBe(true);

		// Verify file structure
		const data = JSON.parse(readFileSync(TEST_DB_PATH, "utf-8"));
		expect(data.rvf_version).toBe("2.0");
		expect(data.format).toBe("rvf-database");
		expect(data.metadata.doc_count).toBeGreaterThan(0);

		// Reload from disk
		initRvfStore(TEST_DB_PATH);
		const coll2 = new RvfCollection<TestDoc>("persist_test");
		const docs = await coll2.find({}).toArray();
		expect(docs.length).toBe(2);
		expect(docs.find((d) => d.name === "Persisted1")).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// ObjectId
// ---------------------------------------------------------------------------

describe("ObjectId", () => {
	it("equals and toString", () => {
		const id = new ObjectId("abc-123");
		expect(id.toString()).toBe("abc-123");
		expect(id.equals("abc-123")).toBe(true);
		expect(id.equals(new ObjectId("abc-123"))).toBe(true);
		expect(id.equals(new ObjectId("xyz-999"))).toBe(false);
	});

	it("createFromHexString", () => {
		const id = ObjectId.createFromHexString("hex-val");
		expect(id.toString()).toBe("hex-val");
	});

	it("toJSON", () => {
		const id = new ObjectId("json-test");
		expect(JSON.stringify({ id })).toBe('{"id":"json-test"}');
	});
});

// ---------------------------------------------------------------------------
// Performance benchmark
// ---------------------------------------------------------------------------

describe("Performance benchmark", () => {
	it("insert 10,000 documents", async () => {
		const coll = new RvfCollection<TestDoc>("bench_insert");
		const docs = Array.from({ length: 10000 }, (_, i) => ({
			name: `user-${i}`,
			age: Math.floor(Math.random() * 100),
			tags: [`tag-${i % 10}`],
		}));

		const start = performance.now();
		await coll.insertMany(docs);
		const elapsed = performance.now() - start;

		console.log(`  Insert 10k docs: ${elapsed.toFixed(1)}ms`);
		expect(elapsed).toBeLessThan(5000); // Should be well under 5s
		expect(await coll.countDocuments({})).toBe(10000);
	});

	it("find with filter on 10k docs", async () => {
		const coll = new RvfCollection<TestDoc>("bench_find");
		await coll.insertMany(
			Array.from({ length: 10000 }, (_, i) => ({
				name: `user-${i}`,
				age: i % 100,
			}))
		);

		const start = performance.now();
		const results = await coll.find({ age: { $gte: 50, $lt: 60 } }).toArray();
		const elapsed = performance.now() - start;

		console.log(`  Find with range filter (10k): ${elapsed.toFixed(1)}ms (${results.length} results)`);
		expect(elapsed).toBeLessThan(1000);
		expect(results.length).toBe(1000); // 10% of 10k
	});

	it("updateMany on 10k docs", async () => {
		const coll = new RvfCollection<TestDoc>("bench_update");
		await coll.insertMany(
			Array.from({ length: 10000 }, (_, i) => ({
				name: `user-${i}`,
				age: i % 100,
			}))
		);

		const start = performance.now();
		const result = await coll.updateMany(
			{ age: { $lt: 50 } },
			{ $inc: { age: 100 } }
		);
		const elapsed = performance.now() - start;

		console.log(`  UpdateMany (5k matched): ${elapsed.toFixed(1)}ms`);
		expect(elapsed).toBeLessThan(3000);
		expect(result.matchedCount).toBe(5000);
	});

	it("aggregate pipeline on 10k docs", async () => {
		const coll = new RvfCollection<TestDoc>("bench_agg");
		await coll.insertMany(
			Array.from({ length: 10000 }, (_, i) => ({
				name: `user-${i}`,
				age: i % 100,
				tags: [`group-${i % 5}`],
			}))
		);

		const start = performance.now();
		const result = await coll
			.aggregate([
				{ $match: { age: { $gte: 25 } } },
				{ $sort: { age: -1 } },
				{ $limit: 100 },
			])
			.toArray();
		const elapsed = performance.now() - start;

		console.log(`  Aggregate (match+sort+limit): ${elapsed.toFixed(1)}ms`);
		expect(elapsed).toBeLessThan(2000);
		expect(result).toHaveLength(100);
	});

	it("concurrent read/write operations", async () => {
		const coll = new RvfCollection<TestDoc>("bench_concurrent");
		await coll.insertMany(
			Array.from({ length: 1000 }, (_, i) => ({ name: `user-${i}`, age: i }))
		);

		const start = performance.now();

		// Simulate concurrent operations
		await Promise.all([
			coll.find({ age: { $gt: 500 } }).toArray(),
			coll.updateMany({ age: { $lt: 100 } }, { $inc: { age: 1 } }),
			coll.countDocuments({ age: { $gte: 250, $lte: 750 } }),
			coll.find({}).sort({ age: -1 }).limit(10).toArray(),
			coll.distinct("age"),
		]);

		const elapsed = performance.now() - start;
		console.log(`  5 concurrent ops (1k docs): ${elapsed.toFixed(1)}ms`);
		expect(elapsed).toBeLessThan(2000);
	});

	it("multi-tenant isolation performance", async () => {
		enableMultiTenant(true);
		const coll = new RvfCollection<TestDoc>("bench_tenant");

		// Insert into 10 tenants, 1000 docs each
		const start = performance.now();
		for (let t = 0; t < 10; t++) {
			const tenant = coll.forTenant(`tenant-${t}`);
			await tenant.insertMany(
				Array.from({ length: 1000 }, (_, i) => ({ name: `t${t}-user-${i}`, age: i }))
			);
		}
		const insertElapsed = performance.now() - start;
		console.log(`  Multi-tenant insert (10 tenants × 1k): ${insertElapsed.toFixed(1)}ms`);

		// Query within single tenant should be fast
		const queryStart = performance.now();
		const tenantResults = await coll
			.forTenant("tenant-5")
			.find({ age: { $gt: 500 } })
			.toArray();
		const queryElapsed = performance.now() - queryStart;
		console.log(`  Single tenant query (1k docs): ${queryElapsed.toFixed(1)}ms (${tenantResults.length} results)`);

		expect(tenantResults.length).toBe(499);
		expect(queryElapsed).toBeLessThan(500);
	});
});
