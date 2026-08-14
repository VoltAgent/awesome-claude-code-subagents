# ADR-093: MCP Audit (May 2026) Remediation

**Status**: Accepted
**Date**: 2026-05-03
**Version**: v3.6.13 → v3.6.14
**Supersedes**: nothing
**Related**: ADR-092 (prior MCP validation bugfixes), issues #1686, #1697, #1698, #1700

## Context

After publishing 3.6.13 to fix five issues from the May 1–3 reports, a six-agent verification swarm exercised ~240 MCP tools across the running server. The audit confirmed many tools are real and round-trip cleanly, but surfaced a mix of pre-existing mocks (some called out in issue #1700), one fix that landed in the wrong code path (#1686), and several previously-undocumented regressions.

### Key finding: parallel hooks-tools implementations

The repo ships **two parallel implementations** of the MCP hooks surface:

| Path | Used by |
|---|---|
| `v3/mcp/tools/hooks-tools.ts` | Standalone `mcp` package (not loaded by the `claude-flow` MCP server) |
| `v3/@claude-flow/cli/src/mcp-tools/hooks-tools.ts` | **Actual CLI MCP server** (`npx @claude-flow/cli mcp start`) |

The 3.6.13 fix for #1686 (adding `dbPath` to `createReasoningBank`) landed in the first file but the runtime uses the second. The `hooks_post-task` writer and the `hooks_metrics` reader in the second file persist via `memory-store.ts` not `ReasoningBank` — and the metrics reader filters entries by key substring (`pattern`, `route`, `task`) rather than by trajectory store, so post-task writes that don't match those substrings remain invisible.

### Verification matrix (against running 3.6.12 server; CLI smoke tests against 3.6.13)

**Real and round-trip clean (≈195 tools):**

- All 9 memory_* tools — full round-trip with sql.js + HNSW + 384-dim ONNX embeddings
- All 22 workflow/task/claims/autopilot/daa/aidefence_* tools — minor caveats on `aidefence_scan` quick-mode and stats counters
- 9/9 ruvllm_* tools including SONA controller (cleared #1700 item 3 — `ruvllm_sona_adapt` returns real Rust struct fields, not bridge fallback)
- 18/24 swarm/agent/hive-mind/coordination tools
- Most embeddings_* tools — determinism confirmed (identical 384-dim vectors across calls), real HNSW search (~18ms on 30 vectors)
- Most hooks_intelligence_* tools — pattern-store now uses `bridge-store` with real ONNX (cleared #1700 item 3 in this surface), pattern-search returns real BM25 hybrid hits
- `hooks_model-route` correctly routes simple → haiku, complex → opus (cleared #1700 item 5)

**Mocks / broken / regressions confirmed:**

| ID | Tool / Surface | Verdict | Fix scope this cycle |
|---|---|---|---|
| F1 | `hooks_metrics` aggregation (#1686 partial) | dashboard counts stay zero after `hooks_post-task` because reader filters memory-store entries by key substring; writer keys don't match | YES |
| F2 | `hooks_worker-dispatch` (#1700 item 1) | returns `status:"completed"` in 0ms for a 45-second audit task; daemon state never advances; `worker_audit_*` shows `duration:0, completedAt==startedAt` | YES |
| F3 | `hive-mind_init` schema (#1700 item 4) | input schema exposes only `topology` and `queenId`; no `consensus` parameter, silently defaults to `byzantine` even though docs say `raft` is the anti-drift default | YES |
| F4 | `agentdb_pattern-store` | returns `success:false, error:"AgentDB bridge not available"` even though `agentdb_health.reasoningBank.enabled === true` — the availability check disagrees with the controller registry | YES |
| F5 | `embeddings_status` MCP shape (#1698 partial regression) | `ruvector` field is a single boolean — no way for callers to distinguish "package installed" from "feature enabled" | YES |
| F6 | `session_list` | returns `[{}, {}, ...]` — every session entry serialized as empty object even though `session_info` by ID returns full metadata | YES |
| F7 | `coordination_orchestrate` | hardcoded `estimatedCompletion: "50ms"` regardless of input; just generates an orchestrationId | NO (label as stub, defer real impl) |
| F8 | `performance_metrics.latency`/`.throughput` | suspiciously round fixture values without the `_real:true` flag the cpu/memory branches carry | NO (label as stub) |
| F9 | `agentdb_feedback` / `agentdb_route` / `agentdb_semantic-route` | accept input but `controller:"none"` / hardcoded `confidence:0.5` / `error:"controller not available"` — corresponding controllers ship disabled | NO (separate ADR needed for controller activation) |
| F10 | `hooks_intelligence_attention` | placeholder strings `"Flash attention target #1/2/3"` with uniform 0.333 weights despite `_stub:false` flag | NO (defer to attention impl work) |
| F11 | `neural_predict` | returns `confidence:0` for all predictions; label is raw training-data JSON dump, not classifier output | NO (defer to classifier head impl) |
| F12 | `config_list` | only returns most-recently-written keys; missing defaults that `config_export` correctly enumerates | YES (small fix) |

## Decision

Ship **3.6.14** focused on F1, F2, F3, F4, F5, F6, F12 — each is a correctness or contract-honesty fix with a small blast radius. Defer F7–F11 to follow-up ADRs because they require either re-implementing real subsystems (orchestration, classifier head, attention) or activating disabled controllers (a separate decision with security/perf implications).

### F1 — `hooks_metrics` reads from the same store post-task writes

Make the metrics reader and the post-* writers share the same persistence surface. Two options:

1. **Update the reader to enumerate trajectory storage** — `hooks_post-task` already writes a trajectory-shaped entry; `hooks_metrics` should count those, not key-substring-match memory entries.
2. **Update the writer to match the reader's substring filter** — store post-task with `pattern:` / `task:` / `route:` key prefix.

Pick option 1: read trajectory storage directly via `getIntelligenceStatsFromMemory()` (already used by `hooks_intelligence_stats`). This unifies counters across both tools and removes the substring heuristic.

### F2 — `hooks_worker-dispatch` honesty

The CLI/MCP returning `status: "completed"` for a worker that never ran is a contract violation. Fix:

1. Wait for the daemon's actual scheduling verdict (queued / deferred / running / completed) instead of synthesizing one.
2. If the daemon defers (e.g. memory threshold), return `status: "deferred"` with the reason from the daemon log.
3. If the daemon is not running, return `status: "no-daemon"` with a hint to `daemon start`.

### F3 — `hive-mind_init` accepts `consensus`

Extend the input schema to include `consensus: 'raft' | 'byzantine' | 'gossip' | 'crdt' | 'quorum'` (default `raft` to match documented anti-drift posture). Persist the chosen consensus into hive state so `hive-mind_status` round-trips it.

### F4 — `agentdb_pattern-store` availability check

Reconcile `agentdb_health.reasoningBank.enabled` with the `pattern-store` availability check. The check should accept either the new bridge OR the legacy controller. If both fail, emit a structured error with the exact controller path that's missing rather than the generic "bridge not available".

### F5 — `embeddings_status.ruvector` shape

Replace the single `ruvector: boolean` field with `ruvector: { available: boolean, enabled: boolean, version?: string }`. `available` reflects whether `@ruvector/core` loaded; `enabled` reflects whether it's wired into the embedding pipeline. Document as a non-breaking additive change (old single-boolean readers see truthy → match `enabled`).

### F6 — `session_list` serialization

The bug is in the serializer dropping all fields. Fix to project session records into `{ id, name, savedAt, fileSize }` before returning.

### F12 — `config_list` completeness

Have `config_list` return the same union as `config_export` (defaults + user-set + scope), with a `source` field per key. The current behavior (returning only the most-recently-written key) is a regression vs `config_export`.

## Validation Plan

1. Re-spawn the same six-agent verification swarm (memory-tester, hooks-tester, swarm-tester, neural-tester, system-tester, workflow-tester) against `@claude-flow/cli@3.6.14`.
2. Each agent re-runs the same scenarios that flagged F1–F6, F12 in the May 3 audit. Pass criteria: each row in the matrix above flips from MOCK/BROKEN/DEGRADED to REAL.
3. Add unit-level tests for F1 (post-task → metrics round-trip), F3 (consensus param round-trip), F6 (session_list returns non-empty objects).
4. Verify against published artifact in a clean `/tmp/ruflo-smoke-3.6.14` install.

## Consequences

**Positive:** restores #1686 to genuinely fixed (counters increment after post-task), unblocks #1700 items 1 and 4, removes a misleading MCP shape on #1698, removes three regressions reporters would otherwise file as new bugs.

**Negative:** does not address the broader controller-disabled surface (F9) or the placeholder-implementation surface (F7, F8, F10, F11). Those remain on the open audit until a follow-up ADR enables/implements them. Honest README "Status" column from #1700's "what would help" list is also deferred.

**Risk:** the F2 fix changes `hooks_worker-dispatch`'s contract from "always says completed" to "may say deferred/no-daemon". Any callers relying on the old behavior will see new return shapes — accepted because the old behavior was a silent lie.

## Notes

- The parallel `v3/mcp/tools/` and `v3/@claude-flow/cli/src/mcp-tools/` implementations should be unified in a follow-up ADR. Maintaining both creates the kind of fix-in-the-wrong-file confusion that turned the 3.6.13 #1686 fix into a no-op on the runtime path. Recommend deprecating `v3/mcp/tools/` and re-pointing its consumers at the CLI mcp-tools.
