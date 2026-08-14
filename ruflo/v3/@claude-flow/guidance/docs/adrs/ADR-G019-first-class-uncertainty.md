# ADR-G019: First-Class Uncertainty

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

The existing memory and gate systems treat every value as equally certain. A memory entry written from a reliable API response has the same standing as one inferred from a single ambiguous log line. When agents act on low-confidence data, they produce confident-looking outputs that may be wrong. There is no way to express "I think this is true but I'm not sure" or "two pieces of evidence disagree."

## Decision

Introduce `UncertaintyLedger` and `UncertaintyAggregator`:

**Belief Tracking:**
- Each belief carries a claim, namespace, evidence array, and confidence interval (lower, point, upper)
- Evidence is directional: `supporting` or `opposing`, each with a weight (0-1) and source
- Status is derived from evidence ratios and confidence:

| Status | Condition |
|--------|-----------|
| `confirmed` | confidence >= 0.95, no opposing evidence |
| `probable` | confidence >= 0.8, opposing ratio < 0.3 |
| `uncertain` | confidence >= 0.5, opposing ratio < 0.3 |
| `contested` | opposing evidence ratio >= 0.3 |
| `refuted` | opposing evidence ratio >= 0.7 |
| `unknown` | no evidence |

**Confidence Mechanics:**
- `recomputeConfidence()`: point = supportingWeight / totalWeight, spread = 0.3 / sqrt(evidenceCount)
- `addEvidence()` recomputes confidence and re-derives status automatically
- `decayAll(timestamp)`: confidence decays linearly over time at a configurable rate
- `isActionable(id)`: returns false if confidence.point < minConfidenceForAction threshold

**Aggregation:**
- `aggregate(ids)`: geometric mean of confidence points (penalizes low-confidence beliefs heavily)
- `worstCase(ids)`: minimum confidence across a set
- `bestCase(ids)`: maximum confidence across a set
- `anyContested(ids)` / `allConfirmed(ids)`: status-based queries

**Inference Chains:**
- Beliefs can depend on other beliefs via `dependsOn` arrays
- `propagateUncertainty(id)`: propagates confidence drops through dependency chains
- `getInferenceChain(id)`: returns the full dependency graph for audit

## Consequences

- Agents can express and reason about uncertainty instead of treating everything as certain
- Contested beliefs are surfaced automatically before they cause damage
- Actionability gating prevents decisions on low-confidence data
- Geometric mean aggregation ensures one weak belief drags down the whole set
- Inference chains make it possible to trace why a belief is uncertain
- 74 tests validate status transitions, evidence tracking, decay, aggregation, and inference chains

## Alternatives Considered

- **Probability distributions per entry**: Too heavy for the common case; confidence intervals are sufficient
- **Bayesian networks**: Correct but requires a full probabilistic programming runtime
- **Simple confidence score (single float)**: Loses the interval and evidence trail; insufficient for contested detection
