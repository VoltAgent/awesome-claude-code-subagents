/**
 * Tests for the Optimizer Loop
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OptimizerLoop } from '../src/optimizer.js';
import { RunLedger } from '../src/ledger.js';
import { GuidanceCompiler } from '../src/compiler.js';
import type { PolicyBundle, RunEvent, Violation } from '../src/types.js';

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

describe('OptimizerLoop', () => {
  let optimizer: OptimizerLoop;
  let ledger: RunLedger;
  let bundle: PolicyBundle;

  beforeEach(() => {
    optimizer = new OptimizerLoop({
      minEventsForOptimization: 5,
      topViolationsPerCycle: 2,
    });

    ledger = new RunLedger();

    const compiler = new GuidanceCompiler();
    bundle = compiler.compile(`
# Safety Invariants
- [R001] Never commit secrets (critical) @security
- [R002] Always validate input (critical) @security

# Architecture
- [R010] Keep files under 500 lines @architecture
- [R011] Use typed interfaces @architecture
`);
  });

  describe('runCycle', () => {
    it('should return empty results with no violations', async () => {
      // Add clean events
      for (let i = 0; i < 10; i++) {
        ledger.logEvent(createMockEvent());
      }

      const result = await optimizer.runCycle(ledger, bundle);
      expect(result.rankings).toEqual([]);
      expect(result.changes).toEqual([]);
      expect(result.promoted).toEqual([]);
    });

    it('should propose changes for top violations', async () => {
      // Add events with violations
      const violation: Violation = {
        ruleId: 'R010',
        description: 'File exceeds 500 lines',
        severity: 'medium',
        autoCorrected: false,
      };

      for (let i = 0; i < 10; i++) {
        ledger.logEvent(createMockEvent({
          violations: i < 6 ? [violation] : [],
          reworkLines: i < 6 ? 20 : 2,
        }));
      }

      const result = await optimizer.runCycle(ledger, bundle);

      expect(result.rankings.length).toBeGreaterThan(0);
      expect(result.rankings[0].ruleId).toBe('R010');
      expect(result.changes.length).toBeGreaterThan(0);
    });

    it('should create ADRs for each evaluated change', async () => {
      const violation: Violation = {
        ruleId: 'R010',
        description: 'File size violation',
        severity: 'medium',
        autoCorrected: false,
      };

      for (let i = 0; i < 10; i++) {
        ledger.logEvent(createMockEvent({
          violations: [violation],
          reworkLines: 30,
        }));
      }

      const result = await optimizer.runCycle(ledger, bundle);

      expect(result.adrs.length).toBeGreaterThan(0);
      expect(result.adrs[0].number).toBe(1);
      expect(result.adrs[0].title).toBeDefined();
      expect(result.adrs[0].rationale).toBeDefined();
    });
  });

  describe('proposeChanges', () => {
    it('should propose modifications for existing rules', () => {
      const rankings = [
        { ruleId: 'R010', frequency: 10, cost: 25, score: 250 },
      ];

      const changes = optimizer.proposeChanges(rankings, bundle);
      expect(changes.length).toBe(1);
      expect(changes[0].targetRuleId).toBe('R010');
      expect(changes[0].changeType).toBe('modify');
    });

    it('should propose new rules for unmatched violations', () => {
      const rankings = [
        { ruleId: 'NEW-001', frequency: 5, cost: 15, score: 75 },
      ];

      const changes = optimizer.proposeChanges(rankings, bundle);
      expect(changes.length).toBe(1);
      expect(changes[0].changeType).toBe('add');
    });
  });

  describe('evaluateChange', () => {
    it('should evaluate change against baseline', () => {
      for (let i = 0; i < 10; i++) {
        ledger.logEvent(createMockEvent({ reworkLines: 20 }));
      }

      const baseline = ledger.computeMetrics();
      const change = {
        changeId: 'change-1',
        targetRuleId: 'R010',
        changeType: 'modify' as const,
        originalText: 'Old rule text',
        proposedText: 'New improved rule text',
        rationale: 'Test change',
        triggeringViolation: { ruleId: 'R010', frequency: 5, cost: 20, score: 100 },
      };

      const result = optimizer.evaluateChange(change, baseline, ledger);
      expect(result.baseline).toBeDefined();
      expect(result.candidate).toBeDefined();
      expect(typeof result.shouldPromote).toBe('boolean');
      expect(result.reason).toBeDefined();
    });
  });

  describe('applyPromotions', () => {
    it('should move promoted shards to constitution', () => {
      // Find a shard rule ID
      const shardRuleId = bundle.shards[0]?.rule.id;
      if (!shardRuleId) return;

      const changes = [{
        changeId: 'c-1',
        targetRuleId: shardRuleId,
        changeType: 'promote' as const,
        proposedText: 'Promoted rule',
        rationale: 'Won twice',
        triggeringViolation: { ruleId: shardRuleId, frequency: 3, cost: 10, score: 30 },
      }];

      const newBundle = optimizer.applyPromotions(bundle, [shardRuleId], changes);

      // Constitution should have the promoted rule
      const promotedRule = newBundle.constitution.rules.find(r => r.id === shardRuleId);
      expect(promotedRule).toBeDefined();
      expect(promotedRule!.isConstitution).toBe(true);

      // Shards should not have the promoted rule
      const shardRule = newBundle.shards.find(s => s.rule.id === shardRuleId);
      expect(shardRule).toBeUndefined();
    });
  });

  describe('ADR tracking', () => {
    it('should track ADR history', async () => {
      const violation: Violation = {
        ruleId: 'R010',
        description: 'test',
        severity: 'medium',
        autoCorrected: false,
      };

      for (let i = 0; i < 10; i++) {
        ledger.logEvent(createMockEvent({ violations: [violation], reworkLines: 20 }));
      }

      await optimizer.runCycle(ledger, bundle);
      const adrs = optimizer.getADRs();
      expect(adrs.length).toBeGreaterThan(0);
    });
  });

  describe('promotion tracking', () => {
    it('should track win counts for promotion', async () => {
      const violation: Violation = {
        ruleId: 'R010',
        description: 'test',
        severity: 'medium',
        autoCorrected: false,
      };

      // Run multiple cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        for (let i = 0; i < 10; i++) {
          ledger.logEvent(createMockEvent({ violations: [violation], reworkLines: 20 }));
        }
        await optimizer.runCycle(ledger, bundle);
      }

      const tracker = optimizer.getPromotionTracker();
      // R010 should have some win counts
      expect(tracker.size).toBeGreaterThan(0);
    });
  });
});
