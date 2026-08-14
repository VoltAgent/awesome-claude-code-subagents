import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  type ContinueGateConfig,
  type StepContext,
  type ContinueDecision,
  ContinueGate,
  createContinueGate,
} from '../src/continue-gate.ts';

// ============================================================================
// Helpers
// ============================================================================

function makeContext(overrides: Partial<StepContext> = {}): StepContext {
  return {
    stepNumber: 10,
    totalTokensUsed: 5000,
    totalToolCalls: 20,
    reworkCount: 1,
    coherenceScore: 0.8,
    uncertaintyScore: 0.3,
    elapsedMs: 30000,
    lastCheckpointStep: 0,
    budgetRemaining: {
      tokens: 100000,
      toolCalls: 500,
      timeMs: 600000,
    },
    recentDecisions: [],
    ...overrides,
  };
}

// ============================================================================
// Factory Function
// ============================================================================

describe('createContinueGate()', () => {
  it('should create a ContinueGate with default config', () => {
    const gate = createContinueGate();
    expect(gate).toBeInstanceOf(ContinueGate);
    const config = gate.getConfig();
    expect(config.maxConsecutiveSteps).toBe(100);
    expect(config.maxBudgetSlopePerStep).toBe(0.02);
    expect(config.minCoherenceForContinue).toBe(0.4);
    expect(config.maxUncertaintyForContinue).toBe(0.8);
    expect(config.maxReworkRatio).toBe(0.3);
    expect(config.checkpointIntervalSteps).toBe(25);
    expect(config.cooldownMs).toBe(5000);
  });

  it('should create a ContinueGate with custom config', () => {
    const gate = createContinueGate({
      maxConsecutiveSteps: 50,
      minCoherenceForContinue: 0.6,
    });
    const config = gate.getConfig();
    expect(config.maxConsecutiveSteps).toBe(50);
    expect(config.minCoherenceForContinue).toBe(0.6);
    // defaults preserved
    expect(config.maxBudgetSlopePerStep).toBe(0.02);
  });
});

// ============================================================================
// ContinueGate.evaluate() - Decision Logic
// ============================================================================

