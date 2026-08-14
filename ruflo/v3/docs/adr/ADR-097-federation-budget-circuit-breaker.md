# ADR-097: Federation-wide Budget Circuit Breaker and Token Quotas

**Status**: Accepted — Partially Implemented (Phase 1 + Phase 3 consumer-side landed; Phases 2 and 4 deferred)
**Date**: 2026-05-04 · **Updated**: 2026-05-09
**Version**: Phase 1 shipped in `@claude-flow/plugin-agent-federation` (v3.6.x); Phase 3 consumer in `ruflo-cost-tracker@0.14.0`
**Supersedes**: nothing
**Related**: ADR-086 (Agent Federation), ADR-095 (Architectural gaps — G2 includes federation transport), issues #1723 and #1724 (#1724 closed as duplicate of #1723), commit `6f495369` (G2 Ed25519 signing in federation)

## Context

Agent Federation (ADR-086) lets agents on one Ruflo node delegate tasks to peer nodes across trust boundaries. The implementation in `@claude-flow/plugin-agent-federation` already covers identity (Ed25519 keypairs), trust scoring, and `federation_send` for cross-node delegation. What it does **not** cover today:

- **Recursive delegation loops**. Node A → Node B → Node A → … If a peer wraps a received task and delegates it back, there is no hop counter to break the cycle. A pathological multi-node ring can run until process memory or the network gives out.
- **Cost cascades**. A 200-token task delegated to a peer can spawn a sub-swarm of five worker agents on the remote, each potentially calling expensive frontier models. The originator never sees the bill until the cost-tracker reconciles after the fact.
- **No backpressure on hostile / faulty peers**. A misbehaving peer that returns expensive responses cannot be muted automatically — the local trust score drifts but there's no mechanism that says "this peer is now too expensive, stop sending it work."
- **No unified cost surface**. The `ruflo-cost-tracker` plugin tracks local agent token usage but federation traffic is invisible to it.

