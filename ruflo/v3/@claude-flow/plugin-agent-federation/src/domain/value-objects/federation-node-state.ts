/**
 * Federation peer state machine (ADR-097 Phase 2).
 *
 * Phase 1 shipped the budget envelope + enforcer that travels with every
 * outbound message. Phase 2 adds the per-peer breaker: when a peer crosses a
 * cost or failure threshold, transition it to SUSPENDED so subsequent
 * `federation_send` calls short-circuit. After a cooldown the peer can
 * recover; if it stays bad the breaker escalates to EVICTED.
 *
 * This module is the *value object* layer — pure, no I/O. The breaker
 * service (Phase 2.b, separate file) reads cost-tracker telemetry, evaluates
 * thresholds, and calls `transition` on the FederationNode entity. Decoupling
 * the state machine from the policy lets tests pin transitions without
 * standing up the cost bus.
 *
 * Security invariants pinned by the spec:
 *
 *   1. EVICTED is terminal under normal flow. The only way out is an
 *      explicit `reactivate` call (operator-initiated). This prevents a
 *      misbehaving peer from auto-recovering through the cooldown.
 *   2. canTransition is the single source of truth for legality. Any path
 *      that mutates state MUST consult it; direct field writes are not
 *      permitted (entity getter/setter shape enforces this).
 *   3. Reasons are constant strings, no remaining-budget echo on failure
 *      (matches Phase 1's anti-oracle posture).
 *   4. Default cooldown is conservative (30 min) so a transient spike
 *      cannot ping-pong a peer ACTIVE↔SUSPENDED at high frequency.
 */

/** Lifecycle state of a federation peer. */
export enum FederationNodeState {
  /** Default; healthy. `federation_send` accepts deliveries. */
  ACTIVE = 'ACTIVE',
  /** Breaker tripped. Sends short-circuit with PEER_SUSPENDED. */
  SUSPENDED = 'SUSPENDED',
  /** Removed from active rotation. Sends short-circuit with PEER_EVICTED. */
  EVICTED = 'EVICTED',
}

/** Reason a peer was suspended/evicted. Constant strings — no echo of caps. */
export type SuspensionReason =
  | 'COST_THRESHOLD_EXCEEDED'
  | 'FAILURE_RATIO_EXCEEDED'
  | 'MANUAL_SUSPEND'
  | 'GRACE_PERIOD_EXPIRED'
  | 'MANUAL_EVICT';

/**
 * Default cooldown a SUSPENDED peer must wait before being eligible for
 * SUSPENDED → ACTIVE. 30 minutes matches the ADR-097 Part 2 spec and is
 * intentionally well past the prompt-cache window so a recovery probe is
 * cheap to amortize.
 */
export const DEFAULT_SUSPENSION_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Default age at which a continuously-SUSPENDED peer is auto-escalated to
 * EVICTED. 24 hours per spec — long enough to ride out a cost-tracker
 * outage without false eviction, short enough that a genuinely-broken peer
 * doesn't linger forever.
 */
export const DEFAULT_AUTO_EVICTION_AGE_MS = 24 * 60 * 60 * 1000;

/** A successful transition's reason payload (for the audit trail). */
export interface TransitionReason {
  readonly reason: SuspensionReason;
  /** Optional opaque correlation key — task ID, breaker run ID, etc. */
  readonly correlationId?: string;
}

/**
 * Static legality table for state transitions. Returns true iff the
 * `from -> to` edge is in the allowed set. Used by the entity to reject
 * illegal mutations before applying them.
 *
 * Allowed edges:
 *   ACTIVE    → SUSPENDED  (breaker trips)
 *   SUSPENDED → ACTIVE     (cooldown + probe success)
 *   SUSPENDED → EVICTED    (grace expired, or manual evict)
 *   ACTIVE    → EVICTED    (manual evict only — skips suspend)
 *   EVICTED   → ACTIVE     (manual reactivate only)
 *
 * Disallowed (anything else, including self-loops, is a no-op error).
 */
export function canTransition(
  from: FederationNodeState,
  to: FederationNodeState,
): boolean {
  if (from === to) return false;
  if (from === FederationNodeState.ACTIVE) {
    return to === FederationNodeState.SUSPENDED || to === FederationNodeState.EVICTED;
  }
  if (from === FederationNodeState.SUSPENDED) {
    return to === FederationNodeState.ACTIVE || to === FederationNodeState.EVICTED;
  }
  // EVICTED is terminal except for explicit operator reactivate.
  return to === FederationNodeState.ACTIVE;
}

/**
 * Should a SUSPENDED peer be eligible for SUSPENDED → ACTIVE based purely
 * on elapsed time? The breaker still has to confirm health via probe before
 * it actually calls reactivate; this just answers "is the cooldown done?"
 *
 * Pure function of (suspendedAt, now, cooldownMs) so it's trivially
 * deterministic in tests.
 */
export function isCooldownElapsed(
  suspendedAt: Date,
  now: Date,
  cooldownMs: number = DEFAULT_SUSPENSION_COOLDOWN_MS,
): boolean {
  return now.getTime() - suspendedAt.getTime() >= cooldownMs;
}

/**
 * Should a SUSPENDED peer be auto-escalated to EVICTED based on the age of
 * its suspension? Returns true once the peer has been continuously
 * SUSPENDED past the configured limit (default 24h). The breaker calls
 * this on each tick and, if true, issues the SUSPENDED → EVICTED
 * transition with reason GRACE_PERIOD_EXPIRED.
 */
export function shouldAutoEvict(
  suspendedAt: Date,
  now: Date,
  ageLimitMs: number = DEFAULT_AUTO_EVICTION_AGE_MS,
): boolean {
  return now.getTime() - suspendedAt.getTime() >= ageLimitMs;
}
