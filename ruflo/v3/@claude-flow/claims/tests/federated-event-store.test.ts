/**
 * Federated event store tests.
 *
 * Coverage targets (per ADR-101 Component B):
 *   - vector-clock advances on each local append
 *   - remote events that strictly precede local state are no-ops
 *   - remote events concurrent with local state throw ConcurrentWriteError
 *   - PII detected during publish rolls back the local append
 *   - HLC merges from remote events
 *   - subscribe / getEvents / getEventsByType / getEventsByIssueId pass through
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { InMemoryClaimEventStore } from '../src/infrastructure/event-store';
import {
  FederatedClaimEventStore,
  ConcurrentWriteError,
} from '../src/infrastructure/federated-event-store';
import {
  FederationBridge,
  type IFederationTransport,
  PiiLeakPreventedError,
} from '../src/infrastructure/federation-bridge';
import { LocalHlc } from '../src/infrastructure/hlc';
import {
  zeroVectorClock,
  tickVectorClock,
  type VectorClock,
} from '../src/infrastructure/vector-clock';
import type { ClaimDomainEvent } from '../src/domain/events';

// ───── helpers ─────

function makeEvent(overrides: Partial<ClaimDomainEvent> = {}): ClaimDomainEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 10)}`,
    type: 'claim:created',
    aggregateId: 'claim-001',
    aggregateType: 'claim',
    version: 0,
    timestamp: Date.now(),
    source: 'test',
    payload: { foo: 'bar' },
    ...overrides,
  };
}

function makeStore(opts: {
  nodeId?: string;
  bridge?: FederationBridge;
} = {}) {
  const local = new InMemoryClaimEventStore();
  const hlc = new LocalHlc(opts.nodeId ?? 'node-A', () => 1_000_000);
  const store = new FederatedClaimEventStore({
    local,
    hlc,
    nodeId: opts.nodeId ?? 'node-A',
    bridge: opts.bridge,
  });
  return { local, hlc, store };
}

// ───── tests ─────

describe('FederatedClaimEventStore', () => {
  describe('local append', () => {
    it('ticks the per-aggregate vclock on each local append', async () => {
      const { store } = makeStore();
      await store.initialize();

      await store.append(makeEvent({ id: 'e1' }));
      const vc1 = store.getAggregateVclock('claim-001');
      expect(vc1.clocks).toEqual({ 'node-A': 1 });

      await store.append(makeEvent({ id: 'e2' }));
      const vc2 = store.getAggregateVclock('claim-001');
      expect(vc2.clocks).toEqual({ 'node-A': 2 });
    });

    it('keeps separate vclocks per aggregate', async () => {
      const { store } = makeStore();
      await store.initialize();

      await store.append(makeEvent({ aggregateId: 'claim-001' }));
      await store.append(makeEvent({ aggregateId: 'claim-002' }));

      expect(store.getAggregateVclock('claim-001').clocks).toEqual({ 'node-A': 1 });
      expect(store.getAggregateVclock('claim-002').clocks).toEqual({ 'node-A': 1 });
    });
  });

  describe('applyRemoteEvent', () => {
    it('accepts a remote event that strictly follows local state', async () => {
      const { store } = makeStore();
      await store.initialize();

      // Remote knows about node-A's first event AND has added its own.
      const remoteVclock: VectorClock = Object.freeze({
        clocks: Object.freeze({ 'node-B': 1 }),
      });

      await store.applyRemoteEvent(
        makeEvent({ id: 'e-remote' }),
        remoteVclock,
        { physicalMs: 1_000_000, logical: 0, nodeId: 'node-B' },
      );

      expect(store.getAggregateVclock('claim-001').clocks).toEqual({ 'node-B': 1 });
    });

    it('drops remote events that are equal to or before local state (idempotent)', async () => {
      const { store } = makeStore();
      await store.initialize();

      await store.append(makeEvent({ id: 'e1' })); // local at {A:1}
      const beforeCount = (await store.getEvents('claim-001')).length;

      // Remote tries to deliver an event with clock {A:1} — already known.
      await store.applyRemoteEvent(
        makeEvent({ id: 'e-rebroadcast' }),
        Object.freeze({ clocks: Object.freeze({ 'node-A': 1 }) }),
        { physicalMs: 1_000_000, logical: 0, nodeId: 'node-A' },
      );

      const afterCount = (await store.getEvents('claim-001')).length;
      expect(afterCount).toBe(beforeCount); // no duplicate
    });

    it('throws ConcurrentWriteError on concurrent vclocks', async () => {
      const { store } = makeStore();
      await store.initialize();

      // Local has {A:1}; remote has {B:1} — concurrent.
      await store.append(makeEvent({ id: 'e-local' }));

      await expect(
        store.applyRemoteEvent(
          makeEvent({ id: 'e-remote' }),
          Object.freeze({ clocks: Object.freeze({ 'node-B': 1 }) }),
          { physicalMs: 1_000_000, logical: 0, nodeId: 'node-B' },
        ),
      ).rejects.toBeInstanceOf(ConcurrentWriteError);
    });
  });

  describe('PII rollback', () => {
    it('rolls back the local append when the bridge throws PiiLeakPrevented', async () => {
      // Mock transport: scanPii throws, publish never called.
      const transport: IFederationTransport = {
        publish: vi.fn(),
        scanPii: vi.fn(async () => {
          throw new PiiLeakPreventedError('payload', 'looks like an SSN');
        }),
      };
      const bridge = new FederationBridge({ nodeId: 'node-A', transport });
      const { store, local } = makeStore({ bridge });
      await store.initialize();

      const event = makeEvent({ id: 'e-pii' });
      await expect(store.append(event)).rejects.toBeInstanceOf(PiiLeakPreventedError);

      // Local store should NOT contain the event.
      const events = await local.getEvents('claim-001');
      expect(events.find((e) => e.id === 'e-pii')).toBeUndefined();

      // Aggregate vclock should NOT have advanced past zero (or whatever it was before).
      const vc = store.getAggregateVclock('claim-001');
      expect(vc.clocks).toEqual({});

      // Transport publish should not have been called.
      expect(transport.publish).not.toHaveBeenCalled();
    });

    it('keeps the local append when the bridge succeeds', async () => {
      const published: any[] = [];
      const transport: IFederationTransport = {
        publish: vi.fn(async (env) => { published.push(env); }),
        scanPii: vi.fn(async () => { /* clean */ }),
      };
      const bridge = new FederationBridge({ nodeId: 'node-A', transport });
      const { store, local } = makeStore({ bridge });
      await store.initialize();

      await store.append(makeEvent({ id: 'e-clean' }));

      expect((await local.getEvents('claim-001')).length).toBe(1);
      expect(published.length).toBe(1);
      expect(published[0].type).toBe('claim-event');
      expect(published[0].payload.event.id).toBe('e-clean');
    });
  });

  describe('wouldConflict', () => {
    it('returns true for concurrent clocks, false otherwise', async () => {
      const { store } = makeStore();
      await store.initialize();

      await store.append(makeEvent());

      // Same node-A vclock — not concurrent (equal/before)
      expect(
        store.wouldConflict('claim-001', tickVectorClock(zeroVectorClock(), 'node-A')),
      ).toBe(false);

      // node-B with no awareness of node-A — concurrent
      expect(
        store.wouldConflict('claim-001', tickVectorClock(zeroVectorClock(), 'node-B')),
      ).toBe(true);
    });
  });

  describe('IClaimEventStore pass-through', () => {
    it('getEvents / getEventsByType / getEventsByIssueId delegate to local', async () => {
      const { store } = makeStore();
      await store.initialize();

      await store.append(makeEvent({ id: 'e1', aggregateId: 'claim-001' }));
      await store.append(makeEvent({
        id: 'e2',
        aggregateId: 'claim-002',
        type: 'claim:released',
        payload: { issueId: 'issue-XYZ' },
      }));

      expect((await store.getEvents('claim-001')).length).toBe(1);
      expect((await store.getEventsByType('claim:released')).length).toBe(1);
      expect((await store.getEventsByIssueId('issue-XYZ')).length).toBe(1);
    });

    it('subscribe returns an unsubscribe function', async () => {
      const { store } = makeStore();
      await store.initialize();

      const handler = vi.fn();
      const unsub = store.subscribe(['claim:created'], handler);
      expect(typeof unsub).toBe('function');

      await store.append(makeEvent({ type: 'claim:created' }));
      // Subscriptions are async — give the microtask queue a chance.
      await Promise.resolve();
      expect(handler).toHaveBeenCalled();

      unsub();
      handler.mockClear();
      await store.append(makeEvent({ type: 'claim:created' }));
      await Promise.resolve();
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
