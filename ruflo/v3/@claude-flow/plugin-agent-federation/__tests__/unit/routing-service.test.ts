/**
 * RoutingService Tests
 *
 * Tests the real RoutingService from source with real domain entities.
 * Dependencies (generateEnvelopeId, signEnvelope, etc.) are provided as
 * simple inline implementations — no mocks of the class under test.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RoutingService,
  type RoutingServiceDeps,
} from '../../src/domain/services/routing-service.js';
import {
  FederationEnvelope,
  CONSENSUS_REQUIRED_TYPES,
  type FederationMessageType,
} from '../../src/domain/entities/federation-envelope.js';
import { FederationSession } from '../../src/domain/entities/federation-session.js';
import { TrustLevel } from '../../src/domain/entities/trust-level.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<{
  sessionId: string;
  localNodeId: string;
  remoteNodeId: string;
  trustLevel: TrustLevel;
  active: boolean;
  expired: boolean;
  sessionToken: string;
}> = {}): FederationSession {
  const expiresAt = overrides.expired
    ? new Date(Date.now() - 1000)           // already expired
    : new Date(Date.now() + 3_600_000);     // +1 h

  const session = new FederationSession({
    sessionId: overrides.sessionId ?? 'sess-1',
    localNodeId: overrides.localNodeId ?? 'local',
    remoteNodeId: overrides.remoteNodeId ?? 'remote-1',
    trustLevel: overrides.trustLevel ?? TrustLevel.ATTESTED,
    negotiatedCapabilities: ['send'],
    createdAt: new Date(),
    expiresAt,
    heartbeatInterval: 30_000,
    sessionToken: overrides.sessionToken ?? 'token-1',
    metrics: FederationSession.createMetrics(),
  });

  if (overrides.active === false) {
    session.terminate();
  }

  return session;
}

function makeDeps(overrides: Partial<RoutingServiceDeps> = {}): RoutingServiceDeps {
  let counter = 0;
  return {
    generateEnvelopeId: overrides.generateEnvelopeId ?? (() => `env-${counter++}`),
    generateNonce: overrides.generateNonce ?? (() => `nonce-${counter++}`),
    signEnvelope: overrides.signEnvelope ?? ((payload, token) => `hmac-${token}-${payload.length}`),
    verifyEnvelope: overrides.verifyEnvelope ?? ((payload, sig, token) => sig === `hmac-${token}-${payload.length}`),
    scanPii: overrides.scanPii ?? ((text, _trustLevel) => ({
      transformedText: text,
      scanResult: {
        scanned: true,
        piiFound: false,
        detections: [],
        actionsApplied: [],
        scanDurationMs: 0,
      },
    })),
    sendToNode: overrides.sendToNode ?? vi.fn(async () => {}),
    getActiveSessions: overrides.getActiveSessions ?? (() => []),
    getLocalNodeId: overrides.getLocalNodeId ?? (() => 'local'),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoutingService', () => {
  let service: RoutingService;
  let deps: RoutingServiceDeps;
  let sessions: FederationSession[];

  beforeEach(() => {
    sessions = [
      makeSession({ sessionId: 'sess-1', remoteNodeId: 'remote-1', sessionToken: 'token-1' }),
      makeSession({ sessionId: 'sess-2', remoteNodeId: 'remote-2', sessionToken: 'token-2' }),
      makeSession({ sessionId: 'sess-3', remoteNodeId: 'remote-3', sessionToken: 'token-3' }),
    ];

    deps = makeDeps({
      getActiveSessions: () => sessions,
      sendToNode: vi.fn(async () => {}),
    });

    service = new RoutingService(deps);
  });

  // -----------------------------------------------------------------------
  // selectMode
  // -----------------------------------------------------------------------

  describe('selectMode', () => {
    it('should return consensus for trust-change', () => {
      expect(service.selectMode('trust-change')).toBe('consensus');
    });

    it('should return consensus for topology-change', () => {
      expect(service.selectMode('topology-change')).toBe('consensus');
    });

    it('should return consensus for agent-spawn', () => {
      expect(service.selectMode('agent-spawn')).toBe('consensus');
    });

    it('should return broadcast for status-broadcast', () => {
      expect(service.selectMode('status-broadcast')).toBe('broadcast');
    });

    it('should return direct for other message types', () => {
      const directTypes: FederationMessageType[] = [
        'task-assignment', 'memory-query', 'memory-response',
        'context-share', 'heartbeat',
      ];
      for (const t of directTypes) {
        expect(service.selectMode(t)).toBe('direct');
      }
    });
  });

  // -----------------------------------------------------------------------
  // send
  // -----------------------------------------------------------------------

  describe('send', () => {
    it('should send successfully for an active, non-expired session', async () => {
      const session = sessions[0];
      const result = await service.send(session, 'task-assignment', { task: 'do-work' });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('direct');
      expect(result.envelopeId).toBeTruthy();
      expect(result.targetNodeIds).toContain('remote-1');
      expect(deps.sendToNode).toHaveBeenCalledOnce();
    });

    it('should fail when session is inactive', async () => {
      const session = makeSession({ active: false });
      const result = await service.send(session, 'task-assignment', { data: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not active/i);
    });

    it('should fail when session is expired', async () => {
      const session = makeSession({ expired: true });
      const result = await service.send(session, 'task-assignment', { data: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/expired/i);
    });

    it('should block the message when PII scan returns block action', async () => {
      deps = makeDeps({
        getActiveSessions: () => sessions,
        sendToNode: vi.fn(async () => {}),
        scanPii: (_text, _trust) => ({
          transformedText: '',
          scanResult: {
            scanned: true,
            piiFound: true,
            detections: [{ type: 'ssn', action: 'block', confidence: 0.99 }],
            actionsApplied: ['block'],
            scanDurationMs: 1,
          },
        }),
      });
      service = new RoutingService(deps);

      const session = sessions[0];
      const result = await service.send(session, 'context-share', { ssn: '123-45-6789' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/blocked.*pii/i);
      expect(deps.sendToNode).not.toHaveBeenCalled();
    });

    it('should record messagesSent and piiRedactions on the session metrics', async () => {
      // Use a scanPii that flags PII as found but only redacts (not blocks)
      deps = makeDeps({
        getActiveSessions: () => sessions,
        sendToNode: vi.fn(async () => {}),
        scanPii: (text, _trust) => ({
          transformedText: text.replace(/alice@example\.com/, '[REDACTED]'),
          scanResult: {
            scanned: true,
            piiFound: true,
            detections: [{ type: 'email', action: 'redact', confidence: 0.95 }],
            actionsApplied: ['redact'],
            scanDurationMs: 1,
          },
        }),
      });
      service = new RoutingService(deps);

      const session = sessions[0];
      expect(session.metrics.messagesSent).toBe(0);
      expect(session.metrics.piiRedactions).toBe(0);

      await service.send(session, 'context-share', { email: 'alice@example.com' });

      expect(session.metrics.messagesSent).toBe(1);
      expect(session.metrics.piiRedactions).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // broadcast
  // -----------------------------------------------------------------------

  describe('broadcast', () => {
    it('should send to all active, non-expired sessions', async () => {
      const results = await service.broadcast('status-broadcast', { status: 'ok' });

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(deps.sendToNode).toHaveBeenCalledTimes(3);
    });

    it('should skip expired sessions', async () => {
      // Replace one session with an expired one
      sessions[2] = makeSession({ sessionId: 'sess-3', remoteNodeId: 'remote-3', expired: true });

      const results = await service.broadcast('status-broadcast', { status: 'ok' });

      // Only 2 should succeed; the expired one is filtered out by broadcast
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // propose
  // -----------------------------------------------------------------------

  describe('propose', () => {
    it('should create a proposal with correct quorum (default 2/3)', async () => {
      const proposal = await service.propose('trust-change', { newLevel: 3 });

      expect(proposal.proposalId).toBeTruthy();
      expect(proposal.proposerNodeId).toBe('local');
      expect(proposal.messageType).toBe('trust-change');
      // ceil(3 * 2/3) = 2
      expect(proposal.quorumRequired).toBe(2);
      expect(proposal.votes.size).toBe(0);
    });

    it('should broadcast the proposal to all active sessions', async () => {
      await service.propose('topology-change', { nodes: ['a'] });

      // broadcast sends to 3 sessions
      expect(deps.sendToNode).toHaveBeenCalledTimes(3);
    });

    it('should respect custom quorumFraction', async () => {
      const proposal = await service.propose('agent-spawn', { agent: 'x' }, 0.5);

      // ceil(3 * 0.5) = 2
      expect(proposal.quorumRequired).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // recordVote
  // -----------------------------------------------------------------------

  describe('recordVote', () => {
    it('should record a valid vote and return true', async () => {
      const proposal = await service.propose('trust-change', { level: 3 });
      const ok = service.recordVote(proposal.proposalId, 'remote-1', true);
      expect(ok).toBe(true);
      expect(proposal.votes.get('remote-1')).toBe(true);
    });

    it('should return false for an unknown proposal', () => {
      const ok = service.recordVote('nonexistent', 'node-1', true);
      expect(ok).toBe(false);
    });

    it('should return false for an expired proposal', async () => {
      const proposal = await service.propose('trust-change', { level: 3 });

      // Force the proposal to be expired by mutating expiresAt
      // ConsensusProposal uses readonly but the Map holds the reference
      (proposal as { expiresAt: Date }).expiresAt = new Date(Date.now() - 1000);

      const ok = service.recordVote(proposal.proposalId, 'remote-1', true);
      expect(ok).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // isConsensusReached
  // -----------------------------------------------------------------------

  describe('isConsensusReached', () => {
    it('should report reached + approved when quorum met', async () => {
      const proposal = await service.propose('trust-change', { level: 3 });
      // quorumRequired = 2 (ceil(3 * 2/3))
      service.recordVote(proposal.proposalId, 'remote-1', true);
      service.recordVote(proposal.proposalId, 'remote-2', true);

      const status = service.isConsensusReached(proposal.proposalId);
      expect(status.reached).toBe(true);
      expect(status.approved).toBe(true);
    });

    it('should report early rejection when too many votes against', async () => {
      const proposal = await service.propose('trust-change', { level: 3 });
      // quorumRequired = 2, totalVoters = 3
      // rejections > totalVoters - quorumRequired  =>  rejections > 1  =>  need 2 rejections
      service.recordVote(proposal.proposalId, 'remote-1', false);
      service.recordVote(proposal.proposalId, 'remote-2', false);

      const status = service.isConsensusReached(proposal.proposalId);
      expect(status.reached).toBe(true);
      expect(status.approved).toBe(false);
    });

    it('should report not yet reached when votes are insufficient', async () => {
      const proposal = await service.propose('trust-change', { level: 3 });
      service.recordVote(proposal.proposalId, 'remote-1', true);

      const status = service.isConsensusReached(proposal.proposalId);
      expect(status.reached).toBe(false);
      expect(status.approved).toBe(false);
    });

    it('should return reached=false for unknown proposal', () => {
      const status = service.isConsensusReached('nonexistent');
      expect(status.reached).toBe(false);
      expect(status.approved).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // verifyInboundEnvelope
  // -----------------------------------------------------------------------

  describe('verifyInboundEnvelope', () => {
    it('should return true for a correctly signed envelope', () => {
      const envelope = new FederationEnvelope({
        envelopeId: 'env-100',
        sourceNodeId: 'remote-1',
        targetNodeId: 'local',
        sessionId: 'sess-1',
        messageType: 'task-assignment',
        payload: { task: 'test' },
        timestamp: new Date(),
        nonce: 'nonce-100',
        hmacSignature: '', // will be computed below
        piiScanResult: FederationEnvelope.emptyScanResult(),
      });

      // The deps.signEnvelope produces `hmac-<token>-<payload.length>`
      const signablePayload = envelope.toSignablePayload();
      const validSig = `hmac-token-1-${signablePayload.length}`;

      // Re-create envelope with correct signature
      const signed = new FederationEnvelope({
        ...envelope,
        hmacSignature: validSig,
        piiScanResult: FederationEnvelope.emptyScanResult(),
      });

      expect(service.verifyInboundEnvelope(signed, 'token-1')).toBe(true);
    });

    it('should return false for a tampered envelope', () => {
      const envelope = new FederationEnvelope({
        envelopeId: 'env-200',
        sourceNodeId: 'remote-1',
        targetNodeId: 'local',
        sessionId: 'sess-1',
        messageType: 'task-assignment',
        payload: { task: 'test' },
        timestamp: new Date(),
        nonce: 'nonce-200',
        hmacSignature: 'bad-signature',
        piiScanResult: FederationEnvelope.emptyScanResult(),
      });

      expect(service.verifyInboundEnvelope(envelope, 'token-1')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // cleanExpiredProposals
  // -----------------------------------------------------------------------

  describe('cleanExpiredProposals', () => {
    it('should remove proposals that have expired', async () => {
      const proposal = await service.propose('trust-change', { level: 3 });

      // Force expiry
      (proposal as { expiresAt: Date }).expiresAt = new Date(Date.now() - 1000);

      service.cleanExpiredProposals();

      // After cleanup, the proposal should be gone
      const status = service.isConsensusReached(proposal.proposalId);
      expect(status.reached).toBe(false);
      expect(status.approved).toBe(false);
    });

    it('should keep proposals that have not expired', async () => {
      const proposal = await service.propose('trust-change', { level: 3 });

      service.cleanExpiredProposals();

      // Still accessible
      const ok = service.recordVote(proposal.proposalId, 'remote-1', true);
      expect(ok).toBe(true);
    });
  });
});
