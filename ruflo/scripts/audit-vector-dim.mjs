#!/usr/bin/env node
/**
 * Vector-index dimension audit (regression guard for #1947 / #1942 / #1952).
 *
 * Issue #1947 root cause: the bundled SQL schema initialises the `default` and
 * `patterns` rows in `vector_indexes` with `dimensions = 768`, but the
 * default ONNX embedding model (`Xenova/all-MiniLM-L6-v2`) produces 384-dim
 * vectors. HNSW rejects every insert with the mismatched dim, so
 * `memory_store --vector` succeeds but `memory_search` always returns 0 hits.
 *
 * The fix is purely a number change in 11 `.swarm/schema.sql` files plus the
 * inline schema string in `v3/@claude-flow/cli/src/memory/memory-initializer.ts`.
 * This script blocks the next regression: every `INSERT ... INTO
 * vector_indexes (id, name, dimensions) VALUES ('default'|'patterns', ..., N)`
 * must have `N === EXPECTED_DIM` (currently 384 — track the default model).
 *
 * Anything caught here would silently break every "memory_search returns 0"
 * scenario in the bug cluster: #1947, #1942, #1952 (Windows), and the
 * downstream bridge-import issues that imported 384-dim vectors into 768-dim
 * indexes (#1941, #1940).
 *
 * Usage:
 *   node scripts/audit-vector-dim.mjs           # audit, exit 1 on mismatch
 *   node scripts/audit-vector-dim.mjs --json    # machine-readable report
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const EXPECTED_DIM = 384; // matches Xenova/all-MiniLM-L6-v2 default
const JSON_OUT = process.argv.includes('--json');

// Patterns that catch both the SQL files and the inline TS-string schema.
// We match a fairly loose form so the audit also catches reformatted
// variants (e.g. with extra whitespace, comments between fields).
const ROW_RE = /\(\s*'(default|patterns)'\s*,\s*'(?:default|patterns)'\s*,\s*(\d+)\s*\)/g;

// Roots to scan. Skip build outputs / vendor dirs.
const ROOTS = ['v3', 'ruflo'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'target',
  'coverage',
  '.swarm-data',
]);
const EXT_OK = new Set(['.sql', '.ts', '.js', '.mjs', '.cjs']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.swarm') continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(p, out);
    } else if (s.isFile()) {
      const dot = e.name.lastIndexOf('.');
      const ext = dot >= 0 ? e.name.slice(dot) : '';
      if (EXT_OK.has(ext)) out.push(p);
    }
  }
  return out;
}

const offenders = [];
const ok = [];

for (const root of ROOTS) {
  const start = join(REPO_ROOT, root);
  try {
    statSync(start);
  } catch {
    continue;
  }
  for (const file of walk(start)) {
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    let m;
    ROW_RE.lastIndex = 0;
    while ((m = ROW_RE.exec(src)) !== null) {
      const [, name, dimStr] = m;
      const dim = Number(dimStr);
      const rel = relative(REPO_ROOT, file);
      // Locate the line number for a useful error.
      const lineNo = src.slice(0, m.index).split('\n').length;
      if (dim !== EXPECTED_DIM) {
        offenders.push({ file: rel, line: lineNo, name, dim });
      } else {
        ok.push({ file: rel, line: lineNo, name, dim });
      }
    }
  }
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ expectedDim: EXPECTED_DIM, offenders, okCount: ok.length }, null, 2) + '\n');
  process.exit(offenders.length === 0 ? 0 : 1);
}

console.log(`vector-index dimension audit — expecting dimensions=${EXPECTED_DIM} (Xenova/all-MiniLM-L6-v2)`);
console.log(`  scanned ${ROOTS.join(', ')}, found ${ok.length + offenders.length} matching INSERT row(s)`);

if (offenders.length === 0) {
  console.log(`  ✓ all rows set dimensions=${EXPECTED_DIM}`);
  process.exit(0);
}

console.error(`\n  ✗ ${offenders.length} row(s) with wrong dim — #1947 regression:`);
for (const o of offenders) {
  console.error(`    ${o.file}:${o.line}  '${o.name}' row has dim=${o.dim}, expected ${EXPECTED_DIM}`);
}
console.error('\n  Fix: change the dim literal to ' + EXPECTED_DIM + ', or update EXPECTED_DIM in this script if the default embedding model has changed.');
process.exit(1);
