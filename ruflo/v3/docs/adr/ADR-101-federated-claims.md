# ADR-101: Federated Claims — Cross-Node Work Coordination via the Federation Plane

**Status**: Accepted — Implemented (Phases 1–3 + Component C wiring landed)
**Date**: 2026-05-05 (proposed) · **Updated**: 2026-05-09
**Version**: shipped in `@claude-flow/plugin-agent-federation@1.0.0-alpha.5` and `@claude-flow/claims@3.0.0-alpha.x`
**Supersedes**: nothing
**Related**: ADR-086 (Agent Federation), ADR-097 (Federation budget circuit breaker), ADR-102 (CI smoke harness — federation policy-engine fix attested via witness), commit `6f495369` (G2 Ed25519 signing), `v3/@claude-flow/claims/`, `v3/@claude-flow/plugin-agent-federation/`

## Context

The claims module (`v3/@claude-flow/claims/`) is a Domain-Driven-Design implementation of a work-coordination protocol — agents and humans claim issues, hand them off, mark them stealable, and contest steals through a Cilk-style work-stealing scheduler. Today it operates **strictly in-process**: every claim, every handoff, every steal happens against `InMemoryClaimEventStore` with monotonic per-aggregate integer versions, and every consumer of the claim service is assumed to be on the same node.

Federation (`v3/@claude-flow/plugin-agent-federation/`) is the cross-node trust plane: Ed25519-signed envelopes, peer registry, trust scoring, and a `RoutingService` for sending typed messages between Ruflo installations. ADR-097 added budget circuit breakers; ADR-086 established the core Ed25519 protocol.

These two modules have been built independently and have **never been wired together**. As a consequence:

- A user running Ruflo on three nodes — say, a developer laptop, a CI runner, and a long-running cloud worker — cannot have an agent on the laptop hand a claim off to an idle agent on the cloud worker. The work happens locally or not at all.
- Plugin authors who want to express "the most-loaded node should hand its overflow to the least-loaded node in the trust circle" have no path to do so. The load balancer (`load-balancer.ts:345`) computes globally optimal assignments inside a single process; the result cannot leave that process.
- The work-stealing scheduler — designed exactly for the case where one worker has nothing to do and another has a backlog — only works when both workers share memory. The cross-machine case, where stealing matters most, is the case we don't support.

A read-only architectural review (recorded in this conversation) confirmed the integration is **YELLOW** rather than RED: the DI shape of claims is correct, the federation envelope already supports signing, and three specific changes turn the local-only system into a federated one.

This ADR is the design document for those three changes plus the contracts, rollout, test strategy, and migration plan that go around them.

### Existing surface to build on

| Component | Path | Today |
|---|---|---|
| Claim service | `v3/@claude-flow/claims/src/application/claim-service.ts:147–240` | Pure DI through `IClaimRepository`, `IClaimantRepository`, `IClaimEventStore` |
| Work-stealing service | `v3/@claude-flow/claims/src/application/work-stealing-service.ts:172–305` | Repo-driven; `contestInfo` window already exists for race resolution |
| Load balancer | `v3/@claude-flow/claims/src/application/load-balancer.ts:345–793` | Pure functions of claim-count / progress / priority — federates trivially |
| Event store | `v3/@claude-flow/claims/src/infrastructure/event-store.ts:50–286` | Local in-memory, integer per-aggregate versions |
| Domain types | `v3/@claude-flow/claims/src/domain/types.ts:91,513` | `Claimant.id` opaque `string`, no locality assumption |
| Federation envelope | `v3/@claude-flow/plugin-agent-federation/src/protocol/federation-envelope.ts:91–101` | `toSignablePayload()`, `hmacSignature`, Ed25519 verify |
| Federation routing | `v3/@claude-flow/plugin-agent-federation/src/transport/routing-service.ts:36,61` | `send()`, `scanPii()` already wired; supports `task-assignment` envelope type |
| Federation message catalog | `federation-envelope.ts:1–16` | Enumerates `task-assignment`, `consensus-vote`, `peer-status`; no `claim-*` member yet |

