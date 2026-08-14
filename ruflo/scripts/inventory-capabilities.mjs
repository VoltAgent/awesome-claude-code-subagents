#!/usr/bin/env node
/**
 * Auto-extract ruflo's full capability surface — every MCP tool, CLI
 * command, plugin, and agent — and render it as a markdown section
 * suitable for appending to verification.md.
 *
 * Output is deterministic + sorted so re-running this script doesn't
 * churn the file. The witness signing pass (iteration 2 of task #24)
 * will consume the JSON sidecar this script writes alongside.
 *
 * Usage:
 *   node scripts/inventory-capabilities.mjs > /tmp/inventory.md
 *   node scripts/inventory-capabilities.mjs --json > /tmp/inventory.json
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = (() => {
  // Resolve project root regardless of where the script is invoked from
  let dir = fileURLToPath(new URL('.', import.meta.url));
  while (dir !== '/') {
    if (existsSync(join(dir, 'verification.md'))) return dir;
    dir = join(dir, '..');
  }
  throw new Error('could not find project root (looked for verification.md)');
})();

// ── MCP tools ─────────────────────────────────────────────────────────────────

const MCP_TOOLS_DIR = join(ROOT, 'v3/@claude-flow/cli/src/mcp-tools');

function extractMcpTools() {
  const tools = [];
  const files = readdirSync(MCP_TOOLS_DIR)
    .filter(f => f.endsWith('.ts'))
    .filter(f => !f.endsWith('.test.ts'))
    .filter(f => !['types.ts', 'validate-input.ts', 'auto-install.ts', 'request-tracker.ts', 'agent-execute-core.ts', 'index.ts'].includes(f));

  for (const file of files) {
    const path = join(MCP_TOOLS_DIR, file);
    const src = readFileSync(path, 'utf-8');
    // Match the literal `name: 'foo_bar',` lines that the MCPTool object literals use.
    const re = /name:\s*['"]([a-z_][a-z0-9_-]*)['"]\s*,/gi;
    const found = new Set();
    let m;
    while ((m = re.exec(src)) !== null) {
      found.add(m[1]);
    }
    // Match the description on the next line as a best-effort hint
    for (const name of [...found].sort()) {
      const idx = src.indexOf(`name: '${name}'`) >= 0
        ? src.indexOf(`name: '${name}'`)
        : src.indexOf(`name: "${name}"`);
      let description = '';
      if (idx >= 0) {
        const slice = src.slice(idx, idx + 600);
        const dm = slice.match(/description:\s*['"`]([^'"`\n]+)['"`]/);
        if (dm) description = dm[1].trim();
      }
      tools.push({
        name,
        description,
        sourceFile: relative(ROOT, path),
      });
    }
  }
  // Dedupe across files (some tools may be re-exported); keep first occurrence
  const seen = new Set();
  const uniq = [];
  for (const t of tools) {
    if (seen.has(t.name)) continue;
    seen.add(t.name);
    uniq.push(t);
  }
  return uniq.sort((a, b) => a.name.localeCompare(b.name));
}

// ── CLI commands ──────────────────────────────────────────────────────────────

const CLI_COMMANDS_DIR = join(ROOT, 'v3/@claude-flow/cli/src/commands');

function extractCliCommands() {
  const commands = [];
  const files = readdirSync(CLI_COMMANDS_DIR)
    .filter(f => f.endsWith('.ts'))
    .filter(f => !f.endsWith('.test.ts'))
    .filter(f => !['index.ts'].includes(f));

  for (const file of files) {
    const path = join(CLI_COMMANDS_DIR, file);
    const src = readFileSync(path, 'utf-8');
    // Match `export const fooCommand: Command = { name: '...', description: '...' }`
    const cmdRe = /export\s+const\s+\w+Command(?::\s*Command)?\s*=\s*\{[^}]*?name:\s*['"]([\w-]+)['"][^}]*?description:\s*['"`]([^'"`\n]*)['"`]/gms;
    let m;
    while ((m = cmdRe.exec(src)) !== null) {
      commands.push({
        name: m[1],
        description: m[2].trim(),
        sourceFile: relative(ROOT, path),
      });
    }
  }
  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Plugins ───────────────────────────────────────────────────────────────────

const PLUGINS_DIR = join(ROOT, 'plugins');

function extractPlugins() {
  const plugins = [];
  if (!existsSync(PLUGINS_DIR)) return plugins;
  const dirs = readdirSync(PLUGINS_DIR)
    .filter(d => d.startsWith('ruflo-'))
    .filter(d => statSync(join(PLUGINS_DIR, d)).isDirectory());

  for (const dir of dirs) {
    const manifestPath = join(PLUGINS_DIR, dir, '.claude-plugin', 'plugin.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      plugins.push({
        name: m.name || dir,
        version: m.version || '0.0.0',
        description: (m.description || '').trim(),
        sourceFile: relative(ROOT, manifestPath),
      });
    } catch { /* skip malformed */ }
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Agents ────────────────────────────────────────────────────────────────────

