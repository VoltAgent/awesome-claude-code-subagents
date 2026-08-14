---
name: cost-compact-context
description: Wrap getTokenOptimizer().getCompactContext() to retrieve compacted ReasoningBank context for cost-analysis queries; report bridge-reported tokensSaved
argument-hint: "<query>"
allowed-tools: Bash
---

# Cost Compact Context

Wraps `getTokenOptimizer().getCompactContext()` from `@claude-flow/integration` for cost-analysis queries. The bridge dynamically imports `agentic-flow` with graceful fallback: when the package isn't installed, `tokensSaved` is `0` and the skill exits cleanly. No MCP tool wraps `getTokenOptimizer` today (ADR-0002 §"Riskiest assumption"); we shell a Node one-liner instead.

## Steps

1. **Take the query** — the single argument.
2. **Invoke** — run from anywhere under `v3/` so `@claude-flow/integration` resolves:

   ```bash
   ( cd v3 && node ../plugins/ruflo-cost-tracker/scripts/compact.mjs "<QUERY>" )
   ```

   The script imports `@claude-flow/integration/token-optimizer` (canonical export — **not** `dist/token-optimizer.js`, which would double the `.js` extension via Node's `./*` exports rule), calls `getCompactContext(query)`, and prints a markdown summary plus a JSON line via `COMPACT_QUIET=1`.

3. **Report** — markdown table with: memories retrieved, tokens saved (bridge-reported), agentic-flow availability, cache hit rate. The script also emits a "bridge-reported, not measured against a no-RAG baseline" disclaimer. On bridge-unavailable: prints "agentic-flow not installed — bridge returns inert results." and exits cleanly.

## Caveats — claimed upstream, not yet verified

CLAUDE.md root claims `ReasoningBank retrieval: -32%` tokens. The bridge's `tokensSaved` is `query_tokens − compact_prompt_tokens` (token-optimizer.ts:141–143) — a heuristic, **not** a baseline-measured saving. token-optimizer.ts:9–10 itself says: *"No fabricated metrics are reported — all stats reflect real measurements"*. This skill carries that disclaimer forward.

Booster-specific availability is **not** exposed as a getter — observable only through `optimizedEdit()` returning `method: 'agent-booster'`. The canonical Tier 1 signal is `[AGENT_BOOSTER_AVAILABLE]` (see `cost-booster-route`).

## Fallback

`agentic-flow` not installed → `getCompactContext` returns `{tokensSaved: 0, memories: []}` (line 116–124), `optimizedEdit` returns `{method: 'traditional'}`, `getOptimalConfig` falls back to anti-drift defaults. Skill exits cleanly with the "not available" message.

## Cross-references

ADR-0002 Decision #2 + §"Riskiest assumption" · `token-optimizer.ts:308` (singleton export) · `docs/benchmarks/0002-baseline.md` (verification findings).
