# ADR-099: Dossier-Investigator — Recursive Parallel Multi-Source Research for `ruflo-goals`

**Status**: Accepted — Implemented
**Date**: 2026-05-03 · **Updated**: 2026-05-09
**Version**: shipped in `plugins/ruflo-goals` (0.1.0 → 0.2.0)
**Supersedes**: nothing
**Related**: ADR-098 (plugin capability sync), `plugins/ruflo-goals/agents/deep-researcher.md`, `plugins/ruflo-knowledge-graph`, `plugins/ruflo-rag-memory`

## Context

The `ruflo-goals` plugin currently ships three agents:

| Agent | Pattern | Output |
|---|---|---|
| `goal-planner` | GOAP / A* over state space | Action plan |
| `deep-researcher` | Linear multi-source synthesis with evidence grading | Graded findings document |
| `horizon-tracker` | Long-horizon objective tracking with drift detection | Milestone state |

Inspired by [maigret](https://github.com/soxoj/maigret) (3,000+ source parallel username enumeration with recursive expansion and structured dossier reporting), we identified a structurally distinct research pattern that none of the three existing agents implements as a first-class loop:

1. **Massively parallel breadth fan-out** — query N sources concurrently for a seed entity rather than sequentially.
2. **Recursive expansion** — entities discovered in round *k* become seeds for round *k+1*, bounded by a depth/budget cap.
3. **Structured dossier output** — graph + markdown + JSON, with provenance per claim, suitable for export.

`deep-researcher` does evidence-graded synthesis but expects a human-curated source list and runs essentially linearly. It has no recursive seeding loop and no parallel fan-out primitive.

Ruflo already ships every primitive needed to assemble a maigret-style investigator without adding new external dependencies:

| Capability | Existing tool |
|---|---|
| Hybrid sparse+dense semantic search | `mcp__claude-flow__memory_search_unified`, `ruflo-rag-memory:memory-search` |
| Vector search (HNSW, RaBitQ) | `mcp__claude-flow__embeddings_search`, `embeddings_rabitq_search` |
| Pattern recall | `mcp__claude-flow__agentdb_pattern-search`, `agentdb_hierarchical-recall` |
| Knowledge-graph traversal + extraction | `ruflo-knowledge-graph:kg-traverse`, `kg-extract` |
| Web search & fetch | `WebSearch`, `WebFetch` |
| Codebase queries | `Grep`, `Glob`, `Read` |
| ADR index lookup | `ruflo-adr:adr-index` |
| Git intelligence | `ruflo-jujutsu:diff-analyze` |
| Parallel agent fan-out | `ruflo-swarm:swarm-init` (mesh topology) |
| Trajectory recording | `mcp__claude-flow__hooks_intelligence_trajectory-*` |

## Decision

Add a new agent `dossier-investigator` and a companion skill `dossier-collect` to `plugins/ruflo-goals`.

### Agent: `dossier-investigator`

- **Model**: `sonnet` (matches sibling agents; structured orchestration, not creative writing)
- **Role**: Orchestrate parallel + recursive multi-source intelligence gathering on a seed entity, producing a graph-structured dossier with provenance.
- **Inputs**: `{ seed: string, sources?: string[], maxDepth?: number=2, maxBreadth?: number=8, budget?: { tokens?, usd? } }`
- **Outputs**: `dossier` namespace memory entry + markdown report + optional `kg-extract` ingest.

### Skill: `dossier-collect`

User-facing slash skill that drives the agent. Steps:

1. **Seed validation** — normalize seed (entity type detection: file path / symbol / username / URL / ADR-id / concept).
2. **Source plan** — pick which of the available tools apply to the seed type; user can override via `--sources`.
3. **Round 0 fan-out** — issue all source queries in parallel via a single batched message (one Task call per source where useful, otherwise direct MCP calls).
4. **Entity extraction** — for each hit, run `ruflo-knowledge-graph:kg-extract` (or a lightweight regex pass for obvious cases) to surface new entities.
5. **Recursive expansion** — for each new entity not already in the dossier, schedule round *k+1* until `maxDepth` or `budget` is hit. Apply de-duplication via embedding similarity (threshold 0.92).
6. **Aggregation** — collapse hits into a graph: nodes = entities, edges = "discovered-via" with source provenance.
7. **Reporting** — render markdown + JSON; optionally export to KG via `kg-extract` ingest.
8. **Persist** — store in `dossier` namespace and record trajectory.

### Rejected alternatives

| Option | Why rejected |
|---|---|
| **Extend `deep-researcher`** | Would couple two structurally different loops (linear-graded vs parallel-recursive) into one prompt; would push the prompt past the 80-line guideline flagged in ADR-098. |
| **Bundle Python `maigret` as an MCP wrapper** | Adds a Python runtime dependency, network egress to 3,000+ sites, and a privacy/abuse posture that's out of scope for a developer-research tool. We want maigret's *pattern*, not its target list. |
| **Build into `ruflo-knowledge-graph`** | KG plugin is about graph operations on already-extracted data; investigator is about *acquisition*. Keeping it in `ruflo-goals` puts it next to its peers (`deep-researcher`, `goal-planner`). |

### Tradeoff: ~40% overlap with `deep-researcher`

`deep-researcher` and `dossier-investigator` will share the "query memory + KG + web" surface area. We accept this redundancy because:

- The loops are different (linear evidence-grading vs parallel-recursive expansion).
- Output formats differ (synthesis document vs entity graph + dossier).
- Selection is unambiguous: use `deep-researcher` when you have a question; use `dossier-investigator` when you have a seed and want to expand outward.

If the overlap proves excessive after first usage, we can refactor a shared `multi-source-query` helper (skill-level, not agent-level) without breaking either agent's interface.

## Consequences

### Positive

- Fills a real gap (recursive parallel investigation) without external deps.
- Reuses the full ruflo tool surface — no new MCP servers.
- Unblocks a class of tasks (`investigate this symbol / module / dependency / ADR`) that today require manual fan-out.
- Trajectory recording feeds the SONA pattern store, so future investigations get faster routing.

### Negative

- Plugin agent count goes 3 → 4. ADR-098 flagged token-cost as a watch item; we'll keep this agent prompt under 80 lines.
- Recursive expansion can blow up cost without a hard budget. The agent MUST honor `budget.tokens` and `budget.usd` and abort cleanly when hit, not silently truncate.
- De-duplication via embedding similarity has false positives; we need an `--exact` mode for entity-identity-sensitive runs.

### Neutral

- No CLI surface change (`/ruflo-goals:dossier-collect` is the only new entry point).
- No persistence schema change — uses existing `dossier` namespace under AgentDB memory.

## Implementation plan

| Step | File | Owner |
|---|---|---|
| 1. Agent prompt | `plugins/ruflo-goals/agents/dossier-investigator.md` | coder |
| 2. Skill markdown | `plugins/ruflo-goals/skills/dossier-collect/SKILL.md` | coder |
| 3. Slash command | `plugins/ruflo-goals/commands/goals.md` (add `dossier` subcommand) | coder |
| 4. Plugin manifest bump | `plugins/ruflo-goals/.claude-plugin/plugin.json` (0.1.0 → 0.2.0) | coder |
| 5. README update | `plugins/ruflo-goals/README.md` | coder |
| 6. Smoke test | `tests/plugins/ruflo-goals/dossier.spec.ts` | tester |
| 7. Ship behind a flag | `dossierInvestigator.enabled` defaulting `true` for first release | coder |

Acceptance criteria:

- Agent prompt ≤ 80 lines (per ADR-098 guidance).
- Skill correctly fans out, expands recursively, and respects `--max-depth` and `--budget`.
- Output written to `dossier` namespace with valid JSON schema.
- One end-to-end test: seed = `ADR-097`, expected entities include `federation`, `circuit-breaker`, `budget`.
- Trajectory recorded; pattern stored on success.

## Implementation status (2026-05-09)

All implementation plan steps are complete on `main`.

| Step | File | Status | Commit(s) |
|---|---|---|---|
| 1. Agent prompt | `plugins/ruflo-goals/agents/dossier-investigator.md` | Implemented | `1e11ac84e feat(ruflo-goals): dossier-investigator agent + dossier-collect skill (ADR-099) (#1726)` |
| 2. Skill markdown | `plugins/ruflo-goals/skills/dossier-collect/SKILL.md` | Implemented | same |
| 3. Slash command | `plugins/ruflo-goals/commands/goals.md` (dossier subcommand) | Implemented | same |
| 4. Plugin manifest bump | `plugins/ruflo-goals/.claude-plugin/plugin.json` (0.1.0 → 0.2.0) | Implemented | same |
| 5. README update | `plugins/ruflo-goals/README.md` | Implemented | same |
| 6. Smoke test | `tests/plugins/ruflo-goals/dossier.spec.ts` | Implemented | same |
| 7. Feature flag | `dossierInvestigator.enabled` (default `true`) | Implemented | same |
| Plugin contract adoption | `plugins/ruflo-goals/` — legacy-vs-canonical namespace mapping + ADR-099 anchor | Implemented | `714cd534c feat(ruflo-goals): adopt plugin contract — legacy-vs-canonical namespace mapping + ADR-099 anchor (ADR-0001)` |
| Dossier examples | `docs/examples/` — 3 examples (ruvnet, ADR-088, ruflo-goals) | Implemented | `ba0479612 docs(examples): add 3 dossier examples` |

### Open questions resolved during implementation

| Original question | Resolution |
|---|---|
| Will the ~40% overlap with `deep-researcher` prove excessive? | No — the two agents were used side-by-side without confusion during initial runs. The distinction (question-driven vs seed-driven) held clearly in practice. |
| Should `--exact` mode for entity-identity-sensitive runs be added at launch? | Deferred to a follow-up issue; the default 0.92 embedding-similarity threshold was sufficient for the launch use cases. |

### Deferred

- **`--exact` mode** for embedding-similarity de-duplication — no false-positive incidents in initial use; tracked as a low-priority follow-up.

---

## References

- maigret — https://github.com/soxoj/maigret (recursive-parallel pattern reference, not a runtime dep)
- `plugins/ruflo-goals/agents/deep-researcher.md` (sibling agent)
- ADR-098 (plugin token-cost guidelines)
- ADR-026 (3-tier model routing — sonnet justified for orchestration)
