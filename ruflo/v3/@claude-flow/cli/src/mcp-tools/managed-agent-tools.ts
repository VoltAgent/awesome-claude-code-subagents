/**
 * Managed Agent MCP tools — Anthropic Claude Managed Agents as a *cloud*
 * agent runtime alongside ruflo's local WASM-sandboxed agents (`rvagent` /
 * `wasm_agent_*`). See ADR-115.
 *
 * Wraps the Managed Agents REST API (beta, `anthropic-beta:
 * managed-agents-2026-04-01`) with plain `fetch` — no new SDK dependency.
 * Needs `ANTHROPIC_API_KEY` (or `CLAUDE_API_KEY`); every tool degrades
 * gracefully with a structured error when the key is absent so the CLI/MCP
 * server stays up.
 *
 * Lifecycle (mirrors `wasm_agent_*`):
 *   managed_agent_create   → agents.create + environments.create + sessions.create  ↔ wasm_agent_create
 *   managed_agent_prompt   → events.send(user.message) + poll events until idle      ↔ wasm_agent_prompt
 *   managed_agent_status   → GET /v1/sessions/{id}
 *   managed_agent_events   → GET /v1/sessions/{id}/events  (full transcript)          ↔ wasm_agent_files (artifacts/log)
 *   managed_agent_list     → GET /v1/sessions
 *   managed_agent_terminate→ DELETE /v1/sessions/{id} (+ optionally the env)          ↔ wasm_agent_terminate
 */

import type { MCPTool } from './types.js';

const API_BASE = process.env.ANTHROPIC_BASE_URL?.replace(/\/$/, '') || 'https://api.anthropic.com';
const BETA_HEADER = 'managed-agents-2026-04-01';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const POLL_INTERVAL_MS = 1500;
const DEFAULT_MAX_WAIT_MS = 180_000; // 3 min — long enough for a real task, bounded so a tool call never hangs forever

function apiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || null;
}

function headers(key: string): Record<string, string> {
  return {
    'x-api-key': key,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-beta': BETA_HEADER,
    'content-type': 'application/json',
  };
}

const NEEDS_KEY = {
  error:
    'managed-agent runtime needs ANTHROPIC_API_KEY (or CLAUDE_API_KEY) and Claude Managed Agents beta access. ' +
    'For a local, no-key agent runtime use wasm_agent_create instead (rvagent / WASM sandbox).',
};

