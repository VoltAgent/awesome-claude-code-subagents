---
id: ADR-0003
title: ruflo-cost-tracker — implementation arc from v0.4.0 to v0.15.0 (auto-capture, budget enforcement, model-outcome feedback, observability, federation consumer)
status: Accepted
date: 2026-05-05
authors:
  - planner (Claude Code)
tags: [plugin, cost, telemetry, budget, federation, observability, ci, summary, model-outcome, retrospective]
---

## Context

ADR-0001 fixed namespace routing (v0.2.2). ADR-0002 added the Agent Booster integration with verification (v0.3.0–v0.4.0). At that point the plugin had a credible verification harness — but it was almost entirely a *consumer* of the `cost-tracking` AgentDB namespace. **Nothing in the plugin actually wrote to that namespace.** Every skill operated on empty data.

This ADR documents the implementation arc that closed that gap (v0.4.0 → v0.15.0) and the deliberate scope decisions made along the way.

## Decision

Eleven priorities were implemented as separate plugin-local commits, each with version bump + smoke contract growth. Headline numbers from a fresh measured bench (2026-05-05, corpus v3 = 25 cases):

| Endpoint | Tier 1 win | Adversarial correct | Avg latency | Cost / edit | Speedup vs Booster |
|---|---:|---:|---:|---:|---:|
| Agent Booster (WASM) | 18/18 | escalates 7/7 | **0.36 ms** | **$0** | — |
| Gemini 2.0 Flash | 18/18 | 3/7 | 807.56 ms | $0.000028 | **2243×** |
| Claude Sonnet 4.6 | 18/18 | 2/7 | 1270.64 ms | $0.000933 | **3530×** |
| Claude Opus 4.7 | 18/18 | 5/7 | 1563.72 ms | $0.005943 | **4344×** |

### Implementation order and rationale

