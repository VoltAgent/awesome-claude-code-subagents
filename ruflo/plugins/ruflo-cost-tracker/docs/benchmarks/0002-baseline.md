# Cost-tracker ADR-0002 baseline benchmark

Recorded 2026-05-04 immediately after ADR-0002 implementation merged.
Purpose: capture file sizes, smoke wall-time, and allowed-tools surface so
future regressions (skill bloat, tool-surface creep, smoke slowdown) are
visible. **No new MCP tools were introduced** by ADR-0002 — every "capability"
is wiring of tools that already exist in `hooks-tools.ts`.

## Plugin file sizes

| File                                       |  Bytes | Words | Lines |
|--------------------------------------------|-------:|------:|------:|
| skills/cost-booster-route/SKILL.md         |  3,906 |   527 |    59 |
| skills/cost-compact-context/SKILL.md       |  4,067 |   463 |    79 |
| skills/cost-optimize/SKILL.md              |  3,489 |   414 |    37 |
| skills/cost-report/SKILL.md                |  2,629 |   351 |    35 |
| agents/cost-analyst.md                     |  3,713 |   437 |    58 |
| commands/ruflo-cost.md                     |  2,802 |   370 |    46 |
| REFERENCE.md                               |  4,420 |   662 |    92 |
| README.md                                  |  8,208 | 1,087 |   141 |
| .claude-plugin/plugin.json                 |    684 |    61 |    25 |
| scripts/smoke.sh                           |  6,585 |   779 |   149 |

All four skill prompts stay under the 5 KB target derived from ADR-098
Part 2's "lean agent prompt" rule (reference data lives in REFERENCE.md,
not in the skill body).

## Smoke contract

| Metric          | Value                       |
|-----------------|-----------------------------|
| Total checks    | 19 (16 ADR-mandated + 3 doc-invariant) |
| Wall-time (avg) | 0.08–0.09 s over 3 runs     |
| Failures        | 0                           |

The bash-grep approach keeps verification cheap enough to run on every
commit. No interpreter spawn, no network, no MCP round-trip.

## Allowed-tools surface (no wildcards)

| Skill                | Tool count | Tools |
|----------------------|-----------:|-------|
| cost-booster-route   |          4 | hooks_route, memory_search, memory_list, Bash |
| cost-compact-context |          1 | Bash (Node one-liner — see ADR-0002 §"Riskiest assumption") |
| cost-optimize        |          8 | memory_{search,list,store}, agentdb_pattern-{search,store}, agentdb_semantic-route, hooks_model-outcome, Bash |
| cost-report          |          6 | memory_{search,list,retrieve}, agentdb_pattern-search, agentdb_semantic-route, Bash |

`cost-compact-context` deliberately grants only `Bash` because **no MCP
tool wraps `getTokenOptimizer`** today. ADR-0002 §"Riskiest assumption"
documents the deferral: if/when an MCP wrapper ships, this skill will be
revisited and the Bash grant dropped.

## Token-spend optimization claims (upstream, not measured here)

CLAUDE.md root attributes the following figures to the Token Optimizer
bridge. They are reported by `getTokenOptimizer` in-process; this plugin
**surfaces** them via `cost-compact-context` but does **not** verify them
against a no-RAG baseline:

| Feature                         | Claimed savings | Status in this repo                |
|---------------------------------|-----------------|------------------------------------|
| ReasoningBank retrieval         | −32% tokens     | Claimed upstream, not yet verified |
| Agent Booster edits             | −15% tokens     | Claimed upstream, not yet verified |
| Cache (95% hit rate)            | −10% tokens     | Claimed upstream, not yet verified |
| Optimal batch size              | −20% tokens     | Claimed upstream, not yet verified |
| Tier 1 (Agent Booster) cost     | $0 / call       | Structurally correct (no LLM call) |
| Tier 1 latency                  | <1 ms           | Structurally correct (WASM, local) |
| Tier 1 vs LLM speedup           | 352×            | Claimed upstream, not yet verified |

