#!/usr/bin/env node
/**
 * Hook-handler prompt-resolution audit — regression guard for #1944.
 *
 * Claude Code sends `pre-bash`/`pre-edit`/etc. hooks a JSON payload like
 * `{"tool_input":{"command":"ls"},"tool_name":"Bash"}` on stdin. The hook
 * handler in `helpers/hook-handler.cjs` (and its template in
 * `helpers-generator.ts`) builds a single `prompt` string from a fallback
 * chain. If it falls back to the **object** form — `hookInput.toolInput`
 * or the locally-normalised `toolInput` — instead of `.command`, the prompt
 * gets bound to an object and the very next call (`.toLowerCase()`,
 * `.substring()`) throws on every Bash tool call.
 *
 * The fix is to fall back to `toolInput.command` (the actual string). This
 * guard fails CI if the regression returns: any line that contains
 * `|| <something>toolInput` (with no `.` after `toolInput`) inside a hook
 * handler / generator source.
 *
 * Usage:
 *   node scripts/audit-hook-handler-prompt.mjs          # exit 1 on any hit
 *   node scripts/audit-hook-handler-prompt.mjs --json   # machine-readable report
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const JSON_OUT = process.argv.includes('--json');

// Files we audit. The deployed/tracked `.cjs` files + the TS template that
// generates them at `ruflo init` time.
const TARGETS = [
  'v3/@claude-flow/cli/.claude/helpers/hook-handler.cjs',
  '.claude/helpers/hook-handler.cjs',
  'v3/@claude-flow/cli/src/init/helpers-generator.ts',
];

// `||` followed by an identifier ending in `toolInput`, NOT followed by `.`
// (i.e. the object form, not the safe `toolInput.command` form). Catches:
//   - `|| toolInput`                 (post-normalisation local form)
//   - `|| hookInput.toolInput`       (raw stdin form)
//   - `|| (anything).toolInput`      (defensively)
// Also catches `|| toolInput\s|$` to cover the multi-line wrap from the
// reporter's repro (`|| toolInput\n   || process.env.PROMPT`).
const BAD = /\|\|\s*([A-Za-z_$][\w$]*\.)?toolInput\b(?!\.[A-Za-z_$])/g;

const offenders = [];
for (const rel of TARGETS) {
  const p = join(REPO_ROOT, rel);
  let src;
  try {
    statSync(p);
    src = readFileSync(p, 'utf8');
  } catch {
    // Missing files are fine — they may not exist in every checkout.
    continue;
  }
  let m;
  BAD.lastIndex = 0;
  while ((m = BAD.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length;
    const lineText = src.split('\n')[line - 1]?.trim() ?? '';
    offenders.push({ file: rel, line, match: m[0], context: lineText });
  }
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ offenders }, null, 2) + '\n');
  process.exit(offenders.length === 0 ? 0 : 1);
}

console.log(`hook-handler prompt-resolution audit — guard for #1944`);
console.log(`  scanned ${TARGETS.length} target(s)`);

if (offenders.length === 0) {
  console.log(`  ✓ no `+`'|| <…>toolInput' (object) fallbacks found`);
  process.exit(0);
}

console.error(`\n  ✗ ${offenders.length} offending fallback(s) — #1944 regression:`);
for (const o of offenders) {
  console.error(`    ${o.file}:${o.line}`);
  console.error(`      match:   ${o.match}`);
  console.error(`      context: ${o.context}`);
}
console.error('\n  Fix: replace `|| <…>toolInput` with `|| <…>toolInput.command` (or pull `.command` off whichever stdin shape Claude Code sent — `tool_input.command` / `toolInput.command`).');
process.exit(1);
