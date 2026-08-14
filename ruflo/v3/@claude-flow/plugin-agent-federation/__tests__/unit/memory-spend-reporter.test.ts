/**
 * Tests for ADR-110 — MemorySpendReporter (production SpendReporter
 * adapter).
 *
 * Pins the cost-tracker consumer contract:
 *   1. Namespace defaults to `federation-spend` (override accepted)
 *   2. Key shape EXACTLY `fed-spend-<peerId>-<ts>` (drift here breaks
 *      the consumer in plugins/ruflo-cost-tracker/scripts/federation.mjs)
 *   3. TTL defaults to 7 days (override accepted)
 *   4. Stored value round-trips every field of FederationSpendEvent
 *   5. Memory backend errors bubble up (no swallow)
 *   6. Negative tokens/usd persisted as-is (audit honesty — clamping
 *      is the breaker's job, not the reporter's)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MemorySpendReporter,
  DEFAULT_FEDERATION_SPEND_NAMESPACE,
  DEFAULT_FEDERATION_SPEND_TTL_SECONDS,
  type MemoryStore,
  type FederationSpendEvent,
} from '../../src/application/spend-reporter.js';

function mkStore(): MemoryStore & { calls: Parameters<MemoryStore['store']>[0][] } {
  const calls: Parameters<MemoryStore['store']>[0][] = [];
  return {
    calls,
    store: async (args) => { calls.push(args); },
  };
}

const baseEvent: FederationSpendEvent = {
  peerId: 'peer-alpha',
  taskId: 'task-1',
  tokensUsed: 1500,
  usdSpent: 0.075,
  success: true,
  ts: '2026-05-09T22:00:00.000Z',
};

describe('MemorySpendReporter — defaults', () => {
  it('uses default namespace when not configured', async () => {
    const store = mkStore();
    const reporter = new MemorySpendReporter({ memoryStore: store });
    await reporter.reportSpend(baseEvent);
    expect(store.calls[0].namespace).toBe(DEFAULT_FEDERATION_SPEND_NAMESPACE);
    expect(store.calls[0].namespace).toBe('federation-spend');
  });

  it('uses default TTL when not configured', async () => {
    const store = mkStore();
    const reporter = new MemorySpendReporter({ memoryStore: store });
    await reporter.reportSpend(baseEvent);
    expect(store.calls[0].ttl).toBe(DEFAULT_FEDERATION_SPEND_TTL_SECONDS);
    expect(store.calls[0].ttl).toBe(7 * 24 * 60 * 60);
  });

  it('exposes configured namespace + ttl via getters (doctor/debug surface)', () => {
    const reporter = new MemorySpendReporter({ memoryStore: mkStore() });
    expect(reporter.getNamespace()).toBe('federation-spend');
    expect(reporter.getTtlSeconds()).toBe(7 * 24 * 60 * 60);
  });
});

describe('MemorySpendReporter — overrides', () => {
  it('accepts custom namespace', async () => {
    const store = mkStore();
    const reporter = new MemorySpendReporter({
      memoryStore: store,
      namespace: 'custom-spend',
    });
    await reporter.reportSpend(baseEvent);
    expect(store.calls[0].namespace).toBe('custom-spend');
  });

  it('accepts custom TTL', async () => {
    const store = mkStore();
    const reporter = new MemorySpendReporter({
      memoryStore: store,
      ttlSeconds: 30 * 24 * 60 * 60, // 30 days for accounting retention
    });
    await reporter.reportSpend(baseEvent);
    expect(store.calls[0].ttl).toBe(30 * 24 * 60 * 60);
  });
});

describe('MemorySpendReporter — key shape (cost-tracker contract)', () => {
  it('uses literal `fed-spend-<peerId>-<ts>` shape', async () => {
    const store = mkStore();
    const reporter = new MemorySpendReporter({ memoryStore: store });
    await reporter.reportSpend(baseEvent);
    expect(store.calls[0].key).toBe('fed-spend-peer-alpha-2026-05-09T22:00:00.000Z');
  });

  it('different (peerId, ts) tuples produce distinct keys', async () => {
    const store = mkStore();
    const reporter = new MemorySpendReporter({ memoryStore: store });
    await reporter.reportSpend({ ...baseEvent, peerId: 'a', ts: 't1' });
    await reporter.reportSpend({ ...baseEvent, peerId: 'a', ts: 't2' });
    await reporter.reportSpend({ ...baseEvent, peerId: 'b', ts: 't1' });
    expect(store.calls.map((c) => c.key)).toEqual([
      'fed-spend-a-t1',
      'fed-spend-a-t2',
      'fed-spend-b-t1',
    ]);
  });
});

describe('MemorySpendReporter — value round-trip', () => {
  it('preserves every field of FederationSpendEvent', async () => {
    const store = mkStore();
    const reporter = new MemorySpendReporter({ memoryStore: store });
    await reporter.reportSpend(baseEvent);
    const value = JSON.parse(store.calls[0].value);
    expect(value).toEqual({
      peerId: 'peer-alpha',
      taskId: 'task-1',
      tokensUsed: 1500,
      usdSpent: 0.075,
      success: true,
      ts: '2026-05-09T22:00:00.000Z',
    });
  });

  it('null-fills missing taskId (optional field)', async () => {
    const store = mkStore();
    const reporter = new MemorySpendReporter({ memoryStore: store });
    const noTask: FederationSpendEvent = {
      peerId: 'peer-alpha',
      tokensUsed: 100,
      usdSpent: 0.01,
      success: true,
      ts: '2026-05-09T22:00:00.000Z',
    };
    await reporter.reportSpend(noTask);
    const value = JSON.parse(store.calls[0].value);
    expect(value.taskId).toBeNull();
  });
});

describe('MemorySpendReporter — anti-malice & honesty', () => {
  it('persists negative tokens/usd as-is (clamping is the breakers job, not the reporters)', async () => {
    const store = mkStore();
    const reporter = new MemorySpendReporter({ memoryStore: store });
    await reporter.reportSpend({ ...baseEvent, tokensUsed: -1000, usdSpent: -100 });
    const value = JSON.parse(store.calls[0].value);
    // Honest mirror — the breaker handles policy, the reporter is the audit trail.
    expect(value.tokensUsed).toBe(-1000);
    expect(value.usdSpent).toBe(-100);
  });

  it('memory backend errors bubble up (no swallow)', async () => {
    const reporter = new MemorySpendReporter({
      memoryStore: {
        store: async () => { throw new Error('storage backend down'); },
      },
    });
    await expect(reporter.reportSpend(baseEvent)).rejects.toThrow('storage backend down');
  });

  it('failure outcome is preserved (drives breaker failure-ratio)', async () => {
    const store = mkStore();
    const reporter = new MemorySpendReporter({ memoryStore: store });
    await reporter.reportSpend({ ...baseEvent, success: false });
    const value = JSON.parse(store.calls[0].value);
    expect(value.success).toBe(false);
  });
});

describe('MemorySpendReporter — wires into coordinator.reportSpend fan-out', () => {
  it('integrates with FederationCoordinator via the SpendReporter interface', async () => {
    // Smoke: the reporter satisfies SpendReporter so the coordinator's
    // fan-out (covered in coordinator-spend-reporting.test.ts) accepts
    // it as a drop-in. We assert structural compatibility here without
    // re-running the full coordinator spec.
    const store = mkStore();
    const reporter: import('../../src/application/spend-reporter.js').SpendReporter =
      new MemorySpendReporter({ memoryStore: store });
    expect(typeof reporter.reportSpend).toBe('function');
    await reporter.reportSpend(baseEvent);
    expect(store.calls).toHaveLength(1);
  });
});
