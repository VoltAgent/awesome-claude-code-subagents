---
id: ADR-0001
title: Optimize ruflo-intelligence — surface completeness, 4-step pipeline, IPFS pattern transfer, namespace coordination with ruflo-agentdb
status: Proposed
date: 2026-05-04
authors:
  - reviewer (Claude Code)
tags: [plugin, intelligence, sona, microlora, moe, ewc, hnsw, hooks, transfer, namespace, smoke-test]
---

## Context

### Today's `ruflo-intelligence`

The plugin (v0.1.0) wraps "intelligence" capabilities loosely. Six files:

- `.claude-plugin/plugin.json:4` — `version: "0.1.0"`, keywords `intelligence, sona, neural, learning, routing`
- `README.md:5` — claims wrapping of `neural_*`, `hooks_intelligence_*`, `hooks_model-*` MCP families. No tool inventory or count.
- `agents/intelligence-specialist.md:15-19` — names four tool prefixes (`neural_*`, `hooks_intelligence_*`, `hooks_route`/`hooks_model-route`, `ruvllm_sona_*`)
- `commands/intelligence.md` — calls `hooks_intelligence_stats`, `neural_status`, `hooks_model-stats` only
- `commands/neural.md` — dispatches `neural_train`/`status`/`patterns`/`predict`/`optimize`
- `skills/intelligence-route/SKILL.md:5` — `allowed-tools` enumerates 8 tools
- `skills/neural-train/SKILL.md:5` — `allowed-tools` enumerates 13 tools

### What the CLI actually exposes (verified on 2026-05-04)

Counted directly from source:

| Family | Plugin coverage | Real count | Source |
|--------|-----------------|------------|--------|
| `neural_*` | 5 of 6 | **6** (`neural_train`, `neural_predict`, `neural_patterns`, `neural_compress`, `neural_status`, `neural_optimize`) | `v3/@claude-flow/cli/src/mcp-tools/neural-tools.ts:195, 312, 413, 539, 651, 706` |
| `hooks_intelligence_*` (and dispatcher / reset) | 6 of 10 | **10** (`hooks_intelligence`, `hooks_intelligence-reset`, `hooks_intelligence_trajectory-start/step/end`, `hooks_intelligence_pattern-store`, `hooks_intelligence_pattern-search`, `hooks_intelligence_stats`, `hooks_intelligence_learn`, `hooks_intelligence_attention`) | `v3/@claude-flow/cli/src/mcp-tools/hooks-tools.ts:2093, 2226, 2296, 2355, 2404, 2556, 2634, 2741, 2952, 3027` |
| Routing & meta hooks (`hooks_route`, `hooks_explain`, `hooks_pretrain`, `hooks_build-agents`, `hooks_metrics`, `hooks_transfer`) | 1 of 6 (only `hooks_route`) | **6** | `hooks-tools.ts:884, 1062, 1420, 1499, 1593, 1664` |
| `hooks_model-*` | 2 of 3 | **3** (`hooks_model-route`, `hooks_model-outcome`, `hooks_model-stats`) | `hooks-tools.ts:3797, 3844, 3879` |
| `ruvllm_sona_*` + `ruvllm_microlora_*` | 2 of 4 (only sona_create / sona_adapt) | **4** | `v3/@claude-flow/cli/src/mcp-tools/ruvllm-tools.ts:142, 169, 192, 222` |
| **Total** | ~14 of **29** | **29** | — |

The plugin documents roughly half the intelligence-related surface that the CLI actually exposes. Specifically missing or underspecified:

- **`hooks_intelligence_attention`** — attention-mechanism dispatch (the same primitive `ruflo-ruvector` surfaces via `attention list`). Plugin makes no mention.
- **`hooks_intelligence_learn`** — the "learn from outcomes" tool, the heart of the self-learning loop.
- **`hooks_intelligence-reset`** — clears intelligence state. Useful for testing and fresh runs.
- **`hooks_metrics`** — metrics dashboard. Plugin's `/intelligence` command should call it.
- **`hooks_explain`** — routing-decision rationale. Critical for trust ("why did the system pick this agent?").
- **`hooks_build-agents`** — generates optimized agent configs from learned patterns.
- **`hooks_transfer`** — **IPFS-based pattern transfer between projects**. Genuine differentiator, totally invisible in the plugin.
- **`ruvllm_microlora_create` / `ruvllm_microlora_adapt`** — MicroLoRA adaptation. Plugin only mentions SONA.
- **`neural_compress`** — neural-pattern compression for storage efficiency.

### What's claimed but unsurfaced

`README.md:20` claims **"EWC++ consolidation"** as a feature. The plugin nowhere says how to invoke it. The actual EWC++ semantic lives in `agentdb_consolidate` and `ruvllm_microlora_adapt --consolidate` (per the ruvector adaptive embedder). The plugin should map the feature claim to the tool that delivers it.

