#!/usr/bin/env npx tsx
/**
 * Analyze and auto-optimize the project's CLAUDE.md
 *
 * Produces:
 * 1. A detailed before-analysis report
 * 2. Auto-optimized content
 * 3. A before/after benchmark
 * 4. The optimized CLAUDE.md content
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyze, benchmark, autoOptimize, formatReport, formatBenchmark } from '../src/analyzer.js';

// Analyze both the root CLAUDE.md and v3/CLAUDE.md
const ROOT_CLAUDE_MD = resolve(import.meta.dirname!, '../../../../CLAUDE.md');
const V3_CLAUDE_MD = resolve(import.meta.dirname!, '../../../CLAUDE.md');

const CLAUDE_MD_PATH = ROOT_CLAUDE_MD;

// Read the current file
const original = readFileSync(CLAUDE_MD_PATH, 'utf-8');

console.log('='.repeat(80));
console.log('  CLAUDE.md ANALYSIS & OPTIMIZATION REPORT');
console.log('  Target: ' + CLAUDE_MD_PATH);
console.log('  Date: ' + new Date().toISOString());
console.log('='.repeat(80));
console.log();

// ── Before Analysis ──────────────────────────────────────────────────────────
console.log('┌─────────────────────────────────────┐');
console.log('│  PHASE 1: BEFORE ANALYSIS           │');
console.log('└─────────────────────────────────────┘');
console.log();

const beforeResult = analyze(original);
console.log(formatReport(beforeResult));
console.log();

// ── Detailed Findings ────────────────────────────────────────────────────────
console.log('┌─────────────────────────────────────┐');
console.log('│  PHASE 2: DETAILED FINDINGS         │');
console.log('└─────────────────────────────────────┘');
console.log();

for (const dim of beforeResult.dimensions) {
  if (dim.findings.length > 0) {
    console.log(`  ${dim.name} (${dim.score}/${dim.max}):`);
    for (const f of dim.findings) {
      console.log(`    - ${f}`);
    }
    console.log();
  }
}

// ── Auto-Optimize ────────────────────────────────────────────────────────────
console.log('┌─────────────────────────────────────┐');
console.log('│  PHASE 3: AUTO-OPTIMIZATION         │');
console.log('└─────────────────────────────────────┘');
console.log();

const optimized = autoOptimize(original, undefined, 5);

console.log(`Applied ${optimized.appliedSuggestions.length} suggestions:`);
for (const s of optimized.appliedSuggestions) {
  console.log(`  [${s.priority.toUpperCase()}] ${s.action}: ${s.description} (+${s.estimatedImprovement} pts)`);
}
console.log();

// ── Benchmark ────────────────────────────────────────────────────────────────
console.log('┌─────────────────────────────────────┐');
console.log('│  PHASE 4: BEFORE/AFTER BENCHMARK    │');
console.log('└─────────────────────────────────────┘');
console.log();

console.log(formatBenchmark(optimized.benchmark));
console.log();

// ── After Analysis ───────────────────────────────────────────────────────────
console.log('┌─────────────────────────────────────┐');
console.log('│  PHASE 5: AFTER ANALYSIS            │');
console.log('└─────────────────────────────────────┘');
console.log();

const afterResult = analyze(optimized.optimized);
console.log(formatReport(afterResult));
console.log();

// ── Metrics Comparison Table ─────────────────────────────────────────────────
console.log('┌─────────────────────────────────────┐');
console.log('│  PHASE 6: METRICS COMPARISON        │');
console.log('└─────────────────────────────────────┘');
console.log();

const bm = beforeResult.metrics;
const am = afterResult.metrics;

function delta(before: number, after: number): string {
  const d = after - before;
  return d >= 0 ? '+' + d : String(d);
}

function row(label: string, before: number | boolean, after: number | boolean, showDelta = true): string {
  const b = String(before).padStart(6);
  const a = String(after).padStart(6);
  const d = showDelta && typeof before === 'number' && typeof after === 'number'
    ? '    ' + delta(before as number, after as number)
    : '';
  return '  ' + label.padEnd(24) + b + '    ' + a + d;
}

console.log('  Metric                    Before    After     Delta');
console.log('  ─────────────────────────────────────────────────────');
console.log(row('Total lines', bm.totalLines, am.totalLines));
console.log(row('Content lines', bm.contentLines, am.contentLines));
console.log(row('Sections (H2)', bm.sectionCount, am.sectionCount));
console.log(row('Rules', bm.ruleCount, am.ruleCount));
console.log(row('Enforcement stmts', bm.enforcementStatements, am.enforcementStatements));
console.log(row('Code blocks', bm.codeBlockCount, am.codeBlockCount));
console.log(row('Estimated shards', bm.estimatedShards, am.estimatedShards));
console.log(row('Tool mentions', bm.toolMentions, am.toolMentions));
console.log(row('Domain rules', bm.domainRuleCount, am.domainRuleCount));
console.log(row('Has build command', bm.hasBuildCommand, am.hasBuildCommand, false));
console.log(row('Has test command', bm.hasTestCommand, am.hasTestCommand, false));
console.log(row('Has security section', bm.hasSecuritySection, am.hasSecuritySection, false));
console.log(row('Has architecture', bm.hasArchitectureSection, am.hasArchitectureSection, false));
console.log(row('Constitution lines', bm.constitutionLines, am.constitutionLines));
console.log(row('Longest section', bm.longestSectionLines, am.longestSectionLines));
console.log();

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('='.repeat(80));
console.log('  SUMMARY');
console.log('='.repeat(80));
console.log();
const scoreDelta = afterResult.compositeScore - beforeResult.compositeScore;
const sign = scoreDelta >= 0 ? '+' : '';
console.log('  Composite Score:  ' + beforeResult.compositeScore + ' -> ' + afterResult.compositeScore + ' (' + sign + scoreDelta + ')');
console.log('  Grade:            ' + beforeResult.grade + ' -> ' + afterResult.grade);
console.log('  Suggestions Applied: ' + optimized.appliedSuggestions.length);
console.log('  Dimensions Improved: ' + optimized.benchmark.improvements.length);
console.log('  Dimensions Regressed: ' + optimized.benchmark.regressions.length);
console.log();

// Save the optimized content
const outputPath = CLAUDE_MD_PATH.replace('.md', '.optimized.md');
writeFileSync(outputPath, optimized.optimized, 'utf-8');
console.log('  Optimized file saved to: ' + outputPath);
console.log();

// Also analyze v3/CLAUDE.md if it exists
try {
  const v3Content = readFileSync(V3_CLAUDE_MD, 'utf-8');
  console.log('='.repeat(80));
  console.log('  BONUS: v3/CLAUDE.md ANALYSIS');
  console.log('  Target: ' + V3_CLAUDE_MD);
  console.log('='.repeat(80));
  console.log();
  const v3Result = analyze(v3Content);
  console.log(formatReport(v3Result));
  console.log();

  const v3Optimized = autoOptimize(v3Content, undefined, 5);
  console.log(formatBenchmark(v3Optimized.benchmark));
  console.log();

  const v3OutputPath = V3_CLAUDE_MD.replace('.md', '.optimized.md');
  writeFileSync(v3OutputPath, v3Optimized.optimized, 'utf-8');
  console.log('  v3 optimized file saved to: ' + v3OutputPath);
} catch {
  // v3/CLAUDE.md may not exist
}
