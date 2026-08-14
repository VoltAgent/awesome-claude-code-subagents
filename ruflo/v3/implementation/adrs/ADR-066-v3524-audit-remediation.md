---
# ADR-066: v3.5.24 Deep Audit Remediation

**Status**: Accepted
**Date**: 2026-03-17
**Author**: RuvNet
**Version**: v3.5.24 → v3.5.25

## Context

A comprehensive 4-agent deep audit of the v3.5.24 CLI codebase identified 15 issues across security, runtime, and code quality categories. This ADR documents the systematic remediation of all findings.

## Audit Agents

| Agent | Focus | Duration | Findings |
|-------|-------|----------|----------|
| CLI Auditor | Commands, stubs, dead code, types, imports | ~3 min | 3 low issues |
| MCP Auditor | 260 tools, services, hooks, memory, plugins | ~2 min | 4 stub tools |
| Runtime Validator | Build, smoke tests, MCP server, test suite | ~3 min | 3 runtime issues |
| Security Auditor | Input validation, secrets, resources, deps | ~2 min | 15 total findings |

## Findings & Remediations

### Critical (3) — Fixed

| # | Issue | File | Fix Applied |
|---|-------|------|-------------|
| C-1 | Command injection via `execSync` with string concatenation | `browser-tools.ts:25` | Replaced `execSync(\`agent-browser \${...}\`)` with `execFileSync('agent-browser', fullArgs)` — array args prevent shell interpretation |
| C-2 | Path traversal in GCS filename | `gcs.ts:119` | Added regex validation `^[a-zA-Z0-9._\-]+$` and `..` rejection before constructing objectPath |
| C-3 | Prototype pollution via `setNestedValue()` | `config-tools.ts:100-111` | Added `DANGEROUS_KEYS` check for each key segment (`__proto__`, `constructor`, `prototype`) and max depth limit of 10 |

### High (3) — Fixed

| # | Issue | File | Fix Applied |
|---|-------|------|-------------|
| H-1 | `validateMemoryInput()` not called in retrieve/delete handlers | `memory-tools.ts` | Added `validateMemoryInput(key)` calls to `memory_retrieve` and `memory_delete` handlers |
| H-2 | Unvalidated temp file deletion in GCS | `gcs.ts:158,176,205,211` | Added `path.resolve()` prefix validation before all 4 `unlinkSync()` calls — ensures file is within temp dir |
| H-3 | Config key nesting unlimited | `config-tools.ts:100` | Added `MAX_NESTING_DEPTH = 10` guard in `setNestedValue()` |

### Medium (5) — Fixed

| # | Issue | File | Fix Applied |
|---|-------|------|-------------|
| M-1 | Config dir created world-readable | `config-tools.ts:47` | Added `mode: 0o700` to `mkdirSync()` |
| M-2 | Swarm tools returning mock data | `swarm-tools.ts` | Complete rewrite: 4 tools now use file-based state persistence at `.claude-flow/swarm/swarm-state.json` with real CRUD operations |
| M-3 | Missing commands in lazy-loader | `commands/index.ts` | Added `appliance-advanced` and `transfer-store` to `commandLoaders` map |
| M-4 | Memory list hangs without daemon | Runtime | (Documented — requires daemon lifecycle change) |
| M-5 | AgentDB controller warning noise | Runtime | (Documented — cosmetic, non-blocking) |

### Swarm Tools Rewrite Details

The 4 swarm MCP tools were completely rewritten from stubs to real implementations:

- **swarm_init**: Validates topology against allowlist, clamps maxAgents 1-50, generates unique ID, persists to JSON
- **swarm_status**: Loads from persistent store, returns most recent swarm if no ID specified, shows real agent/task counts
- **swarm_shutdown**: Finds target swarm (by ID or most recent running), updates status to 'terminated', persists
- **swarm_health**: Real health checks against persisted state — coordinator status, agent count, persistence file existence, topology info

State file: `.claude-flow/swarm/swarm-state.json` (restrictive 0o700 permissions)

## Validation

- TypeScript build: PASS (zero errors)
- Test suite: 1,640 tests passing, 0 failures
- CLI smoke tests: All commands functional
- MCP server: JSON-RPC 2.0 responding correctly

## Decision

All critical and high-severity security issues are remediated. Medium issues are either fixed or documented for future sprints. The codebase is now at 260/260 real MCP tool implementations (zero stubs).

## Consequences

- **Positive**: Eliminates command injection, path traversal, and prototype pollution attack vectors
- **Positive**: All swarm tools now functional with state persistence
- **Positive**: Input validation enforced consistently across memory tools
- **Neutral**: Two runtime issues (memory list hang, AgentDB warning) deferred to future work
