import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  type TrustTier,
  type GateOutcome,
  type TrustConfig,
  type TrustRecord,
  type TrustSnapshot,
  TrustAccumulator,
  TrustLedger,
  TrustSystem,
  getTrustBasedRateLimit,
  createTrustAccumulator,
  createTrustLedger,
  createTrustSystem,
} from '../src/trust.ts';

// ============================================================================
// Standalone getTrustBasedRateLimit Function Tests
// ============================================================================

describe('getTrustBasedRateLimit()', () => {
  it('should return 2x base limit for trusted tier (score >= 0.8)', () => {
    expect(getTrustBasedRateLimit(0.8, 100)).toBe(200);
    expect(getTrustBasedRateLimit(0.9, 100)).toBe(200);
    expect(getTrustBasedRateLimit(1.0, 100)).toBe(200);
  });

  it('should return 1x base limit for standard tier (0.5 <= score < 0.8)', () => {
    expect(getTrustBasedRateLimit(0.5, 100)).toBe(100);
    expect(getTrustBasedRateLimit(0.6, 100)).toBe(100);
    expect(getTrustBasedRateLimit(0.79, 100)).toBe(100);
  });

  it('should return 0.5x base limit for probation tier (0.3 <= score < 0.5)', () => {
    expect(getTrustBasedRateLimit(0.3, 100)).toBe(50);
    expect(getTrustBasedRateLimit(0.4, 100)).toBe(50);
    expect(getTrustBasedRateLimit(0.49, 100)).toBe(50);
  });

  it('should return 0.1x base limit for untrusted tier (score < 0.3)', () => {
    expect(getTrustBasedRateLimit(0.0, 100)).toBe(10);
    expect(getTrustBasedRateLimit(0.1, 100)).toBe(10);
    expect(getTrustBasedRateLimit(0.29, 100)).toBe(10);
  });

  it('should floor the result to an integer', () => {
    expect(getTrustBasedRateLimit(0.8, 15)).toBe(30); // 15 * 2.0 = 30
    expect(getTrustBasedRateLimit(0.3, 15)).toBe(7); // 15 * 0.5 = 7.5 -> 7
    expect(getTrustBasedRateLimit(0.1, 15)).toBe(1); // 15 * 0.1 = 1.5 -> 1
  });

  it('should handle edge case scores', () => {
    expect(getTrustBasedRateLimit(0.0, 100)).toBe(10);
    expect(getTrustBasedRateLimit(1.0, 100)).toBe(200);
  });
});

// ============================================================================
// TrustAccumulator Tests
// ============================================================================

