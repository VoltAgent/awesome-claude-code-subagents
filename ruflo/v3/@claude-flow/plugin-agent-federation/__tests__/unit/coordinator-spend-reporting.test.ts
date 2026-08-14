/**
 * Tests for ADR-097 Phase 3 upstream — coordinator spend reporting.
 *
 * Pins the fan-out semantics of FederationCoordinator.reportSpend():
 *
 *   1. With NO integrations wired → silent no-op (callers don't branch
 *      on configuration).
 *   2. With only spendReporter → reporter receives the event, breaker
 *      buffer untouched.
 *   3. With only breakerService → buffer receives the outcome, reporter
 *      not called.
 *   4. With both → both receive, in parallel; reporter event shape
 *      matches the cost-tracker consumer contract verbatim
 *      (peerId/taskId/tokensUsed/usdSpent/ts/success).
 *   5. ts is auto-filled when caller omits.
 *   6. Reporter throw bubbles up — NOT swallowed (integrator
 *      responsibility to retry/buffer).
 */

import { describe, it, expect, vi } from 'vitest';
import { FederationCoordinator } from '../../src/application/federation-coordinator.js';
import { FederationBreakerService } from '../../src/application/federation-breaker-service.js';
import {
  InMemorySpendReporter,
  type SpendReporter,
} from '../../src/application/spend-reporter.js';

function mkCoordinator(integrations: {
  spendReporter?: SpendReporter;
  breakerService?: FederationBreakerService;
} = {}) {
  const noop = {} as never;
  const discovery = {
    listPeers: () => [],
    getPeer: () => undefined,
    publishManifest: vi.fn(),
    startPeriodicDiscovery: vi.fn(),
    stopPeriodicDiscovery: vi.fn(),
    addStaticPeer: vi.fn(),
    removePeer: vi.fn(),
  };
  return new FederationCoordinator(
    {
      nodeId: 'self',
      publicKey: 'self-pk',
      endpoint: 'https://self.test',
      capabilities: [],
    },
    discovery as never,
    noop, // handshake
    noop, // routing
    { log: vi.fn(async () => undefined), flush: vi.fn(async () => undefined) } as never,
    noop, // pii
    noop, // trust
    noop, // policy
    integrations,
  );
}

describe('FederationCoordinator.reportSpend (ADR-097 Phase 3 upstream)', () => {
  describe('no integrations wired', () => {
    it('is a silent no-op', async () => {
      const coord = mkCoordinator();
      await expect(
        coord.reportSpend({
          peerId: 'peer-1',
          tokensUsed: 100,
          usdSpent: 0.1,
          success: true,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('with spendReporter only', () => {
    it('forwards the event with caller-supplied ts', async () => {
      const reporter = new InMemorySpendReporter();
      const coord = mkCoordinator({ spendReporter: reporter });
      const ts = '2026-05-09T20:00:00.000Z';
      await coord.reportSpend({
        peerId: 'peer-1',
        taskId: 'task-42',
        tokensUsed: 100,
        usdSpent: 0.1,
        success: true,
        ts,
      });
      const events = reporter.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        peerId: 'peer-1',
        taskId: 'task-42',
        tokensUsed: 100,
        usdSpent: 0.1,
        success: true,
        ts,
      });
    });

    it('auto-fills ts when caller omits', async () => {
      const reporter = new InMemorySpendReporter();
      const coord = mkCoordinator({ spendReporter: reporter });
      const before = Date.now();
      await coord.reportSpend({
        peerId: 'peer-1',
        tokensUsed: 0,
        usdSpent: 0,
        success: true,
      });
      const after = Date.now();
      const ev = reporter.getEvents()[0];
      const evTime = new Date(ev.ts).getTime();
      expect(evTime).toBeGreaterThanOrEqual(before);
      expect(evTime).toBeLessThanOrEqual(after);
    });

    it('matches the cost-tracker consumer contract shape', async () => {
      const reporter = new InMemorySpendReporter();
      const coord = mkCoordinator({ spendReporter: reporter });
      await coord.reportSpend({
        peerId: 'peer-1',
        taskId: 'task-1',
        tokensUsed: 1000,
        usdSpent: 0.05,
        success: true,
        ts: '2026-05-09T20:00:00.000Z',
      });
      const ev = reporter.getEvents()[0];
      // Pin every field the consumer in
      // plugins/ruflo-cost-tracker/scripts/federation.mjs reads.
      expect(Object.keys(ev).sort()).toEqual(
        ['peerId', 'success', 'taskId', 'tokensUsed', 'ts', 'usdSpent'].sort(),
      );
    });

    it('reporter throw bubbles to caller (no swallow)', async () => {
      const reporter: SpendReporter = {
        reportSpend: async () => {
          throw new Error('backend unreachable');
        },
      };
      const coord = mkCoordinator({ spendReporter: reporter });
      await expect(
        coord.reportSpend({
          peerId: 'peer-1',
          tokensUsed: 0,
          usdSpent: 0,
          success: true,
        }),
      ).rejects.toThrow('backend unreachable');
    });
  });

  describe('with breakerService only', () => {
    it('feeds the breaker rolling buffer', async () => {
      const breaker = new FederationBreakerService();
      const coord = mkCoordinator({ breakerService: breaker });
      await coord.reportSpend({
        peerId: 'peer-1',
        tokensUsed: 100,
        usdSpent: 1.5,
        success: true,
      });
      const snap = breaker.snapshot('peer-1');
      expect(snap.sampleCount).toBe(1);
      expect(snap.cumUsdInWindow).toBe(1.5);
    });

    it('failure outcomes counted in failure-ratio', async () => {
      const breaker = new FederationBreakerService();
      const coord = mkCoordinator({ breakerService: breaker });
      // 6 failures + 4 successes — should drive ratio toward 0.6
      for (let i = 0; i < 10; i++) {
        await coord.reportSpend({
          peerId: 'peer-1',
          tokensUsed: 0,
          usdSpent: 0,
          success: i >= 6,
        });
      }
      const snap = breaker.snapshot('peer-1');
      expect(snap.sampleCount).toBe(10);
      expect(snap.failureRatioInWindow).toBeCloseTo(0.6, 2);
    });
  });

  describe('with both integrations', () => {
    it('fans out to both — reporter receives event, breaker receives outcome', async () => {
      const reporter = new InMemorySpendReporter();
      const breaker = new FederationBreakerService();
      const coord = mkCoordinator({ spendReporter: reporter, breakerService: breaker });
      await coord.reportSpend({
        peerId: 'peer-1',
        tokensUsed: 100,
        usdSpent: 0.1,
        success: true,
        ts: '2026-05-09T20:00:00.000Z',
      });
      expect(reporter.getEvents()).toHaveLength(1);
      expect(breaker.snapshot('peer-1').sampleCount).toBe(1);
    });
  });
});

describe('InMemorySpendReporter (reference implementation)', () => {
  it('buffers events in order', async () => {
    const r = new InMemorySpendReporter();
    await r.reportSpend({ peerId: 'a', tokensUsed: 0, usdSpent: 1, success: true, ts: 't1' });
    await r.reportSpend({ peerId: 'b', tokensUsed: 0, usdSpent: 2, success: false, ts: 't2' });
    expect(r.getEvents().map((e) => e.peerId)).toEqual(['a', 'b']);
  });

  it('clear() drops everything', async () => {
    const r = new InMemorySpendReporter();
    await r.reportSpend({ peerId: 'a', tokensUsed: 0, usdSpent: 1, success: true, ts: 't1' });
    r.clear();
    expect(r.getEvents()).toEqual([]);
  });
});
