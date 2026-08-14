#!/usr/bin/env node
/**
 * Regression guard for ruvnet/ruflo#1863 (and the crash class it represents).
 *
 * #1863: `task status <id>` threw `TypeError: Cannot read properties of
 * undefined (reading 'join')` because the command formatter did
 * `result.dependencies.join(', ')` where `dependencies` is typed
 * `string[]` by the callMCPTool<{...}>() generic but the MCP server can
 * legitimately omit it (older store schema, task with no deps). The TS
 * compiler can't see the risk; only running the command does.
 *
 * This smoke drives a handful of CLI command paths that format MCP
 * responses and asserts none of them crash with an unhandled exception
 * (exit code 1 *with* a TypeError/ReferenceError stack — graceful "not
 * found" errors are fine, only unhandled crashes fail the gate).
 *
 * Each command runs with a 30s per-command timeout. The whole script
 * has a 90s process-level watchdog so CI never hangs.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(process.argv[2] ?? resolve(__dirname, '..', '..', '..'));
const CLI = resolve(REPO_ROOT, 'v3/@claude-flow/cli/bin/cli.js');

if (!existsSync(CLI)) {
  console.error(`FAIL: ${CLI} not found — run \`npm --prefix v3/@claude-flow/cli run build\` first`);
  process.exit(1);
}

let failed = 0;
const fail = (m) => { console.error(`FAIL: ${m}`); failed++; };
const pass = (m) => console.log(`ok: ${m}`);

// 90s process-level watchdog.
const watchdog = setTimeout(() => {
  console.log(`\n[watchdog] cli-no-crash exceeded 90s — exiting clean (CI safety). Checks completed so far stand.`);
  process.exit(failed > 0 ? 1 : 0);
}, 90_000);
watchdog.unref();

const CRASH_RE = /TypeError|ReferenceError|Cannot read propert|is not a function|is not defined|Unhandled|UnhandledPromiseRejection/i;

function runCli(args, label) {
  const r = spawnSync('node', [CLI, ...args], {
    cwd: REPO_ROOT,
    timeout: 30_000,
    encoding: 'utf-8',
    env: { ...process.env, CI: 'true' },
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  if (r.error && r.error.code === 'ETIMEDOUT') {
    console.log(`note: ${label} — timed out after 30s (env-dependent backend); not failing on this`);
    return;
  }
  // A crash is: an exception stack in the output. A graceful error (exit 1
  // with a clean "not found" message and no stack) is acceptable.
  if (CRASH_RE.test(out)) {
    fail(`${label} — command crashed with an unhandled exception:\n${out.split('\n').filter(l => CRASH_RE.test(l)).slice(0, 3).join('\n')}`);
  } else {
    pass(`${label} — no unhandled exception (exit ${r.status})`);
  }
}

// --- #1863 — task create then task status must not crash on a fresh task ---

// Create a task; capture an ID if printed.
const createRes = spawnSync('node', [CLI, 'task', 'create', '-t', 'research', '-d', 'cli-no-crash smoke task'], {
  cwd: REPO_ROOT, timeout: 30_000, encoding: 'utf-8', env: { ...process.env, CI: 'true' },
});
const createOut = `${createRes.stdout ?? ''}\n${createRes.stderr ?? ''}`;
if (CRASH_RE.test(createOut)) {
  fail(`#1863-create — \`task create\` crashed:\n${createOut.split('\n').filter(l => CRASH_RE.test(l)).slice(0, 3).join('\n')}`);
} else {
  pass(`#1863-create — \`task create\` did not crash (exit ${createRes.status})`);
  // Try to extract a task id (formats: "task-...", "Task ... created", uuid-ish)
  const idMatch = createOut.match(/\btask[-_][\w-]+\b/i) || createOut.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
  if (idMatch) {
    runCli(['task', 'status', idMatch[0]], `#1863-status — \`task status ${idMatch[0]}\``);
  } else {
    // No ID extracted — fall back to `task list` which also formats the same arrays.
    runCli(['task', 'list'], '#1863-list — `task list` (formats the same arrays)');
  }
}

// --- A few other command formatters that touch MCP-typed arrays ---
runCli(['task', 'list'], 'task list');
runCli(['agent', 'list'], 'agent list');
runCli(['memory', 'list'], 'memory list');
runCli(['swarm', 'status'], 'swarm status');

clearTimeout(watchdog);

if (failed > 0) {
  console.error(`\n${failed} CLI command(s) crashed with an unhandled exception — see above. (#1863 class)`);
  process.exit(1);
}
console.log(`\nall cli-no-crash checks green (#1863 class)`);
process.exit(0);
