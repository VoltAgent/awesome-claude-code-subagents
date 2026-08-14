# ADR-G004: Four Enforcement Gates -- Destructive Ops, Tool Allowlist, Diff Size, Secrets

## Status
Accepted

## Date
2026-02-01

## Context

Claude Code can execute arbitrary tool calls: bash commands, file edits, file writes, MCP tool invocations, and task spawns. When operating autonomously (in swarms, long daemon sessions, or headless mode), the model may:

- Run destructive commands (`rm -rf /`, `git push --force origin main`, `DROP DATABASE`)
- Use tools that were not intended for the current task
- Produce massive diffs that are difficult to review and likely to contain errors
- Leak secrets by writing API keys, passwords, or private keys into committed files

The model's adherence to `CLAUDE.md` rules is probabilistic. Rules in the context window are suggestions -- the model can and does ignore them, especially in long sessions where attention degrades. We need gates that are **synchronous**, **mandatory**, and **non-bypassable** by the model.

The gates must be configurable (teams have different risk tolerances), produce structured results (for ledger logging), and reference active guidance rules (for traceability).

## Decision

Implement exactly four enforcement gates in the `EnforcementGates` class (`src/gates.ts`), each covering a distinct high-risk category:

### Gate 1: Destructive Operations (`evaluateDestructiveOps`)

**Trigger:** Regex match against `destructivePatterns` in the `GateConfig`. Default patterns:

```typescript
/\brm\s+-rf?\b/i,
/\bdrop\s+(database|table|schema|index)\b/i,
/\btruncate\s+table\b/i,
/\bgit\s+push\s+.*--force\b/i,
/\bgit\s+reset\s+--hard\b/i,
/\bgit\s+clean\s+-fd?\b/i,
/\bformat\s+[a-z]:/i,
/\bdel\s+\/[sf]\b/i,
/\b(?:kubectl|helm)\s+delete\s+(?:--all|namespace)\b/i,
/\bDROP\s+(?:DATABASE|TABLE|SCHEMA)\b/i,
/\bDELETE\s+FROM\s+\w+\s*$/i,
/\bALTER\s+TABLE\s+\w+\s+DROP\b/i,
```

**Decision:** `require-confirmation`. The operation is not blocked outright but requires explicit human confirmation and a documented rollback plan.

**Remediation:** The gate response includes three-step remediation: confirm intention, document rollback plan, ensure migration has a down step.

### Gate 2: Tool Allowlist (`evaluateToolAllowlist`)

**Trigger:** Tool name not found in `allowedTools` array. Supports exact match, wildcard prefix (`mcp_*`), and universal wildcard (`*`).

**Decision:** `block`. Unapproved tools are blocked entirely.

**Default state:** Disabled (`toolAllowlist: false`). When enabled with an explicit allow list, only listed tools can be used. This is intended for high-security environments.

### Gate 3: Diff Size (`evaluateDiffSize`)

**Trigger:** `diffLines > diffSizeThreshold` (default: 300 lines).

**Decision:** `warn`. The operation proceeds but the model is instructed to create a plan, stage changes incrementally, run tests after each stage, and consider splitting into multiple PRs.

**Rationale for warn vs. block:** Large diffs are not inherently dangerous; they are a code smell. Blocking would prevent legitimate refactoring. The warning ensures the model is aware and plans accordingly.

### Gate 4: Secrets Detection (`evaluateSecrets`)

**Trigger:** Regex match against `secretPatterns` in content. Default patterns cover:

- API keys (`api_key=`, `apikey=`)
- Passwords (`password=`, `secret=`)
- Bearer tokens
- PEM private keys
- Provider-specific patterns: `sk-*` (Anthropic/OpenAI), `ghp_*` (GitHub), `npm_*` (npm), `AKIA*` (AWS)

**Decision:** `block`. Secrets must never be committed or exposed.

**Redaction:** Detected secrets are partially redacted in the gate result (first 4 chars + asterisks + last 4 chars) to aid debugging without exposing the full value.

### Aggregation

The `aggregateDecision()` method returns the most restrictive decision across all gate results using a severity hierarchy: `block (3) > require-confirmation (2) > warn (1) > allow (0)`.

### Entry Points

Three entry points invoke gates in the appropriate combination:

| Entry Point | Gates Invoked |
|---|---|
| `evaluateCommand(command)` | destructive-ops, secrets |
| `evaluateToolUse(toolName, params)` | tool-allowlist, secrets |
| `evaluateEdit(filePath, content, diffLines)` | diff-size, secrets |

Each entry point returns an array of `GateResult` objects, allowing callers to inspect individual gate decisions.

## Consequences

### Positive

- **Non-bypassable.** Gates run in the hook layer, outside the model's control. The model cannot skip or override a `block` decision.
- **Structured results.** Every gate decision includes `gateName`, `reason`, `triggeredRules`, `remediation`, and `metadata`. This feeds directly into the run ledger.
- **Configurable.** Teams can disable gates (`destructiveOps: false`), adjust thresholds (`diffSizeThreshold: 500`), add custom patterns, or define allowlists -- all via `GateConfig`.
- **Composable.** Gates are evaluated independently. Adding a fifth gate requires only a new method and a configuration flag, with no changes to existing gates.

### Negative

- **False positives.** A regex-based secrets detector will flag test fixtures, documentation examples, and mock data that look like secrets. Mitigation: teams can customize `secretPatterns` and add exclusion patterns.
- **No semantic understanding.** The destructive ops gate cannot distinguish `rm -rf ./tmp/cache` (safe) from `rm -rf /` (catastrophic). Both match the pattern. Mitigation: the gate returns `require-confirmation` rather than `block`, allowing the human to approve safe operations.
- **Static patterns.** New destructive commands or secret formats require configuration updates. Mitigation: the optimizer loop can propose new patterns based on observed violations.

## Alternatives Considered

### 1. More gates (8-10 covering style, naming, etc.)
Add gates for code style, naming conventions, import ordering. Rejected because soft-preference rules do not warrant synchronous blocking. They belong in the retrieval layer (shards) or post-hoc evaluation (ledger evaluators), not in gates.

### 2. Fewer gates (just secrets)
Only block secrets, warn for everything else. Rejected because destructive operations have irreversible consequences. A `rm -rf` after the fact cannot be undone by a warning.

### 3. LLM-based gate evaluation
Send the command to a model and ask "is this dangerous?" Rejected because it adds latency (200-500ms per gate check), is non-deterministic, and could itself be manipulated by prompt injection in the command being evaluated.

### 4. Probabilistic scoring instead of hard gates
Assign a risk score and let the model decide whether to proceed. Rejected because the entire point of gates is to remove the model's agency over high-risk decisions. A probability threshold that the model can reason about is no better than a rule in the context window.

## References

- `v3/@claude-flow/guidance/src/gates.ts` -- `EnforcementGates` class, `GateConfig`, default patterns
- `v3/@claude-flow/guidance/src/types.ts` -- `GateDecision`, `GateResult`, `GateConfig`
- `v3/@claude-flow/guidance/src/index.ts` -- `GuidanceControlPlane.evaluateCommand()`, `evaluateToolUse()`, `evaluateEdit()`
- ADR-G001 -- Why enforcement lives outside the model
