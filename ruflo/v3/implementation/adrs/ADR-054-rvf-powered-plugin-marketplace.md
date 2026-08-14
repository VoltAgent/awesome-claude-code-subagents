# ADR-054: RVF-Powered Plugin Marketplace & Hosted Registry

**Status:** Proposed
**Date:** 2026-02-25
**Authors:** RuvNet, Claude Flow Team
**Version:** 1.0.0
**Related:** ADR-053 (Controller Activation), ADR-006 (Unified Memory), ADR-009 (Hybrid Memory Backend), ADR-049 (Self-Learning Memory GNN), ADR-050 (Intelligence Loop)

## Context

The Claude Flow plugin ecosystem currently comprises 20 plugins distributed via IPFS (Pinata), discovered through a static JSON registry (`QmXbfEAaR7D2Ujm4GAkbwcGZQMHqAMpwDoje4583uNP834`), and searched via keyword substring matching. While functional, this approach has critical limitations as the ecosystem grows:

1. **Search is keyword-only** — `searchPlugins()` in `search.ts` does case-insensitive substring matching across name, description, tags, keywords. A query like "I need permission management" won't find `@claude-flow/claims` unless the user knows the exact term "claims."

2. **Recommendations are primitive** — `findSimilarPlugins()` uses a static scoring formula: tag overlap (2x) + category match (3x) + type match (2x) + author match (1x). No learning from actual install patterns.

3. **No dependency intelligence** — Dependencies are a flat list. No transitive resolution, no conflict detection, no ecosystem analysis.

4. **Static popularity** — Downloads and ratings are baked into the registry JSON at publish time. No real-time trending, no decay.

5. **No behavioral context** — The system cannot observe that a developer working on security tasks should be shown security plugins, or that users who install `@claude-flow/security` almost always also install `@claude-flow/claims`.

Meanwhile, AgentDB v3 (activated in ADR-053) provides a full RuVector Framework (RVF) stack — 13 active controllers with HNSW vector search, graph databases, causal inference, learning systems, skill libraries, and proof-gated mutations — all currently with **zero plugin system consumers**.

### Available RVF Infrastructure (from ADR-053 audit)

| Controller | Level | Key Methods | Plugin Marketplace Applicability |
|---|---|---|---|
| **ReasoningBank** | L1 | `storePattern`, `searchPatterns`, `searchPatternsV2`, `getPatternStats` | Pattern storage for plugin usage patterns |
| **TieredCache** | L1 | `get`, `set`, `delete`, `getStats` | Hot plugin metadata caching |
| **GuardedVectorBackend** | L2 | `insert`, `search`, `insertBatch`, `remove` | HNSW-indexed semantic plugin search (150x-12,500x faster) |
| **MutationGuard** | L2 | `proveInsert`, `proveSearch`, `validateToken` | Proof-gated plugin publishing (tamper resistance) |
| **SkillLibrary** | L3 | `createSkill`, `searchSkills`, `getSkillPlan`, `consolidateEpisodesIntoSkills` | Map plugins to capabilities ("OAuth" skill → security plugin) |
| **ExplainableRecall** | L3 | `createCertificate`, `getJustification`, `traceProvenance` | Auditable search results ("why was this plugin recommended?") |
| **ReflexionMemory** | L3 | `storeEpisode`, `retrieveRelevant`, `getSuccessStrategies` | Learn from install/uninstall episodes |
| **AttestationLog** | L3 | `record`, `query`, `getDenialPatterns` | Immutable audit trail for publish/install actions |
| **CausalMemoryGraph** | L4 | `addCausalEdge`, `createExperiment`, `calculateUplift`, `getCausalChain` | Dependency graph analysis, A/B testing plugin recommendations |
| **NightlyLearner** | L4 | `run`, `consolidateEpisodes`, `discoverCausalEdges` | Batch learning: "users who install X install Y" |
| **LearningSystem** | L4 | `startSession`, `predict`, `submitFeedback`, `train` | Online learning for search relevance |
| **GraphTransformer** | L5 | `sublinearAttention`, `causalAttention`, `gameTheoreticAttention` | Advanced ranking with graph neural attention |
| **GraphDatabaseAdapter** | L6 | `storeEpisode`, `storeSkill`, `createEdge`, `query` | Plugin relationship graph persistence |

