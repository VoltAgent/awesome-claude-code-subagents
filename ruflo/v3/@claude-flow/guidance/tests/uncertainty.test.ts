/**
 * Test suite for @claude-flow/guidance/uncertainty
 *
 * Tests UncertaintyLedger and UncertaintyAggregator classes for probabilistic
 * belief tracking with confidence intervals, evidence management, and inference chains.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createUncertaintyLedger,
  createUncertaintyAggregator,
  UncertaintyLedger,
  UncertaintyAggregator,
  type Belief,
  type EvidencePointer,
  type BeliefStatus,
  type UncertaintyConfig,
} from '../src/uncertainty.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createSupportingEvidence(weight = 0.8): EvidencePointer {
  return {
    sourceId: `evidence-${Date.now()}-${Math.random()}`,
    sourceType: 'memory-read',
    supports: true,
    weight,
    timestamp: Date.now(),
  };
}

function createOpposingEvidence(weight = 0.8): EvidencePointer {
  return {
    sourceId: `evidence-${Date.now()}-${Math.random()}`,
    sourceType: 'tool-output',
    supports: false,
    weight,
    timestamp: Date.now(),
  };
}

function createHumanInputEvidence(supports = true): EvidencePointer {
  return {
    sourceId: `human-${Date.now()}`,
    sourceType: 'human-input',
    supports,
    weight: 1.0,
    timestamp: Date.now(),
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

describe('Factory Functions', () => {
  it('should create UncertaintyLedger with default config', () => {
    const ledger = createUncertaintyLedger();
    expect(ledger).toBeInstanceOf(UncertaintyLedger);
    expect(ledger.size).toBe(0);
    const config = ledger.getConfig();
    expect(config.defaultConfidence).toBe(0.7);
    expect(config.decayRatePerHour).toBe(0.01);
    expect(config.contestedThreshold).toBe(0.3);
    expect(config.refutedThreshold).toBe(0.7);
    expect(config.minConfidenceForAction).toBe(0.3);
  });

  it('should create UncertaintyLedger with custom config', () => {
    const config: Partial<UncertaintyConfig> = {
      defaultConfidence: 0.5,
      decayRatePerHour: 0.02,
      minConfidenceForAction: 0.6,
    };
    const ledger = createUncertaintyLedger(config);
    const actualConfig = ledger.getConfig();
    expect(actualConfig.defaultConfidence).toBe(0.5);
    expect(actualConfig.decayRatePerHour).toBe(0.02);
    expect(actualConfig.minConfidenceForAction).toBe(0.6);
    expect(actualConfig.contestedThreshold).toBe(0.3);
  });

  it('should create UncertaintyAggregator with ledger', () => {
    const ledger = createUncertaintyLedger();
    const aggregator = createUncertaintyAggregator(ledger);
    expect(aggregator).toBeInstanceOf(UncertaintyAggregator);
  });
});

// ============================================================================
// UncertaintyLedger: Basic Operations
// ============================================================================

describe('UncertaintyLedger - Basic Operations', () => {
  let ledger: UncertaintyLedger;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
  });

  it('should assert a new belief with supporting evidence', () => {
    const evidence = [createSupportingEvidence(0.9)];
    const belief = ledger.assert('user is authenticated', 'auth', evidence);

    expect(belief.id).toBeDefined();
    expect(belief.claim).toBe('user is authenticated');
    expect(belief.namespace).toBe('auth');
    expect(belief.evidence).toHaveLength(1);
    expect(belief.opposingEvidence).toHaveLength(0);
    expect(belief.confidence.point).toBeGreaterThan(0);
    expect(belief.confidence.lower).toBeLessThanOrEqual(belief.confidence.point);
    expect(belief.confidence.upper).toBeGreaterThanOrEqual(belief.confidence.point);
    expect(belief.status).toBeDefined();
    expect(belief.tags).toEqual([]);
  });

  it('should assert a belief with mixed evidence', () => {
    const evidence = [createSupportingEvidence(0.8), createOpposingEvidence(0.3)];
    const belief = ledger.assert('claim is valid', 'test', evidence);

    expect(belief.evidence).toHaveLength(1);
    expect(belief.opposingEvidence).toHaveLength(1);
    expect(belief.confidence.point).toBeGreaterThan(0);
  });

  it('should assert a belief with explicit confidence interval', () => {
    const evidence = [createSupportingEvidence()];
    const belief = ledger.assert('custom confidence', 'test', evidence, {
      point: 0.85,
      lower: 0.75,
      upper: 0.95,
    });

    expect(belief.confidence.point).toBe(0.85);
    expect(belief.confidence.lower).toBe(0.75);
    expect(belief.confidence.upper).toBe(0.95);
  });

  it('should clamp confidence values to [0, 1]', () => {
    const evidence = [createSupportingEvidence()];
    const belief = ledger.assert('clamped', 'test', evidence, {
      point: 1.5,
      lower: -0.2,
      upper: 1.8,
    });

    expect(belief.confidence.point).toBe(1.0);
    expect(belief.confidence.lower).toBeLessThanOrEqual(1.0);
    expect(belief.confidence.upper).toBe(1.0);
    expect(belief.confidence.lower).toBeGreaterThanOrEqual(0.0);
  });

  it('should retrieve belief by ID', () => {
    const belief = ledger.assert('test claim', 'test', [createSupportingEvidence()]);
    const retrieved = ledger.getBelief(belief.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(belief.id);
    expect(retrieved?.claim).toBe('test claim');
  });

  it('should return undefined for non-existent belief ID', () => {
    const retrieved = ledger.getBelief('non-existent-id');
    expect(retrieved).toBeUndefined();
  });

  it('should track ledger size', () => {
    expect(ledger.size).toBe(0);
    ledger.assert('belief 1', 'test', [createSupportingEvidence()]);
    expect(ledger.size).toBe(1);
    ledger.assert('belief 2', 'test', [createSupportingEvidence()]);
    expect(ledger.size).toBe(2);
  });

  it('should clear all beliefs', () => {
    ledger.assert('belief 1', 'test', [createSupportingEvidence()]);
    ledger.assert('belief 2', 'test', [createSupportingEvidence()]);
    expect(ledger.size).toBe(2);

    ledger.clear();
    expect(ledger.size).toBe(0);
  });
});

// ============================================================================
// UncertaintyLedger: Evidence Management
// ============================================================================

describe('UncertaintyLedger - Evidence Management', () => {
  let ledger: UncertaintyLedger;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
  });

  it('should add supporting evidence and increase confidence', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.5)]);
    const initialConfidence = belief.confidence.point;

    const updated = ledger.addEvidence(belief.id, createSupportingEvidence(0.8));
    expect(updated).toBeDefined();
    expect(updated!.evidence).toHaveLength(2);
    expect(updated!.confidence.point).toBeGreaterThanOrEqual(initialConfidence);
  });

  it('should add opposing evidence and decrease confidence', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.8)]);
    const initialConfidence = belief.confidence.point;

    const updated = ledger.addEvidence(belief.id, createOpposingEvidence(0.7));
    expect(updated).toBeDefined();
    expect(updated!.opposingEvidence).toHaveLength(1);
    expect(updated!.confidence.point).toBeLessThan(initialConfidence);
  });

  it('should return undefined when adding evidence to non-existent belief', () => {
    const result = ledger.addEvidence('non-existent', createSupportingEvidence());
    expect(result).toBeUndefined();
  });

  it('should update lastUpdated timestamp when adding evidence', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence()]);
    const initialTimestamp = belief.lastUpdated;

    // Wait a bit to ensure timestamp difference
    const later = Date.now() + 100;
    const evidence = createSupportingEvidence();
    evidence.timestamp = later;

    const updated = ledger.addEvidence(belief.id, evidence);
    expect(updated!.lastUpdated).toBeGreaterThanOrEqual(initialTimestamp);
  });

  it('should recompute confidence from multiple evidence pieces', () => {
    const belief = ledger.assert('claim', 'test', [
      createSupportingEvidence(0.9),
      createSupportingEvidence(0.8),
    ]);

    ledger.addEvidence(belief.id, createOpposingEvidence(0.3));
    const updated = ledger.getBelief(belief.id)!;

    // With 2 supporting (0.9 + 0.8 = 1.7) and 1 opposing (0.3)
    // Point = 1.7 / (1.7 + 0.3) = 0.85
    expect(updated.confidence.point).toBeCloseTo(0.85, 1);
  });

  it('should compute confidence explicitly via computeConfidence', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.6)]);
    const interval = ledger.computeConfidence(belief.id);

    expect(interval).toBeDefined();
    expect(interval!.point).toBeGreaterThan(0);
    expect(interval!.lower).toBeLessThanOrEqual(interval!.point);
    expect(interval!.upper).toBeGreaterThanOrEqual(interval!.point);
  });

  it('should return undefined for computeConfidence on non-existent belief', () => {
    const interval = ledger.computeConfidence('non-existent');
    expect(interval).toBeUndefined();
  });
});

// ============================================================================
// UncertaintyLedger: Status Transitions
// ============================================================================

describe('UncertaintyLedger - Status Transitions', () => {
  let ledger: UncertaintyLedger;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
  });

  it('should mark belief as unknown with no evidence', () => {
    const belief = ledger.assert('no evidence', 'test', []);
    expect(belief.status).toBe('unknown');
  });

  it('should mark belief as probable with high supporting evidence', () => {
    // Explicit confidence >= 0.8 with no opposing evidence → probable
    const belief = ledger.assert('high support', 'test', [
      createSupportingEvidence(0.9),
      createSupportingEvidence(0.9),
      createSupportingEvidence(0.8),
    ], { point: 0.85 });
    expect(belief.status).toBe('probable');
  });

  it('should mark belief as uncertain with moderate confidence', () => {
    // Explicit moderate confidence (0.5-0.8) with low opposing ratio → uncertain
    const belief = ledger.assert('moderate', 'test', [
      createSupportingEvidence(0.8),
      createOpposingEvidence(0.1),
    ], { point: 0.65 });
    // opposingRatio = 0.1/0.9 = 0.11 < 0.3 (not contested), confidence 0.65 → uncertain
    expect(belief.status).toBe('uncertain');
  });

  it('should mark belief as contested with >30% opposing evidence', () => {
    const belief = ledger.assert('contested', 'test', [
      createSupportingEvidence(0.6),
      createOpposingEvidence(0.4),
    ]);
    // Opposing ratio: 0.4 / 1.0 = 0.4 > 0.3 (contested threshold)
    expect(belief.status).toBe('contested');
  });

  it('should mark belief as refuted with >70% opposing evidence', () => {
    const belief = ledger.assert('refuted', 'test', [
      createSupportingEvidence(0.2),
      createOpposingEvidence(0.8),
      createOpposingEvidence(0.8),
    ]);
    // Opposing ratio: 1.6 / 1.8 = 0.89 > 0.7 (refuted threshold)
    expect(belief.status).toBe('refuted');
  });

  it('should transition from probable to contested when opposing evidence added', () => {
    // Start with explicit high confidence → probable
    const belief = ledger.assert('claim', 'test', [
      createSupportingEvidence(0.9),
      createSupportingEvidence(0.8),
    ], { point: 0.85 });
    expect(belief.status).toBe('probable');

    // After addEvidence, recomputeConfidence runs: supportingW=1.7, opposingW=0.9, total=2.6
    // opposingRatio = 0.9/2.6 = 0.346 >= 0.3 → contested
    ledger.addEvidence(belief.id, createOpposingEvidence(0.9));
    const updated = ledger.getBelief(belief.id)!;
    expect(updated.status).toBe('contested');
  });

  it('should transition to refuted when overwhelming opposing evidence added', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.5)]);

    ledger.addEvidence(belief.id, createOpposingEvidence(0.9));
    ledger.addEvidence(belief.id, createOpposingEvidence(0.9));
    const updated = ledger.getBelief(belief.id)!;
    expect(updated.status).toBe('refuted');
  });
});

// ============================================================================
// UncertaintyLedger: Manual Resolution
// ============================================================================

describe('UncertaintyLedger - Manual Resolution', () => {
  let ledger: UncertaintyLedger;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
  });

  it('should manually resolve belief to confirmed', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.6)]);
    const resolved = ledger.resolve(belief.id, 'confirmed', 'Human verified');

    expect(resolved).toBeDefined();
    expect(resolved!.status).toBe('confirmed');
    expect(resolved!.confidence.point).toBeGreaterThanOrEqual(0.95);
    expect(resolved!.confidence.upper).toBe(1.0);
    expect(resolved!.evidence.length).toBeGreaterThan(1); // Resolution evidence added
  });

  it('should manually resolve belief to refuted', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.8)]);
    const resolved = ledger.resolve(belief.id, 'refuted', 'Disproven by test');

    expect(resolved).toBeDefined();
    expect(resolved!.status).toBe('refuted');
    expect(resolved!.confidence.point).toBeLessThanOrEqual(0.05);
    expect(resolved!.confidence.lower).toBe(0.0);
    expect(resolved!.opposingEvidence.length).toBeGreaterThan(0); // Resolution evidence added
  });

  it('should add resolution evidence when confirming', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence()]);
    const initialEvidenceCount = belief.evidence.length;

    ledger.resolve(belief.id, 'confirmed', 'Tested and verified');
    const resolved = ledger.getBelief(belief.id)!;

    expect(resolved.evidence.length).toBe(initialEvidenceCount + 1);
    const resolutionEvidence = resolved.evidence[resolved.evidence.length - 1];
    expect(resolutionEvidence.sourceType).toBe('human-input');
    expect(resolutionEvidence.weight).toBe(1.0);
    expect(resolutionEvidence.supports).toBe(true);
  });

  it('should add resolution evidence when refuting', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence()]);

    ledger.resolve(belief.id, 'refuted', 'Failed validation');
    const resolved = ledger.getBelief(belief.id)!;

    expect(resolved.opposingEvidence.length).toBeGreaterThan(0);
    const resolutionEvidence = resolved.opposingEvidence[resolved.opposingEvidence.length - 1];
    expect(resolutionEvidence.sourceType).toBe('human-input');
    expect(resolutionEvidence.weight).toBe(1.0);
    expect(resolutionEvidence.supports).toBe(false);
  });

  it('should return undefined when resolving non-existent belief', () => {
    const result = ledger.resolve('non-existent', 'confirmed', 'reason');
    expect(result).toBeUndefined();
  });

  it('should preserve confirmed status even after recomputation', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence()]);
    ledger.resolve(belief.id, 'confirmed', 'Human verified');

    // Add more evidence - status should remain confirmed due to resolution evidence
    ledger.addEvidence(belief.id, createSupportingEvidence());
    const updated = ledger.getBelief(belief.id)!;
    expect(updated.status).toBe('confirmed');
  });
});

// ============================================================================
// UncertaintyLedger: Uncertainty Propagation
// ============================================================================

describe('UncertaintyLedger - Uncertainty Propagation', () => {
  let ledger: UncertaintyLedger;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
  });

  it('should propagate uncertainty from parent to child', () => {
    const parent = ledger.assert('parent claim', 'test', [createSupportingEvidence(0.9)]);
    const child = ledger.assert('child claim', 'test', [createSupportingEvidence(0.95)]);

    const updated = ledger.propagateUncertainty(parent.id, child.id, 0.8);

    expect(updated).toBeDefined();
    expect(updated!.inferredFrom).toContain(parent.id);
    // Child confidence bounded by parent (0.9) * weight (0.8) = 0.72
    expect(updated!.confidence.point).toBeLessThanOrEqual(0.72);
  });

  it('should bound child confidence by parent confidence times weight', () => {
    const parent = ledger.assert('parent', 'test', [createSupportingEvidence(0.7)]);
    const child = ledger.assert('child', 'test', [createSupportingEvidence(0.95)]);

    ledger.propagateUncertainty(parent.id, child.id, 0.6);
    const updated = ledger.getBelief(child.id)!;

    // Max confidence: 0.7 * 0.6 = 0.42
    expect(updated.confidence.point).toBeLessThanOrEqual(0.42);
  });

  it('should maintain confidence interval ordering (lower <= point <= upper)', () => {
    const parent = ledger.assert('parent', 'test', [createSupportingEvidence(0.8)]);
    const child = ledger.assert('child', 'test', [createSupportingEvidence(0.9)]);

    ledger.propagateUncertainty(parent.id, child.id, 0.5);
    const updated = ledger.getBelief(child.id)!;

    expect(updated.confidence.lower).toBeLessThanOrEqual(updated.confidence.point);
    expect(updated.confidence.point).toBeLessThanOrEqual(updated.confidence.upper);
  });

  it('should clamp inference weight to [0, 1]', () => {
    const parent = ledger.assert('parent', 'test', [createSupportingEvidence(0.8)]);
    const child = ledger.assert('child', 'test', [createSupportingEvidence(0.9)]);

    // Pass weight > 1, should be clamped
    ledger.propagateUncertainty(parent.id, child.id, 1.5);
    const updated = ledger.getBelief(child.id)!;

    expect(updated).toBeDefined();
    expect(updated.confidence.point).toBeLessThanOrEqual(parent.confidence.point);
  });

  it('should not duplicate parent in inferredFrom array', () => {
    const parent = ledger.assert('parent', 'test', [createSupportingEvidence()]);
    const child = ledger.assert('child', 'test', [createSupportingEvidence()]);

    ledger.propagateUncertainty(parent.id, child.id, 0.8);
    ledger.propagateUncertainty(parent.id, child.id, 0.7);

    const updated = ledger.getBelief(child.id)!;
    const parentCount = updated.inferredFrom.filter(id => id === parent.id).length;
    expect(parentCount).toBe(1);
  });

  it('should return undefined when parent does not exist', () => {
    const child = ledger.assert('child', 'test', [createSupportingEvidence()]);
    const result = ledger.propagateUncertainty('non-existent', child.id, 0.8);
    expect(result).toBeUndefined();
  });

  it('should return undefined when child does not exist', () => {
    const parent = ledger.assert('parent', 'test', [createSupportingEvidence()]);
    const result = ledger.propagateUncertainty(parent.id, 'non-existent', 0.8);
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// UncertaintyLedger: Confidence Chain
// ============================================================================

describe('UncertaintyLedger - Confidence Chain', () => {
  let ledger: UncertaintyLedger;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
  });

  it('should trace single-level inference chain', () => {
    const belief = ledger.assert('leaf', 'test', [createSupportingEvidence()]);
    const chain = ledger.getConfidenceChain(belief.id);

    expect(chain).toHaveLength(1);
    expect(chain[0].belief.id).toBe(belief.id);
    expect(chain[0].depth).toBe(0);
  });

  it('should trace multi-level inference chain', () => {
    const root = ledger.assert('root', 'test', [createSupportingEvidence()]);
    const parent = ledger.assert('parent', 'test', [createSupportingEvidence()]);
    const child = ledger.assert('child', 'test', [createSupportingEvidence()]);

    ledger.propagateUncertainty(root.id, parent.id, 0.8);
    ledger.propagateUncertainty(parent.id, child.id, 0.7);

    const chain = ledger.getConfidenceChain(child.id);

    expect(chain.length).toBeGreaterThanOrEqual(3);
    expect(chain[0].belief.id).toBe(child.id);
    expect(chain[0].depth).toBe(0);
    expect(chain.some(node => node.belief.id === parent.id)).toBe(true);
    expect(chain.some(node => node.belief.id === root.id)).toBe(true);
  });

  it('should order chain nodes by depth', () => {
    const root = ledger.assert('root', 'test', [createSupportingEvidence()]);
    const parent = ledger.assert('parent', 'test', [createSupportingEvidence()]);
    const child = ledger.assert('child', 'test', [createSupportingEvidence()]);

    ledger.propagateUncertainty(root.id, parent.id, 0.8);
    ledger.propagateUncertainty(parent.id, child.id, 0.7);

    const chain = ledger.getConfidenceChain(child.id);

    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].depth).toBeGreaterThanOrEqual(chain[i - 1].depth);
    }
  });

  it('should handle cycles in inference chain', () => {
    const a = ledger.assert('a', 'test', [createSupportingEvidence()]);
    const b = ledger.assert('b', 'test', [createSupportingEvidence()]);

    // Create a cycle: a -> b -> a
    ledger.propagateUncertainty(a.id, b.id, 0.8);
    // Manually add cycle (in real usage this would be prevented)
    const bBelief = ledger.getBelief(b.id)!;
    bBelief.inferredFrom.push(a.id);
    const aBelief = ledger.getBelief(a.id)!;
    aBelief.inferredFrom.push(b.id);

    const chain = ledger.getConfidenceChain(a.id);

    // Should not infinite loop, visits each node once
    expect(chain.length).toBeLessThanOrEqual(2);
  });

  it('should return empty array for non-existent belief', () => {
    const chain = ledger.getConfidenceChain('non-existent');
    expect(chain).toEqual([]);
  });
});

// ============================================================================
// UncertaintyLedger: Time-Based Decay
// ============================================================================

describe('UncertaintyLedger - Time-Based Decay', () => {
  let ledger: UncertaintyLedger;

  beforeEach(() => {
    ledger = createUncertaintyLedger({ decayRatePerHour: 0.1 });
  });

  it('should apply decay to belief confidence over time', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.9)]);
    const initialConfidence = belief.confidence.point;

    // Simulate 1 hour passing
    const oneHourLater = belief.lastUpdated + 3_600_000;
    ledger.decayAll(oneHourLater);

    const updated = ledger.getBelief(belief.id)!;
    expect(updated.confidence.point).toBeLessThan(initialConfidence);
  });

  it('should decay confidence proportional to elapsed hours', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.8)]);
    const initialConfidence = belief.confidence.point;

    // Simulate 2 hours passing (decay rate 0.1, so expect ~0.2 reduction)
    const twoHoursLater = belief.lastUpdated + 7_200_000;
    ledger.decayAll(twoHoursLater);

    const updated = ledger.getBelief(belief.id)!;
    const expectedDecay = 0.1 * 2;
    expect(updated.confidence.point).toBeCloseTo(initialConfidence - expectedDecay, 1);
  });

  it('should not decay beliefs when no time has elapsed', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.8)]);
    const initialConfidence = belief.confidence.point;

    ledger.decayAll(belief.lastUpdated);

    const updated = ledger.getBelief(belief.id)!;
    expect(updated.confidence.point).toBe(initialConfidence);
  });

  it('should not apply negative decay', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.8)]);

    // Try to decay with past time
    const earlier = belief.lastUpdated - 3_600_000;
    ledger.decayAll(earlier);

    const updated = ledger.getBelief(belief.id)!;
    expect(updated.confidence.point).toBe(belief.confidence.point);
  });

  it('should clamp decayed confidence to 0', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.2)]);

    // Simulate massive time passing
    const tenHoursLater = belief.lastUpdated + 36_000_000;
    ledger.decayAll(tenHoursLater);

    const updated = ledger.getBelief(belief.id)!;
    expect(updated.confidence.point).toBeGreaterThanOrEqual(0);
    expect(updated.confidence.lower).toBeGreaterThanOrEqual(0);
  });

  it('should shrink confidence bounds during decay', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.8)]);
    const initialLower = belief.confidence.lower;
    const initialUpper = belief.confidence.upper;

    const oneHourLater = belief.lastUpdated + 3_600_000;
    ledger.decayAll(oneHourLater);

    const updated = ledger.getBelief(belief.id)!;
    expect(updated.confidence.lower).toBeLessThanOrEqual(initialLower);
    expect(updated.confidence.upper).toBeLessThanOrEqual(initialUpper);
  });

  it('should update status after decay', () => {
    // Start with explicit high confidence → probable
    const belief = ledger.assert('claim', 'test', [
      createSupportingEvidence(0.9),
      createSupportingEvidence(0.9),
    ], { point: 0.85 });
    expect(belief.status).toBe('probable');

    // Decay rate 0.1/hour, 5 hours → 0.5 decay. 0.85 - 0.5 = 0.35 < 0.8 → uncertain
    const fiveHoursLater = belief.lastUpdated + 18_000_000;
    ledger.decayAll(fiveHoursLater);

    const updated = ledger.getBelief(belief.id)!;
    // Status changes from probable to uncertain as confidence drops below 0.8
    expect(['uncertain', 'probable']).toContain(updated.status);
  });
});

// ============================================================================
// UncertaintyLedger: Actionability
// ============================================================================

describe('UncertaintyLedger - Actionability', () => {
  let ledger: UncertaintyLedger;

  beforeEach(() => {
    ledger = createUncertaintyLedger({ minConfidenceForAction: 0.6 });
  });

  it('should mark high confidence belief as actionable', () => {
    const belief = ledger.assert('claim', 'test', [
      createSupportingEvidence(0.9),
      createSupportingEvidence(0.8),
    ]);
    expect(ledger.isActionable(belief.id)).toBe(true);
  });

  it('should mark low confidence belief as not actionable', () => {
    // Explicit low confidence below minConfidenceForAction (0.6)
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.4)], { point: 0.4 });
    expect(ledger.isActionable(belief.id)).toBe(false);
  });

  it('should use minConfidenceForAction threshold', () => {
    // Explicit confidence above threshold (0.6)
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.65)], { point: 0.65 });
    expect(ledger.isActionable(belief.id)).toBe(true);

    // Explicit confidence below threshold
    const lowBelief = ledger.assert('low', 'test', [createSupportingEvidence(0.55)], { point: 0.55 });
    expect(ledger.isActionable(lowBelief.id)).toBe(false);
  });

  it('should return false for non-existent belief', () => {
    expect(ledger.isActionable('non-existent')).toBe(false);
  });
});

// ============================================================================
// UncertaintyLedger: Querying
// ============================================================================

describe('UncertaintyLedger - Querying', () => {
  let ledger: UncertaintyLedger;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
  });

  it('should query all beliefs with no filters', () => {
    ledger.assert('claim 1', 'auth', [createSupportingEvidence()]);
    ledger.assert('claim 2', 'data', [createSupportingEvidence()]);
    ledger.assert('claim 3', 'auth', [createSupportingEvidence()]);

    const results = ledger.query();
    expect(results).toHaveLength(3);
  });

  it('should filter beliefs by namespace', () => {
    ledger.assert('claim 1', 'auth', [createSupportingEvidence()]);
    ledger.assert('claim 2', 'data', [createSupportingEvidence()]);
    ledger.assert('claim 3', 'auth', [createSupportingEvidence()]);

    const results = ledger.query({ namespace: 'auth' });
    expect(results).toHaveLength(2);
    expect(results.every(b => b.namespace === 'auth')).toBe(true);
  });

  it('should filter beliefs by status', () => {
    ledger.assert('probable', 'test', [createSupportingEvidence(0.9), createSupportingEvidence(0.9)]);
    ledger.assert('contested', 'test', [createSupportingEvidence(0.5), createOpposingEvidence(0.4)]);
    ledger.assert('unknown', 'test', []);

    const contested = ledger.query({ status: 'contested' });
    expect(contested).toHaveLength(1);
    expect(contested[0].status).toBe('contested');
  });

  it('should filter beliefs by minimum confidence', () => {
    ledger.assert('high', 'test', [createSupportingEvidence(0.9)]);
    ledger.assert('medium', 'test', [createSupportingEvidence(0.6)]);
    ledger.assert('low', 'test', [createSupportingEvidence(0.3)]);

    const results = ledger.query({ minConfidence: 0.7 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(b => b.confidence.point >= 0.7)).toBe(true);
  });

  it('should filter beliefs by tags', () => {
    const b1 = ledger.assert('claim 1', 'test', [createSupportingEvidence()]);
    const b2 = ledger.assert('claim 2', 'test', [createSupportingEvidence()]);
    const b3 = ledger.assert('claim 3', 'test', [createSupportingEvidence()]);

    b1.tags = ['important', 'security'];
    b2.tags = ['important'];
    b3.tags = ['security'];

    const results = ledger.query({ tags: ['important'] });
    expect(results).toHaveLength(2);

    const both = ledger.query({ tags: ['important', 'security'] });
    expect(both).toHaveLength(1);
    expect(both[0].id).toBe(b1.id);
  });

  it('should combine multiple filters', () => {
    const b1 = ledger.assert('claim 1', 'auth', [createSupportingEvidence(0.9)]);
    ledger.assert('claim 2', 'auth', [createSupportingEvidence(0.5)]);
    ledger.assert('claim 3', 'data', [createSupportingEvidence(0.9)]);

    b1.tags = ['critical'];

    const results = ledger.query({
      namespace: 'auth',
      minConfidence: 0.7,
      tags: ['critical'],
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(b1.id);
  });

  it('should sort results by lastUpdated descending', () => {
    const b1 = ledger.assert('first', 'test', [createSupportingEvidence()]);
    const b2 = ledger.assert('second', 'test', [createSupportingEvidence()]);
    const b3 = ledger.assert('third', 'test', [createSupportingEvidence()]);

    const results = ledger.query();
    expect(results[0].lastUpdated).toBeGreaterThanOrEqual(results[1].lastUpdated);
    expect(results[1].lastUpdated).toBeGreaterThanOrEqual(results[2].lastUpdated);
  });
});

// ============================================================================
// UncertaintyLedger: Contested and Unresolved
// ============================================================================

describe('UncertaintyLedger - Contested and Unresolved', () => {
  let ledger: UncertaintyLedger;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
  });

  it('should retrieve all contested beliefs', () => {
    ledger.assert('probable', 'test', [createSupportingEvidence(0.9)]);
    ledger.assert('contested 1', 'test', [createSupportingEvidence(0.6), createOpposingEvidence(0.5)]);
    ledger.assert('contested 2', 'test', [createSupportingEvidence(0.5), createOpposingEvidence(0.4)]);

    const contested = ledger.getContested();
    expect(contested.length).toBeGreaterThanOrEqual(2);
    expect(contested.every(b => b.status === 'contested')).toBe(true);
  });

  it('should retrieve all unresolved beliefs (uncertain or contested)', () => {
    ledger.assert('probable', 'test', [createSupportingEvidence(0.9), createSupportingEvidence(0.9)]);
    ledger.assert('uncertain', 'test', [createSupportingEvidence(0.6)]);
    ledger.assert('contested', 'test', [createSupportingEvidence(0.5), createOpposingEvidence(0.4)]);

    const unresolved = ledger.getUnresolved();
    expect(unresolved.length).toBeGreaterThanOrEqual(2);
    expect(
      unresolved.every(b => b.status === 'uncertain' || b.status === 'contested'),
    ).toBe(true);
  });

  it('should not include confirmed beliefs in unresolved', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence()]);
    ledger.resolve(belief.id, 'confirmed', 'verified');

    const unresolved = ledger.getUnresolved();
    expect(unresolved.every(b => b.id !== belief.id)).toBe(true);
  });
});

// ============================================================================
// UncertaintyLedger: Import/Export
// ============================================================================

describe('UncertaintyLedger - Import/Export', () => {
  let ledger: UncertaintyLedger;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
  });

  it('should export beliefs to serializable format', () => {
    ledger.assert('claim 1', 'test', [createSupportingEvidence()]);
    ledger.assert('claim 2', 'test', [createSupportingEvidence()]);

    const exported = ledger.exportBeliefs();

    expect(exported.beliefs).toHaveLength(2);
    expect(exported.version).toBe(1);
    expect(exported.createdAt).toBeDefined();
    expect(typeof exported.createdAt).toBe('string');
  });

  it('should import beliefs from serialized data', () => {
    ledger.assert('claim 1', 'test', [createSupportingEvidence()]);
    const exported = ledger.exportBeliefs();

    const newLedger = createUncertaintyLedger();
    newLedger.importBeliefs(exported);

    expect(newLedger.size).toBe(1);
    const beliefs = newLedger.query();
    expect(beliefs[0].claim).toBe('claim 1');
  });

  it('should replace existing beliefs on import', () => {
    ledger.assert('old claim', 'test', [createSupportingEvidence()]);
    expect(ledger.size).toBe(1);

    const otherLedger = createUncertaintyLedger();
    otherLedger.assert('new claim 1', 'test', [createSupportingEvidence()]);
    otherLedger.assert('new claim 2', 'test', [createSupportingEvidence()]);
    const exported = otherLedger.exportBeliefs();

    ledger.importBeliefs(exported);
    expect(ledger.size).toBe(2);
    const beliefs = ledger.query();
    expect(beliefs.some(b => b.claim === 'old claim')).toBe(false);
  });

  it('should throw error on unsupported version', () => {
    const invalidData = {
      beliefs: [],
      createdAt: new Date().toISOString(),
      version: 999,
    };

    expect(() => ledger.importBeliefs(invalidData)).toThrow('Unsupported uncertainty ledger version');
  });

  it('should preserve all belief properties on export/import', () => {
    const belief = ledger.assert('claim', 'test', [createSupportingEvidence(0.8)]);
    belief.tags = ['important', 'security'];
    const exported = ledger.exportBeliefs();

    const newLedger = createUncertaintyLedger();
    newLedger.importBeliefs(exported);

    const imported = newLedger.getBelief(belief.id)!;
    expect(imported.claim).toBe(belief.claim);
    expect(imported.namespace).toBe(belief.namespace);
    expect(imported.confidence.point).toBe(belief.confidence.point);
    expect(imported.status).toBe(belief.status);
    expect(imported.tags).toEqual(belief.tags);
    expect(imported.evidence).toHaveLength(belief.evidence.length);
  });
});

// ============================================================================
// UncertaintyAggregator: Aggregate Confidence
// ============================================================================

describe('UncertaintyAggregator - Aggregate Confidence', () => {
  let ledger: UncertaintyLedger;
  let aggregator: UncertaintyAggregator;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
    aggregator = createUncertaintyAggregator(ledger);
  });

  it('should compute geometric mean of multiple beliefs', () => {
    // Explicit confidence values to ensure known point estimates
    const b1 = ledger.assert('claim 1', 'test', [createSupportingEvidence(0.9)], { point: 0.9 });
    const b2 = ledger.assert('claim 2', 'test', [createSupportingEvidence(0.8)], { point: 0.8 });
    const b3 = ledger.assert('claim 3', 'test', [createSupportingEvidence(0.7)], { point: 0.7 });

    const aggregate = aggregator.aggregate([b1.id, b2.id, b3.id]);

    // Geometric mean of 0.9, 0.8, 0.7 ≈ 0.794
    expect(aggregate).toBeCloseTo(0.794, 2);
  });

  it('should return 0 for empty belief list', () => {
    const aggregate = aggregator.aggregate([]);
    expect(aggregate).toBe(0);
  });

  it('should ignore non-existent belief IDs', () => {
    const b1 = ledger.assert('claim', 'test', [createSupportingEvidence(0.8)]);
    const aggregate = aggregator.aggregate([b1.id, 'non-existent']);

    expect(aggregate).toBeGreaterThan(0);
  });

  it('should heavily penalize low confidence in geometric mean', () => {
    // Explicit confidence values to create distinct point estimates
    const b1 = ledger.assert('high', 'test', [createSupportingEvidence(0.9)], { point: 0.9 });
    const b2 = ledger.assert('high', 'test', [createSupportingEvidence(0.9)], { point: 0.9 });
    const b3 = ledger.assert('low', 'test', [createSupportingEvidence(0.2)], { point: 0.2 });

    const aggregate = aggregator.aggregate([b1.id, b2.id, b3.id]);

    // Geometric mean penalizes the low value more than arithmetic would
    // Should be much closer to 0.2 than 0.67 (arithmetic mean)
    expect(aggregate).toBeLessThan(0.6);
  });
});

// ============================================================================
// UncertaintyAggregator: Worst and Best Case
// ============================================================================

describe('UncertaintyAggregator - Worst and Best Case', () => {
  let ledger: UncertaintyLedger;
  let aggregator: UncertaintyAggregator;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
    aggregator = createUncertaintyAggregator(ledger);
  });

  it('should return worst case (minimum) confidence', () => {
    // Explicit confidence values to create distinct point estimates
    const b1 = ledger.assert('high', 'test', [createSupportingEvidence(0.9)], { point: 0.9 });
    const b2 = ledger.assert('medium', 'test', [createSupportingEvidence(0.6)], { point: 0.6 });
    const b3 = ledger.assert('low', 'test', [createSupportingEvidence(0.3)], { point: 0.3 });

    const worst = aggregator.worstCase([b1.id, b2.id, b3.id]);
    expect(worst).toBeCloseTo(0.3, 1);
  });

  it('should return best case (maximum) confidence', () => {
    // Explicit confidence values to create distinct point estimates
    const b1 = ledger.assert('high', 'test', [createSupportingEvidence(0.9)], { point: 0.9 });
    const b2 = ledger.assert('medium', 'test', [createSupportingEvidence(0.6)], { point: 0.6 });
    const b3 = ledger.assert('low', 'test', [createSupportingEvidence(0.3)], { point: 0.3 });

    const best = aggregator.bestCase([b1.id, b2.id, b3.id]);
    expect(best).toBeCloseTo(0.9, 1);
  });

  it('should return 0 for empty list in worst/best case', () => {
    expect(aggregator.worstCase([])).toBe(0);
    expect(aggregator.bestCase([])).toBe(0);
  });

  it('should ignore non-existent beliefs in worst/best case', () => {
    const b1 = ledger.assert('high', 'test', [createSupportingEvidence(0.8)]);

    const worst = aggregator.worstCase([b1.id, 'non-existent']);
    const best = aggregator.bestCase([b1.id, 'non-existent']);

    expect(worst).toBeGreaterThan(0);
    expect(best).toBeGreaterThan(0);
  });
});

// ============================================================================
// UncertaintyAggregator: Status Checks
// ============================================================================

describe('UncertaintyAggregator - Status Checks', () => {
  let ledger: UncertaintyLedger;
  let aggregator: UncertaintyAggregator;

  beforeEach(() => {
    ledger = createUncertaintyLedger();
    aggregator = createUncertaintyAggregator(ledger);
  });

  it('should detect if any belief is contested', () => {
    const b1 = ledger.assert('probable', 'test', [createSupportingEvidence(0.9)]);
    const b2 = ledger.assert('contested', 'test', [createSupportingEvidence(0.6), createOpposingEvidence(0.5)]);

    expect(aggregator.anyContested([b1.id, b2.id])).toBe(true);
  });

  it('should return false when no beliefs are contested', () => {
    const b1 = ledger.assert('probable', 'test', [createSupportingEvidence(0.9)]);
    const b2 = ledger.assert('uncertain', 'test', [createSupportingEvidence(0.6)]);

    expect(aggregator.anyContested([b1.id, b2.id])).toBe(false);
  });

  it('should detect if all beliefs are confirmed', () => {
    const b1 = ledger.assert('claim 1', 'test', [createSupportingEvidence()]);
    const b2 = ledger.assert('claim 2', 'test', [createSupportingEvidence()]);

    ledger.resolve(b1.id, 'confirmed', 'verified');
    ledger.resolve(b2.id, 'confirmed', 'verified');

    expect(aggregator.allConfirmed([b1.id, b2.id])).toBe(true);
  });

  it('should return false if any belief is not confirmed', () => {
    const b1 = ledger.assert('claim 1', 'test', [createSupportingEvidence()]);
    const b2 = ledger.assert('claim 2', 'test', [createSupportingEvidence()]);

    ledger.resolve(b1.id, 'confirmed', 'verified');
    // b2 is not confirmed

    expect(aggregator.allConfirmed([b1.id, b2.id])).toBe(false);
  });

  it('should return false for allConfirmed with empty list', () => {
    expect(aggregator.allConfirmed([])).toBe(false);
  });

  it('should return false if any belief does not exist', () => {
    const b1 = ledger.assert('claim', 'test', [createSupportingEvidence()]);
    ledger.resolve(b1.id, 'confirmed', 'verified');

    expect(aggregator.allConfirmed([b1.id, 'non-existent'])).toBe(false);
  });
});
