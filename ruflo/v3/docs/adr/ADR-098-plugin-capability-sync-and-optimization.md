# ADR-098: Plugin Capability Sync + Token / Performance / Intelligence / Self-Optimization Pass

**Status**: Accepted — Partially Implemented (Parts 1–4 landed; Part 5 deferred)
**Date**: 2026-05-04 · **Updated**: 2026-05-09
**Version**: Parts 1–4 shipped across v3.6.25–v3.6.26 plugin releases
**Supersedes**: nothing
**Related**: ADR-094 (transformers loader), ADR-095 (architectural gaps), ADR-096 (encryption-at-rest), ADR-097 (federation budget circuit breaker), `plugins/ruflo-*` directory

## Context

The `plugins/ruflo-*` tree is the user-facing surface of Ruflo on Claude Code — 32 plugins distributed via the Ruflo marketplace, each bundling agent prompts, skills, slash commands, and (in some cases) hooks. End users install via `/plugin install ruflo-X@ruflo` and immediately get the agent / commands.

Recent shipped work (ADR-094, 095, 096, 097) added or modified capabilities that the plugin tree doesn't yet surface:

| Recent capability | Plugin that should know about it | Current coverage |
|---|---|---|
| ADR-096 encryption-at-rest (CLAUDE_FLOW_ENCRYPT_AT_REST gate, fs-secure helpers) | `ruflo-aidefence`, `ruflo-security-audit`, `ruflo-rag-memory`, `ruflo-rvf` | None of these mention it |
| ADR-097 federation budget circuit breaker (`maxHops`, `maxTokens`, `maxUsd`) | `ruflo-federation` ✅, `ruflo-cost-tracker` should consume `federation_spend` events | Federation has it; cost-tracker doesn't |
| `validateEnv()` loader-hijack denylist | `ruflo-aidefence`, `ruflo-security-audit` (relevant for threat agents) | Not surfaced |
| `validateBudget()` / `enforceBudget()` (federation) | `ruflo-cost-tracker` | Not surfaced |
| AgentDB controllers activated in 3.6.24 (G7 — gnn, rvf, mut, att, gvb) | `ruflo-agentdb`, `ruflo-rag-memory`, `ruflo-knowledge-graph` | Skill docs don't mention them |
| 3-tier model routing (haiku / sonnet / opus per ADR-026) | All plugins with agents | Some plugins use `model: opus` where haiku would do |

A scan of the 32 plugin trees (auto-extracted via `scripts/inventory-capabilities.mjs`) surfaced four categories of debt:

### Audit findings

**1. Capability sync (high priority — user-visible)**

Only `ruflo-federation` references ADR-096 / ADR-097 / encryption / budget concepts. The other 31 plugins don't reference any post-3.6.13 capabilities. End users installing `ruflo-aidefence` or `ruflo-security-audit` see no mention of the new file-mode-0600 default, the encryption-at-rest gate, or the loader-hijack denylist — even though those plugins' agent prompts are explicitly about security posture.

**2. Token-cost overage (medium priority — runtime cost)**

Per-agent prompt sizes vary 19 → 105 lines. Outliers above 80 lines:

| Plugin | Agent | Lines | Reason |
|---|---|---|---|
| `ruflo-cost-tracker` | cost-analyst | 105 | Heavy command-table inlining |
| `ruflo-adr` | adr-architect | 96 | Lifecycle-state machine inlined |
| `ruflo-ddd` | domain-modeler | 93 | DDD vocabulary table inlined |
| `ruflo-iot-cognitum` | device-coordinator | ~80 | Trust-tier table inlined |

Each line in the agent prompt is loaded into context every time the agent is spawned. A 100-line prompt at ~12 tokens/line is ~1200 tokens per spawn just for the agent definition — multiplied by spawn frequency, that's measurable spend. Reference tables and command catalogs belong in skills (loaded on-demand) or in a sibling `REFERENCE.md` file, not in the agent prompt itself.

**3. Performance / model-tier mismatch (medium priority — cost)**

Three agents use `model: opus` (the highest tier). Two are clearly justified by task complexity:

- `ruflo-federation/federation-coordinator` — multi-phase coordination, trust scoring, audit-grade logging.
- `ruflo-neural-trader/trading-strategist` — real-money trading decisions; opus is correct.
- `ruflo-security-audit/security-auditor` — debatable; security review work is sonnet-tier in practice.

