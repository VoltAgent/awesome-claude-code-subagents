#!/usr/bin/env node
/**
 * Regression guard for ruvnet/ruflo#1867.
 *
 * Reproduces the user-visible failure mode of "native better-sqlite3 build failed"
 * (e.g. `npm install` on Node 26 without prebuilds) by installing this package
 * with `--omit=optional` and asserting:
 *
 *   1. The package loads without `better-sqlite3` resolvable
 *   2. `createDatabase('auto')` selects a working fallback backend
 *   3. Round-trip store/get works on the fallback
 *   4. Direct `SQLiteBackend.initialize()` throws a clean error (not MODULE_NOT_FOUND)
 *
 * Run via the smoke-install-no-bsqlite CI job — see .github/workflows/v3-ci.yml.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'memory-smoke-'));
const dbPath = join(tmp, 'smoke.db');

let exitCode = 0;
const fail = (msg) => { console.error(`FAIL: ${msg}`); exitCode = 1; };
const pass = (msg) => console.log(`ok: ${msg}`);

try {
  // 1. Package loads without better-sqlite3 resolvable
  const mod = await import('@claude-flow/memory');
  pass('package import without better-sqlite3');

  // Sanity: the optional dep should NOT be resolvable in this env
  let bsqlitePresent = false;
  try { await import('better-sqlite3'); bsqlitePresent = true; } catch { /* expected */ }
  if (bsqlitePresent) {
    fail('better-sqlite3 unexpectedly resolvable — smoke test setup is wrong, not testing the regression');
    process.exit(1);
  }
  pass('better-sqlite3 absent (regression scenario active)');

  // 2. createDatabase('auto') selects a fallback (rvf or sql.js)
  const db = await mod.createDatabase(dbPath, { provider: 'auto' });
  await db.initialize?.();
  pass('createDatabase(auto) + initialize succeeded');

  // 3. Round-trip
  const ts = Date.now();
  await db.store({
    id: 'smoke-1', key: 'k', content: 'v', type: 'episodic', namespace: 'default',
    tags: [], metadata: {}, accessLevel: 'private',
    createdAt: ts, updatedAt: ts, version: 1, references: [], accessCount: 0, lastAccessedAt: ts,
  });
  const got = await db.get('smoke-1');
  if (got?.content !== 'v') fail(`round-trip: expected content "v", got "${got?.content}"`);
  else pass('round-trip store/get on fallback');

  await db.shutdown?.();

  // 4. Direct SQLiteBackend should throw a clean, actionable error
  try {
    const sqlite = new mod.SQLiteBackend({ databasePath: ':memory:' });
    await sqlite.initialize();
    fail('SQLiteBackend.initialize() unexpectedly succeeded without better-sqlite3');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("'better-sqlite3'") && msg.toLowerCase().includes('optional')) {
      pass('SQLiteBackend throws clean actionable error');
    } else {
      fail(`SQLiteBackend error message not actionable: ${msg}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

process.exit(exitCode);
