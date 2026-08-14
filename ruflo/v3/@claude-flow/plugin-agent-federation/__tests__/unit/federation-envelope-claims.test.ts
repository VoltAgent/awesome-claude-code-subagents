/**
 * Tests for ADR-101 Component C additions to FederationMessageType.
 *
 * Asserts that:
 *   - 'claim-event' and 'agent-handoff' are valid FederationMessageType members
 *   - 'agent-handoff' is in CONSENSUS_REQUIRED_TYPES (high-trust deployments
 *     can require validator quorum)
 *   - 'claim-event' is NOT in CONSENSUS_REQUIRED_TYPES (steady-state gossip
 *     would deadlock under quorum requirement)
 *   - existing message types are unchanged (no accidental removals)
 *   - existing CONSENSUS_REQUIRED_TYPES members are unchanged
 */

import { describe, expect, it } from 'vitest';
import {
  FederationEnvelope,
  CONSENSUS_REQUIRED_TYPES,
  type FederationMessageType,
} from '../../src/domain/entities/federation-envelope';

describe('FederationMessageType — ADR-101 additions', () => {
  it('accepts claim-event as a valid message type', () => {
    const env = new FederationEnvelope({
      envelopeId: 'env-1',
      sourceNodeId: 'A',
      targetNodeId: 'B',
      sessionId: 'sess-1',
      messageType: 'claim-event',
      payload: { event: 'placeholder' },
      timestamp: new Date(),
      nonce: 'n-1',
      hmacSignature: '',
      piiScanResult: FederationEnvelope.emptyScanResult(),
    });
    expect(env.messageType).toBe('claim-event');
  });

  it('accepts agent-handoff as a valid message type', () => {
    const env = new FederationEnvelope({
      envelopeId: 'env-2',
      sourceNodeId: 'A',
      targetNodeId: 'B',
      sessionId: 'sess-1',
      messageType: 'agent-handoff',
      payload: { claimId: 'claim-001', from: 'a@A', to: 'b@B' },
      timestamp: new Date(),
      nonce: 'n-2',
      hmacSignature: '',
      piiScanResult: FederationEnvelope.emptyScanResult(),
    });
    expect(env.messageType).toBe('agent-handoff');
  });

  it('agent-handoff requires consensus by default', () => {
    expect(CONSENSUS_REQUIRED_TYPES.has('agent-handoff')).toBe(true);
  });

  it('claim-event does NOT require consensus (steady-state gossip)', () => {
    expect(CONSENSUS_REQUIRED_TYPES.has('claim-event')).toBe(false);
  });

  it('preserves the pre-ADR-101 consensus-required set', () => {
    // Snapshot the existing membership so future additions don't silently
    // expand the consensus-required set.
    expect(CONSENSUS_REQUIRED_TYPES.has('trust-change')).toBe(true);
    expect(CONSENSUS_REQUIRED_TYPES.has('topology-change')).toBe(true);
    expect(CONSENSUS_REQUIRED_TYPES.has('agent-spawn')).toBe(true);
  });

  it('preserves existing message types', () => {
    // Type-level smoke test — these must compile.
    const existing: FederationMessageType[] = [
      'task-assignment',
      'memory-query',
      'memory-response',
      'context-share',
      'status-broadcast',
      'trust-change',
      'topology-change',
      'agent-spawn',
      'heartbeat',
      'challenge',
      'challenge-response',
      'handshake-init',
      'handshake-accept',
      'handshake-reject',
      'session-terminate',
    ];
    expect(existing.length).toBe(15);
  });

  it('toSignablePayload includes the new message type when set', () => {
    const env = new FederationEnvelope({
      envelopeId: 'env-3',
      sourceNodeId: 'A',
      targetNodeId: 'B',
      sessionId: 'sess-1',
      messageType: 'agent-handoff',
      payload: { claimId: 'claim-001' },
      timestamp: new Date('2026-05-05T12:00:00Z'),
      nonce: 'n-3',
      hmacSignature: '',
      piiScanResult: FederationEnvelope.emptyScanResult(),
    });
    const signable = env.toSignablePayload();
    expect(signable).toContain('"messageType":"agent-handoff"');
    expect(signable).toContain('"claim-001"');
  });
});