The only number this plugin asserts as a measured saving is the
**structural** $0 cost of a Tier 1 bypass — there is no LLM call, so no
token billing. Every other figure carries the "claimed upstream, not yet
verified" disclaimer in the skill body, per ADR-0002.

## Regression triggers

If a future change pushes any of these past their threshold, treat it as
a regression to investigate before merging:

- Any SKILL.md > 6 KB → likely contains reference data that belongs in
  REFERENCE.md (ADR-098 Part 2).
- Smoke wall-time > 0.30 s → grep patterns are doing something
  unbounded; check for unanchored `.+` across multi-MB files.
- Any skill with `allowed-tools: *` → wildcard grant. Smoke step 10
  will fail.
- New MCP tool added to ADR-0002's wiring scope without an ADR
  amendment → the ADR was deliberate that no new tools land in this
  decision.

## Verification findings (2026-05-04)

End-to-end runtime verification surfaced three real bugs in the first draft
of the new skills, all caught and fixed before this baseline was recorded:

| # | Surface                          | What ran                                                    | Outcome  | Fix |
|---|----------------------------------|-------------------------------------------------------------|----------|-----|
| 1 | Upstream literals exist          | `grep "AGENT_BOOSTER_AVAILABLE" hooks-tools.ts`             | found at line 1228 ✓ | none |
| 2 | `getTokenOptimizer` exported     | `grep` token-optimizer.ts:308                               | found ✓ | none |
| 3 | `dist/token-optimizer.js` built  | `ls v3/node_modules/@claude-flow/integration/dist/`         | present ✓ | none |
| 4 | sibling contract honored both ways | `grep "cost-tracker" ruflo-loop-workers/README.md`        | declared at lines 46, 55 ✓ | none |
| 5 | Skill's claimed import path      | `import("@claude-flow/integration/dist/token-optimizer.js")`| FAILED — Node resolver doubled `.js.js` via the `./*` exports rule | use canonical export `@claude-flow/integration/token-optimizer` |
| 6 | Skill's claimed availability API | `opt.isAgentBoosterAvailable?.()`                           | undefined — method does not exist on the singleton | switched to `getStats().agenticFlowAvailable` (the actual public field) |
| 7 | Booster signal under published CLI | `npx @claude-flow/cli@latest hooks route --task "var to const"` | router used semantic-VectorDb path; **no `[AGENT_BOOSTER_AVAILABLE]` emitted** | added "sparse signal" caveat to the skill — the partition is a lower bound on Tier 1 eligibility |
| 8 | Bridge returns expected shape    | Node one-liner with corrected import + stats key            | `{memoriesRetrieved:0, tokensSaved:0, agenticFlowAvailable:false, cacheHitRate:"0%"}` ✓ — graceful fallback when agentic-flow not installed | none |

The first four checks confirm what the ADR claimed about the upstream
surface. Checks 5–7 caught skill-text bugs that would have surfaced only
when an agent actually ran the skill — exactly the value of running the
verification once before declaring done. Check 8 confirms the corrected
Node block produces the shape the skill's report step describes.

The remaining honesty:

- **`agenticFlowAvailable: false`** is the truthful state of this checkout —
  the `agentic-flow` peer dependency is not installed in
  `v3/node_modules/`. The bridge's documented graceful-fallback path
  (returns `tokensSaved: 0`, no throw) is the active code path here, and
  it works.
- **Tier 1 partition under the current CLI**: `cost-booster-route` will
  almost always report `tier1: 0` until either the upstream classifier
  broadens or the user passes an explicit booster intent. The skill now
  documents this as a lower bound, not an absolute.

## Verified corpus benchmark — flips claims from "upstream" to "measured here"

`scripts/bench.mjs` runs every case in `bench/booster-corpus.json` through
`AgentBooster.apply()` and writes `docs/benchmarks/runs/latest.json` plus a
timestamped JSON. Smoke step 23 fails CI if `summary.winRate < 0.80`.

### Run command

