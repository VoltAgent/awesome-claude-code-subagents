# ADR-038: RuVocal — HF Chat UI Fork with Self-Contained RVF Document Store

**Status:** Implemented
**Date:** 2026-03-05
**Updated:** 2026-03-05
**Related:** ADR-029 (HF Chat UI Integration), ADR-035 (MCP Tool Groups), ADR-037 (Autopilot Mode)

## Context

The current `chat-ui-mcp` package uses the upstream HuggingFace Chat UI (`ghcr.io/huggingface/chat-ui-db:latest`) which bundles MongoDB for conversation storage. This creates several problems:

1. **External dependency** — MongoDB requires a running server, connection management, and separate backup strategy.
2. **Container bloat** — MongoDB adds ~500MB to the container image.
3. **Upstream lock-in** — Using a pre-built Docker image means we can't modify the SvelteKit app.
4. **Operational complexity** — Two databases (MongoDB + PostgreSQL) to maintain.

We initially considered PostgreSQL (ruvector-postgres) as the replacement, but pivoted to a lighter approach: a self-contained RVF (RuVector Format) document store that persists to a single JSON file on disk. This eliminates all external database dependencies while preserving the full MongoDB Collection API.

## Decision

Fork HuggingFace Chat UI as **RuVocal** (`/workspaces/dev/packages/ruvocal`), replacing MongoDB with a pure TypeScript in-memory document store persisted to a single `.rvf.json` file.

### Name

**RuVocal** = **Ru**Vector + **Vocal** (voice/conversation). A conversational AI interface powered by ruvector.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        RuVocal Stack                             │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │   RuVocal UI     │    │   MCP Bridge     │                   │
│  │   (SvelteKit 2)  │───▶│   (Node.js)      │                   │
│  │                  │    │                  │                   │
│  │  - Chat UI       │    │  - Tool proxy    │                   │
│  │  - Autopilot     │    │  - Autopilot SSE │                   │
│  │  - Task cards    │    │  - System prompt │                   │
│  │  - Auth (OIDC)   │    │  - 201 tools     │                   │
│  └────────┬─────────┘    └──────────────────┘                   │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────────┐                   │
│  │         RVF Document Store               │                   │
│  │         (In-Memory + Disk Persist)       │                   │
│  │                                           │                   │
│  │  File: db/ruvocal.rvf.json               │                   │
│  │                                           │                   │
│  │  Collections (16):                        │                   │
│  │  - conversations    (chat sessions)       │                   │
│  │  - users            (auth/profiles)       │                   │
│  │  - sessions         (auth sessions)       │                   │
│  │  - settings         (user preferences)    │                   │
│  │  - assistants       (custom assistants)   │                   │
│  │  - reports          (abuse reports)       │                   │
│  │  - messageEvents    (feedback/votes)      │                   │
│  │  - semaphores       (rate limiting)       │                   │
│  │  - tokens           (token cache)         │                   │
│  │  - config           (runtime config)      │                   │
│  │  - migrationResults (migration tracking)  │                   │
│  │  - tools            (tool registry)       │                   │
│  │  - _files           (GridFS replacement)  │                   │
│  │  + per-tenant namespaced collections      │                   │
│  │                                           │                   │
│  │  Features:                                │                   │
│  │  - MongoDB-compatible Collection API      │                   │
│  │  - Multi-tenant data isolation            │                   │
│  │  - Debounced auto-save (500ms)            │                   │
│  │  - Zero external dependencies             │                   │
│  └───────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

## RVF Document Store (`rvf.ts`)

### Storage Format

```json
{
  "rvf_version": "2.0",
  "format": "rvf-database",
  "collections": {
    "conversations": { "id1": {...}, "id2": {...} },
    "users": { ... },
    ...
  },
  "tenants": {
    "tenant-a": { "conversations": {...}, ... },
    "tenant-b": { "conversations": {...}, ... }
  },
  "metadata": {
    "created_at": "2026-03-05T...",
    "updated_at": "2026-03-05T...",
    "doc_count": 1234,
    "multi_tenant": true
  }
}
```

