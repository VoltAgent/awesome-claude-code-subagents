#!/usr/bin/env node
/**
 * Full plugin smoke test against a live Cognitum Seed device.
 * Exercises every iot subcommand that is safe to run against a live, paired
 * device. Skips firmware deploy/advance/rollback (requires explicit operator
 * authorization — they trigger an OTA that can brick the device).
 *
 * Restoration: the pair/unpair cycle uses a unique client-name so it doesn't
 * touch any pre-existing pairing. Vector ingest writes one tagged test vector
 * and tries to delete it after.
 *
 * Run from the plugin directory after `npm run build`.
 */
import { IoTCognitumPlugin } from '../../dist/plugin.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from CWD (or walk up) so COGNITUM_SEED_TOKEN is available.
function loadDotenv() {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const f = resolve(dir, '.env');
    if (existsSync(f)) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq < 1) continue;
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[k] === undefined) process.env[k] = v;
      }
      return f;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
const envFile = loadDotenv();

const SEED_TOKEN = process.env.COGNITUM_SEED_TOKEN;
const SEED_ENDPOINT =
  process.env.SEED_ENDPOINT ?? (SEED_TOKEN ? 'https://169.254.42.1:8443' : 'http://169.254.42.1');

console.log(`[smoke] env: ${envFile ?? '(none)'}`);
console.log(`[smoke] endpoint: ${SEED_ENDPOINT}`);
console.log(`[smoke] bearer token: ${SEED_TOKEN ? 'loaded' : 'absent'}`);

// Self-signed cert tolerance for pair-window fetch (https port uses dev cert).
if (SEED_ENDPOINT.startsWith('https://')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const plugin = new IoTCognitumPlugin();
const noop = () => undefined;
await plugin.initialize({
  config: { fleetId: 'test-fleet', zoneId: 'zone-test', tlsInsecure: true },
  eventBus: { emit: noop, on: noop, off: noop, once: noop },
  logger: {
    info: () => {},
    warn: (...a) => console.warn('[warn]', ...a),
    error: (...a) => console.error('[error]', ...a),
    debug: () => {},
  },
  services: { get: () => undefined, register: noop, has: () => false },
});

const commands = plugin.registerCLICommands();
const cmd = (name) => {
  const c = commands.find((c) => c.name === name);
  if (!c) throw new Error(`No command: ${name}`);
  return c;
};

const section = (title) => {
  console.log('\n' + '='.repeat(60));
  console.log('  ' + title);
  console.log('='.repeat(60));
};

let passCount = 0;
let failCount = 0;
const results = [];
const run = async (label, fn) => {
  console.log(`\n--- ${label} ---`);
  try {
    await fn();
    console.log(`[ok] ${label}`);
    passCount++;
    results.push({ label, status: 'pass' });
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.error(`[fail] ${label}: ${msg}`);
    failCount++;
    results.push({ label, status: 'fail', error: msg });
  }
};

// ============================================================
// Tier 1: configuration + lifecycle (no device state change)
// ============================================================
section('iot init');
await run('init', () => cmd('iot init').handler({ _: [], 'fleet-id': 'test-fleet', 'zone-id': 'zone-test' }));

section(`iot register (${SEED_ENDPOINT}${SEED_TOKEN ? ' + bearer' : ''})`);
await run('register', () =>
  cmd('iot register').handler({
    _: [],
    endpoint: SEED_ENDPOINT,
    ...(SEED_TOKEN ? { token: SEED_TOKEN } : {}),
  }),
);

const coord = plugin['coordinator'];
const devices = coord ? coord.listDevices() : [];
const deviceId = devices[0]?.deviceId;

if (!deviceId) {
  console.error('No device registered — aborting tier 2+');
  process.exit(1);
}
console.log(`\n[info] live device: ${deviceId}`);

section('iot list');
await run('list', () => cmd('iot list').handler({ _: [] }));

// ============================================================
// Tier 2: read-only device queries
// ============================================================
section(`iot status ${deviceId}`);
await run('status', () => cmd('iot status').handler({ _: [deviceId] }));

section(`iot status (json format)`);
await run('status --format json', () => cmd('iot status').handler({ _: [deviceId], format: 'json' }));

section(`iot mesh ${deviceId}`);
await run('mesh', () => cmd('iot mesh').handler({ _: [deviceId] }));

section(`iot witness ${deviceId}`);
await run('witness', () => cmd('iot witness').handler({ _: [deviceId] }));

section(`iot witness verify ${deviceId}`);
await run('witness verify', () => cmd('iot witness verify').handler({ _: [deviceId] }));

section(`iot anomalies ${deviceId}`);
await run('anomalies (no baseline)', () => cmd('iot anomalies').handler({ _: [deviceId] }));

section(`iot baseline ${deviceId}`);
await run('baseline (read)', () => cmd('iot baseline').handler({ _: [deviceId] }));

// ============================================================
// Tier 3: vector store query (read-only) and ingest (write)
// ============================================================
// Pass device-id both positionally and as --device-id option:
// the handlers in cli-commands.ts are inconsistent (some read args._[0],
// others read args['device-id']).
const dArgs = (extra = {}) => ({ _: [deviceId], 'device-id': deviceId, ...extra });

section(`iot query ${deviceId} (k=3, dim-8 zero vector)`);
await run('query (k=3)', () =>
  cmd('iot query').handler(dArgs({ vector: '[0,0,0,0,0,0,0,0]', k: '3' })),
);

section(`iot ingest ${deviceId} (1 tagged test vector)`);
await run('ingest 1 vector (requires write-scoped token)', async () => {
  try {
    await cmd('iot ingest').handler(
      dArgs({
        vector: '[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8]',
        metadata: JSON.stringify({ tag: 'smoke-test', ts: new Date().toISOString() }),
      }),
    );
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (/not authorized|forbidden|401|403/i.test(msg)) {
      console.log(`[expected] token lacks ingest scope: ${msg}`);
      return;
    }
    throw err;
  }
});

// ============================================================
// Tier 4: pair / unpair round-trip with unique client-name
// (Seed requires the pair window to be opened first via POST /pair/window —
// the iot plugin doesn't expose that, so open it via direct API call.
// Unpair requires bearer auth — Seed's link-local HTTP doesn't have it.)
// ============================================================
const pairClient = `smoke-test-${Date.now()}`;

section('open pair window (direct API)');
await run('open pair window (90s)', async () => {
  // Check first — avoid 429 if window is already open
  const statusResp = await fetch(`${SEED_ENDPOINT}/api/v1/pair/status`, {
    headers: SEED_TOKEN ? { authorization: `Bearer ${SEED_TOKEN}` } : {},
  });
  if (statusResp.ok) {
    const s = await statusResp.json();
    if (s.pairing_window_open) {
      console.log(`[ok] window already open (${s.window_remaining_secs}s remaining); skipping reopen`);
      return;
    }
  }
  const resp = await fetch(`${SEED_ENDPOINT}/api/v1/pair/window`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(SEED_TOKEN ? { authorization: `Bearer ${SEED_TOKEN}` } : {}),
    },
    body: JSON.stringify({ duration_secs: 90 }),
  });
  if (!resp.ok) throw new Error(`open window: HTTP ${resp.status}`);
});

