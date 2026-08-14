/**
 * Federated event store — vector-clock-versioned wrapper around the local
 * `InMemoryClaimEventStore`.
 *
 * Each appended event carries a `vclock` (vector clock) and an `hlc` (hybrid
 * logical clock) attached as additional metadata. On append the store:
 *
 *   1. Detects concurrent writes by comparing the new event's vclock with
 *      the latest accepted vclock for the aggregate. If they're concurrent
 *      (neither happens-before the other), the append is REJECTED with
 *      `ConcurrentWriteError` — the application layer (claim service /
 *      work-stealing service) is expected to surface this as a contest
 *      and resolve it via the existing contest mechanism.
 *
 *   2. Publishes the event to the federation via the bridge after the local
 *      append succeeds. PII detected during the publish causes the local
 *      append to be rolled back via the bridge throwing.
 *
 *   3. Accepts inbound events from federation peers via `applyRemoteEvent`.
 *      Remote events are merged into the local clock and appended to the
 *      local store with a flag distinguishing them from local writes.
 *
 * Backwards compatibility: the wrapper is opt-in. Callers that don't need
 * federation continue to use `InMemoryClaimEventStore` directly. The
 * IClaimEventStore interface contract is preserved so existing code paths
 * see a vector-clock-aware store as just an event store.
 *
 * @module v3/claims/infrastructure/federated-event-store
 * @see ADR-101 Component B
 */

import type { ClaimDomainEvent, AllExtendedClaimEvents, ClaimEventType, ExtendedClaimEventType } from '../domain/events.js';
import type { IClaimEventStore } from '../domain/repositories.js';
import type { ClaimId, IssueId } from '../domain/types.js';
import type { InMemoryClaimEventStore } from './event-store.js';
import type { IHlc, HlcTimestamp } from './hlc.js';
import {
  type VectorClock,
  zeroVectorClock,
  tickVectorClock,
  mergeVectorClocks,
  compareVectorClocks,
  areConcurrent,
} from './vector-clock.js';
import type { FederationBridge } from './federation-bridge.js';

// =============================================================================
// Errors
// =============================================================================

/**
 * Thrown when an append would cause a concurrent-write conflict against
 * an existing remote-accepted event for the same aggregate. The caller
 * should surface this as a steal contest.
 */
export class ConcurrentWriteError extends Error {
  constructor(
    public readonly aggregateId: string,
    public readonly localVclock: VectorClock,
    public readonly remoteVclock: VectorClock,
  ) {
    super(
      `Concurrent write detected on aggregate '${aggregateId}'. ` +
      `Resolve via contest mechanism.`,
    );
    this.name = 'ConcurrentWriteError';
  }
}

// =============================================================================
// Event metadata extension
// =============================================================================

/**
 * The additional metadata fields a federated event carries.
 * Stored in `event.metadata.federation` so they don't perturb the existing
 * event shape that older readers expect.
 */
export interface FederationMetadata {
  readonly hlc: HlcTimestamp;
  readonly vclock: VectorClock;
  readonly originNodeId: string;
  readonly arrivedFromFederation?: boolean; // true if applyRemoteEvent set it
  readonly envelopeSignature?: string; // present iff arrived from federation
}

const FEDERATION_METADATA_KEY = 'federation' as const;

function readFederationMetadata(event: ClaimDomainEvent): FederationMetadata | undefined {
  const meta = event.metadata?.[FEDERATION_METADATA_KEY];
  return (meta as FederationMetadata | undefined);
}

function writeFederationMetadata(event: ClaimDomainEvent, fm: FederationMetadata): ClaimDomainEvent {
  return {
    ...event,
    metadata: {
      ...(event.metadata ?? {}),
      [FEDERATION_METADATA_KEY]: fm,
    },
  };
}

// =============================================================================
// Per-aggregate state
// =============================================================================

interface AggregateState {
  /** Most recent accepted vclock for this aggregate (any node). */
  vclock: VectorClock;
  /** Most recent accepted HLC for this aggregate. */
  hlc?: HlcTimestamp;
}

// =============================================================================
// Federated event store
// =============================================================================

export interface FederatedClaimEventStoreOptions {
  /** The underlying local event store this wraps. */
  readonly local: InMemoryClaimEventStore;
  /** This node's HLC. */
  readonly hlc: IHlc;
  /** Stable identifier for this federation node. */
  readonly nodeId: string;
  /** Bridge for cross-node publish. Optional — single-node mode skips publish. */
  readonly bridge?: FederationBridge;
}

export class FederatedClaimEventStore implements IClaimEventStore {
  private readonly local: InMemoryClaimEventStore;
  private readonly hlc: IHlc;
  private readonly nodeId: string;
  private readonly bridge?: FederationBridge;
  private readonly aggregates: Map<string, AggregateState> = new Map();

  constructor(opts: FederatedClaimEventStoreOptions) {
    if (!opts.nodeId) throw new Error('FederatedClaimEventStore requires nodeId');
    this.local = opts.local;
    this.hlc = opts.hlc;
    this.nodeId = opts.nodeId;
    this.bridge = opts.bridge;
  }

  async initialize(): Promise<void> {
    await this.local.initialize();
  }

  async shutdown(): Promise<void> {
    await this.local.shutdown();
    this.aggregates.clear();
  }

  // ==========================================================================
  // Write — local
  // ==========================================================================

