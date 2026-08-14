/**
 * Tests for Run Ledger and Evaluators
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RunLedger,
  TestsPassEvaluator,
  ForbiddenCommandEvaluator,
  ViolationRateEvaluator,
  DiffQualityEvaluator,
} from '../src/ledger.js';
import type { RunEvent, Violation } from '../src/types.js';

function createMockEvent(overrides: Partial<RunEvent> = {}): RunEvent {
  return {
    eventId: 'evt-1',
    taskId: 'task-1',
    guidanceHash: 'abc123',
    retrievedRuleIds: ['R001', 'R002'],
    toolsUsed: ['Read', 'Edit', 'Bash'],
    filesTouched: ['src/main.ts', 'src/utils.ts'],
    diffSummary: { linesAdded: 50, linesRemoved: 10, filesChanged: 2 },
    testResults: { ran: true, passed: 10, failed: 0, skipped: 1 },
    violations: [],
    outcomeAccepted: true,
    reworkLines: 5,
    intent: 'feature',
    timestamp: Date.now(),
    durationMs: 5000,
    ...overrides,
  };
}

describe('RunLedger', () => {
  let ledger: RunLedger;

  beforeEach(() => {
    ledger = new RunLedger();
  });

  describe('event logging', () => {
    it('should log events', () => {
      const event = createMockEvent();
      ledger.logEvent(event);
      expect(ledger.eventCount).toBe(1);
    });

    it('should assign unique event IDs', () => {
      const event1 = createMockEvent();
      const event2 = createMockEvent({ taskId: 'task-2' });
      const logged1 = ledger.logEvent(event1);
      const logged2 = ledger.logEvent(event2);
      expect(logged1.eventId).not.toBe(logged2.eventId);
    });

    it('should create events with defaults', () => {
      const event = ledger.createEvent('task-1', 'feature', 'hash-1');
      expect(event.taskId).toBe('task-1');
      expect(event.intent).toBe('feature');
      expect(event.guidanceHash).toBe('hash-1');
      expect(event.toolsUsed).toEqual([]);
      expect(event.violations).toEqual([]);
    });

    it('should finalize events with duration', () => {
      const event = ledger.createEvent('task-1', 'feature', 'hash-1');
      // Wait a tiny bit
      const finalized = ledger.finalizeEvent(event);
      expect(finalized.durationMs).toBeGreaterThanOrEqual(0);
      expect(ledger.eventCount).toBe(1);
    });
  });

  describe('event retrieval', () => {
    it('should get events by task ID', () => {
      ledger.logEvent(createMockEvent({ taskId: 'task-1' }));
      ledger.logEvent(createMockEvent({ taskId: 'task-2' }));
      ledger.logEvent(createMockEvent({ taskId: 'task-1' }));

      const events = ledger.getEventsByTask('task-1');
      expect(events.length).toBe(2);
    });

    it('should get recent events', () => {
      for (let i = 0; i < 10; i++) {
        ledger.logEvent(createMockEvent({ taskId: `task-${i}` }));
      }

      const recent = ledger.getRecentEvents(3);
      expect(recent.length).toBe(3);
    });

    it('should get events in time range', () => {
      const now = Date.now();
      ledger.logEvent(createMockEvent({ timestamp: now - 5000 }));
      ledger.logEvent(createMockEvent({ timestamp: now - 3000 }));
      ledger.logEvent(createMockEvent({ timestamp: now - 1000 }));
      ledger.logEvent(createMockEvent({ timestamp: now + 1000 })); // future

      const events = ledger.getEventsInRange(now - 4000, now);
      expect(events.length).toBe(2);
    });
  });

  describe('metrics computation', () => {
    it('should compute violation rate per 10 tasks', () => {
      // 5 tasks, 3 violations total = 6.0 per 10 tasks
      for (let i = 0; i < 5; i++) {
        const violations: Violation[] = i < 3
          ? [{ ruleId: 'R001', description: 'test', severity: 'medium', autoCorrected: false }]
          : [];
        ledger.logEvent(createMockEvent({ violations }));
      }

      const metrics = ledger.computeMetrics();
      expect(metrics.violationRate).toBe(6);
      expect(metrics.taskCount).toBe(5);
    });

    it('should compute self-correction rate', () => {
      ledger.logEvent(createMockEvent({
        violations: [
          { ruleId: 'R001', description: 'a', severity: 'medium', autoCorrected: true },
          { ruleId: 'R002', description: 'b', severity: 'medium', autoCorrected: false },
        ],
      }));

      const metrics = ledger.computeMetrics();
      expect(metrics.selfCorrectionRate).toBe(0.5); // 1 of 2 corrected
    });

    it('should compute average rework lines', () => {
      ledger.logEvent(createMockEvent({ reworkLines: 10 }));
      ledger.logEvent(createMockEvent({ reworkLines: 20 }));
      ledger.logEvent(createMockEvent({ reworkLines: 30 }));

      const metrics = ledger.computeMetrics();
      expect(metrics.reworkLines).toBe(20);
    });

    it('should handle empty ledger', () => {
      const metrics = ledger.computeMetrics();
      expect(metrics.violationRate).toBe(0);
      expect(metrics.taskCount).toBe(0);
    });
  });

  describe('violation ranking', () => {
    it('should rank violations by frequency and cost', () => {
      // R001 violated 3 times, R002 violated 1 time
      ledger.logEvent(createMockEvent({
        violations: [{ ruleId: 'R001', description: 'a', severity: 'high', autoCorrected: false }],
        reworkLines: 20,
      }));
      ledger.logEvent(createMockEvent({
        violations: [{ ruleId: 'R001', description: 'a', severity: 'high', autoCorrected: false }],
        reworkLines: 30,
      }));
      ledger.logEvent(createMockEvent({
        violations: [
          { ruleId: 'R001', description: 'a', severity: 'high', autoCorrected: false },
          { ruleId: 'R002', description: 'b', severity: 'medium', autoCorrected: false },
        ],
        reworkLines: 10,
      }));

      const rankings = ledger.rankViolations();
      expect(rankings.length).toBe(2);
      expect(rankings[0].ruleId).toBe('R001');
      expect(rankings[0].frequency).toBe(3);
    });
  });

  describe('export/import', () => {
    it('should export and import events', () => {
      ledger.logEvent(createMockEvent({ taskId: 'task-1' }));
      ledger.logEvent(createMockEvent({ taskId: 'task-2' }));

      const exported = ledger.exportEvents();
      expect(exported.length).toBe(2);

      const newLedger = new RunLedger();
      newLedger.importEvents(exported);
      expect(newLedger.eventCount).toBe(2);
    });
  });
});

describe('Evaluators', () => {
  describe('TestsPassEvaluator', () => {
    const evaluator = new TestsPassEvaluator();

    it('should pass when all tests pass', async () => {
      const event = createMockEvent({
        testResults: { ran: true, passed: 10, failed: 0, skipped: 0 },
      });
      const result = await evaluator.evaluate(event);
      expect(result.passed).toBe(true);
    });

    it('should fail when tests fail', async () => {
      const event = createMockEvent({
        testResults: { ran: true, passed: 8, failed: 2, skipped: 0 },
      });
      const result = await evaluator.evaluate(event);
      expect(result.passed).toBe(false);
    });

    it('should fail when tests not run', async () => {
      const event = createMockEvent({
        testResults: { ran: false, passed: 0, failed: 0, skipped: 0 },
      });
      const result = await evaluator.evaluate(event);
      expect(result.passed).toBe(false);
    });
  });

  describe('ForbiddenCommandEvaluator', () => {
    const evaluator = new ForbiddenCommandEvaluator();

    it('should pass for clean tools', async () => {
      const event = createMockEvent({ toolsUsed: ['Read', 'Edit', 'Write'] });
      const result = await evaluator.evaluate(event);
      expect(result.passed).toBe(true);
    });

    it('should fail for forbidden commands', async () => {
      const event = createMockEvent({ toolsUsed: ['rm -rf /'] });
      const result = await evaluator.evaluate(event);
      expect(result.passed).toBe(false);
    });
  });

  describe('ViolationRateEvaluator', () => {
    const evaluator = new ViolationRateEvaluator(2);

    it('should pass within threshold', async () => {
      const event = createMockEvent({
        violations: [
          { ruleId: 'R001', description: 'a', severity: 'low', autoCorrected: false },
        ],
      });
      const result = await evaluator.evaluate(event);
      expect(result.passed).toBe(true);
    });

    it('should fail above threshold', async () => {
      const event = createMockEvent({
        violations: [
          { ruleId: 'R001', description: 'a', severity: 'low', autoCorrected: false },
          { ruleId: 'R002', description: 'b', severity: 'low', autoCorrected: false },
          { ruleId: 'R003', description: 'c', severity: 'low', autoCorrected: false },
        ],
      });
      const result = await evaluator.evaluate(event);
      expect(result.passed).toBe(false);
    });
  });

  describe('DiffQualityEvaluator', () => {
    const evaluator = new DiffQualityEvaluator(0.3);

    it('should pass for low rework ratio', async () => {
      const event = createMockEvent({
        diffSummary: { linesAdded: 100, linesRemoved: 0, filesChanged: 1 },
        reworkLines: 10,
      });
      const result = await evaluator.evaluate(event);
      expect(result.passed).toBe(true);
    });

    it('should fail for high rework ratio', async () => {
      const event = createMockEvent({
        diffSummary: { linesAdded: 100, linesRemoved: 0, filesChanged: 1 },
        reworkLines: 50,
      });
      const result = await evaluator.evaluate(event);
      expect(result.passed).toBe(false);
    });
  });
});
