/**
 * Federation circuit breaker service (ADR-097 Phase 2.b).
 *
 * Phase 2.a shipped the FederationNode state machine + canTransition table.
 * This service is what drives transitions: it records per-peer send outcomes
 * (success/failure + spend), evaluates thresholds against the configured
 * policy, and calls suspend()/evict()/reactivate() on the entity.
 *
 * Architecture is two-layer to keep the policy testable in isolation:
 *
 *   1. **evaluatePolicy** (pure function) — given rolling samples for a peer
 *      + the policy + now, returns a BreakerDecision describing what should
 *      happen. No I/O, no clock, no entity mutation.
 *   2. **FederationBreakerService** — owns the rolling-sample buffer,
 *      wraps evaluatePolicy with the entity mutation step, and exposes
 *      `recordOutcome` (called by the coordinator on each send completion)
 *      + `tick` (called periodically to drive cooldown/auto-evict).
 *
 * The cost-tracker integration (Phase 3 upstream — emits federation_spend
 * events when sends complete) is *not* wired here; this service holds its
 * own in-memory rolling buffer. When Phase 3 upstream lands, the consumer
 * can call `recordOutcome` from the bus subscriber and the buffer becomes
 * a transparent cache. This keeps Phase 2 deliverable without a hard
 * cost-tracker dependency.
 *
 * Security invariants:
 *
 *   1. Negative tokens/usd are clamped to 0 — a malicious receive-side
 *      reporter cannot drive an "unsuspend" through credit inflation.
 *   2. Sample buffer is bounded per-peer (DEFAULT_MAX_SAMPLES_PER_PEER) so
 *      a high-throughput peer cannot exhaust memory.
 *   3. Policy evaluation is order-independent for SUSPEND triggers —
 *      cost OR failure-ratio fires the same SUSPEND. The reason field
 *      records which one tripped.
 *   4. evaluatePolicy is pure & deterministic given (samples, policy, now)
 *      — no Date.now() calls inside, no random IDs, no hidden state.
 *   5. Auto-eviction only runs from SUSPENDED state and only after the
 *      grace age. Cannot skip SUSPENDED for an ACTIVE → EVICTED jump.
 */

import { FederationNode } from '../domain/entities/federation-node.js';
import {
  FederationNodeState,
  SuspensionReason,
  TransitionReason,
  isCooldownElapsed,
  shouldAutoEvict,
  DEFAULT_SUSPENSION_COOLDOWN_MS,
  DEFAULT_AUTO_EVICTION_AGE_MS,
} from '../domain/value-objects/federation-node-state.js';

/** A single send outcome recorded by the coordinator. */
export interface SendOutcome {
  readonly nodeId: string;
  readonly success: boolean;
  /** Tokens consumed by this leg. Negative values are treated as 0. */
  readonly tokensUsed?: number;
  /** USD spent on this leg. Negative values are treated as 0. */
  readonly usdSpent?: number;
  /** Caller-supplied timestamp (for testability). Defaults to recordOutcome's `now`. */
  readonly at?: Date;
}

/** Configurable thresholds. All defaults come from ADR-097 Part 2. */
export interface BreakerPolicy {
  /** 24h spend cap per peer. Default $5.00. */
  readonly costSuspensionUsd: number;
  /** Window for the cost cap. Default 24h. */
  readonly costWindowMs: number;
  /** Failure ratio that trips the breaker. Default 0.5 (50%). */
  readonly failureRatioThreshold: number;
  /** Window for failure-ratio computation. Default 1h. */
  readonly failureWindowMs: number;
  /** Minimum samples in the failure window before evaluating (anti-noise). Default 10. */
  readonly failureMinSamples: number;
  /** Cooldown before SUSPENDED → reactivate-eligible. Default 30min. */
  readonly cooldownMs: number;
  /** Continuous suspension age before auto-evict. Default 24h. */
  readonly autoEvictionAgeMs: number;
}

export const DEFAULT_BREAKER_POLICY: BreakerPolicy = Object.freeze({
  costSuspensionUsd: 5.0,
  costWindowMs: 24 * 60 * 60 * 1000,
  failureRatioThreshold: 0.5,
  failureWindowMs: 60 * 60 * 1000,
  failureMinSamples: 10,
  cooldownMs: DEFAULT_SUSPENSION_COOLDOWN_MS,
  autoEvictionAgeMs: DEFAULT_AUTO_EVICTION_AGE_MS,
});

/** Per-peer sample buffer cap. ~24h of 1-Hz traffic. */
export const DEFAULT_MAX_SAMPLES_PER_PEER = 100_000;

/** A normalized, time-stamped outcome (negatives clamped, `at` resolved). */
interface NormalizedSample {
  readonly success: boolean;
  readonly tokensUsed: number;
  readonly usdSpent: number;
  readonly at: Date;
}

/**
 * What the breaker decided for a peer at evaluation time. The service then
 * applies the action (calls node.suspend()/evict()/reactivate()) but the
 * decision itself is a pure return so tests can assert it without checking
 * mutated state.
 */
