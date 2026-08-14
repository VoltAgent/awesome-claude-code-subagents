#!/usr/bin/env node
/**
 * Extend verification.md.json with per-source-file witnesses for every
 * MCP tool group in verification-inventory.json (task #25).
 *
 * Today the manifest carries 27 *fix* witnesses (regression-flavored).
 * This script adds *capability* witnesses — one entry per source file
 * that defines MCP tools — so `ruflo verify` can confirm the entire
 * 300-tool surface byte-for-byte against its dist counterpart.
 *
 * ID convention: `CAP-MCP-<src-basename-without-ext>`. Stable across
 * regens so runs are idempotent.
 *
 * Marker: the first tool name (alphabetical) defined in that source
 * file. If `ruflo verify` finds the marker missing in the cited dist
 * file, that tool was renamed/removed — a real regression signal.
 *
 * Run order:
 *   1. node scripts/inventory-capabilities.mjs --json > verification-inventory.json
 *   2. npm run build (in v3/@claude-flow/cli)
 *   3. node scripts/sign-witness-from-inventory.mjs
 *   4. node scripts/regenerate-witness.mjs  (re-hashes + re-signs)
 *
 * Step 3 only mutates `fixes[]` — step 4 picks up the changes and
 * re-derives all hashes + signatures.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = (() => {
  let dir = fileURLToPath(new URL('.', import.meta.url));
  while (dir !== '/') {
    if (existsSync(join(dir, 'verification.md'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('project root not found');
})();

const INVENTORY = JSON.parse(readFileSync(join(ROOT, 'verification-inventory.json'), 'utf-8'));
const WITNESS_PATH = join(ROOT, 'verification.md.json');
const witness = JSON.parse(readFileSync(WITNESS_PATH, 'utf-8'));
const m = witness.manifest;

// Map src/mcp-tools/foo.ts → dist/src/mcp-tools/foo.js
function srcToDist(srcPath) {
  return srcPath
    .replace('/src/', '/dist/src/')
    .replace(/\.ts$/, '.js');
}

// Group MCP tools by source file (sorted by file path; tools sorted alpha)
const byFile = new Map();
for (const tool of INVENTORY.mcp) {
  if (!byFile.has(tool.sourceFile)) byFile.set(tool.sourceFile, []);
  byFile.get(tool.sourceFile).push(tool.name);
}
for (const list of byFile.values()) list.sort();

// Build candidate fix entries
const candidates = [];
let skipped = 0;
for (const [srcFile, tools] of [...byFile.entries()].sort()) {
  const distFile = srcToDist(srcFile);
  const distAbs = join(ROOT, distFile);
  if (!existsSync(distAbs)) {
    console.warn(`[skip] no dist for ${srcFile} (looked at ${distFile})`);
    skipped++;
    continue;
  }
  const baseName = basename(srcFile, '.ts');
  const id = `CAP-MCP-${baseName}`;
  // Marker: first tool name alphabetically. The dist must literally contain
  // this string for the witness to verify — protects against the file
  // existing but no longer defining the tool.
  const marker = tools[0];
  const desc = tools.length === 1
    ? `MCP tool: ${tools[0]}`
    : `MCP tools (${tools.length}): ${tools.slice(0, 3).join(', ')}${tools.length > 3 ? ', …' : ''}`;
  candidates.push({
    id,
    desc,
    file: distFile,
    // sha256 + markerVerified are computed by regenerate-witness.mjs
    // when it walks the manifest; we just plant placeholders here.
    sha256: '',
    marker,
    markerVerified: false,
    _capabilityCount: tools.length,
  });
}

// Merge: keep existing fixes that aren't in the CAP-MCP namespace.
// Replace any pre-existing CAP-MCP-* entries so re-runs are idempotent.
const preserved = m.fixes.filter(f => !f.id.startsWith('CAP-MCP-'));
const merged = [...preserved, ...candidates.map(({ _capabilityCount: _, ...c }) => c)];
m.fixes = merged;
m.summary = {
  totalFixes: merged.length,
  verified: 0, // regenerate-witness.mjs recomputes
  failed: 0,
};

writeFileSync(WITNESS_PATH, JSON.stringify(witness, null, 2) + '\n', 'utf-8');

console.log(`Inventory-driven witnesses planted in ${WITNESS_PATH}`);
console.log(`  preserved fix entries: ${preserved.length}`);
console.log(`  CAP-MCP entries added: ${candidates.length} (${INVENTORY.mcp.length} tools across ${byFile.size} source files)`);
console.log(`  skipped (no dist):     ${skipped}`);
console.log(`  total fixes now:       ${merged.length}`);
console.log();
console.log(`Next: run \`node scripts/regenerate-witness.mjs\` to hash + sign.`);
