# ADR-G024: Continue Gate

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

Existing gates are tool-centric: `PreToolUse`, `PreCommand`, `PreEdit`. They evaluate individual actions. But long-run failures are rarely a single bad tool call. They are internally generated loops where the agent keeps going — redoing work, burning tokens, drifting from the goal — without any individual step being obviously wrong. There is no gate for "should this agent continue at all?"

The CoherenceScheduler (G015) throttles privilege based on accumulated violations, but it does not evaluate *next-step intent*. The EconomicGovernor tracks budget consumption but does not detect acceleration. Neither checks whether the agent is stuck in a rework loop.

## Decision

Introduce `ContinueGate` — a step-level gate that evaluates whether a long-running agent should proceed to its next step.

**Decision Types (priority order):**

| Decision | Trigger | Effect |
|----------|---------|--------|
| `stop` | Coherence below threshold, step limit, budget exhausted | Halt immediately |
| `pause` | Rework ratio > 30%, uncertainty > 80% | Stop, await human review |
| `throttle` | Budget slope accelerating > 2%/step | Slow down, insert delays |
| `checkpoint` | N steps since last checkpoint | Save state before continuing |
| `continue` | All checks pass | Proceed normally |

**Evaluation Inputs (StepContext):**
- `stepNumber`, `totalTokensUsed`, `totalToolCalls`
- `reworkCount` — steps that redo previous work
- `coherenceScore` — from CoherenceScheduler (0–1)
- `uncertaintyScore` — from UncertaintyAggregator (0–1)
- `budgetRemaining` — tokens, tool calls, time
- `lastCheckpointStep` — step number of last checkpoint

**Budget Slope Detection:**
Linear regression over the last 10 steps of token usage. If the slope is positive and exceeds `maxBudgetSlopePerStep` (default 0.02), the agent is accelerating spend — typically a sign of retry loops or expanding context.

**Defaults:**
- `maxConsecutiveSteps`: 100
- `checkpointIntervalSteps`: 25
- `minCoherenceForContinue`: 0.4
- `maxUncertaintyForContinue`: 0.8
- `maxReworkRatio`: 0.3
- `cooldownMs`: 5000

The gate maintains an evaluation history (max 10,000 entries) and provides aggregate statistics for monitoring.

## Consequences

- Long-running agents self-throttle before runaway, without human intervention
- Budget acceleration is detected early via linear regression, not just threshold comparison
- Rework loops surface as a measurable ratio, triggering pause before wasted spend
- Forced checkpoints create restore points for crash recovery and debugging
- The gate composes with existing gates (it evaluates intent, they evaluate individual actions)
- Decision metrics (budgetSlope, reworkRatio, coherenceLevel, uncertaintyLevel) are returned with every evaluation for observability

## Alternatives Considered

- **Hard timeout only**: Misses the case where the agent is slow but productive; timeout is a blunt instrument
- **Token budget as sole control**: Does not detect rework or coherence degradation
- **Supervisor agent**: Adds latency and coordination overhead; the continue gate is local and synchronous