The original issue (#1723, #1724 dup) frames this as a stability + enterprise-readiness gap. The fix is a **federated circuit breaker** layered on top of the existing federation protocol — no breaking changes to the wire format, just additive metadata.

### Existing surface to build on

| Component | Path | Today |
|---|---|---|
| Federation MCP tool | `v3/@claude-flow/plugin-agent-federation/src/mcp-tools.ts` (`federation_send`) | Sends a task to a peer; no cost / hop awareness |
| Federation node entity | `v3/@claude-flow/plugin-agent-federation/src/domain/entities/federation-node.ts` | `trustScore`, `trustLevel`, `lastSeen`; no `state: SUSPENDED` |
| Cost tracker plugin | `plugins/ruflo-cost-tracker/` | Tracks local model spend per agent / per session |
| Behavioral trust | ADR-086 §"Trust scoring" | Adjusts on protocol misbehavior; no cost-based decay yet |

## Decision

Ship four cohesive but independently-shippable parts. Each part is one iteration; the parts compose into the full circuit breaker.

### Part 1 — Budget header on `federation_send`

Extend the `federation_send` MCP tool input schema with three optional metadata fields:

```ts
{
  // existing
  peerId: string,
  taskId: string,
  payload: unknown,
  // new (all optional, defaults preserve current behavior)
  budget?: {
    maxTokens?: number,   // hard cap on Σ tokens across the whole hop chain
    maxUsd?: number,      // hard cap on Σ USD spend; enforced via cost-tracker
  },
  maxHops?: number,        // default 8; 0 = no remote delegation allowed
}
```

These travel inside the federation envelope as a `budget` block alongside the payload. The receiving peer:

1. **Decrements `maxHops`** on receive. If it drops below 0, returns an error response (`HOP_LIMIT_EXCEEDED`) without invoking any agent. The originator gets the failure synchronously.
2. **Subtracts from the budget** as it spends. Each completed sub-task reports `tokensUsed` and `usdSpent`; the running total is checked against the cap before each subsequent action. Overshoot returns `BUDGET_EXCEEDED` and refuses further work.
3. **Propagates the remaining budget** if the peer itself federates onward. The downstream call inherits whatever budget remains, never more.

Budget defaults: when omitted, treat as `Infinity` for `maxTokens` / `maxUsd` and `8` for `maxHops`. The default hop limit alone closes the recursion-loop class without any caller change.

### Part 2 — Peer state machine: ACTIVE / SUSPENDED / EVICTED

Extend `federation-node.ts` with a `state` field driven by the breaker:

| State | When transitioned | What it means |
|---|---|---|
| `ACTIVE` | default; healthy | `federation_send` accepts deliveries to this peer |
| `SUSPENDED` | breaker tripped (cost threshold or repeated failures) | sends to this peer return `PEER_SUSPENDED` immediately; receives still accepted but ignored for trust accumulation |
| `EVICTED` | manual or post-grace-period escalation from SUSPENDED | peer removed from registry; new delivery errors are emitted as `PEER_EVICTED` |

Transition triggers:

- `ACTIVE → SUSPENDED` when **either**:
  - Trailing 24h cost from this peer > configured threshold (`peer.costSuspensionUsd`, default `$5.00`)
  - Trailing 1h failure ratio > 50% across ≥10 sends
- `SUSPENDED → ACTIVE` after a configurable cooldown (default 30 min) AND a successful health probe
- `SUSPENDED → EVICTED` after 24h continuous suspension OR explicit `federation_evict` MCP call

Cooldown + auto-recovery prevents the breaker from being a one-way door — same shape as a typical hystrix-style breaker.

### Part 3 — Cost-tracker integration

Wire the federation layer into `ruflo-cost-tracker` so federated spend appears in the same dashboards as local spend:

1. New event type `federation_spend` published to the cost-tracker bus on every `federation_send` completion: `{ peerId, taskId, tokensUsed, usdSpent, ts }`.
2. Cost-tracker aggregates per-peer rolling windows (1h / 24h / 7d) and exposes them via the existing `cost-report` skill.
3. The breaker queries cost-tracker for the per-peer 24h sum to evaluate the suspension threshold.

This is one direction (federation → cost-tracker). Cost-tracker doesn't need to mutate federation state directly; the breaker pulls.

### Part 4 — Doctor + observability

- `ruflo doctor` reports the current state of every known peer (`ACTIVE`/`SUSPENDED`/`EVICTED`) and the trailing-24h cost. A peer pinned in `SUSPENDED` for >1h shows up as a yellow warning.
- New MCP tool `federation_breaker_status` returns the same info programmatically for swarm coordinators that want to route around suspended peers.
- Structured log line on every state transition with `{prevState, newState, reason, peerId}` so post-incident triage doesn't need a debugger.

## Implementation outline

Per the user directive, the implementation team owns this section. Each phase is one iteration to keep blast radius bounded:

| Phase | Scope | Lands in |
|---|---|---|
| P1 | Budget envelope + hop counter, no peer state changes | federation plugin + new tests |
| P2 | Peer state machine (`ACTIVE`/`SUSPENDED`/`EVICTED`) + transition rules | federation-node.ts + tests |
| P3 | Cost-tracker bus event + per-peer rolling aggregation | cost-tracker plugin |
| P4 | Doctor + `federation_breaker_status` MCP tool | doctor command + mcp-tools |

Test surface:

- **Unit**: budget arithmetic, hop counter underflow, state-transition table (ACTIVE→SUSPENDED→ACTIVE→EVICTED).
- **Integration**: a synthetic peer that intentionally exceeds budget should produce `BUDGET_EXCEEDED` on the originator AND transition to `SUSPENDED` after the threshold.
- **Property**: random hop chains must always terminate at `maxHops` ≤ 8.

## Trade-offs

| Decision | Alternative | Why this |
|---|---|---|
| Optional budget fields, default `Infinity` | Required budget on every `federation_send` | Backward compatible: existing code paths keep working. Callers opt in to limits. |
| Hop counter default `8` | Default unlimited | `8` is generous for legitimate multi-hop flows (typical ≤3) and cheap insurance against the recursion-loop class. |
| Peer state in federation plugin (not cost-tracker) | Centralized in cost-tracker | Federation owns peer identity + trust; the breaker is a federation concern. Cost-tracker provides numbers; federation decides actions. |
| Trailing-24h $5 default suspension threshold | Per-peer config only | Sane default avoids "gun, foot" for new installs. Override via plugin config. |
| `EVICTED` separate from `SUSPENDED` | Single `INACTIVE` state | Eviction is operationally permanent (admin removes the peer); suspension is a soft, auto-recovering state. They have different audit/log/recovery semantics. |
| Pull from cost-tracker for breaker decisions | Push spend events into federation | Federation already speaks events to cost-tracker; reverse direction would couple in both ways. Pull-on-decision is simpler and just-in-time. |

## Risks

1. **Race between budget check and remote spend**. The receiving peer checks budget *before* invoking the agent, but the agent's actual spend is reported *after*. A budget can be modestly exceeded by the last-call's actual cost > predicted cost. Mitigation: enforce on the *predicted* cost (max_tokens × per-token-rate), then refund unused on the running total. Worst case overshoot is one model call's worth.
2. **Clock skew across peers**. The 24h rolling window is computed locally per-peer, so divergent clocks don't change the threshold semantics. Trust-score timestamps (`lastSeen`) already rely on local clocks; same threat model.
3. **Suspended peer recovery storm**. If many peers transition `SUSPENDED → ACTIVE` simultaneously after cooldown, they could all retry pending sends at once. Mitigation: jitter the cooldown by ±10% per peer.
4. **Cost-tracker plugin not installed**. If the user runs federation without cost-tracker, USD-based breaker rules degrade to "always permitted." Token-count breaker still works (federation tracks tokens itself). Document this — cost-tracker is the recommended pair, not strictly required.

## Implementation status (2026-05-09)

**ADR-097 is functionally complete end-to-end.** All five phases are landed: Phase 1 (budget envelope), Phase 2.a (state machine entity), Phase 2.b (breaker service + outbound short-circuit), Phase 3 (consumer-side cost aggregation + upstream `reportSpend` emission with `SpendReporter` interface and breaker fan-out), Phase 4 (operator surface — `federation_breaker_status` / `federation_evict` / `federation_reactivate` MCP tools + `ruflo doctor --component federation`). Integrators wire a `SpendReporter` implementation to push to their cost-tracker / Datadog / accounting backend; the included `InMemorySpendReporter` covers tests + reference impl.

| Phase / Component | Status | Files | Commit(s) |
|---|---|---|---|
| **Phase 1** — Budget envelope + hop counter on `federation_send` | Implemented | `v3/@claude-flow/plugin-agent-federation/src/domain/value-objects/federation-budget.ts` (new), `mcp-tools.ts` updated | `7e1cc06df feat(federation): ADR-097 Phase 1 — budget envelope + hop counter (#1723)` |
| **Phase 2.a** — Peer state machine value object + entity transitions | Implemented | `domain/value-objects/federation-node-state.ts` (new), `domain/entities/federation-node.ts` (state field + suspend/evict/reactivate), `__tests__/unit/federation-node-state.test.ts` (27 tests) | `feat/adr-100-promote-097-phase2` |
| **Phase 2.b** — Breaker service + outbound short-circuit | Implemented | `application/federation-breaker-service.ts` (new — pure `evaluatePolicy` + stateful `FederationBreakerService` with bounded per-peer buffer), `application/federation-coordinator.ts` (sendMessage gates on `!peer.isActive` with `PEER_SUSPENDED`/`PEER_EVICTED` constant errors), `__tests__/unit/federation-breaker-service.test.ts` (25 tests) | `feat/adr-100-promote-097-phase2` |
| **Phase 3 consumer** — Cost-tracker bus event + per-peer rolling aggregation | Implemented | `plugins/ruflo-cost-tracker/scripts/federation.mjs`, `skills/cost-federation/SKILL.md` | `1c0804315 feat(cost-tracker): P6 — ADR-097 Phase 3 federation_spend consumer (v0.14.0)` |
| **Phase 3 upstream** — Federation `reportSpend()` + `SpendReporter` interface + breaker fan-out + `federation_report_spend` MCP tool | Implemented | `application/spend-reporter.ts` (new — interface + `InMemorySpendReporter` reference impl), `application/federation-coordinator.ts` (new optional `spendReporter` + `breakerService` constructor integrations + `reportSpend` method), `mcp-tools.ts` (federation_report_spend), `__tests__/unit/coordinator-spend-reporting.test.ts` (10 tests) | `feat/adr-100-promote-097-phase2` |
| **Phase 3 plugin wiring** — federation plugin adopts budget integration + ADR-097 doc | Implemented | `plugins/ruflo-federation/` (v0.2.0), `docs/adrs/0001-federation-contract.md` | `b0168e4a5 feat(ruflo-federation): adopt plugin contract — 3-gate alignment + ADR-097 budget integration + smoke` |
| **Phase 4** — Operator surface: 3 MCP tools + doctor health-check | Implemented | `mcp-tools.ts` (federation_breaker_status / federation_evict / federation_reactivate), `application/federation-coordinator.ts` (getPeerStates / getPeerStateCounts / evictPeer / reactivatePeer), `v3/@claude-flow/cli/src/commands/doctor.ts` (checkFederationBreaker), `__tests__/unit/federation-coordinator-breaker.test.ts` (11 tests) | `feat/adr-100-promote-097-phase2` |

### Open questions resolved during implementation

| Original question | Resolution |
|---|---|
| Is upstream `federation_spend` event emission required for Phase 3 consumer? | No — the consumer (`scripts/federation.mjs`) activates the moment the upstream emitter lands; it reads from the `federation-spend` namespace. Until Phase 2/3 emit events, the consumer runs against an empty namespace and reports zero spend. |
| Does Phase 1's default `maxHops=8` close the recursion-loop class for all callers? | Yes — hop enforcement fires even when no explicit budget is passed (`validateBudget(undefined)` returns a default-bounded budget). |

### Deferred

_All ADR-097 phases are landed. Future work is integrator-side wiring:_

- **Production `SpendReporter` adapter** that persists to ruflo memory (`namespace=federation-spend`, `key=fed-spend-<peerId>-<ts>`) per the cost-tracker consumer convention. Reference implementation: `InMemorySpendReporter` (in-memory buffer, fine for tests, NOT for production). A real adapter is a thin shell around `memory_store` — left to the integrator since they own the credentials/quota policy.
- **Auto-emission from `federation_send`** — currently `reportSpend()` is an explicit caller-side call (correct since the federation layer doesn't own model pricing). A future enhancement could auto-emit a "send-completed" event with the budget enforcement's predicted cost as a placeholder, but the integrator overrides with actual cost on completion. Decision deferred until a concrete integration request justifies the additional state.

---

## Acceptance criteria

The full implementation is done when:

- `federation_send` accepts and propagates `budget` + `maxHops` without breaking any existing test
- A synthetic recursive delegation chain (peer A → B → A → …) terminates at `maxHops` with `HOP_LIMIT_EXCEEDED` on the originator
- A peer that exceeds the cost threshold over 24h transitions to `SUSPENDED`, refuses sends for the cooldown window, and auto-recovers on a successful probe
- `ruflo doctor` shows peer states + trailing-24h cost
- `federation_breaker_status` MCP tool returns structured state per peer
- Cost-tracker `cost-report` shows federated spend grouped by peer
- New tests cover budget arithmetic, hop counter, state transitions, and cost-tracker bus events
- Full vitest suite stays green; no regressions in the 1917-test baseline
