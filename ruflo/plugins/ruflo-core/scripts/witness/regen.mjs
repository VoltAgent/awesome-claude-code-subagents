#!/usr/bin/env node
/**
 * Regenerate a signed witness manifest with temporal history (ADR-103).
 *
 * Project-agnostic CLI wrapper around `lib.mjs`. Works in any repo that
 * has @noble/ed25519 installed somewhere (this script probes common roots).
 *
 * Usage:
 *   node regen.mjs --manifest <path> [--history <path>] [--fixes <json>] [--dry-run]
 *
 * Options:
 *   --manifest <path>   Where to write the signed manifest (verification.md.json).
 *   --history  <path>   JSONL history file to append a snapshot (omit to skip).
 *   --fixes    <path>   JSON file with NEW_FIXES to register on this regen.
 *                       Format: { "fixes": [ { "id", "desc", "file", "marker" }, ... ] }
 *   --releases <path>   Optional JSON file mapping pkg → version for the manifest.
 *   --root     <path>   Project root (defaults to cwd).
 *   --dry-run           Print summary without writing.
 *
 * Examples:
 *   # Refresh existing manifest (no new fixes)
 *   node regen.mjs --manifest verification.md.json --history verification-history.jsonl
 *
 *   # Add new fixes from a config file
 *   node regen.mjs --manifest verification.md.json --history verification-history.jsonl \
 *                  --fixes new-fixes.json --releases releases.json
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { regenerate, appendHistory } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.manifest) {
  console.error('Error: --manifest <path> is required');
  console.error('Run with --help for usage.');
  process.exit(2);
}
if (args.help) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith(' *')).map(l => l.slice(3)).join('\n'));
  process.exit(0);
}

const repoRoot = resolve(args.root ?? process.cwd());
const manifestPath = resolve(args.manifest);
const historyPath = args.history ? resolve(args.history) : null;

const newFixes = args.fixes
  ? JSON.parse(readFileSync(resolve(args.fixes), 'utf8')).fixes ?? []
  : [];

const releases = args.releases
  ? JSON.parse(readFileSync(resolve(args.releases), 'utf8'))
  : {};

const result = regenerate({
  repoRoot,
  manifestPath,
  newFixes,
  releases,
  ed25519Roots: [repoRoot, resolve(repoRoot, 'v3')],
});

console.log(`witness regen summary\n─────────────────────`);
console.log(result.summary);

if (args['dry-run']) {
  console.log('\n(dry-run — manifest NOT written)');
  process.exit(0);
}

writeFileSync(manifestPath, JSON.stringify(result.witness, null, 2));
console.log(`\nwritten: ${manifestPath}`);

if (historyPath) {
  appendHistory(historyPath, result.witness.manifest, result.manifestHash);
  console.log(`appended: ${historyPath}`);
}

// ─── tiny arg parser (no deps) ────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '--help') { out[a.slice(2)] = true; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else { out[key] = true; }
    }
  }
  return out;
}
