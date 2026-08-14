#!/usr/bin/env node
// Verified-corpus benchmark for ruflo-cost-tracker.
// Runs every case in bench/booster-corpus.json through agent-booster.apply()
// and records: correctness vs. golden expected, latency, confidence, strategy.
// Output: JSON to docs/benchmarks/runs/<ISO>.json + markdown summary to stdout.
//
// Resolution: must be run from a directory where `agent-booster` resolves
// (typically anywhere under `v3/`). Run via:
//
//   ( cd v3 && node ../plugins/ruflo-cost-tracker/scripts/bench.mjs )
//
// Optional env:
//   BENCH_LLM_BASELINE=1   -- run the same corpus through Gemini 2.0 Flash (or another OpenAI-compat model)
//   BENCH_LLM_MODEL=...    -- override (default: models/gemini-2.0-flash)
//   BENCH_LLM_BASE_URL=... -- override (default: deployed ruvocal Gemini OpenAI shim)
//   BENCH_LLM_API_KEY=...  -- override (default: from gcloud secret GOOGLE_AI_API_KEY)
//   BENCH_LLM_PRICE_IN/OUT -- $/1M tokens override (default Gemini 2.0 Flash: 0.10 / 0.40)
//
//   BENCH_ANTHROPIC=1      -- run the same corpus through Anthropic claude models
//   BENCH_ANTHROPIC_MODELS=claude-sonnet-4-6,claude-opus-4-7   -- comma-separated list
//   BENCH_ANTHROPIC_API_KEY=... -- override (default: from gcloud secret ANTHROPIC_API_KEY)
//
//   BENCH_OUT=<path>       -- override output JSON path
//   BENCH_QUIET=1          -- suppress markdown summary
//
// Pricing built-in (per 1M tokens, USD): Sonnet 4.6 = 3/15, Opus 4.7 = 15/75, Haiku 4.5 = 1/5.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..');
const CORPUS = join(PLUGIN_ROOT, 'bench', 'booster-corpus.json');
const RUNS_DIR = join(PLUGIN_ROOT, 'docs', 'benchmarks', 'runs');

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const ms = (n) => `${n.toFixed(2)}ms`;
const pcent = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

