/**
 * Session MCP Tools for CLI
 *
 * Tool definitions for session management with file persistence.
 */

import { existsSync, readFileSync, readdirSync, unlinkSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type MCPTool, getProjectCwd } from './types.js';
import {
  mkdirRestricted,
  readFileMaybeEncrypted,
  writeFileRestricted,
} from '../fs-secure.js';
import { validateIdentifier, validateText } from './validate-input.js';

// Storage paths
const STORAGE_DIR = '.claude-flow';
const SESSION_DIR = 'sessions';

interface SessionRecord {
  sessionId: string;
  name: string;
  description?: string;
  savedAt: string;
  stats: {
    tasks: number;
    agents: number;
    memoryEntries: number;
    totalSize: number;
  };
  data?: {
    memory?: Record<string, unknown>;
    tasks?: Record<string, unknown>;
    agents?: Record<string, unknown>;
  };
}

function getSessionDir(): string {
  return join(getProjectCwd(), STORAGE_DIR, SESSION_DIR);
}

function getSessionPath(sessionId: string): string {
  // Sanitize sessionId to prevent path traversal
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(getSessionDir(), `${safeId}.json`);
}

function ensureSessionDir(): void {
  const dir = getSessionDir();
  if (!existsSync(dir)) {
    mkdirRestricted(dir);
  }
}

function loadSession(sessionId: string): SessionRecord | null {
  try {
    const path = getSessionPath(sessionId);
    if (existsSync(path)) {
      // ADR-096 Phase 2: readFileMaybeEncrypted transparently handles both
      // legacy plaintext sessions and post-migration encrypted ones via the
      // RFE1 magic-byte sniff.
      const data = readFileMaybeEncrypted(path, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Return null on error
  }
  return null;
}

function saveSession(session: SessionRecord): void {
  ensureSessionDir();
  // audit_1776853149979: session JSON contains memory snapshots and agent
  // prompts — restrict to owner read/write.
  // ADR-096 Phase 2: opt-in encrypt-at-rest. The encrypt flag is honored
  // only when CLAUDE_FLOW_ENCRYPT_AT_REST is set; otherwise the legacy
  // plaintext path runs unchanged.
  writeFileRestricted(
    getSessionPath(session.sessionId),
    JSON.stringify(session, null, 2),
    { encrypt: true },
  );
}

function listSessions(): SessionRecord[] {
  ensureSessionDir();
  const dir = getSessionDir();
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));

  const sessions: SessionRecord[] = [];
  for (const file of files) {
    try {
      // ADR-096 Phase 2: same magic-byte sniff for the listing path so a
      // mixed plaintext+encrypted dir still enumerates cleanly.
      const data = readFileMaybeEncrypted(join(dir, file), 'utf-8');
      sessions.push(JSON.parse(data));
    } catch {
      // Skip invalid files
    }
  }

  return sessions;
}

// Load related stores for session data
function loadRelatedStores(options: { includeMemory?: boolean; includeTasks?: boolean; includeAgents?: boolean }) {
  const data: SessionRecord['data'] = {};

  if (options.includeMemory) {
    try {
      const memoryPath = join(getProjectCwd(), STORAGE_DIR, 'memory', 'store.json');
      if (existsSync(memoryPath)) {
        data.memory = JSON.parse(readFileSync(memoryPath, 'utf-8'));
      }
    } catch { /* ignore */ }
  }

  if (options.includeTasks) {
    try {
      const taskPath = join(getProjectCwd(), STORAGE_DIR, 'tasks', 'store.json');
      if (existsSync(taskPath)) {
        data.tasks = JSON.parse(readFileSync(taskPath, 'utf-8'));
      }
    } catch { /* ignore */ }
  }

  if (options.includeAgents) {
    try {
      const agentPath = join(getProjectCwd(), STORAGE_DIR, 'agents', 'store.json');
      if (existsSync(agentPath)) {
        data.agents = JSON.parse(readFileSync(agentPath, 'utf-8'));
      }
    } catch { /* ignore */ }
  }

  return data;
}

