---
id: ADR-0001
title: ruflo-cost-tracker plugin contract — pinning, namespace-routing fix, federation budget integration, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, cost, tokens, budget, optimization, namespace, federation, smoke-test]
---

## Context

`ruflo-cost-tracker` (v0.2.1) tracks token usage per agent/task/model, computes USD cost attribution, and recommends optimizations. It already documents:

- Two AgentDB namespaces (`cost-tracking` for usage records, `cost-patterns` for optimization patterns)
- Federation budget circuit breaker pairing per ADR-097 (host-side `federation_send` caps: `maxHops`, `maxTokens`, `maxUsd`, `hopCount`, `spent.{tokens,usd}`)
- 5 cost subcommands (`report`, `breakdown`, `budget`, `optimize`, `history`)
- 2 skills + 1 agent + REFERENCE.md (token-optimized per ADR-098 Part 2)

### The drift this ADR fixes

The two skills (`cost-report`, `cost-optimize`) call `agentdb_hierarchical-recall` with a `namespace: 'cost-tracking'` argument and `agentdb_pattern-store` with `namespace: 'cost-patterns'`. Per [ruflo-agentdb ADR-0001 §"Where namespace strings actually apply"](../../../ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md), neither tool family routes by namespace:

- `agentdb_hierarchical-*` routes by **tier** (`working|episodic|semantic`). Namespace argument is silently ignored.
- `agentdb_pattern-*` routes through **ReasoningBank**. Namespace argument is silently ignored. Fallback writes to the reserved `pattern` namespace, not to `cost-patterns`.

The CLI examples in the agent file have always been correct (`memory store --namespace cost-tracking`). The skills' MCP-tool mapping was wrong. This ADR fixes them.

## Decision

### 1. Skill fixes (real bug, not just docs)

- `cost-report/SKILL.md` — replace `agentdb_hierarchical-recall` with `memory_search` / `memory_list` / `memory_retrieve` (namespace-routed). Update `allowed-tools` accordingly. Cross-link the namespace convention.
- `cost-optimize/SKILL.md` — replace the load step with `memory_search`. Document **two write paths** for optimization patterns:
  - `agentdb_pattern-store` (ReasoningBank-routed; no namespace arg; fallback lands in reserved `pattern` namespace)
  - `memory_store --namespace cost-patterns` (namespace-routable; lands where the agent file's CLI examples promise)

### 2. Add this ADR (Proposed)

`docs/adrs/0001-cost-tracker-contract.md`. Cross-links the eight sibling ADRs.

### 3. README augment

Append:
- **Compatibility** — pin to `@claude-flow/cli` v3.6.
- **Namespace coordination** — owns `cost-tracking` (memory-routed) + `cost-patterns` (memory-routed). Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.
- **Architecture Decisions** + **Verification** sections.
- The federation budget pairing block already in README stays as-is (already correctly references ADR-097).

### 4. Plugin metadata

Bump `0.2.1 → 0.2.2`. Patch bump justified: skill fixes are functional changes (the skills weren't doing what they claimed), but the public command surface is unchanged. Keywords add `namespace-routing`, `mcp`.

### 5. Smoke contract (`scripts/smoke.sh`)

10 checks:

1. plugin.json declares `0.2.2` with new keywords.
2. Both skills (`cost-report`, `cost-optimize`) present with valid frontmatter.
3. Skills use `memory_search` / `memory_store` for `cost-tracking` and `cost-patterns` namespaces (not `agentdb_hierarchical-*` / `agentdb_pattern-*` with a namespace arg).
4. `cost-optimize` documents both pattern-store paths (ReasoningBank vs namespace-routable).
5. README pins to `@claude-flow/cli` v3.6.
6. README references ruflo-agentdb namespace convention.
7. README's federation budget circuit breaker pairing block (ADR-097) is intact.
8. ADR-0001 exists with status `Proposed`.
9. REFERENCE.md exists and is non-empty (token-optimization pattern).
10. No skill grants wildcard tool access.

## Consequences

**Positive:**
- Skills now actually do what their docs promise. `cost-report` reads from `cost-tracking`; `cost-optimize` writes to `cost-patterns` (or to ReasoningBank explicitly).
- Future plugins reading the cost-tracker skills as a template won't replicate the namespace-routing bug.

**Negative:**
- One downstream change visible to anyone scripting against the old (broken) MCP tool calls. Mitigation: the agent file's CLI examples already used the correct pattern.

**Neutral:**
- No new MCP tools. No new skills. No new subcommands. Functional fix + documentation + smoke.

## Verification

```bash
bash plugins/ruflo-cost-tracker/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention; defines the routing contract this ADR fixes a violation of
- `plugins/ruflo-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md`
- `plugins/ruflo-browser/docs/adrs/0001-browser-skills-architecture.md`
- `plugins/ruflo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md`
- `plugins/ruflo-adr/docs/adrs/0001-adr-plugin-pattern.md`
- `plugins/ruflo-aidefence/docs/adrs/0001-aidefence-contract.md`
- `plugins/ruflo-autopilot/docs/adrs/0001-autopilot-contract.md`
- `plugins/ruflo-core/docs/adrs/0001-core-contract.md`
- `v3/docs/adr/ADR-097-federation-budget-circuit-breaker.md` — federation budget envelope

## Implementation status

Plugin version v0.16.1 shipped and listed in marketplace.json. Source exists at `plugins/ruflo-cost-tracker/`. Contract elements implemented: dual namespaces (`cost-tracking`, `cost-patterns`) with correct `memory_*` routing; ADR-097 budget circuit breaker Phase 1 (send-side enforcement) documented; namespace-routing bug fixed (switched from `agentdb_hierarchical-*` to `memory_*`); smoke-as-contract gate defined in `scripts/smoke.sh`.