### MongoDB-Compatible API

The `RvfCollection<T>` class implements the full MongoDB Collection interface used by all 56 importing files in HF Chat UI:

```typescript
class RvfCollection<T> {
    // CRUD
    findOne(filter, options?): Promise<T | null>;
    find(filter, options?): RvfCursor<T>;
    insertOne(doc): Promise<{ insertedId: ObjectId }>;
    insertMany(docs): Promise<{ insertedIds: ObjectId[] }>;
    updateOne(filter, update, options?): Promise<UpdateResult>;
    updateMany(filter, update): Promise<UpdateResult>;
    deleteOne(filter): Promise<DeleteResult>;
    deleteMany(filter): Promise<DeleteResult>;
    countDocuments(filter?): Promise<number>;
    distinct(field, filter?): Promise<unknown[]>;
    bulkWrite(ops): Promise<BulkWriteResult>;
    findOneAndUpdate(filter, update, options?): Promise<{ value: T | null }>;
    findOneAndDelete(filter): Promise<{ value: T | null }>;

    // Aggregation
    aggregate(pipeline, options?): { next(): Promise<T | null>; toArray(): Promise<T[]> };

    // Indexes (no-ops — in-memory store doesn't need them)
    createIndex(spec, options?): Promise<void>;
    listIndexes(): { toArray(): Promise<IndexInfo[]> };

    // Multi-tenant
    forTenant(tenantId: string): RvfCollection<T>;
}
```

### Query Operators Implemented

| Operator | Description |
|----------|-------------|
| `$or` | Logical OR |
| `$and` | Logical AND |
| `$not` | Logical NOT |
| `$exists` | Field existence |
| `$gt`, `$gte`, `$lt`, `$lte` | Comparison |
| `$ne` | Not equal |
| `$in`, `$nin` | Array membership |
| `$regex`, `$options` | Regular expression |

### Update Operators Implemented

| Operator | Description |
|----------|-------------|
| `$set` | Set field value |
| `$unset` | Remove field |
| `$inc` | Increment numeric field |
| `$push` | Push to array (with `$each`) |
| `$pull` | Remove from array |
| `$addToSet` | Add unique to array |
| `$setOnInsert` | Set on upsert only |

### Cursor API

```typescript
class RvfCursor<T> {
    sort(spec): this;
    limit(n): this;
    skip(n): this;
    project<U>(spec): RvfCursor<U>;
    batchSize(n): this;
    map<U>(fn): RvfCursor<U>;
    toArray(): Promise<T[]>;
    hasNext(): Promise<boolean>;
    next(): Promise<T | null>;
    tryNext(): Promise<T | null>;
    [Symbol.asyncIterator](): AsyncGenerator<T>;
}
```

### Aggregation Pipeline Stages

| Stage | Description |
|-------|-------------|
| `$match` | Filter documents |
| `$sort` | Sort results |
| `$limit` | Limit result count |
| `$skip` | Skip results |
| `$project` | Include/exclude fields |
| `$group` | Group with `$sum`, `$count` |

## Multi-Tenant Support

Tenant isolation is built into the store at the collection level:

```typescript
// Global collection (default)
const conversations = new RvfCollection<Conversation>("conversations");

// Tenant-scoped view — fully isolated data
const tenantConvs = conversations.forTenant("tenant-abc");
await tenantConvs.insertOne({ title: "Hello" });

// Won't find tenant data
await conversations.findOne({ title: "Hello" }); // null

// Stats
listTenants();      // ["tenant-abc"]
getTenantStats();   // { "tenant-abc": { collections: 1, documents: 1 } }
```

Tenant data is persisted separately in the RVF file under the `tenants` key.

## Performance Benchmarks (47 tests, all passing)