async function main() {
  const corpus = JSON.parse(readFileSync(CORPUS, 'utf-8'));
  // Resolve agent-booster from process.cwd() (so users can `cd v3 && node ../...`)
  // rather than from the script's directory (which is outside v3/node_modules).
  let AgentBoosterMod;
  try {
    const requireFromCwd = createRequire(join(process.cwd(), 'package.json'));
    const resolvedPath = requireFromCwd.resolve('agent-booster');
    AgentBoosterMod = await import(pathToFileURL(resolvedPath).href);
  } catch (err) {
    console.error(`agent-booster import failed: ${err.message}`);
    console.error(`cwd was: ${process.cwd()}`);
    console.error('Run from a directory where the package resolves, e.g.:');
    console.error('  ( cd v3 && node ../plugins/ruflo-cost-tracker/scripts/bench.mjs )');
    process.exit(2);
  }
  const { AgentBooster } = AgentBoosterMod;
  const booster = new AgentBooster();

  const results = [];
  for (const c of corpus.cases) {
    const expectedTier1 = c.expectedTier1 !== false; // default true (corpus v1 compat)
    const t0 = Date.now();
    let out;
    try {
      out = await booster.apply({ code: c.code, edit: c.edit, language: c.language });
    } catch (e) {
      results.push({ id: c.id, intent: c.intent, expectedTier1, error: String(e.message).slice(0, 200), correct: false });
      continue;
    }
    const wallMs = Date.now() - t0;
    const correct = norm(out.output) === norm(c.expected);
    const lowConfidence = (out.confidence ?? 0) < 0.5;
    // For Tier 1 cases: "good" = correct.
    // For non-Tier 1 cases: "good" = booster correctly *escalates* (incorrect output OR low confidence).
    const escalatedCorrectly = !expectedTier1 && (!correct || lowConfidence);
    results.push({
      id: c.id,
      intent: c.intent,
      expectedTier1,
      success: !!out.success,
      correct,
      escalatedCorrectly,
      lowConfidence,
      latencyMs: out.latency ?? null,
      wallMs,
      confidence: out.confidence ?? null,
      strategy: out.strategy ?? null,
      tokensIn: out.tokens?.input ?? null,
      tokensOut: out.tokens?.output ?? null,
      ...(correct ? {} : { actualPrefix: norm(out.output).slice(0, 120), expectedPrefix: norm(c.expected).slice(0, 120) }),
    });
  }

  const tier1Cases = results.filter((r) => r.expectedTier1);
  const advCases = results.filter((r) => !r.expectedTier1);
  const tier1Passed = tier1Cases.filter((r) => r.correct).length;
  const tier1Total = tier1Cases.length;
  const advEscalated = advCases.filter((r) => r.escalatedCorrectly).length;
  const advTotal = advCases.length;

  const passed = results.filter((r) => r.correct).length;
  const total = results.length;
  const winRate = tier1Total ? tier1Passed / tier1Total : (total ? passed / total : 0);
  const escalationRate = advTotal ? advEscalated / advTotal : null;
  const successCount = results.filter((r) => r.success).length;

  const latencies = results.map((r) => r.latencyMs).filter((x) => typeof x === 'number');
  const wallTimes = results.map((r) => r.wallMs).filter((x) => typeof x === 'number');
  const confidences = results.map((r) => r.confidence).filter((x) => typeof x === 'number');

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  // Optional: run the same corpus through one or more LLMs and record the comparison.
  let llmSummary = null;
  let llmResults = null;
  if (process.env.BENCH_LLM_BASELINE === '1') {
    ({ llmSummary, llmResults } = await runLlmBaseline(corpus.cases));
  }

  let anthropicSummaries = null; // Map<model, summary>
  let anthropicResults = null;   // Map<model, per-case-results>
  if (process.env.BENCH_ANTHROPIC === '1') {
    ({ anthropicSummaries, anthropicResults } = await runAnthropicBaseline(corpus.cases));
  }

  const summary = {
    runAt: new Date().toISOString(),
    corpusVersion: corpus.version,
    corpusSize: total,
    tier1Cases: tier1Total,
    adversarialCases: advTotal,
    winRate, // win rate over Tier 1 cases (the gate metric)
    winRatePct: pct(winRate),
    overallCorrect: total ? passed / total : 0, // diagnostic only
    escalationRate, // null if no adversarial cases; otherwise (correctly-escalated / adversarial)
    escalationRatePct: escalationRate == null ? 'n/a' : pct(escalationRate),
    successCount,
    avgLatencyMs: avg(latencies),
    p50LatencyMs: pcent(latencies, 50),
    p99LatencyMs: pcent(latencies, 99),
    maxLatencyMs: latencies.length ? Math.max(...latencies) : 0,
    avgWallMs: avg(wallTimes),
    avgConfidence: avg(confidences),
    minConfidence: confidences.length ? Math.min(...confidences) : 0,
    confidenceThreshold: 0.5,
    aboveThresholdCount: confidences.filter((c) => c >= 0.5).length,
    structuralCostUsd: 0, // no LLM call → no billing
    llmBaseline: llmSummary || (process.env.BENCH_LLM_BASELINE === '1' ? 'enabled-but-failed' : 'skipped'),
  };
  if (llmSummary) {
    // Direct apples-to-apples speedup ratio (booster vs LLM)
    summary.speedupVsLlm = llmSummary.avgLatencyMs / Math.max(summary.avgLatencyMs, 0.001);
    summary.costDeltaUsdPerEdit = llmSummary.avgCostUsdPerEdit; // booster side is $0
  }
  if (anthropicSummaries) {
    summary.anthropic = {};
    for (const [model, s] of Object.entries(anthropicSummaries)) {
      summary.anthropic[model] = {
        ...s,
        speedupVsBooster: s.avgLatencyMs / Math.max(summary.avgLatencyMs, 0.001),
        costSavedPerEditUsd: s.avgCostUsdPerEdit, // booster side is $0
      };
    }
  }

  const outDir = RUNS_DIR;
  mkdirSync(outDir, { recursive: true });
  const stamp = summary.runAt.replace(/[:.]/g, '-');
  const outPath = process.env.BENCH_OUT || join(outDir, `${stamp}.json`);
  const latestPath = join(outDir, 'latest.json');
  const payload = {
    summary,
    results,
    ...(llmResults ? { llmResults } : {}),
    ...(anthropicResults ? { anthropicResults } : {}),
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  writeFileSync(latestPath, JSON.stringify(payload, null, 2));

  if (process.env.BENCH_QUIET !== '1') {
    console.log(`# Booster benchmark — ${summary.runAt}`);
    console.log('');
    console.log(`| Metric | Value |`);
    console.log(`|---|---:|`);
    console.log(`| Corpus size | ${total} (Tier 1: ${tier1Total}, adversarial: ${advTotal}) |`);
    console.log(`| **Win rate (Tier 1 cases)** | **${pct(winRate)}** (${tier1Passed}/${tier1Total}) |`);
    if (advTotal) {
      console.log(`| Escalation rate (adversarial) | ${pct(escalationRate)} (${advEscalated}/${advTotal}) |`);
    }
    console.log(`| Overall correct (diagnostic) | ${pct(total ? passed/total : 0)} (${passed}/${total}) |`);
    console.log(`| Success flag | ${successCount}/${total} |`);
    console.log(`| Avg latency | ${ms(summary.avgLatencyMs)} |`);
    console.log(`| p50 latency | ${ms(summary.p50LatencyMs)} |`);
    console.log(`| p99 latency | ${ms(summary.p99LatencyMs)} |`);
    console.log(`| Max latency | ${ms(summary.maxLatencyMs)} |`);
    console.log(`| Avg confidence | ${summary.avgConfidence.toFixed(3)} |`);
    console.log(`| Min confidence | ${summary.minConfidence.toFixed(3)} |`);
    console.log(`| Above 0.5 threshold | ${summary.aboveThresholdCount}/${confidences.length} |`);
    console.log(`| Structural cost | $${summary.structuralCostUsd} (no LLM call) |`);
    if (llmSummary) {
      console.log(`| LLM baseline model | ${llmSummary.model} |`);
      console.log(`| LLM avg latency | ${ms(llmSummary.avgLatencyMs)} |`);
      console.log(`| LLM win rate | ${pct(llmSummary.winRate)} (${llmSummary.passed}/${llmSummary.total}) |`);
      console.log(`| LLM avg cost/edit | $${llmSummary.avgCostUsdPerEdit.toFixed(6)} |`);
      console.log(`| **Measured speedup (booster vs LLM)** | **${summary.speedupVsLlm.toFixed(1)}×** |`);
      console.log(`| **Cost saved per edit** | **$${summary.costDeltaUsdPerEdit.toFixed(6)}** (100%) |`);
    } else {
      console.log(`| LLM baseline | ${summary.llmBaseline} |`);
    }
    console.log(``);
    if (anthropicSummaries) {
      console.log(`## Anthropic baseline\n`);
      console.log(`| Model | Avg latency | Win rate | Avg tokens (in/out) | Avg cost/edit | Speedup vs booster | Cost saved/edit |`);
      console.log(`|---|---:|---:|---:|---:|---:|---:|`);
      for (const [model, s] of Object.entries(anthropicSummaries)) {
        const speedup = (s.avgLatencyMs / Math.max(summary.avgLatencyMs, 0.001)).toFixed(1);
        console.log(`| \`${model}\` | ${ms(s.avgLatencyMs)} | ${pct(s.winRate)} (${s.passed}/${s.total}) | ${s.avgTokensIn.toFixed(0)} / ${s.avgTokensOut.toFixed(0)} | $${s.avgCostUsdPerEdit.toFixed(6)} | **${speedup}×** | **$${s.avgCostUsdPerEdit.toFixed(6)}** |`);
      }
      console.log(``);
    }
    const failed = results.filter((r) => !r.correct);
    if (failed.length) {
      console.log(`## Failures (${failed.length})`);
      for (const f of failed) {
        console.log(`- \`${f.id}\` (${f.intent}): ${f.error || `actual="${f.actualPrefix}" vs expected="${f.expectedPrefix}"`}`);
      }
    }
    console.log(``);
    console.log(`Saved: ${outPath}`);
    console.log(`Latest pointer: ${latestPath}`);
  }
}

// ─── LLM baseline ────────────────────────────────────────────────────────────

async function runLlmBaseline(cases) {
  const baseUrl = process.env.BENCH_LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
  const model = process.env.BENCH_LLM_MODEL || 'models/gemini-2.0-flash';
  const priceIn = parseFloat(process.env.BENCH_LLM_PRICE_IN || '0.10'); // $/1M input
  const priceOut = parseFloat(process.env.BENCH_LLM_PRICE_OUT || '0.40'); // $/1M output
  let apiKey = process.env.BENCH_LLM_API_KEY;
  if (!apiKey) {
    // Try to pull from gcloud (deployed ruvocal uses GOOGLE_AI_API_KEY)
    try {
      const { execSync } = await import('node:child_process');
      apiKey = execSync('gcloud secrets versions access latest --secret=GOOGLE_AI_API_KEY 2>/dev/null', { encoding: 'utf-8' }).trim();
    } catch { /* fall through */ }
  }
  if (!apiKey) {
    return { llmSummary: { error: 'no-api-key', baseUrl, model }, llmResults: [] };
  }

  const sys = `You apply code edits deterministically. Return ONLY the resulting code as a single fenced \`\`\`<lang> code block. No explanation, no commentary, no extra blocks. The output of the code block is the final source.`;
  const user = (c) => `Apply this edit. Return only the resulting code.\n\nLanguage: ${c.language}\n\nOriginal code:\n\`\`\`${c.language}\n${c.code}\n\`\`\`\n\nEdit instruction (target snippet):\n\`\`\`${c.language}\n${c.edit}\n\`\`\``;

  const fenceRe = /```(?:[a-zA-Z]+\n)?([\s\S]*?)```/;
  const out = [];
  let totIn = 0, totOut = 0, totLatencyMs = 0, passed = 0;
  for (const c of cases) {
    const t0 = Date.now();
    let body = null;
    try {
      const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: user(c) }],
          max_tokens: 1024,
          temperature: 0,
        }),
      });
      body = await resp.json();
    } catch (e) {
      out.push({ id: c.id, intent: c.intent, error: String(e.message).slice(0, 200), correct: false, wallMs: Date.now() - t0 });
      continue;
    }
    const wallMs = Date.now() - t0;
    const content = body?.choices?.[0]?.message?.content ?? '';
    const m = fenceRe.exec(content);
    const extracted = (m ? m[1] : content).trim();
    const correct = norm(extracted) === norm(c.expected);
    if (correct) passed++;
    const inT = body?.usage?.prompt_tokens ?? 0;
    const outT = body?.usage?.completion_tokens ?? 0;
    totIn += inT; totOut += outT; totLatencyMs += wallMs;
    const cost = inT / 1e6 * priceIn + outT / 1e6 * priceOut;
    out.push({
      id: c.id, intent: c.intent, correct, wallMs,
      tokensIn: inT, tokensOut: outT, costUsd: cost,
      ...(correct ? {} : { actualPrefix: norm(extracted).slice(0, 120), expectedPrefix: norm(c.expected).slice(0, 120) }),
    });
  }
  const total = cases.length;
  const totalCost = out.reduce((s, r) => s + (r.costUsd || 0), 0);
  return {
    llmSummary: {
      model, baseUrl, total, passed,
      winRate: total ? passed / total : 0,
      avgLatencyMs: total ? totLatencyMs / total : 0,
      totalTokensIn: totIn,
      totalTokensOut: totOut,
      avgTokensIn: total ? totIn / total : 0,
      avgTokensOut: total ? totOut / total : 0,
      totalCostUsd: totalCost,
      avgCostUsdPerEdit: total ? totalCost / total : 0,
      pricing: { input_per_1M: priceIn, output_per_1M: priceOut },
    },
    llmResults: out,
  };
}

