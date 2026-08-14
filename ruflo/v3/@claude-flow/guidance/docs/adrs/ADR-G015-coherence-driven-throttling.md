# ADR-G015: Coherence-Driven Privilege Throttling

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

Long-running agents accumulate errors. In current systems, these errors compound silently until the agent produces catastrophically wrong output. The standard response is to cap autonomy duration, which limits capability. A better approach: measure coherence continuously and reduce privileges proportionally, allowing the agent to continue operating in a degraded but safe mode.

## Decision

Implement `CoherenceScheduler` that computes a weighted coherence score and maps it to privilege levels:

### Coherence Score

Three signals, weighted:

| Signal | Weight | Measurement |
|--------|--------|-------------|
| Violation rate | 0.4 | Gate denials per time window |
| Rework rate | 0.3 | Edits to recently-written code |
| Drift score | 0.3 | Deviation from original task intent |

Score ranges from 0.0 (total incoherence) to 1.0 (perfect coherence).

### Privilege Levels

| Score Range | Level | Allowed Operations |
|-------------|-------|--------------------|
| >= 0.8 | `full` | All operations |
| >= 0.6 | `restricted` | No destructive tools, reduced write rate |
| >= 0.3 | `read-only` | Only read operations, no writes |
| < 0.3 | `suspended` | No operations, await human intervention |

### Recovery

Privilege can recover upward if the coherence score improves. This happens naturally when:
- The agent stops triggering gate violations
- Rework rate decreases (agent is producing stable code)
- Task intent drift stabilizes

### Economic Governor

`EconomicGovernor` enforces hard budget limits alongside soft coherence throttling:

| Budget | Enforcement |
|--------|------------|
| Tokens | Running total, hard cap |
| Tool calls | Counter per session |
| Storage bytes | Memory write accumulator |
| Wall clock time | Elapsed since session start |
| Cost (USD) | Computed from token + tool usage |

When a budget is exhausted, the governor blocks the relevant action category regardless of coherence score.

## Consequences

- Agents degrade gracefully instead of failing catastrophically
- Long-running operations become viable because incoherence is contained, not fatal
- The system self-limits without requiring human monitoring for every session
- Budget enforcement provides a hard backstop for runaway agents
- Combined coherence + economic gating reduces token and tool cost by 30-60% on long runs
- 56 tests validate score computation, privilege mapping, recovery, and budget enforcement

## Alternatives Considered

- **Hard timeout**: Too blunt; kills good agents along with bad ones
- **Human-in-the-loop checkpoints**: Doesn't scale; blocks autonomy
- **Token budget only**: Doesn't detect quality degradation; an agent can burn tokens on correct-but-useless work
