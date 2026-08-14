# ADR-G020: Temporal Assertions

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

The existing memory system stores values without temporal semantics. An entry written at 2pm that says "server is healthy" remains true indefinitely until explicitly overwritten. There is no way to express "this was true at 2pm but may not be true now," "this will become true at midnight," or "this fact replaced a previous fact." Agents operating on stale temporal data make decisions based on expired reality.

## Decision

Introduce `TemporalStore` and `TemporalReasoner` with bitemporal semantics:

**Bitemporal Model:**
Each assertion carries two time dimensions:
- **Validity window** (`validFrom`, `validUntil`): when the fact is true in the real world
- **Assertion time** (`assertedAt`): when the system recorded this fact

This distinguishes "was true" (past validity), "is true" (current validity), "will be true" (future validity), and "when did we learn this" (assertion time).

**Temporal Status:**

| Status | Condition |
|--------|-----------|
| `future` | validFrom is after current time |
| `active` | current time is within [validFrom, validUntil] |
| `expired` | validUntil is before current time |
| `superseded` | replaced by a newer assertion |
| `retracted` | explicitly withdrawn |

**Operations:**
- `assert(claim, namespace, window)`: create a temporally-bounded assertion
- `supersede(oldId, newClaim, newWindow)`: replace an assertion while preserving history
- `retract(id, reason)`: withdraw an assertion with recorded reason
- `getActiveAt(namespace, timestamp)`: all assertions valid at a specific time
- `getCurrentTruth(namespace)`: active assertions right now
- `getTimeline(id)`: full predecessor/successor chain with cycle detection
- `reconcile(namespace)`: detect conflicts among active assertions

**Temporal Reasoning:**
- `whatWasTrue(namespace, timestamp)`: query past state
- `whatIsTrue(namespace)`: query current state
- `whatWillBeTrue(namespace, timestamp)`: query future state
- `hasChanged(namespace, sinceTimestamp)`: detect changes since a checkpoint
- `conflictsAt(namespace, timestamp)`: find temporal overlaps
- `projectForward(namespace, horizonMs)`: predict upcoming expirations

**Capacity:** Max 10,000 assertions with eviction priority: expired first, then retracted, oldest first.

## Consequences

- Facts have explicit lifetimes; expired data is automatically excluded from queries
- Supersession chains preserve full history while surfacing only current truth
- Temporal reasoning enables forward-looking decisions (upcoming expirations, scheduled changes)
- Conflict detection catches overlapping assertions in the same namespace
- 98 tests validate bitemporal windows, supersession, retraction, reasoning, and timeline traversal

## Alternatives Considered

- **TTL on memory entries**: Only handles expiration, not future activation or supersession
- **Event sourcing**: Correct but requires a full event store; temporal assertions are lighter weight
- **Temporal databases (e.g., XTDB)**: Too heavy a dependency for an embedded governance module