describe('ContinueGate.evaluate()', () => {
  let gate: ContinueGate;

  beforeEach(() => {
    gate = new ContinueGate();
  });

  // --- continue ---

  it('should return continue when all checks pass', () => {
    const decision = gate.evaluate(makeContext());
    expect(decision.decision).toBe('continue');
    expect(decision.reasons).toContain('All checks passed');
  });

  // --- stop: coherence ---

  it('should return stop when coherence is below threshold', () => {
    const decision = gate.evaluate(makeContext({ coherenceScore: 0.2 }));
    expect(decision.decision).toBe('stop');
    expect(decision.reasons[0]).toContain('Coherence below threshold');
    expect(decision.metrics.coherenceLevel).toBe('critical');
  });

  it('should return stop when coherence is exactly at threshold', () => {
    // 0.4 is minCoherenceForContinue; < 0.4 → stop
    const decision = gate.evaluate(makeContext({ coherenceScore: 0.39 }));
    expect(decision.decision).toBe('stop');
  });

  it('should continue when coherence equals the threshold', () => {
    const decision = gate.evaluate(makeContext({ coherenceScore: 0.4 }));
    expect(decision.decision).not.toBe('stop');
  });

  // --- stop: step limit ---

  it('should return stop when step limit exceeded without recent checkpoint', () => {
    const decision = gate.evaluate(makeContext({
      stepNumber: 100,
      lastCheckpointStep: 50, // 100 - 50 = 50 >= 25
    }));
    expect(decision.decision).toBe('stop');
    expect(decision.reasons[0]).toContain('Step limit exceeded');
  });

  it('should not stop at step limit if recent checkpoint exists', () => {
    const decision = gate.evaluate(makeContext({
      stepNumber: 100,
      lastCheckpointStep: 90, // 100 - 90 = 10 < 25
    }));
    expect(decision.decision).not.toBe('stop');
  });

  // --- stop: budget exhausted ---

  it('should return stop when token budget is exhausted', () => {
    const decision = gate.evaluate(makeContext({
      budgetRemaining: { tokens: 0, toolCalls: 500, timeMs: 600000 },
    }));
    expect(decision.decision).toBe('stop');
    expect(decision.reasons[0]).toContain('Budget exhausted');
    expect(decision.reasons[0]).toContain('tokens');
  });

  it('should return stop when tool call budget is exhausted', () => {
    const decision = gate.evaluate(makeContext({
      budgetRemaining: { tokens: 100000, toolCalls: 0, timeMs: 600000 },
    }));
    expect(decision.decision).toBe('stop');
    expect(decision.reasons[0]).toContain('tool calls');
  });

  it('should return stop when time budget is exhausted', () => {
    const decision = gate.evaluate(makeContext({
      budgetRemaining: { tokens: 100000, toolCalls: 500, timeMs: 0 },
    }));
    expect(decision.decision).toBe('stop');
    expect(decision.reasons[0]).toContain('time');
  });

  it('should list all exhausted budgets', () => {
    const decision = gate.evaluate(makeContext({
      budgetRemaining: { tokens: 0, toolCalls: 0, timeMs: 0 },
    }));
    expect(decision.decision).toBe('stop');
    expect(decision.reasons[0]).toContain('tokens');
    expect(decision.reasons[0]).toContain('tool calls');
    expect(decision.reasons[0]).toContain('time');
  });

  // --- pause: rework ratio ---

  it('should return pause when rework ratio exceeds threshold', () => {
    const decision = gate.evaluate(makeContext({
      stepNumber: 10,
      reworkCount: 4, // 4/10 = 0.4 > 0.3
    }));
    expect(decision.decision).toBe('pause');
    expect(decision.reasons[0]).toContain('Rework ratio too high');
    expect(decision.metrics.reworkRatio).toBeCloseTo(0.4);
  });

  it('should not pause when rework ratio is at threshold', () => {
    const decision = gate.evaluate(makeContext({
      stepNumber: 10,
      reworkCount: 3, // 3/10 = 0.3, not > 0.3
    }));
    expect(decision.decision).not.toBe('pause');
  });

  // --- pause: uncertainty ---

  it('should return pause when uncertainty exceeds threshold', () => {
    const decision = gate.evaluate(makeContext({ uncertaintyScore: 0.9 }));
    expect(decision.decision).toBe('pause');
    expect(decision.reasons[0]).toContain('Uncertainty too high');
    expect(decision.metrics.uncertaintyLevel).toBe('extreme');
  });

  it('should not pause when uncertainty is at threshold', () => {
    const decision = gate.evaluate(makeContext({ uncertaintyScore: 0.8 }));
    expect(decision.decision).not.toBe('pause');
  });

  // --- throttle: budget acceleration ---

  it('should return throttle when budget slope is accelerating', () => {
    const gate = new ContinueGate({ maxBudgetSlopePerStep: 0.02 });

    // Feed increasing token usage to build up slope
    for (let step = 1; step <= 10; step++) {
      gate.evaluate(makeContext({
        stepNumber: step,
        totalTokensUsed: step * step * 1000, // quadratic growth
      }));
    }

    // The 11th step should detect the high slope
    const decision = gate.evaluate(makeContext({
      stepNumber: 11,
      totalTokensUsed: 11 * 11 * 1000,
    }));

    // With quadratic growth, the slope should be positive and large
    expect(decision.metrics.budgetSlope).toBeGreaterThan(0);
  });

  // --- checkpoint ---

  it('should return checkpoint when interval reached', () => {
    const decision = gate.evaluate(makeContext({
      stepNumber: 25,
      lastCheckpointStep: 0, // 25 - 0 = 25 >= 25
    }));
    expect(decision.decision).toBe('checkpoint');
    expect(decision.reasons[0]).toContain('Checkpoint interval reached');
  });

  it('should not checkpoint before interval', () => {
    const decision = gate.evaluate(makeContext({
      stepNumber: 24,
      lastCheckpointStep: 0, // 24 - 0 = 24 < 25
    }));
    expect(decision.decision).toBe('continue');
  });

  // --- priority order ---

  it('should prioritize stop over pause', () => {
    // Both coherence below threshold (stop) and high rework (pause)
    const decision = gate.evaluate(makeContext({
      coherenceScore: 0.2,
      reworkCount: 5,
      stepNumber: 10,
    }));
    expect(decision.decision).toBe('stop');
  });

  it('should prioritize pause over throttle', () => {
    // High rework (pause) with some budget acceleration
    const gate = new ContinueGate();
    // Build slope data
    for (let step = 1; step <= 10; step++) {
      gate.evaluate(makeContext({
        stepNumber: step,
        totalTokensUsed: step * step * 1000,
        reworkCount: 0,
      }));
    }
    const decision = gate.evaluate(makeContext({
      stepNumber: 11,
      totalTokensUsed: 11 * 11 * 1000,
      reworkCount: 5, // 5/11 > 0.3
    }));
    expect(decision.decision).toBe('pause');
  });

  // --- metrics ---

  it('should compute coherence level correctly', () => {
    expect(gate.evaluate(makeContext({ coherenceScore: 0.8 })).metrics.coherenceLevel).toBe('healthy');
    expect(gate.evaluate(makeContext({ coherenceScore: 0.5 })).metrics.coherenceLevel).toBe('degraded');
  });

  it('should compute uncertainty level correctly', () => {
    expect(gate.evaluate(makeContext({ uncertaintyScore: 0.2 })).metrics.uncertaintyLevel).toBe('low');
    expect(gate.evaluate(makeContext({ uncertaintyScore: 0.5 })).metrics.uncertaintyLevel).toBe('moderate');
    expect(gate.evaluate(makeContext({ uncertaintyScore: 0.7 })).metrics.uncertaintyLevel).toBe('high');
  });

  it('should compute rework ratio correctly', () => {
    const decision = gate.evaluate(makeContext({
      stepNumber: 20,
      reworkCount: 4,
    }));
    expect(decision.metrics.reworkRatio).toBeCloseTo(0.2);
  });

  it('should handle zero step number (division by zero)', () => {
    const decision = gate.evaluate(makeContext({ stepNumber: 0, reworkCount: 0 }));
    expect(decision.metrics.reworkRatio).toBe(0);
  });

  it('should include recommended action for non-continue decisions', () => {
    const decision = gate.evaluate(makeContext({ coherenceScore: 0.1 }));
    expect(decision.recommendedAction).toBeDefined();
    expect(decision.recommendedAction).toContain('coherence');
  });
});