  async append(event: ClaimDomainEvent): Promise<void> {
    const state = this.aggregates.get(event.aggregateId) ?? {
      vclock: zeroVectorClock(),
    };

    // Tick our entry in the aggregate's clock for the new local event.
    const nextVclock = tickVectorClock(state.vclock, this.nodeId);
    const nextHlc = this.hlc.now();

    // Decorate event with federation metadata (does not mutate caller's object).
    const stamped = writeFederationMetadata(event, {
      hlc: nextHlc,
      vclock: nextVclock,
      originNodeId: this.nodeId,
      arrivedFromFederation: false,
    });

    // Local append first — gives us our durable record before we ever
    // attempt the publish. If the publish then fails (PII or transport),
    // we roll back by removing the just-appended event.
    await this.local.append(stamped);
    this.aggregates.set(event.aggregateId, { vclock: nextVclock, hlc: nextHlc });

    // Federation publish (if configured)
    if (this.bridge) {
      try {
        await this.bridge.publishClaimEvent(stamped, nextVclock, nextHlc);
      } catch (publishError) {
        // Roll back local state. Not all underlying stores expose a
        // `removeLast`; the in-memory one accepts our reaching into it.
        // Future SQLite/AgentDB-backed stores should expose a delete-by-id
        // path — tracked in #1775 follow-ups.
        this.rollbackLastAppend(stamped);
        throw publishError;
      }
    }
  }

  async appendBatch(events: ClaimDomainEvent[]): Promise<void> {
    // Strict sequential append to keep vclock per-event semantics correct.
    for (const event of events) {
      await this.append(event);
    }
  }

  // ==========================================================================
  // Write — remote (federation inbound)
  // ==========================================================================

  /**
   * Apply an event received from a federation peer.
   * Throws `ConcurrentWriteError` if the remote event is concurrent with our
   * latest known state for the aggregate; the caller should surface this as
   * a contest.
   */
  async applyRemoteEvent(
    event: ClaimDomainEvent,
    remoteVclock: VectorClock,
    remoteHlc: HlcTimestamp,
    envelopeSignature?: string,
  ): Promise<void> {
    const state = this.aggregates.get(event.aggregateId) ?? {
      vclock: zeroVectorClock(),
    };

    // Concurrency check
    const order = compareVectorClocks(state.vclock, remoteVclock);
    if (order === 'concurrent') {
      throw new ConcurrentWriteError(event.aggregateId, state.vclock, remoteVclock);
    }
    if (order === 'after' || order === 'equal') {
      // We've already seen this or a later event — drop silently (idempotent).
      return;
    }

    // Update our HLC from the remote (may throw HlcSkewError).
    const mergedHlc = this.hlc.update(remoteHlc);
    const mergedVclock = mergeVectorClocks(state.vclock, remoteVclock);

    const stamped = writeFederationMetadata(event, {
      hlc: mergedHlc,
      vclock: mergedVclock,
      originNodeId: readFederationMetadata(event)?.originNodeId ?? 'unknown',
      arrivedFromFederation: true,
      envelopeSignature,
    });

    await this.local.append(stamped);
    this.aggregates.set(event.aggregateId, { vclock: mergedVclock, hlc: mergedHlc });
  }

  // ==========================================================================
  // Read — delegate to local
  // ==========================================================================

  async getEvents(claimId: ClaimId, fromVersion?: number): Promise<ClaimDomainEvent[]> {
    return this.local.getEvents(claimId, fromVersion);
  }

  async getEventsByType(type: string): Promise<ClaimDomainEvent[]> {
    return this.local.getEventsByType(type);
  }

  async getEventsByIssueId(issueId: IssueId): Promise<ClaimDomainEvent[]> {
    return this.local.getEventsByIssueId(issueId);
  }

  // ==========================================================================
  // Subscriptions — delegate (returns unsubscribe function, matching the
  // local store's signature)
  // ==========================================================================

  subscribe(
    eventTypes: (ClaimEventType | ExtendedClaimEventType)[],
    handler: (event: AllExtendedClaimEvents) => void | Promise<void>,
  ): () => void {
    return this.local.subscribe(eventTypes, handler);
  }

  // ==========================================================================
  // Inspection helpers (for tests + diagnostics)
  // ==========================================================================

  /** Read-only snapshot of the per-aggregate vclock state. */
  getAggregateVclock(aggregateId: string): VectorClock {
    return this.aggregates.get(aggregateId)?.vclock ?? zeroVectorClock();
  }

  /**
   * Detects if a remote vclock would cause a concurrent-write conflict
   * against current local state. Read-only — safe to call before applyRemoteEvent.
   */
  wouldConflict(aggregateId: string, remoteVclock: VectorClock): boolean {
    const local = this.getAggregateVclock(aggregateId);
    return areConcurrent(local, remoteVclock);
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  private rollbackLastAppend(stamped: ClaimDomainEvent): void {
    // The InMemoryClaimEventStore doesn't expose a public remove API; we
    // reach in via duck typing to clean up after a failed publish. This is
    // intentional: future durable stores will get a proper delete-by-id.
    const inner = this.local as unknown as { events?: ClaimDomainEvent[] };
    if (Array.isArray(inner.events)) {
      // Pop the most recent matching event (by id when available).
      for (let i = inner.events.length - 1; i >= 0; i--) {
        if (inner.events[i]?.id === stamped.id) {
          inner.events.splice(i, 1);
          break;
        }
      }
    }
    // Reset aggregate state to whatever we had before the append.
    const fmBefore = readFederationMetadata(stamped);
    if (fmBefore) {
      // We've recorded the new vclock in this.aggregates; revert by
      // looking up the prior state from the remaining events. Simpler
      // approach: rebuild from local events for this aggregate.
      const remaining = (inner.events ?? []).filter(
        (e) => e.aggregateId === stamped.aggregateId,
      );
      const last = remaining[remaining.length - 1];
      const lastFm = last ? readFederationMetadata(last) : undefined;
      this.aggregates.set(stamped.aggregateId, {
        vclock: lastFm?.vclock ?? zeroVectorClock(),
        hlc: lastFm?.hlc,
      });
    }
  }
}