function extractAgents() {
  const agents = [];
  // Look in plugin agent subdirs only (where the live agent definitions are)
  for (const dir of readdirSync(PLUGINS_DIR)
    .filter(d => statSync(join(PLUGINS_DIR, d)).isDirectory())) {
    const agentDir = join(PLUGINS_DIR, dir, 'agents');
    if (!existsSync(agentDir)) continue;
    for (const f of readdirSync(agentDir).filter(x => x.endsWith('.md'))) {
      const path = join(agentDir, f);
      const src = readFileSync(path, 'utf-8');
      // Frontmatter parse — name + description (CRLF-tolerant for Windows checkouts)
      const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm) continue;
      const yaml = fm[1];
      const name = (yaml.match(/^name:\s*(.+)$/m) || [, basename(f, '.md')])[1].trim();
      const description = (yaml.match(/^description:\s*(.+)$/m) || [, ''])[1].trim();
      agents.push({
        name,
        description,
        plugin: dir,
        sourceFile: relative(ROOT, path),
      });
    }
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Render markdown ───────────────────────────────────────────────────────────

function table(headers, rows) {
  if (rows.length === 0) return '*(none found)*\n';
  const lines = [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
  ];
  for (const row of rows) {
    lines.push(`| ${row.map(c => String(c).replace(/\|/g, '\\|')).join(' | ')} |`);
  }
  return lines.join('\n') + '\n';
}

function renderMarkdown({ mcp, cli, plugins, agents }) {
  const lines = [];
  lines.push('## Capability inventory (auto-extracted)');
  lines.push('');
  lines.push(`Snapshot of every documented capability in this repository at the witnessed git commit. Regenerate with \`node scripts/inventory-capabilities.mjs\`. The output is sorted + deterministic so this section can be diff-reviewed.`);
  lines.push('');
  lines.push(`Coverage at this snapshot: **${mcp.length} MCP tools**, **${cli.length} CLI commands**, **${plugins.length} plugins**, **${agents.length} agent definitions**.`);
  lines.push('');
  lines.push(`Per-capability cryptographic witnesses (SHA-256 of the dist file containing each tool / command, signed with the existing Ed25519 manifest key) land in iteration 2 of task #24 — see \`v3/docs/adr/\` for the design ADR. Functional smoke tests (\`ruflo verify --functional\`) that round-trip each MCP tool through the in-process server are iteration 3.`);
  lines.push('');

  lines.push(`### MCP tools (${mcp.length})`);
  lines.push('');
  lines.push(table(
    ['Tool', 'Description', 'Source'],
    mcp.map(t => [`\`${t.name}\``, t.description || '*(no description)*', `\`${t.sourceFile}\``]),
  ));

  lines.push(`### CLI commands (${cli.length})`);
  lines.push('');
  lines.push(`Top-level command surface. Subcommands are documented per-command in the source file and in \`.claude-flow/CAPABILITIES.md\` after \`ruflo init\`.`);
  lines.push('');
  lines.push(table(
    ['Command', 'Description', 'Source'],
    cli.map(c => [`\`ruflo ${c.name}\``, c.description || '*(no description)*', `\`${c.sourceFile}\``]),
  ));

  lines.push(`### Plugins (${plugins.length})`);
  lines.push('');
  lines.push(table(
    ['Plugin', 'Version', 'Description'],
    plugins.map(p => [`\`${p.name}\``, p.version, p.description || '*(no description)*']),
  ));

  lines.push(`### Agents (${agents.length})`);
  lines.push('');
  lines.push(table(
    ['Agent', 'Plugin', 'Description'],
    agents.map(a => [`\`${a.name}\``, a.plugin, a.description || '*(no description)*']),
  ));

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const inventory = {
  mcp: extractMcpTools(),
  cli: extractCliCommands(),
  plugins: extractPlugins(),
  agents: extractAgents(),
};

const flags = process.argv.slice(2);
if (flags.includes('--json')) {
  process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
} else {
  process.stdout.write(renderMarkdown(inventory) + '\n');
}
