---
id: ADR-0001
title: Optimize ruflo-agentdb — accurate surface, quantization opt-ins, controller-managed namespacing, smoke-as-contract
status: Proposed
date: 2026-05-04
authors:
  - planner (Claude Code)
tags: [plugin, agentdb, mcp, hnsw, rabitq, controllers, namespacing, smoke-test]
---

## Context

### Today's `ruflo-agentdb`

`ruflo-agentdb` is a thin documentation wrapper around three MCP tool families exposed by `@claude-flow/cli`: `agentdb_*` (controller bridge), `embeddings_*` (RuVector ONNX engine), and `ruvllm_hnsw_*` (WASM-backed pattern router). The plugin ships six files:

- `.claude-plugin/plugin.json:2` — `name: "ruflo-agentdb"`, `version: "0.2.0"`, keywords `agentdb, ruvector, hnsw, embeddings, vector-search`.
- `README.md:16` — claims `19 AgentDB controllers`; `README.md:49` — calls out HNSW "150x-12,500x" speedup and "384-dim ONNX" embeddings.
- `agents/agentdb-specialist.md:15` — header `MCP Tools (19 Controllers)` then enumerates eight `agentdb_*` tool prefixes plus `embeddings_*` and `ruvllm_hnsw_*` as bullet groups.
- `commands/agentdb.md:8` — invokes `agentdb_health` and `agentdb_controllers` and prints "all 19 controllers and their status".
- `commands/embeddings.md:8` — invokes `embeddings_status`/`embeddings_init`/`embeddings_search`. Mentions the model and dimension count but no quantization or HNSW tuning.
- `skills/agentdb-query/SKILL.md:5` — `allowed-tools` enumerates 14 `agentdb_*` tools (correct count); `SKILL.md:26` repeats the "19 Controllers" framing.
- `skills/vector-search/SKILL.md:5` — `allowed-tools` enumerates seven `embeddings_*` and three `ruvllm_hnsw_*` tools; `SKILL.md:46–50` is a performance table claiming `HNSW (n=10,000) 12,500x faster`.

There is no `scripts/`, no `docs/` (the ADR file path is the first under that subtree), and no version pin against the underlying `agentdb` npm package or the CLI MCP surface.

### What AgentDB / the CLI actually exposes

Counted directly from source on 2026-05-04 (HEAD of `main`):

| Surface | Plugin claim | Real count | Source |
|---|---|---|---|
| `agentdb_*` MCP tools | "19 controllers" → implies tools | **15 tools** | `v3/@claude-flow/cli/src/mcp-tools/agentdb-tools.ts:629–645` (`agentdbTools` export array) |
| `embeddings_*` MCP tools | 7 enumerated in skill | **10 tools** | `v3/@claude-flow/cli/src/mcp-tools/embeddings-tools.ts:159, 260, 328, 418, 520, 717, 835, 910, 926, 970` |
| `ruvllm_hnsw_*` MCP tools | 3 enumerated | **3 tools** (correct) but capacity is **~11 patterns**, not 10,000 | `v3/@claude-flow/cli/src/mcp-tools/ruvllm-tools.ts:57–58` ("Max ~11 patterns (v2.0.1 limit)") |
| Controllers in `ControllerRegistry` | "19" | **29** names across 6 init levels: 13 AgentDB-layer + 16 CLI-layer | `v3/@claude-flow/memory/src/controller-registry.ts:34–73` (type `ControllerName`) and `:160–174` (`INIT_LEVELS`) |
| RaBitQ 1-bit quantization | Not documented | 32× compression, two-phase Hamming-prefilter + exact-rerank pipeline | `embeddings_rabitq_build`, `_search`, `_status` at `embeddings-tools.ts:910, 926, 970`; impl at `v3/@claude-flow/cli/src/memory/rabitq-index.ts` |
| HNSW tuning (`efSearch`, `efConstruction`, `M`) | Not surfaced in any skill | `efSearch` accepted as a constructor param on `ruvllm_hnsw_create`; `efConstruction` defaulted to 200 in the lite index; `M` not exposed via MCP | `ruvllm-tools.ts:64`, `v3/@claude-flow/memory/src/hnsw-index.ts:537` |
| Pattern-store fallback when ReasoningBank unavailable | Not documented | ADR-093 F4: when controller registry returns null, `agentdb_pattern-store` writes to `memory_store` with `controller: 'memory-store-fallback'` | `agentdb-tools.ts:138–161` |
| Native graph-node backend for causal edges | Not documented | ADR-087: `agentdb_causal-edge` tries graph-node first, falls back to bridge | `agentdb-tools.ts:267–290` |
| `agentdb` npm dep version | Not pinned in plugin | `agentdb: ^3.0.0-alpha.11` in CLI's `package.json:120`; `pnpm-lock.yaml` resolves multiple versions (1.6.1, 2.0.0-alpha.3.4/3.7, 3.0.0-alpha.10/11) | `v3/@claude-flow/cli/package.json:120`; `v3/node_modules/.pnpm/` |