describe('TrustAccumulator', () => {
  let accumulator: TrustAccumulator;

  beforeEach(() => {
    accumulator = new TrustAccumulator();
  });

  // ===== Constructor & Configuration =====

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const config = accumulator.getConfig();
      expect(config.initialTrust).toBe(0.5);
      expect(config.allowDelta).toBe(0.01);
      expect(config.denyDelta).toBe(-0.05);
      expect(config.warnDelta).toBe(-0.02);
      expect(config.decayRate).toBe(0.01);
      expect(config.decayIntervalMs).toBe(60_000);
    });

    it('should accept custom config', () => {
      const custom = new TrustAccumulator({
        initialTrust: 0.7,
        allowDelta: 0.02,
        denyDelta: -0.1,
      });
      const config = custom.getConfig();
      expect(config.initialTrust).toBe(0.7);
      expect(config.allowDelta).toBe(0.02);
      expect(config.denyDelta).toBe(-0.1);
      expect(config.warnDelta).toBe(-0.02); // default
    });
  });

  // ===== Initial State =====

  describe('initial state', () => {
    it('should return initialTrust for unknown agents', () => {
      expect(accumulator.getScore('agent-1')).toBe(0.5);
    });

    it('should return "standard" tier for new agents', () => {
      expect(accumulator.getTier('agent-1')).toBe('standard');
    });

    it('should have zero agents initially', () => {
      expect(accumulator.agentCount).toBe(0);
      expect(accumulator.getAgentIds()).toEqual([]);
    });
  });

  // ===== recordOutcome() =====

  describe('recordOutcome()', () => {
    it('should increase score by +0.01 on "allow"', () => {
      const record = accumulator.recordOutcome('agent-1', 'allow', 'test allow');
      expect(record.previousScore).toBe(0.5);
      expect(record.newScore).toBe(0.51);
      expect(record.delta).toBe(0.01);
      expect(record.gateDecision).toBe('allow');
      expect(record.reason).toBe('test allow');
      expect(accumulator.getScore('agent-1')).toBe(0.51);
    });

    it('should decrease score by -0.05 on "deny"', () => {
      const record = accumulator.recordOutcome('agent-1', 'deny', 'test deny');
      expect(record.previousScore).toBe(0.5);
      expect(record.newScore).toBe(0.45);
      expect(record.delta).toBe(-0.05);
      expect(record.gateDecision).toBe('deny');
      expect(accumulator.getScore('agent-1')).toBe(0.45);
    });

    it('should decrease score by -0.02 on "warn"', () => {
      const record = accumulator.recordOutcome('agent-1', 'warn', 'test warn');
      expect(record.previousScore).toBe(0.5);
      expect(record.newScore).toBe(0.48);
      expect(record.delta).toBe(-0.02);
      expect(record.gateDecision).toBe('warn');
      expect(accumulator.getScore('agent-1')).toBe(0.48);
    });

    it('should include timestamp in record', () => {
      const before = Date.now();
      const record = accumulator.recordOutcome('agent-1', 'allow', 'test');
      const after = Date.now();
      expect(record.timestamp).toBeGreaterThanOrEqual(before);
      expect(record.timestamp).toBeLessThanOrEqual(after);
    });

    it('should increment totalEvents counter', () => {
      accumulator.recordOutcome('agent-1', 'allow', 'first');
      accumulator.recordOutcome('agent-1', 'deny', 'second');
      const snapshot = accumulator.getSnapshot('agent-1');
      expect(snapshot.totalEvents).toBe(2);
    });
  });

  // ===== Score Clamping =====

  describe('score clamping', () => {
    it('should clamp score at 1.0 maximum', () => {
      accumulator.setScore('agent-1', 0.99);
      accumulator.recordOutcome('agent-1', 'allow', 'push over 1.0');
      expect(accumulator.getScore('agent-1')).toBe(1.0);
    });

    it('should clamp score at 0.0 minimum', () => {
      accumulator.setScore('agent-1', 0.02);
      accumulator.recordOutcome('agent-1', 'deny', 'push below 0.0');
      expect(accumulator.getScore('agent-1')).toBe(0.0);
    });

    it('should handle multiple denies without going negative', () => {
      let score = 0.5;
      for (let i = 0; i < 15; i++) {
        accumulator.recordOutcome('agent-1', 'deny', `deny ${i}`);
      }
      expect(accumulator.getScore('agent-1')).toBe(0.0);
      expect(accumulator.getScore('agent-1')).toBeGreaterThanOrEqual(0.0);
    });

    it('should handle multiple allows without exceeding 1.0', () => {
      for (let i = 0; i < 100; i++) {
        accumulator.recordOutcome('agent-1', 'allow', `allow ${i}`);
      }
      expect(accumulator.getScore('agent-1')).toBe(1.0);
      expect(accumulator.getScore('agent-1')).toBeLessThanOrEqual(1.0);
    });
  });

  // ===== Tier Transitions =====

  describe('tier transitions', () => {
    it('should transition from standard to trusted at 0.8', () => {
      accumulator.setScore('agent-1', 0.79);
      expect(accumulator.getTier('agent-1')).toBe('standard');
      accumulator.recordOutcome('agent-1', 'allow', 'cross threshold');
      expect(accumulator.getTier('agent-1')).toBe('trusted');
    });

    it('should transition from standard to probation below 0.5', () => {
      accumulator.setScore('agent-1', 0.5);
      expect(accumulator.getTier('agent-1')).toBe('standard');
      accumulator.recordOutcome('agent-1', 'deny', 'drop to probation');
      expect(accumulator.getTier('agent-1')).toBe('probation');
    });

    it('should transition from probation to untrusted below 0.3', () => {
      accumulator.setScore('agent-1', 0.3);
      expect(accumulator.getTier('agent-1')).toBe('probation');
      accumulator.recordOutcome('agent-1', 'deny', 'drop to untrusted');
      expect(accumulator.getTier('agent-1')).toBe('untrusted');
    });

    it('should maintain correct tier at exact thresholds', () => {
      accumulator.setScore('agent-1', 0.8);
      expect(accumulator.getTier('agent-1')).toBe('trusted');

      accumulator.setScore('agent-2', 0.5);
      expect(accumulator.getTier('agent-2')).toBe('standard');

      accumulator.setScore('agent-3', 0.3);
      expect(accumulator.getTier('agent-3')).toBe('probation');

      accumulator.setScore('agent-4', 0.29);
      expect(accumulator.getTier('agent-4')).toBe('untrusted');
    });
  });

  // ===== getTrustBasedRateLimit() Method =====

  describe('getTrustBasedRateLimit()', () => {
    it('should return 2x for trusted agents', () => {
      accumulator.setScore('agent-1', 0.9);
      expect(accumulator.getTrustBasedRateLimit('agent-1', 100)).toBe(200);
    });

    it('should return 1x for standard agents', () => {
      accumulator.setScore('agent-1', 0.6);
      expect(accumulator.getTrustBasedRateLimit('agent-1', 100)).toBe(100);
    });

    it('should return 0.5x for probation agents', () => {
      accumulator.setScore('agent-1', 0.4);
      expect(accumulator.getTrustBasedRateLimit('agent-1', 100)).toBe(50);
    });

    it('should return 0.1x for untrusted agents', () => {
      accumulator.setScore('agent-1', 0.2);
      expect(accumulator.getTrustBasedRateLimit('agent-1', 100)).toBe(10);
    });

    it('should use initialTrust for unknown agents', () => {
      // Default initialTrust is 0.5 (standard tier = 1x)
      expect(accumulator.getTrustBasedRateLimit('unknown', 100)).toBe(100);
    });
  });

  // ===== setScore() =====

  describe('setScore()', () => {
    it('should manually override an agent\'s score', () => {
      accumulator.setScore('agent-1', 0.75);
      expect(accumulator.getScore('agent-1')).toBe(0.75);
    });

    it('should clamp manually set scores to [0, 1]', () => {
      accumulator.setScore('agent-1', 1.5);
      expect(accumulator.getScore('agent-1')).toBe(1.0);

      accumulator.setScore('agent-2', -0.3);
      expect(accumulator.getScore('agent-2')).toBe(0.0);
    });

    it('should update lastUpdated timestamp', () => {
      const before = Date.now();
      accumulator.setScore('agent-1', 0.6);
      const snapshot = accumulator.getSnapshot('agent-1');
      expect(snapshot.lastUpdated).toBeGreaterThanOrEqual(before);
    });
  });

  // ===== removeAgent() =====

  describe('removeAgent()', () => {
    it('should remove an agent and return true', () => {
      accumulator.recordOutcome('agent-1', 'allow', 'create agent');
      expect(accumulator.agentCount).toBe(1);

      const result = accumulator.removeAgent('agent-1');
      expect(result).toBe(true);
      expect(accumulator.agentCount).toBe(0);
    });

    it('should return false for non-existent agent', () => {
      const result = accumulator.removeAgent('non-existent');
      expect(result).toBe(false);
    });

    it('should reset agent to initial state after removal', () => {
      accumulator.setScore('agent-1', 0.9);
      accumulator.removeAgent('agent-1');
      expect(accumulator.getScore('agent-1')).toBe(0.5); // initialTrust
    });
  });

  // ===== getSnapshot() =====

  describe('getSnapshot()', () => {
    it('should return a complete snapshot for tracked agent', () => {
      accumulator.recordOutcome('agent-1', 'allow', 'test');
      const snapshot = accumulator.getSnapshot('agent-1');

      expect(snapshot.agentId).toBe('agent-1');
      expect(snapshot.score).toBe(0.51);
      expect(snapshot.tier).toBe('standard');
      expect(snapshot.totalEvents).toBe(1);
      expect(snapshot.lastUpdated).toBeGreaterThan(0);
    });

    it('should return default snapshot for unknown agent', () => {
      const snapshot = accumulator.getSnapshot('unknown');

      expect(snapshot.agentId).toBe('unknown');
      expect(snapshot.score).toBe(0.5); // initialTrust
      expect(snapshot.tier).toBe('standard');
      expect(snapshot.totalEvents).toBe(0);
      expect(snapshot.lastUpdated).toBe(0);
    });
  });

  // ===== getAllSnapshots() =====

  describe('getAllSnapshots()', () => {
    it('should return empty array when no agents tracked', () => {
      expect(accumulator.getAllSnapshots()).toEqual([]);
    });

    it('should return snapshots for all tracked agents', () => {
      accumulator.recordOutcome('agent-1', 'allow', 'test 1');
      accumulator.recordOutcome('agent-2', 'deny', 'test 2');
      accumulator.recordOutcome('agent-3', 'warn', 'test 3');

      const snapshots = accumulator.getAllSnapshots();
      expect(snapshots).toHaveLength(3);

      const ids = snapshots.map(s => s.agentId).sort();
      expect(ids).toEqual(['agent-1', 'agent-2', 'agent-3']);
    });
  });

  // ===== getAgentIds() =====

  describe('getAgentIds()', () => {
    it('should return empty array when no agents tracked', () => {
      expect(accumulator.getAgentIds()).toEqual([]);
    });

    it('should return all tracked agent IDs', () => {
      accumulator.recordOutcome('agent-1', 'allow', 'test');
      accumulator.recordOutcome('agent-2', 'deny', 'test');

      const ids = accumulator.getAgentIds().sort();
      expect(ids).toEqual(['agent-1', 'agent-2']);
    });
  });

  // ===== agentCount =====

  describe('agentCount', () => {
    it('should return 0 initially', () => {
      expect(accumulator.agentCount).toBe(0);
    });

    it('should increment as agents are added', () => {
      accumulator.recordOutcome('agent-1', 'allow', 'test');
      expect(accumulator.agentCount).toBe(1);

      accumulator.recordOutcome('agent-2', 'deny', 'test');
      expect(accumulator.agentCount).toBe(2);
    });

    it('should not double-count same agent', () => {
      accumulator.recordOutcome('agent-1', 'allow', 'test 1');
      accumulator.recordOutcome('agent-1', 'allow', 'test 2');
      expect(accumulator.agentCount).toBe(1);
    });
  });

  // ===== clear() =====

  describe('clear()', () => {
    it('should remove all tracked agents', () => {
      accumulator.recordOutcome('agent-1', 'allow', 'test');
      accumulator.recordOutcome('agent-2', 'deny', 'test');
      expect(accumulator.agentCount).toBe(2);

      accumulator.clear();
      expect(accumulator.agentCount).toBe(0);
      expect(accumulator.getAgentIds()).toEqual([]);
    });

    it('should reset to initial state after clear', () => {
      accumulator.setScore('agent-1', 0.9);
      accumulator.clear();
      expect(accumulator.getScore('agent-1')).toBe(0.5); // initialTrust
    });
  });

  // ===== Decay Behavior =====

  describe('decay behavior', () => {
    it('should apply decay toward initialTrust after decay interval', () => {
      vi.useFakeTimers();

      accumulator.setScore('agent-1', 0.9);
      expect(accumulator.getScore('agent-1')).toBe(0.9);

      // Advance time by 60 seconds (one decay interval)
      vi.advanceTimersByTime(60_000);

      // Decay formula: score + (initialTrust - score) * (1 - retainFactor)
      // retainFactor = (1 - 0.01)^1 = 0.99
      // expected = 0.5 + (0.9 - 0.5) * 0.99 = 0.5 + 0.396 = 0.896
      const score = accumulator.getScore('agent-1');
      expect(score).toBeCloseTo(0.896, 3);

      vi.useRealTimers();
    });

    it('should not decay before decay interval', () => {
      vi.useFakeTimers();

      accumulator.setScore('agent-1', 0.9);
      expect(accumulator.getScore('agent-1')).toBe(0.9);

      // Advance time by 30 seconds (half interval)
      vi.advanceTimersByTime(30_000);

      const score = accumulator.getScore('agent-1');
      expect(score).toBe(0.9); // No decay yet

      vi.useRealTimers();
    });

    it('should apply multiple decay intervals correctly', () => {
      vi.useFakeTimers();

      accumulator.setScore('agent-1', 1.0);

      // Advance time by 3 minutes (3 intervals)
      vi.advanceTimersByTime(180_000);

      // retainFactor = (1 - 0.01)^3 = 0.99^3 ≈ 0.9703
      // expected = 0.5 + (1.0 - 0.5) * 0.9703 = 0.5 + 0.48515 = 0.98515
      const score = accumulator.getScore('agent-1');
      expect(score).toBeCloseTo(0.98515, 3);

      vi.useRealTimers();
    });

    it('should apply decay before recording outcome', () => {
      vi.useFakeTimers();

      accumulator.setScore('agent-1', 0.9);

      // Advance time by 60 seconds
      vi.advanceTimersByTime(60_000);

      // Record outcome (should apply decay first, then delta)
      const record = accumulator.recordOutcome('agent-1', 'allow', 'test');

      // Decay happened first: 0.896, then +0.01 = 0.906
      expect(record.previousScore).toBeCloseTo(0.896, 3);
      expect(record.newScore).toBeCloseTo(0.906, 3);

      vi.useRealTimers();
    });
  });

  // ===== Multiple Agents =====

  describe('multiple agents', () => {
    it('should track multiple agents independently', () => {
      accumulator.recordOutcome('agent-1', 'allow', 'test 1');
      accumulator.recordOutcome('agent-2', 'deny', 'test 2');
      accumulator.recordOutcome('agent-3', 'warn', 'test 3');

      expect(accumulator.getScore('agent-1')).toBe(0.51);
      expect(accumulator.getScore('agent-2')).toBe(0.45);
      expect(accumulator.getScore('agent-3')).toBe(0.48);
    });

    it('should maintain separate event counters per agent', () => {
      accumulator.recordOutcome('agent-1', 'allow', 'event 1');
      accumulator.recordOutcome('agent-1', 'allow', 'event 2');
      accumulator.recordOutcome('agent-2', 'deny', 'event 1');

      expect(accumulator.getSnapshot('agent-1').totalEvents).toBe(2);
      expect(accumulator.getSnapshot('agent-2').totalEvents).toBe(1);
    });
  });
});

