#!/usr/bin/env node
/**
 * Query the witness temporal history (ADR-103).
 *
 * Usage:
 *   node history.mjs --history <path> <command> [--id <fixId>] [--json]
 *
 * Commands:
 *   summary       Latest snapshot vs. previous (transitions in/out of pass).
 *   regressions   For each currently-regressed fix, show the commit
 *                 that introduced the regression (last pass → first fail).
 *   timeline      Status timeline for a single fix (--id required).
 *   list          Show all snapshots (commit, issuedAt, summary).
 *
 * Options:
 *   --history <path>  JSONL history file (defaults to ./verification-history.jsonl).
 *   --id <fixId>      Fix id (e.g. F1, #1867) — required for `timeline`.
 *   --json            Machine-readable output.
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadHistory, findRegressionIntroductions, fixTimeline, diffLatest } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const historyPath = resolve(args.history ?? 'verification-history.jsonl');
const asJson = !!args.json;

if (!cmd || args.help) {
  console.error('Usage: history.mjs --history <path> <summary|regressions|timeline|list> [--id X] [--json]');
  process.exit(args.help ? 0 : 2);
}

if (!existsSync(historyPath)) {
  if (asJson) console.log(JSON.stringify({ ok: false, error: `history file not found: ${historyPath}` }));
  else console.error(`history file not found: ${historyPath}`);
  process.exit(1);
}

const history = loadHistory(historyPath);

if (cmd === 'list') {
  if (asJson) {
    console.log(JSON.stringify(history.map(e => ({ commit: e.commit, issuedAt: e.issuedAt, summary: e.summary })), null, 2));
  } else {
    for (const e of history) {
      const s = e.summary;
      console.log(`${e.issuedAt}  ${e.commit.slice(0,12)}  total=${s.totalFixes} verified=${s.verified} missing=${s.missing}`);
    }
  }
  process.exit(0);
}

if (cmd === 'summary') {
  const d = diffLatest(history);
  const out = { entries: history.length, ...d };
  if (asJson) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`history entries: ${history.length}`);
    console.log(`newly regressed: ${d.newlyRegressed.length ? d.newlyRegressed.join(', ') : '(none)'}`);
    console.log(`newly passing:   ${d.newlyPassing.length ? d.newlyPassing.join(', ') : '(none)'}`);
    console.log(`fixes added:     ${d.added.length ? d.added.join(', ') : '(none)'}`);
    console.log(`fixes removed:   ${d.removed.length ? d.removed.join(', ') : '(none)'}`);
  }
  process.exit(d.newlyRegressed.length > 0 ? 1 : 0);
}

if (cmd === 'regressions') {
  const r = findRegressionIntroductions(history);
  if (asJson) console.log(JSON.stringify(r, null, 2));
  else if (r.length === 0) console.log('no regressed fixes in latest snapshot');
  else for (const x of r) {
    console.log(`${x.id}`);
    console.log(`  last pass:    ${x.lastPassCommit?.slice(0,12) ?? '(never)'}  ${x.lastPassIssuedAt ?? ''}`);
    console.log(`  regressed at: ${x.regressedAtCommit.slice(0,12)}  ${x.regressedAtIssuedAt}`);
  }
  process.exit(r.length > 0 ? 1 : 0);
}

if (cmd === 'timeline') {
  if (!args.id) { console.error('--id <fixId> is required for timeline'); process.exit(2); }
  const t = fixTimeline(history, args.id);
  if (asJson) console.log(JSON.stringify(t, null, 2));
  else for (const e of t) console.log(`${e.issuedAt}  ${e.commit.slice(0,12)}  ${e.status}`);
  process.exit(0);
}

console.error(`unknown command: ${cmd}`);
process.exit(2);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--help') { out[a.slice(2)] = true; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else { out[key] = true; }
    } else { out._.push(a); }
  }
  return out;
}