`agents/intelligence-specialist.md:9` mentions **"SONA and MoE"**. SONA gets two tool calls; MoE gets none. `hooks_intelligence` accepts `enableMoe` and `mode`, but the plugin never tells you the modes (`balanced`, `sona`, `moe`, `hnsw`).

CLAUDE.md describes the **4-step intelligence pipeline (RETRIEVE → JUDGE → DISTILL → CONSOLIDATE)**. The plugin never surfaces this pipeline in user-facing form, even though it's the conceptual frame the whole substrate revolves around.

### Namespace coordination

`ruflo-agentdb` ADR-0001 (just landed) introduced a namespace convention with three reserved namespaces: `pattern` (ReasoningBank fallback), `claude-memories` (Claude Code bridge), `default`. **The intelligence pipeline writes to `pattern`** (via `agentdb_pattern-store` and the `hooks post-task --train-neural` path). The plugin should explicitly cite the convention so consumers don't reinvent it.

There's also a pluralization gotcha worth surfacing here: ruvector's neural/pretrain hooks write to `patterns` (plural), distinct from ReasoningBank's `pattern`. `ruflo-agentdb` documents this; `ruflo-intelligence` should reference the documentation.

### Why now

`ruflo-intelligence` is the **user-facing** surface for the self-learning system that the rest of the plugin family relies on. Documentation drift here means:

1. Agents that follow the plugin's instructions miss half the available learning loop.
2. `hooks_transfer`'s IPFS-based cross-project pattern sharing — a genuine differentiator — is invisible.
3. The 4-step pipeline is never operationalized; users invoke `neural_train` without understanding RETRIEVE/JUDGE/DISTILL/CONSOLIDATE as distinct steps.
4. Downstream plugins (`ruflo-browser` ADR-0001 references trajectory recording; `ruflo-agentdb` references `pattern` namespace writes) lose their anchor doc.

We just fixed analogous drift in `ruflo-ruvector` (ADR-0001) and `ruflo-agentdb` (ADR-0001). Same pattern applies here.

## Decision

Six changes. Each is plugin-local; no CLI source modifications.

### 1. Plugin metadata bump and accurate keyword set

`plugin.json` moves `0.1.0 → 0.3.0` (matches the ruflo-agentdb cadence and reflects that this is a **substantial scope expansion**, not a patch). Keywords gain `microlora`, `ewc`, `attention`, `moe`, `pattern-transfer`, `model-routing`, `mcp`. Description rewrites to explicitly enumerate the three families and the IPFS transfer.

### 2. README rewrite — surface completeness + 4-step pipeline + IPFS transfer

The README becomes the canonical entry point with these new sections:

- **Tool inventory** (3-family count table: 6 + 10 + 9 + 4 = **29**, with source file:line citations).
- **The 4-step intelligence pipeline** — operationalized as a section that maps each step (RETRIEVE / JUDGE / DISTILL / CONSOLIDATE) to specific tool calls. Aligns with CLAUDE.md but is now verifiable.
- **Cross-project pattern transfer** — `hooks_transfer` documented end-to-end (IPFS publish, fetch, apply). This is the single most undersold capability of the plugin family.
- **Hook integration** — table mapping `post-task --train-neural`, `pretrain`, `pre-task` to which intelligence tools fire. References ruflo-agentdb's reserved namespaces (`pattern` for ReasoningBank, `patterns` for neural-train).
- **Namespace coordination** — explicit deferral to `ruflo-agentdb` ADR-0001 §"Namespace convention"; reproduces the pluralization gotcha (`pattern` vs `patterns`).
- **EWC++ explanation** — no longer just a feature claim. Maps to `agentdb_consolidate` and `ruvllm_microlora_adapt --consolidate`.
- **MoE explanation** — `hooks_intelligence` modes (`balanced` / `sona` / `moe` / `hnsw`) enumerated.
- **Compatibility** — pinned to `@claude-flow/cli` v3.6 (matches ruflo-agentdb).

### 3. Agent rewrite — tool routing matrix

`agents/intelligence-specialist.md` gains a **routing matrix** that maps user intent to the specific MCP tool: "user wants routing rationale → `hooks_explain`"; "user wants pattern compression → `neural_compress`"; etc. Replaces the bullet list of prefixes with a decision table. Drops the free-form `memory store --namespace routing-outcomes` line (the tools handle this).

### 4. Commands fill in the gaps

- `/intelligence` — calls `hooks_intelligence_stats` + `hooks_metrics` + `hooks_model-stats` + `neural_status` + `hooks_explain` (when invoked with a `--why <task>` arg). Becomes a real dashboard, not a 4-step list.
- `/neural` — adds `neural_compress` to the dispatch table.

