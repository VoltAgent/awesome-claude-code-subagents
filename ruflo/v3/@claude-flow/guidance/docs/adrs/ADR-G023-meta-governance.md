# ADR-G023: Meta-Governance

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

The governance system can now compile rules, enforce gates, accumulate trust, detect threats, and evolve policies. But nothing governs the governance system itself. The optimizer (G008) can promote rules without bound. Amendments to the constitution have no formal process. There are no invariants that must hold regardless of what the optimizer or evolution pipeline does. Without meta-governance, the system can drift from its own principles — the governance equivalent of a constitutional crisis.

## Decision

Introduce `MetaGovernor` with three capabilities: constitutional invariants, amendment lifecycle, and optimizer constraints.

**Constitutional Invariants:**
Built-in invariants that must always hold:

| Invariant | Severity | Immutable | Condition |
|-----------|----------|-----------|-----------|
| Constitution size limit | critical | yes | constitutionSize <= 60 lines |
| Minimum gate count | critical | yes | gateCount >= 4 |
| Rule count sanity | warning | no | ruleCount <= 1000 |
| Optimizer drift bounds | warning | no | maxDriftPerCycle <= 0.2 |

- `checkAllInvariants(state)` returns a report with pass/fail for each invariant
- Critical immutable invariants cannot be removed even by amendment
- Custom invariants can be added with `addInvariant()`
- Non-immutable invariants can be removed with `removeInvariant()`

**Amendment Lifecycle:**
Formal process for changing the governance system:

```
propose → vote → resolve → enact (or reject/veto)
```

- Proposals require a supermajority (default 0.75 = 3/4 approval)
- Rate-limited: max 3 amendments per 24-hour window
- Each amendment specifies concrete changes: `add-rule`, `remove-rule`, `modify-rule`, `adjust-threshold`, `add-gate`, `remove-gate`
- Changes targeting immutable invariants are rejected at enact time
- Emergency veto power bypasses the voting process with a recorded reason
- Full amendment history is preserved for audit

**Optimizer Constraints:**
Bounds on what the optimizer (G008) can do per cycle:

| Constraint | Default | Purpose |
|------------|---------|---------|
| maxDriftPerCycle | 0.1 (10%) | Limits how much rules can change per optimization pass |
| maxPromotionRate | 2 | Max rules promoted per cycle |
| maxDemotionRate | 1 | Max rules demoted per cycle |
| cooldownMs | 3,600,000 (1h) | Minimum time between optimizer actions |

- `validateOptimizerAction(action)` checks all constraints before allowing the action
- Violations are reported with specific constraint names for debugging
- `resetOptimizerTracking()` clears per-cycle counters at cycle boundaries

## Consequences

- The governance system has explicit limits on its own evolution
- Constitutional invariants prevent catastrophic drift (gates cannot be removed below minimum)
- Amendments require broad consensus, preventing unilateral rule changes
- The optimizer operates within defined bounds, preventing runaway promotion/demotion
- Rate limiting on amendments prevents governance churn
- Emergency veto provides a safety valve for urgent situations
- The system can now answer: "who governs the governors?"

## Alternatives Considered

- **Immutable constitution (no amendments)**: Too rigid; governance must evolve with requirements
- **Single-admin override**: No consensus requirement; single point of failure
- **Optimizer self-regulation**: Circular; the optimizer cannot reliably constrain itself
- **External governance service**: Adds dependency; meta-governance should be self-contained