// ─── Anthropic baseline ──────────────────────────────────────────────────────

// Built-in pricing per 1M tokens (USD). Override with BENCH_ANTHROPIC_PRICING JSON env.
const ANTHROPIC_PRICING = {
  'claude-sonnet-4-6':  { input: 3.00,  output: 15.00 },
  'claude-opus-4-7':    { input: 15.00, output: 75.00 },
  'claude-haiku-4-5':   { input: 1.00,  output: 5.00 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
};

async function runAnthropicBaseline(cases) {
  let apiKey = process.env.BENCH_ANTHROPIC_API_KEY;
  if (!apiKey) {
    try {
      const { execSync } = await import('node:child_process');
      apiKey = execSync('gcloud secrets versions access latest --secret=ANTHROPIC_API_KEY 2>/dev/null', { encoding: 'utf-8' }).trim();
    } catch { /* fall through */ }
  }
  if (!apiKey) {
    return { anthropicSummaries: { _error: 'no-api-key' }, anthropicResults: {} };
  }

  let pricingOverride = {};
  if (process.env.BENCH_ANTHROPIC_PRICING) {
    try { pricingOverride = JSON.parse(process.env.BENCH_ANTHROPIC_PRICING); } catch { /* ignore */ }
  }
  const models = (process.env.BENCH_ANTHROPIC_MODELS || 'claude-sonnet-4-6,claude-opus-4-7')
    .split(',').map((s) => s.trim()).filter(Boolean);

  const sys = `You apply code edits deterministically. Return ONLY the resulting code as a single fenced \`\`\`<lang> code block. No explanation, no commentary, no extra blocks.`;
  const user = (c) => `Apply this edit. Return only the resulting code.\n\nLanguage: ${c.language}\n\nOriginal code:\n\`\`\`${c.language}\n${c.code}\n\`\`\`\n\nEdit instruction (target snippet):\n\`\`\`${c.language}\n${c.edit}\n\`\`\``;
  const fenceRe = /```(?:[a-zA-Z]+\n)?([\s\S]*?)```/;

  const summaries = {};
  const allResults = {};
  for (const model of models) {
    const pricing = pricingOverride[model] || ANTHROPIC_PRICING[model] || { input: 3, output: 15 };
    const out = [];
    let totIn = 0, totOut = 0, totLatencyMs = 0, passed = 0;
    for (const c of cases) {
      const t0 = Date.now();
      let body = null;
      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            system: sys,
            messages: [{ role: 'user', content: user(c) }],
          }),
        });
        body = await resp.json();
      } catch (e) {
        out.push({ id: c.id, intent: c.intent, error: String(e.message).slice(0, 200), correct: false, wallMs: Date.now() - t0 });
        continue;
      }
      const wallMs = Date.now() - t0;
      const text = body?.content?.[0]?.text ?? '';
      const m = fenceRe.exec(text);
      const extracted = (m ? m[1] : text).trim();
      const correct = norm(extracted) === norm(c.expected);
      if (correct) passed++;
      const inT = body?.usage?.input_tokens ?? 0;
      const outT = body?.usage?.output_tokens ?? 0;
      totIn += inT; totOut += outT; totLatencyMs += wallMs;
      const cost = inT / 1e6 * pricing.input + outT / 1e6 * pricing.output;
      out.push({
        id: c.id, intent: c.intent, correct, wallMs,
        tokensIn: inT, tokensOut: outT, costUsd: cost,
        ...(correct ? {} : { actualPrefix: norm(extracted).slice(0, 120), expectedPrefix: norm(c.expected).slice(0, 120) }),
      });
    }
    const total = cases.length;
    const totalCost = out.reduce((s, r) => s + (r.costUsd || 0), 0);
    summaries[model] = {
      model, total, passed,
      winRate: total ? passed / total : 0,
      avgLatencyMs: total ? totLatencyMs / total : 0,
      totalTokensIn: totIn,
      totalTokensOut: totOut,
      avgTokensIn: total ? totIn / total : 0,
      avgTokensOut: total ? totOut / total : 0,
      totalCostUsd: totalCost,
      avgCostUsdPerEdit: total ? totalCost / total : 0,
      pricing,
    };
    allResults[model] = out;
  }

  return { anthropicSummaries: summaries, anthropicResults: allResults };
}

main().catch((e) => {
  console.error('bench failed:', e);
  process.exit(1);
});
