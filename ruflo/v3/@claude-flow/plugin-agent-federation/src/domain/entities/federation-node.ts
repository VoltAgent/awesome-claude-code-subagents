import { TrustLevel } from './trust-level.js';
import {
  FederationNodeState,
  SuspensionReason,
  TransitionReason,
  canTransition,
} from '../value-objects/federation-node-state.js';

export interface FederationNodeCapabilities {
  readonly agentTypes: readonly string[];
  readonly maxConcurrentSessions: number;
  readonly supportedProtocols: readonly string[];
  readonly complianceModes: readonly string[];
}

export interface FederationNodeMetadata {
  readonly organizationId?: string;
  readonly region?: string;
  readonly version?: string;
  readonly [key: string]: unknown;
}

/** Last-transition record kept on the entity for the audit trail. */
export interface FederationNodeStateRecord {
  readonly state: FederationNodeState;
  readonly changedAt: Date;
  readonly reason?: SuspensionReason;
  readonly correlationId?: string;
}

export interface FederationNodeProps {
  readonly nodeId: string;
  readonly publicKey: string;
  readonly endpoint: string;
  readonly capabilities: FederationNodeCapabilities;
  readonly trustLevel: TrustLevel;
  readonly trustScore: number;
  readonly lastSeen: Date;
  readonly metadata: FederationNodeMetadata;
  /** Phase 2: peer state. Defaults to ACTIVE if unset. */
  readonly state?: FederationNodeState;
  /** Phase 2: when the current state was entered. Defaults to now. */
  readonly stateChangedAt?: Date;
  /** Phase 2: why we entered the current non-ACTIVE state. */
  readonly stateReason?: SuspensionReason;
  /** Phase 2: caller correlation key for the last transition. */
  readonly stateCorrelationId?: string;
}

export class FederationNode {
  readonly nodeId: string;
  readonly publicKey: string;
  readonly endpoint: string;
  readonly capabilities: FederationNodeCapabilities;

  private _trustLevel: TrustLevel;
  private _trustScore: number;
  private _lastSeen: Date;
  private readonly _metadata: FederationNodeMetadata;

  // Phase 2 state machine. Mutated only via suspend()/evict()/reactivate().
  // Direct field writes are not permitted — every transition flows through
  // canTransition() in federation-node-state.ts.
  private _state: FederationNodeState;
  private _stateChangedAt: Date;
  private _stateReason?: SuspensionReason;
  private _stateCorrelationId?: string;

  constructor(props: FederationNodeProps) {
    this.nodeId = props.nodeId;
    this.publicKey = props.publicKey;
    this.endpoint = props.endpoint;
    this.capabilities = props.capabilities;
    this._trustLevel = props.trustLevel;
    this._trustScore = props.trustScore;
    this._lastSeen = props.lastSeen;
    this._metadata = props.metadata;
    this._state = props.state ?? FederationNodeState.ACTIVE;
    this._stateChangedAt = props.stateChangedAt ?? new Date();
    this._stateReason = props.stateReason;
    this._stateCorrelationId = props.stateCorrelationId;
  }

  get trustLevel(): TrustLevel {
    return this._trustLevel;
  }

  get trustScore(): number {
    return this._trustScore;
  }

  get lastSeen(): Date {
    return this._lastSeen;
  }

  get metadata(): FederationNodeMetadata {
    return this._metadata;
  }

  /** Current peer state (ADR-097 Phase 2). */
  get state(): FederationNodeState {
    return this._state;
  }

  /** When the current state was entered. */
  get stateChangedAt(): Date {
    return this._stateChangedAt;
  }

  /** Last-transition record for the audit trail. */
  get stateRecord(): FederationNodeStateRecord {
    return {
      state: this._state,
      changedAt: this._stateChangedAt,
      reason: this._stateReason,
      correlationId: this._stateCorrelationId,
    };
  }

  /** Convenience predicate: is this peer accepting outbound sends? */
  get isActive(): boolean {
    return this._state === FederationNodeState.ACTIVE;
  }

  /** Convenience predicate: is this peer terminally evicted? */
  get isEvicted(): boolean {
    return this._state === FederationNodeState.EVICTED;
  }

  updateTrustLevel(level: TrustLevel): void {
    this._trustLevel = level;
  }

  updateTrustScore(score: number): void {
    this._trustScore = Math.max(0, Math.min(1, score));
  }

  markSeen(): void {
    this._lastSeen = new Date();
  }

  isStale(maxAgeMs: number): boolean {
    return Date.now() - this._lastSeen.getTime() > maxAgeMs;
  }

  /**
   * Transition this peer to SUSPENDED. Legal from ACTIVE only — calling
   * from SUSPENDED or EVICTED returns false (the entity is already at or
   * past the breaker threshold, so a duplicate trip is a no-op).
   *
   * Returns true if the state changed, false if the call was rejected
   * (illegal transition). The breaker treats false as "already handled."
   */
  suspend(reason: TransitionReason, now: Date = new Date()): boolean {
    return this._transition(FederationNodeState.SUSPENDED, reason, now);
  }

  /**
   * Transition this peer to EVICTED. Legal from ACTIVE or SUSPENDED.
   * EVICTED is terminal under normal flow — only `reactivate` (operator-
   * initiated) can move the peer back to ACTIVE.
   */
  evict(reason: TransitionReason, now: Date = new Date()): boolean {
    return this._transition(FederationNodeState.EVICTED, reason, now);
  }

  /**
   * Transition back to ACTIVE. Legal from SUSPENDED (after cooldown +
   * probe success — the breaker is responsible for those checks; this
   * entity does not gate on time) or from EVICTED (operator override).
   *
   * `correlationId` lets the caller record *why* they're reactivating
   * (probe ID, operator ticket, etc.) for the audit trail.
   */
  reactivate(correlationId?: string, now: Date = new Date()): boolean {
    if (!canTransition(this._state, FederationNodeState.ACTIVE)) return false;
    this._state = FederationNodeState.ACTIVE;
    this._stateChangedAt = now;
    this._stateReason = undefined;
    this._stateCorrelationId = correlationId;
    return true;
  }

  private _transition(
    target: FederationNodeState,
    reason: TransitionReason,
    now: Date,
  ): boolean {
    if (!canTransition(this._state, target)) return false;
    this._state = target;
    this._stateChangedAt = now;
    this._stateReason = reason.reason;
    this._stateCorrelationId = reason.correlationId;
    return true;
  }

  toProps(): FederationNodeProps {
    return {
      nodeId: this.nodeId,
      publicKey: this.publicKey,
      endpoint: this.endpoint,
      capabilities: this.capabilities,
      trustLevel: this._trustLevel,
      trustScore: this._trustScore,
      lastSeen: this._lastSeen,
      metadata: this._metadata,
      state: this._state,
      stateChangedAt: this._stateChangedAt,
      stateReason: this._stateReason,
      stateCorrelationId: this._stateCorrelationId,
    };
  }

  static create(props: Omit<FederationNodeProps, 'trustLevel' | 'trustScore' | 'lastSeen'> & {
    trustLevel?: TrustLevel;
    trustScore?: number;
    lastSeen?: Date;
  }): FederationNode {
    return new FederationNode({
      ...props,
      trustLevel: props.trustLevel ?? TrustLevel.UNTRUSTED,
      trustScore: props.trustScore ?? 0,
      lastSeen: props.lastSeen ?? new Date(),
    });
  }
}
