#!/usr/bin/env node
/**
 * Regression guard for ruvnet/ruflo#1874.
 *
 * Static dist scan: assert the MCP server packages emit a spec-compliant
 * `YYYY-MM-DD` string for `protocolVersion`, never the previous
 * `{major,minor,patch}` object form. This catches the regression class
 * without needing to actually boot the HTTP server (which has its own
 * separate plumbing issues — bin/cli.js auto-detects MCP-stdio mode for
 * any `mcp start *` invocation when stdin isn't a TTY, and the
 * in-process HTTP server doesn't keep the process alive after start).
 *
 * Combined with:
 *   - witness markers (#1874-mcp, #1874-shared) — manifest attests the
 *     spec strings are present
 *   - corrected unit test in mcp.test.ts — uses the spec string form
 *
 * This three-way coverage catches the bug class.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(process.argv[2] ?? process.cwd());
const TARGETS = [
  'v3/@claude-flow/mcp/dist/server.js',
  'v3/@claude-flow/shared/dist/mcp/server.js',
];

const SPEC_DATE_REGEX = /^['"]\d{4}-\d{2}-\d{2}['"]$/;
const BAD_OBJECT_REGEX = /protocolVersion\s*=\s*\{\s*major:/;

let failed = 0;
const fail = (m) => { console.error(`FAIL: ${m}`); failed++; };
const pass = (m) => console.log(`ok: ${m}`);

for (const target of TARGETS) {
  const path = resolve(REPO_ROOT, target);
  if (!existsSync(path)) {
    fail(`${target} not found — build the package first`);
    continue;
  }
  const src = readFileSync(path, 'utf8');

  // Reject the buggy object form
  if (BAD_OBJECT_REGEX.test(src)) {
    fail(`${target} contains protocolVersion = {major,...} object (#1874 regression)`);
    continue;
  }

  // Find the protocolVersion assignment and assert it's a date string
  const match = src.match(/protocolVersion\s*=\s*(['"][^'"]*['"]|\{[^}]+\}|[^;,\n]+)/);
  if (!match) {
    fail(`${target} has no protocolVersion assignment — schema changed?`);
    continue;
  }
  const value = match[1].trim();
  if (!SPEC_DATE_REGEX.test(value)) {
    fail(`${target} protocolVersion = ${value} is not a YYYY-MM-DD spec string`);
    continue;
  }
  pass(`${target}: protocolVersion = ${value}`);
}

console.log(failed === 0 ? '\nMCP protocol-shape compliance ✓' : `\n${failed} compliance failure(s) ✗`);
process.exit(failed > 0 ? 1 : 0);
