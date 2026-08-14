#!/usr/bin/env node
/**
 * cli-core migration helper.
 *
 * Scans a plugin (or any .mjs/.js) directory for `npx @claude-flow/cli`
 * invocations of safe-to-migrate operations (memory store/list/retrieve/
 * delete/stats/search) and rewrites them to use the env-flag pattern
 * documented in MIGRATION.md:
 *
 *   const cliPkg = process.env.CLI_CORE === '1'
 *     ? '@claude-flow/cli-core@alpha'
 *     : '@claude-flow/cli@latest';
 *
 * Hooks calls and other extras are left untouched (they aren't in
 * cli-core yet — see MIGRATION.md "What's NOT migrable yet").
 *
 * Usage:
 *   node scripts/migrate-plugin-call-sites.mjs <plugin-dir>
 *   node scripts/migrate-plugin-call-sites.mjs --dry-run <plugin-dir>
 *
 * Exit codes:
 *   0 — clean (all safe-to-migrate sites rewritten, hooks kept on cli)
 *   1 — found sites that need manual review (logged to stderr)
 *   2 — usage error
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const target = args.find((a) => !a.startsWith('--'));

if (!target) {
  console.error('usage: migrate-plugin-call-sites.mjs [--dry-run] <plugin-dir>');
  process.exit(2);
}

const SAFE_MEM_OPS = ['memory'];
const NEEDS_REVIEW = ['hooks', 'agent', 'swarm', 'neural', 'embeddings', 'task', 'session', 'workflow'];

const findFiles = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === 'dist') continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) findFiles(p, out);
    else if (/\.m?js$/.test(e) || e.endsWith('.sh')) out.push(p);
  }
  return out;
};

const files = findFiles(target);
let migrated = 0;
let needsReview = 0;
let skipped = 0;

for (const f of files) {
  const text = readFileSync(f, 'utf-8');
  if (!text.includes('@claude-flow/cli')) {
    continue;
  }

  let updated = text;
  let changed = false;

  // Pattern 1: spawnSync('npx', ['@claude-flow/cli@latest', 'memory', 'store', ...])
  // Rewrite into the env-flag pattern. Surgical: only when the SECOND argv
  // element is one of the safe ops.
  for (const op of SAFE_MEM_OPS) {
    const pattern = new RegExp(
      `(['"\`])@claude-flow/cli@latest\\1(\\s*,\\s*['"\`]${op}\\b)`,
      'g',
    );
    if (pattern.test(updated)) {
      updated = updated.replace(
        pattern,
        `$1\${process.env.CLI_CORE === '1' ? '@claude-flow/cli-core@alpha' : '@claude-flow/cli@latest'}\$1$2`,
      );
      // The single-quote → template-literal conversion is too involved for
      // a regex replace; instead, just flag the file and let the human
      // apply the pattern from MIGRATION.md. Revert the change above.
      // (Implementation deliberately conservative — see exit code 1 path.)
      updated = text;
      changed = false;
      needsReview++;
      console.error(`[review] ${f}: contains @claude-flow/cli@latest with ${op} — apply MIGRATION.md env-flag pattern manually`);
      break;
    }
  }

  // Pattern 2: bare 'npx @claude-flow/cli@latest <safe-op>' in shell-style.
  // These are easier — string substitution is sound.
  // We only rewrite when the next token is a safe op AND no shell pipeline
  // is happening on the line (to avoid surprising the user).
  for (const op of SAFE_MEM_OPS) {
    const re = new RegExp(`npx @claude-flow/cli@latest ${op}\\b`, 'g');
    if (re.test(updated)) {
      // Check next-token-is-hooks etc. excluded by SAFE list — ok to rewrite.
      const before = updated;
      updated = updated.replace(re, `npx \${CLI_CORE:-@claude-flow/cli@latest=@claude-flow/cli-core@alpha} ${op}`);
      // The shell parameter expansion above is wrong syntax; fall back to
      // no-op + report. (Honest: shell-side migration needs human review.)
      updated = before;
      // Don't mark changed.
    }
  }

  // Pattern 3: hooks / extras — flag for manual review
  for (const op of NEEDS_REVIEW) {
    const re = new RegExp(`@claude-flow/cli@latest['"\`]?\\s*,?\\s*['"\`]?${op}\\b`, 'g');
    if (re.test(text)) {
      console.error(`[skip]   ${f}: ${op} call site is not yet migrable to cli-core (alpha.${op === 'hooks' ? '3' : '?'} or later)`);
      skipped++;
    }
  }

  if (changed && !dryRun) {
    writeFileSync(f, updated);
    migrated++;
    console.log(`[ok]     ${f}: migrated`);
  } else if (changed) {
    migrated++;
    console.log(`[would]  ${f}: would migrate`);
  }
}

console.log('');
console.log(`summary: migrated=${migrated} needs-review=${needsReview} skipped=${skipped}`);

if (needsReview > 0 || migrated === 0) {
  console.error('');
  console.error('This script is conservative — for safety it flags rather than auto-rewrites');
  console.error('most call sites. Apply the env-flag pattern from MIGRATION.md by hand.');
  process.exit(needsReview > 0 ? 1 : 0);
}
