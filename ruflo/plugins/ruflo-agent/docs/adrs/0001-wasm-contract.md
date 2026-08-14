---
id: ADR-0001
title: ruflo-agent plugin contract — pinning, namespace coordination, ADR-070 integration cross-reference, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, wasm, sandbox, gallery, namespace, smoke-test]
---

## Context

`ruflo-agent` (v0.1.0) — sandboxed WASM agent creation, execution, and gallery sharing. 1 agent (`wasm-specialist`), 2 skills (`wasm-agent`, `wasm-gallery`), 1 command (`/wasm`).

Wraps **10 `wasm_*` MCP tools** at `v3/@claude-flow/cli/src/mcp-tools/wasm-agent-tools.ts:18, 51, 74, 103, 117, 138, 160, 181, 195, 216`:

| Tool | Purpose |
|------|---------|
| `wasm_agent_create` | Spin up a sandboxed WASM agent |
| `wasm_agent_prompt` | Send a prompt to the agent |
| `wasm_agent_tool` | Invoke a tool inside the sandbox |
| `wasm_agent_list` | List active WASM agents |
| `wasm_agent_terminate` | Stop a WASM agent |
| `wasm_agent_files` | Read/write files in the sandbox |
| `wasm_agent_export` | Export agent state |
| `wasm_gallery_list` | Browse community-published WASM agents |
| `wasm_gallery_search` | Search the gallery |
| `wasm_gallery_create` | Publish a WASM agent to the gallery |

### Upstream ADR-070 cross-reference

[ADR-070 (Implemented)](../../../v3/implementation/adrs/ADR-070-rvagent-wasm-completion.md) closed the gap on `@ruvector/rvagent-wasm` + `@ruvector/ruvllm-wasm` integration. Per ADR-070, both packages are now declared in `package.json` `optionalDependencies` so `npm install` fetches them. Without ADR-070's fix, the runtime would always hit the graceful-degradation path and these MCP tools would no-op.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6 + ADR-070 implementation status); 10-tool MCP surface table; Namespace coordination (claims `wasm-gallery`); Verification + Architecture Decisions sections.
3. Bump `0.1.0 → 0.2.0`. Keywords add `mcp`, `rvagent-wasm`, `ruvllm-wasm`.
4. `scripts/smoke.sh` — 11 structural checks: version + keywords; both skills + agent + command with valid frontmatter; all 10 `wasm_*` tools referenced; v3.6 pin; namespace coordination; ADR-070 cross-reference; sandbox isolation documented; ADR Proposed; no wildcard tools.

## Consequences

**Positive:** plugin joins the cadence. The ADR-070 integration dependency is now contractually documented — readers know that `@ruvector/rvagent-wasm` + `@ruvector/ruvllm-wasm` must be installed (via npm install since ADR-070) for these tools to be functional.

**Negative:** none material.

## Verification

```bash
bash plugins/ruflo-agent/scripts/smoke.sh
# Expected: "11 passed, 0 failed"
```

## Related

- `v3/implementation/adrs/ADR-070-rvagent-wasm-completion.md` — upstream integration completion (Implemented)
- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention
- `plugins/ruflo-aidefence/docs/adrs/0001-aidefence-contract.md` — 3-gate pattern (relevant for sandboxed prompt-injection defense)
- `v3/@claude-flow/cli/src/mcp-tools/wasm-agent-tools.ts` — 10 `wasm_*` tools

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/ruflo-agent/`. Contract elements implemented: all 10 `wasm_*` MCP tools covered; ADR-070 (rvagent WASM completion) cross-referenced; 3-gate pattern alignment with ruflo-aidefence documented for sandboxed prompt-injection defense; namespace `wasm-agents` claimed; smoke-as-contract gate defined in `scripts/smoke.sh` (11 checks).