```bash
( cd v3 && node ../plugins/ruflo-cost-tracker/scripts/bench.mjs )
```

### Latest result (2026-05-05, 12-case corpus)

| Metric                            | Value                          | Source                        |
|-----------------------------------|--------------------------------|-------------------------------|
| Win rate (`output==expected`)     | **100.0% (12/12)**             | `runs/latest.json`            |
| Success flag                      | 12/12                          | per-case `out.success`        |
| Avg latency                       | **0.58 ms**                    | mean of `out.latency`         |
| p50 latency                       | 0.00 ms                        | percentile                    |
| p99 latency                       | 5.00 ms                        | percentile                    |
| Max latency                       | 5 ms                           | observed                      |
| Avg confidence                    | 0.729                          | mean of `out.confidence`      |
| Min confidence                    | 0.551                          | observed                      |
| Above 0.5 threshold               | **12/12**                      | the gate cost-booster-edit uses |
| Structural cost                   | $0                             | no LLM call ⇒ no billing      |
| LLM-baseline comparison           | skipped (env hook present)     | `BENCH_LLM_BASELINE=1`        |

### What this verifies (no longer "claimed upstream")

| Claim                          | Status                                                |
|--------------------------------|-------------------------------------------------------|
| **100% win rate**              | **Verified** — 12/12 on the local corpus              |
| **Sub-millisecond latency**    | **Verified** — 0.58 ms avg                            |
| **$0 per edit**                | **Verified structurally** — no network round-trip     |
| **Deterministic AST merge**    | **Verified** — reproducible `output` + `strategy`     |
| **Confidence ≥ 0.5 ⇒ correct** | **Verified on this corpus** — 12/12 above, 12/12 correct |

### Corpus v2 results — adversarial split (2026-05-05, plugin v0.4.0)

The corpus is now 16 cases: 12 Tier 1 (where booster should succeed) + 4 adversarial (where booster should escalate). All three LLMs failed on the same 1 of 4 adversarial cases.

| Endpoint | Tier 1 win | Adversarial win | Avg latency | Cost/edit | Speedup vs Booster |
|---|---:|---:|---:|---:|---:|
| **Agent Booster (WASM)** | **12/12** | **0/4 applied** ⇒ 100% correctly escalated | **0.50 ms** | **$0** | — |
| Gemini 2.0 Flash | 12/12 | 3/4 | 762.13 ms | $0.000027 | **1524.3×** |
| Claude Sonnet 4.6 | 12/12 | 3/4 | 1158.06 ms | $0.000982 | **2316.1×** |
| Claude Opus 4.7 | 12/12 | 3/4 | 1517.94 ms | $0.006049 | **3035.9×** |

**Booster escalation correctness = 100%** — every adversarial case fell below the 0.5 confidence threshold (min 0.000), so a fail-closed routing rule lands them in Tier 2/3 every time. **All three LLMs (including Opus 4.7)** misapplied the same adversarial case (`adversarial-recursive-rewrite` — they all left it as recursive rather than rewriting iteratively as instructed).

### Original 12-case results (corpus v1, kept for reference)

`BENCH_LLM_BASELINE=1` (Gemini via OpenAI shim) and `BENCH_ANTHROPIC=1` (Sonnet 4.6 + Opus 4.7) drive the same corpus. API keys pulled from the GCP secrets the deployed ruvocal Cloud Run service uses (`GOOGLE_AI_API_KEY`, `ANTHROPIC_API_KEY`).

| Endpoint | Avg latency | Win rate | Cost / edit | Speedup vs Booster |
|---|---:|---:|---:|---:|
| **Agent Booster (WASM, local)** | **0.58 ms** | 12/12 (100%) | **$0** | — |
| Gemini 2.0 Flash (cheap floor) | 583.83 ms | 12/12 (100%) | $0.000020 | **1000.9×** |
| **Claude Sonnet 4.6** | **1072.58 ms** | 12/12 (100%) | **$0.000722** | **1838.7×** |
| **Claude Opus 4.7** | **1536.58 ms** | 12/12 (100%) | **$0.004720** | **2634.1×** |

