# ADR-G001: Guidance Control Plane -- A Parallel Enforcement Layer Beside Claude Code

## Status
Accepted

## Date
2026-02-01

## Context

Claude Code loads `CLAUDE.md` into its context window as a system prompt at session start. This mechanism has three fundamental limitations:

1. **No enforcement.** Rules in `CLAUDE.md` are advisory. The model can forget, ignore, or misinterpret them at any point during a long session. There is no gate that blocks a tool call when a rule is violated.

2. **No retrieval.** Every rule in `CLAUDE.md` consumes tokens on every turn, regardless of whether the current task needs it. A 2,000-line guidance file wastes context on irrelevant rules while still missing edge cases because the model's attention degrades over long documents.

3. **No learning.** When the model violates a rule and a human corrects it, the correction is ephemeral. The same mistake recurs in the next session because there is no feedback loop from violations back to the rule set.

These limitations compound in autonomous agent scenarios (swarms, long-running daemon tasks) where human oversight is intermittent and context windows are shared across sub-agents.

The existing Claude Flow V3 infrastructure provides hooks (`pre-edit`, `pre-command`, `post-task`), a memory subsystem (AgentDB + HNSW), and a headless execution mode (`claude -p --output-format json`). A control plane can leverage all three without modifying Claude Code itself.

## Decision

Build a separate package, `@claude-flow/guidance`, that runs **beside** Claude Code as a parallel control plane. The control plane has five components:

1. **Compiler** (`GuidanceCompiler` in `src/compiler.ts`) -- Parses `CLAUDE.md` and optional `CLAUDE.local.md` into a `PolicyBundle` containing a constitution, rule shards, and a machine-readable manifest. The compiler extracts rule IDs, risk classes, tool classes, intent tags, repo scopes, domain tags, verifiers, and priority annotations using deterministic regex patterns.

2. **Retriever** (`ShardRetriever` in `src/retriever.ts`) -- Stores shards with embeddings and retrieves the top N shards per task by semantic similarity, boosted by intent match and risk class. Always includes the constitution. Resolves contradictions by preferring higher-priority rules.

3. **Gates** (`EnforcementGates` in `src/gates.ts`) -- Four synchronous enforcement gates (destructive ops, tool allowlist, diff size, secrets) that evaluate every tool call. Gates return `allow`, `block`, `warn`, or `require-confirmation` decisions. The most restrictive decision wins.

4. **Ledger** (`RunLedger` in `src/ledger.ts`) -- Logs every run as a `RunEvent` with tools used, files touched, diff summary, test results, violations, and outcome. Five built-in evaluators (tests-pass, forbidden-command-scan, forbidden-dependency-scan, violation-rate, diff-quality) assess each event.

5. **Optimizer** (`OptimizerLoop` in `src/optimizer.ts`) -- Weekly cycle that ranks violations by frequency and cost, proposes rule changes, A/B tests them against baseline metrics, and promotes winners. Local rules that win twice become root rules.

The orchestrating class `GuidanceControlPlane` in `src/index.ts` wires these five components together and exposes a unified API: `initialize()`, `retrieveForTask()`, `evaluateCommand()`, `evaluateToolUse()`, `evaluateEdit()`, `startRun()`, `finalizeRun()`, and `optimize()`.

## Consequences

### Positive

- **Deterministic enforcement.** Gates cannot be bypassed by the model. A `block` decision prevents the tool call regardless of the model's reasoning.
- **Token efficiency.** Only the constitution (~500 tokens) is always loaded. Task-relevant shards add 200-800 tokens on demand, replacing a monolithic 2,000+ line prompt.
- **Closed-loop learning.** Violations feed back into the optimizer, which evolves the rule set over time. Rules improve without human intervention.
- **Auditability.** Every run is logged with the exact guidance hash, retrieved rules, tools used, and violations detected.
- **Testability.** The headless harness (`HeadlessRunner` in `src/headless.ts`) enables CI-driven evaluation of guidance effectiveness.

### Negative

- **Added latency.** Each gate check adds approximately 1-5ms. Shard retrieval with embedding computation adds 5-15ms at task start.
- **Operational surface.** The control plane is a separate process/module that must be initialized, configured, and kept in sync with `CLAUDE.md` changes.
- **Complexity.** A new abstraction layer (PolicyBundle, shards, constitution, gates, ledger, optimizer) that developers must understand.

## Alternatives Considered

### 1. Improve CLAUDE.md formatting only
Restructure the markdown to make rules more prominent. Rejected because formatting changes do not add enforcement, retrieval, or learning -- they only marginally improve attention within the context window.

### 2. Fine-tune the model on guidance rules
Train guidance into model weights. Rejected because fine-tuning is slow (days), expensive, inflexible (cannot change rules without retraining), and unavailable for Claude models via the public API.

### 3. Build enforcement inside Claude Code via monkey-patching
Intercept tool calls within the Claude Code process. Rejected because it couples to Claude Code internals, breaks on updates, and is fragile. A parallel system is decoupled and version-independent.

### 4. Use MCP tools for all enforcement
Route all enforcement through MCP server endpoints. Rejected for latency reasons (network round-trip per gate check) and because MCP tools are asynchronous -- gates must be synchronous to block tool calls before execution.

## References

- `v3/@claude-flow/guidance/src/index.ts` -- `GuidanceControlPlane` orchestrator class
- `v3/@claude-flow/guidance/src/compiler.ts` -- `GuidanceCompiler`
- `v3/@claude-flow/guidance/src/retriever.ts` -- `ShardRetriever`
- `v3/@claude-flow/guidance/src/gates.ts` -- `EnforcementGates`
- `v3/@claude-flow/guidance/src/ledger.ts` -- `RunLedger`
- `v3/@claude-flow/guidance/src/optimizer.ts` -- `OptimizerLoop`
- `v3/@claude-flow/guidance/src/headless.ts` -- `HeadlessRunner`
- `v3/@claude-flow/guidance/src/types.ts` -- All type definitions
