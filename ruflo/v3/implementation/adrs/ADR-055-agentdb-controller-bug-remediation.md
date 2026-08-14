# ADR-055: AgentDB v3 Controller Bug Remediation

## Status
Accepted (Updated 2026-02-27 for agentdb 3.0.0-alpha.10)

## Date
2026-02-26

## Context

ADR-053 introduced 8 new controllers and 6 MCP tools for AgentDB v3 integration. A deep review revealed 7 critical bugs, 5 high-severity issues, and several medium issues that made all 6 new tools non-functional.

### Root Causes (alpha.9)

1. **API mismatch**: `AgentDB.getController()` only supports 3 controller names (`reflexion`, `skills`, `causalGraph`) but code delegated 7 additional names to it
2. **Missing exports**: `HierarchicalMemory`, `MemoryConsolidation`, `SemanticRouter`, `GNNService`, `RVFOptimizer`, `GuardedVectorBackend` are not exported from agentdb 3.0.0-alpha.9
3. **Wrong method names**: Bridge functions called `registry.getController()` but the correct method is `registry.get()`
4. **Wrong constructor signatures**: `BatchOperations` requires `(db, embedder, config)`, not just `(db)`
5. **Wrong method signatures**: `bulkDelete(table, conditions)` not `bulkDelete(keyArray)`, `bulkUpdate(table, updates, conditions)` not `bulkUpdate(entriesArray)`
6. **Static vs instance**: `ContextSynthesizer.synthesize()` is static, takes `MemoryPattern[]` not a string
7. **Wrong tier names**: Code used `shortTerm/longTerm` but real tiers are `episodic/semantic`

## Decision

### Phase 1 Fixes (alpha.9 — 2026-02-26)

| # | Category | Fix |
|---|----------|-----|
| C1 | Method name | `registry.getController()` → `registry.get()` in all 6 bridge functions |
| C2 | Missing export | HierarchicalMemory → lightweight in-memory tiered stub with `store/recall/getTierStats` |
| C3 | Missing export | MemoryConsolidation → no-op stub returning `{promoted, pruned, timestamp}` |
| C4 | Wrong signatures | BatchOperations: `insertEpisodes([{content,metadata}])`, `bulkDelete(table, conditions)`, `bulkUpdate(table, updates, conditions)` |
| C5 | Wrong argument | ContextSynthesizer: gather patterns from hierarchical memory first, pass `Pattern[]` to static `synthesize()` |
| C6 | getController | Only delegate `reflexion`, `skills`, `causalGraph` to AgentDB. All others instantiated directly from exports or return null |
| C7 | Tier names | `shortTerm/longTerm` → `episodic/semantic` in MCP tool schemas and README |
| H1 | Race condition | Set `this.initialized = true` before async init to prevent concurrent re-entry |
| H2 | Shutdown | `instance.destroy()` now awaited |
| H3 | Input validation | All 6 MCP tool handlers validate required params before calling bridge |
| H4 | SemanticRouter | Documented as unavailable (not exported from agentdb) with clear error message |

### Phase 2 Upgrades (alpha.10 — 2026-02-27)

agentdb 3.0.0-alpha.10 now exports all 8 previously-missing controllers. Upgraded from stubs/null to real implementations:

| # | Controller | Change |
|---|-----------|--------|
| U1 | HierarchicalMemory | Stub → real `HierarchicalMemory(db, embedder)` with Ebbinghaus forgetting curves, spaced repetition, 3-tier persistence |
| U2 | MemoryConsolidation | Stub → real `MemoryConsolidation(db, hm, embedder)` with episodic→semantic clustering, forgetting curves |
| U3 | SemanticRouter | null → real `SemanticRouter()` with `@ruvector/router` native + keyword fallback |
| U4 | GNNService | null → real `GNNService(config)` with `@ruvector/gnn` native + JS fallback |
| U5 | RVFOptimizer | null → real `RVFOptimizer()` with 4/8/16-bit quantization, dedup, pruning, batch embed |
| U6 | MutationGuard | null → real `MutationGuard(config)` for proof-gated state mutation (ADR-060) |
| U7 | AttestationLog | null → real `AttestationLog(db)` for append-only audit log |
| U8 | GuardedVectorBackend | null → real `GuardedVectorBackend(inner, guard, log?)` wrapping vectorBackend with proof gates |

