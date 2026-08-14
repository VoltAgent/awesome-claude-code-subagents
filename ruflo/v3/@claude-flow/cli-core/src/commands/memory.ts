/**
 * `memory` CLI subcommand — wires the JsonMemoryBackend to the
 * cli-core executable so `npx @claude-flow/cli-core@alpha memory store ...`
 * actually persists data.
 *
 * Supports the subset of memory commands plugin scripts depend on:
 *   memory store <key> <value> [--namespace] [--tags] [--ttl] [--upsert]
 *   memory retrieve <key> [--namespace]
 *   memory list [--namespace] [--limit] [--tags]
 *   memory search <query> [--namespace] [--limit] [--threshold]
 *   memory delete <key> [--namespace]
 *   memory stats
 *
 * Honors --format=json on every subcommand so scripts can pipe to jq.
 */

import { JsonMemoryBackend } from '../memory/json-backend.js';

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[a.slice(2)] = argv[++i];
      } else {
        flags[a.slice(2)] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function asString(v: string | boolean | undefined, fallback?: string): string | undefined {
  if (typeof v === 'string') return v;
  return fallback;
}

function asNumber(v: string | boolean | undefined, fallback?: number): number | undefined {
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function asBoolean(v: string | boolean | undefined): boolean {
  return v === true || v === 'true';
}

function parseValue(raw: string): unknown {
  // If it parses as JSON, store as JSON; else store as-is.
  try { return JSON.parse(raw); } catch { return raw; }
}

function emit(format: string | undefined, data: unknown, human: () => void): void {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    human();
  }
}

export async function runMemoryCommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const { positional, flags } = parseArgs(rest);
  const backend = new JsonMemoryBackend({ path: asString(flags.path) });
  const namespace = asString(flags.namespace, 'default')!;
  const format = asString(flags.format);

  try {
    switch (sub) {
      case 'store': {
        // Accept BOTH positional `<key> <value>` AND --key=K --value=V
        // (drop-in compat with @claude-flow/cli's memory store).
        const [posKey, ...posValueParts] = positional;
        const key = asString(flags.key) ?? posKey;
        const valueRaw = asString(flags.value) ?? posValueParts.join(' ');
        if (!key || !valueRaw) {
          console.error('usage: memory store <key> <value> [--namespace=NS] [--tags=t1,t2] [--ttl=N] [--upsert]');
          console.error('       memory store --key K --value V [--namespace=NS] ...   (flag form)');
          return 2;
        }
        await backend.store(key, parseValue(valueRaw), {
          namespace,
          tags: asString(flags.tags)?.split(',').map((s) => s.trim()).filter(Boolean) ?? [],
          ttl: asNumber(flags.ttl),
          upsert: asBoolean(flags.upsert),
        });
        emit(format, { ok: true, key, namespace }, () => {
          console.log(`✓ stored ${namespace}::${key}`);
        });
        return 0;
      }

      case 'retrieve':
      case 'get': {
        const key = asString(flags.key) ?? positional[0];
        if (!key) {
          console.error('usage: memory retrieve <key> [--namespace=NS]');
          console.error('       memory retrieve --key K [--namespace=NS]   (flag form)');
          return 2;
        }
        const entry = await backend.retrieve(key, { namespace });
        if (!entry) {
          emit(format, { ok: false, error: 'not found' }, () => {
            console.error(`memory: not found — ${namespace}::${key}`);
          });
          return 1;
        }
        emit(format, entry, () => {
          console.log(JSON.stringify(entry.value, null, 2));
        });
        return 0;
      }

      case 'list': {
        const entries = await backend.list({
          namespace: namespace === 'default' && flags.namespace === undefined ? undefined : namespace,
          limit: asNumber(flags.limit, 100),
          tags: asString(flags.tags)?.split(',').map((s) => s.trim()).filter(Boolean),
        });
        emit(format, entries, () => {
          if (entries.length === 0) {
            console.log('(no entries)');
            return;
          }
          for (const e of entries) {
            console.log(`${e.namespace}::${e.key}  [${e.tags.join(',')}]  ${e.storedAt}`);
          }
        });
        return 0;
      }

      case 'search': {
        const query = positional.join(' ') || asString(flags.query);
        if (!query) {
          console.error('usage: memory search <query> [--namespace=NS] [--limit=N] [--threshold=N]');
          return 2;
        }
        const results = await backend.search(query, {
          namespace: namespace === 'default' && flags.namespace === undefined ? undefined : namespace,
          limit: asNumber(flags.limit, 10),
          threshold: asNumber(flags.threshold, 0),
        });
        emit(format, results, () => {
          if (results.length === 0) {
            console.log('(no matches)');
            return;
          }
          for (const r of results) {
            console.log(`[${r.score.toFixed(2)}] ${r.namespace}::${r.key}`);
          }
        });
        return 0;
      }

      case 'delete':
      case 'rm': {
        const key = asString(flags.key) ?? positional[0];
        if (!key) {
          console.error('usage: memory delete <key> [--namespace=NS]');
          console.error('       memory delete --key K [--namespace=NS]   (flag form)');
          return 2;
        }
        const ok = await backend.delete(key, { namespace });
        emit(format, { ok }, () => {
          console.log(ok ? `✓ deleted ${namespace}::${key}` : `(no-op: ${namespace}::${key} not found)`);
        });
        return ok ? 0 : 1;
      }

      case 'stats': {
        const stats = await backend.stats();
        emit(format, stats, () => {
          console.log(`backend:    ${stats.backend}`);
          console.log(`entries:    ${stats.totalEntries}`);
          console.log(`namespaces: ${stats.namespaces.join(', ') || '(none)'}`);
          console.log(`size:       ${stats.sizeBytes} bytes`);
        });
        return 0;
      }

      default:
        console.error(`memory: unknown subcommand "${sub}"
Subcommands: store, retrieve, list, search, delete, stats`);
        return 2;
    }
  } catch (err) {
    console.error(`memory ${sub}: ${(err as Error).message}`);
    return 1;
  }
}