All four endpoints achieve 12/12. Booster matches frontier LLM accuracy on this structural corpus; the differentiator is **latency × cost**.

### Per-edit token cost (Anthropic side)

| Model | Avg input tokens | Avg output tokens | Cost / edit |
|---|---:|---:|---:|
| Sonnet 4.6 | 113 | 26 | $0.000722 |
| Opus 4.7 | 158 | 31 | $0.004720 |

### Extrapolated monthly impact (100k simple-transform edits)

| Replaced by Booster | Wall-time saved | Cost saved |
|---|---:|---:|
| Gemini 2.0 Flash floor | ~16.2 hours | $2.00 |
| Claude Sonnet 4.6 | ~29.8 hours | $72.20 |
| **Claude Opus 4.7** | **~42.7 hours** | **$472.00** |

Method to refresh: `( cd v3 && BENCH_LLM_BASELINE=1 BENCH_ANTHROPIC=1 node ../plugins/ruflo-cost-tracker/scripts/bench.mjs )`.

### Still "claimed upstream, not yet verified"

| Claim                              | Why not verified yet                                            | How to flip it                |
|------------------------------------|------------------------------------------------------------------|--------------------------------|
| `−32%` retrieval (TokenOptimizer)  | Requires a real workload + agentic-flow installed; bridge currently reports `agenticFlowAvailable: false` here | Install `agentic-flow` into a dedicated bench env and run a paired no-RAG-vs-RAG token-count comparison |
| `−15%` booster edits in token-spend | Requires aggregating booster vs. LLM token counts over a real workload (the bench above measures *per-edit* not *per-workload*) | Run the corpus repeatedly inside the cost-optimize skill's outcome capture and aggregate `tokens_avoided` |
| `95%` cache hit rate               | Requires a real workload that exercises the cache                | Run `getCompactContext` over a representative query stream; report `getStats().cacheHitRate` |

### Corpus and harness invariants (smoke-enforced)

- `bench/booster-corpus.json` exists, parses as JSON, has ≥10 cases (smoke step 22).
- `scripts/bench.mjs` parses cleanly with `node --check` (smoke step 22).
- `runs/latest.json` either doesn't exist (initial state, non-blocking) **or** has `summary.winRate ≥ 0.80` (smoke step 23).

To raise the threshold: edit step 23's `>= 0.8` literal. To fail closed before any run: drop the "or skipped" branch.

## Agent Booster integration — before vs. after benchmark (2026-05-04)

The `cost-booster-edit` skill wraps `npm agent-booster` directly. The
package is locally installed at `v3/node_modules/agent-booster/` (v0.2.2)
and exposes the Morph-compatible `AgentBooster.apply({code, edit,
language})` → `{output, success, latency, confidence, strategy, tokens}`.

### Measured "after" — 5 representative intents through `AgentBooster.apply()`

Run command:

```bash
node --input-type=module -e '
  import("agent-booster").then(async ({ AgentBooster }) => {
    const b = new AgentBooster();
    /* 5 cases */
  });
'
```

| Intent             | latency (ms) | wall (ms) | confidence | strategy        | success | tokens.in | tokens.out |
|--------------------|-------------:|----------:|-----------:|-----------------|---------|----------:|-----------:|
| var-to-const       |            5 |         5 |       0.65 | fuzzy_replace   | ✓       |         6 |          7 |
| add-types          |            1 |         1 |       0.64 | fuzzy_replace   | ✓       |         9 |         15 |
| remove-console     |            0 |         0 |       0.70 | fuzzy_replace   | ✓       |        12 |          7 |
| add-error-handling |            0 |         0 |       0.85 | exact_replace   | ✓       |        10 |         19 |
| async-await        |            0 |         0 |       0.85 | exact_replace   | ✓       |        14 |         17 |
| **avg**            |        **1.2** |     **1.2** |   **0.74** | —               | **5/5** |  **10.2** |     **13.0** |

