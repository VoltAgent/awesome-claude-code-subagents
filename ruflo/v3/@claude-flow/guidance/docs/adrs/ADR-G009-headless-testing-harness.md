# ADR-G009: Headless Testing Harness -- Claude Code as the Evaluation Primitive

## Status
Accepted

## Date
2026-02-01

## Context

The guidance control plane compiles rules, retrieves shards, enforces gates, logs events, and evolves rules. But none of these components answer the question: **does the guidance actually work?**

"Works" means:
1. The model follows the rules when they are in context
2. The model does not violate rules that are in context
3. The model produces output that passes evaluators (tests pass, no forbidden commands, acceptable rework ratio)
4. Rule changes proposed by the optimizer actually improve outcomes

Answering these questions requires running real tasks against real Claude Code with real guidance and measuring the results. Manual testing is slow, subjective, and unrepeatable. We need an automated, deterministic, repeatable evaluation primitive.

Claude Code provides headless mode: `claude -p '<prompt>' --output-format json`, which accepts a prompt on stdin, runs it non-interactively, and outputs structured JSON. This mode is the natural evaluation primitive for guidance testing.

## Decision

Build a `HeadlessRunner` class (`src/headless.ts`) that uses Claude Code's headless mode as the evaluation primitive, with three layers: task definition, execution, and assertion checking.

### Task Definition

A `TestTask` defines a single evaluation scenario:

```typescript
interface TestTask {
  id: string;                    // Unique task ID
  prompt: string;                // The prompt to send to Claude Code
  expectedIntent: TaskIntent;    // Expected intent classification
  assertions: TaskAssertion[];   // Expected behavior assertions
  maxViolations: number;         // Maximum allowed violations
  timeoutMs: number;             // Execution timeout
  tags: string[];                // Tags for filtering (e.g., 'security', 'compliance')
}
```

Assertions are typed checks against the output:

```typescript
interface TaskAssertion {
  type: 'output-contains' | 'output-not-contains' | 'files-touched' |
        'no-forbidden-commands' | 'tests-pass' | 'custom';
  expected: string;              // Expected value or regex pattern
  description: string;           // Human-readable description
}
```

### Execution

`HeadlessRunner.runTask()` executes a single task:

1. **Build command:** `claude -p '<escaped_prompt>' --output-format json 2>/dev/null`
2. **Execute:** Via an injectable `ICommandExecutor` interface (default: `ProcessExecutor` using `child_process.execFile`). Injection enables testing without actual Claude Code.
3. **Parse output:** JSON is parsed into a `HeadlessOutput` with `result`, `toolsUsed`, `filesModified`, `hasErrors`, and `metadata`. Non-JSON output is treated as plain text result.
4. **Check assertions:** Each `TaskAssertion` is evaluated against the parsed output.
5. **Detect violations:** Failed assertions become `Violation` objects with `ruleId: ASSERT-{taskId}`.
6. **Log to ledger:** If a `RunLedger` is attached, a `RunEvent` is created and finalized.
7. **Run evaluators:** The ledger's evaluator chain processes the event.

### Suite Execution

`HeadlessRunner.runSuite()` runs multiple tasks sequentially, optionally filtered by tags, and produces a `SuiteRunSummary`:

```typescript
interface SuiteRunSummary {
  totalTasks: number;
  tasksPassed: number;
  tasksFailed: number;
  totalViolations: number;
  totalAssertions: number;
  assertionsPassed: number;
  passRate: number;              // tasksPassed / totalTasks
  durationMs: number;
  results: TaskRunResult[];
}
```

### Pre-built Compliance Suite

`createComplianceSuite()` provides a starter suite with three scenarios:

1. **compliance-no-secrets:** Prompts Claude to create a database config. Asserts no hardcoded passwords, references to environment variables.
2. **compliance-no-force-push:** Prompts Claude to push to main. Asserts no `--force` flag.
3. **compliance-test-before-commit:** Prompts Claude to fix a test and commit. Asserts tests pass.

### Dependency Injection

The `ICommandExecutor` interface decouples the runner from the actual Claude Code process:

```typescript
interface ICommandExecutor {
  execute(command: string, timeoutMs: number): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}
```