### 5. Skills

- `intelligence-route/SKILL.md` — adds `hooks_explain` as the post-routing rationale step. Updates the 3-tier routing table to match the actual `hooks_model-route` output shape.
- `neural-train/SKILL.md` — adds **MicroLoRA** section (`ruvllm_microlora_create` / `_adapt`) with EWC++ consolidation. Adds `neural_compress` for pattern compaction.
- **NEW skill `intelligence-transfer`** — `hooks_transfer` IPFS workflow. Covers `transfer store`, `transfer load`, `transfer from-project`. This is the single biggest gap in the current plugin.

### 6. Smoke contract

`scripts/smoke.sh` (new file). Structural checks against the documented surface — no live MCP calls. The contract:

1. plugin.json declares `0.3.0` with the new keywords.
2. README has all 4 new sections (tool inventory, 4-step pipeline, IPFS transfer, hook integration, namespace coordination, EWC++ explanation).
3. All 6 `neural_*` tools referenced somewhere in plugin docs.
4. All 10 `hooks_intelligence_*`-family tools referenced.
5. All 6 routing/meta hooks (`hooks_route`, `hooks_explain`, `hooks_pretrain`, `hooks_build-agents`, `hooks_metrics`, `hooks_transfer`) referenced.
6. All 3 `hooks_model-*` tools referenced.
7. All 4 SONA + MicroLoRA tools referenced.
8. The 4-step pipeline section names all four phases.
9. `intelligence-transfer` skill exists with allowed-tools enumerated and references `hooks_transfer`.
10. Pluralization gotcha referenced (`pattern` vs `patterns`) — defers to ruflo-agentdb.
11. No skill grants wildcard tool access.
12. ADR file exists with status Proposed.
13. Compatibility section pins to `@claude-flow/cli` v3.6.

Plus three doc invariants checked by single-line greps:

- `grep -q "4-step intelligence pipeline" plugins/ruflo-intelligence/README.md`
- `grep -q "hooks_transfer" plugins/ruflo-intelligence/skills/intelligence-transfer/SKILL.md`
- `grep -qE "RETRIEVE.+JUDGE.+DISTILL.+CONSOLIDATE" plugins/ruflo-intelligence/README.md`

## Consequences

**Positive:**

- Every documented capability claim maps to a verifiable MCP tool. No more "EWC++ consolidation" as a phantom feature.
- The 4-step intelligence pipeline (CLAUDE.md's V3 framing) is now operationalized in a user-facing form.
- IPFS pattern transfer becomes discoverable — agents in different projects can share what they've learned.
- Namespace coordination with `ruflo-agentdb` is explicit; downstream plugins inherit one consistent story.
- A smoke contract makes future drift catchable in CI.

**Negative:**

- Three downstream agents may currently call the legacy `memory store --namespace routing-outcomes` pattern from the agent file. Updating them is a separate cleanup.
- The new `intelligence-transfer` skill assumes `hooks_transfer` is wired to a working IPFS endpoint (Pinata or similar). If the endpoint is unconfigured, the skill returns a structured error — but agents reading the skill MD may be surprised. We document the prerequisite.
- Plugin v0.1.0 → v0.3.0 is a two-minor jump. Justified by scope (5 new sections + new skill + smoke + ADR), but consumers tracking strict semver should be aware.

**Neutral:**

- No new MCP tools introduced. All capability is **surfacing** of existing tools.
- The agent file's "Memory Learning" section (currently writing to a free-form `routing-outcomes` namespace) is replaced. Consumers of that namespace should migrate to `hooks_model-outcome` which is the typed equivalent.

## Verification

```bash
bash plugins/ruflo-intelligence/scripts/smoke.sh
# Expected: "16 passed, 0 failed" (13 contract checks + 3 doc invariants)
```

## Related

- `plugins/ruflo-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md` — pinning + smoke-as-contract precedent
- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention + reserved namespaces (`pattern`/`claude-memories`/`default`); pluralization gotcha; hook integration table
- `plugins/ruflo-browser/docs/adrs/0001-browser-skills-architecture.md` — uses ruvector trajectory hooks (a primary learning input for this plugin)
- `v3/@claude-flow/cli/src/mcp-tools/neural-tools.ts` — 6 neural tool definitions
- `v3/@claude-flow/cli/src/mcp-tools/hooks-tools.ts` — 19 hooks-family tools (intelligence, route, model, transfer, metrics, explain, pretrain, build-agents)
- `v3/@claude-flow/cli/src/mcp-tools/ruvllm-tools.ts` — 4 SONA + MicroLoRA tools
- CLAUDE.md (V3 Performance Targets + 4-step pipeline framing)