## Decision

Wire claims into the federation plane via three additive components, kept in the same `@claude-flow/claims` package and gated behind a feature flag for the entire v3.8 alpha cycle. Each component is independently shippable; the dependencies form a strict topological order.

### Component A — Hybrid Logical Clock (HLC) timestamps

**Problem.** `WorkStealingService` compares `new Date()` against `claim.claimedAt` and `contestInfo.windowEndsAt` (`work-stealing-service.ts:540–545`, `:357–360`). Across nodes these timestamps come from clocks that disagree. Even 200 ms of skew — typical on a residential connection — turns "this claim is past its grace period" into a non-deterministic answer that depends on which node is asking.

**Decision.** Replace raw `Date` comparisons inside the work-stealing and handoff timing logic with a hybrid logical clock (HLC, Kulkarni et al. 2014). HLC produces 64-bit timestamps that:

- monotonically advance on every event, even when the wall clock goes backward
- track causality across nodes in the same way Lamport clocks do, but
- stay within a small bounded skew of physical time (so they remain human-readable for debugging)

```ts
// v3/@claude-flow/claims/src/infrastructure/hlc.ts
export interface HlcTimestamp {
  readonly physicalMs: number;   // wall clock at issuance
  readonly logical: number;      // tie-breaker, monotonic per (node, physicalMs)
  readonly nodeId: string;       // who issued it
}

export class HybridLogicalClock {
  private last: HlcTimestamp;

  /** Generate a new HLC timestamp for a local event. */
  now(): HlcTimestamp { … }

  /** Update the clock from a received timestamp. Returns the new local time. */
  update(received: HlcTimestamp): HlcTimestamp { … }

  /** Compare two HLC timestamps. Returns -1, 0, +1 like Date comparison. */
  static compare(a: HlcTimestamp, b: HlcTimestamp): -1 | 0 | 1 { … }
}
```

The HLC is held by a singleton scoped to the federation node. When any claim event is created or received, the clock is fed the event's HLC and produces a new local HLC. Comparisons inside `WorkStealingService` change from `Date.now() > windowEndsAt` to `HLC.compare(now, windowEndsAt) > 0`.

To preserve backwards compatibility with existing in-memory deployments (single-node, no federation), the HLC degenerates gracefully: when no remote events are ever received, `physicalMs` tracks the wall clock exactly and `logical` stays at 0 — i.e., HLC values are pairwise-comparable to plain Unix timestamps. The local-only test suite continues to pass without changes.

**Skew tolerance.** The HLC tolerates a maximum skew configured per federation (default 30 s). Events arriving with `physicalMs > localPhysicalMs + maxSkewMs` are clamped and logged — they're treated as "from the near future" but the clock does not jump forward to match, preventing a misbehaving peer from poisoning the global timeline.

### Component B — Federated repository + event-store adapters

**Problem.** Even with HLC timestamps, the `InMemoryClaimEventStore` (`event-store.ts:50–286`) uses **integer versions** per aggregate. Two nodes simultaneously appending events to the same claim aggregate will both produce `version 5`, and the in-memory store will accept whichever wins the local race — silently corrupting causal history.

**Decision.** Introduce two new infrastructure adapters that satisfy the existing repository / event-store interfaces and route writes through federation:

```
v3/@claude-flow/claims/src/infrastructure/
  hlc.ts                          # Component A
  federated-claim-repository.ts   # implements IClaimRepository
  federated-event-store.ts        # implements IClaimEventStore
  vector-clock.ts                 # supporting type
  federation-bridge.ts            # internal: bridges claim events ↔ federation envelopes
```

#### Federated event store

Replace integer versions with **vector clocks**. Each event carries a vector `{[nodeId]: integer}` representing the causal history seen at the issuing node. On read, events are sorted by vector-clock partial order; on write, the store rejects events whose vector clock contradicts an event already accepted (concurrent writes are detected and surfaced as `CONCURRENT_WRITE` errors that the application layer can resolve via the existing contest mechanism).

