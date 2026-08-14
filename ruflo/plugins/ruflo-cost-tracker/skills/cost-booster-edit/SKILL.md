---
name: cost-booster-edit
description: Apply a simple code transform via agent-booster's WASM engine — sub-millisecond, deterministic, $0 (no LLM call). Companion to cost-booster-route.
argument-hint: "<intent> <file>"
allowed-tools: Bash
---

# Cost Booster Edit

Direct wrapper around `agent-booster.apply()` (npm `agent-booster` v0.2.x, exposed via `agentic-flow/agent-booster`). Use when a transform is **already classified** as Tier 1 eligible — `cost-booster-route` recommends *whether*; this skill *executes*.

## When to use

- Bulk transforms across many files (`var → const`, `add-types`, `remove-console`, `add-error-handling`, `async-await`, `add-logging`).
- Any simple, structural edit where an LLM would otherwise be called and billed.
- Inside CI pipelines where determinism + zero-cost matter more than naturalness.

**Do NOT use when** the transform requires reasoning about intent, naming, or cross-file context — those are Tier 2/3 jobs.

## Steps

1. **Take inputs** — `intent` (one of the 6 booster intents) and `file` path.
2. **Read the source** to a variable, derive the intended `edit` text from the intent (caller supplies).
3. **Invoke** — run from anywhere under `v3/` so `agent-booster` resolves:

   ```bash
   node --input-type=module -e '
     import("agent-booster")
       .then(async ({ AgentBooster }) => {
         const booster = new AgentBooster();
         const r = await booster.apply({
           code: process.argv[1],
           edit: process.argv[2],
           language: process.argv[3] || "javascript",
         });
         console.log(JSON.stringify({
           success: r.success, output: r.output, latency: r.latency,
           confidence: r.confidence, strategy: r.strategy,
           tokens: r.tokens,
         }));
       })
       .catch(e => console.log(JSON.stringify({ success: false, error: String(e.message) })));
   ' -- "$CODE" "$EDIT" "$LANG"
   ```

4. **Check confidence** — default threshold is `0.5`. Below that, fail closed: do NOT write the file; report and escalate to Tier 2/3.
5. **Write back** the `output` field if `success && confidence >= 0.5`.
6. **Persist outcome** — `memory_store --namespace cost-tracking --key "booster-edit-..." --value '{"intent":..., "latency":..., "confidence":..., "strategy":..., "applied":true}'`. Feed the routing learner via `hooks_model-outcome` (use the `cost-optimize` skill's step 8).

## Measured benchmark (2026-05-04, this checkout)

5 representative intents run through `AgentBooster.apply()`:

| intent             | latency (ms) | wall (ms) | confidence | strategy        | success |
|--------------------|-------------:|----------:|-----------:|-----------------|---------|
| var-to-const       |            5 |         5 |       0.65 | fuzzy_replace   | true    |
| add-types          |            1 |         1 |       0.64 | fuzzy_replace   | true    |
| remove-console     |            0 |         0 |       0.70 | fuzzy_replace   | true    |
| add-error-handling |            0 |         0 |       0.85 | exact_replace   | true    |
| async-await        |            0 |         0 |       0.85 | exact_replace   | true    |

Avg measured latency ≈ **1.2 ms**. All 5 above the default 0.5 confidence threshold. See `docs/benchmarks/0002-baseline.md` for the LLM-baseline comparison.

## What's verified locally

| Claim                              | Status here                                                            |
|------------------------------------|-------------------------------------------------------------------------|
| **100% win rate**                  | **Verified** — 12/12 on `bench/booster-corpus.json` (see `runs/latest.json`). Booster AND Gemini 2.0 Flash both score 12/12 — this is a structural-correctness corpus, not a hard adversarial one. |
| **Sub-millisecond latency**        | **Verified** — avg 0.67 ms, p50 0 ms, p99 6 ms, max 6 ms.               |
| **$0 per edit**                    | **Verified structurally** — no API call, no token billing.              |
| **Deterministic AST-based merge**  | **Verified** — same inputs reproduce the same `output` and `strategy`.  |
| **Confidence ≥ 0.5 ⇒ correct**     | **Verified on this corpus** — 12/12 above 0.5 (min 0.551), all correct. |
| **`350×` speedup vs. LLM**         | **Verified — exceeded against every tier:** 1000.9× vs Gemini 2.0 Flash, **1838.7× vs Claude Sonnet 4.6**, **2634.1× vs Claude Opus 4.7**. Run `BENCH_LLM_BASELINE=1 BENCH_ANTHROPIC=1 node scripts/bench.mjs` to refresh. |
| **Cost saved per edit**            | **Measured:** $0.000020 vs Gemini, **$0.000722 vs Sonnet 4.6**, **$0.004720 vs Opus 4.7** (the booster side is $0 in all cases). |
| **Win parity with frontier LLMs**  | **Verified** — Booster, Gemini 2.0 Flash, Sonnet 4.6, Opus 4.7 all scored 12/12 on this corpus. Booster matches LLM accuracy structurally for deterministic transforms. |

To extend: add cases to `bench/booster-corpus.json`, run `( cd v3 && node ../plugins/ruflo-cost-tracker/scripts/bench.mjs )` (or with `BENCH_LLM_BASELINE=1`), commit `runs/latest.json`. Smoke step 23 fails the build if win rate drops below 0.80.

**Override the LLM model:** `BENCH_LLM_MODEL='claude-sonnet-4'` (when wired against `api.anthropic.com`) or `BENCH_LLM_MODEL='models/gemini-2.5-flash'` for a reasoning-model comparison. Pricing flags: `BENCH_LLM_PRICE_IN`, `BENCH_LLM_PRICE_OUT`.

`fuzzy_replace` is best-effort; for production transforms prefer cases that route to `exact_replace` (≥0.85 confidence in our sample).

## Cross-references

ADR-0002 §"Decision 1" (route classifier) and §"Riskiest assumption" (Bash-shelled invocation) · `cost-booster-route` (classifier-side companion) · `agent-booster` npm README (3-mode install, MCP / npm / HTTP).
