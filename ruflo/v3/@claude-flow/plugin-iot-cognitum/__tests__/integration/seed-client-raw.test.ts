import { describe, it, expect } from 'vitest';

const SEED_ENDPOINT = process.env.SEED_ENDPOINT ?? 'http://169.254.42.1';
const SEED_TOKEN = process.env.SEED_PAIRING_TOKEN;

/** Retry-aware fetch for embedded hardware (link-local, rate-limited). */
async function seedFetch(
  url: string,
  init?: RequestInit,
  retries = 3,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
      if (res.status === 429 && attempt < retries) {
        // Honour the device's rate-limit backoff
        const retryAfter = res.headers.get('retry-after');
        const delayMs = retryAfter ? Number(retryAfter) * 1_000 : 1_500;
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

// Skip when no Cognitum Seed device is reachable (no SEED_ENDPOINT or
// SEED_PAIRING_TOKEN configured). These hit a hardware endpoint at
// 169.254.42.1 by default — they 30s-time-out in CI without a device.
const __SEED_ENABLED = !!process.env.SEED_PAIRING_TOKEN && !!process.env.SEED_ENDPOINT;

describe.skipIf(!__SEED_ENABLED).sequential('Cognitum Seed Raw HTTP (real device)', () => {
  it('GET /api/v1/status returns valid device status', async () => {
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/status`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.device_id).toBe('ecaf97dd-fc90-4b0e-b0e7-e9f896b9fbb6');
    expect(data.paired).toBe(true);
    expect(data.total_vectors).toBeGreaterThan(0);
    expect(data.dimension).toBe(8);
    expect(data.epoch).toBeGreaterThan(0);
    expect(data.uptime_secs).toBeGreaterThan(0);
    expect(data.roles).toEqual(expect.arrayContaining(['custody', 'optimizer', 'delivery']));
  });

  it('GET /api/v1/identity returns Ed25519 public key', async () => {
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/identity`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.device_id).toBe('ecaf97dd-fc90-4b0e-b0e7-e9f896b9fbb6');
    expect(data.public_key).toContain('BEGIN PUBLIC KEY');
    expect(data.firmware_version).toBe('0.8.1');
    expect(data.dimension).toBe(8);
    expect(data.epoch).toBeGreaterThan(0);
  });

  it('GET /api/v1/pair/status shows paired state', async () => {
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/pair/status`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.paired).toBe(true);
    expect(data.client_count).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/store/status returns vector store metrics', async () => {
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/store/status`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.total_vectors).toBeGreaterThan(20000);
    expect(data.dimension).toBe(8);
    expect(data.file_size_bytes).toBeGreaterThan(0);
    expect(data.witness_chain_length).toBeGreaterThan(40000);
    expect(data.epoch).toBeGreaterThan(0);
  });

  it('GET /api/v1/witness/chain returns chain state', async () => {
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/witness/chain`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.depth).toBeGreaterThan(40000);
    expect(data.epoch).toBeGreaterThan(0);
    expect(data.head_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('GET /api/v1/custody/epoch returns epoch', async () => {
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/custody/epoch`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.epoch).toBeGreaterThan(20000);
  });

  it('GET /api/v1/network/mesh/status returns mesh info', async () => {
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/network/mesh/status`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.device_id).toBe('ecaf97dd-fc90-4b0e-b0e7-e9f896b9fbb6');
    expect(typeof data.auto_mesh).toBe('boolean');
    expect(typeof data.peer_count).toBe('number');
    expect(Array.isArray(data.peers)).toBe(true);
  });

  it('GET /api/v1/peers returns discovery info', async () => {
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/peers`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(typeof data.count).toBe('number');
    expect(Array.isArray(data.peers)).toBe(true);
    expect(typeof data.discovery_active).toBe('boolean');
  });

  it('GET /api/v1/swarm/status returns swarm state', async () => {
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/swarm/status`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.device_id).toBe('ecaf97dd-fc90-4b0e-b0e7-e9f896b9fbb6');
    expect(data.total_vectors).toBeGreaterThan(0);
    expect(data.epoch).toBeGreaterThan(0);
    expect(data.uptime_secs).toBeGreaterThan(0);
  });

  it('GET /api/v1/cluster/health returns cluster info', async () => {
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/cluster/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(typeof data.auto_sync_interval_secs).toBe('number');
    expect(typeof data.peer_count).toBe('number');
    expect(typeof data.cluster_enabled).toBe('boolean');
  });

  it('POST /api/v1/store/query returns vector search results', async () => {
    const vector = Array.from({ length: 8 }, () => Math.random());
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/store/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, k: 5 }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeLessThanOrEqual(5);
    expect(data.results.length).toBeGreaterThan(0);
    for (const hit of data.results) {
      expect(typeof hit.distance).toBe('number');
      expect(hit.distance).toBeGreaterThanOrEqual(0);
      expect(hit.id).toBeDefined();
    }
  });

  it('POST /api/v1/store/ingest writes vectors to device', async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (SEED_TOKEN) headers['Authorization'] = `Bearer ${SEED_TOKEN}`;
    const vectors = [{ values: Array.from({ length: 8 }, () => Math.random()) }];
    const res = await seedFetch(`${SEED_ENDPOINT}/api/v1/store/ingest`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ vectors }),
    });
    if (!SEED_TOKEN && res.status === 403) {
      // Ingest requires pairing token; skip gracefully when not provided
      expect(res.status).toBe(403);
      return;
    }
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.ingested).toBe(1);
    expect(data.epoch).toBeGreaterThan(0);
    expect(data.witness_chain_length).toBeGreaterThan(0);
  });
});
