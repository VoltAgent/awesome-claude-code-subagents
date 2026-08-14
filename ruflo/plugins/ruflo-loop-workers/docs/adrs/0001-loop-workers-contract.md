---
id: ADR-0001
title: ruflo-loop-workers plugin contract — pinning, namespace coordination, 12-worker trigger contract, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, loop-workers, cron, schedule-wakeup, cache-aware, namespace, smoke-test]
---

## Context

`ruflo-loop-workers` (v0.1.0) — cache-aware `/loop` workers + `CronCreate` background automation. Wraps **5 `hooks_worker-*` MCP tools** at `v3/@claude-flow/cli/src/mcp-tools/hooks-tools.ts:3489, 3538, 3656, 3714, 3923` (`worker-list`, `worker-dispatch`, `worker-status`, `worker-detect`, `worker-cancel`) and exposes 12 background worker triggers per CLAUDE.md.

Surface: 1 agent (`loop-worker-coordinator`), 2 skills (`loop-worker`, `cron-schedule`), 2 commands (`/ruflo-loop`, `/ruflo-schedule`).

The 12 worker triggers (named in README): `ultralearn`, `optimize`, `consolidate`, `predict`, `audit`, `map`, `preload`, `deepdive`, `document`, `refactor`, `benchmark`, `testgaps`.

Standard contract gaps + a notable cross-link missing:

1. No plugin-level ADR.
2. No smoke test.
3. No Compatibility section.
4. **No cross-reference to ruflo-autopilot's 270s cache-aware /loop heartbeat** — `ruflo-autopilot` ADR-0001 owns that contract and this plugin is the substrate that runs it.
5. **No worker-trigger → consumer-plugin map** — e.g., `document` trigger is consumed by `ruflo-docs`, `audit` by `ruflo-security-audit`, `testgaps` by `ruflo-testgen`. Documenting the map closes the discovery loop.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6); Cache-aware /loop integration block (cross-references ruflo-autopilot ADR-0001's 270s heartbeat); 5-tool MCP surface table (`worker-list`, `worker-dispatch`, `worker-status`, `worker-detect`, `worker-cancel`); 12-worker trigger map with consumer-plugin attribution; Namespace coordination (claims `worker-history`); Verification + Architecture Decisions sections.
3. Bump `0.1.0 → 0.2.0`. Keywords add `mcp`, `background-workers`, `cache-aware`, `schedule-wakeup`.
4. `scripts/smoke.sh` — 12 structural checks: version + keywords; both skills + agent + 2 commands present with valid frontmatter; all 5 `hooks_worker-*` tools referenced; all 12 worker triggers documented; v3.6 pin; namespace coordination; 270s cache-aware note + ruflo-autopilot cross-reference; worker-trigger → consumer-plugin attribution table; ADR Proposed; no wildcard tools.

## Consequences

**Positive:**
- 12-worker trigger map becomes contractually documented. Consumer plugins (`ruflo-docs`, `ruflo-security-audit`, `ruflo-testgen`, etc.) can verify their trigger names against a single canonical source.
- 270s cache-aware /loop heartbeat is now anchored to ruflo-autopilot's contract.

**Negative:** none material.

## Verification

```bash
bash plugins/ruflo-loop-workers/scripts/smoke.sh
# Expected: "12 passed, 0 failed"
```

## Related

- `plugins/ruflo-autopilot/docs/adrs/0001-autopilot-contract.md` — 270s cache-aware /loop heartbeat owner
- `plugins/ruflo-docs/docs/adrs/0001-docs-contract.md` — consumer of `document` trigger
- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention
- `v3/@claude-flow/cli/src/mcp-tools/hooks-tools.ts` — 5 `hooks_worker-*` tools

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/ruflo-loop-workers/`. Contract elements implemented: all 12 worker triggers (`ultralearn`, `optimize`, `consolidate`, `predict`, `audit`, `map`, `preload`, `deepdive`, `document`, `refactor`, `benchmark`, `testgaps`) documented; 5 `hooks_worker-*` MCP tools covered; namespace `loop-workers-state` claimed; smoke-as-contract gate defined in `scripts/smoke.sh` (12 checks).
