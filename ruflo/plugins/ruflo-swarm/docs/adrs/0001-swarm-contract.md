---
id: ADR-0001
title: ruflo-swarm plugin contract — pinning, namespace coordination, MCP surface (4 swarm_* + 8 agent_*), Monitor streaming, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, swarm, agents, monitor, namespace, smoke-test]
---

## Context

`ruflo-swarm` (v0.1.0) — multi-agent swarm coordination, Monitor streams, worktree isolation. 2 agents (`coordinator`, `architect`), 2 skills (`swarm-init`, `monitor-stream`), 2 commands (`/swarm`, `/watch`).

Wraps **12 MCP tools** across two families:

| Family | Count | Source |
|--------|-------|--------|
| `swarm_*` | 4 (`init`, `status`, `shutdown`, `health`) | `v3/@claude-flow/cli/src/mcp-tools/swarm-tools.ts:71, 145, 208, 270` |
| `agent_*` | 8 (`spawn`, `execute`, `terminate`, `status`, `list`, `pool`, `health`, `update`) | `v3/@claude-flow/cli/src/mcp-tools/agent-tools.ts:182, 287, 319, 356, 395, 451, 573, 651` |

Plus the Monitor + Task tools from Claude Code (built-in: `Task`, `TaskList`, `TaskGet`, `TaskUpdate`, `Monitor`, etc.) which pair with this plugin for live streaming.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6); 12-tool MCP surface table; Monitor/Task built-in cross-reference; Anti-drift guidance (hierarchical topology, max 8 agents per CLAUDE.md); Namespace coordination (claims `swarm-state`); Verification + Architecture Decisions sections.
3. Bump `0.1.0 → 0.2.0`. Keywords add `mcp`, `topologies`, `worktree-isolation`, `monitor-stream`.
4. `scripts/smoke.sh` — 11 structural checks: version + keywords; both skills + 2 agents + 2 commands; all 4 `swarm_*` tools referenced; all 8 `agent_*` tools referenced; v3.6 pin; namespace coordination; anti-drift defaults documented (hierarchical/specialized/raft); Monitor/Task built-in cross-reference; ADR Proposed; no wildcard tools.

## Consequences

**Positive:** plugin joins the cadence. The 12-tool surface is now contractually documented. Anti-drift defaults from CLAUDE.md are smoke-checked.

**Negative:** none material.

## Verification

```bash
bash plugins/ruflo-swarm/scripts/smoke.sh
# Expected: "11 passed, 0 failed"
```

## Related

- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention
- `plugins/ruflo-autopilot/docs/adrs/0001-autopilot-contract.md` — 270s cache-aware /loop heartbeat for swarm coordination
- `plugins/ruflo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md` — `hooks_route` powers swarm agent recommendation
- `v3/@claude-flow/cli/src/mcp-tools/swarm-tools.ts` — 4 `swarm_*` tools
- `v3/@claude-flow/cli/src/mcp-tools/agent-tools.ts` — 8 `agent_*` tools

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/ruflo-swarm/`. Contract elements implemented: all 4 `swarm_*` + 8 `agent_*` MCP tools (12 total) covered; Monitor streaming (`/watch`) skill shipped; namespace `swarm-state` claimed; smoke-as-contract gate defined in `scripts/smoke.sh` (11 checks).
