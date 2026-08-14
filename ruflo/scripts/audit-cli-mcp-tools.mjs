#!/usr/bin/env node
/**
 * CLI ↔ MCP tool coverage audit — regression guard for #1916.
 *
 * The `ruflo agent logs <id>` CLI subcommand referenced an `agent_logs` MCP
 * tool that was never registered, so the command died with
 * `MCP tool not found: agent_logs`. There turned out to be ~20 more CLI
 * subcommands with the same shape (`callMCPTool('<name>', …)` where `<name>`
 * isn't in the registry — `memory export`, `task retry`, `workflow validate`,
 * `session export`, …). Fixing them all is a backlog; this guard prevents
 * the count from *growing* (monotone-decreasing baseline, same pattern as
 * scripts/audit-tool-descriptions.mjs) and fails immediately on any NEW
 * dangling reference.
 *
 * It scans every `callMCPTool('<name>', …)` reference in
 * `v3/@claude-flow/cli/src/commands/*.ts` and checks the name is registered
 * by some MCPTool definition in `v3/@claude-flow/cli/src/mcp-tools/*.ts`
 * (the files `mcp-client.ts` assembles into TOOL_REGISTRY).
 *
 * Usage:
 *   node scripts/audit-cli-mcp-tools.mjs            # exit 1 if regressed
 *   node scripts/audit-cli-mcp-tools.mjs --json     # machine-readable report
 *   node scripts/audit-cli-mcp-tools.mjs --update-baseline   # after fixing some
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const CLI_SRC = join(REPO_ROOT, 'v3', '@claude-flow', 'cli', 'src');
const COMMANDS_DIR = join(CLI_SRC, 'commands');
const MCP_CLIENT = join(CLI_SRC, 'mcp-client.ts'); // single source of truth for what is registered
const BASELINE_FILE = join(REPO_ROOT, 'verification', 'cli-mcp-tool-baseline.json');
const JSON_OUT = process.argv.includes('--json');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');

const TOOL_DEF_RE = /name:\s*'([^']+)',\s*\n\s*description:\s*'/g;
const CALL_RE = /callMCPTool\s*(?:<[\s\S]*?>)?\s*\(\s*['"]([^'"]+)['"]/g;

function listTs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).map(f => join(dir, f));
}

// --- which tool-source files are ACTUALLY registered ---
// Mirror mcp-client.ts: find every `...<ident>(?())` spread inside its
// `registerTools([ … ])` call, then resolve each <ident> to its
// `import { … } from '<path>'` and scan that file. A file that defines tools
// but is never imported into registerTools is NOT registered — so a CLI
// callMCPTool() against it correctly counts as dangling (this caught the
// `hooks_coverage-*` tools, which were defined in ruvector/coverage-tools.ts
// but never wired in — #1916).
function resolveImportPath(spec) {
  // spec like './mcp-tools/agent-tools.js' or '../ruvector/coverage-tools.js'
  let p = spec.replace(/^\.\//, '').replace(/^\.\.\//, '../');
  // .js → .ts (source files)
  p = p.replace(/\.js$/, '.ts');
  return p.startsWith('../') ? join(CLI_SRC, p) : join(CLI_SRC, p);
}
function registeredToolSourceFiles() {
  const src = readFileSync(MCP_CLIENT, 'utf-8');
  const regBlock = (src.match(/registerTools\(\[([\s\S]*?)\]\);/) || [, ''])[1];
  // collect spread identifiers (strip trailing () if it's `...getX()`)
  const idents = new Set();
  for (const m of regBlock.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)\s*\(?\s*\)?/g)) idents.add(m[1]);
  // map each ident to its import path
  const files = new Set();
  for (const id of idents) {
    // `import { id } from '<path>'`  OR  `import { x, id, y } from '<path>'`
    const re = new RegExp(`import\\s*\\{[^}]*\\b${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`);
    const im = src.match(re);
    if (im) {
      const f = resolveImportPath(im[1]);
      if (existsSync(f)) files.add(f);
    } else {
      // `getX()` factory — the function may live in <x>-tools.ts; try a name guess
      const guess = id.replace(/^get/, '').replace(/^([A-Z])/, c => c.toLowerCase()).replace(/([A-Z])/g, '-$1').toLowerCase();
      const cand = join(CLI_SRC, 'mcp-tools', `${guess}.ts`);
      if (existsSync(cand)) files.add(cand);
    }
  }
  return [...files];
}

// --- registered tool names ---
const registered = new Set();
for (const file of registeredToolSourceFiles()) {
  const fsrc = readFileSync(file, 'utf-8');
  let m; TOOL_DEF_RE.lastIndex = 0;
  while ((m = TOOL_DEF_RE.exec(fsrc))) registered.add(m[1]);
}

// --- callMCPTool references in command files ---
const references = []; // { name, file, line }
for (const file of listTs(COMMANDS_DIR)) {
  const src = readFileSync(file, 'utf-8');
  let m; CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    references.push({ name: m[1], file: file.replace(REPO_ROOT + '/', ''), line });
  }
}

const danglingRefs = references.filter(r => !registered.has(r.name));
const danglingNames = [...new Set(danglingRefs.map(r => r.name))].sort();

const baseline = existsSync(BASELINE_FILE)
  ? JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'))
  : { danglingCount: Number.POSITIVE_INFINITY, knownDangling: [] };
const baselineKnown = new Set(baseline.knownDangling || []);
const newOffenders = danglingNames.filter(n => !baselineKnown.has(n));

if (UPDATE_BASELINE) {
  const next = {
    _comment: 'Monotone-decreasing baseline of CLI subcommands that callMCPTool() a tool not registered in src/mcp-tools/*.ts (would fail with `MCP tool not found`). Fix one → re-run with --update-baseline to lock the new floor. NEVER increase.',
    danglingCount: danglingNames.length,
    knownDangling: danglingNames,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(BASELINE_FILE, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  console.log(`baseline updated → ${danglingNames.length} dangling tool name(s)`);
  process.exit(0);
}

const regressed = newOffenders.length > 0 || danglingNames.length > (baseline.danglingCount ?? Infinity);

const report = {
  registeredToolCount: registered.size,
  commandFilesScanned: listTs(COMMANDS_DIR).length,
  danglingCount: danglingNames.length,
  baselineCount: baseline.danglingCount,
  newOffenders,
  dangling: danglingRefs.map(r => ({ name: r.name, where: `${r.file}:${r.line}` })),
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`CLI ↔ MCP tool coverage — ${registered.size} registered tools; ${danglingNames.length} dangling callMCPTool() name(s) (baseline ${baseline.danglingCount})`);
  if (!regressed) {
    console.log(`  ✓ no NEW dangling references (${danglingNames.length} known offenders carried in verification/cli-mcp-tool-baseline.json)`);
  } else {
    if (newOffenders.length) {
      console.log(`  ✗ NEW dangling callMCPTool() reference(s) — register the tool in src/mcp-tools/*.ts:`);
      for (const name of newOffenders) {
        for (const r of danglingRefs.filter(x => x.name === name)) console.log(`      '${name}'  ${r.file}:${r.line}`);
      }
    }
    if (danglingNames.length > (baseline.danglingCount ?? Infinity)) {
      console.log(`  ✗ dangling count ${danglingNames.length} exceeds baseline ${baseline.danglingCount}`);
    }
    console.log(`\nFix the new reference(s), or (only after fixing some existing ones) run: node scripts/audit-cli-mcp-tools.mjs --update-baseline`);
  }
}

process.exit(regressed ? 1 : 0);