// ============================================================================
// TrustLedger Tests
// ============================================================================

describe('TrustLedger', () => {
  let ledger: TrustLedger;

  beforeEach(() => {
    ledger = new TrustLedger();
  });

  // ===== record() =====

  describe('record()', () => {
    it('should append a record to the ledger', () => {
      const record: TrustRecord = {
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.51,
        delta: 0.01,
        reason: 'test',
        timestamp: Date.now(),
        gateDecision: 'allow',
      };

      ledger.record(record);
      expect(ledger.recordCount).toBe(1);
    });

    it('should maintain insertion order', () => {
      for (let i = 0; i < 5; i++) {
        ledger.record({
          agentId: 'agent-1',
          previousScore: 0.5 + i * 0.01,
          newScore: 0.5 + (i + 1) * 0.01,
          delta: 0.01,
          reason: `event ${i}`,
          timestamp: Date.now() + i,
        });
      }

      const recent = ledger.getRecentRecords(5);
      for (let i = 0; i < 5; i++) {
        expect(recent[i].reason).toBe(`event ${i}`);
      }
    });
  });

  // ===== Max Records & Eviction =====

  describe('max records and eviction', () => {
    it('should evict oldest records when exceeding 10,000 limit', () => {
      // Add 10,001 records
      for (let i = 0; i < 10_001; i++) {
        ledger.record({
          agentId: 'agent-1',
          previousScore: 0.5,
          newScore: 0.5,
          delta: 0,
          reason: `record ${i}`,
          timestamp: Date.now() + i,
        });
      }

      expect(ledger.recordCount).toBe(10_000);

      // Oldest record should be evicted
      const oldest = ledger.getRecentRecords(10_000)[0];
      expect(oldest.reason).toBe('record 1'); // record 0 was evicted
    });

    it('should keep most recent records after eviction', () => {
      for (let i = 0; i < 10_005; i++) {
        ledger.record({
          agentId: 'agent-1',
          previousScore: 0.5,
          newScore: 0.5,
          delta: 0,
          reason: `record ${i}`,
          timestamp: Date.now() + i,
        });
      }

      const newest = ledger.getRecentRecords(1)[0];
      expect(newest.reason).toBe('record 10004');
    });
  });

  // ===== getHistoryForAgent() =====

  describe('getHistoryForAgent()', () => {
    it('should return empty array for unknown agent', () => {
      expect(ledger.getHistoryForAgent('unknown')).toEqual([]);
    });

    it('should return all records for a specific agent', () => {
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.51,
        delta: 0.01,
        reason: 'event 1',
        timestamp: Date.now(),
      });
      ledger.record({
        agentId: 'agent-2',
        previousScore: 0.5,
        newScore: 0.45,
        delta: -0.05,
        reason: 'event 2',
        timestamp: Date.now(),
      });
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.51,
        newScore: 0.52,
        delta: 0.01,
        reason: 'event 3',
        timestamp: Date.now(),
      });

      const history = ledger.getHistoryForAgent('agent-1');
      expect(history).toHaveLength(2);
      expect(history[0].reason).toBe('event 1');
      expect(history[1].reason).toBe('event 3');
    });
  });

  // ===== getAgentsBelowThreshold() =====

  describe('getAgentsBelowThreshold()', () => {
    it('should return empty array when no agents below threshold', () => {
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.8,
        delta: 0.3,
        reason: 'high score',
        timestamp: Date.now(),
      });

      expect(ledger.getAgentsBelowThreshold(0.5)).toEqual([]);
    });

    it('should return agents with latest score below threshold', () => {
      const now = Date.now();

      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.3,
        delta: -0.2,
        reason: 'drop',
        timestamp: now,
      });
      ledger.record({
        agentId: 'agent-2',
        previousScore: 0.5,
        newScore: 0.6,
        delta: 0.1,
        reason: 'rise',
        timestamp: now + 1,
      });
      ledger.record({
        agentId: 'agent-3',
        previousScore: 0.5,
        newScore: 0.2,
        delta: -0.3,
        reason: 'drop',
        timestamp: now + 2,
      });

      const below = ledger.getAgentsBelowThreshold(0.5);
      expect(below).toHaveLength(2);

      const ids = below.map(r => r.agentId).sort();
      expect(ids).toEqual(['agent-1', 'agent-3']);
    });

    it('should use most recent record per agent', () => {
      const now = Date.now();

      // agent-1 starts below, then rises above
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.3,
        delta: -0.2,
        reason: 'first',
        timestamp: now,
      });
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.3,
        newScore: 0.7,
        delta: 0.4,
        reason: 'second',
        timestamp: now + 1,
      });

      const below = ledger.getAgentsBelowThreshold(0.5);
      expect(below).toHaveLength(0); // Latest score is 0.7
    });
  });

  // ===== getAgentsAboveThreshold() =====

  describe('getAgentsAboveThreshold()', () => {
    it('should return empty array when no agents at/above threshold', () => {
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.2,
        delta: -0.3,
        reason: 'low score',
        timestamp: Date.now(),
      });

      expect(ledger.getAgentsAboveThreshold(0.5)).toEqual([]);
    });

    it('should return agents with latest score at or above threshold', () => {
      const now = Date.now();

      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.8,
        delta: 0.3,
        reason: 'high',
        timestamp: now,
      });
      ledger.record({
        agentId: 'agent-2',
        previousScore: 0.5,
        newScore: 0.5,
        delta: 0,
        reason: 'exact',
        timestamp: now + 1,
      });
      ledger.record({
        agentId: 'agent-3',
        previousScore: 0.5,
        newScore: 0.3,
        delta: -0.2,
        reason: 'low',
        timestamp: now + 2,
      });

      const above = ledger.getAgentsAboveThreshold(0.5);
      expect(above).toHaveLength(2);

      const ids = above.map(r => r.agentId).sort();
      expect(ids).toEqual(['agent-1', 'agent-2']);
    });

    it('should include agents exactly at threshold', () => {
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.8,
        delta: 0.3,
        reason: 'exact threshold',
        timestamp: Date.now(),
      });

      const above = ledger.getAgentsAboveThreshold(0.8);
      expect(above).toHaveLength(1);
      expect(above[0].agentId).toBe('agent-1');
    });
  });

  // ===== getRecordsInRange() =====

  describe('getRecordsInRange()', () => {
    it('should return empty array when no records in range', () => {
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.6,
        delta: 0.1,
        reason: 'test',
        timestamp: 1000,
      });

      expect(ledger.getRecordsInRange(2000, 3000)).toEqual([]);
    });

    it('should return records within time range', () => {
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.6,
        delta: 0.1,
        reason: 'before',
        timestamp: 1000,
      });
      ledger.record({
        agentId: 'agent-2',
        previousScore: 0.5,
        newScore: 0.7,
        delta: 0.2,
        reason: 'in range 1',
        timestamp: 2000,
      });
      ledger.record({
        agentId: 'agent-3',
        previousScore: 0.5,
        newScore: 0.8,
        delta: 0.3,
        reason: 'in range 2',
        timestamp: 2500,
      });
      ledger.record({
        agentId: 'agent-4',
        previousScore: 0.5,
        newScore: 0.9,
        delta: 0.4,
        reason: 'after',
        timestamp: 3500,
      });

      const inRange = ledger.getRecordsInRange(2000, 3000);
      expect(inRange).toHaveLength(2);
      expect(inRange[0].reason).toBe('in range 1');
      expect(inRange[1].reason).toBe('in range 2');
    });

    it('should include records at exact boundaries', () => {
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.6,
        delta: 0.1,
        reason: 'start',
        timestamp: 1000,
      });
      ledger.record({
        agentId: 'agent-2',
        previousScore: 0.5,
        newScore: 0.7,
        delta: 0.2,
        reason: 'end',
        timestamp: 2000,
      });

      const inRange = ledger.getRecordsInRange(1000, 2000);
      expect(inRange).toHaveLength(2);
    });
  });

  // ===== getRecentRecords() =====

  describe('getRecentRecords()', () => {
    it('should return empty array when no records exist', () => {
      expect(ledger.getRecentRecords(5)).toEqual([]);
    });

    it('should return last N records', () => {
      for (let i = 0; i < 10; i++) {
        ledger.record({
          agentId: 'agent-1',
          previousScore: 0.5,
          newScore: 0.5 + i * 0.01,
          delta: 0.01,
          reason: `record ${i}`,
          timestamp: Date.now() + i,
        });
      }

      const recent = ledger.getRecentRecords(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].reason).toBe('record 7');
      expect(recent[1].reason).toBe('record 8');
      expect(recent[2].reason).toBe('record 9');
    });

    it('should return all records if count exceeds total', () => {
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.6,
        delta: 0.1,
        reason: 'only record',
        timestamp: Date.now(),
      });

      const recent = ledger.getRecentRecords(100);
      expect(recent).toHaveLength(1);
    });
  });

  // ===== exportRecords() / importRecords() =====

  describe('exportRecords() / importRecords()', () => {
    it('should export all records', () => {
      for (let i = 0; i < 5; i++) {
        ledger.record({
          agentId: 'agent-1',
          previousScore: 0.5,
          newScore: 0.5 + i * 0.01,
          delta: 0.01,
          reason: `record ${i}`,
          timestamp: Date.now() + i,
        });
      }

      const exported = ledger.exportRecords();
      expect(exported).toHaveLength(5);
      expect(exported[0].reason).toBe('record 0');
    });

    it('should import records and append to existing', () => {
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.6,
        delta: 0.1,
        reason: 'existing',
        timestamp: Date.now(),
      });

      const toImport: TrustRecord[] = [
        {
          agentId: 'agent-2',
          previousScore: 0.5,
          newScore: 0.7,
          delta: 0.2,
          reason: 'imported',
          timestamp: Date.now(),
        },
      ];

      ledger.importRecords(toImport);
      expect(ledger.recordCount).toBe(2);
    });

    it('should enforce max limit after import', () => {
      const manyRecords: TrustRecord[] = [];
      for (let i = 0; i < 10_005; i++) {
        manyRecords.push({
          agentId: 'agent-1',
          previousScore: 0.5,
          newScore: 0.5,
          delta: 0,
          reason: `record ${i}`,
          timestamp: Date.now() + i,
        });
      }

      ledger.importRecords(manyRecords);
      expect(ledger.recordCount).toBe(10_000);
    });

    it('should round-trip export/import correctly', () => {
      for (let i = 0; i < 3; i++) {
        ledger.record({
          agentId: 'agent-1',
          previousScore: 0.5,
          newScore: 0.5 + i * 0.01,
          delta: 0.01,
          reason: `record ${i}`,
          timestamp: Date.now() + i,
        });
      }

      const exported = ledger.exportRecords();

      const newLedger = new TrustLedger();
      newLedger.importRecords(exported);

      expect(newLedger.recordCount).toBe(3);
      expect(newLedger.getRecentRecords(1)[0].reason).toBe('record 2');
    });
  });

  // ===== recordCount =====

  describe('recordCount', () => {
    it('should return 0 initially', () => {
      expect(ledger.recordCount).toBe(0);
    });

    it('should increment as records are added', () => {
      ledger.record({
        agentId: 'agent-1',
        previousScore: 0.5,
        newScore: 0.6,
        delta: 0.1,
        reason: 'test',
        timestamp: Date.now(),
      });
      expect(ledger.recordCount).toBe(1);

      ledger.record({
        agentId: 'agent-2',
        previousScore: 0.5,
        newScore: 0.7,
        delta: 0.2,
        reason: 'test',
        timestamp: Date.now(),
      });
      expect(ledger.recordCount).toBe(2);
    });
  });

  // ===== clear() =====

  describe('clear()', () => {
    it('should remove all records', () => {
      for (let i = 0; i < 10; i++) {
        ledger.record({
          agentId: 'agent-1',
          previousScore: 0.5,
          newScore: 0.6,
          delta: 0.1,
          reason: 'test',
          timestamp: Date.now(),
        });
      }

      ledger.clear();
      expect(ledger.recordCount).toBe(0);
      expect(ledger.getRecentRecords(100)).toEqual([]);
    });
  });

  // ===== Empty State Edge Cases =====

  describe('empty state edge cases', () => {
    it('should handle getHistoryForAgent on empty ledger', () => {
      expect(ledger.getHistoryForAgent('agent-1')).toEqual([]);
    });

    it('should handle getAgentsBelowThreshold on empty ledger', () => {
      expect(ledger.getAgentsBelowThreshold(0.5)).toEqual([]);
    });

    it('should handle getAgentsAboveThreshold on empty ledger', () => {
      expect(ledger.getAgentsAboveThreshold(0.5)).toEqual([]);
    });

    it('should handle getRecordsInRange on empty ledger', () => {
      expect(ledger.getRecordsInRange(0, 1000)).toEqual([]);
    });

    it('should handle getRecentRecords on empty ledger', () => {
      expect(ledger.getRecentRecords(10)).toEqual([]);
    });

    it('should handle exportRecords on empty ledger', () => {
      expect(ledger.exportRecords()).toEqual([]);
    });
  });
});

