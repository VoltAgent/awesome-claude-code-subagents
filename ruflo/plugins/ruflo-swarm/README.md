# ruflo-swarm

Agent teams, swarm coordination, Monitor streams, and worktree isolation.

## Install

```
/plugin marketplace add ruvnet/ruflo
/plugin install ruflo-swarm@ruflo
```

## What's Included

- **Agent Teams**: TeamCreate, SendMessage, and Task tool integration for multi-agent coordination
- **Topologies**: hierarchical, mesh, hierarchical-mesh, ring, star, adaptive
- **Monitor Streams**: Real-time swarm status via `Monitor("npx @claude-flow/cli@latest swarm watch --stream")`
- **Worktree Isolation**: Each agent works in its own git worktree to avoid conflicts
- **Hive-Mind Consensus**: Byzantine, Raft, Gossip, CRDT, and Quorum strategies
- **Anti-Drift**: hierarchical topology with specialized strategy for tight coordination

## Requires

- `ruflo-core` plugin (provides MCP server)

## Compatibility

- **CLI:** pinned to `@claude-flow/cli` v3.6 major+minor.
- **Verification:** `bash plugins/ruflo-swarm/scripts/smoke.sh` is the contract.

## MCP surface (12 tools)

| Family | Count | Tools |
|--------|------:|-------|
| `swarm_*` | 4 | `swarm_init`, `swarm_status`, `swarm_shutdown`, `swarm_health` |
| `agent_*` | 8 | `agent_spawn`, `agent_execute`, `agent_terminate`, `agent_status`, `agent_list`, `agent_pool`, `agent_health`, `agent_update` |

Sources: `v3/@claude-flow/cli/src/mcp-tools/swarm-tools.ts:71, 145, 208, 270` and `agent-tools.ts:182, 287, 319, 356, 395, 451, 573, 651`.

## Built-in Claude Code coordination tools

This plugin pairs with Claude Code's native multi-agent tools (no MCP needed):

| Tool | Purpose |
|------|---------|
| `Task` | Spawn a sub-agent (use `name:` for addressability + `run_in_background: true` for parallel execution) |
| `SendMessage` | Inter-agent comms (named agents only) |
| `TaskCreate / TaskList / TaskGet / TaskUpdate / TaskOutput / TaskStop` | Shared task tracker for swarm pipelines |
| `Monitor` | Live-stream events from a long-running process (`persistent: true`) — primary wake signal for /loop |
| `EnterWorktree / ExitWorktree` | Git worktree isolation per agent |

## Anti-drift defaults (per CLAUDE.md)

For coding swarms, the canonical defaults that prevent agent drift:

| Setting | Value | Rationale |
|---------|-------|-----------|
| `topology` | `hierarchical` | Coordinator catches divergence |
| `maxAgents` | 6–8 | Smaller team = less drift |
| `strategy` | `specialized` | Clear roles, no overlap |
| `consensus` | `raft` | Leader maintains authoritative state |
| `memory` | `hybrid` | SQLite + AgentDB for both fast + durable |

For 10+ agent teams, use `hierarchical-mesh` (queen + peer communication).

## Namespace coordination

This plugin owns the `swarm-state` AgentDB namespace (kebab-case, follows the convention from [ruflo-agentdb ADR-0001 §"Namespace convention"](../ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md)). Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.

`swarm-state` indexes active swarms, agent assignments, and topology snapshots. Accessed via `memory_*` (namespace-routed).

## Verification

```bash
bash plugins/ruflo-swarm/scripts/smoke.sh
# Expected: "11 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — ruflo-swarm plugin contract (12-tool MCP surface, anti-drift defaults, Monitor streaming, smoke as contract)](./docs/adrs/0001-swarm-contract.md)

## Related Plugins

- `ruflo-agentdb` — namespace convention owner
- `ruflo-autopilot` — owns the 270s cache-aware /loop heartbeat for long-running swarms
- `ruflo-intelligence` — `hooks_route` powers swarm agent recommendation per task