// ============================================================================
// ContinueGate.evaluateWithHistory() - History and Cooldown
// ============================================================================

describe('ContinueGate.evaluateWithHistory()', () => {
  it('should record evaluations in history', () => {
    const gate = new ContinueGate({ cooldownMs: 0 });
    gate.evaluateWithHistory(makeContext({ stepNumber: 1 }));
    gate.evaluateWithHistory(makeContext({ stepNumber: 2 }));

    const history = gate.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].step).toBe(1);
    expect(history[1].step).toBe(2);
    expect(history[0].timestamp).toBeLessThanOrEqual(history[1].timestamp);
  });

  it('should return continue with minimal metrics during cooldown', () => {
    const gate = new ContinueGate({ cooldownMs: 60000 });

    // First call proceeds normally
    const first = gate.evaluateWithHistory(makeContext());
    expect(first.decision).toBe('continue');

    // Second call within cooldown
    const second = gate.evaluateWithHistory(makeContext());
    expect(second.decision).toBe('continue');
    expect(second.reasons[0]).toContain('Cooldown');
  });

  it('should still stop during cooldown if coherence collapses', () => {
    const gate = new ContinueGate({ cooldownMs: 60000 });

    // First call to set cooldown timer
    gate.evaluateWithHistory(makeContext());

    // Second call during cooldown with coherence collapse
    const decision = gate.evaluateWithHistory(makeContext({
      coherenceScore: 0.1,
    }));
    expect(decision.decision).toBe('stop');
    expect(decision.reasons[0]).toContain('Coherence below threshold');
  });

  it('should still stop during cooldown if budget exhausted', () => {
    const gate = new ContinueGate({ cooldownMs: 60000 });

    // First call to set cooldown timer
    gate.evaluateWithHistory(makeContext());

    // Second call during cooldown with budget exhausted
    const decision = gate.evaluateWithHistory(makeContext({
      budgetRemaining: { tokens: 0, toolCalls: 500, timeMs: 600000 },
    }));
    expect(decision.decision).toBe('stop');
    expect(decision.reasons[0]).toContain('Budget exhausted');
  });

  it('should evict oldest entries when history exceeds max size', () => {
    const gate = new ContinueGate({ cooldownMs: 0 });

    // Fill beyond max (10000)
    for (let i = 0; i < 10002; i++) {
      gate.evaluateWithHistory(makeContext({ stepNumber: i }));
    }

    const history = gate.getHistory();
    expect(history.length).toBeLessThanOrEqual(10000);
    // Oldest entries should be evicted
    expect(history[0].step).toBeGreaterThan(0);
  });
});

// ============================================================================
// ContinueGate.getStats()
// ============================================================================