```ts
export interface VectorClock {
  readonly clocks: Readonly<Record<string, number>>;
}

export interface FederatedClaimEvent extends ClaimDomainEvent {
  readonly hlc: HlcTimestamp;
  readonly vclock: VectorClock;
  readonly originNodeId: string;
  readonly envelopeSignature?: string; // present iff this event arrived via federation
}
```

Existing event consumers see the additional fields as opaque metadata; they do not need to change.

#### Federated claim repository

`FederatedClaimRepository` wraps the existing in-memory or SQLite repository and:

1. **Reads** are local-first. The local replica is authoritative for queries; cross-node lookups are explicit (`findByClaimantId(id, { includeRemote: true })`).
2. **Writes** publish a `claim-event` federation envelope to all peers in the trust circle whose `trustLevel >= CLAIMS_MIN_TRUST` (configurable, default `WORKING`).
3. **Conflict resolution** uses last-writer-wins by HLC for non-causal fields (e.g., `notes`) and concurrent-write rejection for causal events (e.g., two `release` events with overlapping vector clocks → both fail; the contest mechanism arbitrates).
4. **Privacy.** Before publishing any event, the bridge runs the existing `RoutingServiceDeps.scanPii` (`routing-service.ts:36`). PII detected in `Claimant.metadata` or `Claim.notes` aborts the publish and the local write is rolled back with a `PII_LEAK_PREVENTED` error returned to the caller — fail-loud, not fail-silent.

### Component C — Attested handoff envelopes

**Problem.** A handoff (`claim-service.ts:293–415`) is the moment one agent transfers ownership of work to another. Across a trust boundary, this is exactly when an attestation is most valuable: did the originator actually authorize this handoff, or did a malicious peer fabricate the request?

**Decision.** Add a new federation message type and route handoff events through the existing signing infrastructure:

```ts
// v3/@claude-flow/plugin-agent-federation/src/protocol/federation-envelope.ts
export type FederationMessageType =
  | 'task-assignment'
  | 'task-result'
  | 'consensus-vote'
  | 'peer-status'
  | 'agent-handoff';      // ← new (Component C)
```

The new type is gated by `CONSENSUS_REQUIRED_TYPES` so handoffs to high-trust peers can optionally require consensus from a quorum of validators (matching the existing pattern for `task-assignment`).

#### Wire shape

```ts
interface AgentHandoffPayload {
  readonly claimId: ClaimId;
  readonly from: ClaimantId;       // current owner
  readonly to: ClaimantId;         // proposed owner
  readonly reason: HandoffReason;  // re-uses existing domain enum
  readonly hlc: HlcTimestamp;
  readonly vclock: VectorClock;
  readonly originNodeId: string;
}
```

The envelope's `toSignablePayload()` already canonicalizes JSON for deterministic signing; the receiving peer:

1. Verifies the Ed25519 signature against the sender's public key from the peer registry.
2. Verifies the HLC is within the configured skew window.
3. Verifies the local claim's current owner matches `from` (rejects forged "I'm handing your work off" attacks).
4. If verification passes, calls the local `ClaimService.requestHandoff()` with `{ federated: true }` so audit logs preserve the cross-node provenance.

#### Why a dedicated message type

Could we ride on the existing `task-assignment` type? Yes, and the YELLOW review suggested it as a quick path. The reason for a dedicated type:

- `task-assignment` carries arbitrary payloads; reusing it for handoffs means `payload.kind = 'agent-handoff'` discrimination scattered across the receiving handler.
- A dedicated type lets us add `agent-handoff` to `CONSENSUS_REQUIRED_TYPES` without affecting other task assignments.
- Audit logs become greppable: a security review can ask "who handed off claim X" and the federation event log surfaces every cross-node transfer.

The cost is one new enum member and ~20 lines of dispatch in the federation receive loop — small relative to the readability win.

