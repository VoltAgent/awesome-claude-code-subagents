
# ADR-073: Stub Tool Honesty & Real Predictions

**Status**: Accepted  
**Date**: 2026-04-06 (updated v3.5.59)  
**Context**: Issue #1514 (independent audit), Issues #1058, #1516, #1518, #1521, #1526, #1530, #1531, #1538, PR #1539

## Decision

### 1. Remove fabricated metrics from token-optimizer

The `TokenOptimizer` class (`@claude-flow/integration`) contained hardcoded savings numbers:

| Before | After |
|--------|-------|
| `totalTokensSaved += 100` per cache hit | Removed — cache hits tracked but no fabricated token count |
| `baseline = 1000` (hardcoded) | `queryTokenEstimate = query.length / 4` (actual content size) |
| `totalTokensSaved += 50` per edit | Removed — edit count tracked, savings not fabricated |
| `executionMs: 352` fallback | `executionMs: 0` (honest: no optimization occurred) |

### 2. Make `getOptimalConfig()` responsive to `agentCount`

Previously returned identical config regardless of input. Now scales:

| Agent Count | Batch Size | Topology | Cache (MB) |
|-------------|-----------|----------|------------|
| 1-2 | 2 | hierarchical | 25 |
| 3-4 | 2 | hierarchical | 50 |
| 5-6 | 4 | hierarchical | 75 |
| 7-8 | 4 | hierarchical-mesh | 100 |
| 9-12 | 6 | hierarchical-mesh | 125-150 |
| 13+ | 6 | mesh | 175-200 |

Formula: `batchSize = agentCount<=4?2 : agentCount<=8?4 : 6`, `cacheSizeMB = min(200, 25*ceil(agentCount/2))`

### 3. Wire `neural_predict` to real embedding similarity

Previously: hardcoded labels `['coder', 'researcher', 'reviewer', 'tester']` with random confidence.

Now:
- If stored patterns exist: generates real embedding for input, computes cosine similarity against all stored pattern embeddings, returns top-K nearest neighbors
- If no patterns stored: returns empty array `[]` (no fake labels, no simulated data)
- All results include `_realEmbedding` (bool: ML model loaded) and `_hasStoredPatterns` (bool: patterns available) transparency flags

### 4. `neural_train` stores real embeddings

Training now generates real embeddings for each training data entry (via ML model or deterministic hash fallback) and stores them as searchable patterns. Accuracy is `1.0` if patterns were stored, `0` otherwise — not simulated. Cosine similarity search against these stored embeddings produces real nearest-neighbor results.

### 5. Fix bare model names (#1516)

All embedding model defaults now use `Xenova/` prefix (e.g., `Xenova/all-MiniLM-L6-v2`) so `@xenova/transformers` can resolve them.

### 6. Fix intelligence data bloat (#1518, #1526)

- Deduplicate store entries by ID before building graph (v3.5.54: also persist deduped store in consolidate via `preDedupCount` tracking)
- Applied dedup to both v3 and root intelligence.cjs copies
- Scope `bootstrapFromMemoryFiles()` to current project only (was scanning all 51+ project dirs)
- Fix `tool_input` snake_case mismatch in hook-handler

### 7. Deep audit Math.random() removal (v3.5.56)

- `agent_health` aggregate: replaced Math.random() CPU/memory/latency with `null` + `_note`
- `system_health`: replaced hardcoded "healthy" + random latency with real `fs.existsSync()` checks timed with `performance.now()`
- `system_status`: replaced hardcoded component health (0.95, 0.90, 1.0) with `status: 'unknown'`
- `coordination_metrics`: replaced Math.random() with null + real sync counts
- `github-tools`: all 5 tools return `_stub: true`, Math.random() removed
- `neural_compress` and `neural_optimize`: return `_stub: true`
- `performance bottleneck/profile/optimize`: return `_stub: true`, profile no longer sleeps 100ms
- `hooks_metrics`: reads real counts from memory store
- `hooks_pretrain`: returns `_stub: true`
- `hooks_intelligence-reset`: actually deletes data files now
- `hooks_session-end`: reads real task/file/agent counts
- `hooks_explain`: reads real success rate from routing-outcomes.json
- `hooks_transfer`: returns failure instead of substituting demo data
- `workflow_execute/resume`: steps stay pending, don't auto-complete
- `task-tools`: fixed path mismatch `agents.json` → `agents/store.json`
- `session_restore`: syncs to sql.js database after writing legacy JSON
- `claims_rebalance`: executes moves when `dryRun=false`
- `config get`: calls `configManager.get()` instead of hardcoded map
- `process monitor`: uses real `os.loadavg()`, `process.memoryUsage()`
- `process logs`: reads actual log files
- `status`: flashAttention/searchSpeed → `'not measured'`
- `token-optimizer`: removed double-increment of `editsOptimized`

### 8. Remaining stub cleanup (v3.5.57)