async function maRequest<T = unknown>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; error: string; body?: unknown }> {
  const key = apiKey();
  if (!key) return { ok: false, status: 0, error: NEEDS_KEY.error };
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1${path}`, {
      method,
      headers: headers(key),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    return { ok: false, status: 0, error: `network error calling ${method} /v1${path}: ${(e as Error).message}` };
  }
  const text = await res.text();
  let parsed: unknown = undefined;
  try { parsed = text ? JSON.parse(text) : undefined; } catch { /* leave undefined */ }
  if (!res.ok) {
    const apiErr = (parsed as { error?: { message?: string }; message?: string })?.error?.message
      ?? (parsed as { message?: string })?.message
      ?? text.slice(0, 300);
    return { ok: false, status: res.status, error: `Managed Agents API ${res.status}: ${apiErr}`, body: parsed };
  }
  return { ok: true, status: res.status, data: parsed as T };
}

// ---- shapes (only the fields we touch) -----------------------------------
interface MaAgent { id: string; version?: number; name?: string; model?: { id: string } }
interface MaEnvironment { id: string; name?: string; config?: unknown }
interface MaSession { id: string; status?: string; title?: string; error?: string | null; agent?: MaAgent; environment_id?: string }
interface MaEvent { type: string; content?: Array<{ type: string; text?: string }>; name?: string; input?: unknown; id?: string; processed_at?: string; stop_reason?: { type: string } }

// ---- helpers --------------------------------------------------------------
function summarizeEvents(events: MaEvent[]): {
  assistantText: string;
  toolUses: Array<{ name: string; input: unknown }>;
  status: string;
  stopReason: string | null;
  eventCount: number;
} {
  let assistantText = '';
  const toolUses: Array<{ name: string; input: unknown }> = [];
  let status = 'unknown';
  let stopReason: string | null = null;
  for (const e of events) {
    if (e.type === 'agent.message' && Array.isArray(e.content)) {
      assistantText += e.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
    } else if (e.type === 'agent.tool_use') {
      toolUses.push({ name: e.name ?? '?', input: e.input });
    } else if (e.type === 'session.status_running') {
      status = 'running';
    } else if (e.type === 'session.status_idle') {
      status = 'idle';
      stopReason = e.stop_reason?.type ?? null;
    } else if (e.type === 'session.status_error' || e.type === 'session.status_failed') {
      status = 'error';
    }
  }
  return { assistantText, toolUses, status, stopReason, eventCount: events.length };
}

async function fetchSessionEvents(sessionId: string): Promise<MaEvent[]> {
  const r = await maRequest<{ data?: MaEvent[]; events?: MaEvent[] }>('GET', `/sessions/${encodeURIComponent(sessionId)}/events`);
  if (!r.ok) return [];
  const d = r.data;
  return (d.data ?? d.events ?? []) as MaEvent[];
}

// Wait until the session is no longer "running": poll the event log for a
// terminal session.status_* event. Bounded by maxWaitMs.
async function waitForIdle(sessionId: string, maxWaitMs: number): Promise<{ done: boolean; events: MaEvent[] }> {
  const deadline = Date.now() + Math.max(1_000, Math.min(maxWaitMs, 600_000));
  let events: MaEvent[] = [];
  while (Date.now() < deadline) {
    events = await fetchSessionEvents(sessionId);
    const terminal = events.some(e => e.type === 'session.status_idle' || e.type === 'session.status_error' || e.type === 'session.status_failed');
    // Also stop early if the session record itself reports a non-running status
    if (terminal) return { done: true, events };
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { done: false, events };
}

function maName(prefix: string, given?: unknown): string {
  if (typeof given === 'string' && given.trim()) return given.trim().slice(0, 80);
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------

export const managedAgentTools: MCPTool[] = [
  {
    name: 'managed_agent_create',
    description:
      'Spin up an Anthropic-managed cloud agent (Agent + Environment + Session) — the CLOUD counterpart of wasm_agent_create. Use when wasm_agent_create (local WASM sandbox) is wrong because the task is long-running/async (minutes-hours), needs a real cloud container with pre-installed packages + network, or persistent filesystem + transcript across turns. For a fast, free, ephemeral, offline agent use wasm_agent_create (rvagent). Needs ANTHROPIC_API_KEY + Managed Agents beta access. Returns {sessionId, agentId, environmentId}; pair with managed_agent_prompt.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name (default: auto)' },
        model: { type: 'string', description: 'Model id (default: claude-sonnet-4-6)' },
        system: { type: 'string', description: 'System prompt' },
        title: { type: 'string', description: 'Session title' },
        mcpServers: {
          type: 'array',
          description: 'MCP servers to expose to the agent — each {type:"url", url, name, authorization_token?}. NOTE: the cloud agent must be able to *reach* the URL (a local `ruflo mcp start` is not reachable from Anthropic\'s cloud — deploy/tunnel it).',
          items: { type: 'object' },
        },
        skills: { type: 'array', description: 'Skills to attach to the agent', items: { type: 'object' } },
        packages: { type: 'object', description: 'Environment packages: {pip?:[], npm?:[], apt?:[], cargo?:[], gem?:[], go?:[]}' },
        networking: { type: 'string', enum: ['unrestricted', 'restricted', 'none'], description: 'Environment networking (default: unrestricted)' },
        initScript: { type: 'string', description: 'Environment init script (bash, run at container start)' },
      },
    },
    handler: async (input) => {
      if (!apiKey()) return { success: false, ...NEEDS_KEY };

      // 1. Agent
      const agentBody: Record<string, unknown> = {
        name: maName('ruflo-managed', input.name),
        model: typeof input.model === 'string' && input.model ? input.model : DEFAULT_MODEL,
        tools: [{ type: 'agent_toolset_20260401' }],
      };
      if (typeof input.system === 'string') agentBody.system = input.system;
      if (Array.isArray(input.mcpServers) && input.mcpServers.length) agentBody.mcp_servers = input.mcpServers;
      if (Array.isArray(input.skills) && input.skills.length) agentBody.skills = input.skills;
      const a = await maRequest<MaAgent>('POST', '/agents', agentBody);
      if (!a.ok) return { success: false, stage: 'agent', error: a.error };

      // 2. Environment
      const net = (input.networking as string) || 'unrestricted';
      const envBody: Record<string, unknown> = {
        name: maName('ruflo-managed-env', input.name),
        config: { type: 'cloud', networking: { type: net } },
      };
      if (input.packages && typeof input.packages === 'object') (envBody.config as Record<string, unknown>).packages = { type: 'packages', ...(input.packages as object) };
      if (typeof input.initScript === 'string' && input.initScript) (envBody.config as Record<string, unknown>).init_script = input.initScript;
      const e = await maRequest<MaEnvironment>('POST', '/environments', envBody);
      if (!e.ok) return { success: false, stage: 'environment', agentId: a.data.id, error: e.error };

      // 3. Session
      const s = await maRequest<MaSession>('POST', '/sessions', {
        agent: a.data.id,
        environment_id: e.data.id,
        title: maName('ruflo-managed session', input.title),
      });
      if (!s.ok) return { success: false, stage: 'session', agentId: a.data.id, environmentId: e.data.id, error: s.error };

      return {
        success: true,
        runtime: 'managed',
        sessionId: s.data.id,
        agentId: a.data.id,
        agentVersion: a.data.version,
        environmentId: e.data.id,
        status: s.data.status ?? 'idle',
        model: agentBody.model,
        note: 'Cloud agent provisioned. Send work with managed_agent_prompt({sessionId, message}); inspect with managed_agent_events; clean up with managed_agent_terminate (it bills container time + tokens until you do).',
      };
    },
  },
  {
    name: 'managed_agent_prompt',
    description:
      'Send a user turn to a managed cloud-agent session and wait for it to go idle, returning the assistant text + a tool-use trace — the CLOUD counterpart of wasm_agent_prompt. Use when wasm_agent_prompt (local WASM) is wrong because the work is long-running, needs the cloud container, or must persist across turns. Polls the session event log up to maxWaitMs (default 180s); for very long tasks raise maxWaitMs or follow up with managed_agent_events. Pair with managed_agent_create (for sessionId).',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session id from managed_agent_create' },
        message: { type: 'string', description: 'The user turn / task for the agent' },
        maxWaitMs: { type: 'number', description: 'Max ms to wait for the session to go idle (default 180000, capped at 600000)' },
      },
      required: ['sessionId', 'message'],
    },
    handler: async (input) => {
      if (!apiKey()) return { success: false, ...NEEDS_KEY };
      const sessionId = String(input.sessionId ?? '');
      const message = String(input.message ?? '');
      if (!sessionId) return { success: false, error: 'sessionId is required' };
      if (!message) return { success: false, error: 'message is required' };

      const send = await maRequest('POST', `/sessions/${encodeURIComponent(sessionId)}/events`, {
        events: [{ type: 'user.message', content: [{ type: 'text', text: message }] }],
      });
      if (!send.ok) return { success: false, stage: 'send', sessionId, error: send.error };

      const maxWait = typeof input.maxWaitMs === 'number' && input.maxWaitMs > 0 ? input.maxWaitMs : DEFAULT_MAX_WAIT_MS;
      const { done, events } = await waitForIdle(sessionId, maxWait);
      const sum = summarizeEvents(events);
      return {
        success: true,
        runtime: 'managed',
        sessionId,
        finished: done,
        status: sum.status,
        stopReason: sum.stopReason,
        assistantText: sum.assistantText,
        toolUses: sum.toolUses,
        eventCount: sum.eventCount,
        note: done
          ? undefined
          : `Session still running after ${maxWait}ms — call managed_agent_events({sessionId}) to keep watching, or managed_agent_prompt again to steer.`,
      };
    },
  },
  {
    name: 'managed_agent_status',
    description:
      'Get the lifecycle state of a managed cloud-agent session: idle/running/error, title, last error. Use when native conversation memory is wrong because you need the cloud session\'s server-side status across turns rather than guessing. For a local WASM agent use wasm_agent_list. Pair with managed_agent_events for the full transcript.',
    category: 'agent',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string', description: 'Session id' } }, required: ['sessionId'] },
    handler: async (input) => {
      if (!apiKey()) return { ...NEEDS_KEY };
      const sessionId = String(input.sessionId ?? '');
      if (!sessionId) return { error: 'sessionId is required' };
      const r = await maRequest<MaSession>('GET', `/sessions/${encodeURIComponent(sessionId)}`);
      if (!r.ok) return { sessionId, error: r.error };
      return { runtime: 'managed', sessionId: r.data.id, status: r.data.status, title: r.data.title, error: r.data.error ?? null, environmentId: r.data.environment_id };
    },
  },
  {
    name: 'managed_agent_events',
    description:
      'Fetch the full server-persisted event log of a managed cloud-agent session (user turns, agent thinking, tool_use, tool_result, status) — the transcript/artifact view, the CLOUD counterpart of wasm_agent_files. Use when native Read is wrong because the work happened in Anthropic\'s cloud container, not on disk. For a local WASM agent\'s filesystem use wasm_agent_files. Returns the events plus a summary (assistantText, toolUses).',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session id' },
        raw: { type: 'boolean', description: 'Include the full raw event objects (default: summary + compact list)' },
      },
      required: ['sessionId'],
    },
    handler: async (input) => {
      if (!apiKey()) return { ...NEEDS_KEY };
      const sessionId = String(input.sessionId ?? '');
      if (!sessionId) return { error: 'sessionId is required' };
      const events = await fetchSessionEvents(sessionId);
      const sum = summarizeEvents(events);
      const compact = events.map(e => {
        if (e.type === 'agent.message') return { type: e.type, text: (e.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('').slice(0, 500) };
        if (e.type === 'agent.tool_use') return { type: e.type, name: e.name, input: e.input };
        if (e.type === 'agent.tool_result') return { type: e.type, content: JSON.stringify(e.content ?? {}).slice(0, 500) };
        return { type: e.type, ...(e.stop_reason ? { stop_reason: e.stop_reason } : {}) };
      });
      return {
        runtime: 'managed',
        sessionId,
        status: sum.status,
        stopReason: sum.stopReason,
        assistantText: sum.assistantText,
        toolUses: sum.toolUses,
        eventCount: sum.eventCount,
        events: input.raw ? events : compact,
      };
    },
  },
  {
    name: 'managed_agent_list',
    description:
      'List managed cloud-agent sessions on this Anthropic org (id, status, title) — the CLOUD counterpart of wasm_agent_list. Use when native conversation memory is wrong because you need to see which cloud sessions exist (and which are still running / billing) across turns. For local WASM agents use wasm_agent_list. Pair with managed_agent_terminate to clean up idle sessions.',
    category: 'agent',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max sessions to return (default 50)' } } },
    handler: async (input) => {
      if (!apiKey()) return { ...NEEDS_KEY, sessions: [], total: 0 };
      const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.min(Math.floor(input.limit), 200) : 50;
      const r = await maRequest<{ data?: MaSession[]; sessions?: MaSession[] }>('GET', `/sessions?limit=${limit}`);
      if (!r.ok) return { sessions: [], total: 0, error: r.error };
      const list = (r.data.data ?? r.data.sessions ?? []) as MaSession[];
      return {
        runtime: 'managed',
        sessions: list.map(s => ({ sessionId: s.id, status: s.status, title: s.title, environmentId: s.environment_id })),
        total: list.length,
      };
    },
  },
  {
    name: 'managed_agent_terminate',
    description:
      'Delete a managed cloud-agent session (stops billing for it) — the CLOUD counterpart of wasm_agent_terminate. Use when native nothing applies because a cloud session keeps billing container time + tokens until deleted. For a local WASM agent use wasm_agent_terminate. Optionally also deletes the session\'s environment. Always call this when done with a managed agent.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session id to delete' },
        environmentId: { type: 'string', description: 'Optional: also delete this environment (the one returned by managed_agent_create)' },
      },
      required: ['sessionId'],
    },
    handler: async (input) => {
      if (!apiKey()) return { success: false, ...NEEDS_KEY };
      const sessionId = String(input.sessionId ?? '');
      if (!sessionId) return { success: false, error: 'sessionId is required' };
      const s = await maRequest('DELETE', `/sessions/${encodeURIComponent(sessionId)}`);
      const result: Record<string, unknown> = { runtime: 'managed', sessionId, sessionDeleted: s.ok };
      if (!s.ok) result.error = s.error;
      if (typeof input.environmentId === 'string' && input.environmentId) {
        const e = await maRequest('DELETE', `/environments/${encodeURIComponent(String(input.environmentId))}`);
        result.environmentDeleted = e.ok;
        if (!e.ok) result.environmentError = e.error;
      }
      result.success = s.ok;
      return result;
    },
  },
];