1. **P1 — `cost-track` (v0.5.0)** — the most embarrassing gap. Reads `~/.claude/projects/<encoded-cwd>/<session>.jsonl`, sums per-message `usage` by model, persists to `cost-tracking` namespace. Without this every other skill operated on empty data.
2. **P2 — `cost-budget-check` (v0.6.0)** — the README documented a 50/75/90/100% alert ladder but no code enforced it. Wired the producer (`cost track`) to the consumer (`budget check`) with a real fail-closed exit-1 path on `HARD_STOP`.
3. **P3 — auto-emit `hooks_model-outcome` (v0.7.0)** — `cost-optimize` step 8 was prose. Replaced with a wrapper script (`outcome.mjs`) and a `cost outcome` subcommand so applied recommendations actually train the router.
4. **P4 — `compact.mjs` (v0.8.0)** — dropped the inline `node --input-type=module -e '...'` block from `cost-compact-context`. True MCP wrapping (modifying @claude-flow/cli source) deliberately deferred — see "Riskiest assumption" below.
5. **P5 — `cost-trend` (v0.9.0)** — the binary smoke gate misses curves. Trend across all `runs/*.json` flags drifts the gate doesn't.
6. **P7 — corpus v2 → v3 (v0.10.0)** — added `expectedTier1` field and 7 adversarial cases. Win rate now means something (was tautological at 100% across all endpoints on v1).
7. **P8 — GitHub Actions (v0.11.0)** — smoke + booster-only bench on every PR; LLM/Anthropic baselines deliberately excluded from CI (cost guard).
8. **P11 — `cost-conversation` (v0.12.0)** — per-conversation lens (different aggregation axis from `cost-report`'s per-agent / per-model).
9. **P10 — `cost-export` (v0.13.0)** — Prometheus textfile collector + webhook POST. External observability.
10. **P6 — `cost-federation` (v0.14.0)** — ADR-097 Phase 3 consumer wired. Activates when upstream emits.
11. **P9 — `cost-summary` (v0.15.0)** — stable programmatic JSON contract for inter-plugin consumption.

## Consequences

**Positive:**

- The plugin now has a real producer (`cost-track` writing to `cost-tracking`) and four lenses on the same data (report, optimize, conversation, summary). Before this work, every skill consumed an empty namespace.
- Budget enforcement is mechanical — `budget check && spawn …` fail-closed pattern guards expensive operations.
- The verification corpus (25 cases, including 7 adversarial) produces honest signal: on adversarial cases the booster correctly *refuses* (escalates) while Sonnet 4.6 only solves 2/7. Booster's qualitative win — *correct refuse* — is not just speed.
- External observability is wired: Prometheus for dashboards, webhooks for ad-hoc reporting, programmatic summary for cross-plugin consumption.
- Federation consumer is ready ahead of upstream Phase 3 emission, so when the producer side lands the plugin starts aggregating immediately with no further changes.

**Negative:**

- **No real MCP tools registered** — adding `cost_report` / `cost_summary` MCP tools requires modifying `v3/@claude-flow/cli/src/mcp-tools/`, which is outside plugin-local scope and deserves its own ADR. The current `summary.mjs` provides equivalent functionality via Bash shell-out, but it is *not* an MCP tool.
- **Budget upsert workaround** — `npx @claude-flow/cli memory store` rejects keys that `memory retrieve` doesn't see (a UNIQUE-constraint inconsistency in the @claude-flow/cli memory layer). `budget.mjs` works around this by writing timestamped keys (`budget-config-<ms>`) and resolving the latest at retrieve time. This is functional but indicates an upstream bug that should be fixed in a separate ADR.
- **Federation consumer activates only when Phase 3 lands** — the skill is dormant until `federation_send` completion events flow into the `federation-spend` namespace. Documented; not a hard issue but means the metric is currently zero.
- **CI bench is booster-only** — LLM and Anthropic baselines are deliberately not run in CI (cost). Drift in those numbers can only be caught manually via `BENCH_LLM_BASELINE=1 BENCH_ANTHROPIC=1`.

**Neutral:**

- Plugin is at v0.15.0 within the 0.x line — additive surface change is the norm.
- Smoke contract grew from 27 → 44 checks. All under 100 ms wall-time.
- 13 skills now load in agent context. Each has tight `allowed-tools` (no wildcards). Smoke step 10 enforces this.

## Riskiest assumptions

1. **The plugin works without `agent-booster` installed when the bench isn't being run.** All other skills (track, budget, outcome, trend, conversation, export, federation, summary) avoid the booster import entirely. Verified live: `cost-track`, `cost-budget-check`, `cost-summary` all run cleanly outside the v3/ tree.
2. **Sonnet 4.6 / Opus 4.7 latency is representative.** The Anthropic baseline measured 1270 / 1563 ms avg latency. These are real GCP-region-affected numbers and will fluctuate. The trend script flags drift.
3. **The 25-case corpus reflects production work patterns.** It probably under-represents larger-context refactors. If real workloads differ materially, the win rate / escalation rate could change. Mitigation: extend corpus, re-run bench, smoke step 23 fails CI on regression.

## Verification

Smoke contract is at 44 checks (`bash plugins/ruflo-cost-tracker/scripts/smoke.sh`). Live verified:

- `cost-track` captured this session: 1597 messages, $1546.36 on Opus 4.7
- `cost-budget` set / get / check: $2500 budget, 61.9% utilization → 🟡 INFO
- `outcome.mjs`: emitted `haiku=success` to router, `[OK] Outcome recorded`
- `cost-trend`: 6+ runs analyzed, 100% win rate stable, latency drifted 0.58→0.36 ms
- `cost-export --prometheus`: textfile cleanly written with all 6 metric types
- `cost-federation`: with mock events, peer-bob $7.50 → ⚠ flagged over $5/24h threshold
- `cost-summary --format json`: stable contract verified

Bench result persisted at `docs/benchmarks/runs/latest.json` (corpus v3, 4 endpoints).

## Related

- ADR-0001 — namespace routing fix
- ADR-0002 — Agent Booster integration + verification
- ADR-097 — federation budget circuit breaker (Phase 3 consumer wired)
- Issue #1743 — public verification thread
- Gist `15fae7a5495026f025fb3baf721c20ea` — bench proof + corpus + harness
- Cron `c0b44f45` — driver of this implementation arc; cancelled at end of session

## Deferred for follow-up ADRs

- Real MCP tool registration (`cost_report` / `cost_summary` as registered MCP tools, not Bash shell-out)
- Upstream fix for the `memory store` UNIQUE-constraint inconsistency
- Federation Phase 3 producer (in `ruflo-federation` plugin, not this one)
- Adversarial corpus expansion to 50+ cases for tighter signal