## Architecture diagram

```
┌─────────────────────── Node A (laptop) ──────────────────────┐
│                                                              │
│  ┌──────────┐     ┌─────────────────┐    ┌────────────────┐  │
│  │ ClaimSvc │────▶│ FederatedClaim  │───▶│ FederationRout │──┐
│  └──────────┘     │   Repository    │    │   Service      │  │
│        │          └─────────────────┘    └────────────────┘  │
│        ▼                  │                       │          │
│  ┌──────────┐     ┌──────────────┐                │          │
│  │ HLC      │     │  Vector      │                │          │
│  │ Clock    │     │  Clock       │                │          │
│  └──────────┘     └──────────────┘                │          │
└────────────────────────────────────────────────────┼─────────┘
                                                     │ Ed25519-signed
                                                     │ envelope
                                          (claim-event,
                                           agent-handoff)
                                                     │
┌─────────────────────────────────────────────────────┼─────────┐
│                  Node B (cloud worker)              ▼         │
│                                          ┌────────────────┐   │
│  ┌──────────┐     ┌─────────────────┐    │ FederationRout │   │
│  │ ClaimSvc │◀────│ FederatedClaim  │◀───│   Service      │   │
│  └──────────┘     │   Repository    │    └────────────────┘   │
│        │          └─────────────────┘                         │
│        ▼                  ▲                                   │
│  ┌──────────┐     ┌──────────────┐                            │
│  │ HLC      │     │  Vector      │                            │
│  │ Clock    │     │  Clock       │                            │
│  └──────────┘     └──────────────┘                            │
└───────────────────────────────────────────────────────────────┘
```

## Consequences

### Positive

- **Cross-node work-stealing becomes possible.** A node with no work to do can pull a stealable claim from a peer; the contest window already handles the race.
- **Cross-node handoff with attestation.** The receiving node has cryptographic proof the handoff was authorized — solving a real trust gap that has blocked enterprise federation deployments.
- **Distributed load balancing.** `LoadBalancer` operates on `IAgentRegistry` + `ILoadBalancerClaimRepository`. Backing the registry with federation peer data and the repository with the federated adapter turns the existing load balancer into a federation-wide one with zero changes to the balancer itself.
- **No breaking changes to local users.** The HLC degenerates to wall-clock-equivalent in single-node mode; the federated adapters are opt-in via DI.

### Negative

- **Operational complexity.** Vector clocks require all participating nodes to share a node-id space. Adding a new node to a long-running federation requires a one-time coordination ceremony (the new node starts at vclock `{}` and reconciles in O(events) time on first sync). This is not free; the rollout plan below includes specific tooling.
- **Latency on writes.** Every claim mutation now incurs network round-trips to peers. Mitigation: writes are async-by-default (return locally, replicate in the background) with a configurable strong-consistency mode for security-critical operations like handoffs.
- **Quorum failures.** If the trust circle drops below a configurable minimum size, federated writes fail-closed. Single-node operation continues to work because the federated adapters are opt-in; the failure mode is "federation off, claims still work locally."

### Neutral

- **Bigger event payloads.** Vector clocks add ~50–200 bytes per event. At the scale claims operates at (typically <100 events/sec/node), this is invisible.
- **Privacy surface widens.** Every claim event now traverses the network. The PII scan on publish is the mitigation; the audit trail in `RoutingService` is the after-the-fact verification.

## Alternatives considered

### A1. CRDT-based event log instead of vector clocks

A pure CRDT (e.g., G-set of events with deterministic ordering) would give us strong eventual consistency without explicit conflict-rejection. Rejected because:

- Claims have **causal** semantics (you cannot release a claim that was never created); CRDTs don't naturally capture "must-happen-after" constraints without auxiliary structures.
- CRDT serialization adds ~20% to event size at our scale, vs ~5% for vector clocks.
- The existing contest mechanism already handles the "two writers, who wins" case; reusing it costs nothing.

### A2. Single-leader replication (Raft within the federation)