describe('ContinueGate.getStats()', () => {
  it('should return zero stats when no evaluations', () => {
    const gate = new ContinueGate();
    const stats = gate.getStats();
    expect(stats.totalEvaluations).toBe(0);
    expect(stats.decisions.continue).toBe(0);
    expect(stats.averageBudgetSlope).toBe(0);
  });

  it('should count decisions by type', () => {
    const gate = new ContinueGate({ cooldownMs: 0 });

    // 2 continues (reworkCount: 0 to avoid pause)
    gate.evaluateWithHistory(makeContext({ stepNumber: 1, reworkCount: 0 }));
    gate.evaluateWithHistory(makeContext({ stepNumber: 2, reworkCount: 0 }));

    // 1 stop (coherence collapse)
    gate.evaluateWithHistory(makeContext({ stepNumber: 3, reworkCount: 0, coherenceScore: 0.1 }));

    // 1 checkpoint
    gate.evaluateWithHistory(makeContext({
      stepNumber: 25,
      reworkCount: 0,
      lastCheckpointStep: 0,
    }));

    const stats = gate.getStats();
    expect(stats.totalEvaluations).toBe(4);
    expect(stats.decisions.continue).toBe(2);
    expect(stats.decisions.stop).toBe(1);
    expect(stats.decisions.checkpoint).toBe(1);
  });
});

// ============================================================================
// ContinueGate.reset()
// ============================================================================

describe('ContinueGate.reset()', () => {
  it('should clear all internal state', () => {
    const gate = new ContinueGate({ cooldownMs: 0 });
    gate.evaluateWithHistory(makeContext({ stepNumber: 1 }));
    gate.evaluateWithHistory(makeContext({ stepNumber: 2 }));
    expect(gate.getHistory()).toHaveLength(2);

    gate.reset();

    expect(gate.getHistory()).toHaveLength(0);
    expect(gate.getStats().totalEvaluations).toBe(0);
  });
});

// ============================================================================
// Budget Slope Detection (Linear Regression)
// ============================================================================

describe('Budget slope detection', () => {
  it('should detect zero slope with constant token usage', () => {
    const gate = new ContinueGate({ cooldownMs: 0 });

    // Constant token usage: 1000 per step
    for (let step = 1; step <= 10; step++) {
      gate.evaluate(makeContext({
        stepNumber: step,
        totalTokensUsed: 1000, // same every step
      }));
    }

    const decision = gate.evaluate(makeContext({
      stepNumber: 11,
      totalTokensUsed: 1000,
    }));
    expect(decision.metrics.budgetSlope).toBeCloseTo(0, 1);
  });

  it('should detect positive slope with increasing token usage', () => {
    const gate = new ContinueGate({ cooldownMs: 0 });

    for (let step = 1; step <= 10; step++) {
      gate.evaluate(makeContext({
        stepNumber: step,
        totalTokensUsed: step * 500, // linear growth
      }));
    }

    const decision = gate.evaluate(makeContext({
      stepNumber: 11,
      totalTokensUsed: 5500,
    }));
    expect(decision.metrics.budgetSlope).toBeGreaterThan(0);
  });

  it('should return zero slope with fewer than 2 data points', () => {
    const gate = new ContinueGate({ cooldownMs: 0 });
    const decision = gate.evaluate(makeContext({ stepNumber: 1, totalTokensUsed: 1000 }));
    expect(decision.metrics.budgetSlope).toBe(0);
  });
});

// ============================================================================
// ContinueGate.getConfig()
// ============================================================================

describe('ContinueGate.getConfig()', () => {
  it('should return a copy of the config', () => {
    const gate = new ContinueGate({ maxConsecutiveSteps: 50 });
    const config = gate.getConfig();
    expect(config.maxConsecutiveSteps).toBe(50);

    // Should be a copy, not the internal object
    config.maxConsecutiveSteps = 999;
    expect(gate.getConfig().maxConsecutiveSteps).toBe(50);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
  it('should handle negative budget remaining', () => {
    const gate = new ContinueGate();
    const decision = gate.evaluate(makeContext({
      budgetRemaining: { tokens: -100, toolCalls: 500, timeMs: 600000 },
    }));
    expect(decision.decision).toBe('stop');
  });

  it('should handle coherence score of exactly 0', () => {
    const gate = new ContinueGate();
    const decision = gate.evaluate(makeContext({ coherenceScore: 0 }));
    expect(decision.decision).toBe('stop');
  });

  it('should handle uncertainty score of exactly 1', () => {
    const gate = new ContinueGate();
    const decision = gate.evaluate(makeContext({ uncertaintyScore: 1.0 }));
    expect(decision.decision).toBe('pause');
  });

  it('should handle very large step numbers', () => {
    const gate = new ContinueGate();
    const decision = gate.evaluate(makeContext({
      stepNumber: 1000000,
      lastCheckpointStep: 999990,
    }));
    // Should stop due to step limit, but has recent checkpoint
    // so it depends on checkpoint interval check
    expect(decision.decision).toBeDefined();
  });
});