### Current Plugin System Files

| File | Lines | Purpose |
|---|---|---|
| `src/plugins/store/discovery.ts` | ~600 | IPFS registry fetch, CID resolution, cache, demo fallback |
| `src/plugins/store/search.ts` | ~400 | Keyword search, filtering, sorting, similar plugins |
| `src/plugins/store/types.ts` | ~300 | `PluginEntry`, `PluginRegistry`, `PluginCategory` types |
| `src/commands/plugins.ts` | ~800 | CLI: list, search, install, uninstall, upgrade, toggle, info, create, rate |

### EmbeddingService Available

AgentDB's `EmbeddingService` (Xenova/all-MiniLM-L6-v2, 384 dimensions) is already wired through `memory-bridge.ts` as of ADR-053 Phase 2. It provides:
- `embed(text)` — single text to 384-dim vector
- `embedBatch(texts)` — batch embedding
- `clearCache()` — cache management

## Decision

**Wire the RVF stack into the plugin marketplace** through a new `PluginIntelligence` layer that sits between the existing search/discovery code and AgentDB controllers. The approach is phased, with each phase independently valuable and backward-compatible.

### Architecture

```
CLI Plugin Commands
        │
        ▼
┌─────────────────────┐
│  PluginIntelligence  │  ← NEW: Orchestrates RVF controllers for plugin ops
│  (plugin-intel.ts)   │
└───┬───┬───┬───┬─────┘
    │   │   │   │
    ▼   ▼   ▼   ▼
┌───┐ ┌───┐ ┌───┐ ┌───┐
│Vec│ │Gra│ │Ski│ │Lea│   ← AgentDB controllers via ControllerRegistry
│tor│ │ph │ │ll │ │rn │
│Bkd│ │Adp│ │Lib│ │Sys│
└───┘ └───┘ └───┘ └───┘
    │   │   │   │
    ▼   ▼   ▼   ▼
┌─────────────────────┐
│  AgentDB (SQLite +   │
│  better-sqlite3)     │
└─────────────────────┘
```

The existing IPFS registry remains the **source of truth** for plugin metadata. RVF provides the **intelligence layer** on top — semantic search, recommendations, graphs, learning. If RVF is unavailable, the system falls back to the existing keyword search (same graceful degradation pattern as ADR-053).

## Implementation Phases

### Phase 1: Semantic Plugin Search (High Priority)

**Goal:** Replace keyword substring matching with vector similarity search.

**Controllers Used:** `EmbeddingService`, `GuardedVectorBackend`, `TieredCache`

**Design:**

1. **Index plugins on registry load.** When `fetchRegistry()` succeeds, embed each plugin's searchable text and store in the vector backend:

```typescript
// plugin-intel.ts
async function indexPlugins(plugins: PluginEntry[]): Promise<void> {
  const registry = await getControllerRegistry();
  const agentdb = registry.getAgentDB();
  const vectorBackend = registry.get('vectorBackend');

  for (const plugin of plugins) {
    const searchText = [
      plugin.displayName,
      plugin.description,
      ...plugin.tags,
      ...plugin.keywords,
      plugin.categories.join(' '),
    ].join(' ');

    const embedding = await agentdb.embedder.embed(searchText);
    await vectorBackend.insert({
      id: plugin.id,
      vector: new Float32Array(embedding),
      metadata: { pluginId: plugin.id, type: plugin.type, trustLevel: plugin.trustLevel },
    });
  }
}
```

2. **Semantic search with hybrid fallback.** New `semanticSearchPlugins()` that uses vector search for intent matching, keyword search for exact matches, and merges results:

```typescript
async function semanticSearchPlugins(
  query: string,
  options: SearchOptions,
): Promise<SearchResults> {
  // Vector search: finds plugins by intent
  const embedding = await agentdb.embedder.embed(query);
  const vectorResults = await vectorBackend.search({
    vector: new Float32Array(embedding),
    k: options.limit * 2,
  });

  // Keyword search: finds plugins by exact terms (existing logic)
  const keywordResults = keywordSearch(query, options);

  // Merge: vector results get semantic score, keyword results get term score
  // Dedup by plugin ID, take max score
  return mergeAndRank(vectorResults, keywordResults, options);
}
```

