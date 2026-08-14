---
id: ADR-0001
title: ruflo-workflows plugin contract — pinning, namespace coordination, 10-tool MCP surface, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, workflows, automation, orchestration, namespace, smoke-test]
---

## Context

`ruflo-workflows` (v0.1.0) — workflow automation with templates, orchestration, and lifecycle management. 1 agent (`workflow-specialist`), 2 skills (`workflow-create`, `workflow-run`), 1 command (`/workflow`).

Wraps **10 `workflow_*` MCP tools** at `v3/@claude-flow/cli/src/mcp-tools/workflow-tools.ts:84, 196, 264, 450, 511, 558, 597, 648, 701, 739`:

| Tool | Purpose |
|------|---------|
| `workflow_create` | Create a new workflow definition |
| `workflow_run` | Run a workflow with inputs |
| `workflow_execute` | Execute a one-shot workflow without persistence |
| `workflow_status` | Inspect a running workflow |
| `workflow_list` | List workflows |
| `workflow_pause` | Pause a running workflow |
| `workflow_resume` | Resume a paused workflow |
| `workflow_cancel` | Cancel a workflow |
| `workflow_delete` | Delete a workflow definition |
| `workflow_template` | Manage workflow templates |

This plugin is the canonical wrapper for the workflow-* MCP family.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6); 10-tool MCP surface table; lifecycle state machine (created → running ↔ paused → completed/cancelled); Namespace coordination (claims `workflows-state`); Verification + Architecture Decisions sections.
3. Bump `0.1.0 → 0.2.0`. Keywords add `mcp`, `workflow-templates`, `pause-resume`, `lifecycle`.
4. `scripts/smoke.sh` — 11 structural checks: version + keywords; both skills + agent + command with valid frontmatter; all 10 `workflow_*` tools referenced; lifecycle state machine documented; v3.6 pin; namespace coordination; ADR Proposed; no wildcard tools.

## Consequences

**Positive:** plugin joins the cadence. The 10-tool surface + lifecycle state machine are now contractually documented. **This ADR completes the plugin-contract retrofit across the entire ruflo plugin family** — all 33 plugins now have ADR-0001 + smoke + namespace coordination.

**Negative:** none material.

## Verification

```bash
bash plugins/ruflo-workflows/scripts/smoke.sh
# Expected: "11 passed, 0 failed"
```

## Related

- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention
- `plugins/ruflo-loop-workers/docs/adrs/0001-loop-workers-contract.md` — sibling automation surface (loops vs workflows)
- `plugins/ruflo-sparc/docs/adrs/0001-sparc-contract.md` — SPARC orchestration uses workflows for phase transitions
- `v3/@claude-flow/cli/src/mcp-tools/workflow-tools.ts` — 10 `workflow_*` tools

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/ruflo-workflows/`. Contract elements implemented: all 10 `workflow_*` MCP tools covered; SPARC phase-transition orchestration cross-linked; namespace `workflows-state` claimed; smoke-as-contract gate defined in `scripts/smoke.sh` (11 checks).
