---
id: ADR-0001
title: ruflo-rag-memory plugin contract — pinning, claude-memories reserved-namespace consumer, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, rag-memory, hnsw, claude-memories, namespace, smoke-test]
---

## Context

`ruflo-rag-memory` (v0.2.0) — simple memory + HNSW semantic retrieval. 1 agent (`memory-specialist`), 2 skills (`memory-bridge`, `memory-search`), 2 commands (`/recall`, `/ruflo-memory`).

This plugin is **the canonical consumer of the `claude-memories` reserved namespace** (per [ruflo-agentdb ADR-0001](../../ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md) §"Namespace convention"). Claude Code's `SessionStart` hook auto-imports `~/.claude/projects/*/memory/*.md` into AgentDB via `memory_import_claude` → `claude-memories`. This plugin's `memory-bridge` skill exposes that bridge to users.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6); Namespace coordination block — explicit consumer-of-claude-memories; Verification + Architecture Decisions sections.
3. Plugin metadata stays at `0.2.0` (already at the cadence). Keywords add `mcp`, `claude-memories`, `bridged-memory`.
4. `scripts/smoke.sh` — 10 structural checks: version + keywords; both skills + agent + 2 commands with valid frontmatter; v3.6 pin; namespace coordination cross-reference; `claude-memories` reserved-namespace consumer documented; `memory_import_claude` + `memory_search_unified` referenced; ADR Proposed; no wildcard tools.

## Consequences

**Positive:** plugin joins the cadence. The "consumer of claude-memories" relationship is now contractually documented.

**Negative:** none material.

## Verification

```bash
bash plugins/ruflo-rag-memory/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — owns the `claude-memories` reserved namespace and the auto-import bridge
- `plugins/ruflo-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md` — sibling substrate plugin

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/ruflo-rag-memory/`. Contract elements implemented: canonical consumer of `claude-memories` reserved namespace documented; `memory_import_claude` + `memory_bridge_status` + `memory_search_unified` MCP tools covered; auto-import via SessionStart hook cross-referenced; smoke-as-contract gate defined in `scripts/smoke.sh`.
