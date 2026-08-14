---
# ADR-067: Critical Issue Remediation — v3.5.43
---

**Status**: Implemented
**Date**: 2026-03-25
**Author**: RuvNet
**Version**: v3.5.42 → v3.5.43
**Tracking**: GitHub Issues #1395, #1423, #1425, #1428, #1431, #1399, #1404, #1422

## Context

Community-reported issues have identified 6 critical/high-severity bugs and 2 moderate issues in v3.5.42 that collectively degrade core functionality — swarm execution, headless workers, memory initialization, AgentDB bridge, MCP schema validation, and hive-mind tool routing. Multiple reporters confirm that the swarm orchestration engine registers agents but never dispatches work, headless workers fail 100% of the time, and accumulated daemon processes can cause kernel panic on macOS.

This ADR documents all findings, root causes, and the remediation plan for v3.5.43.

## Issue Summary

| Priority | Issue | GitHub | Root Cause |
|----------|-------|--------|------------|
| **P0 — Critical** | Headless workers hang forever (stdin never closed) | #1395 (Bug 1) | `stdio: ['pipe','pipe','pipe']` — stdin opened but never closed; `claude --print` blocks on EOF |
| **P0 — Critical** | Workers fail inside active Claude Code session | #1395 (Bug 2) | Nested session detection kills subprocess; workers can never succeed during normal use |
| **P0 — Critical** | Swarm agents do not execute work | #1423, #1425 | `startSwarm()` updates metadata but has no task consumer/dispatcher; commands return hardcoded success |
| **P1 — High** | Stale/nonexistent model IDs in daemon workers | #1431 | Hardcoded `claude-sonnet-4-5-20250929` and `claude-haiku-4-5-20251001` — both expired/invalid |
| **P1 — High** | Daemons never terminate, accumulate across sessions | #1395 (Bug 3) | No PID singleton enforcement; each session spawns a new daemon |
| **P1 — High** | `memory init` hangs after completion | #1428 | ONNX worker threads + SQLite connection never terminated; no `process.exit()` after init |
| **P2 — Medium** | AgentDB bridge unavailable | #1399 | CLI bundles `@claude-flow/memory@alpha.11` (missing `ControllerRegistry`); runtime patch targets v1.x paths |
| **P2 — Medium** | MCP array schema missing `items` | #1404 | `type: 'array'` without `items` in ruvllm-tools.ts — invalid JSON Schema, breaks VSCode Copilot |
| **P2 — Medium** | Hive-mind uses native tools instead of MCP | #1422 | No tool preference enforcement; Claude defaults to native tools over Ruflo MCP |

## Decision

Address all issues in a single v3.5.43 release, prioritized by severity and dependency order.

### Phase 1: Headless Worker Lifecycle (P0) — #1395, #1431

**1.1 — Fix stdin pipe (one-line change)**

File: `v3/@claude-flow/cli/src/daemon/headless-worker-executor.ts`

```diff
- stdio: ['pipe', 'pipe', 'pipe']
+ stdio: ['ignore', 'pipe', 'pipe']
```

Rationale: `'ignore'` closes stdin at spawn, allowing `--print` mode to proceed immediately. This unblocks all headless worker functionality.

**1.2 — Fix nested session detection**

Options (choose one):
- **A (Preferred)**: Set `CLAUDE_CODE_WORKER=1` env var on spawned processes; patch Claude Code session check to allow workers
- **B**: Use Anthropic SDK directly for LLM calls in workers, bypassing `claude --print` entirely
- **C (Minimum)**: Disable `optimize`/`testgaps` workers by default; document limitation

**1.3 — Update model IDs to aliases**

File: `v3/@claude-flow/cli/src/daemon/headless-worker-executor.ts`

```diff
  const MODEL_IDS = {
-   sonnet: 'claude-sonnet-4-5-20250929',
-   opus: 'claude-opus-4-6',
-   haiku: 'claude-haiku-4-5-20251001',
+   sonnet: 'sonnet',
+   opus: 'opus',
+   haiku: 'haiku',
  };
```

Rationale: Model aliases auto-resolve to the latest version, preventing future staleness. Additionally, add a `model` field to `daemon-state.json` worker config for user overrides.

**1.4 — PID singleton enforcement for daemon**

Implement standard PID-file pattern:
1. On `daemon start`, check `$PROJECT/.claude-flow/daemon.pid`
2. If recorded PID is alive (`kill -0`), skip start
3. If dead, clean PID file and start fresh
4. Write PID on start; delete on clean exit and SIGTERM/SIGINT handlers

**1.5 — Fix orphan process cleanup**

When wrapper timeout fires, send `SIGTERM` to the child process group (not just reject the promise). Align wrapper timeout to `executor_timeout + 60s`.

### Phase 2: Swarm Execution Engine (P0) — #1423, #1425

**2.1 — Implement task dispatcher**

The core gap: `startSwarm()` in `swarm.ts` registers agents and updates metadata but has no execution loop. Commands like `swarm start`, `swarm coordinate`, and task operations return hardcoded responses.

Remediation:
1. Add `TaskDispatcher` class that polls task queue and dispatches to agent workers
2. Replace hardcoded response stubs with actual process spawning via `claude --print` or SDK calls
3. Add execution status tracking with real agent state (not hardcoded `"active"`)