### Bridge API Compatibility

Bridge functions now detect real vs stub HierarchicalMemory and call the correct API:

| Operation | Real API (alpha.10) | Stub API (fallback) |
|-----------|---------------------|---------------------|
| store | `store(content, importance, tier, {metadata, tags})` → `Promise<string>` | `store(key, value, tier)` — sync |
| recall | `recall({query, tier?, k?})` → `Promise<MemoryItem[]>` | `recall(query, topK)` — sync array |
| consolidate | `consolidate()` → `Promise<ConsolidationReport>` | `consolidate()` → `{promoted, pruned, timestamp}` |

Detection: real HierarchicalMemory has `promote()` and async `getStats()` methods that stubs lack.

### Controller Instantiation Strategy (Updated)

```
AgentDB.getController()  →  reflexion, skills, causalGraph, vectorBackend, graphAdapter
Direct import + new()    →  ReasoningBank, CausalRecall, LearningSystem,
                             ExplainableRecall, NightlyLearner, CausalMemoryGraph,
                             BatchOperations, MMRDiversityRanker,
                             HierarchicalMemory, MemoryConsolidation,
                             GNNService, RVFOptimizer, SemanticRouter,
                             MutationGuard, AttestationLog, GuardedVectorBackend
Static class reference   →  ContextSynthesizer (synthesize is static)
Fallback stubs           →  HierarchicalMemory, MemoryConsolidation (if agentdb unavailable)
```

### Constructor Signatures (alpha.10)

| Controller | Constructor | Notes |
|-----------|-------------|-------|
| HierarchicalMemory | `(db, embedder, vectorBackend?, graphBackend?, config?)` | Requires `initializeDatabase()` |
| MemoryConsolidation | `(db, hierarchicalMemory, embedder, vectorBackend?, graphBackend?, config?)` | Depends on HierarchicalMemory (level 1 → level 3) |
| SemanticRouter | `()` | Requires `initialize()` |
| GNNService | `(config?)` | Requires `initialize()`. Config: `{inputDim, hiddenDim, outputDim, heads}` |
| RVFOptimizer | `()` | No-arg constructor, self-contained |
| MutationGuard | `(config?)` | Config: `{dimension, maxElements, enableWasmProofs}` |
| AttestationLog | `(db)` | Uses database for append-only audit |
| GuardedVectorBackend | `(innerBackend, mutationGuard, attestationLog?)` | Wraps vectorBackend + mutationGuard |

## Consequences

- All 6 MCP tools fully functional with real agentdb controllers
- HierarchicalMemory now has persistent 3-tier storage with Ebbinghaus decay curves
- MemoryConsolidation clusters episodic memories into semantic patterns
- SemanticRouter enables intent-based routing with `@ruvector/router` or keyword fallback
- GNNService provides graph neural network intent classification and skill recommendations
- RVFOptimizer enables 4-bit quantization (8x compression) and batch embedding
- MutationGuard + AttestationLog + GuardedVectorBackend complete the ADR-060 proof-gated mutation chain
- Fallback stubs preserved for environments without agentdb
- No regression in existing 445 CLI tests

## Files Changed

- `v3/@claude-flow/memory/src/controller-registry.ts` — 8 controllers upgraded from stub/null to real instantiation, added `createEmbeddingService()` helper
- `v3/@claude-flow/cli/src/memory/memory-bridge.ts` — Bridge functions detect real vs stub API, updated recall/store/consolidate signatures
- `v3/@claude-flow/cli/src/mcp-tools/agentdb-tools.ts` — Tier enum, input validation (phase 1)
- `v3/@claude-flow/memory/package.json` — agentdb dependency `^3.0.0-alpha.10`
- `README.md` — Tier names, capacity/TTL claims, RVFOptimizer categorization (phase 1)
