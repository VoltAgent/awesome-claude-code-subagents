/**
 * Tests for the Evolution Pipeline
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  EvolutionPipeline,
  createEvolutionPipeline,
} from '../src/evolution.js';
import type {
  ChangeProposal,
  SimulationResult,
  StagedRollout,
  TraceEvaluator,
  RolloutStage,
} from '../src/evolution.js';

// ============================================================================
// Helpers
// ============================================================================

function makeProposalParams(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'rule-modify' as const,
    title: 'Improve rule R001',
    description: 'Clarify wording for R001 to reduce violations',
    author: 'optimizer-agent',
    targetPath: 'rules.R001.text',
    diff: { before: 'old text', after: 'new text' },
    rationale: 'R001 is violated 12 times per cycle',
    riskAssessment: { level: 'low' as const, factors: ['wording-only change'] },
    ...overrides,
  };
}

/**
 * Evaluator that returns identical results for both configs (zero divergence).
 */
const identicalEvaluator: TraceEvaluator = (trace, config) => ({
  traceHash: 'aaa',
  metrics: { accuracy: 0.95, latency: 100 },
  decisions: [{ action: 'allow' }, { action: 'allow' }],
});

/**
 * Evaluator that returns completely different results per config (high divergence).
 */
const divergentEvaluator: TraceEvaluator = (trace, config) => {
  if (config === 'baseline') {
    return {
      traceHash: 'baseline-hash',
      metrics: { accuracy: 0.95, latency: 100 },
      decisions: [
        { action: 'allow' },
        { action: 'allow' },
        { action: 'warn' },
      ],
    };
  }
  return {
    traceHash: 'candidate-hash',
    metrics: { accuracy: 0.60, latency: 200 },
    decisions: [
      { action: 'block' },
      { action: 'block' },
      { action: 'block' },
      { action: 'block' },
      { action: 'block' },
    ],
  };
};

/**
 * Evaluator with slightly different decisions but within threshold.
 */
const slightlyDivergentEvaluator: TraceEvaluator = (trace, config) => {
  if (config === 'baseline') {
    return {
      traceHash: 'baseline-hash',
      metrics: { accuracy: 0.90, latency: 100 },
      decisions: [{ action: 'allow' }, { action: 'warn' }],
    };
  }
  return {
    traceHash: 'candidate-hash',
    metrics: { accuracy: 0.92, latency: 95 },
    decisions: [{ action: 'allow' }, { action: 'allow' }],
  };
};

// ============================================================================
// Tests
// ============================================================================

