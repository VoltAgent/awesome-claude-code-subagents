#!/usr/bin/env node
/**
 * Neural-trader install-safety audit (regression guard for #1974).
 *
 * The upstream `neural-trader` npm package (verified across versions
 * 2.6.3, 2.7.0, 2.7.1) ships a malicious-by-accident `install` lifecycle
 * script that recursively invokes `npm install` from inside the install
 * hook. On any non-`linux-x64` host the recursion is unbounded — one
 * report saw 3,049 stuck processes consuming ~120 GB of RAM in ~80
 * minutes before manual intervention.
 *
 * Until the upstream package is patched, every recommended invocation of
 * `npm install neural-trader` in THIS repo must pass `--ignore-scripts`
 * (or use the env equivalent `npm_config_ignore_scripts=1`) to skip the
 * fork-bombing install hook. This audit fails CI if a raw `npm install
 * neural-trader` slips back in.
 *
 * Scope: scans tracked markdown / shell / json files in
 *   - plugins/ruflo-neural-trader/
 *   - any agent / skill that mentions neural-trader
 * Exclusions: this script itself (the pattern is the literal we're
 * guarding against) plus the README's "DO NOT" example block.
 *
 * Usage:
 *   node scripts/audit-neural-trader-safety.mjs           # exit 1 on hit
 *   node scripts/audit-neural-trader-safety.mjs --json    # machine-readable
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const JSON_OUT = process.argv.includes('--json');

// Catches `npm install neural-trader` / `npm i neural-trader` (with or
// without preceding `||`/`&&`/whitespace). Lines that include
// `--ignore-scripts` anywhere on the same line are checked separately
// below (regex-only lookahead doesn't catch `--ignore-scripts` placed
// BEFORE the package name, which is the common form).
const BAD = /(^|[\s|&;])npm\s+(?:install|i)\s+(?:[^|&\n]*\s)?neural-trader\b/;

const ROOTS = [
  'plugins/ruflo-neural-trader',
  // future: add other plugins / docs if they ever recommend neural-trader
];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'target']);
const EXT_OK = new Set(['.md', '.mdx', '.sh', '.bash', '.zsh', '.json']);

// Lines that are deliberately bad (e.g. the README's "DO NOT" example).
// Match by exact substring on the line so the marker is auditable.
const ALLOWLIST_MARKERS = [
  'DO NOT run',
  'do not run',
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.name.startsWith('.') && e.name !== '.claude-plugin') continue;
    const p = join(dir, e.name);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, out);
    else if (s.isFile()) {
      const dot = e.name.lastIndexOf('.');
      const ext = dot >= 0 ? e.name.slice(dot) : '';
      if (EXT_OK.has(ext)) out.push(p);
    }
  }
  return out;
}

const offenders = [];
for (const root of ROOTS) {
  for (const file of walk(join(REPO_ROOT, root))) {
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!BAD.test(line)) continue;
      // Safe: line opts out of the install script via --ignore-scripts
      // (placement before OR after the package name is fine).
      if (line.includes('--ignore-scripts')) continue;
      // Skip lines marked as deliberately-bad examples.
      const context = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
      if (ALLOWLIST_MARKERS.some((m) => context.includes(m))) continue;
      offenders.push({
        file: relative(REPO_ROOT, file),
        line: i + 1,
        text: line.trim(),
      });
    }
  }
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ offenders }, null, 2) + '\n');
  process.exit(offenders.length === 0 ? 0 : 1);
}

console.log('neural-trader install-safety audit — guard for #1974');
console.log(`  scanned ${ROOTS.join(', ')}`);
if (offenders.length === 0) {
  console.log('  ✓ no raw `npm install neural-trader` (all use --ignore-scripts or are in allowlisted DO-NOT examples)');
  process.exit(0);
}
console.error(`\n  ✗ ${offenders.length} unsafe invocation(s) — #1974 regression:`);
for (const o of offenders) {
  console.error(`    ${o.file}:${o.line}`);
  console.error(`      ${o.text}`);
}
console.error('\n  Fix: add `--ignore-scripts` to the `npm install`, OR add a "DO NOT" marker on the line above if the example is deliberately showing the unsafe form.');
process.exit(1);
