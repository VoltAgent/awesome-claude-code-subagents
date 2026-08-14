/**
 * Tests for ADR-097 Phase 4 — coordinator's breaker control surface.
 *
 * Pins the four new public methods that the federation_breaker_status /
 * federation_evict / federation_reactivate MCP tools delegate to:
 *
 *   1. getPeerStates() — projects stateRecord over discovery.listPeers()
 *   2. getPeerStateCounts() — bucket-count of ACTIVE/SUSPENDED/EVICTED
 *   3. evictPeer(nodeId, reason, correlationId) — operator-initiated evict
 *      with audit log, session-termination side effect on success
 *   4. reactivatePeer(nodeId, correlationId) — operator-initiated reactivate
 *
 * Coordinator deps are minimal stubs — only the discovery service is
 * exercised. The other 7 deps are no-op fakes since the breaker control
 * surface doesn't touch them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FederationCoordinator } from '../../src/application/federation-coordinator.js';
import { FederationNode } from '../../src/domain/entities/federation-node.js';
import { FederationNodeState } from '../../src/domain/value-objects/federation-node-state.js';
import { TrustLevel } from '../../src/domain/entities/trust-level.js';

function mkPeer(nodeId: string, state?: FederationNodeState, stateChangedAt?: Date) {
  return FederationNode.create({
    nodeId,
    publicKey: `pk-${nodeId}`,
    endpoint: `https://${nodeId}.test`,
    capabilities: {
      agentTypes: [],
      maxConcurrentSessions: 1,
      supportedProtocols: [],
      complianceModes: [],
    },
    metadata: {},
    state,
    stateChangedAt,
  });
}

function mkCoordinator(peers: FederationNode[]) {
  const peerMap = new Map(peers.map((p) => [p.nodeId, p]));
  const auditCalls: { eventType: string; data: unknown }[] = [];

  const discovery = {
    listPeers: () => Array.from(peerMap.values()),
    getPeer: (id: string) => peerMap.get(id),
    publishManifest: vi.fn(),
    startPeriodicDiscovery: vi.fn(),
    stopPeriodicDiscovery: vi.fn(),
    addStaticPeer: vi.fn(),
    removePeer: vi.fn(),
  };

  const audit = {
    log: vi.fn(async (eventType: string, data: unknown) => {
      auditCalls.push({ eventType, data });
    }),
    flush: vi.fn(async () => undefined),
  };

  const noop = {} as never;
  const coord = new FederationCoordinator(
    {
      nodeId: 'self',
      publicKey: 'self-pk',
      endpoint: 'https://self.test',
      capabilities: [],
    },
    discovery as never,
    noop, // handshake
    noop, // routing
    audit as never,
    noop, // pii
    noop, // trust
    noop, // policy
  );

  // Force `initialized` true via the test seam. The discovery is stubbed
  // so `initialize()` would no-op, but we want to skip its audit emission.
  (coord as unknown as { initialized: boolean }).initialized = true;

  return { coord, peerMap, auditCalls };
}

describe('FederationCoordinator — Phase 4 breaker control surface', () => {
  describe('getPeerStates', () => {
    it('returns one entry per peer with its stateRecord', () => {
      const peers = [
        mkPeer('alpha'),
        mkPeer('bravo', FederationNodeState.SUSPENDED, new Date('2026-05-09T10:00:00Z')),
        mkPeer('charlie', FederationNodeState.EVICTED, new Date('2026-05-09T11:00:00Z')),
      ];
      const { coord } = mkCoordinator(peers);
      const states = coord.getPeerStates();
      expect(states).toHaveLength(3);
      expect(states.map((s) => s.nodeId).sort()).toEqual(['alpha', 'bravo', 'charlie']);
      expect(states.find((s) => s.nodeId === 'alpha')!.state).toBe(FederationNodeState.ACTIVE);
      expect(states.find((s) => s.nodeId === 'bravo')!.state).toBe(FederationNodeState.SUSPENDED);
    });

    it('returns empty array when no peers known', () => {
      const { coord } = mkCoordinator([]);
      expect(coord.getPeerStates()).toEqual([]);
    });
  });

  describe('getPeerStateCounts', () => {
    it('buckets peers by state', () => {
      const peers = [
        mkPeer('a1'),
        mkPeer('a2'),
        mkPeer('s1', FederationNodeState.SUSPENDED),
        mkPeer('e1', FederationNodeState.EVICTED),
        mkPeer('e2', FederationNodeState.EVICTED),
      ];
      const { coord } = mkCoordinator(peers);
      expect(coord.getPeerStateCounts()).toEqual({ active: 2, suspended: 1, evicted: 2 });
    });

    it('returns zeros when no peers', () => {
      const { coord } = mkCoordinator([]);
      expect(coord.getPeerStateCounts()).toEqual({ active: 0, suspended: 0, evicted: 0 });
    });
  });

  describe('evictPeer', () => {
    it('transitions ACTIVE → EVICTED and logs audit', async () => {
      const peer = mkPeer('target');
      const { coord, auditCalls } = mkCoordinator([peer]);
      const ok = await coord.evictPeer('target', 'MANUAL_EVICT', 'op-ticket-1');
      expect(ok).toBe(true);
      expect(peer.state).toBe(FederationNodeState.EVICTED);
      expect(auditCalls).toHaveLength(1);
      expect(auditCalls[0].eventType).toBe('threat_blocked');
    });

    it('returns false for unknown peer (no audit-log silence)', async () => {
      const { coord, auditCalls } = mkCoordinator([]);
      const ok = await coord.evictPeer('ghost');
      expect(ok).toBe(false);
      // Unknown peer is a no-op — no audit emission (nothing to log about).
      expect(auditCalls).toHaveLength(0);
    });

    it('returns false on duplicate evict but still emits audit (operator visibility)', async () => {
      const peer = mkPeer('already-evicted', FederationNodeState.EVICTED);
      const { coord, auditCalls } = mkCoordinator([peer]);
      const ok = await coord.evictPeer('already-evicted');
      expect(ok).toBe(false);
      expect(peer.state).toBe(FederationNodeState.EVICTED);
      // The audit IS emitted so the operator's repeated attempt is visible
      // — useful for catching script bugs that hammer evict in a loop.
      expect(auditCalls).toHaveLength(1);
      expect((auditCalls[0].data as { metadata: { applied: boolean } }).metadata.applied).toBe(false);
    });
  });

  describe('reactivatePeer', () => {
    it('transitions SUSPENDED → ACTIVE and logs audit', async () => {
      const peer = mkPeer('target', FederationNodeState.SUSPENDED, new Date('2026-05-09T10:00:00Z'));
      const { coord, auditCalls } = mkCoordinator([peer]);
      const ok = await coord.reactivatePeer('target', 'probe-ok-1');
      expect(ok).toBe(true);
      expect(peer.state).toBe(FederationNodeState.ACTIVE);
      expect(auditCalls).toHaveLength(1);
      expect(auditCalls[0].eventType).toBe('trust_level_changed');
    });

    it('transitions EVICTED → ACTIVE (operator override path)', async () => {
      const peer = mkPeer('target', FederationNodeState.EVICTED);
      const { coord } = mkCoordinator([peer]);
      const ok = await coord.reactivatePeer('target', 'op-override-1');
      expect(ok).toBe(true);
      expect(peer.state).toBe(FederationNodeState.ACTIVE);
    });

    it('returns false for unknown peer', async () => {
      const { coord } = mkCoordinator([]);
      const ok = await coord.reactivatePeer('ghost');
      expect(ok).toBe(false);
    });

    it('returns false when already ACTIVE (no-op)', async () => {
      const peer = mkPeer('target');
      const { coord, auditCalls } = mkCoordinator([peer]);
      const ok = await coord.reactivatePeer('target');
      expect(ok).toBe(false);
      expect(peer.state).toBe(FederationNodeState.ACTIVE);
      // Audit still emitted with applied:false so a redundant call is visible.
      expect(auditCalls).toHaveLength(1);
      expect((auditCalls[0].data as { metadata: { applied: boolean } }).metadata.applied).toBe(false);
    });
  });
});
