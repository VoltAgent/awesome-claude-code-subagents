/**
 * Tests for ADR-097 Phase 2 — peer state machine.
 *
 * Pins the security invariants the spec called out:
 *   1. Only the canTransition table allows mutations; everything else is a
 *      no-op returning false.
 *   2. EVICTED is terminal under suspend/evict; only `reactivate` can move
 *      it back to ACTIVE (operator-initiated escape hatch).
 *   3. Self-loops are rejected — a duplicate suspend on an already-SUSPENDED
 *      peer doesn't reset the suspendedAt clock (which would defeat the
 *      auto-eviction grace period).
 *   4. Cooldown + auto-evict are pure functions of (suspendedAt, now,
 *      threshold) — no clock skew risk in the entity itself.
 */

import { describe, it, expect } from 'vitest';
import {
  FederationNode,
} from '../../src/domain/entities/federation-node.js';
import { TrustLevel } from '../../src/domain/entities/trust-level.js';
import {
  FederationNodeState,
  canTransition,
  isCooldownElapsed,
  shouldAutoEvict,
  DEFAULT_SUSPENSION_COOLDOWN_MS,
  DEFAULT_AUTO_EVICTION_AGE_MS,
} from '../../src/domain/value-objects/federation-node-state.js';

function mkNode(overrides: Partial<Parameters<typeof FederationNode.create>[0]> = {}) {
  return FederationNode.create({
    nodeId: 'node-1',
    publicKey: 'pk-test',
    endpoint: 'https://example.test',
    capabilities: {
      agentTypes: [],
      maxConcurrentSessions: 1,
      supportedProtocols: [],
      complianceModes: [],
    },
    metadata: {},
    ...overrides,
  });
}

