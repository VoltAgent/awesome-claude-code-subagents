# ADR-G006: Deterministic Tool Gateway -- Idempotency, Schema Validation, and Budget Metering

## Status
Accepted

## Date
2026-02-01

## Context

The enforcement gates (ADR-G004) evaluate tool calls at the moment they are attempted. In a multi-agent environment (swarms, retries, replays), the same tool call may be evaluated multiple times:

1. **Retries.** An agent retries a failed tool call. The gate should return the same decision without re-executing pattern matching.
2. **Replays.** A session is replayed for debugging or evaluation. Gate decisions must be identical to the original run for the replay to be meaningful.
3. **Concurrent agents.** Multiple agents in a swarm may attempt the same operation. The gate decision should be consistent.

Additionally, autonomous agents have no natural spending limit. Without budget enforcement, a swarm can execute thousands of tool calls, generating massive diffs and consuming unbounded resources.

The `EnforcementGates` class provides the evaluation primitives, but the orchestrating layer needs to add three cross-cutting concerns: idempotency, schema validation, and budget metering.

## Decision

Implement deterministic tool evaluation in the `GuidanceControlPlane` orchestrator (`src/index.ts`) with three layers wrapping the `EnforcementGates`:

### 1. Deterministic Evaluation

Gate evaluation is deterministic by construction. All four gates use regex pattern matching against static configuration:

- `evaluateDestructiveOps(command)` -- matches `command` against `destructivePatterns`
- `evaluateToolAllowlist(toolName)` -- checks `toolName` against `allowedTools`
- `evaluateDiffSize(filePath, diffLines)` -- compares `diffLines` to `diffSizeThreshold`
- `evaluateSecrets(content)` -- matches `content` against `secretPatterns`

No gate uses random state, network calls, or time-dependent logic. The same input always produces the same output, provided the `GateConfig` has not changed.

The `GateConfig` is set once during initialization and updated only via explicit `updateConfig()` calls, ensuring stability during a session.

### 2. Aggregation Logic

`EnforcementGates.aggregateDecision()` applies a deterministic severity hierarchy:

```typescript
const severity: Record<GateDecision, number> = {
  'block': 3,
  'require-confirmation': 2,
  'warn': 1,
  'allow': 0,
};
```

The most restrictive decision wins. This is a pure function of the input `GateResult[]` array.

### 3. Budget and Metering via the Ledger

The `RunLedger` in `src/ledger.ts` tracks cumulative metrics per run:

- `diffSummary.linesAdded` and `linesRemoved` -- total diff size
- `diffSummary.filesChanged` -- number of files modified
- `toolsUsed` -- list of tools invoked
- `durationMs` -- elapsed wall time

The `GuidanceControlPlane.startRun()` method creates a new `RunEvent` for each task. During the run, `recordViolation()` appends violations. `finalizeRun()` closes the event and runs evaluators.

The `DiffQualityEvaluator` computes the rework ratio (`reworkLines / totalLines`). If the ratio exceeds `maxReworkRatio` (default 0.3), the evaluator fails, signaling that the run produced low-quality output requiring significant rework.

Budget enforcement is implicit through the evaluator pipeline: a run that exceeds thresholds (too many violations, too many rework lines, too large a diff) is marked as failed, which feeds back into the optimizer's violation rankings.

### 4. Three Entry Points for Consistent Evaluation

The `GuidanceControlPlane` exposes three facade methods that route to the appropriate gate combination:

| Method | Evaluates | Returns |
|---|---|---|
| `evaluateCommand(command: string)` | destructive-ops, secrets | `GateResult[]` |
| `evaluateToolUse(toolName: string, params: Record<string, unknown>)` | tool-allowlist, secrets (on serialized params) | `GateResult[]` |
| `evaluateEdit(filePath: string, content: string, diffLines: number)` | diff-size, secrets | `GateResult[]` |

These methods are stateless -- they do not modify the ledger or the gate configuration. Side effects (logging, violation recording) happen at the orchestration level via `startRun()` / `recordViolation()` / `finalizeRun()`.

## Consequences

### Positive

- **Replay safety.** Because gates are pure functions of (input, config), replaying a session with the same config produces identical gate decisions. This enables deterministic evaluation in the headless test harness (ADR-G009).
- **Testability.** Gate methods can be unit-tested with simple input/output assertions. No mocking of external services needed.
- **Budget awareness.** The ledger and evaluators provide passive budget enforcement: runs that exceed thresholds are flagged, and the optimizer evolves rules to prevent recurrence.
- **Separation of concerns.** Evaluation (gates) is separated from recording (ledger) and evolution (optimizer). Each component can be tested and replaced independently.

### Negative

- **No active budget enforcement.** The current system detects budget overruns after the fact via evaluators, rather than blocking mid-run when a budget is exceeded. Active mid-run budget enforcement (e.g., "stop after 500 lines of diff") would require integrating budget checks into the gate evaluation loop per tool call, which adds complexity.
- **Config immutability assumption.** If `updateConfig()` is called mid-session, gate decisions may change for the same input. Mitigation: configuration changes are explicit and logged, and the guidance hash in the ledger tracks which version was active.

## Alternatives Considered

### 1. Explicit idempotency cache
Cache gate results by hashing the input and returning cached decisions. Rejected because the gates are already deterministic -- caching adds memory overhead without changing behavior. If performance becomes an issue (unlikely at <1ms per evaluation), caching can be layered on.

### 2. Active budget enforcement with hard limits
Block tool calls once a cumulative budget (diff lines, tool call count, duration) is exceeded. Rejected for now because it risks blocking legitimate long-running tasks. The passive approach (evaluate after, optimize rules) is less disruptive. Active enforcement is planned as a future gate.

### 3. JSON Schema validation for tool parameters
Validate tool call parameters against a schema before execution. Rejected because Claude Code already validates tool parameters against its own schemas. Adding a second validation layer would be redundant. The guidance layer focuses on policy (should this tool be used?) not schema (are the parameters well-formed?).

## References

- `v3/@claude-flow/guidance/src/gates.ts` -- `EnforcementGates.aggregateDecision()`, stateless evaluation methods
- `v3/@claude-flow/guidance/src/ledger.ts` -- `RunLedger.createEvent()`, `DiffQualityEvaluator`
- `v3/@claude-flow/guidance/src/index.ts` -- `GuidanceControlPlane.evaluateCommand()`, `evaluateToolUse()`, `evaluateEdit()`
- `v3/@claude-flow/guidance/src/types.ts` -- `GateDecision`, `GateResult`
- ADR-G004 -- The four gates this gateway wraps
- ADR-G005 -- The proof envelope that records gate decisions
