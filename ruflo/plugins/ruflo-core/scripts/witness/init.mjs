#!/usr/bin/env node
/**
 * Bootstrap a witness manifest in any project (ADR-103).
 *
 * Creates an empty `verification.md.json` and `verification-history.jsonl`
 * at the project root, plus a stub `witness-fixes.json` template that
 * users edit to register their own fix entries.
 *
 * Usage:
 *   node init.mjs [--root <path>]
 */

import { writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const root = resolve(args.root ?? process.cwd());

const manifestPath = join(root, 'verification.md.json');
const historyPath = join(root, 'verification-history.jsonl');
const fixesTemplate = join(root, 'witness-fixes.json');

if (existsSync(manifestPath) && !args.force) {
  console.error(`refusing to overwrite ${manifestPath} — pass --force to recreate`);
  process.exit(1);
}

const emptyWitness = {
  manifest: {
    schema: 'ruflo-witness/v1',
    issuedAt: new Date().toISOString(),
    gitCommit: '',
    branch: '',
    releases: {},
    summary: { totalFixes: 0, verified: 0, missing: 0 },
    fixes: [],
  },
  integrity: {
    manifestHashAlgo: 'sha256',
    manifestHash: '',
    signatureAlgo: 'ed25519',
    publicKey: '',
    signature: '',
    seedDerivation: "sha256(gitCommit + ':ruflo-witness/v1')",
  },
};

writeFileSync(manifestPath, JSON.stringify(emptyWitness, null, 2));
writeFileSync(historyPath, '');
writeFileSync(fixesTemplate, JSON.stringify({
  fixes: [
    {
      id: 'EXAMPLE-1',
      desc: 'Replace this with your fix description',
      file: 'src/path/to/fixed-file.ts',
      marker: 'distinctive substring proving the fix is in the file',
    },
  ],
}, null, 2));

console.log(`created:`);
console.log(`  ${manifestPath}`);
console.log(`  ${historyPath}`);
console.log(`  ${fixesTemplate}     (edit then re-run regen)`);
console.log(``);
console.log(`next: install @noble/ed25519, edit witness-fixes.json, then:`);
console.log(`  node /path/to/regen.mjs --manifest verification.md.json \\`);
console.log(`                          --history verification-history.jsonl \\`);
console.log(`                          --fixes witness-fixes.json`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else { out[key] = true; }
    }
  }
  return out;
}