The third should drop to sonnet (~5× cheaper per token) unless the task scope actually warrants opus.

**4. Intelligence / learning gap (low priority — self-improvement)**

7 of 43 agents (16%) lack a `hooks post-task --train-neural true` invocation in their prompt. These agents complete tasks without feeding the SONA learning loop. The agent prompts that DO have it form the dominant pattern; the missing ones are an oversight that costs the system long-term improvement signal.

Specific gaps:

| Plugin | Agent | Missing hook |
|---|---|---|
| (audit script will produce the 7 names) | | post-task neural training |

Lack of post-edit `--train-neural` is a smaller concern (post-edit hooks fire from the runtime, not from the agent), but the post-task call is agent-emitted and easy to standardize.

**5. Self-optimization signal absence (low — long-term)**

No plugin agent currently dispatches background workers (`hooks worker dispatch --trigger optimize`) on completion. The `optimize`, `audit`, `testgaps` workers exist precisely to consume successful agent runs as training data — but no plugin invokes them. This is a missed feedback loop.

## Decision

Ship a 5-part remediation plan. Each part is one iteration; no single one needs the others to land.

### Part 1 — Capability sync

For every plugin whose surface meaningfully overlaps a post-3.6.13 capability, add a brief reference (1 paragraph or ≤5 bullets) in the plugin README and the relevant agent prompt:

| Plugin | Add reference to |
|---|---|
| `ruflo-aidefence` | `validateEnv` loader-hijack denylist; chmod 0600 file mode; encryption-at-rest gate (defense-in-depth pairing) |
| `ruflo-security-audit` | Same set, plus the github-tools / update/executor shell injection patterns to scan for |
| `ruflo-rag-memory`, `ruflo-rvf` | Encryption-at-rest gate (memory.db wraps under `CLAUDE_FLOW_ENCRYPT_AT_REST=1`) |
| `ruflo-cost-tracker` | Federation budget breaker; `federation_spend` events; per-peer rolling aggregation API (when ADR-097 P3 lands) |
| `ruflo-agentdb`, `ruflo-knowledge-graph` | The 5 activated G7 controllers (gnn, rvf, mut, att, gvb) and their MCP tools |
| `ruflo-federation` | Already done in v0.2.0 |

Bump plugin versions where the surface materially changed (0.1.0 → 0.2.0).

### Part 2 — Token-cost diet for fat agent prompts

Move reference tables / command catalogs out of the agent prompt and into either (a) a skill that the agent can load on-demand, or (b) a sibling `REFERENCE.md` file the agent reads only when needed. Target: keep agent prompts ≤ 60 lines.

Affected:
- `ruflo-cost-tracker/agents/cost-analyst.md` (105 → ≤ 60)
- `ruflo-adr/agents/adr-architect.md` (96 → ≤ 60)
- `ruflo-ddd/agents/domain-modeler.md` (93 → ≤ 60)
- `ruflo-iot-cognitum/agents/device-coordinator.md` (~80 → ≤ 60)

Acceptance: agent prompts under 60 lines AND agent still passes its existing skill tests (those that have them).

### Part 3 — Model-tier rightsizing

Change `ruflo-security-audit/agents/security-auditor.md` from `model: opus` → `model: sonnet`. Justification: security review is bounded-scope analysis that sonnet handles cleanly; opus's long-context advantage isn't load-bearing here. Track for a release cycle and revert if quality drops.

### Part 4 — Intelligence / learning hook standardization

For every plugin agent without `hooks post-task --train-neural true`, append the standard 3-line tail:

```bash
### Neural learning
After completing tasks, store the outcome:
`npx @claude-flow/cli@latest hooks post-task --task-id "$TASK_ID" --success $SUCCESS --train-neural true`
```

Targets the 7 agents flagged by audit. Adds ~3 lines per agent — ~21 lines net repository-wide. Standardizes the learning-feedback contract.

### Part 5 — Self-optimization worker dispatch

For agents whose work materially contributes to long-term quality (coder, reviewer, tester, security-auditor, perf-analyzer, etc.), append a worker-dispatch line:

```bash
### Self-optimization
On successful completion, trigger background optimization:
`npx @claude-flow/cli@latest hooks worker dispatch --trigger <relevant-worker> --task-id "$TASK_ID"`
```

Worker mapping per agent class:

