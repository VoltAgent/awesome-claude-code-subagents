/**
 * Tests for the Coherence Scheduler & Economic Governor
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CoherenceScheduler,
  EconomicGovernor,
  createCoherenceScheduler,
  createEconomicGovernor,
} from '../src/coherence.js';
import type { CoherenceScore } from '../src/coherence.js';
import type { RunEvent, OptimizationMetrics, TaskIntent } from '../src/types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockEvent(overrides: Partial<RunEvent> = {}): RunEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2)}`,
    taskId: `task-${Math.random().toString(36).slice(2)}`,
    guidanceHash: 'abc123',
    retrievedRuleIds: ['R001', 'R002'],
    toolsUsed: ['Read', 'Edit'],
    filesTouched: ['src/main.ts'],
    diffSummary: { linesAdded: 50, linesRemoved: 10, filesChanged: 1 },
    testResults: { ran: true, passed: 10, failed: 0, skipped: 0 },
    violations: [],
    outcomeAccepted: true,
    reworkLines: 5,
    intent: 'feature',
    timestamp: Date.now(),
    durationMs: 5000,
    ...overrides,
  };
}

function createMockMetrics(overrides: Partial<OptimizationMetrics> = {}): OptimizationMetrics {
  return {
    violationRate: 0,
    selfCorrectionRate: 1,
    reworkLines: 0,
    clarifyingQuestions: 0,
    taskCount: 10,
    ...overrides,
  };
}

// ============================================================================
// CoherenceScheduler Tests
// ============================================================================

describe('CoherenceScheduler', () => {
  let scheduler: CoherenceScheduler;

  beforeEach(() => {
    scheduler = new CoherenceScheduler();
  });

  describe('computeCoherence', () => {
    it('should compute a healthy score with clean metrics and consistent events', () => {
      const metrics = createMockMetrics({
        violationRate: 0,
        reworkLines: 0,
      });

      // All events have the same intent
      const events = Array.from({ length: 10 }, () =>
        createMockEvent({ intent: 'feature' }),
      );

      const score = scheduler.computeCoherence(metrics, events);

      expect(score.overall).toBeGreaterThanOrEqual(0.7);
      expect(score.violationComponent).toBe(1);
      expect(score.reworkComponent).toBe(1);
      expect(score.driftComponent).toBe(1);
      expect(score.overall).toBe(1);
      expect(score.windowSize).toBe(10);
      expect(score.timestamp).toBeGreaterThan(0);
    });

    it('should compute a degraded score with moderate violations and rework', () => {
      const metrics = createMockMetrics({
        violationRate: 5, // 5 violations per 10 tasks
        reworkLines: 50, // 50 rework lines on average
      });

      const events = Array.from({ length: 10 }, () =>
        createMockEvent({ intent: 'feature' }),
      );

      const score = scheduler.computeCoherence(metrics, events);

      // violationComponent: 1 - (5/10) = 0.5
      expect(score.violationComponent).toBe(0.5);
      // reworkComponent: 1 - (50/100) = 0.5
      expect(score.reworkComponent).toBe(0.5);
      // driftComponent: all same intent = 1
      expect(score.driftComponent).toBe(1);
      // overall: 0.4*0.5 + 0.3*0.5 + 0.3*1 = 0.2 + 0.15 + 0.3 = 0.65
      expect(score.overall).toBeCloseTo(0.65, 5);
    });

    it('should compute a critical score with high violations, rework, and drift', () => {
      const metrics = createMockMetrics({
        violationRate: 10, // max
        reworkLines: 100, // max
      });

      // Every event has a different intent
      const intents: TaskIntent[] = [
        'bug-fix', 'feature', 'refactor', 'security',
        'performance', 'testing', 'docs', 'deployment',
        'architecture', 'debug',
      ];
      const events = intents.map(intent => createMockEvent({ intent }));

      const score = scheduler.computeCoherence(metrics, events);

      // violationComponent: 1 - (10/10) = 0, clamped to 0
      expect(score.violationComponent).toBe(0);
      // reworkComponent: 1 - (100/100) = 0, clamped to 0
      expect(score.reworkComponent).toBe(0);
      // driftComponent: 10 unique / 10 events = 1 - (10-1)/(10-1) = 0
      expect(score.driftComponent).toBe(0);
      // overall: 0
      expect(score.overall).toBe(0);
    });

    it('should clamp violation rate above 10 to 0', () => {
      const metrics = createMockMetrics({ violationRate: 20 });
      const events = [createMockEvent()];

      const score = scheduler.computeCoherence(metrics, events);
      expect(score.violationComponent).toBe(0);
    });

    it('should clamp rework lines above 100 to 0', () => {
      const metrics = createMockMetrics({ reworkLines: 200 });
      const events = [createMockEvent()];

      const score = scheduler.computeCoherence(metrics, events);
      expect(score.reworkComponent).toBe(0);
    });

    it('should handle empty events with drift component 1', () => {
      const metrics = createMockMetrics();
      const score = scheduler.computeCoherence(metrics, []);

      expect(score.driftComponent).toBe(1);
      expect(score.windowSize).toBe(0);
    });

    it('should respect custom window size', () => {
      const customScheduler = new CoherenceScheduler({ windowSize: 5 });
      const metrics = createMockMetrics();
      const events = Array.from({ length: 20 }, () => createMockEvent());

      const score = customScheduler.computeCoherence(metrics, events);
      expect(score.windowSize).toBe(5);
    });

    it('should add scores to history', () => {
      const metrics = createMockMetrics();
      const events = [createMockEvent()];

      scheduler.computeCoherence(metrics, events);
      scheduler.computeCoherence(metrics, events);
      scheduler.computeCoherence(metrics, events);

      expect(scheduler.getScoreHistory()).toHaveLength(3);
    });
  });

  describe('getPrivilegeLevel', () => {
    it('should return "full" for healthy scores', () => {
      const score: CoherenceScore = {
        overall: 0.85,
        violationComponent: 0.9,
        reworkComponent: 0.8,
        driftComponent: 0.85,
        timestamp: Date.now(),
        windowSize: 10,
      };
      expect(scheduler.getPrivilegeLevel(score)).toBe('full');
    });

    it('should return "full" at exactly the healthy threshold', () => {
      const score: CoherenceScore = {
        overall: 0.7,
        violationComponent: 0.7,
        reworkComponent: 0.7,
        driftComponent: 0.7,
        timestamp: Date.now(),
        windowSize: 10,
      };
      expect(scheduler.getPrivilegeLevel(score)).toBe('full');
    });

    it('should return "restricted" between warning and healthy thresholds', () => {
      const score: CoherenceScore = {
        overall: 0.6,
        violationComponent: 0.6,
        reworkComponent: 0.6,
        driftComponent: 0.6,
        timestamp: Date.now(),
        windowSize: 10,
      };
      expect(scheduler.getPrivilegeLevel(score)).toBe('restricted');
    });

    it('should return "read-only" between read-only and warning thresholds', () => {
      const score: CoherenceScore = {
        overall: 0.4,
        violationComponent: 0.4,
        reworkComponent: 0.4,
        driftComponent: 0.4,
        timestamp: Date.now(),
        windowSize: 10,
      };
      expect(scheduler.getPrivilegeLevel(score)).toBe('read-only');
    });

    it('should return "suspended" below read-only threshold', () => {
      const score: CoherenceScore = {
        overall: 0.2,
        violationComponent: 0.2,
        reworkComponent: 0.2,
        driftComponent: 0.2,
        timestamp: Date.now(),
        windowSize: 10,
      };
      expect(scheduler.getPrivilegeLevel(score)).toBe('suspended');
    });

    it('should use custom thresholds', () => {
      const custom = new CoherenceScheduler({
        thresholds: {
          readOnlyThreshold: 0.2,
          warningThreshold: 0.4,
          healthyThreshold: 0.6,
        },
      });

      const score: CoherenceScore = {
        overall: 0.5,
        violationComponent: 0.5,
        reworkComponent: 0.5,
        driftComponent: 0.5,
        timestamp: Date.now(),
        windowSize: 10,
      };

      // 0.5 is between warning (0.4) and healthy (0.6) with custom thresholds
      expect(custom.getPrivilegeLevel(score)).toBe('restricted');
    });
  });

  describe('drift detection', () => {
    it('should detect drift when score is below warning threshold', () => {
      const driftingScore: CoherenceScore = {
        overall: 0.3,
        violationComponent: 0.2,
        reworkComponent: 0.3,
        driftComponent: 0.4,
        timestamp: Date.now(),
        windowSize: 10,
      };

      expect(scheduler.isDrifting(driftingScore)).toBe(true);
    });

    it('should not detect drift when score is healthy', () => {
      const healthyScore: CoherenceScore = {
        overall: 0.8,
        violationComponent: 0.9,
        reworkComponent: 0.8,
        driftComponent: 0.7,
        timestamp: Date.now(),
        windowSize: 10,
      };

      expect(scheduler.isDrifting(healthyScore)).toBe(false);
    });

    it('should not detect drift at exactly the warning threshold', () => {
      const borderlineScore: CoherenceScore = {
        overall: 0.5,
        violationComponent: 0.5,
        reworkComponent: 0.5,
        driftComponent: 0.5,
        timestamp: Date.now(),
        windowSize: 10,
      };

      expect(scheduler.isDrifting(borderlineScore)).toBe(false);
    });

    it('should measure intent drift from diverse events', () => {
      const metrics = createMockMetrics();
      const intents: TaskIntent[] = [
        'bug-fix', 'feature', 'refactor', 'security', 'performance',
      ];
      const events = intents.map(intent => createMockEvent({ intent }));

      const score = scheduler.computeCoherence(metrics, events);

      // 5 unique intents out of 5 events: drift = 1 - (5-1)/(5-1) = 0
      expect(score.driftComponent).toBe(0);
    });
  });

  describe('isHealthy', () => {
    it('should return true for scores at or above healthy threshold', () => {
      expect(scheduler.isHealthy({ overall: 0.7 } as CoherenceScore)).toBe(true);
      expect(scheduler.isHealthy({ overall: 1.0 } as CoherenceScore)).toBe(true);
    });

    it('should return false for scores below healthy threshold', () => {
      expect(scheduler.isHealthy({ overall: 0.69 } as CoherenceScore)).toBe(false);
      expect(scheduler.isHealthy({ overall: 0.0 } as CoherenceScore)).toBe(false);
    });
  });

  describe('shouldRestrict', () => {
    it('should restrict when below warning threshold', () => {
      expect(scheduler.shouldRestrict({ overall: 0.49 } as CoherenceScore)).toBe(true);
    });

    it('should not restrict at or above warning threshold', () => {
      expect(scheduler.shouldRestrict({ overall: 0.5 } as CoherenceScore)).toBe(false);
      expect(scheduler.shouldRestrict({ overall: 0.9 } as CoherenceScore)).toBe(false);
    });
  });

  describe('getRecommendation', () => {
    it('should include escalation note for very high scores', () => {
      const score: CoherenceScore = {
        overall: 0.95,
        violationComponent: 0.95,
        reworkComponent: 0.95,
        driftComponent: 0.95,
        timestamp: Date.now(),
        windowSize: 10,
      };

      const rec = scheduler.getRecommendation(score);
      expect(rec).toContain('healthy');
      expect(rec).toContain('escalation');
    });

    it('should warn about violations when violation component is low', () => {
      const score: CoherenceScore = {
        overall: 0.65,
        violationComponent: 0.3,
        reworkComponent: 0.8,
        driftComponent: 0.85,
        timestamp: Date.now(),
        windowSize: 10,
      };

      const rec = scheduler.getRecommendation(score);
      expect(rec).toContain('violation');
      expect(rec).toContain('enforcement');
    });

    it('should warn about rework when rework component is low', () => {
      const score: CoherenceScore = {
        overall: 0.55,
        violationComponent: 0.8,
        reworkComponent: 0.3,
        driftComponent: 0.55,
        timestamp: Date.now(),
        windowSize: 10,
      };

      const rec = scheduler.getRecommendation(score);
      expect(rec).toContain('rework');
    });

    it('should warn about drift when drift component is low', () => {
      const score: CoherenceScore = {
        overall: 0.55,
        violationComponent: 0.8,
        reworkComponent: 0.8,
        driftComponent: 0.3,
        timestamp: Date.now(),
        windowSize: 10,
      };

      const rec = scheduler.getRecommendation(score);
      expect(rec).toContain('drift');
    });

    it('should mention suspension for very low scores', () => {
      const score: CoherenceScore = {
        overall: 0.1,
        violationComponent: 0.1,
        reworkComponent: 0.1,
        driftComponent: 0.1,
        timestamp: Date.now(),
        windowSize: 10,
      };

      const rec = scheduler.getRecommendation(score);
      expect(rec).toContain('suspended');
    });
  });

  describe('score history', () => {
    it('should cap history at 100 entries', () => {
      const metrics = createMockMetrics();
      const events = [createMockEvent()];

      for (let i = 0; i < 120; i++) {
        scheduler.computeCoherence(metrics, events);
      }

      expect(scheduler.getScoreHistory()).toHaveLength(100);
    });

    it('should preserve most recent scores when capped', () => {
      const events = [createMockEvent()];

      // First 50 with high violation rate
      for (let i = 0; i < 50; i++) {
        scheduler.computeCoherence(
          createMockMetrics({ violationRate: 8 }),
          events,
        );
      }

      // Next 70 with zero violation rate
      for (let i = 0; i < 70; i++) {
        scheduler.computeCoherence(
          createMockMetrics({ violationRate: 0 }),
          events,
        );
      }

      const history = scheduler.getScoreHistory();
      expect(history).toHaveLength(100);
      // The most recent entries should all have violationComponent = 1
      const last = history[history.length - 1];
      expect(last.violationComponent).toBe(1);
    });
  });

  describe('factory function', () => {
    it('should create a scheduler via createCoherenceScheduler', () => {
      const s = createCoherenceScheduler({ windowSize: 50 });
      expect(s).toBeInstanceOf(CoherenceScheduler);
    });

    it('should create a scheduler with defaults', () => {
      const s = createCoherenceScheduler();
      expect(s).toBeInstanceOf(CoherenceScheduler);
    });
  });
});

// ============================================================================
// EconomicGovernor Tests
// ============================================================================

describe('EconomicGovernor', () => {
  let governor: EconomicGovernor;

  beforeEach(() => {
    governor = new EconomicGovernor({
      tokenLimit: 10_000,
      toolCallLimit: 100,
      storageLimit: 1_000_000,
      timeLimit: 60_000, // 1 minute
      costPerToken: 0.00001,
      costPerToolCall: 0.001,
      costLimit: 1.0,
    });
  });

  describe('recordTokenUsage', () => {
    it('should accumulate token usage', () => {
      governor.recordTokenUsage(500);
      governor.recordTokenUsage(300);

      const usage = governor.getUsageSummary();
      expect(usage.tokens.used).toBe(800);
      expect(usage.tokens.limit).toBe(10_000);
      expect(usage.tokens.percentage).toBeCloseTo(8.0, 1);
    });
  });

  describe('recordToolCall', () => {
    it('should track tool calls', () => {
      governor.recordToolCall('Edit', 150);
      governor.recordToolCall('Read', 50);
      governor.recordToolCall('Bash', 1200);

      const usage = governor.getUsageSummary();
      expect(usage.toolCalls.used).toBe(3);
      expect(usage.toolCalls.limit).toBe(100);
      expect(usage.toolCalls.percentage).toBeCloseTo(3.0, 1);
    });
  });

  describe('recordStorageUsage', () => {
    it('should accumulate storage bytes', () => {
      governor.recordStorageUsage(50_000);
      governor.recordStorageUsage(25_000);

      const usage = governor.getUsageSummary();
      expect(usage.storage.usedBytes).toBe(75_000);
      expect(usage.storage.limitBytes).toBe(1_000_000);
      expect(usage.storage.percentage).toBeCloseTo(7.5, 1);
    });
  });

  describe('checkBudget', () => {
    it('should report within budget when usage is low', () => {
      governor.recordTokenUsage(100);
      governor.recordToolCall('Edit', 50);

      const result = governor.checkBudget();
      expect(result.withinBudget).toBe(true);
      expect(result.alerts).toHaveLength(0);
    });

    it('should emit NOTICE alert at 75% usage', () => {
      governor.recordTokenUsage(7_500); // 75% of 10,000

      const result = governor.checkBudget();
      expect(result.withinBudget).toBe(true);
      expect(result.alerts.some(a => a.includes('NOTICE') && a.includes('tokens'))).toBe(true);
    });

    it('should emit WARNING alert at 90% usage', () => {
      governor.recordTokenUsage(9_000); // 90%

      const result = governor.checkBudget();
      expect(result.withinBudget).toBe(true);
      expect(result.alerts.some(a => a.includes('WARNING') && a.includes('tokens'))).toBe(true);
    });

    it('should emit CRITICAL alert at 95% usage', () => {
      governor.recordTokenUsage(9_500); // 95%

      const result = governor.checkBudget();
      expect(result.withinBudget).toBe(true);
      expect(result.alerts.some(a => a.includes('CRITICAL') && a.includes('tokens'))).toBe(true);
    });

    it('should report budget exceeded at 100%', () => {
      governor.recordTokenUsage(10_001); // Over limit

      const result = governor.checkBudget();
      expect(result.withinBudget).toBe(false);
      expect(result.alerts.some(a => a.includes('BUDGET EXCEEDED') && a.includes('tokens'))).toBe(true);
    });

    it('should generate alerts for multiple dimensions simultaneously', () => {
      governor.recordTokenUsage(9_000); // 90% tokens
      for (let i = 0; i < 95; i++) {
        governor.recordToolCall('Edit', 10); // 95% tool calls
      }

      const result = governor.checkBudget();
      expect(result.alerts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('budget alerts', () => {
    it('should include cost alerts when cost exceeds thresholds', () => {
      // costPerToken = 0.00001, costLimit = 1.0
      // Need 75,000 tokens for 75% cost threshold ($0.75)
      governor.recordTokenUsage(75_000);

      const result = governor.checkBudget();
      expect(result.alerts.some(a => a.includes('cost'))).toBe(true);
    });
  });

  describe('getCostEstimate', () => {
    it('should compute cost from token usage', () => {
      governor.recordTokenUsage(1_000); // 1000 * 0.00001 = $0.01

      const estimate = governor.getCostEstimate();
      expect(estimate.totalCost).toBeCloseTo(0.01, 5);
      expect(estimate.breakdown.tokens).toBeCloseTo(0.01, 5);
    });

    it('should compute cost from tool call usage', () => {
      governor.recordToolCall('Edit', 100); // 1 * 0.001 = $0.001

      const estimate = governor.getCostEstimate();
      expect(estimate.breakdown.toolCalls).toBeCloseTo(0.001, 5);
    });

    it('should sum token and tool call costs', () => {
      governor.recordTokenUsage(1_000); // $0.01
      governor.recordToolCall('Edit', 100); // $0.001

      const estimate = governor.getCostEstimate();
      expect(estimate.totalCost).toBeCloseTo(0.011, 5);
    });

    it('should report zero cost with no usage', () => {
      const estimate = governor.getCostEstimate();
      expect(estimate.totalCost).toBe(0);
      expect(estimate.breakdown.tokens).toBe(0);
      expect(estimate.breakdown.toolCalls).toBe(0);
    });
  });

  describe('estimateRemainingCapacity', () => {
    it('should show full capacity at start', () => {
      const remaining = governor.estimateRemainingCapacity();
      expect(remaining.tokensRemaining).toBe(10_000);
      expect(remaining.callsRemaining).toBe(100);
      expect(remaining.timeRemainingMs).toBeLessThanOrEqual(60_000);
      expect(remaining.timeRemainingMs).toBeGreaterThan(59_000);
    });

    it('should decrease remaining tokens after usage', () => {
      governor.recordTokenUsage(4_000);

      const remaining = governor.estimateRemainingCapacity();
      expect(remaining.tokensRemaining).toBe(6_000);
    });

    it('should decrease remaining calls after usage', () => {
      for (let i = 0; i < 30; i++) {
        governor.recordToolCall('Edit', 10);
      }

      const remaining = governor.estimateRemainingCapacity();
      expect(remaining.callsRemaining).toBe(70);
    });

    it('should not go below zero', () => {
      governor.recordTokenUsage(20_000); // way over limit

      const remaining = governor.estimateRemainingCapacity();
      expect(remaining.tokensRemaining).toBe(0);
    });
  });

  describe('resetPeriod', () => {
    it('should reset all counters', () => {
      governor.recordTokenUsage(5_000);
      governor.recordToolCall('Edit', 100);
      governor.recordStorageUsage(500_000);

      governor.resetPeriod();

      const usage = governor.getUsageSummary();
      expect(usage.tokens.used).toBe(0);
      expect(usage.toolCalls.used).toBe(0);
      expect(usage.storage.usedBytes).toBe(0);
    });

    it('should reset cost estimate to zero', () => {
      governor.recordTokenUsage(5_000);
      governor.recordToolCall('Edit', 100);

      governor.resetPeriod();

      const estimate = governor.getCostEstimate();
      expect(estimate.totalCost).toBe(0);
    });

    it('should reset time tracking', () => {
      governor.resetPeriod();

      const usage = governor.getUsageSummary();
      // Time should be near zero since we just reset
      expect(usage.time.usedMs).toBeLessThan(100);
    });

    it('should allow budget to pass again after reset', () => {
      governor.recordTokenUsage(10_001); // Over limit
      expect(governor.checkBudget().withinBudget).toBe(false);

      governor.resetPeriod();
      expect(governor.checkBudget().withinBudget).toBe(true);
    });
  });

  describe('factory function', () => {
    it('should create a governor via createEconomicGovernor', () => {
      const g = createEconomicGovernor({ tokenLimit: 50_000 });
      expect(g).toBeInstanceOf(EconomicGovernor);
    });

    it('should create a governor with defaults', () => {
      const g = createEconomicGovernor();
      expect(g).toBeInstanceOf(EconomicGovernor);

      // Default token limit is 1,000,000
      const usage = g.getUsageSummary();
      expect(usage.tokens.limit).toBe(1_000_000);
    });
  });

  describe('getUsageSummary', () => {
    it('should return complete usage breakdown', () => {
      governor.recordTokenUsage(2_000);
      governor.recordToolCall('Edit', 50);
      governor.recordStorageUsage(100_000);

      const usage = governor.getUsageSummary();

      expect(usage.tokens.used).toBe(2_000);
      expect(usage.tokens.limit).toBe(10_000);
      expect(usage.tokens.percentage).toBeCloseTo(20.0, 1);

      expect(usage.toolCalls.used).toBe(1);
      expect(usage.toolCalls.limit).toBe(100);
      expect(usage.toolCalls.percentage).toBeCloseTo(1.0, 1);

      expect(usage.storage.usedBytes).toBe(100_000);
      expect(usage.storage.limitBytes).toBe(1_000_000);
      expect(usage.storage.percentage).toBeCloseTo(10.0, 1);

      expect(usage.time.limitMs).toBe(60_000);
      expect(usage.time.usedMs).toBeGreaterThanOrEqual(0);

      expect(usage.cost.totalUsd).toBeGreaterThan(0);
      expect(usage.cost.limitUsd).toBe(1.0);
    });
  });
});