Pick one node as the claims leader; all writes go through it. Rejected because:

- Federation is fundamentally peer-to-peer with variable trust; electing a single leader contradicts the trust model (whoever the leader is, they see all claims globally).
- Leader failover requires consensus, which contradicts ADR-097's circuit-breaker model.
- The work-stealing scheduler is **specifically designed** to be distributed; a leader would serialize the very thing we're trying to parallelize.

### A3. Re-use `task-assignment` for handoffs (YELLOW review's quick option)

Discussed in Component C above. Rejected for readability + auditability reasons (one new enum member is cheap; scattered discriminator dispatch is not).

### A4. Federate only handoffs, leave the rest local

A minimal-touch alternative: just sign handoff envelopes, skip the federated repo entirely. Rejected because:

- Without federated state, the receiving node can't verify the handoff against current claim ownership — the attestation has nothing to attest *against*.
- Cross-node steal would still be impossible.
- Half the value of the integration would be missing for half the work.

### A5. Build federation-aware claims as a sibling package

A separate `@claude-flow/federated-claims` that depends on both `@claude-flow/claims` and `@claude-flow/plugin-agent-federation`. Rejected because:

- The existing `IClaimRepository` and `IClaimEventStore` interfaces are already the right extension points. A sibling package would either duplicate them or re-export them, both of which add noise.
- npm dependency graphs already track this fan-in; a sibling package buys nothing the existing package can't deliver via opt-in DI.

## Implementation status (2026-05-09)

All three phases are landed and present on `main`. Component C's
policy-engine wiring was completed as a follow-on fix during the
2026-05-08 CI cleanup. Witness manifest now attests the load-bearing
markers across the federation surface.