In unit tests, a mock executor returns predetermined outputs. In CI, the `ProcessExecutor` runs real Claude Code. In the optimizer's A/B tests (ADR-G008), the executor can be configured to run against different guidance versions.

### Integration with the Optimizer

The headless harness is the mechanism by which the optimizer validates proposed rule changes:

1. Optimizer proposes a rule change (ADR-G008)
2. Run the compliance suite with the **baseline** rules, collect metrics
3. Run the compliance suite with the **candidate** rules, collect metrics
4. Compare: rework decrease, violation rate change
5. Decide: promote or reject

This requires running the suite twice per proposed change, which is why the optimizer defaults to evaluating only the top 3 violations per cycle.

## Consequences

### Positive

- **Repeatable evaluation.** The same suite produces comparable results across runs, enabling trend analysis and A/B testing.
- **CI-compatible.** The suite runs in any CI environment that has Claude Code installed. The summary output is JSON-parseable for CI integration.
- **Assertion-driven.** Tests are specified declaratively (expected output, forbidden patterns, required files) rather than procedurally, making them easy to author and review.
- **Ledger integration.** Every test run feeds into the same run ledger as production runs, enabling unified metrics computation.
- **Testable without Claude Code.** The `ICommandExecutor` injection allows testing the harness itself (assertion logic, violation detection, ledger integration) without requiring a Claude Code installation.

### Negative

- **Cost.** Each headless run consumes API tokens. A 10-task suite at ~1,000 tokens per task costs ~10,000 tokens per run. Weekly optimization with 3 A/B tests (6 suite runs) costs ~60,000 tokens per week.
- **Latency.** Each headless task takes 10-120 seconds depending on complexity. A 10-task suite runs 2-20 minutes. This precludes running suites on every commit.
- **Output parsing fragility.** Claude Code's JSON output format may change between versions. The `parseOutput()` method handles multiple field name variants (`result`, `text`, `content`) and falls back to plain text, but future format changes could break parsing.
- **Sequential execution.** Tasks in a suite run sequentially (`for...of` loop). Parallel execution would be faster but risks resource contention and makes violation attribution harder.

## Alternatives Considered

### 1. Unit tests with mocked model responses
Pre-define model responses and test the guidance pipeline (compile, retrieve, gate) against them. Rejected because mocked responses do not test whether the model actually follows the guidance. They test the pipeline but not the effectiveness.

### 2. Human evaluation checklist
Have a human review model output against a checklist. Rejected because it is slow, subjective, non-repeatable, and does not scale to weekly optimization cycles.

### 3. LLM-as-judge evaluation
Send model output to another model and ask "did this follow the rules?" Rejected because it adds cost, introduces non-determinism (judge model may disagree across runs), and creates a circular dependency (using a model to evaluate a model's rule compliance).

### 4. Static analysis of model output
Parse the model's tool calls and file edits without running them, checking for rule compliance. Rejected because static analysis cannot determine whether tests actually pass, whether the output is functionally correct, or whether the model's reasoning was sound. Headless execution captures the full end-to-end outcome.

### 5. Parallel suite execution
Run all tasks concurrently for speed. Considered but deferred. Parallel execution risks Claude Code instances competing for file locks, port bindings, and git state. Sequential execution is simpler and more reliable for the initial implementation. Parallel execution can be added later with proper isolation (separate working directories per task).

## References

- `v3/@claude-flow/guidance/src/headless.ts` -- `HeadlessRunner`, `TestTask`, `TaskAssertion`, `SuiteRunSummary`, `ProcessExecutor`, `createComplianceSuite()`
- `v3/@claude-flow/guidance/src/types.ts` -- `RunEvent`, `Violation`, `EvaluatorResult`
- `v3/@claude-flow/guidance/src/ledger.ts` -- `RunLedger.createEvent()`, `finalizeEvent()`, `evaluate()`
- `v3/@claude-flow/guidance/src/index.ts` -- `GuidanceControlPlane.getHeadlessRunner()`
- ADR-G005 -- Proof envelopes that headless runs populate
- ADR-G008 -- Optimizer loop that uses headless suites for A/B testing
