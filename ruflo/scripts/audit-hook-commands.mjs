#!/usr/bin/env node
/**
 * Hook-command install-safety audit — regression guard for #1921 (and #1147).
 *
 * Hooks fire on EVERY PreToolUse / PostToolUse / Stop / etc. A hook `command`
 * that does a bare `npx <pkg>@alpha …` re-resolves the dist-tag and re-installs
 * from cold cache on every fire; when that install crashes (e.g. an arborist
 * `Invalid Version` on npm 10.8.x) the user sees a hook error in Claude Code
 * after every turn. The fix: invoke `scripts/ruflo-hook.sh` (prefers a locally-
 * installed `ruflo`/`claude-flow` binary, falls back to `npx --prefer-offline`,
 * always exits 0). This guard fails CI if any hook `command` regresses.
 *
 * Rules, per hook `command` string:
 *   1. If it invokes `npx`, it MUST also pass `--prefer-offline`.
 *   2. If it invokes `npx` or `scripts/ruflo-hook.sh`, it MUST be non-fatal:
 *      end with `|| true` / `|| exit 0`, or the hook entry must set
 *      `continueOnError: true`.
 *
 * Usage:
 *   node scripts/audit-hook-commands.mjs           # exit 1 on any violation
 *   node scripts/audit-hook-commands.mjs --json    # machine-readable report
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const JSON_OUT = process.argv.includes('--json');

function findHooksFiles(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) findHooksFiles(p, out);
    else if (e.isFile() && /[\\/]hooks[\\/]hooks\.json$/.test(p)) out.push(p);
  }
  return out;
}

function collectCommands(hooksJson) {
  const out = [];
  const root = hooksJson && hooksJson.hooks;
  if (!root || typeof root !== 'object') return out;
  for (const [event, entries] of Object.entries(root)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const matcher = entry && entry.matcher;
      const list = entry && Array.isArray(entry.hooks) ? entry.hooks : [];
      for (let idx = 0; idx < list.length; idx++) {
        const h = list[idx];
        if (h && h.type === 'command' && typeof h.command === 'string') {
          out.push({ event, matcher, idx, command: h.command, continueOnError: h.continueOnError === true });
        }
      }
    }
  }
  return out;
}

const NPX_RE = /(^|[\s;&|(])npx\b/;
const PREFER_OFFLINE_RE = /--prefer-offline\b/;
const SHIM_RE = /ruflo-hook\.sh/;
const NONFATAL_RE = /\|\|\s*(true|exit\s+0)\b/;

const files = findHooksFiles(REPO_ROOT);
const violations = [];

for (const file of files) {
  const rel = relative(REPO_ROOT, file);
  let parsed;
  try { parsed = JSON.parse(readFileSync(file, 'utf-8')); }
  catch (e) { violations.push({ file: rel, where: rel, reason: `invalid JSON: ${e.message}` }); continue; }

  for (const { event, matcher, idx, command, continueOnError } of collectCommands(parsed)) {
    const where = `${rel} :: ${event}${matcher ? ` [${matcher}]` : ''} #${idx}`;
    const usesNpx = NPX_RE.test(command);
    const usesShim = SHIM_RE.test(command);

    if (usesNpx && !PREFER_OFFLINE_RE.test(command)) {
      violations.push({
        file: rel, where,
        reason: 'invokes `npx` without `--prefer-offline` — re-resolves the dist-tag and re-installs from cold cache on every hook fire (#1921). Use scripts/ruflo-hook.sh, or add `--prefer-offline`.',
        command,
      });
      continue;
    }
    if ((usesNpx || usesShim) && !NONFATAL_RE.test(command) && !continueOnError) {
      violations.push({
        file: rel, where,
        reason: 'invokes the CLI but is not non-fatal — a CLI/install failure surfaces a hook error in Claude Code (#1921). Append `|| true` (or set `continueOnError: true`).',
        command,
      });
    }
  }
}

const report = { scannedFiles: files.length, violationCount: violations.length, violations };

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`hook-command audit — scanned ${files.length} hooks.json file(s)`);
  if (violations.length === 0) {
    console.log('  ✓ no install-safety violations');
  } else {
    for (const v of violations) {
      console.log(`  ✗ ${v.where}`);
      console.log(`    ${v.reason}`);
      if (v.command) console.log(`    command: ${v.command.length > 200 ? v.command.slice(0, 200) + '…' : v.command}`);
    }
    console.log(`\n${violations.length} violation(s)`);
  }
}

process.exit(violations.length > 0 ? 1 : 0);
