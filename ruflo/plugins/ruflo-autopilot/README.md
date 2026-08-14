# ruflo-autopilot

Autonomous /loop-driven task completion with learning and prediction.

Combines Ruflo's 10 autopilot MCP tools with Claude Code's native `/loop` + `ScheduleWakeup` for persistent, cache-aware task completion loops.

## Install

```
/plugin marketplace add ruvnet/ruflo
/plugin install ruflo-autopilot@ruflo
```

## Features

- **Autonomous loops**: Enable autopilot, then `/loop` drives iterative task completion
- **Progress tracking**: Monitors team-tasks, swarm-tasks, and file checklists
- **Learning**: Discovers success patterns from completed tasks via AgentDB
- **Prediction**: Predicts optimal next action based on state and learned patterns
- **Cache-aware**: ScheduleWakeup at 270s keeps prompt cache warm between iterations

## Commands

- `/autopilot` -- Enable, configure, or disable autopilot
- `/autopilot-status` -- Quick progress summary

## Skills

- `autopilot-loop` -- How to run an autopilot /loop iteration
- `autopilot-predict` -- Use learned patterns to pick the next task

## MCP surface (10 tools)

| Tool | Purpose |
|------|---------|
| `autopilot_status` | Current autopilot state + learning stats |
| `autopilot_enable` | Turn autopilot on for the project |
| `autopilot_disable` | Turn autopilot off |
| `autopilot_config` | Read/update configuration |
| `autopilot_reset` | Clear learned patterns and progress (testing) |
| `autopilot_log` | Append a structured log entry |
| `autopilot_progress` | Progress summary across team/swarm/file checklists |
| `autopilot_learn` | Train on a completed task; writes to `autopilot-patterns` |
| `autopilot_history` | Browse past iterations |
| `autopilot_predict` | Predict the optimal next action from learned patterns |

All 10 are wired in `v3/@claude-flow/cli/src/mcp-tools/autopilot-tools.ts`.

## Compatibility

- **CLI:** pinned to `@claude-flow/cli` v3.6 major+minor.
- **MCP surface:** the 10 tools above.
- **Verification:** `bash plugins/ruflo-autopilot/scripts/smoke.sh` is the contract.

## Cache-aware /loop integration

Autopilot pairs with Claude Code's native `/loop` + `ScheduleWakeup` skills. The recommended fallback heartbeat is **270 seconds** — under the 5-minute prompt-cache TTL so the next wake-up reads conversation context cached. Going past 300s pays a cache-miss; rounding to 5 minutes is the worst-of-both case.

For event-driven loops, arm a `Monitor` and let the 270s wake be the safety net.

## Namespace coordination

This plugin owns the `autopilot-patterns` AgentDB namespace (kebab-case, follows the convention from [ruflo-agentdb ADR-0001 §"Namespace convention"](../ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md)). Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.

`autopilot_learn` writes to this namespace via `agentdb_pattern-store` semantics — see [ruflo-intelligence ADR-0001](../ruflo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md) for the 4-step pipeline this feeds (RETRIEVE → JUDGE → DISTILL → CONSOLIDATE).

## Verification

```bash
bash plugins/ruflo-autopilot/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — ruflo-autopilot plugin contract](./docs/adrs/0001-autopilot-contract.md)
