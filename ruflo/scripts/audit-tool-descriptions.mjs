#!/usr/bin/env node
/**
 * ADR-112 — MCP tool description discoverability audit.
 *
 * Scans every MCPTool definition in src/mcp-tools/*.ts and checks each
 * description for "use this over native when?" guidance signals:
 *   - /Use when/i
 *   - /Prefer .* over/i
 *   - /Pair with/i
 *   - /fall back/i
 *   - /use over native/i
 *
 * Emits a JSON report and a human-readable summary. Exits non-zero if
 * the no-guidance count exceeds the baseline registered in
 * verification/mcp-tool-baseline.json — the baseline is monotone-decreasing,
 * so any regression fails CI.
 *
 * Usage:
 *   node scripts/audit-tool-descriptions.mjs [--update-baseline]
 *
 * --update-baseline writes the current no-guidance count to the baseline
 * file. Run this AFTER landing a description-improvement PR and validating
 * the fixes locally; do NOT use to mask regressions.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const TOOLS_DIR = join(REPO_ROOT, 'v3/@claude-flow/cli/src/mcp-tools');
const BASELINE_FILE = join(REPO_ROOT, 'verification/mcp-tool-baseline.json');

const GUIDANCE_PATTERNS = [
  /Use when/i,
  /Prefer .* over/i,
  /use .* over (native|the )/i,
  /Pair with/i,
  /fall back/i,
  /native .* is (fine|wrong)/i,
];

const MIN_DESCRIPTION_LENGTH = 80;

function hasGuidance(desc) {
  return GUIDANCE_PATTERNS.some(re => re.test(desc));
}

function scanFile(file) {
  const src = readFileSync(file, 'utf-8');
  // Match `name: '...',` followed by `description: '...'` (with escaped chars).
  const re = /name:\s*'([^']+)',\s*\n\s*description:\s*'((?:[^'\\]|\\.)*)'/g;
  const results = [];
  let m;
  while ((m = re.exec(src))) {
    results.push({ name: m[1], description: m[2], hasGuidance: hasGuidance(m[2]) });
  }
  return results;
}

const updateBaseline = process.argv.includes('--update-baseline');

const files = readdirSync(TOOLS_DIR)
  .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map(f => join(TOOLS_DIR, f));

const allTools = files.flatMap(scanFile);
const withGuidance = allTools.filter(t => t.hasGuidance);
const withoutGuidance = allTools.filter(t => !t.hasGuidance);

// Additional static checks — every MCPTool description must:
//   1. Have "Use when …" guidance (the original check)
//   2. Be at least MIN_DESCRIPTION_LENGTH chars (catches near-empty descriptions)
//   3. Be unique across all tools (catches lazy copy-paste of a generic line)
const tooShort = allTools.filter(t => t.description.length < MIN_DESCRIPTION_LENGTH);
const descCounts = new Map();
for (const t of allTools) {
  descCounts.set(t.description, (descCounts.get(t.description) ?? 0) + 1);
}
const duplicates = [...descCounts.entries()].filter(([, c]) => c > 1);

const report = {
  scannedAt: new Date().toISOString(),
  totalTools: allTools.length,
  withGuidance: withGuidance.length,
  withoutGuidance: withoutGuidance.length,
  tooShort: tooShort.length,
  duplicateDescriptions: duplicates.length,
  offenders: withoutGuidance.map(t => ({ name: t.name, description: t.description.slice(0, 100) })),
  shortOffenders: tooShort.map(t => ({ name: t.name, length: t.description.length, description: t.description })),
  duplicateGroups: duplicates.slice(0, 5).map(([desc, count]) => ({ count, description: desc.slice(0, 100) })),
};

console.log(`MCP tool discoverability audit (ADR-112)`);
console.log(`========================================`);
console.log(`Total tools scanned:      ${report.totalTools}`);
console.log(`With Use-when guidance:   ${report.withGuidance}`);
console.log(`Without guidance:         ${report.withoutGuidance}`);
console.log(`Too short (<${MIN_DESCRIPTION_LENGTH} chars):  ${report.tooShort}`);
console.log(`Duplicate descriptions:   ${report.duplicateDescriptions}`);

let baseline = { withoutGuidance: report.withoutGuidance, tooShort: report.tooShort, duplicateDescriptions: report.duplicateDescriptions };
if (existsSync(BASELINE_FILE)) {
  baseline = { ...baseline, ...JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) };
  console.log(`Baseline no-guidance:     ${baseline.withoutGuidance}`);
  console.log(`Baseline tooShort:        ${baseline.tooShort ?? '(n/a)'}`);
  console.log(`Baseline duplicates:      ${baseline.duplicateDescriptions ?? '(n/a)'}`);
}

if (updateBaseline) {
  writeFileSync(
    BASELINE_FILE,
    JSON.stringify({
      withoutGuidance: report.withoutGuidance,
      tooShort: report.tooShort,
      duplicateDescriptions: report.duplicateDescriptions,
      totalTools: report.totalTools,
      updatedAt: report.scannedAt,
      note: 'ADR-112 baseline — monotone decreasing for all three counts',
    }, null, 2) + '\n',
  );
  console.log(`\nBaseline updated: noGuidance=${report.withoutGuidance}, tooShort=${report.tooShort}, duplicates=${report.duplicateDescriptions}.`);
  process.exit(0);
}

let failed = false;
function check(label, actual, baselineValue, offendersFmt) {
  if (baselineValue === undefined) return;
  if (actual > baselineValue) {
    console.error(`\nFAIL ${label}: count ${actual} exceeds baseline ${baselineValue}`);
    console.error(`  Regression: ${actual - baselineValue} new violation(s)`);
    if (offendersFmt) console.error(offendersFmt);
    failed = true;
  } else if (actual < baselineValue) {
    console.log(`\nProgress ${label}: ${baselineValue - actual} improvement(s) — run with --update-baseline to lock the new floor.`);
  }
}

check('no-guidance', report.withoutGuidance, baseline.withoutGuidance,
  '  Add "Use when … is wrong because …" guidance per ADR-112 template.');
check('too-short', report.tooShort, baseline.tooShort,
  `  Top short offenders:\n    ${report.shortOffenders.slice(0, 5).map(o => `${o.name} (${o.length} chars)`).join('\n    ')}`);
check('duplicate-descriptions', report.duplicateDescriptions, baseline.duplicateDescriptions,
  `  Top duplicate groups:\n    ${report.duplicateGroups.slice(0, 5).map(g => `[x${g.count}] ${g.description}`).join('\n    ')}`);

if (failed) process.exit(1);
console.log(`\nOK — ${report.totalTools} tools, ${report.withGuidance} with guidance, all gates pass.`);