// ============================================================================
// TrustSystem Tests
// ============================================================================

describe('TrustSystem', () => {
  let system: TrustSystem;

  beforeEach(() => {
    system = new TrustSystem();
  });

  // ===== Integration =====

  describe('integration', () => {
    it('should expose both accumulator and ledger', () => {
      expect(system.accumulator).toBeInstanceOf(TrustAccumulator);
      expect(system.ledger).toBeInstanceOf(TrustLedger);
    });

    it('should accept custom config for accumulator', () => {
      const custom = new TrustSystem({ initialTrust: 0.7 });
      expect(custom.getScore('unknown')).toBe(0.7);
    });
  });

  // ===== recordOutcome() =====

  describe('recordOutcome()', () => {
    it('should update both accumulator and ledger', () => {
      const record = system.recordOutcome('agent-1', 'allow', 'test');

      // Check accumulator
      expect(system.getScore('agent-1')).toBe(0.51);

      // Check ledger
      expect(system.ledger.recordCount).toBe(1);
      const history = system.ledger.getHistoryForAgent('agent-1');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(record);
    });

    it('should return the trust record', () => {
      const record = system.recordOutcome('agent-1', 'deny', 'test deny');

      expect(record.agentId).toBe('agent-1');
      expect(record.previousScore).toBe(0.5);
      expect(record.newScore).toBe(0.45);
      expect(record.delta).toBe(-0.05);
      expect(record.reason).toBe('test deny');
      expect(record.gateDecision).toBe('deny');
    });
  });

  // ===== Delegated Methods =====

  describe('delegated methods', () => {
    it('should delegate getScore to accumulator', () => {
      system.recordOutcome('agent-1', 'allow', 'test');
      expect(system.getScore('agent-1')).toBe(
        system.accumulator.getScore('agent-1'),
      );
    });

    it('should delegate getTier to accumulator', () => {
      system.accumulator.setScore('agent-1', 0.9);
      expect(system.getTier('agent-1')).toBe('trusted');
      expect(system.getTier('agent-1')).toBe(
        system.accumulator.getTier('agent-1'),
      );
    });

    it('should delegate getTrustBasedRateLimit to accumulator', () => {
      system.accumulator.setScore('agent-1', 0.9);
      expect(system.getTrustBasedRateLimit('agent-1', 100)).toBe(200);
      expect(system.getTrustBasedRateLimit('agent-1', 100)).toBe(
        system.accumulator.getTrustBasedRateLimit('agent-1', 100),
      );
    });

    it('should delegate getSnapshot to accumulator', () => {
      system.recordOutcome('agent-1', 'allow', 'test');
      const snapshot = system.getSnapshot('agent-1');
      expect(snapshot).toEqual(system.accumulator.getSnapshot('agent-1'));
    });

    it('should delegate getAllSnapshots to accumulator', () => {
      system.recordOutcome('agent-1', 'allow', 'test');
      system.recordOutcome('agent-2', 'deny', 'test');
      const snapshots = system.getAllSnapshots();
      expect(snapshots).toEqual(system.accumulator.getAllSnapshots());
    });
  });

  // ===== Coordinated Behavior =====

  describe('coordinated behavior', () => {
    it('should maintain consistency between accumulator and ledger', () => {
      // Record several outcomes
      system.recordOutcome('agent-1', 'allow', 'event 1');
      system.recordOutcome('agent-1', 'deny', 'event 2');
      system.recordOutcome('agent-1', 'warn', 'event 3');

      // Accumulator should reflect final score
      const finalScore = system.getScore('agent-1');

      // Ledger should have all events
      const history = system.ledger.getHistoryForAgent('agent-1');
      expect(history).toHaveLength(3);

      // Final ledger entry should match accumulator
      const lastRecord = history[history.length - 1];
      expect(lastRecord.newScore).toBe(finalScore);
    });

    it('should track multiple agents correctly', () => {
      system.recordOutcome('agent-1', 'allow', 'test 1');
      system.recordOutcome('agent-2', 'deny', 'test 2');
      system.recordOutcome('agent-3', 'warn', 'test 3');

      const snapshots = system.getAllSnapshots();
      expect(snapshots).toHaveLength(3);

      expect(system.ledger.recordCount).toBe(3);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('factory functions', () => {
  describe('createTrustAccumulator()', () => {
    it('should create a TrustAccumulator with default config', () => {
      const accumulator = createTrustAccumulator();
      expect(accumulator).toBeInstanceOf(TrustAccumulator);
      expect(accumulator.getScore('unknown')).toBe(0.5);
    });

    it('should create a TrustAccumulator with custom config', () => {
      const accumulator = createTrustAccumulator({ initialTrust: 0.8 });
      expect(accumulator.getScore('unknown')).toBe(0.8);
    });
  });

  describe('createTrustLedger()', () => {
    it('should create an empty TrustLedger', () => {
      const ledger = createTrustLedger();
      expect(ledger).toBeInstanceOf(TrustLedger);
      expect(ledger.recordCount).toBe(0);
    });
  });

  describe('createTrustSystem()', () => {
    it('should create a TrustSystem with default config', () => {
      const system = createTrustSystem();
      expect(system).toBeInstanceOf(TrustSystem);
      expect(system.accumulator).toBeInstanceOf(TrustAccumulator);
      expect(system.ledger).toBeInstanceOf(TrustLedger);
    });

    it('should create a TrustSystem with custom config', () => {
      const system = createTrustSystem({ initialTrust: 0.6 });
      expect(system.getScore('unknown')).toBe(0.6);
    });
  });
});