The "19 controllers" number appears to be a stale snapshot from before ADR-095 G7 closed five disabled-by-default controllers (`gnnService`, `rvfOptimizer`, `mutationGuard`, `attestationLog`, `GuardedVectorBackend`) and before ADR-053 added `mmrDiversityRanker`, `contextSynthesizer`, `batchOperations`, `memoryConsolidation`, `hierarchicalMemory` to the CLI-layer registry. The plugin README block on G7 (`README.md:22–35`) is accurate about the five activated controllers and about `graphAdapter` still being disabled — but the surrounding "19" framing is not.

### What's missing entirely

Beyond the count drift, the plugin omits four substantive capabilities of the substrate it documents:

1. **Quantization.** `embeddings_rabitq_*` provides 32× memory reduction at index time. CLAUDE.md's V3 perf targets explicitly call out "Memory Reduction 50–75% with quantization" as **Implemented**; the plugin advertises HNSW speedup but never mentions quantization.
2. **Index tunables.** `efSearch` / `efConstruction` / `M` directly control the recall/latency tradeoff; the plugin presents HNSW as a binary "150–12,500×" claim with no operating points.
3. **Namespacing convention.** Every consumer plugin (`ruflo-browser` defines `browser-sessions / browser-selectors / browser-templates / browser-cookies` in its ADR-0001 §3; `ruflo-rag-memory` references `claude-memories / patterns / tasks / solutions`; `ruflo-intelligence` writes to `pattern`) reinvents namespace naming. There is no contract from `ruflo-agentdb` about how namespaces should be named, what they should contain, or how they are GC'd. The `agentdb_*` tools mostly do not even take a namespace parameter — they route to controllers (`reasoningBank`, `hierarchicalMemory`, `causalGraph`) — but the CLI fallback `memory_store` and `embeddings_search` *do* take namespace strings, so the surface is mixed and undocumented.
4. **Token-efficiency path.** The repo ships `getCompactContext` on the `TokenOptimizer` (`v3/@claude-flow/integration/src/token-optimizer.ts:109`), and `agentdb_context-synthesize` exists for the same goal at the MCP layer. Neither is surfaced by the plugin as a "use this when you want compact retrieved context for an LLM call" workflow.

### Why now

`ruflo-agentdb` is the substrate plugin — `ruflo-browser` (ADR-0001) explicitly depends on AgentDB namespaces and controller-managed sessions; `ruflo-rag-memory` and `ruflo-intelligence` route through the same controllers; the whole "memory-as-substrate" story in `CLAUDE.md` rests on it. Documentation drift in this plugin is contagious — every downstream plugin inherits the wrong tool count, the wrong controller count, and the missing quantization story. We just fixed the same class of drift in `ruflo-ruvector` (ADR-0001 there); the same pattern applies here.

## Decision