3. **Cache hot queries.** Use `TieredCache` to cache embeddings and search results:

```typescript
const cache = registry.get('tieredCache');
const cacheKey = `plugin-search:${query}:${JSON.stringify(options)}`;
const cached = await cache.get(cacheKey);
if (cached) return cached;
// ... run search ...
await cache.set(cacheKey, results, { ttl: 300 }); // 5 min
```

**Impact:** "permission management" finds `@claude-flow/claims`. "machine learning" finds `@claude-flow/neural`. "code quality" finds `@claude-flow/plugin-agentic-qe`. Zero change to plugin commands — the search function is transparently upgraded.

**Files Modified:**
- `src/plugins/store/search.ts` — add `semanticSearchPlugins()`, modify `searchPlugins()` to try semantic first
- `src/plugins/store/discovery.ts` — call `indexPlugins()` after registry fetch

**New Files:**
- `src/plugins/intelligence/plugin-intel.ts` — RVF orchestration layer (~200 lines)

### Phase 2: Plugin Dependency Graph (High Priority)

**Goal:** Build a graph of plugin relationships for dependency analysis, ecosystem detection, and hub identification.

**Controllers Used:** `GraphDatabaseAdapter`, `CausalMemoryGraph`

**Design:**

1. **Build graph on registry load.** Nodes = plugins, edges = dependencies + co-installation + category membership:

```typescript
async function buildPluginGraph(plugins: PluginEntry[]): Promise<void> {
  const graphAdapter = registry.get('graphAdapter');

  for (const plugin of plugins) {
    // Node for each plugin
    await graphAdapter.createNode({
      id: plugin.id,
      type: 'plugin',
      metadata: { category: plugin.categories[0], trustLevel: plugin.trustLevel },
    });

    // Dependency edges
    for (const dep of plugin.dependencies || []) {
      await graphAdapter.createEdge({
        source: plugin.id,
        target: dep.name,
        type: 'depends_on',
        weight: 1.0,
      });
    }

    // Category membership edges
    for (const cat of plugin.categories) {
      await graphAdapter.createEdge({
        source: plugin.id,
        target: `category:${cat}`,
        type: 'member_of',
        weight: 0.5,
      });
    }
  }
}
```

2. **Expose graph queries in CLI:**

```bash
# Show transitive dependencies
npx claude-flow plugins deps @claude-flow/security --transitive

# Find plugin ecosystems (community detection)
npx claude-flow plugins ecosystems

# Show hub plugins (highest PageRank)
npx claude-flow plugins hubs

# Check for conflicts
npx claude-flow plugins conflicts @claude-flow/plugin-a @claude-flow/plugin-b
```

3. **Graph-enhanced search ranking.** Blend vector similarity with PageRank:

```typescript
// combinedScore = 0.7 * semanticScore + 0.2 * pageRank + 0.1 * popularityNorm
```

**Impact:** Developers see plugin ecosystems, can trace dependency chains, and search results favor foundational plugins.

**Files Modified:**
- `src/commands/plugins.ts` — add `deps`, `ecosystems`, `hubs`, `conflicts` subcommands

**New Files:**
- `src/plugins/intelligence/plugin-graph.ts` — graph construction and queries (~250 lines)

### Phase 3: Behavioral Recommendations (Medium Priority)

**Goal:** Learn from install/uninstall/search patterns to recommend plugins.

**Controllers Used:** `ReflexionMemory`, `LearningSystem`, `NightlyLearner`

**Design:**

1. **Record episodes on plugin actions.** Every install, uninstall, search, and rating creates a ReflexionMemory episode:

