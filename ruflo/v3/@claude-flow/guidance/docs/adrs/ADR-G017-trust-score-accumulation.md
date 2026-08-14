# ADR-G017: Trust Score Accumulation

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

The CoherenceScheduler (G015) throttles privilege based on violation/rework/drift scores, but treats every agent identically regardless of track record. A coder agent that has completed 500 gate checks without a single denial is subject to the same rate limits as one that was denied 20 times in its first hour. There is no memory of good behavior, so agents cannot earn trust and the system cannot reward reliability.

## Decision

Introduce a `TrustSystem` comprising `TrustAccumulator` and `TrustLedger`:

**Score Mechanics:**
- Each agent starts at `initialTrust` (default 0.5)
- `allow` outcomes add +0.01
- `deny` outcomes subtract -0.05 (5x heavier than reward)
- `warn` outcomes subtract -0.02
- Scores are clamped to [0.0, 1.0]

**Tier System:**

| Tier | Threshold | Rate Multiplier |
|------|-----------|-----------------|
| trusted | >= 0.8 | 2x |
| standard | >= 0.5 | 1x |
| probation | >= 0.3 | 0.5x |
| untrusted | < 0.3 | 0.1x |

**Decay:**
- Idle agents decay exponentially toward `initialTrust`
- Formula: `score = target + (score - target) * (1 - decayRate) ^ intervals`
- Prevents permanently high trust from stale history

**Ledger:**
- Every score change is recorded with agent, outcome, score delta, and timestamp
- 10,000 record cap with oldest-first eviction
- Export/import for persistence across sessions

## Consequences

- Reliable agents earn faster throughput; unreliable agents are automatically throttled
- The 5:1 penalty/reward asymmetry means trust is hard to earn and easy to lose
- Decay prevents trust inflation from old history
- The ledger provides a full audit trail for trust-related decisions
- 99 tests validate accumulation, decay, tiers, rate multipliers, and ledger operations

## Alternatives Considered

- **Binary trust (trusted/untrusted)**: Too coarse; no gradient for proportional response
- **Reputation tokens**: Adds economic complexity without clear benefit at this layer
- **Session-scoped trust only**: Loses institutional memory across sessions; export/import solves this