We propose six changes to `ruflo-agentdb`. None requires modifying AgentDB itself; all are plugin-local edits plus one new smoke script.

### 1. Replace "19 controllers" with the real registry, and pin its source

The plugin currently treats "19" as a magic number repeated across five files. Replace it with two explicit references to the real source:

- **README.md** swaps the blanket "19 AgentDB controllers" line for a table generated from `INIT_LEVELS` at `controller-registry.ts:160–174`. Group by init level (0–6) so the dependency story is visible. Mark each row as one of: `active by default`, `gated on dependency`, `disabled-pending-ADR`. Cite the source file + line.
- **agents/agentdb-specialist.md** drops the "19 Controllers" header and replaces the bullet groups with a one-line "controllers are listed at runtime via `agentdb_controllers`; see registry source for the canonical list."
- **commands/agentdb.md** drops the "all 19 controllers" string from step 2; the step now reads "list whatever the runtime reports".
- **skills/agentdb-query/SKILL.md** §"19 Controllers" becomes "Available controller groups" and lists only the four functional categories already in the skill (hierarchical, pattern, semantic, causal).

The point isn't to memorize the count — it's to stop hard-coding any count. The runtime tool `agentdb_controllers` is already the source of truth; documentation should defer to it.

### 2. Surface `embeddings_rabitq_*` as a first-class quantization workflow

Add a new section to `skills/vector-search/SKILL.md` titled "Quantized search (32× memory)" with:

- A 5-step recipe: `embeddings_init` → `embeddings_rabitq_build` (one-time, after corpus is loaded) → `embeddings_rabitq_search` (Hamming-prefilter to top-N candidates) → optional rerank via `embeddings_search` (exact, on the candidate set) → `embeddings_rabitq_status` for index health.
- A "when to use" rule: corpora ≥ 5,000 vectors and/or memory-constrained environments. Below that, the rebuild cost outweighs the savings.
- The exact tool names added to the `allowed-tools` frontmatter line.
- A note: RaBitQ `_search` returns candidate IDs only; the rerank step is the user's responsibility (mirrors the docstring at `embeddings-tools.ts:911`).

`embeddings_neural` (line 520) is the other undocumented `embeddings_*` tool. It is the substrate-level entry point and is implicitly covered by `embeddings_init`/`_generate`; we will add a one-line note to `commands/embeddings.md` acknowledging it exists, and stop there. We do not invent a second skill for it.

### 3. Expose HNSW tuning as a deliberate, documented choice

The plugin currently presents HNSW as a magic number (`12,500x faster` at `vector-search/SKILL.md:50`). That number is the published ceiling under specific parameters; without surfacing those parameters the claim is unfalsifiable.

`skills/vector-search/SKILL.md` gets a new "Tuning" section that documents three operating points and ties each to a tool call:

| Profile | `efSearch` | `M` | Use case |
|---------|-----------|-----|----------|
| `recall-first` | 200 | 32 | Pattern recall during planning, search quality matters more than ms |
| `balanced` (default) | 64 | 16 | General-purpose semantic recall |
| `latency-first` | 16 | 8 | Hot-path routing where p99 latency matters |

`efSearch` is passed via `ruvllm_hnsw_create` (`ruvllm-tools.ts:64`). `M` is not currently MCP-exposed; we document it as a registry-level setting with a forward reference: "raise as a follow-up ADR if `M` should be MCP-tunable."

We also fix the speed claim. The 12,500× number is for the embeddings/HNSW path inside `@claude-flow/memory`, not for the WASM `ruvllm_hnsw_*` tools — those are capped at ~11 patterns (`ruvllm-tools.ts:58`). The skill currently lumps them together. The new copy reads: "`embeddings_search` uses the `@claude-flow/memory` HNSW index (large-scale, 150–12,500×). `ruvllm_hnsw_*` is a separate WASM-backed router for ≤11 high-priority patterns — useful for hot routes, not for corpus search."