describe('EvolutionPipeline', () => {
  let pipeline: EvolutionPipeline;

  beforeEach(() => {
    pipeline = createEvolutionPipeline({
      signingKey: 'test-evolution-key',
      maxDivergence: 0.3,
    });
  });

  // --------------------------------------------------------------------------
  // propose
  // --------------------------------------------------------------------------

  describe('propose', () => {
    it('should create a signed proposal with a UUID', () => {
      const proposal = pipeline.propose(makeProposalParams());

      expect(proposal.proposalId).toBeTruthy();
      expect(proposal.proposalId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('should produce a valid HMAC-SHA256 signature', () => {
      const proposal = pipeline.propose(makeProposalParams());

      expect(proposal.signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should set status to signed after creation', () => {
      const proposal = pipeline.propose(makeProposalParams());

      expect(proposal.status).toBe('signed');
    });

    it('should preserve all proposal fields', () => {
      const params = makeProposalParams({
        kind: 'rule-add',
        title: 'Add rule R099',
        author: 'human-1',
        targetPath: 'rules.R099',
      });
      const proposal = pipeline.propose(params);

      expect(proposal.kind).toBe('rule-add');
      expect(proposal.title).toBe('Add rule R099');
      expect(proposal.author).toBe('human-1');
      expect(proposal.targetPath).toBe('rules.R099');
      expect(proposal.diff).toEqual({ before: 'old text', after: 'new text' });
      expect(proposal.riskAssessment.level).toBe('low');
      expect(proposal.createdAt).toBeGreaterThan(0);
    });

    it('should produce different signatures for different proposals', () => {
      const p1 = pipeline.propose(makeProposalParams({ title: 'Change A' }));
      const p2 = pipeline.propose(makeProposalParams({ title: 'Change B' }));

      expect(p1.signature).not.toBe(p2.signature);
    });

    it('should store the proposal for later retrieval', () => {
      const proposal = pipeline.propose(makeProposalParams());

      expect(pipeline.getProposal(proposal.proposalId)).toBe(proposal);
    });
  });

  // --------------------------------------------------------------------------
  // simulate
  // --------------------------------------------------------------------------

  describe('simulate', () => {
    it('should compute zero divergence for identical evaluators', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const goldenTraces = [{ input: 'test-1' }, { input: 'test-2' }];

      const result = pipeline.simulate(proposal.proposalId, goldenTraces, identicalEvaluator);

      expect(result.divergenceScore).toBe(0);
      expect(result.passed).toBe(true);
      expect(result.decisionDiffs).toHaveLength(0);
    });

    it('should compute non-zero divergence when decisions differ', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const goldenTraces = [{ input: 'test-1' }];

      const result = pipeline.simulate(
        proposal.proposalId,
        goldenTraces,
        slightlyDivergentEvaluator,
      );

      expect(result.divergenceScore).toBeGreaterThan(0);
      expect(result.decisionDiffs.length).toBeGreaterThan(0);
    });

    it('should include baseline and candidate trace hashes', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const result = pipeline.simulate(
        proposal.proposalId,
        [{ input: 'trace' }],
        divergentEvaluator,
      );

      expect(result.baselineTraceHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.candidateTraceHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.baselineTraceHash).not.toBe(result.candidateTraceHash);
    });

    it('should aggregate metrics from all traces', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const result = pipeline.simulate(
        proposal.proposalId,
        [{ input: '1' }, { input: '2' }],
        identicalEvaluator,
      );

      expect(result.metricsComparison.baseline.accuracy).toBe(0.95);
      expect(result.metricsComparison.candidate.accuracy).toBe(0.95);
    });

    it('should set proposal status to simulating during evaluation', () => {
      const proposal = pipeline.propose(makeProposalParams());

      pipeline.simulate(proposal.proposalId, [{ input: '1' }], identicalEvaluator);

      // After simulation completes, status may still be 'simulating' until compare
      // is called, but the simulate method itself sets it.
      const fetched = pipeline.getProposal(proposal.proposalId);
      expect(fetched?.status).toBe('simulating');
    });

    it('should throw for unknown proposal', () => {
      expect(() =>
        pipeline.simulate('nonexistent-id', [], identicalEvaluator),
      ).toThrow('Proposal not found');
    });
  });

  // --------------------------------------------------------------------------
  // compare
  // --------------------------------------------------------------------------

  describe('compare', () => {
    it('should approve low-divergence changes', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const simResult = pipeline.simulate(
        proposal.proposalId,
        [{ input: '1' }],
        identicalEvaluator,
      );

      const comparison = pipeline.compare(proposal.proposalId, simResult);

      expect(comparison.approved).toBe(true);
      expect(comparison.reason).toContain('within threshold');
    });

    it('should reject high-divergence changes', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const simResult = pipeline.simulate(
        proposal.proposalId,
        [{ input: '1' }, { input: '2' }, { input: '3' }],
        divergentEvaluator,
      );

      // Force a high divergence score for the test
      const highDivResult: SimulationResult = {
        ...simResult,
        divergenceScore: 0.8,
      };

      const comparison = pipeline.compare(proposal.proposalId, highDivResult);

      expect(comparison.approved).toBe(false);
      expect(comparison.reason).toContain('exceeds threshold');
    });

    it('should reject changes with significant metric regressions', () => {
      const proposal = pipeline.propose(makeProposalParams());

      const simResult: SimulationResult = {
        proposalId: proposal.proposalId,
        baselineTraceHash: 'a'.repeat(64),
        candidateTraceHash: 'b'.repeat(64),
        divergenceScore: 0.1, // low divergence, should pass that check
        decisionDiffs: [],
        metricsComparison: {
          baseline: { accuracy: 1.0, latency: 100 },
          candidate: { accuracy: 0.5, latency: 100 }, // 50% regression in accuracy
        },
        passed: true,
        reason: 'test',
      };

      const comparison = pipeline.compare(proposal.proposalId, simResult);

      expect(comparison.approved).toBe(false);
      expect(comparison.reason).toContain('regressed');
    });

    it('should set proposal status to compared on approval', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const simResult = pipeline.simulate(
        proposal.proposalId,
        [{ input: '1' }],
        identicalEvaluator,
      );

      pipeline.compare(proposal.proposalId, simResult);

      expect(pipeline.getProposal(proposal.proposalId)?.status).toBe('compared');
    });

    it('should set proposal status to rejected on rejection', () => {
      const proposal = pipeline.propose(makeProposalParams());

      const simResult: SimulationResult = {
        proposalId: proposal.proposalId,
        baselineTraceHash: 'a'.repeat(64),
        candidateTraceHash: 'b'.repeat(64),
        divergenceScore: 0.9,
        decisionDiffs: [],
        metricsComparison: { baseline: {}, candidate: {} },
        passed: false,
        reason: 'too divergent',
      };

      pipeline.compare(proposal.proposalId, simResult);

      expect(pipeline.getProposal(proposal.proposalId)?.status).toBe('rejected');
    });
  });

  // --------------------------------------------------------------------------
  // stage
  // --------------------------------------------------------------------------

  describe('stage', () => {
    it('should create a staged rollout plan with default stages', () => {
      const proposal = pipeline.propose(makeProposalParams());

      const rollout = pipeline.stage(proposal.proposalId);

      expect(rollout.rolloutId).toBeTruthy();
      expect(rollout.proposalId).toBe(proposal.proposalId);
      expect(rollout.stages).toHaveLength(3);
      expect(rollout.stages[0].name).toBe('canary');
      expect(rollout.stages[1].name).toBe('partial');
      expect(rollout.stages[2].name).toBe('full');
      expect(rollout.currentStage).toBe(0);
      expect(rollout.status).toBe('in-progress');
      expect(rollout.startedAt).toBeGreaterThan(0);
      expect(rollout.completedAt).toBeNull();
    });

    it('should start the first stage immediately', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const rollout = pipeline.stage(proposal.proposalId);

      expect(rollout.stages[0].startedAt).toBeGreaterThan(0);
      expect(rollout.stages[1].startedAt).toBeNull();
    });

    it('should set proposal status to staged', () => {
      const proposal = pipeline.propose(makeProposalParams());
      pipeline.stage(proposal.proposalId);

      expect(pipeline.getProposal(proposal.proposalId)?.status).toBe('staged');
    });

    it('should use custom stages when provided', () => {
      const customStages: RolloutStage[] = [
        {
          name: 'alpha',
          percentage: 1,
          durationMs: 10_000,
          metrics: {},
          divergenceThreshold: 0.1,
          passed: null,
          startedAt: null,
          completedAt: null,
        },
        {
          name: 'beta',
          percentage: 100,
          durationMs: 30_000,
          metrics: {},
          divergenceThreshold: 0.2,
          passed: null,
          startedAt: null,
          completedAt: null,
        },
      ];

      const customPipeline = createEvolutionPipeline({
        signingKey: 'test-key',
        stages: customStages,
      });
      const proposal = customPipeline.propose(makeProposalParams());
      const rollout = customPipeline.stage(proposal.proposalId);

      expect(rollout.stages).toHaveLength(2);
      expect(rollout.stages[0].name).toBe('alpha');
      expect(rollout.stages[1].name).toBe('beta');
    });

    it('should store rollout for later retrieval', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const rollout = pipeline.stage(proposal.proposalId);

      expect(pipeline.getRollout(rollout.rolloutId)).toBe(rollout);
    });
  });

  // --------------------------------------------------------------------------
  // advanceStage
  // --------------------------------------------------------------------------

  describe('advanceStage', () => {
    it('should progress to the next stage when metrics pass', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const rollout = pipeline.stage(proposal.proposalId);

      const result = pipeline.advanceStage(rollout.rolloutId, {
        divergence: 0.05,
        accuracy: 0.95,
      });

      expect(result.advanced).toBe(true);
      expect(result.rolledBack).toBe(false);
      expect(result.reason).toContain('partial');

      const updated = pipeline.getRollout(rollout.rolloutId)!;
      expect(updated.currentStage).toBe(1);
      expect(updated.stages[0].passed).toBe(true);
      expect(updated.stages[0].completedAt).toBeGreaterThan(0);
      expect(updated.stages[1].startedAt).toBeGreaterThan(0);
    });

    it('should auto-rollback when divergence exceeds threshold', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const rollout = pipeline.stage(proposal.proposalId);

      const result = pipeline.advanceStage(rollout.rolloutId, {
        divergence: 0.99, // way over the 0.2 canary threshold
      });

      expect(result.advanced).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(result.reason).toContain('Auto-rollback');

      const updated = pipeline.getRollout(rollout.rolloutId)!;
      expect(updated.status).toBe('rolled-back');
      expect(updated.stages[0].passed).toBe(false);
    });

    it('should promote after all stages pass', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const rollout = pipeline.stage(proposal.proposalId);

      // Advance through all 3 stages
      pipeline.advanceStage(rollout.rolloutId, { divergence: 0.05 });
      pipeline.advanceStage(rollout.rolloutId, { divergence: 0.10 });
      const final = pipeline.advanceStage(rollout.rolloutId, { divergence: 0.15 });

      expect(final.advanced).toBe(true);
      expect(final.reason).toContain('promoted');

      const updated = pipeline.getRollout(rollout.rolloutId)!;
      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeGreaterThan(0);
      expect(pipeline.getProposal(proposal.proposalId)?.status).toBe('promoted');
    });

    it('should record metrics on the current stage', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const rollout = pipeline.stage(proposal.proposalId);

      pipeline.advanceStage(rollout.rolloutId, {
        divergence: 0.01,
        accuracy: 0.98,
        latency: 55,
      });

      const updated = pipeline.getRollout(rollout.rolloutId)!;
      expect(updated.stages[0].metrics).toEqual({
        divergence: 0.01,
        accuracy: 0.98,
        latency: 55,
      });
    });

    it('should reject advance on non-in-progress rollout', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const rollout = pipeline.stage(proposal.proposalId);

      // Rollback first
      pipeline.rollback(rollout.rolloutId, 'manual rollback');

      const result = pipeline.advanceStage(rollout.rolloutId, { divergence: 0 });

      expect(result.advanced).toBe(false);
      expect(result.rolledBack).toBe(false);
      expect(result.reason).toContain('rolled-back');
    });
  });

  // --------------------------------------------------------------------------
  // rollback
  // --------------------------------------------------------------------------

  describe('rollback', () => {
    it('should mark rollout as rolled-back', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const rollout = pipeline.stage(proposal.proposalId);

      pipeline.rollback(rollout.rolloutId, 'detected regression in production');

      const updated = pipeline.getRollout(rollout.rolloutId)!;
      expect(updated.status).toBe('rolled-back');
      expect(updated.completedAt).toBeGreaterThan(0);
    });

    it('should mark the proposal as rolled-back', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const rollout = pipeline.stage(proposal.proposalId);

      pipeline.rollback(rollout.rolloutId, 'manual');

      expect(pipeline.getProposal(proposal.proposalId)?.status).toBe('rolled-back');
    });

    it('should throw for unknown rollout', () => {
      expect(() => pipeline.rollback('nonexistent', 'reason')).toThrow(
        'Rollout not found',
      );
    });
  });

  // --------------------------------------------------------------------------
  // promote
  // --------------------------------------------------------------------------

  describe('promote', () => {
    it('should mark rollout as completed', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const rollout = pipeline.stage(proposal.proposalId);

      pipeline.promote(rollout.rolloutId);

      const updated = pipeline.getRollout(rollout.rolloutId)!;
      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeGreaterThan(0);
    });

    it('should mark proposal as promoted', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const rollout = pipeline.stage(proposal.proposalId);

      pipeline.promote(rollout.rolloutId);

      expect(pipeline.getProposal(proposal.proposalId)?.status).toBe('promoted');
    });

    it('should throw for unknown rollout', () => {
      expect(() => pipeline.promote('nonexistent')).toThrow('Rollout not found');
    });
  });

  // --------------------------------------------------------------------------
  // getProposals
  // --------------------------------------------------------------------------

  describe('getProposals', () => {
    it('should return all proposals when no filter is given', () => {
      pipeline.propose(makeProposalParams({ title: 'A' }));
      pipeline.propose(makeProposalParams({ title: 'B' }));
      pipeline.propose(makeProposalParams({ title: 'C' }));

      expect(pipeline.getProposals()).toHaveLength(3);
    });

    it('should filter proposals by status', () => {
      const p1 = pipeline.propose(makeProposalParams({ title: 'A' }));
      const p2 = pipeline.propose(makeProposalParams({ title: 'B' }));

      // Stage p1 (changes status to 'staged')
      pipeline.stage(p1.proposalId);

      const signed = pipeline.getProposals('signed');
      const staged = pipeline.getProposals('staged');

      expect(signed).toHaveLength(1);
      expect(signed[0].title).toBe('B');
      expect(staged).toHaveLength(1);
      expect(staged[0].title).toBe('A');
    });
  });

  // --------------------------------------------------------------------------
  // getHistory
  // --------------------------------------------------------------------------

  describe('getHistory', () => {
    it('should return empty history for fresh pipeline', () => {
      expect(pipeline.getHistory()).toHaveLength(0);
    });

    it('should return full timeline for a proposal through all stages', () => {
      const proposal = pipeline.propose(makeProposalParams());
      const simResult = pipeline.simulate(
        proposal.proposalId,
        [{ input: '1' }],
        identicalEvaluator,
      );
      pipeline.compare(proposal.proposalId, simResult);
      const rollout = pipeline.stage(proposal.proposalId);
      pipeline.advanceStage(rollout.rolloutId, { divergence: 0.01 });
      pipeline.advanceStage(rollout.rolloutId, { divergence: 0.01 });
      pipeline.advanceStage(rollout.rolloutId, { divergence: 0.01 });

      const history = pipeline.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0].proposal.proposalId).toBe(proposal.proposalId);
      expect(history[0].simulation).toBeDefined();
      expect(history[0].simulation?.proposalId).toBe(proposal.proposalId);
      expect(history[0].rollout).toBeDefined();
      expect(history[0].rollout?.rolloutId).toBe(rollout.rolloutId);
      expect(history[0].outcome).toBe('promoted');
    });

    it('should include proposals without simulations or rollouts', () => {
      pipeline.propose(makeProposalParams());

      const history = pipeline.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0].simulation).toBeUndefined();
      expect(history[0].rollout).toBeUndefined();
      expect(history[0].outcome).toBe('signed');
    });

    it('should track multiple proposals independently', () => {
      const p1 = pipeline.propose(makeProposalParams({ title: 'Change 1' }));
      const p2 = pipeline.propose(makeProposalParams({ title: 'Change 2' }));

      // Only simulate p1
      pipeline.simulate(p1.proposalId, [{ input: '1' }], identicalEvaluator);

      const history = pipeline.getHistory();

      expect(history).toHaveLength(2);

      const h1 = history.find(h => h.proposal.proposalId === p1.proposalId)!;
      const h2 = history.find(h => h.proposal.proposalId === p2.proposalId)!;

      expect(h1.simulation).toBeDefined();
      expect(h2.simulation).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Factory function
  // --------------------------------------------------------------------------

  describe('createEvolutionPipeline', () => {
    it('should throw when no signingKey is provided', () => {
      expect(() => createEvolutionPipeline()).toThrow('requires an explicit signingKey');
    });

    it('should create a pipeline with an explicit signing key', () => {
      const pipeline = createEvolutionPipeline({ signingKey: 'test-key' });
      const proposal = pipeline.propose(makeProposalParams());

      expect(proposal.signature).toMatch(/^[a-f0-9]{64}$/);
      expect(proposal.status).toBe('signed');
    });

    it('should create a pipeline with custom config', () => {
      const customPipeline = createEvolutionPipeline({
        signingKey: 'custom-key',
        maxDivergence: 0.5,
      });

      const proposal = customPipeline.propose(makeProposalParams());
      expect(proposal.signature).toBeTruthy();

      // Higher threshold should accept more divergence
      const simResult = customPipeline.simulate(
        proposal.proposalId,
        [{ input: '1' }],
        slightlyDivergentEvaluator,
      );

      const comparison = customPipeline.compare(proposal.proposalId, simResult);
      expect(comparison.approved).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // End-to-end lifecycle
  // --------------------------------------------------------------------------

  describe('end-to-end lifecycle', () => {
    it('should handle propose -> simulate -> compare -> stage -> advance -> promote', () => {
      // 1. Propose
      const proposal = pipeline.propose(makeProposalParams());
      expect(proposal.status).toBe('signed');

      // 2. Simulate
      const simResult = pipeline.simulate(
        proposal.proposalId,
        [{ input: 'golden-1' }, { input: 'golden-2' }],
        identicalEvaluator,
      );
      expect(simResult.passed).toBe(true);

      // 3. Compare
      const comparison = pipeline.compare(proposal.proposalId, simResult);
      expect(comparison.approved).toBe(true);
      expect(pipeline.getProposal(proposal.proposalId)?.status).toBe('compared');

      // 4. Stage
      const rollout = pipeline.stage(proposal.proposalId);
      expect(rollout.status).toBe('in-progress');
      expect(pipeline.getProposal(proposal.proposalId)?.status).toBe('staged');

      // 5. Advance through all stages
      const r1 = pipeline.advanceStage(rollout.rolloutId, { divergence: 0.01 });
      expect(r1.advanced).toBe(true);

      const r2 = pipeline.advanceStage(rollout.rolloutId, { divergence: 0.02 });
      expect(r2.advanced).toBe(true);

      const r3 = pipeline.advanceStage(rollout.rolloutId, { divergence: 0.03 });
      expect(r3.advanced).toBe(true);
      expect(r3.reason).toContain('promoted');

      // 6. Verify final state
      expect(pipeline.getProposal(proposal.proposalId)?.status).toBe('promoted');
      expect(pipeline.getRollout(rollout.rolloutId)?.status).toBe('completed');
    });

    it('should handle propose -> simulate -> compare(reject) flow', () => {
      const proposal = pipeline.propose(makeProposalParams());

      const simResult: SimulationResult = {
        proposalId: proposal.proposalId,
        baselineTraceHash: 'a'.repeat(64),
        candidateTraceHash: 'b'.repeat(64),
        divergenceScore: 0.95,
        decisionDiffs: [],
        metricsComparison: { baseline: {}, candidate: {} },
        passed: false,
        reason: 'too divergent',
      };

      const comparison = pipeline.compare(proposal.proposalId, simResult);
      expect(comparison.approved).toBe(false);
      expect(pipeline.getProposal(proposal.proposalId)?.status).toBe('rejected');
    });
  });
});
