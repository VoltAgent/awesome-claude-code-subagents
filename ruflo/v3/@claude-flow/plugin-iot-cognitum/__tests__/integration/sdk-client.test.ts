import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SeedClient, type SeedClientOptions, AuthError } from '@cognitum-one/sdk/seed';

const SEED_ENDPOINT = process.env.SEED_ENDPOINT ?? 'http://169.254.42.1';
const SEED_TOKEN = process.env.SEED_PAIRING_TOKEN;
let client: SeedClient;

beforeAll(() => {
  const opts: SeedClientOptions = {
    endpoints: SEED_ENDPOINT,
    tls: { insecure: true },
    timeouts: { connect: 5_000, read: 10_000, total: 30_000 },
    retries: 2,
  };
  if (SEED_TOKEN) {
    opts.auth = { pairingToken: SEED_TOKEN };
  }
  client = new SeedClient(opts);
});

afterAll(() => {
  client.close();
});

// Skip when no Cognitum Seed device is reachable (no SEED_ENDPOINT or
// SEED_PAIRING_TOKEN configured). These are integration tests against
// real hardware — they time out at 30s when nothing answers, which is
// the wrong signal in CI.
const __SEED_ENABLED = !!process.env.SEED_PAIRING_TOKEN && !!process.env.SEED_ENDPOINT;

describe.skipIf(!__SEED_ENABLED).sequential('SeedClient against real device', () => {
  it('client.status() returns device info', async () => {
    const s = await client.status();
    expect(s.device_id).toBe('ecaf97dd-fc90-4b0e-b0e7-e9f896b9fbb6');
    expect(s.total_vectors).toBeGreaterThan(0);
    expect(s.paired).toBe(true);
    expect(s.dimension).toBe(8);
    expect(s.epoch).toBeGreaterThan(0);
    expect(s.uptime_secs).toBeGreaterThan(0);
    expect(s.roles).toEqual(expect.arrayContaining(['custody', 'optimizer', 'delivery']));
  });

  it('client.identity() returns Ed25519 key', async () => {
    const id = await client.identity();
    expect(id.device_id).toBe('ecaf97dd-fc90-4b0e-b0e7-e9f896b9fbb6');
    expect(id.public_key).toContain('PUBLIC KEY');
    expect(id.firmware_version).toBe('0.8.1');
  });

  it('client.pair.status() shows paired', async () => {
    const ps = await client.pair.status();
    expect(ps.paired).toBe(true);
    expect(ps.client_count).toBeGreaterThanOrEqual(1);
  });

  it('client.witness.chain() returns chain', async () => {
    const w = await client.witness.chain();
    // SDK maps wire `depth` to the WitnessChain shape; accept either field name
    const depth = (w as Record<string, unknown>).depth ?? w.length;
    expect(depth).toBeGreaterThan(0);
  });

  it('client.custody.epoch() returns epoch', async () => {
    const c = await client.custody.epoch();
    expect(c.epoch).toBeGreaterThan(20000);
  });

  it('client.store.status() returns store metrics', async () => {
    const ss = await client.store.status();
    expect(ss.total_vectors).toBeGreaterThan(20000);
    expect(ss.dimension).toBe(8);
    expect(ss.file_size_bytes).toBeGreaterThan(0);
  });

  it('client.store.query() searches vectors', async () => {
    const vector = Array.from({ length: 8 }, () => Math.random());
    const r = await client.store.query({ vector, k: 3 });
    expect(Array.isArray(r.results)).toBe(true);
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.length).toBeLessThanOrEqual(3);
    for (const hit of r.results) {
      expect(typeof hit.distance).toBe('number');
      expect(hit.id).toBeDefined();
    }
  });

  it('client.store.ingest() writes vectors', async () => {
    try {
      const r = await client.store.ingest({
        vectors: [{ values: Array.from({ length: 8 }, () => Math.random()) }],
      });
      expect(r.ingested).toBe(1);
      expect(r.epoch).toBeGreaterThan(0);
    } catch (err) {
      // Ingest requires pairing token; expect AuthError when no token is set
      if (!SEED_TOKEN) {
        expect(err).toBeInstanceOf(AuthError);
      } else {
        throw err;
      }
    }
  });

  it('client.mesh.status() returns mesh info', async () => {
    const m = await client.mesh.status();
    expect(m.device_id).toBe('ecaf97dd-fc90-4b0e-b0e7-e9f896b9fbb6');
    expect(typeof m.auto_mesh).toBe('boolean');
    expect(typeof m.peer_count).toBe('number');
  });

  it('client.mesh.peers() returns peer list', async () => {
    const p = await client.mesh.peers();
    expect(typeof p.count).toBe('number');
    expect(Array.isArray(p.peers)).toBe(true);
  });

  it('client.mesh.swarmStatus() returns swarm state', async () => {
    const s = await client.mesh.swarmStatus();
    expect(s.device_id).toBe('ecaf97dd-fc90-4b0e-b0e7-e9f896b9fbb6');
    expect(s.total_vectors).toBeGreaterThan(0);
    expect(s.epoch).toBeGreaterThan(0);
  });

  it('client.mesh.clusterHealth() returns cluster info', async () => {
    const c = await client.mesh.clusterHealth();
    expect(typeof c.peer_count).toBe('number');
    expect(typeof c.auto_sync_interval_secs).toBe('number');
  });
});
