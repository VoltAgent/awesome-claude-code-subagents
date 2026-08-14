/**
 * @claude-flow/claims - Infrastructure Layer
 *
 * Exports persistence implementations for the claims module.
 *
 * @module v3/claims/infrastructure
 */

// Claim Repository
export {
  InMemoryClaimRepository,
  createClaimRepository,
} from './claim-repository.js';

// Event Store
export {
  InMemoryClaimEventStore,
  createClaimEventStore,
  type EventFilter,
  type EventSubscription,
} from './event-store.js';

// Hybrid Logical Clock (ADR-101 Component A)
export {
  LocalHlc,
  HlcSkewError,
  compareHlc,
  hlcToWallMs,
  wallMsToHlc,
  zeroHlc,
  DEFAULT_MAX_SKEW_MS,
  type HlcTimestamp,
  type IHlc,
  type PhysicalClock,
} from './hlc.js';

// Vector Clock (ADR-101 Component B)
export {
  zeroVectorClock,
  tickVectorClock,
  mergeVectorClocks,
  compareVectorClocks,
  areConcurrent,
  vectorClockToString,
  pruneVectorClock,
  type VectorClock,
  type VectorClockOrder,
} from './vector-clock.js';

// Federation Bridge (ADR-101 Component B — single seam to federation envelopes)
export {
  FederationBridge,
  PiiLeakPreventedError,
  CLAIM_EVENT_MESSAGE_TYPE,
  type FederationEnvelope,
  type IFederationTransport,
  type ClaimEventEnvelopePayload,
  type FederationBridgeOptions,
} from './federation-bridge.js';

// Federated Event Store (ADR-101 Component B)
export {
  FederatedClaimEventStore,
  ConcurrentWriteError,
  type FederatedClaimEventStoreOptions,
  type FederationMetadata,
} from './federated-event-store.js';

// Federated Claim Repository (ADR-101 Component B)
export {
  FederatedClaimRepository,
  type FederatedClaimRepositoryOptions,
  type FederatedQueryOptions,
} from './federated-claim-repository.js';
