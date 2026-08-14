/**
 * Federation Bridge — translates ClaimDomainEvent ↔ federation envelopes.
 *
 * The bridge is the ONLY place in the claims module that knows the federation
 * envelope wire format. Both `FederatedClaimRepository` (for claim mutations)
 * and `FederatedClaimEventStore` (for event-sourcing append) delegate the
 * cross-node publish/receive to this module so the federation contract stays
 * confined to a single seam.
 *
 * Why a structural type instead of a real import from
 * `@claude-flow/plugin-agent-federation`: the claims module must remain
 * single-node-usable without the federation plugin installed. We pin the
 * minimal shape we need; if the federation plugin changes its envelope, the
 * bridge fails closed at runtime via the verification step rather than at
 * import time. Tests inject a minimal in-memory transport for unit coverage.
 *
 * @module v3/claims/infrastructure/federation-bridge
 * @see ADR-101 Component B
 */

import type { ClaimDomainEvent } from '../domain/events.js';
import type { HlcTimestamp } from './hlc.js';
import type { VectorClock } from './vector-clock.js';

// =============================================================================
// Federation envelope shape (structural — see module header)
// =============================================================================

/**
 * Minimal federation envelope shape the bridge depends on.
 * Real envelopes from plugin-agent-federation include more fields (peer
 * registry refs, hop counters, etc.); we only require what the bridge writes.
 */
export interface FederationEnvelope<TPayload = unknown> {
  readonly type: string;
  readonly originNodeId: string;
  readonly targetNodeId?: string; // omitted for broadcast
  readonly hlc: HlcTimestamp;
  readonly payload: TPayload;
  readonly signature?: string; // Ed25519 hex; populated by signing step
}

/**
 * The transport the bridge writes envelopes to. In production this is a
 * thin wrapper around plugin-agent-federation's RoutingService; in tests
 * this can be an in-memory queue.
 */
export interface IFederationTransport {
  /** Broadcast an envelope to all peers in the trust circle. */
  publish(envelope: FederationEnvelope): Promise<void>;

  /** PII pre-publish scan. Should throw on detection. */
  scanPii(payload: unknown): Promise<void>;
}

/**
 * The PII guard error thrown when the pre-publish scan detects sensitive
 * data. Surfaces to the application layer as a `PII_LEAK_PREVENTED` failure.
 */
export class PiiLeakPreventedError extends Error {
  constructor(public readonly field: string, public readonly hint: string) {
    super(`PII detected in field '${field}'; refusing to publish across federation. ${hint}`);
    this.name = 'PiiLeakPreventedError';
  }
}

// =============================================================================
// Federated event shape — what flies on the wire
// =============================================================================

/**
 * `claim-event` envelope payload. This is what receivers see after
 * Ed25519 verification.
 */
export interface ClaimEventEnvelopePayload {
  readonly event: ClaimDomainEvent;
  readonly vclock: VectorClock;
  readonly originNodeId: string;
  readonly hlc: HlcTimestamp;
}

export const CLAIM_EVENT_MESSAGE_TYPE = 'claim-event' as const;

// =============================================================================
// Bridge
// =============================================================================

export interface FederationBridgeOptions {
  readonly nodeId: string;
  readonly transport: IFederationTransport;
}

export class FederationBridge {
  constructor(private readonly opts: FederationBridgeOptions) {
    if (!opts.nodeId) throw new Error('FederationBridge requires nodeId');
  }

  /**
   * Publish a claim event to the federation.
   *
   * Flow:
   *   1. Run PII scan on the event payload + metadata. Failure throws
   *      PiiLeakPreventedError; the caller is expected to roll back the
   *      local write.
   *   2. Wrap event in a `claim-event` envelope.
   *   3. Hand to transport.publish().
   *
   * Returns the envelope as published (without signature — the transport
   * is responsible for signing). Useful for callers that want to log what
   * was actually sent.
   */
  async publishClaimEvent(
    event: ClaimDomainEvent,
    vclock: VectorClock,
    hlc: HlcTimestamp,
  ): Promise<FederationEnvelope<ClaimEventEnvelopePayload>> {
    // PII guard. We scan the *full* payload object — the transport's scanPii
    // is responsible for walking the nested structure.
    await this.opts.transport.scanPii({
      payload: event.payload,
      metadata: event.metadata,
    });

    const envelope: FederationEnvelope<ClaimEventEnvelopePayload> = {
      type: CLAIM_EVENT_MESSAGE_TYPE,
      originNodeId: this.opts.nodeId,
      hlc,
      payload: {
        event,
        vclock,
        originNodeId: this.opts.nodeId,
        hlc,
      },
    };

    await this.opts.transport.publish(envelope);
    return envelope;
  }

  /**
   * Decode an incoming envelope back into the claim event + vclock + hlc
   * tuple. Validates the envelope shape; does NOT verify the signature
   * (that's the transport's job, before this method is called).
   */
  decode(envelope: FederationEnvelope): ClaimEventEnvelopePayload {
    if (envelope.type !== CLAIM_EVENT_MESSAGE_TYPE) {
      throw new Error(
        `FederationBridge.decode: expected type '${CLAIM_EVENT_MESSAGE_TYPE}', got '${envelope.type}'`,
      );
    }
    const payload = envelope.payload as ClaimEventEnvelopePayload;
    if (!payload || typeof payload !== 'object') {
      throw new Error('FederationBridge.decode: payload missing or non-object');
    }
    if (!payload.event || !payload.vclock || !payload.hlc || !payload.originNodeId) {
      throw new Error('FederationBridge.decode: payload missing required fields');
    }
    return payload;
  }
}