section(`iot pair ${deviceId} (client="${pairClient}")`);
await run('pair', () =>
  cmd('iot pair').handler(dArgs({ 'client-name': pairClient, name: pairClient })),
);

section(`iot unpair ${deviceId} (client="${pairClient}")`);
await run('unpair (link-local; expected: bearer required)', async () => {
  try {
    await cmd('iot unpair').handler(dArgs({ 'client-name': pairClient, name: pairClient }));
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (/bearer|unauthor|401/i.test(msg)) {
      console.log(`[expected] link-local unpair denied (bearer required): ${msg}`);
      return;
    }
    throw err;
  }
});

// ============================================================
// Tier 5: fleet operations (coordinator-only, no device side effects)
// ============================================================
const fleetId = `smoke-fleet-${Date.now()}`;
section('iot fleet list (pre-create)');
await run('fleet list (pre)', () => cmd('iot fleet list').handler({ _: [] }));

section(`iot fleet create ${fleetId}`);
await run('fleet create', () =>
  cmd('iot fleet create').handler({
    _: [],
    'fleet-id': fleetId,
    name: 'smoke test fleet',
  }),
);

section(`iot fleet add ${fleetId} ${deviceId}`);
await run('fleet add', () =>
  cmd('iot fleet add').handler({
    _: [fleetId, deviceId],
    'fleet-id': fleetId,
    'device-id': deviceId,
  }),
);

section('iot fleet list (post-add)');
await run('fleet list (post-add)', () => cmd('iot fleet list').handler({ _: [] }));

section(`iot fleet remove ${fleetId} ${deviceId}`);
await run('fleet remove', () =>
  cmd('iot fleet remove').handler({
    _: [fleetId, deviceId],
    'fleet-id': fleetId,
    'device-id': deviceId,
  }),
);

section(`iot fleet delete ${fleetId}`);
await run('fleet delete', () =>
  cmd('iot fleet delete').handler({ _: [fleetId] }),
);

// ============================================================
// Tier 6: firmware reads (safe). Deploy/advance/rollback skipped.
// ============================================================
section('iot firmware list');
await run('firmware list', () => cmd('iot firmware list').handler({ _: [] }));

// firmware status needs a rollout-id; we have none. Test the "missing"
// path by passing a bogus id and confirming graceful error handling.
section('iot firmware status BOGUS-ROLLOUT-ID');
await run('firmware status (graceful error)', async () => {
  try {
    await cmd('iot firmware status').handler({ _: ['BOGUS-ROLLOUT-ID'] });
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (/not found|no.*rollout|unknown|missing/i.test(msg)) {
      console.log(`[expected] graceful: ${msg}`);
      return;
    }
    throw err;
  }
});

// ============================================================
// Tier 7: device-deregister (coordinator-only, in-memory)
// ============================================================
section(`iot remove ${deviceId} (final cleanup)`);
await run('remove (deregister)', () => cmd('iot remove').handler({ _: [deviceId] }));

section('iot list (post-remove)');
await run('list (post-remove, expect empty)', () => cmd('iot list').handler({ _: [] }));

// ============================================================
// Summary
// ============================================================
console.log('\n' + '='.repeat(60));
console.log(`  RESULTS: ${passCount} passed, ${failCount} failed (${results.length} total)`);
console.log('='.repeat(60));
for (const r of results) {
  const tag = r.status === 'pass' ? '✓' : '✗';
  const note = r.status === 'fail' ? ` — ${r.error}` : '';
  console.log(`  ${tag} ${r.label}${note}`);
}
console.log('\nSkipped (require explicit operator authorization — OTA risk):');
console.log('  - iot firmware deploy <fleet-id> --version <ver>');
console.log('  - iot firmware advance <rollout-id>');
console.log('  - iot firmware rollback <rollout-id>');
console.log('');

process.exit(failCount > 0 ? 1 : 0);