### 4. Define a namespace convention contract for downstream plugins

Add a new section to `README.md` titled **"Namespace convention"** that ruflo-agentdb owns and downstream plugins consume. The contract:

- **Naming**: `<plugin-stem>-<intent>` kebab-case. Examples: `browser-sessions`, `browser-selectors`, `browser-cookies` (ruflo-browser), `claude-memories` (ruflo-rag-memory's bridge), `pattern` (ruflo-intelligence ReasoningBank fallback).
- **Three reserved namespaces** owned by the AgentDB plugin itself, not to be shadowed: `pattern` (ReasoningBank fallback writes here per `agentdb-tools.ts:144`), `claude-memories` (Claude Code auto-memory bridge target), `default` (`memory_store` default per `memory-tools.ts:194`).
- **Controller routing**: tools in the `agentdb_hierarchical-*` family route by `tier` (`working|episodic|semantic`) not by namespace; tools in the `agentdb_pattern-*` family route by ReasoningBank, again not by namespace. Document explicitly that namespace strings only apply to `memory_*` and `embeddings_search` paths. This stops downstream plugins from passing a `namespace` arg to `agentdb_pattern-store` and being silently confused when it's ignored.
- **GC posture**: ruflo-agentdb does not GC namespaces. Consumer plugins that want lifecycle (e.g., `browser-sessions` after `purge`) own their own deletion via `memory_delete` + `agentdb_consolidate`. Document this so consumers don't expect cleanup we don't provide.
- **Naming guardrail**: a namespace SHOULD NOT contain `:` (collides with key-internal delimiters used in the bridge), MUST be ≤200 chars, and MUST pass `validateIdentifier` (the same validator already used in `agentdb-tools.ts:122`).

This section is the load-bearing artifact for cross-plugin discipline. Without it, every plugin author re-invents.

### 5. Document the operational fallbacks that already exist

Three fallback paths exist in the bridge code and are invisible in the plugin's docs:

- **Pattern-store fallback** (`agentdb-tools.ts:138–161`, ADR-093 F4): when ReasoningBank's controller registry is unavailable, `agentdb_pattern-store` returns `controller: 'memory-store-fallback'`. Document this in `agents/agentdb-specialist.md` so the agent does not interpret a fallback response as a soft failure.
- **Causal-edge graph-node backend** (`agentdb-tools.ts:267–290`, ADR-087): `agentdb_causal-edge` tries the native `@ruvector/graph-node` backend first, then the bridge. Document the `_graphNodeBackend: true` field so consumers can branch on it.
- **Bridge unavailable** (returned by every handler when `bridgeHealthCheck` returns null): the response is `{ success: false, error: '...Use memory_store/memory_search instead.' }`. Add one paragraph in the README enumerating which `memory_*` tool replaces which `agentdb_*` tool when the bridge is unavailable.

### 6. Smoke test as the contract (mirrors ruvector ADR-0001 §5)

Add `scripts/smoke.sh` (file does not exist yet — first one in this plugin). It runs against any environment that has `npx @claude-flow/cli@latest` available with MCP enabled. Each check is a one-liner around `mcp tool call ... --json` + `jq`. The contract is "10 passed, 0 failed".

Numbered checks (this is the verifiable artifact, not the prose above):

1. `agentdb_health` returns `{ available: true, ... }`. The bridge is wired.
2. `agentdb_controllers.total >= 15` and `agentdb_controllers.active >= 10`. The lower-bound assertions are deliberately loose — they verify "the registry initialized at all" without hard-coding the 29-name `ControllerName` union or the 15 `agentdb_*` MCP tools (which are different counts). If a future ADR removes a default-active controller, raise the floor; do not raise the test to an exact match.
3. The 15 documented `agentdb_*` tool names are all callable: `agentdb_health, agentdb_controllers, agentdb_pattern-store, agentdb_pattern-search, agentdb_feedback, agentdb_causal-edge, agentdb_route, agentdb_session-start, agentdb_session-end, agentdb_hierarchical-store, agentdb_hierarchical-recall, agentdb_consolidate, agentdb_batch, agentdb_context-synthesize, agentdb_semantic-route`. Each gets a smoke call with minimal args; non-error response = pass.
4. The 10 documented `embeddings_*` tools are all callable: `embeddings_init, embeddings_generate, embeddings_compare, embeddings_search, embeddings_neural, embeddings_hyperbolic, embeddings_status, embeddings_rabitq_build, embeddings_rabitq_search, embeddings_rabitq_status`.
5. The 3 documented `ruvllm_hnsw_*` tools are all callable: `ruvllm_hnsw_create` (dim=384, max=11), `ruvllm_hnsw_add`, `ruvllm_hnsw_route`.
6. RaBitQ build runs: `embeddings_rabitq_build` then `embeddings_rabitq_status` reports `available: true`.
7. Pattern-store with the bridge intentionally unavailable returns `controller: 'memory-store-fallback'`. **Caveat — this check has a load-bearing unverified assumption:** the env-var name `MEMORY_BRIDGE_DISABLE=1` was inferred from the fallback code path, not confirmed against the actual gating mechanism in `bridgeHealthCheck`. Implementer must grep `agentdb-tools.ts` + `memory-bridge.ts` for the real switch (it may instead key on `AGENTDB_BRIDGE`, on a missing AgentDB controller, or on no env var at all). If no clean runtime switch exists, downgrade this check to a code-path inspection (assert the fallback string literal is reachable in source) rather than a runtime assertion.
8. `agentdb_hierarchical-store` rejects a `tier` value not in `{working, episodic, semantic}` (regression on `agentdb-tools.ts:426`).
9. `agentdb_batch` rejects a 501-element entries array (regression on `MAX_BATCH_SIZE = 500` at `agentdb-tools.ts:20`).
10. Namespace convention guardrails: `memory_store --namespace 'has:colon'` is rejected; `memory_store --namespace '<205 chars>'` is rejected (tests the rule we just documented).

The script does NOT test the controller count exactly, does NOT depend on `agentdb` being a specific minor version, and does NOT exercise the disabled `graphAdapter` controller. Those are explicit non-goals.

### 7. Pinning posture

Following ruvector ADR-0001:

- Add a "Compatibility" subsection to README.md that states: "Plugin v0.3.x targets `@claude-flow/cli` v3.6.x with bundled `agentdb@^3.0.0-alpha.11`. The plugin is documentation-only and does not pin via package.json; the smoke contract is the verification mechanism."
- Bump `.claude-plugin/plugin.json` to `0.3.0` when this ADR's changes land. Patch bumps thereafter for accuracy fixes; minor for new namespace-convention rules or new MCP tools surfaced.
- Plugin pins the **CLI**'s major+minor (`v3.6`), not the npm `agentdb` package, because the CLI is the layer the plugin actually invokes. AgentDB internals (e.g., the alpha.11 → alpha.12 bump) are not the plugin's contract.

## Consequences

**Positive:**

- Every count, tool name, and capability claim in the plugin matches a verifiable line in the source. The "19 controllers" myth is gone.
- RaBitQ goes from invisible to a documented quantization workflow — downstream plugins handling large corpora (`ruflo-rag-memory`, future `ruflo-knowledge-graph` integrations) get a 32× memory-reduction story by reference, not by re-discovery.
- HNSW becomes tunable instead of a magic number. Consumer plugins choose an operating point.
- A namespace convention exists. `ruflo-browser`'s ADR §3 already implements it ad hoc; this ADR formalizes it so the next plugin author doesn't re-derive it.
- Operational fallbacks (pattern-store fallback, graph-node backend) are now part of the contract; agents can branch on them deterministically.
- `scripts/smoke.sh` makes plugin-level regressions catchable in CI.

**Negative:**

- Three downstream plugins reference "19 controllers" in their own docs (grep across `plugins/`). Updating them is a separate, mechanical task — but if it's not done, the inconsistency moves rather than disappears.
- The namespace convention is non-binding (we have no enforcement in the bridge). It documents intent. If a downstream plugin ignores it, the substrate still works — it just gets harder to reason about. Future enforcement would be a `validate-namespace` helper exposed via MCP, but that is out of scope here.
- Smoke depends on the daemon being healthy and the embeddings backend being warm. Cold-start runs may flake on `embeddings_rabitq_build` if no vectors are loaded yet. Mitigation: smoke seeds 10 vectors via `memory_store` before exercising the rabitq path.
- We do not propose changing `agentdb-tools.ts` itself. Some of the "19 controllers" claim is upstream framing in the AgentDB README too; we cannot unilaterally fix that, only stop propagating it from the plugin.

**Neutral:**

- Plugin version moves `0.2.0` → `0.3.0`. Semver-minor because the namespace convention is a new contract for consumers, not a removal.
- No new MCP tools are introduced. We are surfacing existing surface, not extending it.
- No change to the `.claude-plugin/plugin.json` keywords beyond optionally adding `rabitq` and `quantization`. Keywords are advisory only.

## Verification

A future implementation must satisfy this smoke contract before the ADR moves from Proposed → Accepted:

```bash
bash plugins/ruflo-agentdb/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

Plus three documentation invariants checked by a one-line `grep` each:

- `! grep -rn "19 AgentDB controllers\|all 19 controllers\|19 Controllers" plugins/ruflo-agentdb/` — no occurrence remains.
- `grep -q "embeddings_rabitq_build" plugins/ruflo-agentdb/skills/vector-search/SKILL.md` — quantization workflow is documented.
- `grep -q "Namespace convention" plugins/ruflo-agentdb/README.md` — namespace contract section exists.

## Related

- `plugins/ruflo-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md` — pinning + smoke-as-contract precedent (this ADR mirrors §5 and §6).
- `plugins/ruflo-browser/docs/adrs/0001-browser-skills-architecture.md` — `browser-*` namespace family that motivated §4 (namespace convention contract).
- `v3/docs/adr/ADR-053-...` — controller activation pipeline (referenced by the bridge module docstring at `memory-bridge.ts:5`).
- `v3/docs/adr/ADR-087-graph-node-native-backend.md` — graph-node backend used as the primary `agentdb_causal-edge` path.
- `v3/docs/adr/ADR-093-mcp-audit-may-2026-remediation.md` — F4 introduced the `memory-store-fallback` controller string surfaced by §5.
- `v3/docs/adr/ADR-095-architectural-gaps-from-april-audit.md` — G7 closed five disabled controllers; the README block `README.md:22–35` summarizes G7 correctly.
- `v3/@claude-flow/cli/src/mcp-tools/agentdb-tools.ts` — 15 `agentdb_*` tool definitions (canonical surface for §6 check 3).
- `v3/@claude-flow/cli/src/mcp-tools/embeddings-tools.ts` — 10 `embeddings_*` tool definitions including RaBitQ trio at `:910–981`.
- `v3/@claude-flow/cli/src/mcp-tools/ruvllm-tools.ts` — 3 `ruvllm_hnsw_*` tools, ~11-pattern WASM cap at `:58`.
- `v3/@claude-flow/memory/src/controller-registry.ts:34–73` — `ControllerName` union (canonical 29-name list).
- `v3/@claude-flow/memory/src/controller-registry.ts:160–174` — `INIT_LEVELS` (canonical dependency-ordered grouping).
- `v3/@claude-flow/cli/src/memory/rabitq-index.ts` — RaBitQ implementation referenced by the quantization workflow in §2.
- `v3/@claude-flow/integration/src/token-optimizer.ts:109` — `getCompactContext` token-efficiency path (deferred: §6 covers `agentdb_context-synthesize` only; the integration-layer optimizer is a separate ADR if surfaced).