```typescript
async function recordPluginAction(
  action: 'install' | 'uninstall' | 'search' | 'rate',
  pluginId: string,
  context: { query?: string; rating?: number; agentType?: string },
): Promise<void> {
  const reflexion = registry.get('reflexion');

  await reflexion.storeEpisode({
    task: `plugin-${action}`,
    actions: [{ type: action, target: pluginId, ...context }],
    outcome: action === 'uninstall' ? 'negative' : 'positive',
    critique: action === 'uninstall'
      ? `User removed ${pluginId} — may indicate quality issue or mismatch`
      : `User ${action}ed ${pluginId}`,
  });
}
```

2. **Predict next plugin.** Use `LearningSystem` to predict what plugin a developer needs based on current context:

```typescript
async function recommendPlugins(
  context: { installedPlugins: string[]; currentTask?: string; agentType?: string },
): Promise<PluginRecommendation[]> {
  const learningSystem = registry.get('learningSystem');

  const session = await learningSystem.startSession({
    state: context,
    availableActions: allPluginIds,
  });

  const predictions = await learningSystem.predict(session.id);
  // Returns ranked plugin IDs with confidence scores

  return predictions.map(p => ({
    pluginId: p.action,
    confidence: p.score,
    reason: p.explanation,
  }));
}
```

3. **Nightly consolidation.** `NightlyLearner` runs as a daemon worker to consolidate episodes into stable patterns:

```typescript
// In daemon worker 'consolidate':
async function consolidatePluginPatterns(): Promise<void> {
  const nightlyLearner = registry.get('nightlyLearner');
  await nightlyLearner.run({
    domains: ['plugin-install', 'plugin-search', 'plugin-rate'],
    consolidateEpisodes: true,
    discoverCausalEdges: true, // "installing security CAUSES installing claims"
  });
}
```

**Impact:** "Users who install X also install Y" recommendations. Real-time trending. Personalized plugin suggestions based on developer workflow.

**New CLI Features:**
```bash
npx claude-flow plugins recommend          # Based on installed plugins + context
npx claude-flow plugins trending           # Real-time trending (not static)
npx claude-flow plugins why @claude-flow/X # "Why is this recommended?"
```

**Files Modified:**
- `src/commands/plugins.ts` — add `recommend`, `trending`, `why` subcommands
- `src/plugins/store/search.ts` — integrate recommendations into search results

**New Files:**
- `src/plugins/intelligence/plugin-learning.ts` — episode recording + recommendations (~300 lines)

### Phase 4: Skill-to-Plugin Mapping (Medium Priority)

**Goal:** Map developer intents to plugin capabilities using SkillLibrary.

**Controllers Used:** `SkillLibrary`, `SemanticRouter`

**Design:**

1. **Register plugins as skills.** Each plugin's capabilities become searchable skills:

```typescript
async function registerPluginSkills(plugin: PluginEntry): Promise<void> {
  const skills = registry.get('skills');

  // Primary skill from plugin description
  await skills.createSkill({
    name: `plugin:${plugin.id}`,
    description: plugin.description,
    category: plugin.categories[0],
    metadata: { pluginId: plugin.id, commands: plugin.commands, hooks: plugin.hooks },
  });

  // Per-export skills
  for (const exp of plugin.exports || []) {
    await skills.createSkill({
      name: `export:${plugin.id}:${exp}`,
      description: `${exp} from ${plugin.displayName}`,
      category: 'plugin-export',
      metadata: { pluginId: plugin.id, export: exp },
    });
  }
}
```

2. **Intent-to-plugin routing.** Developer describes what they need, system finds which plugin provides it:

```bash
npx claude-flow plugins find-for "validate user input with schemas"
# → @claude-flow/security (InputValidator — Zod-based validation)
# → @claude-flow/claims (claims-based authorization)

npx claude-flow plugins find-for "train neural patterns from code"
# → @claude-flow/neural (SONA, MoE, EWC++)
# → @claude-flow/plugin-neural-coordinator
```

**Impact:** Developers discover plugins by describing what they want to do, not what the plugin is called.

### Phase 5: Proof-Gated Publishing (Low Priority)

**Goal:** Tamper-resistant plugin publishing with cryptographic attestation.

**Controllers Used:** `MutationGuard`, `AttestationLog`, `ExplainableRecall`

**Design:**

1. **Proof-gated publish.** Every plugin publish generates a proof token validated by MutationGuard:

```typescript
async function publishPlugin(plugin: PluginEntry, authorKey: string): Promise<string> {
  const guard = registry.get('mutationGuard');
  const attestation = registry.get('attestationLog');

  // Generate proof of valid publish
  const token = await guard.createToken(authorKey);
  const proof = await guard.proveInsert(token, plugin.id, pluginEmbedding);

  // Record in immutable attestation log
  await attestation.record({
    action: 'plugin-publish',
    actor: authorKey,
    target: plugin.id,
    proof: proof.hash,
    metadata: { version: plugin.version, checksum: plugin.checksum },
  });

  // Upload to IPFS with proof attached
  const cid = await uploadToIPFS({ ...plugin, proof });
  return cid;
}
```

2. **Verify on install.** Before installing, verify the proof chain:

```typescript
async function verifyPlugin(plugin: PluginEntry): Promise<VerificationResult> {
  const recall = registry.get('explainableRecall');

  // Create verification certificate
  const cert = await recall.createCertificate({
    query: `verify:${plugin.id}@${plugin.version}`,
    results: [{ id: plugin.id, score: 1.0 }],
  });

  // Trace provenance
  const provenance = await recall.traceProvenance(plugin.id);

  return {
    verified: cert.verified,
    provenance,
    justification: await recall.getJustification(cert.id),
  };
}
```

**Impact:** Immutable publish history. Tamper detection. Provenance for every installed plugin.

### Phase 6: Hosted Marketplace API (Low Priority)

**Goal:** Expose the RVF-powered plugin intelligence as a hosted HTTP API for external consumers (web UI, IDE extensions, CI/CD).

**Design:**

```
┌──────────────────────────┐
│   Hosted Marketplace UI   │  ← Web frontend (React/Next.js)
└──────────┬───────────────┘
           │ HTTP/REST
           ▼
┌──────────────────────────┐
│   Marketplace API Server  │  ← Express/Hono, deployed as service
│   /api/plugins/search     │
│   /api/plugins/recommend  │
│   /api/plugins/graph      │
│   /api/plugins/trending   │
│   /api/plugins/verify     │
│   /api/plugins/publish    │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│   PluginIntelligence      │  ← Same layer used by CLI
│   + ControllerRegistry    │
│   + AgentDB               │
└──────────────────────────┘
```

**API Endpoints:**

| Endpoint | Method | Description |
|---|---|---|
| `/api/plugins/search` | POST | Semantic search with filters |
| `/api/plugins/recommend` | GET | Context-aware recommendations |
| `/api/plugins/graph` | GET | Plugin dependency graph (JSON) |
| `/api/plugins/graph/ecosystems` | GET | Community detection results |
| `/api/plugins/trending` | GET | Real-time trending (learning-based) |
| `/api/plugins/verify/:id` | GET | Proof verification + provenance |
| `/api/plugins/publish` | POST | Proof-gated plugin submission |
| `/api/plugins/stats` | GET | Registry-wide analytics |
| `/api/plugins/:id/similar` | GET | Semantically similar plugins |
| `/api/plugins/:id/why` | GET | Explainable recommendation |

**Deployment Options:**
- **Self-hosted**: `npx claude-flow marketplace start --port 3001`
- **Serverless**: Deploy as Cloudflare Worker / Vercel Edge Function with SQLite (D1/Turso)
- **MCP Server**: Expose as MCP tool for Claude Code integration

## Performance Targets

| Metric | Current (keyword) | Target (RVF) | Mechanism |
|---|---|---|---|
| Search latency (20 plugins) | <5ms | <5ms | TieredCache hot path |
| Search latency (1000 plugins) | ~50ms (linear scan) | <10ms | HNSW index (O(log n)) |
| Search latency (10k plugins) | ~500ms | <15ms | HNSW index + cache |
| Recommendation latency | N/A | <50ms | LearningSystem predict |
| Graph query (PageRank) | N/A | <100ms | Pre-computed on load |
| Publish verification | N/A | <200ms | MutationGuard proof |
| Index build (1000 plugins) | N/A | <30s | Batch embed + insert |