**2.2 — Remove hardcoded stubs**

Audit all commands in `swarm.ts` and `deployment.ts` for stub responses. Either:
- Implement the actual functionality
- Return honest error: `"Not yet implemented"` with a link to the tracking issue

**2.3 — Dynamic agent count**

File: `v3/@claude-flow/cli/src/commands/swarm.ts` (line ~645)

Replace hardcoded 8-agent count with dynamic fetch from swarm state.

### Phase 3: Memory & AgentDB (P1–P2) — #1428, #1399

**3.1 — Fix memory init hang**

File: `v3/@claude-flow/cli/src/commands/memory.ts` (init handler)

1. Call `ort.env.close()` or terminate ONNX inference sessions after init
2. Close SQLite connection explicitly
3. Add `process.exit(0)` as final fallback after cleanup
4. Fix double ONNX model loading (model initialized twice in one init call)

**3.2 — Fix AgentDB bridge**

1. Update `@claude-flow/cli` dependency on `@claude-flow/memory` to `>=3.0.0-alpha.12`
2. Fix `agentdb-runtime-patch.js` path: `dist/controllers/index.js` → `dist/src/controllers/index.js`
3. Fix CJS wrapper self-reference: `require('./controllers/index.js')` → `require('./index.js')`

**3.3 — Fix memory store/search**

1. Remove text ID generation — use SQLite integer autoincrement
2. Change hardcoded vector dimension 1536 → 384 (match `all-MiniLM-L6-v2` output), or detect at runtime

### Phase 4: MCP & Tool Routing (P2) — #1404, #1422

**4.1 — Add missing `items` to array schemas**

Files: `ruvllm-tools.ts`, `process-manager-tools.ts`, and all other MCP tool definitions.

Audit all `type: 'array'` properties and add appropriate `items` schema. This is partially addressed in PR #73 (ruflo repo).

**4.2 — Enforce Ruflo MCP tool preference in hive-mind**

Options:
- **A**: Add `--allowedTools` constraint when spawning hive-mind sessions to prefer Ruflo MCP tools
- **B**: Add system prompt injection that instructs Claude to use Ruflo MCP tools for orchestration
- **C**: Document expected behavior and provide configuration guidance

### Phase 5: Code Quality (from #1425 audit)

**5.1 — config.yaml support**

Daemon currently reads only `config.json`. Add YAML fallback or emit warning when `config.yaml` exists without `config.json`.

**5.2 — Parser flag collision**

`-f` flag used by 50+ subcommands. Audit `parser.ts` for resolution order issues. Consider namespacing or removing the global `-f` shorthand.

## Consequences

### Positive
- Headless workers become functional (currently 0% success rate → expected >95%)
- Daemon process accumulation eliminated (prevents kernel panic scenario)
- Memory init completes cleanly without hang
- AgentDB bridge becomes available for pattern search/hierarchical recall
- MCP tools work with strict schema validators (VSCode Copilot)
- Swarm execution moves from stub to functional (long-term, Phase 2 is largest effort)

### Negative
- Phase 2 (swarm execution) is a significant implementation effort; may require multiple PRs
- Model alias change could affect users who depend on specific dated model snapshots
- Breaking change if removing text IDs from memory store (existing data migration needed)

### Risks
- Phase 2 scope may expand — the #1425 audit identified additional stubs in `deployment.ts`, `config` commands, and `providers` commands
- AgentDB bridge fix depends on publishing new package versions to npm

## Implementation Order

```
Phase 1.1 (stdin fix)          ← trivial, unblocks all workers
Phase 1.3 (model IDs)          ← trivial, unblocks daemon success
Phase 1.4 (PID singleton)      ← low effort, prevents accumulation
Phase 1.5 (orphan cleanup)     ← low effort
Phase 3.1 (memory init hang)   ← medium effort
Phase 4.1 (MCP schema)         ← low effort, partially done in PR #73
Phase 1.2 (nested session)     ← medium effort, design decision needed
Phase 3.2 (AgentDB bridge)     ← medium effort, requires npm publish
Phase 3.3 (memory ID/dims)     ← medium effort
Phase 4.2 (tool preference)    ← medium effort, design decision needed
Phase 2.x (swarm execution)    ← high effort, core architecture work
Phase 5.x (code quality)       ← ongoing
```

## Verification

Each phase must pass:
1. Unit tests for changed code paths
2. Integration test: `npx ruflo daemon start` → workers execute successfully
3. Integration test: `npx ruflo memory init` → process exits cleanly
4. Integration test: `agentdb_health` returns `available: true`
5. Schema validation: all MCP tools pass strict JSON Schema validation
6. Stress test: 8 projects with daemons running — no process accumulation after 1 hour

## References

- #1395 — Workers fail + daemons don't terminate (scottkmcmillan)
- #1423 — Swarm agents don't execute (tim-bly)
- #1425 — Comprehensive audit (AvasDream)
- #1428 — Memory init hangs (marioja)
- #1431 — Stale model IDs (roman-rr)
- #1399 — AgentDB bridge unavailable (BIWizzard)
- #1404 — MCP schema validation (orelcain)
- #1422 — Hive-mind tool routing (tim-bly)
- ADR-066 — Prior audit remediation (v3.5.24)