- `daa_agent_adapt`: removed fake 50ms setTimeout delay
- `daa_workflow_execute`: steps stay pending instead of auto-completing
- `daa_cognitive_pattern`: replaced hardcoded analysis with real agent metrics
- `daa_knowledge_share`: added `_note` clarifying no cross-agent transfer
- `hooks_intelligence_attention`: removed `Math.exp(-i*0.5)` fake sigmoid weights, returns empty with `_stub: true` when no backend
- `system_reset` + `loadMetrics()`: use real `os.loadavg()/os.totalmem()` instead of hardcoded cpu:25, memory:256/1024
- `benchmark` CLI: honest zero fallback instead of hardcoded `searchTime: 0.5`
- `embeddings` CLI: "Skipped" instead of "Simulated"
- `providers` CLI: clarifying comment on static catalog
- `system_metrics`: wired up real agent/task counters from store files

### 9. Real implementations & AgentDB integration (v3.5.59, PR #1539)

Three performance tool stubs replaced with real implementations:
- `performance_bottleneck`: Real CPU load (`os.loadavg()`), memory (`process.memoryUsage()`), disk I/O latency (4KB write/read probe), severity classification
- `performance_profile`: Real V8 profiling with `process.cpuUsage()`, `performance.now()`, operation hotspot detection across memory/io/cpu targets
- `performance_optimize`: Real before/after system snapshots, GC collection (when `--expose-gc`), bottleneck-informed recommendations

Two neural tool stubs replaced with real implementations:
- `neural_compress`: Three real methods — quantize (Int8 via `quantizeInt8()` from memory-initializer, 3.92x compression), prune (remove low-usage patterns), distill (merge by cosine similarity > 0.95)
- `neural_optimize`: Target-aware — speed (dedup by hash+cosine), memory (Int8 quantization), accuracy (prune zero-norm embeddings), balanced (all three)

MCP request tracking:
- New `request-tracker.ts` singleton counter module tracks tool invocations in-process
- Wired into `mcp-server.ts` (success/error paths)
- `system_metrics` reads live counts instead of stale JSON

AgentDB integration (primary data layer with JSON fallback):
- `hive-mind` consensus results → `hive-consensus` namespace
- `hive-mind` shared memory → `hive-memory` namespace
- `daa_agent_create` → `daa-agents` namespace
- `daa_workflow_execute` → `daa-workflows` namespace
- All AgentDB writes are after JSON store save, in `try/catch` — backward compatible

TypeScript fixes:
- Zero TS compilation errors for first time — added ambient type declarations for 7 optional packages
- Fixed `unknown[]` casts in embeddings.ts, `registry as any` in memory-bridge.ts

Test coverage:
- 28 honesty tests (source-level checks for fabrication patterns)
- 30 feature-gap tests (verify real implementations, AgentDB integration, request tracking)

## Consequences

- Token optimizer reports honest numbers (will show 0 savings when agentic-flow is not installed)
- `neural_predict` returns real cosine similarity results when patterns stored, empty array when not
- `neural_train` stores real embeddings, no simulated accuracy
- Zero instances of `Math.random()` for confidence/accuracy/metrics in shipped code
- Zero instances of `setTimeout()` for fake delays in shipped code
- All remaining stubs marked `_stub: true`; all real tools marked `_real: true`
- Users can distinguish real ML vs hash-based embedding via `_realEmbedding` flag
- `hooks explain` matchScore uses real keyword ratio instead of random
- `system_metrics` returns real agent/task/request counts from persistent stores and live tracker
- `performance_bottleneck/profile/optimize` are fully real (V8 profiling, OS metrics, disk I/O)
- `neural_compress/optimize` are fully real (Int8 quantization, cosine similarity, pruning)
- AgentDB is primary data layer for hive-mind and DAA tools with JSON store backward compat
- 58 automated tests enforce honesty invariants and real implementation requirements

## Tools Status (Post-Fix)

| Category | Status | Notes |
|----------|--------|-------|
| Memory/HNSW | Real | Vector search, persistence, embeddings |
| AgentDB | Real | Pattern store, hierarchical recall, HNSW; primary layer for hive-mind + DAA |
| Embeddings | Real | Xenova/transformers, cosine similarity |
| Neural predict | Real (with patterns) | Cosine similarity search; empty array when no patterns |
| Neural train | Real | Embeds training data, stores as searchable patterns |
| Neural compress | **Real (v3.5.59)** | Int8 quantize (3.92x), prune, distill (cosine > 0.95) |
| Neural optimize | **Real (v3.5.59)** | Target-aware: speed/memory/accuracy/balanced |
| Performance bottleneck | **Real (v3.5.59)** | CPU load, memory, disk I/O latency, severity classification |
| Performance profile | **Real (v3.5.59)** | V8 cpuUsage, memoryUsage, operation hotspots |
| Performance optimize | **Real (v3.5.59)** | GC collect, before/after snapshots, recommendations |
| Token optimizer | Honest metrics | No fabricated numbers |
| Agent spawn/task | Real state tracking | Store persistence via agents/store.json |
| DAA tools | **Real + AgentDB (v3.5.59)** | Local state + AgentDB persistence, no fake delays |
| System metrics | **Real + live tracker (v3.5.59)** | CPU/memory from os, agents/tasks from stores, requests from tracker |
| Hive-mind | **Real + AgentDB (v3.5.59)** | Vote counting + AgentDB persistence for consensus + shared memory |
| WASM agents | Stub | Echo-based, no WASM runtime |
