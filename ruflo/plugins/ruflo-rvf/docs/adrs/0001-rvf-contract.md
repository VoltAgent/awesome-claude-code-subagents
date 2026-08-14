---
id: ADR-0001
title: ruflo-rvf plugin contract — pinning, namespace coordination, RVF cross-references (browser sessions, ruvector containers), smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, rvf, session-persistence, portable-memory, namespace, smoke-test]
---

## Context

`ruflo-rvf` (v0.2.0) — RVF format for portable agent memory + session persistence + cross-platform transfer. 1 agent + 2 skills (`rvf-manage`, `session-persist`) + 1 command.

RVF (RuVector Format) cognitive containers are referenced in two sibling ADRs as the substrate for portable session/memory state:

- [ruflo-browser ADR-0001](../../ruflo-browser/docs/adrs/0001-browser-skills-architecture.md) — every browser session is allocated as an RVF container at session-start (manifest, trajectory, screenshots, snapshots, cookies, findings)
- [ruflo-ruvector ADR-0001](../../ruflo-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md) — `ruvector rvf create|ingest|query|status|segments|derive|compact|export|examples|download` (10 RVF subcommands)

This plugin is the **canonical owner of the portable-memory + session-persistence slice** of the RVF surface. browser uses it for sessions; ruvector exposes the lower-level RVF tooling.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6); Cross-plugin RVF ownership table — browser sessions consume RVF, ruvector exposes the tooling, this plugin owns portable-memory + session-persistence; Namespace coordination (claims `rvf-sessions`); Verification + Architecture Decisions sections.
3. Plugin metadata stays at `0.2.0` (already at the cadence). Keywords add `mcp`, `cognitive-containers`, `lineage-tracking`.
4. `scripts/smoke.sh` — 10 structural checks: version + keywords; both skills + agent + command with valid frontmatter; v3.6 pin; namespace coordination; RVF cross-references (ruflo-browser sessions + ruflo-ruvector RVF tooling); ADR Proposed; no wildcard tools.

## Consequences

**Positive:** plugin joins the cadence. The cross-plugin RVF-ownership story is now contractually documented.

**Negative:** none material.

## Verification

```bash
bash plugins/ruflo-rvf/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/ruflo-browser/docs/adrs/0001-browser-skills-architecture.md` — browser sessions as RVF containers
- `plugins/ruflo-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md` — RVF tooling (`ruvector rvf *`)
- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/ruflo-rvf/`. Contract elements implemented: canonical portable-memory + session-persistence slice documented; RVF container lifecycle (browser sessions + ruvector containers) cross-referenced; namespace `rvf-sessions` claimed; smoke-as-contract gate defined in `scripts/smoke.sh`.