export const sessionTools: MCPTool[] = [
  {
    name: 'session_save',
    description: 'Save current session state Use when native conversation memory is wrong because you need durable cross-session state — restoring agent definitions, swarm topology, memory store, breaker history. For in-session continuation only, no tool needed. Pair with session_save before exiting and session_restore on resume.',
    category: 'session',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Session name' },
        description: { type: 'string', description: 'Session description' },
        includeMemory: { type: 'boolean', description: 'Include memory in session' },
        includeTasks: { type: 'boolean', description: 'Include tasks in session' },
        includeAgents: { type: 'boolean', description: 'Include agents in session' },
      },
      required: ['name'],
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      const vName = validateText(input.name, 'name', 256);
      if (!vName.valid) return { success: false, error: vName.error };
      if (input.description) {
        const v = validateText(input.description, 'description');
        if (!v.valid) return { success: false, error: v.error };
      }

      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Load related data based on options
      const data = loadRelatedStores({
        includeMemory: input.includeMemory as boolean,
        includeTasks: input.includeTasks as boolean,
        includeAgents: input.includeAgents as boolean,
      });

      // Calculate stats
      const stats = {
        tasks: data.tasks ? Object.keys((data.tasks as { tasks?: object }).tasks || {}).length : 0,
        agents: data.agents ? Object.keys((data.agents as { agents?: object }).agents || {}).length : 0,
        memoryEntries: data.memory ? Object.keys((data.memory as { entries?: object }).entries || {}).length : 0,
        totalSize: 0,
      };

      const session: SessionRecord = {
        sessionId,
        name: input.name as string,
        description: input.description as string,
        savedAt: new Date().toISOString(),
        stats,
        data: Object.keys(data).length > 0 ? data : undefined,
      };

      // Calculate size
      const sessionJson = JSON.stringify(session);
      session.stats.totalSize = Buffer.byteLength(sessionJson, 'utf-8');

      saveSession(session);

      return {
        sessionId,
        name: session.name,
        savedAt: session.savedAt,
        stats: session.stats,
        path: getSessionPath(sessionId),
      };
    },
  },
  {
    name: 'session_restore',
    description: 'Restore a saved session Use when native conversation memory is wrong because you need durable cross-session state — restoring agent definitions, swarm topology, memory store, breaker history. For in-session continuation only, no tool needed. Pair with session_save before exiting and session_restore on resume.',
    category: 'session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to restore' },
        name: { type: 'string', description: 'Session name to restore' },
      },
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      if (input.sessionId) {
        const v = validateIdentifier(input.sessionId, 'sessionId');
        if (!v.valid) return { success: false, error: v.error };
      }
      if (input.name) {
        const v = validateText(input.name, 'name', 256);
        if (!v.valid) return { success: false, error: v.error };
      }

      let session: SessionRecord | null = null;

      // Try to find by sessionId first
      if (input.sessionId) {
        session = loadSession(input.sessionId as string);
      }

      // Try to find by name if sessionId not found
      if (!session && input.name) {
        const sessions = listSessions();
        session = sessions.find(s => s.name === input.name) || null;
      }

      // Try to find latest if no params
      if (!session && !input.sessionId && !input.name) {
        const sessions = listSessions();
        if (sessions.length > 0) {
          sessions.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
          session = sessions[0];
        }
      }

      if (session) {
        // Restore data to respective stores (legacy JSON for backward compat).
        // audit_1776853149979: tighten perms on the restored stores too.
        if (session.data?.memory) {
          const memoryDir = join(getProjectCwd(), STORAGE_DIR, 'memory');
          if (!existsSync(memoryDir)) mkdirRestricted(memoryDir);
          writeFileRestricted(join(memoryDir, 'store.json'), JSON.stringify(session.data.memory, null, 2));

          // Also populate active sql.js SQLite database so memory-tools can find entries
          try {
            const { storeEntry } = await import('../memory/memory-initializer.js');
            const memoryData = session.data.memory as { entries?: Record<string, { key?: string; id?: string; value?: string; content?: string; namespace?: string }> };
            if (memoryData.entries) {
              for (const entry of Object.values(memoryData.entries)) {
                const key = entry.key || entry.id || '';
                const value = entry.value || entry.content || '';
                if (key && value) {
                  await storeEntry({
                    key,
                    value,
                    namespace: entry.namespace || 'restored',
                    upsert: true,
                  });
                }
              }
            }
          } catch {
            // Legacy JSON restore is the fallback -- sql.js import may not be available
          }
        }
        if (session.data?.tasks) {
          const taskDir = join(getProjectCwd(), STORAGE_DIR, 'tasks');
          if (!existsSync(taskDir)) mkdirRestricted(taskDir);
          writeFileRestricted(join(taskDir, 'store.json'), JSON.stringify(session.data.tasks, null, 2));
        }
        if (session.data?.agents) {
          const agentDir = join(getProjectCwd(), STORAGE_DIR, 'agents');
          if (!existsSync(agentDir)) mkdirRestricted(agentDir);
          writeFileRestricted(join(agentDir, 'store.json'), JSON.stringify(session.data.agents, null, 2));
        }

        return {
          sessionId: session.sessionId,
          name: session.name,
          restored: true,
          restoredAt: new Date().toISOString(),
          stats: session.stats,
        };
      }

      return {
        sessionId: input.sessionId || input.name || 'latest',
        restored: false,
        error: 'Session not found',
      };
    },
  },
  {
    name: 'session_list',
    description: 'List saved sessions Use when native conversation memory is wrong because you need durable cross-session state — restoring agent definitions, swarm topology, memory store, breaker history. For in-session continuation only, no tool needed. Pair with session_save before exiting and session_restore on resume.',
    category: 'session',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum sessions to return' },
        sortBy: { type: 'string', description: 'Sort field (date, name, size)' },
      },
    },
    handler: async (input) => {
      // ADR-093 F6: sessions on disk come from two writers with different
      // shapes — `session_save` writes {sessionId, name, savedAt, stats},
      // while the auto-session writer (claude-flow daemon) writes
      // {id, startedAt, ...}. The previous projection assumed only the
      // first shape, so the second shape collapsed to empty objects in
      // session_list output.
      type AnySession = Record<string, unknown> & {
        sessionId?: string;
        id?: string;
        name?: string;
        description?: string;
        savedAt?: string;
        startedAt?: string;
        stats?: { totalSize?: number };
      };
      const raw = listSessions() as unknown as AnySession[];
      let sessions = raw.map((s): AnySession => ({
        ...s,
        sessionId: (s.sessionId as string) || (s.id as string) || 'unknown',
        savedAt: (s.savedAt as string) || (s.startedAt as string) || '',
      }));

      // Sort
      const sortBy = (input.sortBy as string) || 'date';
      if (sortBy === 'date') {
        sessions.sort((a, b) => new Date(String(b.savedAt || '')).getTime() - new Date(String(a.savedAt || '')).getTime());
      } else if (sortBy === 'name') {
        sessions.sort((a, b) => String(a.name || a.sessionId || '').localeCompare(String(b.name || b.sessionId || '')));
      } else if (sortBy === 'size') {
        sessions.sort((a, b) => (b.stats?.totalSize ?? 0) - (a.stats?.totalSize ?? 0));
      }

      // Apply limit
      const limit = (input.limit as number) || 10;
      sessions = sessions.slice(0, limit);

      return {
        sessions: sessions.map(s => {
          // Project to a stable shape; pull through either source's metadata.
          const projection: Record<string, unknown> = {
            sessionId: s.sessionId,
            name: s.name ?? s.sessionId,
            description: s.description,
            savedAt: s.savedAt,
            stats: s.stats ?? null,
          };
          // Preserve auto-session shape fields when present
          if ((s as Record<string, unknown>).platform) projection.platform = (s as Record<string, unknown>).platform;
          if ((s as Record<string, unknown>).metrics) projection.metrics = (s as Record<string, unknown>).metrics;
          return projection;
        }),
        total: sessions.length,
        limit,
      };
    },
  },
  {
    name: 'session_delete',
    description: 'Delete a saved session Use when native conversation memory is wrong because you need durable cross-session state — restoring agent definitions, swarm topology, memory store, breaker history. For in-session continuation only, no tool needed. Pair with session_save before exiting and session_restore on resume.',
    category: 'session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to delete' },
      },
      required: ['sessionId'],
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      const vId = validateIdentifier(input.sessionId, 'sessionId');
      if (!vId.valid) return { success: false, error: vId.error };

      const sessionId = input.sessionId as string;
      const path = getSessionPath(sessionId);

      if (existsSync(path)) {
        unlinkSync(path);
        return {
          sessionId,
          deleted: true,
          deletedAt: new Date().toISOString(),
        };
      }

      return {
        sessionId,
        deleted: false,
        error: 'Session not found',
      };
    },
  },
  {
    name: 'session_info',
    description: 'Get detailed session information Use when native conversation memory is wrong because you need durable cross-session state — restoring agent definitions, swarm topology, memory store, breaker history. For in-session continuation only, no tool needed. Pair with session_save before exiting and session_restore on resume.',
    category: 'session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
      },
      required: ['sessionId'],
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      const vId = validateIdentifier(input.sessionId, 'sessionId');
      if (!vId.valid) return { success: false, error: vId.error };

      const sessionId = input.sessionId as string;
      const session = loadSession(sessionId);

      if (session) {
        const path = getSessionPath(sessionId);
        const stat = statSync(path);

        return {
          sessionId: session.sessionId,
          name: session.name,
          description: session.description,
          savedAt: session.savedAt,
          stats: session.stats,
          fileSize: stat.size,
          path,
          hasData: {
            memory: !!session.data?.memory,
            tasks: !!session.data?.tasks,
            agents: !!session.data?.agents,
          },
        };
      }

      return {
        sessionId,
        error: 'Session not found',
      };
    },
  },
  {
    // #1916: `ruflo session current` referenced an unregistered
    // `session_current` tool. Returns the most-recently-saved session.
    name: 'session_current',
    description: 'Return the most-recently-saved session (id, name, stats) — the de-facto "current" one. Use when native conversation memory is wrong because you need to know which durable session is active before exporting/restoring it. For in-session continuation only, no tool needed. Pair with session_export / session_restore.',
    category: 'session',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const dir = getSessionDir();
      if (!existsSync(dir)) return { sessionId: '', status: 'none', startedAt: '', error: 'No saved sessions' };
      const files = readdirSync(dir).filter(f => f.endsWith('.json'));
      if (files.length === 0) return { sessionId: '', status: 'none', startedAt: '', error: 'No saved sessions' };
      let newest = files[0]; let newestMtime = 0;
      for (const f of files) {
        const mt = statSync(join(dir, f)).mtimeMs;
        if (mt >= newestMtime) { newestMtime = mt; newest = f; }
      }
      const sessionId = newest.replace(/\.json$/, '');
      const session = loadSession(sessionId);
      if (!session) return { sessionId, status: 'unknown', startedAt: '', error: 'Session file unreadable' };
      return {
        sessionId: session.sessionId,
        name: session.name,
        status: 'active',
        startedAt: session.savedAt,
        stats: session.stats,
      };
    },
  },
  {
    // #1916: `ruflo session export <id> -o <file>` referenced an unregistered
    // `session_export` tool. Writes the session JSON to a file (if given) and
    // returns the session payload.
    name: 'session_export',
    description: 'Export a saved session (agents, tasks, memory snapshot) to a JSON file and/or return the payload. Use when native Write is wrong because the data is the structured session record (not a freeform file) and you want it serialized consistently for transfer/backup. For writing arbitrary content, native Write is fine. Pair with session_import on the other end.',
    category: 'session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to export' },
        outputPath: { type: 'string', description: 'File path to write the export to (optional)' },
        includeMemory: { type: 'boolean', description: 'Include the memory snapshot (advisory — already in the saved record)' },
      },
      required: ['sessionId'],
    },
    handler: async (input) => {
      const vId = validateIdentifier(input.sessionId, 'sessionId');
      if (!vId.valid) return { success: false, error: vId.error };
      const sessionId = input.sessionId as string;
      const session = loadSession(sessionId);
      if (!session) return { sessionId, error: 'Session not found' };
      let path: string | null = null;
      const outputPath = input.outputPath ? String(input.outputPath) : null;
      if (outputPath) {
        try { writeFileSync(outputPath, JSON.stringify(session, null, 2), 'utf-8'); path = outputPath; }
        catch (e) { return { sessionId, error: `Could not write ${outputPath}: ${(e as Error).message}` }; }
      }
      return { sessionId, name: session.name, data: session, path, exportedAt: new Date().toISOString() };
    },
  },
  {
    // #1916: `ruflo session import <file>` referenced an unregistered
    // `session_import` tool. Reads a session JSON and re-saves it locally.
    name: 'session_import',
    description: 'Import a session JSON file (produced by session_export) into the local session store and optionally activate it. Use when native Read is wrong because the file is a structured session record that must be re-registered (new id, stats recomputed) rather than just read. For reading the file, native Read is fine. Pair with session_export on the source.',
    category: 'session',
    inputSchema: {
      type: 'object',
      properties: {
        inputPath: { type: 'string', description: 'Path to the session JSON file to import' },
        name: { type: 'string', description: 'Override the imported session name' },
        activate: { type: 'boolean', description: 'Make the imported session the current one (advisory)' },
      },
      required: ['inputPath'],
    },
    handler: async (input) => {
      const inputPath = String(input.inputPath ?? '');
      if (!inputPath || !existsSync(inputPath)) return { error: `File not found: ${inputPath || '(empty)'}` };
      let parsed: SessionRecord;
      try { parsed = JSON.parse(readFileSync(inputPath, 'utf-8')); }
      catch (e) { return { error: `Invalid session JSON: ${(e as Error).message}` }; }
      const newId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const stats = parsed.stats || { tasks: 0, agents: 0, memoryEntries: 0, totalSize: 0 };
      const session: SessionRecord = {
        sessionId: newId,
        name: input.name ? String(input.name) : (parsed.name || 'imported-session'),
        description: parsed.description,
        savedAt: new Date().toISOString(),
        stats,
        data: parsed.data,
      };
      saveSession(session);
      return {
        sessionId: newId,
        name: session.name,
        importedAt: session.savedAt,
        stats: {
          agentsImported: stats.agents,
          tasksImported: stats.tasks,
          memoryEntriesImported: stats.memoryEntries,
        },
        activated: input.activate === true,
      };
    },
  },
];