All 5 ≥ 0.5 confidence threshold (the default below which `cost-booster-edit`
fails closed). 2 of 5 (`add-error-handling`, `async-await`) hit the
high-confidence `exact_replace` path; 3 hit `fuzzy_replace`.

### Hypothesized "before" — same 5 edits via an LLM editing endpoint

LLM baseline numbers come from the `agent-booster` package's own README
("200–500 ms latency, ~$0.01 per edit") and from CLAUDE.md root's pricing
table (Sonnet $3/M input, $15/M output). The "before" column is **not
measured live in this repo** — running an LLM baseline on every benchmark
would defeat the cost-tracking purpose. We treat it as a published
reference point.

| Metric                   | Before (LLM, claimed)   | After (booster, measured)         | Delta                       |
|--------------------------|------------------------:|----------------------------------:|----------------------------:|
| Per-edit latency         |              200–500 ms |                       0–5 ms (avg 1.2 ms) | **≥40× faster** measured (≥352× per upstream README) |
| Per-edit cost (Sonnet)   |               ~$0.0070  |                            **$0** | **−$0.0070 / edit (100%)**  |
| Per-edit cost (Opus)     |               ~$0.035   |                            **$0** | **−$0.035 / edit (100%)**   |
| Determinism              |          non-deterministic |                  deterministic AST | qualitatively superior     |
| Privacy                  |  external API round-trip |             100% local WASM       | qualitatively superior     |
| Success rate (this 5)    |               n/a       |                          **5 / 5** | —                          |

Sonnet $0.0070 estimate: ~10 input + ~13 output tokens per edit (from
measured `tokens.in/.out` above) × Sonnet rates **plus** the system-prompt
+ instruction overhead an LLM round-trip carries (~2,000 input tokens
typical for a code-edit prompt) ≈ $0.006–0.008. Opus is ~5× higher.

### Plugin token-load improvement (separate axis — same session)

Independent of the booster integration, the plugin's own agent-loadable
prompt surface was trimmed:

| Skill                       | Before tokens | After tokens | Δ tokens | Δ %      |
|-----------------------------|--------------:|-------------:|---------:|---------:|
| cost-booster-route          |         1,189 |          736 |    **−453** | **−38.1%** |
| cost-compact-context        |         1,153 |          762 |    **−391** | **−33.9%** |
| cost-optimize               |           822 |          822 |        0 | 0.0%     |
| cost-report                 |           678 |          678 |        0 | 0.0%     |
| cost-analyst.md             |           866 |          866 |        0 | 0.0%     |
| **TOTAL agent-loadable**    |     **5,978** |    **5,134** |  **−844** | **−14.1%** |

(Tokens via `tiktoken` `cl100k_base`, a close proxy for Anthropic's
tokenizer — the relative deltas hold within ~5%.)

At Sonnet input pricing, the per-spawn savings are $0.00136 for
`cost-booster-route` and $0.00117 for `cost-compact-context`. Across
~1,000 spawns the plugin trim alone saves ~$1.30, independent of any
booster routing decisions.

### Smoke contract growth

| Phase                          | Checks |
|--------------------------------|-------:|
| ADR-0001 baseline              |     10 |
| ADR-0002 + doc-invariants      |     19 |
| **+ Agent Booster integration**|     **21** |

Wall-time 0.08–0.09 s on all phases.

## How to refresh

```bash
cd plugins/ruflo-cost-tracker
for f in skills/*/SKILL.md agents/*.md commands/*.md REFERENCE.md README.md \
         .claude-plugin/plugin.json scripts/smoke.sh; do
  wc -c "$f" | awk '{printf "%6d B  ", $1}'
  wc -w "$f" | awk '{printf "%5d w  ", $1}'
  wc -l "$f" | awk '{printf "%4d L  ", $1}'
  printf "%s\n" "$f"
done
for i in 1 2 3; do /usr/bin/time -p bash scripts/smoke.sh > /dev/null; done
```