export type BreakerDecision =
  | { readonly action: 'NONE'; readonly nodeId: string }
  | {
      readonly action: 'SUSPEND';
      readonly nodeId: string;
      readonly reason: SuspensionReason;
    }
  | {
      readonly action: 'EVICT';
      readonly nodeId: string;
      readonly reason: SuspensionReason;
    }
  | {
      readonly action: 'REACTIVATE_ELIGIBLE';
      readonly nodeId: string;
    };

/**
 * Pure policy evaluator. Returns the decision the breaker should apply.
 * No I/O, no clock, no entity mutation — given the same inputs, returns the
 * same output. The service layer is responsible for calling node.suspend()
 * / evict() / reactivate() based on this.
 *
 * Decision rules:
 *
 *   For ACTIVE peers:
 *     - 24h cost > policy.costSuspensionUsd → SUSPEND/COST_THRESHOLD_EXCEEDED
 *     - 1h failure ratio > policy.failureRatioThreshold (≥ failureMinSamples
 *       in window) → SUSPEND/FAILURE_RATIO_EXCEEDED
 *     - else NONE
 *
 *   For SUSPENDED peers:
 *     - suspended ≥ autoEvictionAgeMs → EVICT/GRACE_PERIOD_EXPIRED
 *     - cooldown elapsed → REACTIVATE_ELIGIBLE (caller probes + reactivates)
 *     - else NONE
 *
 *   For EVICTED peers: always NONE (terminal under breaker flow).
 *
 * Cost takes priority over failure-ratio when both trip, because cost is
 * the more conservative signal (a malicious peer can manufacture failures
 * by trickling errors but cannot manufacture spend without actually
 * burning budget).
 */
export function evaluatePolicy(
  samples: readonly NormalizedSample[],
  node: FederationNode,
  policy: BreakerPolicy,
  now: Date,
): BreakerDecision {
  if (node.state === FederationNodeState.EVICTED) {
    return { action: 'NONE', nodeId: node.nodeId };
  }

  if (node.state === FederationNodeState.SUSPENDED) {
    if (shouldAutoEvict(node.stateChangedAt, now, policy.autoEvictionAgeMs)) {
      return {
        action: 'EVICT',
        nodeId: node.nodeId,
        reason: 'GRACE_PERIOD_EXPIRED',
      };
    }
    if (isCooldownElapsed(node.stateChangedAt, now, policy.cooldownMs)) {
      return { action: 'REACTIVATE_ELIGIBLE', nodeId: node.nodeId };
    }
    return { action: 'NONE', nodeId: node.nodeId };
  }

  // ACTIVE: check cost first, then failure ratio. Cost takes priority.
  const costCutoff = now.getTime() - policy.costWindowMs;
  let cumUsd = 0;
  for (const s of samples) {
    if (s.at.getTime() >= costCutoff) cumUsd += s.usdSpent;
  }
  if (cumUsd > policy.costSuspensionUsd) {
    return {
      action: 'SUSPEND',
      nodeId: node.nodeId,
      reason: 'COST_THRESHOLD_EXCEEDED',
    };
  }

  const failCutoff = now.getTime() - policy.failureWindowMs;
  let total = 0;
  let failures = 0;
  for (const s of samples) {
    if (s.at.getTime() < failCutoff) continue;
    total++;
    if (!s.success) failures++;
  }
  if (total >= policy.failureMinSamples) {
    const ratio = failures / total;
    if (ratio > policy.failureRatioThreshold) {
      return {
        action: 'SUSPEND',
        nodeId: node.nodeId,
        reason: 'FAILURE_RATIO_EXCEEDED',
      };
    }
  }

  return { action: 'NONE', nodeId: node.nodeId };
}

/**
 * Stateful service: owns the per-peer sample buffer, applies decisions to
 * entities, and exposes the breaker control surface to the coordinator.
 *
 * Construct once per federation coordinator. Inject the policy if you need
 * non-default thresholds (Phase 4 doctor surface will let users tune them).
 */
/**
 * ADR-111 Phase 3 — callback invoked after the breaker applies a successful
 * state transition. Used by the coordinator to propagate suspends to the
 * WG mesh layer (clearing AllowedIPs). Not invoked for `apply=false` dry runs
 * or `NONE` / `REACTIVATE_ELIGIBLE` decisions. Errors thrown from the callback
 * are swallowed at the breaker — the entity transition has already happened,
 * and side-effect failures shouldn't unwind the breaker's internal state.
 */
export type BreakerTransitionListener = (
  node: FederationNode,
  decision: BreakerDecision,
) => void | Promise<void>;

export class FederationBreakerService {
  private readonly policy: BreakerPolicy;
  private readonly samples: Map<string, NormalizedSample[]>;
  private readonly maxSamplesPerPeer: number;
  private readonly onTransition?: BreakerTransitionListener;

