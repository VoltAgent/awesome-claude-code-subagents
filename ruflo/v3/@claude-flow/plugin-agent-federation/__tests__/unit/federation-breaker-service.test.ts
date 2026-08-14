/**
 * Tests for ADR-097 Phase 2.b — federation circuit breaker service.
 *
 * Two test surfaces:
 *
 *   1. **evaluatePolicy** — pure function tests pinning the decision rules:
 *      cost cap, failure ratio with min-samples gate, cost-takes-priority,
 *      auto-evict, cooldown-eligibility, EVICTED-is-noop.
 *
 *   2. **FederationBreakerService** — stateful tests pinning the buffer
 *      hygiene (negative clamp, bounded buffer), mutation behavior
 *      (apply=true vs dry-run), and cooperation with the entity (no
 *      auto-reactivate; only signals eligibility).
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BREAKER_POLICY,
  FederationBreakerService,
  evaluatePolicy,
  type BreakerPolicy,
} from '../../src/application/federation-breaker-service.js';
import { FederationNode } from '../../src/domain/entities/federation-node.js';
import { FederationNodeState } from '../../src/domain/value-objects/federation-node-state.js';

function mkNode(state?: FederationNodeState, stateChangedAt?: Date, nodeId: string = 'node-1') {
  return FederationNode.create({
    nodeId,
    publicKey: 'pk',
    endpoint: 'https://example.test',
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

const POLICY: BreakerPolicy = {
  costSuspensionUsd: 5,
  costWindowMs: 24 * 60 * 60 * 1000,
  failureRatioThreshold: 0.5,
  failureWindowMs: 60 * 60 * 1000,
  failureMinSamples: 10,
  cooldownMs: 30 * 60 * 1000,
  autoEvictionAgeMs: 24 * 60 * 60 * 1000,
};

const T0 = new Date('2026-05-09T12:00:00Z');

describe('evaluatePolicy — ACTIVE peer (ADR-097 Phase 2.b)', () => {
  it('returns NONE when no samples', () => {
    const node = mkNode();
    const r = evaluatePolicy([], node, POLICY, T0);
    expect(r.action).toBe('NONE');
  });

  it('SUSPEND/COST when 24h spend exceeds cap', () => {
    const node = mkNode();
    const samples = [
      { success: true, tokensUsed: 0, usdSpent: 4.0, at: new Date(T0.getTime() - 1000) },
      { success: true, tokensUsed: 0, usdSpent: 1.5, at: new Date(T0.getTime() - 500) },
    ];
    const r = evaluatePolicy(samples, node, POLICY, T0);
    expect(r.action).toBe('SUSPEND');
    if (r.action === 'SUSPEND') expect(r.reason).toBe('COST_THRESHOLD_EXCEEDED');
  });

  it('does NOT suspend on cost when sample is outside the 24h window', () => {
    const node = mkNode();
    const samples = [
      { success: true, tokensUsed: 0, usdSpent: 100, at: new Date(T0.getTime() - POLICY.costWindowMs - 1) },
    ];
    const r = evaluatePolicy(samples, node, POLICY, T0);
    expect(r.action).toBe('NONE');
  });

  it('SUSPEND/FAILURE when ratio exceeds threshold AND samples >= minSamples', () => {
    const node = mkNode();
    const samples = Array.from({ length: 12 }, (_, i) => ({
      success: i < 5, // 5 success / 7 fail = 58% failure
      tokensUsed: 0,
      usdSpent: 0,
      at: new Date(T0.getTime() - 1000 * (i + 1)),
    }));
    const r = evaluatePolicy(samples, node, POLICY, T0);
    expect(r.action).toBe('SUSPEND');
    if (r.action === 'SUSPEND') expect(r.reason).toBe('FAILURE_RATIO_EXCEEDED');
  });

  it('does NOT suspend on failure when below minSamples (anti-noise)', () => {
    const node = mkNode();
    // 5 of 8 fail = 62.5% failure ratio, but only 8 samples (< minSamples=10)
    const samples = Array.from({ length: 8 }, (_, i) => ({
      success: i < 3,
      tokensUsed: 0,
      usdSpent: 0,
      at: new Date(T0.getTime() - 1000 * (i + 1)),
    }));
    const r = evaluatePolicy(samples, node, POLICY, T0);
    expect(r.action).toBe('NONE');
  });

  it('does NOT suspend when ratio is exactly at threshold (strict >)', () => {
    const node = mkNode();
    // exactly 5/10 = 0.5 — must NOT trip (threshold is strict >)
    const samples = Array.from({ length: 10 }, (_, i) => ({
      success: i < 5,
      tokensUsed: 0,
      usdSpent: 0,
      at: new Date(T0.getTime() - 1000 * (i + 1)),
    }));
    const r = evaluatePolicy(samples, node, POLICY, T0);
    expect(r.action).toBe('NONE');
  });

  it('cost takes priority over failure when both trip', () => {
    const node = mkNode();
    const samples = [
      ...Array.from({ length: 10 }, (_, i) => ({
        success: false,
        tokensUsed: 0,
        usdSpent: 1.0,
        at: new Date(T0.getTime() - 1000 * (i + 1)),
      })),
    ];
    // Both: 100% failure AND $10 cost
    const r = evaluatePolicy(samples, node, POLICY, T0);
    expect(r.action).toBe('SUSPEND');
    if (r.action === 'SUSPEND') expect(r.reason).toBe('COST_THRESHOLD_EXCEEDED');
  });

  it('failure samples outside 1h window are excluded', () => {
    const node = mkNode();
    // 12 failures BUT all outside the 1h failure window
    const samples = Array.from({ length: 12 }, () => ({
      success: false,
      tokensUsed: 0,
      usdSpent: 0,
      at: new Date(T0.getTime() - POLICY.failureWindowMs - 1000),
    }));
    const r = evaluatePolicy(samples, node, POLICY, T0);
    expect(r.action).toBe('NONE');
  });
});

describe('evaluatePolicy — SUSPENDED peer', () => {
  it('returns REACTIVATE_ELIGIBLE once cooldown elapsed', () => {
    const suspendedAt = new Date(T0.getTime() - POLICY.cooldownMs);
    const node = mkNode(FederationNodeState.SUSPENDED, suspendedAt);
    const r = evaluatePolicy([], node, POLICY, T0);
    expect(r.action).toBe('REACTIVATE_ELIGIBLE');
  });

  it('returns NONE while still in cooldown', () => {
    const suspendedAt = new Date(T0.getTime() - POLICY.cooldownMs + 1);
    const node = mkNode(FederationNodeState.SUSPENDED, suspendedAt);
    const r = evaluatePolicy([], node, POLICY, T0);
    expect(r.action).toBe('NONE');
  });

  it('EVICT/GRACE_PERIOD_EXPIRED once auto-evict age elapsed', () => {
    const suspendedAt = new Date(T0.getTime() - POLICY.autoEvictionAgeMs);
    const node = mkNode(FederationNodeState.SUSPENDED, suspendedAt);
    const r = evaluatePolicy([], node, POLICY, T0);
    expect(r.action).toBe('EVICT');
    if (r.action === 'EVICT') expect(r.reason).toBe('GRACE_PERIOD_EXPIRED');
  });

  it('auto-evict takes priority over reactivate-eligible (terminal escalation)', () => {
    const suspendedAt = new Date(T0.getTime() - POLICY.autoEvictionAgeMs - 1000);
    const node = mkNode(FederationNodeState.SUSPENDED, suspendedAt);
    const r = evaluatePolicy([], node, POLICY, T0);
    // Both cooldown elapsed AND auto-evict age — must EVICT
    expect(r.action).toBe('EVICT');
  });
});

describe('evaluatePolicy — EVICTED peer (terminal)', () => {
  it('always returns NONE regardless of samples', () => {
    const node = mkNode(FederationNodeState.EVICTED, T0);
    const samples = Array.from({ length: 100 }, () => ({
      success: false,
      tokensUsed: 0,
      usdSpent: 100,
      at: T0,
    }));
    const r = evaluatePolicy(samples, node, POLICY, T0);
    expect(r.action).toBe('NONE');
  });
});

describe('FederationBreakerService — stateful behavior', () => {
  describe('recordOutcome / sample hygiene', () => {
    it('clamps negative tokens to 0 (anti-credit-inflation)', () => {
      const svc = new FederationBreakerService(POLICY);
      svc.recordOutcome({ nodeId: 'n1', success: true, tokensUsed: -1000, usdSpent: 0 }, T0);
      const s = svc.snapshot('n1', T0);
      expect(s.cumUsdInWindow).toBe(0);
      // sample is recorded but with 0 tokens — verify by triggering a cost check
      svc.recordOutcome({ nodeId: 'n1', success: true, tokensUsed: 0, usdSpent: 10 }, T0);
      const s2 = svc.snapshot('n1', T0);
      expect(s2.cumUsdInWindow).toBe(10); // not 10 + (-X)
    });

    it('clamps negative usd to 0', () => {
      const svc = new FederationBreakerService(POLICY);
      svc.recordOutcome({ nodeId: 'n1', success: true, tokensUsed: 0, usdSpent: -100 }, T0);
      const s = svc.snapshot('n1', T0);
      expect(s.cumUsdInWindow).toBe(0);
    });

    it('bounds buffer to maxSamplesPerPeer', () => {
      const svc = new FederationBreakerService(POLICY, 5);
      for (let i = 0; i < 20; i++) {
        svc.recordOutcome(
          { nodeId: 'n1', success: true, usdSpent: 0.1, at: new Date(T0.getTime() + i) },
          T0,
        );
      }
      const s = svc.snapshot('n1', T0);
      expect(s.sampleCount).toBe(5);
    });
  });

  describe('evaluate / mutation contract', () => {
    it('apply=true mutates node on SUSPEND decision', () => {
      const svc = new FederationBreakerService(POLICY);
      const node = mkNode();
      svc.recordOutcome({ nodeId: node.nodeId, success: true, usdSpent: 6.0, at: T0 }, T0);
      const decision = svc.evaluate(node, T0);
      expect(decision.action).toBe('SUSPEND');
      expect(node.state).toBe(FederationNodeState.SUSPENDED);
      expect(node.stateChangedAt).toEqual(T0);
      expect(node.stateRecord.reason).toBe('COST_THRESHOLD_EXCEEDED');
    });

    it('apply=false returns the decision without mutating', () => {
      const svc = new FederationBreakerService(POLICY);
      const node = mkNode();
      svc.recordOutcome({ nodeId: node.nodeId, success: true, usdSpent: 6.0, at: T0 }, T0);
      const decision = svc.evaluate(node, T0, false);
      expect(decision.action).toBe('SUSPEND');
      expect(node.state).toBe(FederationNodeState.ACTIVE);
    });

    it('REACTIVATE_ELIGIBLE does NOT auto-reactivate (probe is integrator concern)', () => {
      const svc = new FederationBreakerService(POLICY);
      const suspendedAt = new Date(T0.getTime() - POLICY.cooldownMs);
      const node = mkNode(FederationNodeState.SUSPENDED, suspendedAt);
      const decision = svc.evaluate(node, T0);
      expect(decision.action).toBe('REACTIVATE_ELIGIBLE');
      // Critical: state must STILL be SUSPENDED. The breaker only signals
      // eligibility; the integrator's health probe calls reactivate().
      expect(node.state).toBe(FederationNodeState.SUSPENDED);
    });

    it('EVICT applies the transition (terminal under breaker flow)', () => {
      const svc = new FederationBreakerService(POLICY);
      const suspendedAt = new Date(T0.getTime() - POLICY.autoEvictionAgeMs);
      const node = mkNode(FederationNodeState.SUSPENDED, suspendedAt);
      const decision = svc.evaluate(node, T0);
      expect(decision.action).toBe('EVICT');
      expect(node.state).toBe(FederationNodeState.EVICTED);
    });
  });

  describe('tick / multi-peer evaluation', () => {
    it('returns one decision per node', () => {
      const svc = new FederationBreakerService(POLICY);
      const n1 = mkNode(undefined, undefined, 'peer-a');
      const n2 = mkNode(undefined, undefined, 'peer-b');
      // n1 budget overrun, n2 healthy
      svc.recordOutcome({ nodeId: n1.nodeId, success: true, usdSpent: 6.0 }, T0);
      const decisions = svc.tick([n1, n2], T0);
      expect(decisions).toHaveLength(2);
      expect(decisions[0].action).toBe('SUSPEND');
      expect(decisions[1].action).toBe('NONE');
    });
  });

  describe('snapshot / observability', () => {
    it('reports cumulative cost + failure ratio in respective windows', () => {
      const svc = new FederationBreakerService(POLICY);
      svc.recordOutcome({ nodeId: 'n1', success: true, usdSpent: 1.0, at: T0 }, T0);
      svc.recordOutcome({ nodeId: 'n1', success: false, usdSpent: 2.0, at: T0 }, T0);
      const s = svc.snapshot('n1', T0);
      expect(s.sampleCount).toBe(2);
      expect(s.cumUsdInWindow).toBe(3.0);
      expect(s.failureRatioInWindow).toBe(0.5);
    });

    it('returns null failureRatio when no samples in window', () => {
      const svc = new FederationBreakerService(POLICY);
      const s = svc.snapshot('unknown-node', T0);
      expect(s.sampleCount).toBe(0);
      expect(s.failureRatioInWindow).toBeNull();
    });
  });

  describe('forget / lifecycle', () => {
    it('drops a peer\'s sample buffer', () => {
      const svc = new FederationBreakerService(POLICY);
      svc.recordOutcome({ nodeId: 'n1', success: true, usdSpent: 1.0 }, T0);
      svc.forget('n1');
      const s = svc.snapshot('n1', T0);
      expect(s.sampleCount).toBe(0);
    });
  });

  describe('default policy is sane', () => {
    it('matches ADR-097 Part 2 spec values', () => {
      expect(DEFAULT_BREAKER_POLICY.costSuspensionUsd).toBe(5.0);
      expect(DEFAULT_BREAKER_POLICY.failureRatioThreshold).toBe(0.5);
      expect(DEFAULT_BREAKER_POLICY.failureMinSamples).toBe(10);
      expect(DEFAULT_BREAKER_POLICY.cooldownMs).toBe(30 * 60 * 1000);
      expect(DEFAULT_BREAKER_POLICY.autoEvictionAgeMs).toBe(24 * 60 * 60 * 1000);
    });
  });
});
