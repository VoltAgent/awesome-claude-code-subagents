# ADR-G013: Evolution Pipeline

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

Governance rules must evolve as the system learns. Static rules become stale. But changing governance in a live autonomous system is dangerous — a bad rule change can cascade into widespread failure. A structured, auditable, reversible process for rule evolution is required.

## Decision

Implement `EvolutionPipeline` with a strict lifecycle for rule changes:

### Proposal Lifecycle

```
draft -> signed -> simulating -> compared -> staged -> promoted
                                                    \-> rolled-back
```

| State | What Happens |
|-------|-------------|
| `draft` | Author creates proposal with kind, description, risk assessment |
| `signed` | Proposal receives cryptographic signature from author |
| `simulating` | Proposal is applied to recorded traces in shadow mode |
| `compared` | Simulation results compared against baseline (divergence measured) |
| `staged` | Proposal enters gradual rollout through canary/partial/full stages |
| `promoted` | Proposal becomes active policy |
| `rolled-back` | Proposal is reverted due to excessive divergence |

### Change Proposal Kinds

| Kind | Description |
|------|-------------|
| `add-rule` | New governance rule |
| `modify-rule` | Change to existing rule |
| `remove-rule` | Deletion of a rule |
| `promote-shard` | Elevate shard to constitution |
| `demote-rule` | Move constitution rule to shard |
| `adjust-threshold` | Change gate thresholds |
| `capability-change` | Modify capability algebra |

### Staged Rollout

Each proposal rolls out through stages:

| Stage | Typical Config |
|-------|---------------|
| Canary | 5-10% of agents, 1 hour |
| Partial | 25-50% of agents, 4 hours |
| Full | 100% of agents |

**Auto-rollback** triggers if divergence exceeds the configured threshold (default 5%) at any stage. Divergence is measured as the fraction of golden trace decisions that change under the new rule set.

### Simulation

Before staging, every proposal is simulated against recorded golden traces:
- Apply the proposed change to a copy of the rule set
- Replay all traces through the modified gates
- Count how many decisions differ (divergence)
- Identify regressions (previously-passing traces that now fail)

## Consequences

- Rule changes are auditable (every proposal has an author, signature, and risk assessment)
- Simulation catches regressions before any real agent is affected
- Staged rollout limits blast radius of bad changes
- Auto-rollback prevents cascading failures
- 43 tests validate the full lifecycle, simulation, staging, and rollback

## Alternatives Considered

- **Manual rule editing**: No audit trail, no simulation, no rollback
- **Feature flags**: Too coarse (on/off), no staged rollout or simulation
- **Canary deployments only**: Missing the simulation step that catches issues before any real traffic