| Agent class | Worker |
|---|---|
| coder, refactor | optimize |
| tester, testgen | testgaps |
| reviewer, security-auditor | audit |
| docs, api-docs | document |
| analyzer, perf-analyzer | benchmark |

Lower priority than Parts 1-4 because workers run async and benefit from stable upstream signal — Part 4 should land first.

## Scope guardrails

- This ADR does **not** change runtime code in `@claude-flow/cli`. All edits are in `plugins/ruflo-*/`.
- Each part is independently shippable.
- No new ADR cycle unless a part surfaces a runtime gap (e.g. Part 5 might need a new MCP tool for worker telemetry; if so, separate ADR).
- Per-plugin version bumps follow semver: capability sync = minor (0.1.0 → 0.2.0); token diet alone = patch (0.1.0 → 0.1.1).

## Implementation status (2026-05-09)

Parts 1–4 are fully landed on `main`. Part 5 (worker dispatch) remains deferred — it was explicitly ordered to land after Part 4 per the ADR.

| Part | Scope | Status | Commit(s) |
|---|---|---|---|
| **Part 1** — Capability sync (6 plugins) | Implemented | 4 slices: `6a4057474` (security plugins), `6130f4061` (memory plugins), `00a9d13b5` (cost-tracker federation pairing), `cf96a562c` (agentdb + knowledge-graph G7 controllers) |
| **Part 2** — Token diet (4 fat agent prompts → ≤60 lines) | Implemented | 4 slices: `f1bb3cf84` (iot-cognitum), `1e5a8ec89` (ruflo-ddd), `85eab480e` (ruflo-adr), `5addd83b4` (ruflo-cost-tracker) |
| **Part 3** — Model-tier rightsizing (security-auditor: opus → sonnet) | Implemented | `29542ce6d feat(plugins): ADR-098 Part 3 — security-auditor opus → sonnet` |
| **Part 4** — Neural training hook standardization (7 agents) | Implemented | `2e5c90c90 feat(plugins): ADR-098 Part 4 — standardize neural-learning hook` |
| **Part 5** — Self-optimization worker dispatch | Deferred | — |

### Deferred

- **Part 5** — Worker-dispatch lines (`hooks worker dispatch --trigger <worker>`) in work-producing agent prompts. Explicitly ordered post-Part 4 in the ADR; no follow-up commit has landed.

## Acceptance criteria

The pass is done when:

- [ ] Each affected plugin (per Part 1) has a paragraph or bullet list referencing the relevant ADR-094/095/096/097 capability.
- [ ] All 4 outlier agent prompts are ≤ 60 lines.
- [ ] `ruflo-security-audit/security-auditor.md` is on `model: sonnet`.
- [ ] All 43 plugin agents include a `hooks post-task --train-neural true` invocation.
- [ ] At least 8 work-producing agents include a `hooks worker dispatch` invocation tied to the right background worker.
- [ ] No regression in the plugin marketplace install path (`/plugin install ruflo-X@ruflo` still resolves).
- [ ] Spot-check: `ruflo doctor -c agentic-flow` and the broader doctor output stays green.

## Trade-offs

| Decision | Alternative | Why this |
|---|---|---|
| Reference tables → skills/REFERENCE.md | Keep them in the agent prompt | Skills load on-demand, REFERENCE.md loads on-explicit-read; either avoids paying tokens every spawn. |
| Sonnet for security-audit | Stay on opus | If post-rollout QA shows degradation, revert. The 5× cost difference is worth a trial period. |
| Standard post-task tail across all agents | Hand-tune each | Standard tail is auditable; users can grep the plugin tree to confirm coverage. |
| Workers via hooks-dispatch | Direct in-process trigger | Hooks are the existing surface; in-process dispatch would require a new API. |
| Per-plugin minor bump for capability sync | Bulk 0.2.0 across all | Selective bumps signal which plugins materially changed; bulk would obscure that. |

## Risks

1. **Skills/REFERENCE refactor breaks agent flow** — moving reference tables out of the prompt may break agents that implicitly relied on them being in-context. Mitigation: each token-diet PR runs the existing skill tests and a smoke spawn before merge.
2. **Sonnet drop hurts security-audit quality** — possible. Roll out behind a doc note, monitor for one release cycle, revert if needed.
3. **Worker dispatch firehose** — if every agent fires a worker, the daemon could fall behind. Mitigation: workers already have priority queues; if backpressure shows, cap dispatch frequency in the agent prompt to 1/N tasks.