| Operation | Dataset | Time | Throughput |
|-----------|---------|------|------------|
| Insert | 10,000 docs | 63ms | ~159k ops/s |
| Find (range) | 10,000 docs | 5ms | 1,000 results |
| UpdateMany | 10,000 docs | 15ms | 5,000 matched |
| Aggregate | 10,000 docs | 28ms | match+sort+limit |
| Concurrent (5 ops) | 1,000 docs | 1.9ms | mixed read/write |
| Multi-tenant insert | 10×1,000 docs | 25ms | 10 tenants |
| Single tenant query | 1,000 docs | 0.5ms | 499 results |

## Test Coverage

47 tests across 9 test suites:

- **CRUD** (13 tests): insertOne/Many, updateOne/Many, deleteOne/Many, countDocuments, distinct, findOneAndUpdate/Delete, bulkWrite
- **Query Operators** (7 tests): $gt/$gte/$lt/$lte, $ne, $in/$nin, $exists, $or/$and, $regex, $not
- **Update Operators** (6 tests): $inc, $push, $push+$each, $pull, $addToSet, $unset
- **Cursor** (4 tests): sort/limit/skip, async iterator, tryNext/hasNext/next, map
- **Aggregation** (3 tests): $match+$sort+$limit, aggregate().next(), $group+$sum
- **GridFS** (2 tests): upload+download, delete
- **Multi-tenant** (2 tests): isolation, listTenants+stats
- **Persistence** (1 test): flush to disk and reload
- **ObjectId** (3 tests): equals, createFromHexString, toJSON
- **Benchmarks** (6 tests): insert, find, update, aggregate, concurrent, multi-tenant

## Files Modified

| File | Change |
|------|--------|
| `src/lib/server/database/rvf.ts` | NEW — RVF document store (850+ lines) |
| `src/lib/server/database.ts` | REWRITTEN — Uses RvfCollection instead of MongoDB |
| `src/lib/server/config.ts` | MODIFIED — RvfCollection types |
| `src/lib/migrations/migrations.ts` | REWRITTEN — No MongoDB sessions/transactions |
| `scripts/setups/vitest-setup-server.ts` | REWRITTEN — No MongoMemoryServer |
| `src/lib/server/database/__tests__/rvf.spec.ts` | NEW — 47 tests + benchmarks |

## Environment Variables

```bash
# RVF store path (defaults to db/ruvocal.rvf.json)
RVF_DB_PATH=/data/ruvocal

# Empty string = in-memory only (for tests)
RVF_DB_PATH=

# Everything else stays the same
PUBLIC_APP_NAME=RuVocal
PUBLIC_ORIGIN=https://chat.example.com
OPENAI_BASE_URL=https://openrouter.ai/api/v1
```

## Benefits

| Aspect | MongoDB (upstream) | RVF Store (RuVocal) |
|--------|-------------------|---------------------|
| **Dependencies** | MongoDB server required | Zero — pure TypeScript |
| **Container size** | +500MB for MongoDB | 0 extra |
| **Persistence** | Network database | Single JSON file |
| **Startup time** | Seconds (connection) | Instant |
| **Multi-tenant** | Not built-in | Native tenant isolation |
| **Backup** | mongodump | cp ruvocal.rvf.json |
| **UI customization** | Cannot modify upstream | Full SvelteKit source |
| **Test speed** | MongoMemoryServer (~2s) | In-memory (~300ms) |

## Risks

1. **In-memory limitation** — All data lives in RAM; unsuitable for datasets >100MB
2. **Single-writer** — No concurrent process writes (single Node process assumed)
3. **Upstream sync** — Forking means manual merge of upstream HF Chat UI updates

## Mitigation

1. For large deployments, future upgrade path to ruvector-postgres (PostgresAdapter already exists at `postgres.ts`)
2. The debounced save + flush-on-exit pattern prevents data loss; WAL logging can be added if needed
3. Keep fork minimal — only database layer changed, UI components untouched