describe('canTransition (ADR-097 Phase 2)', () => {
  describe('legal edges', () => {
    it.each([
      [FederationNodeState.ACTIVE, FederationNodeState.SUSPENDED],
      [FederationNodeState.ACTIVE, FederationNodeState.EVICTED],
      [FederationNodeState.SUSPENDED, FederationNodeState.ACTIVE],
      [FederationNodeState.SUSPENDED, FederationNodeState.EVICTED],
      [FederationNodeState.EVICTED, FederationNodeState.ACTIVE],
    ])('allows %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  describe('illegal edges', () => {
    it.each([
      // Self-loops are always rejected
      [FederationNodeState.ACTIVE, FederationNodeState.ACTIVE],
      [FederationNodeState.SUSPENDED, FederationNodeState.SUSPENDED],
      [FederationNodeState.EVICTED, FederationNodeState.EVICTED],
      // EVICTED → SUSPENDED is not in the spec — once evicted, only
      // operator reactivate can move the peer (and they reactivate to
      // ACTIVE, then suspend separately if needed).
      [FederationNodeState.EVICTED, FederationNodeState.SUSPENDED],
    ])('rejects %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });
});

describe('FederationNode state transitions', () => {
  describe('default state', () => {
    it('new nodes start ACTIVE', () => {
      const n = mkNode();
      expect(n.state).toBe(FederationNodeState.ACTIVE);
      expect(n.isActive).toBe(true);
      expect(n.isEvicted).toBe(false);
    });

    it('stateChangedAt defaults to construction time', () => {
      const before = new Date();
      const n = mkNode();
      const after = new Date();
      expect(n.stateChangedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(n.stateChangedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('suspend', () => {
    it('ACTIVE → SUSPENDED records reason and time', () => {
      const n = mkNode();
      const at = new Date('2026-05-09T12:00:00Z');
      const ok = n.suspend({ reason: 'COST_THRESHOLD_EXCEEDED', correlationId: 'breaker-run-1' }, at);
      expect(ok).toBe(true);
      expect(n.state).toBe(FederationNodeState.SUSPENDED);
      expect(n.stateChangedAt).toEqual(at);
      expect(n.stateRecord.reason).toBe('COST_THRESHOLD_EXCEEDED');
      expect(n.stateRecord.correlationId).toBe('breaker-run-1');
    });

    it('SUSPENDED → SUSPENDED is a no-op (preserves suspendedAt clock)', () => {
      const n = mkNode();
      const t1 = new Date('2026-05-09T12:00:00Z');
      const t2 = new Date('2026-05-09T13:00:00Z');
      n.suspend({ reason: 'COST_THRESHOLD_EXCEEDED' }, t1);
      const ok = n.suspend({ reason: 'FAILURE_RATIO_EXCEEDED' }, t2);
      expect(ok).toBe(false);
      // Critical: stateChangedAt must NOT advance — otherwise a flaky
      // breaker could perpetually reset the auto-eviction grace timer.
      expect(n.stateChangedAt).toEqual(t1);
      expect(n.stateRecord.reason).toBe('COST_THRESHOLD_EXCEEDED');
    });

    it('EVICTED → SUSPENDED is rejected (terminal)', () => {
      const n = mkNode();
      n.evict({ reason: 'MANUAL_EVICT' });
      const ok = n.suspend({ reason: 'COST_THRESHOLD_EXCEEDED' });
      expect(ok).toBe(false);
      expect(n.state).toBe(FederationNodeState.EVICTED);
    });
  });

  describe('evict', () => {
    it('ACTIVE → EVICTED works (manual evict skips suspend)', () => {
      const n = mkNode();
      const ok = n.evict({ reason: 'MANUAL_EVICT', correlationId: 'op-ticket-42' });
      expect(ok).toBe(true);
      expect(n.state).toBe(FederationNodeState.EVICTED);
      expect(n.isEvicted).toBe(true);
      expect(n.stateRecord.correlationId).toBe('op-ticket-42');
    });

    it('SUSPENDED → EVICTED works (grace period expired)', () => {
      const n = mkNode();
      n.suspend({ reason: 'COST_THRESHOLD_EXCEEDED' });
      const ok = n.evict({ reason: 'GRACE_PERIOD_EXPIRED' });
      expect(ok).toBe(true);
      expect(n.state).toBe(FederationNodeState.EVICTED);
    });

    it('EVICTED → EVICTED is a no-op', () => {
      const n = mkNode();
      const t1 = new Date('2026-05-09T12:00:00Z');
      const t2 = new Date('2026-05-09T13:00:00Z');
      n.evict({ reason: 'MANUAL_EVICT' }, t1);
      const ok = n.evict({ reason: 'MANUAL_EVICT' }, t2);
      expect(ok).toBe(false);
      expect(n.stateChangedAt).toEqual(t1);
    });
  });

  describe('reactivate', () => {
    it('SUSPENDED → ACTIVE clears reason', () => {
      const n = mkNode();
      n.suspend({ reason: 'COST_THRESHOLD_EXCEEDED' });
      const ok = n.reactivate('probe-success-1');
      expect(ok).toBe(true);
      expect(n.state).toBe(FederationNodeState.ACTIVE);
      expect(n.stateRecord.reason).toBeUndefined();
      expect(n.stateRecord.correlationId).toBe('probe-success-1');
    });

    it('EVICTED → ACTIVE works (operator override)', () => {
      const n = mkNode();
      n.evict({ reason: 'MANUAL_EVICT' });
      const ok = n.reactivate('op-reactivate-1');
      expect(ok).toBe(true);
      expect(n.state).toBe(FederationNodeState.ACTIVE);
    });

    it('ACTIVE → ACTIVE is a no-op (already active)', () => {
      const n = mkNode();
      const t0 = n.stateChangedAt;
      const ok = n.reactivate('redundant-call');
      expect(ok).toBe(false);
      expect(n.stateChangedAt).toEqual(t0);
    });
  });

  describe('toProps round-trip preserves state', () => {
    it('serializes and reconstructs the state record', () => {
      const original = mkNode();
      const at = new Date('2026-05-09T12:00:00Z');
      original.suspend({ reason: 'FAILURE_RATIO_EXCEEDED', correlationId: 'breaker-2' }, at);

      // Reconstruct from props — the state must survive the trip.
      // (This is what persistence layers will rely on.)
      const FederationNodeCtor = original.constructor as new (
        p: ReturnType<typeof original.toProps>,
      ) => typeof original;
      const restored = new FederationNodeCtor(original.toProps());
      expect(restored.state).toBe(FederationNodeState.SUSPENDED);
      expect(restored.stateChangedAt).toEqual(at);
      expect(restored.stateRecord.reason).toBe('FAILURE_RATIO_EXCEEDED');
      expect(restored.stateRecord.correlationId).toBe('breaker-2');
    });
  });
});

describe('isCooldownElapsed (ADR-097 Phase 2)', () => {
  it('false before cooldown window', () => {
    const t0 = new Date('2026-05-09T12:00:00Z');
    const tNow = new Date(t0.getTime() + DEFAULT_SUSPENSION_COOLDOWN_MS - 1);
    expect(isCooldownElapsed(t0, tNow)).toBe(false);
  });

  it('true at exactly the cooldown boundary', () => {
    const t0 = new Date('2026-05-09T12:00:00Z');
    const tNow = new Date(t0.getTime() + DEFAULT_SUSPENSION_COOLDOWN_MS);
    expect(isCooldownElapsed(t0, tNow)).toBe(true);
  });

  it('respects custom cooldown', () => {
    const t0 = new Date('2026-05-09T12:00:00Z');
    const tNow = new Date(t0.getTime() + 60_000); // 60s
    expect(isCooldownElapsed(t0, tNow, 30_000)).toBe(true);
    expect(isCooldownElapsed(t0, tNow, 120_000)).toBe(false);
  });
});

describe('shouldAutoEvict (ADR-097 Phase 2)', () => {
  it('false within the grace window', () => {
    const t0 = new Date('2026-05-09T12:00:00Z');
    const tNow = new Date(t0.getTime() + DEFAULT_AUTO_EVICTION_AGE_MS - 1);
    expect(shouldAutoEvict(t0, tNow)).toBe(false);
  });

  it('true once grace expired', () => {
    const t0 = new Date('2026-05-09T12:00:00Z');
    const tNow = new Date(t0.getTime() + DEFAULT_AUTO_EVICTION_AGE_MS);
    expect(shouldAutoEvict(t0, tNow)).toBe(true);
  });

  it('grace period is well after the cooldown (peer can recover before evict)', () => {
    expect(DEFAULT_AUTO_EVICTION_AGE_MS).toBeGreaterThan(DEFAULT_SUSPENSION_COOLDOWN_MS * 4);
  });
});