## Migration Strategy

### Backward Compatibility

All phases use the same graceful degradation as ADR-053:

```typescript
async function searchPlugins(query: string, options: SearchOptions) {
  // Try semantic search (RVF)
  const intel = await getPluginIntelligence();
  if (intel) {
    const results = await intel.semanticSearch(query, options);
    if (results) return results;
  }

  // Fallback: existing keyword search (always works)
  return keywordSearchPlugins(query, options);
}
```

If `@claude-flow/memory` or AgentDB is unavailable, every feature falls back to the existing implementation. Zero breaking changes.

### Registry Format

The IPFS registry JSON format is **unchanged**. RVF indexing happens client-side on registry load. The hosted marketplace API adds server-side indexing for web consumers but the registry remains the canonical source.

### Rollout

| Phase | Scope | Risk | Rollback |
|---|---|---|---|
| Phase 1 (Semantic Search) | Client-side only | Low — fallback to keyword | Remove bridge call |
| Phase 2 (Dependency Graph) | Client-side only | Low — additive commands | Remove commands |
| Phase 3 (Recommendations) | Client-side + daemon | Medium — learning state | Clear learning DB |
| Phase 4 (Skill Mapping) | Client-side only | Low — additive | Remove skill index |
| Phase 5 (Proof Publishing) | Registry format change | Medium — new field | Ignore proof field |
| Phase 6 (Hosted API) | New service | Low — independent | Stop service |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Embedding model download (100MB+) blocks first search | High latency on first use | Pre-warm in `daemon start`; cache model in `.claude-flow/models/` |
| Small registry (20 plugins) doesn't benefit from HNSW | Overhead without benefit | Skip HNSW when `registry.plugins.length < 100`; use brute-force cosine for small sets |
| Learning from small install base may overfit | Bad recommendations | Require minimum 5 episodes before activating recommendations; blend with global popularity |
| Graph transformer NAPI-RS binary may fail on some platforms | Feature unavailable | 4-tier fallback (native → WASM → legacy WASM → pure JS) already in place |
| Proof-gated publishing adds friction for plugin authors | Slower adoption | Make proofs optional in Phase 5; only required for `trustLevel: 'official'` |

## Alternatives Considered

### 1. External Search Service (Algolia, Meilisearch)

**Rejected.** Adds external dependency, network latency, and hosting cost. RVF runs locally with the same SQLite database already in use. For a hosted marketplace, RVF can be deployed alongside the API server without a separate search service.

### 2. OpenAI Embeddings API

**Rejected for default.** Requires API key and network. AgentDB's local Xenova/all-MiniLM-L6-v2 works offline. However, `EmbeddingService.embedOpenAI()` is available as an opt-in upgrade for higher-quality embeddings (1536-dim).

### 3. Build Custom Plugin Search from Scratch

**Rejected.** AgentDB already provides vector search, graph database, learning system, proof engine, and attestation log. Building these from scratch would duplicate 10,000+ lines of tested code.

## Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Search relevance (MRR@5) | >0.8 | Manual evaluation on 50 test queries |
| Recommendation accuracy | >70% install rate on top-3 | Track install/dismiss ratio |
| Graph query accuracy | 100% transitive deps correct | Compare with `npm ls` equivalent |
| Publish verification | 0 false positives | Proof validation against known-good set |
| Search latency p99 | <50ms (1000 plugins) | Benchmark suite |
| User satisfaction | >4.0/5.0 | Plugin rating system |

## References

- ADR-053: AgentDB v3 Controller Activation
- ADR-006: Unified Memory Service
- ADR-009: Hybrid Memory Backend
- ADR-049: Self-Learning Memory GNN
- ADR-050: Intelligence Loop
- Plugin Store Types: `v3/@claude-flow/cli/src/plugins/store/types.ts`
- Plugin Search: `v3/@claude-flow/cli/src/plugins/store/search.ts`
- Plugin Discovery: `v3/@claude-flow/cli/src/plugins/store/discovery.ts`
- ControllerRegistry: `v3/@claude-flow/memory/src/controller-registry.ts`
- AgentDB: `agentdb@3.0.0-alpha.7`