  constructor(
    policy: BreakerPolicy = DEFAULT_BREAKER_POLICY,
    maxSamplesPerPeer: number = DEFAULT_MAX_SAMPLES_PER_PEER,
    onTransition?: BreakerTransitionListener,
  ) {
    this.policy = policy;
    this.samples = new Map();
    this.maxSamplesPerPeer = maxSamplesPerPeer;
    this.onTransition = onTransition;
  }

  /** Read the active policy (handy for tests + doctor surface). */
  getPolicy(): BreakerPolicy {
    return this.policy;
  }

  /**
   * Record a send outcome for a peer. Called by the coordinator after each
   * `routing.send` completion. Returns a BreakerDecision describing what,
   * if anything, the breaker would do for this peer right now — but does
   * NOT apply it (the caller asks `evaluate(node)` if they want the action
   * to actually happen). This split lets the coordinator decide whether to
   * apply on every outcome or batch via tick.
   *
   * Negative tokens/usd are clamped to 0. A peer cannot inflate its own
   * remaining cost ceiling by reporting credits.
   */
  recordOutcome(outcome: SendOutcome, now: Date = new Date()): void {
    const normalized: NormalizedSample = {
      success: outcome.success,
      tokensUsed: Math.max(0, outcome.tokensUsed ?? 0),
      usdSpent: Math.max(0, outcome.usdSpent ?? 0),
      at: outcome.at ?? now,
    };

    const buf = this.samples.get(outcome.nodeId) ?? [];
    buf.push(normalized);
    // Bounded buffer: drop oldest if over cap. Keeps memory bounded under
    // sustained high traffic while preserving the most-recent window.
    if (buf.length > this.maxSamplesPerPeer) {
      buf.splice(0, buf.length - this.maxSamplesPerPeer);
    }
    this.samples.set(outcome.nodeId, buf);
  }

  /**
   * Evaluate the breaker for one peer and apply the resulting transition
   * to the entity. Returns the decision so callers can observe the outcome.
   *
   * `apply` defaults to true — set to false to get the dry-run decision
   * without mutating the entity (useful for the doctor surface).
   */
  evaluate(
    node: FederationNode,
    now: Date = new Date(),
    apply: boolean = true,
  ): BreakerDecision {
    const buf = this.samples.get(node.nodeId) ?? [];
    const decision = evaluatePolicy(buf, node, this.policy, now);

    if (!apply) return decision;

    let transitioned = false;
    switch (decision.action) {
      case 'SUSPEND': {
        const reason: TransitionReason = { reason: decision.reason };
        transitioned = node.suspend(reason, now);
        break;
      }
      case 'EVICT': {
        const reason: TransitionReason = { reason: decision.reason };
        transitioned = node.evict(reason, now);
        break;
      }
      case 'REACTIVATE_ELIGIBLE':
        // The breaker does NOT auto-reactivate. The integrator's health
        // probe is responsible for confirming the peer is healthy and
        // calling node.reactivate() itself. We only signal eligibility.
        break;
      case 'NONE':
        break;
    }

    if (transitioned && this.onTransition) {
      // Side-effect listener (ADR-111 Phase 3). Errors are swallowed so a
      // failing WG propagation can't unwind the entity transition that
      // already succeeded — coordinator should log via its own audit trail.
      Promise.resolve(this.onTransition(node, decision)).catch(() => { /* swallow */ });
    }

    return decision;
  }

  /**
   * Periodic tick — evaluate all known peers. Intended to be called from a
   * timer or after each batch of outcomes. Returns the decisions for
   * observability.
   */
  tick(nodes: readonly FederationNode[], now: Date = new Date()): BreakerDecision[] {
    return nodes.map((n) => this.evaluate(n, now));
  }

  /** Drop a peer's sample buffer (e.g. after reactivate or evict). */
  forget(nodeId: string): void {
    this.samples.delete(nodeId);
  }

  /**
   * Snapshot of per-peer aggregates for the doctor surface. Pure read —
   * does not mutate the buffer.
   */
  snapshot(nodeId: string, now: Date = new Date()): {
    readonly nodeId: string;
    readonly sampleCount: number;
    readonly cumUsdInWindow: number;
    readonly failureRatioInWindow: number | null;
  } {
    const buf = this.samples.get(nodeId) ?? [];
    const costCutoff = now.getTime() - this.policy.costWindowMs;
    const failCutoff = now.getTime() - this.policy.failureWindowMs;
    let cumUsd = 0;
    let total = 0;
    let failures = 0;
    for (const s of buf) {
      if (s.at.getTime() >= costCutoff) cumUsd += s.usdSpent;
      if (s.at.getTime() >= failCutoff) {
        total++;
        if (!s.success) failures++;
      }
    }
    return {
      nodeId,
      sampleCount: buf.length,
      cumUsdInWindow: cumUsd,
      failureRatioInWindow: total > 0 ? failures / total : null,
    };
  }
}
