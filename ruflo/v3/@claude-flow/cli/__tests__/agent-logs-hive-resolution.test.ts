/**
 * Regression guard for ruvnet/ruflo#1916.
 *
 *  (a) `agent_logs` MCP tool must be registered — the `ruflo agent logs <id>`
 *      CLI subcommand called `callMCPTool('agent_logs', …)` against a tool
 *      that didn't exist → `MCP tool not found: agent_logs`.
 *  (b) `agent_status` / `agent_list` / `agent_logs` must resolve hive-mind-
 *      spawned workers — `hive-mind_spawn` writes workers to
 *      `.claude-flow/agents.json`, a *different* file from the canonical
 *      `.claude-flow/agents/store.json` the agent tools read, so
 *      `agent status <hive-worker-id>` returned `not_found`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentTools } from '../src/mcp-tools/agent-tools.js';

const tool = (name: string) => {
  const t = agentTools.find(t => t.name === name);
  if (!t) throw new Error(`MCP tool not registered: ${name}`);
  return t;
};

describe('#1916 — agent_logs registered + hive-worker resolution', () => {
  let dir: string;
  let prevCwd: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ruflo-1916-'));
    prevCwd = process.env.CLAUDE_FLOW_CWD;
    process.env.CLAUDE_FLOW_CWD = dir;
    // hive-mind_spawn writes here:
    mkdirSync(join(dir, '.claude-flow'), { recursive: true });
    writeFileSync(
      join(dir, '.claude-flow', 'agents.json'),
      JSON.stringify({
        agents: {
          'hive-worker-1716-abcd': {
            agentId: 'hive-worker-1716-abcd',
            agentType: 'worker',
            status: 'idle',
            health: 1.0,
            taskCount: 0,
            config: { role: 'worker', hiveRole: 'worker' },
            createdAt: '2026-05-11T00:00:00.000Z',
            domain: 'hive-mind',
          },
        },
      }),
    );
  });

  afterEach(() => {
    if (prevCwd === undefined) delete process.env.CLAUDE_FLOW_CWD;
    else process.env.CLAUDE_FLOW_CWD = prevCwd;
    rmSync(dir, { recursive: true, force: true });
  });

  it('(a) agent_logs is a registered MCP tool', () => {
    expect(agentTools.some(t => t.name === 'agent_logs')).toBe(true);
  });

  it('(a) agent_logs returns the documented shape for an unknown agent (no throw)', async () => {
    const res = await (tool('agent_logs').handler as any)({ agentId: 'agent-does-not-exist' });
    expect(res).toMatchObject({ agentId: 'agent-does-not-exist', entries: [], total: 0, error: 'Agent not found' });
  });

  it('(b) agent_status resolves a hive-mind-spawned worker', async () => {
    const res = await (tool('agent_status').handler as any)({ agentId: 'hive-worker-1716-abcd' });
    expect(res.status).not.toBe('not_found');
    expect(res).toMatchObject({ agentId: 'hive-worker-1716-abcd', agentType: 'worker', status: 'idle' });
  });

  it('(b) agent_list includes hive-mind-spawned workers', async () => {
    const res = await (tool('agent_list').handler as any)({});
    expect(res.agents.map((a: any) => a.agentId)).toContain('hive-worker-1716-abcd');
  });

  it('(b) agent_logs resolves a hive-mind-spawned worker and returns entries', async () => {
    const res = await (tool('agent_logs').handler as any)({ agentId: 'hive-worker-1716-abcd' });
    expect(res.error).toBeUndefined();
    expect(res.agentId).toBe('hive-worker-1716-abcd');
    expect(Array.isArray(res.entries)).toBe(true);
    expect(res.entries.length).toBeGreaterThan(0); // at least the synthetic "agent created" entry
  });

  it('canonical store wins on id collision', async () => {
    // Same id in the canonical store with a richer record:
    mkdirSync(join(dir, '.claude-flow', 'agents'), { recursive: true });
    writeFileSync(
      join(dir, '.claude-flow', 'agents', 'store.json'),
      JSON.stringify({
        version: '3.0.0',
        agents: {
          'hive-worker-1716-abcd': {
            agentId: 'hive-worker-1716-abcd',
            agentType: 'coder',
            status: 'busy',
            health: 0.9,
            taskCount: 3,
            config: {},
            createdAt: '2026-05-11T01:00:00.000Z',
          },
        },
      }),
    );
    const res = await (tool('agent_status').handler as any)({ agentId: 'hive-worker-1716-abcd' });
    expect(res).toMatchObject({ agentType: 'coder', status: 'busy', taskCount: 3 });
  });
});
