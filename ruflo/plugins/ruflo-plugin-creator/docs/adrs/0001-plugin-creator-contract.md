---
id: ADR-0001
title: ruflo-plugin-creator plugin contract — pinning, scaffold-the-canonical-contract, MCP-drift warnings, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, plugin-creator, scaffolding, namespace, smoke-test]
---

## Context

`ruflo-plugin-creator` (v0.1.0) — meta-plugin that scaffolds new Claude Code plugins. 1 agent + 2 skills + 1 command.

This plugin is uniquely positioned: every new plugin scaffolded by it inherits whatever contract the scaffolder produces. ADR-0001 must therefore do two things:

1. **Adopt the same plugin contract** every other plugin in this session adopted (pinning, namespace coordination, smoke as contract, sibling-ADR cross-references).
2. **Update the scaffolding output** so newly-created plugins are born with the contract — not retrofitted later.

### Drift fixed

The `create-plugin` skill mentioned "19 AgentDB controllers" — a stale count that [ruflo-agentdb ADR-0001 §"Today's `ruflo-agentdb`"](../../../ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md) declared mythical (real: 15 `agentdb_*` MCP tools, 29 `ControllerName` entries). Fixed in this pass.

## Decision

### 1. Adopt the contract for this plugin

- Add this ADR (Proposed).
- README augment: Compatibility (pin v3.6); Namespace coordination (no AgentDB writes — pure scaffolding plugin); Verification + Architecture Decisions sections.
- Bump `0.1.0 → 0.2.0`. Keywords add `mcp`, `scaffolding`, `contract-bootstrap`.
- `scripts/smoke.sh` — 10 structural checks.

### 2. Update the scaffolding output

The `create-plugin` skill is updated to scaffold:

- `docs/adrs/0001-<name>-contract.md` (Proposed)
- `scripts/smoke.sh` (8+ structural checks)
- README sections: Compatibility, Namespace coordination, Verification, Architecture Decisions
- A "MCP-tool drift to avoid" section warning new authors about the four real bugs the loop has been fixing across the family:
  - `embeddings_embed` does not exist — use `embeddings_generate`
  - `agentdb_hierarchical-*` ignores `namespace` arg (routes by tier) — use `memory_*` for namespaced reads/writes
  - `agentdb_pattern-*` ignores `namespace` arg (routes through ReasoningBank)
  - `pattern` (singular) ≠ `patterns` (plural) — different reserved namespaces

### 3. Smoke contract

10 checks:

1. plugin.json declares `0.2.0` with new keywords.
2. Both skills + agent + command present with valid frontmatter.
3. `create-plugin` skill scaffolds ADR, smoke, README contract sections.
4. `create-plugin` skill includes the MCP-tool drift warnings.
5. `create-plugin` skill no longer claims "19 AgentDB controllers" (regression check).
6. README pins to `@claude-flow/cli` v3.6.
7. README has Architecture Decisions section.
8. ADR-0001 exists with status `Proposed`.
9. `validate-plugin` skill present.
10. No skill grants wildcard tool access.

## Consequences

**Positive:**
- Future scaffolds inherit the canonical contract automatically. The retrofit work the loop is doing right now becomes unnecessary for new plugins.
- The four MCP-tool drift bugs we keep finding are now warnings in the scaffolder.
- Plugin joins the cadence.

**Negative:**
- Existing scaffolds are not updated by this ADR — they get retrofitted via the loop's per-plugin pass (already mostly complete).

## Verification

```bash
bash plugins/ruflo-plugin-creator/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention + "19 controllers" myth fix
- `plugins/ruflo-cost-tracker/docs/adrs/0001-cost-tracker-contract.md` — namespace-routing bug class
- `plugins/ruflo-knowledge-graph/docs/adrs/0001-knowledge-graph-contract.md` — `embeddings_embed` rename
- `plugins/ruflo-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md` — pinning + smoke-as-contract precedent

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/ruflo-plugin-creator/`. Contract elements implemented: scaffolding templates updated to include contract ADR, smoke test, Compatibility section, and namespace coordination block by default; MCP-drift warnings added to scaffolded skill templates; smoke-as-contract gate defined in `scripts/smoke.sh`.
