#!/usr/bin/env node
/**
 * ADR-112 Phase 1+2+3 — bulk applier for "Use when …" guidance suffixes.
 *
 * For each MCP tool name we know its category (agent / memory / agentdb /
 * workflow / hooks / swarm / embeddings / claims / browser / cost /
 * intelligence / aidefence / autopilot / federation / iot-cognitum / wasm /
 * ruvllm / config / session / hive-mind / coordination / system / mcp /
 * neural / progress / claims / transfer / daa / performance / analyze /
 * guidance / ruvllm), and for each category we know the native-tool overlap
 * and the Ruflo value-add. The script appends a category-appropriate
 * "Use when … is wrong because …" suffix to any description that doesn't
 * already include "Use when" / "Prefer over" / "Pair with" / "fall back".
 *
 * The script never modifies descriptions that already have guidance —
 * agent_spawn, agent_execute, the seven we hand-wrote, etc.
 *
 * Run:
 *   node scripts/bulk-fix-tool-descriptions.mjs           # dry-run
 *   node scripts/bulk-fix-tool-descriptions.mjs --write   # apply
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TOOLS_DIR = 'v3/@claude-flow/cli/src/mcp-tools';
const WRITE = process.argv.includes('--write');

const GUIDANCE_RE = /Use when|Prefer .* over|Pair with|fall back|native .* is (fine|wrong)/i;

// Category → "Use when …" suffix. Each suffix names the native overlap (if
// any) and the Ruflo value-add. Honest about when native is fine — that
// keeps Claude's trust in our guidance.
const SUFFIX = {
  // -------- Memory & persistence --------
  memory_: ' Use when native Read/Write is wrong because you need (a) cross-session retrieval by semantic similarity (vector embeddings) not by file path, (b) namespacing across projects without managing directory layout, or (c) the .swarm/memory.db audit trail. For one-shot file I/O, native Read/Write is fine.',
  agentdb_: ' Use when generic memory_* tools are wrong because you need AgentDB-specific controllers (HNSW vector search, hierarchical tiers, causal-graph links, pattern store/recall, RaBitQ quantization). For simple key-value persistence, memory_store/memory_retrieve are simpler. For unrelated file work, native Read/Write are fine.',
  embeddings_: ' Use when text similarity matters beyond keyword match — native Grep finds exact strings, embeddings find meaning. Pair with memory_store / agentdb_pattern-search to land the vector against your knowledge base. For literal symbol search, native Grep is faster.',

  // -------- Agents & orchestration --------
  agent_: ' Use when native Task is wrong because you need agent-lifecycle state (cost-tracking, taskCount across turns, swarm coordination, model routing via 3-tier). For one-shot subagents with no learning loop, native Task is fine.',
  swarm_: ' Use when native Task tool is wrong because you need multi-agent coordination — topology (hierarchical/mesh/star), consensus (raft/byzantine/gossip/crdt/quorum), shared memory namespace, or anti-drift gates. For independent one-shot subagents, native Task is fine; spawn each separately.',
  task_: ' Use when native TodoWrite is wrong because you need cross-session task persistence, agent assignment, dependency tracking, or completion analytics in the .swarm/memory.db. For in-session checklists native TodoWrite is simpler and faster.',
  coordination_: ' Use when native Task is wrong because the work crosses multiple agents that need to vote/sync/load-balance — TodoWrite + a single Task cannot orchestrate consensus. For one-off subtask dispatch, native Task is fine.',
  'hive-mind_': ' Use when native Task is wrong because you need queen-led collective intelligence — Byzantine-FT consensus, broadcast across many worker agents, shared memory with bounded conflict. For a single subagent, native Task is fine. Pair with swarm_init first to set topology.',

  // -------- Hooks & lifecycle --------
  hooks_: ' Use when native Bash hooks (via Claude Code\'s settings.json) are wrong because you need Ruflo-side state — pattern persistence, neural training signals, model-routing learning, cost tracking, audit chain. For one-off shell commands, plain Bash hooks are fine.',

  // -------- Sessions --------
  session_: ' Use when native conversation memory is wrong because you need durable cross-session state — restoring agent definitions, swarm topology, memory store, breaker history. For in-session continuation only, no tool needed. Pair with session_save before exiting and session_restore on resume.',

  // -------- Config / system --------
  config_: ' Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon, MCP server, neural router) — those load via the config_* path, not by re-reading settings.json. For .gitignore / .editorconfig style files, native Edit is fine.',
  system_: ' Use when native Bash is wrong because you need Ruflo runtime metrics (HNSW index size, ReasoningBank state, swarm health, breaker status) — those are not in /proc, only in the running daemon. For OS-level info (uptime, disk, mem), native Bash + standard tools are fine.',
  mcp_: ' Use when native Claude Code MCP status is wrong because you need Ruflo-side server detail — tool counts per namespace, transport stats, MCP handshake errors. For just "is MCP up?", `claude mcp list` is fine.',
  status_: ' Use when generic Ruflo health checks are wrong because you want a single quick read of overall system state — daemon up?, swarm initialized?, memory db healthy?, federation peers connected? For deep debugging, prefer the dedicated tools each subsystem exposes.',
  doctor_: ' Use when generic shell debugging is wrong because you want Ruflo-aware checks — Node/npm versions, daemon, memory DB, API keys, MCP servers, disk space. For unrelated environment troubleshooting, native shell + git/which/env are fine.',

  // -------- Workflow --------
  workflow_: ' Use when native TodoWrite + sequential Bash is wrong because the work has a real dependency graph that needs persistence, retry policy, pause/resume, and step-output binding across LLM-driven steps. For a single linear todo list, native TodoWrite is fine.',

  // -------- Browser --------
  browser_: ' Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows with cookie reuse, replay against DOM-drifted versions, AIDefence PII gating before content reaches Claude. For static HTML pages, native WebFetch is faster and free.',

  // -------- Security & defense --------
  aidefence_: ' Use when nothing native exists — Claude Code does not have a PII / prompt-injection / adversarial-text scanner. Pair with any tool that ingests untrusted input (browser scrape, federation envelope, memory_import_claude).',
  security_: ' Use when native package-audit (`npm audit`) is wrong because you need Ruflo-aware checks — known-bad dep patterns, secret detection, path-traversal in MCP inputs, witness chain verify. For just listing CVEs in your lockfile, native `npm audit` is fine.',

  // -------- Federation --------
  federation_: ' Use when nothing native covers cross-installation agent communication — Claude Code talks to its own MCP server only. Pair with federation_init first; once peers are joined, federation_send routes signed envelopes with PII gating, breaker, and audit. For local-only work, no federation tool is needed.',

  // -------- Cost tracking --------
  cost_: ' Use when native usage estimates are wrong because you need per-agent / per-model / per-task attribution across turns and sessions. The cost-tracking namespace persists between calls; reading the Claude CLI\'s built-in usage shows only the current turn. For one-shot cost checks, the native CLI suffices.',

  // -------- Intelligence / neural --------
  intelligence_: ' Use when native Task / Read prompting is wrong because you want learned-pattern routing — Ruflo\'s SONA neural router picks tier (Agent Booster / Haiku / Sonnet+Opus) based on past success on similar tasks. Pair with hooks_post-task to feed back outcomes. For one-shot prompts without learning, native Task is fine.',
  neural_: ' Use when nothing native trains on your workflow — Claude Code has no learning loop. Use to train SONA/MoE/EWC patterns from successful task outcomes; query via neural_predict before spawning agents. Off-path for one-shot work.',

  // -------- Autopilot --------
  autopilot_: ' Use when running long-horizon goals that should resume automatically across sessions — Claude Code has no native autonomous-loop scheduler. Pair with autopilot_enable + a goal description, then let cron fires advance the work. For interactive single-task sessions, native Task is fine.',

  // -------- DAA --------
  daa_: ' Use when native Task is wrong because you need agents that adapt their cognitive pattern (convergent / divergent / lateral / systems / critical) per-task and share knowledge across the swarm. For static one-shot agents, native Task is fine.',

  // -------- WASM agents --------
  wasm_: ' Use when native Task is wrong because the workload needs sandboxed isolation — untrusted code execution, browser-side run, deterministic replay. Pair with wasm_gallery_search to find a published agent, or wasm_agent_create to scaffold a fresh one. For trusted in-process work, native Task is fine.',

  // -------- RuVLLM (local inference) --------
  ruvllm_: ' Use when sending every prompt to the Anthropic API is wrong because you need local inference — air-gapped environments, MicroLoRA-fine-tuned per-task adapters, or sub-cent per-call cost. For general Claude work native Task is the right call.',

  // -------- Performance --------
  performance_: ' Use when native shell timing (`time`, `hyperfine`) is wrong because you want Ruflo-aware benchmarks — HNSW search latency, breaker decisions/sec, MCP response p50/p95, embeddings throughput. For OS-level process profiling, native shell + perf are fine.',
  perf_: ' Use when native shell timing is wrong because you want Ruflo-aware benchmarks (HNSW, swarm, MCP). For OS-level process profiling, native shell + perf are fine.',
  benchmark_: ' Use when native `time`/`hyperfine` is wrong because you want a Ruflo-aware suite — agent latency, memory recall accuracy, neural routing hit rate. For OS-level micro-benchmarks, native shell is fine.',
  profile_: ' Use when native Node `--prof` is wrong because you want Ruflo-component-specific traces (controller-by-controller, hook-by-hook, agent-by-agent). For low-level CPU/heap profiling, native Node profiler + clinic.js are fine.',

  // -------- Analyze --------
  analyze_: ' Use when native `git diff` / `grep` / static analysis is wrong because you want LLM-graded change classification, reviewer recommendations, or risk scoring. For literal-text inspection, native tools are fine.',

  // -------- Progress tracking --------
  progress_: ' Use when native TodoWrite is wrong because you need cross-session goal-completion tracking with witness/audit trail. For in-session checklists, native TodoWrite is simpler.',

  // -------- Transfer / IPFS --------
  transfer_: ' Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS (plugins, witness chains, learned patterns). For npm-registry deps, native npm is fine.',

  // -------- Guidance --------
  guidance_: ' Use when generic "what tool should I use?" guessing is wrong — Ruflo\'s guidance system uses the live tool index + your workflow context to recommend. Pair with hooks_route at task start. For trivial native-only tasks, no guidance call is needed.',

  // -------- IoT (Cognitum Seed) --------
  iot_: ' Use when native ssh-into-device is wrong because you need Ruflo-tracked fleet state — trust scoring, telemetry anomaly detection, witness chain verification. For one-off device debugging, native ssh is fine.',

  // -------- Claims (authorization) --------
  claims_: ' Use when nothing native covers per-agent capability gating — Claude Code agents have file-system access by default. Pair claims_grant + claims_check before letting an agent run privileged ops. For trusted in-session work, no claims call is needed.',

  // -------- Terminal --------
  terminal_: ' Use when native Bash is wrong because you need a persistent terminal session across turns/agents with output capture and replay. For one-shot shell commands, native Bash is fine.',

  // -------- Daemon --------
  daemon_: ' Use when native systemd/launchd is wrong because you want to manage just the Ruflo background workers (12 worker types, priority-aware) without touching OS-level service management. For OS-level service mgmt, native tools are fine.',

  // -------- AgentDB causal/graph --------
  causal_: ' Use when native bug tracker / postmortem doc is wrong because you want machine-readable cause→effect links queryable via Cypher. For human-readable postmortems, native markdown is fine.',
  graph_: ' Use when native grep across files is wrong because you want typed entity-relation traversal — \"all decisions related to ADR-097\", \"all peers signed by this Ed25519 key\". For literal text search, native Grep is faster.',

  // -------- ReasoningBank / search --------
  reasoningbank_: ' Use when native Task is wrong because you want learned-trajectory replay — past successful approaches retrieved by current-task similarity. Pair with reasoningbank_judge + reasoningbank_distill to close the learning loop. For one-shot work without learning, native Task is fine.',
  search_: ' Use when native Grep is wrong because you want semantic match (vector / hybrid / MMR-reranked). For exact-token search, native Grep is faster and free.',
};

const CATCHALL = ' Use when native Bash / file tools are wrong because this MCP tool exposes Ruflo-specific state or controllers that have no shell equivalent. For tasks that fit a one-line native command, prefer that.';

function suffixFor(name) {
  for (const [prefix, suffix] of Object.entries(SUFFIX)) {
    if (name.startsWith(prefix)) return suffix;
  }
  return CATCHALL;
}

let totalChanged = 0;
let totalSkipped = 0;
const perFile = {};

for (const f of readdirSync(TOOLS_DIR).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
  const filePath = join(TOOLS_DIR, f);
  let src = readFileSync(filePath, 'utf-8');
  let fileChanged = 0;
  let fileSkipped = 0;

  // Match `name: '...',` followed by `description: '...'` (with escaped chars)
  // and replace the description with description + suffix if no guidance.
  src = src.replace(
    /(name:\s*'([^']+)',\s*\n(?:\s*[^,\n]+,\s*\n)?\s*description:\s*')((?:[^'\\]|\\.)*)(')/g,
    (full, before, name, desc, close) => {
      if (GUIDANCE_RE.test(desc)) {
        fileSkipped++;
        return full;
      }
      const suffix = suffixFor(name);
      // Need to JS-escape any single-quote in suffix (template is single-quote literal)
      const safeSuffix = suffix.replace(/'/g, "\\'");
      const newDesc = desc.replace(/\s+$/, '') + safeSuffix;
      fileChanged++;
      return `${before}${newDesc}${close}`;
    },
  );

  if (fileChanged > 0 && WRITE) {
    writeFileSync(filePath, src);
  }
  perFile[f] = { changed: fileChanged, skipped: fileSkipped };
  totalChanged += fileChanged;
  totalSkipped += fileSkipped;
}

console.log(`Bulk tool-description fix (ADR-112)`);
console.log(`====================================`);
console.log(`Mode: ${WRITE ? 'WRITE' : 'dry-run'}`);
console.log(`Total descriptions updated: ${totalChanged}`);
console.log(`Total skipped (already had guidance): ${totalSkipped}`);
console.log(`\nPer-file:`);
for (const [f, s] of Object.entries(perFile)) {
  if (s.changed > 0 || s.skipped > 0) {
    console.log(`  ${f}: +${s.changed} updated, ${s.skipped} kept`);
  }
}
console.log(`\nRun with --write to apply. Re-run scripts/audit-tool-descriptions.mjs after.`);