| Phase / Component | Status | Files | Commit(s) |
|---|---|---|---|
| **Phase 1** — HLC clock + skew-tolerant timestamps | Implemented | `v3/@claude-flow/claims/src/infrastructure/hlc.ts` + tests | `1f826fb9b feat(claims): ADR-101 Phase 1` |
| **Phase 2** — Federated repository + event-store adapters | Implemented | `claims/src/infrastructure/federated-claim-repository.ts`, `federated-event-store.ts`, `event-store.ts` + tests | `edc39f7da feat(claims): ADR-101 Phase 2` |
| **Phase 3** — Attested handoff envelopes (`claim-event`, `agent-handoff` message types) | Implemented | `plugin-agent-federation/src/domain/entities/federation-envelope.ts:17–19` | `cc6af4b77 feat(federation): ADR-101 Phase 3` |
| **Phase 3 follow-on** — `CLAIMS_FOR_MESSAGE_TYPE` policy-engine wiring | Implemented (2026-05-08) | `plugin-agent-federation/src/application/policy-engine.ts:65–73` | `3ba0b6141 fix(plugin-agent-federation): add CLAIMS_FOR_MESSAGE_TYPE entries for ADR-101 Component C` |
| **Phase 4** — Soak test, version bump, witness regen | Witness regen done; soak test deferred | `verification.md.json` (#82 entry, marker `'agent-handoff': ['federation:write', 'federation:spawn']`) | `779eb309b chore(witness): register ADR-101-C federation fix as #82` |

Combined merge: PR `#1777` brought Phases 1–3 onto `main` as `9d4a9ea96`.

### Claim-type mapping (Component C wiring)

The `CLAIMS_FOR_MESSAGE_TYPE` `Record` in `policy-engine.ts` was missing
entries for the two new ADR-101 message types after Phase 3 landed,
which broke `Build V3` for 3+ days (TS2739 exhaustiveness error). The
follow-on fix added:

```ts
'claim-event':   ['federation:write'],                          // same shape as task-assignment
'agent-handoff': ['federation:write', 'federation:spawn'],      // state mutation + agent-lifecycle authority
```

Rationale: `claim-event` is a broadcast of state mutation across peers
(matches `task-assignment`'s authorization shape). `agent-handoff`
reshapes who owns work — sibling of `agent-spawn` — so it requires
both write authority and spawn-lifecycle authority. Both fit the
consensus-required posture this ADR specifies.

### Regression coverage

- **Witness marker** (`#82` in `verification.md.json`): file `plugin-agent-federation/dist/application/policy-engine.js`, marker string `'agent-handoff': ['federation:write', 'federation:spawn']`. A future regression that drops either entry triggers `markerVerified=false` in CI's `witness-verify` job before reaching users.
- **TypeScript exhaustiveness check** on `Record<FederationMessageType, FederationClaimType[]>` is the compile-time safety net — adding a new `FederationMessageType` member without a `CLAIMS_FOR_MESSAGE_TYPE` entry breaks `Build V3`. (This is what surfaced the original gap.)

### Open questions resolved during implementation

| Original question | Resolution |
|---|---|
| Trust registry — share or separate? | Shared, gated by `CLAIMS_MIN_TRUST` config (default `WORKING`). |
| Behavior on partition? | Continue independently for non-causal events; fail-closed for handoffs (matches the consensus-required gate). |
| Vector clock GC? | Not yet implemented; deferred. Tracked as a follow-up issue (no incidents from accumulation observed in soak runs to date). |

### Deferred

- **Phase 4 soak test (3 nodes × 30 min × 1000 claims × 200 handoffs/min)** — not yet run on CI. Local soak runs have completed cleanly during development. Promoting to scheduled CI job is a follow-up; the witness marker provides the regression-detection floor in the interim.
- **Vector-clock GC via `peer-status: EVICTED`** — depends on ADR-097 Phase 2/3 EVICT events landing; partial dependency unblocked.
- **`CLAIMS_FEDERATION_ENABLED` feature flag** — implemented as documented but defaulting to `true` rather than `false` because the implementation cleared all gating concerns during PR review. If a user-visible regression surfaces, re-gating is a single-commit revert.

---

## Implementation plan

> Historical reference — the plan as proposed in 2026-05-05. See
> "Implementation status" above for what actually shipped.

Three phases, each independently mergeable. Each phase ships behind the feature flag `CLAIMS_FEDERATION_ENABLED` (default `false` until v3.8.0).

### Phase 1 — HLC clock + skew-tolerant comparisons (1–2 days)

| Task | File | Notes |
|---|---|---|
| Implement HLC | `v3/@claude-flow/claims/src/infrastructure/hlc.ts` (new) | Pure module, ~100 lines, exhaustive unit tests |
| Replace `Date.now()` comparisons in work-stealing | `work-stealing-service.ts:540–545,357–360` | Two callsites, accept HLC via DI on construction |
| Add HLC to all event types | `domain/events.ts` | Optional field; older events read with `hlc: zeroHlc()` |
| Wire HLC into `ClaimService` | `application/claim-service.ts` | Constructor injection of `IHlc` interface |
| Migration test | `__tests__/hlc-migration.test.ts` | Old-style events still consumable with new code |

Phase 1 closes on a green local test run. No federation involvement yet.

### Phase 2 — Federated repository + event-store adapters (3–5 days)

| Task | File | Notes |
|---|---|---|
| Vector clock module | `infrastructure/vector-clock.ts` (new) | ~80 lines, partial-order tests |
| Federation bridge | `infrastructure/federation-bridge.ts` (new) | Translates `ClaimDomainEvent` ↔ federation envelopes |
| `FederatedClaimRepository` | `infrastructure/federated-claim-repository.ts` (new) | Wraps existing repo, publishes on write |
| `FederatedClaimEventStore` | `infrastructure/federated-event-store.ts` (new) | Vector-clock-versioned event store |
| Concurrent-write rejection tests | `__tests__/federated-event-store.test.ts` | Two simulated nodes writing to same aggregate |
| PII pre-publish scan | within bridge | Re-uses `RoutingServiceDeps.scanPii` |

Phase 2 closes on a green local test run + a multi-node simulation test that proves a `claim` on node A is visible on node B within bounded time.

### Phase 3 — Attested handoff envelopes (1–2 days)

| Task | File | Notes |
|---|---|---|
| Add `agent-handoff` to `FederationMessageType` | `plugin-agent-federation/src/protocol/federation-envelope.ts:1–16` | Enum addition, no breakage |
| Add to `CONSENSUS_REQUIRED_TYPES` (optional) | same file | Gated by config |
| Receive-side handler | `plugin-agent-federation/src/transport/routing-service.ts` | Verify → call `ClaimService.requestHandoff({ federated: true })` |
| Send-side hook in `ClaimService.requestHandoff` | `application/claim-service.ts:293–415` | If target is remote claimant, publish envelope; await ack with timeout |
| End-to-end attestation test | `__tests__/federated-handoff.test.ts` | Two nodes; verify rejection of forged handoff |

Phase 3 closes on a green CI run including the new e2e test on Linux + macOS + Windows runners.

### Phase 4 — Validate, optimize, publish, merge

- `npm run lint && npm run typecheck && npm test` for both `@claude-flow/claims` and `@claude-flow/plugin-agent-federation`
- Run the federation soak test for 30 minutes (3 nodes, 1000 simulated claims, 200 handoffs/min) and assert no orphaned claims, no signature failures, no PII leaks
- Bump `@claude-flow/claims` from `3.0.0-alpha.X` → `3.1.0-alpha.0` (new minor; opt-in feature flag preserves SemVer)
- Bump `@claude-flow/plugin-agent-federation` from `1.0.0-alpha.X` → `1.1.0-alpha.0`
- Update `verification.md` with a Post-witness validation entry for ADR-101
- Open PR; require green CI on all three OSes; merge after one approving review

## Test strategy

| Layer | Tests |
|---|---|
| Unit | HLC arithmetic, vector-clock partial order, envelope sign/verify |
| Integration | Two simulated nodes via in-memory transport — claim/handoff/release roundtrips |
| Property | Generators for arbitrary event interleavings; assert convergence after gossip |
| E2E | Three-node Docker compose; real Ed25519 keys; soak test for 30 min |
| Adversarial | Forged handoff attempts; clock-skew attacks; PII smuggling tests |

The adversarial layer is non-negotiable — every Component-C handoff path must have a corresponding "what if a peer lies" test.

## Open questions

1. **Should claims federation share the trust registry with `federation_send`, or have its own?** Sharing is simpler; separating gives operators the option to allow general federation without claims federation (lower-trust posture). Default plan: share, gate via `CLAIMS_MIN_TRUST` config.
2. **What's the right behavior on partition?** When the trust circle is split, should each partition continue independently and reconcile on heal, or fail-closed? Default plan: continue independently for non-causal events, fail-closed for handoffs (where attestation requires real-time peer verification).
3. **Garbage collection of vector clocks.** As nodes join and leave a federation, vector clocks accumulate dead entries. Default plan: prune via `peer-status: EVICTED` events from ADR-097's circuit breaker.

These are deferred to implementation; this ADR commits to the contracts, not the GC strategy.

## References

- Kulkarni et al., "Logical Physical Clocks and Consistent Snapshots in Globally Distributed Databases" (2014) — the HLC paper
- Lamport, "Time, Clocks, and the Ordering of Events in a Distributed System" (1978) — the foundational result
- Vogels, "Eventually Consistent" (2008) — the CRDT/eventual-consistency framing
- ADR-086 (in-repo) — Federation foundations, Ed25519 trust
- ADR-097 (in-repo) — Federation budget circuit breaker; this ADR's trust-scoring dependencies
- `verification.md` Post-witness validations — where this ADR's runtime evidence will land

## Approval

**Proposed by**: Reuven (this ADR)
**Reviewers**: federation-coordinator agent (architectural fit assessment captured in PR description)
**Sign-off required from**: maintainers of `@claude-flow/claims` and `@claude-flow/plugin-agent-federation`
