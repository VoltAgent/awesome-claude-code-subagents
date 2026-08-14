#!/usr/bin/env node
/**
 * Standalone CLI shim for @claude-flow/plugin-iot-cognitum.
 * Maps `cognitum-iot <subcommand> [args]` -> CLICommandDefinition handlers.
 *
 * Endpoint defaults:
 *   - http://169.254.42.1 (USB-C link-local, no auth — read-only paths)
 *   - https://169.254.42.1:8443 (LAN/HTTPS + bearer — full access including writes)
 *
 * Auth: COGNITUM_SEED_TOKEN is read from process.env (loaded from .env in CWD
 * if present) and passed to register as the pairing/bearer token. When set,
 * the default endpoint switches to the HTTPS LAN address.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { IoTCognitumPlugin } from './plugin.js';
import type { PluginContext } from '@claude-flow/shared/src/plugin-interface.js';

const SEED_LINK_LOCAL = 'http://169.254.42.1';
const SEED_LAN_HTTPS = 'https://169.254.42.1:8443';

/**
 * Tiny .env loader. Walks up from CWD looking for a .env, reads KEY=VALUE
 * lines (ignoring blanks and # comments), and applies them to process.env
 * WITHOUT overwriting variables already set in the real environment.
 */
function loadDotenv(): { loaded: string | null; count: number } {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      const text = readFileSync(candidate, 'utf8');
      let count = 0;
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        // Strip surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
          count++;
        }
      }
      return { loaded: candidate, count };
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return { loaded: null, count: 0 };
}

loadDotenv();

const SEED_TOKEN = process.env.COGNITUM_SEED_TOKEN;
const SEED_DEFAULT_ENDPOINT =
  process.env.COGNITUM_SEED_ENDPOINT ?? (SEED_TOKEN ? SEED_LAN_HTTPS : SEED_LINK_LOCAL);

function makeContext(): PluginContext {
  // Minimal in-memory context for standalone CLI use.
  const noop = () => undefined;
  return {
    config: {
      fleetId: process.env.IOT_FLEET_ID ?? 'default',
      zoneId: process.env.IOT_ZONE_ID ?? 'zone-0',
      tlsInsecure: process.env.IOT_TLS_INSECURE !== 'false',
    },
    eventBus: {
      emit: noop,
      on: noop,
      off: noop,
      once: noop,
    } as unknown as PluginContext['eventBus'],
    logger: {
      info: (...a: unknown[]) => console.log('[info]', ...a),
      warn: (...a: unknown[]) => console.warn('[warn]', ...a),
      error: (...a: unknown[]) => console.error('[error]', ...a),
      debug: (...a: unknown[]) => process.env.DEBUG && console.error('[debug]', ...a),
    } as unknown as PluginContext['logger'],
    services: {
      get: () => undefined,
      register: noop,
      has: () => false,
    } as unknown as PluginContext['services'],
  };
}

interface ParsedArgs {
  _: string[];
  [k: string]: unknown;
}

/**
 * Parse argv minimally: positional -> _, --flag value, --flag=value, --boolean,
 * short -e value. Numeric values stay as strings (handlers coerce as needed).
 */
function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('-')) {
          out[key] = true;
        } else {
          out[key] = next;
          i++;
        }
      }
    } else if (a.startsWith('-') && a.length > 1) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function aliasShortToLong(args: ParsedArgs): ParsedArgs {
  // Most common short flags used across the iot commands.
  const aliases: Record<string, string> = {
    e: 'endpoint',
    f: 'fleet-id',
    z: 'zone-id',
    d: 'device-id',
    v: 'version',
    k: 'k',
    n: 'name',
    t: 'token',
  };
  for (const [s, l] of Object.entries(aliases)) {
    if (s in args && !(l in args)) {
      args[l] = args[s];
    }
  }
  return args;
}

/**
 * Resolve a subcommand path against command definitions.
 * Supports multi-word commands: `iot fleet add`, `iot firmware deploy`, etc.
 * Tries longest match first.
 */
function resolveCommand(
  argv: string[],
  commandNames: string[],
): { name: string; rest: string[] } | null {
  // Strip the leading "iot" prefix from each defined command for matching.
  const tokens = argv.slice();
  // Try longest match (3 tokens, then 2, then 1).
  for (const len of [3, 2, 1]) {
    if (tokens.length < len) continue;
    const probe = 'iot ' + tokens.slice(0, len).join(' ');
    if (commandNames.includes(probe)) {
      return { name: probe, rest: tokens.slice(len) };
    }
  }
  return null;
}

function printHelp(commandNames: string[]): void {
  console.log('cognitum-iot — Cognitum Seed device-agent CLI');
  console.log('');
  console.log('Usage: cognitum-iot <subcommand> [options]');
  console.log('');
  console.log('Default endpoint: ' + SEED_DEFAULT_ENDPOINT);
  console.log('  - http://169.254.42.1 (USB-C link-local, no auth, read-only)');
  console.log('  - https://169.254.42.1:8443 (LAN/HTTPS, COGNITUM_SEED_TOKEN required, full access)');
  console.log('');
  console.log('Auth: set COGNITUM_SEED_TOKEN in .env or environment to use the bearer-protected');
  console.log('      LAN endpoint and unlock writes (ingest, unpair, etc).');
  console.log('      Status: ' + (SEED_TOKEN ? '✓ token loaded' : '✗ no token (link-local only)'));
  console.log('');
  console.log('Hardware: get a Seed at https://cognitum.one');
  console.log('');
  console.log('Subcommands:');
  for (const n of commandNames) {
    console.log('  ' + n.replace(/^iot /, ''));
  }
  console.log('');
  console.log('Run "cognitum-iot <subcommand> --help" for command-specific options.');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    // Need to bootstrap to enumerate commands.
  }

  const plugin = new IoTCognitumPlugin();
  const context = makeContext();
  await plugin.initialize(context);

  const commands = plugin.registerCLICommands();
  const commandNames = commands.map((c) => c.name);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printHelp(commandNames);
    return;
  }

  const resolved = resolveCommand(argv, commandNames);
  if (!resolved) {
    console.error('Unknown subcommand: ' + argv.join(' '));
    console.error('Run "cognitum-iot --help" to list available subcommands.');
    process.exitCode = 1;
    return;
  }

  const cmd = commands.find((c) => c.name === resolved.name)!;
  const args = aliasShortToLong(parseArgs(resolved.rest));

  // Endpoint + token defaults for `iot register`.
  if (resolved.name === 'iot register') {
    if (!args['endpoint']) {
      args['endpoint'] = SEED_DEFAULT_ENDPOINT;
      console.error(`[info] No --endpoint supplied; defaulting to ${SEED_DEFAULT_ENDPOINT}`);
    }
    if (!args['token'] && SEED_TOKEN) {
      args['token'] = SEED_TOKEN;
      console.error('[info] Using COGNITUM_SEED_TOKEN from environment');
    }
  }

  try {
    await cmd.handler(args as never);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error: ' + msg);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error('Fatal: ' + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
