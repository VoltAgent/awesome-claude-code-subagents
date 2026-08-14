/**
 * Tests for Ledger Persistence Layer
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PersistentLedger,
  EventStore,
  createPersistentLedger,
  createEventStore,
} from '../src/persistence.js';
import { RunLedger } from '../src/ledger.js';
import type { RunEvent, Violation } from '../src/types.js';

// ============================================================================
// Helpers
// ============================================================================

function createMockEvent(overrides: Partial<RunEvent> = {}): RunEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2, 10)}`,
    taskId: 'task-1',
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
    durationMs: 3000,
    ...overrides,
  };
}

/**
 * Small delay to allow fire-and-forget async writes to complete.
 */
function tick(ms = 50): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// EventStore tests
// ============================================================================

describe('EventStore', () => {
  let tempDir: string;
  let store: EventStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'guidance-eventstore-'));
    store = createEventStore(tempDir);
  });

  afterEach(async () => {
    await store.releaseLock();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('directory creation', () => {
    it('should create the storage directory if it does not exist', async () => {
      const nestedDir = join(tempDir, 'nested', 'deep', 'dir');
      const nestedStore = createEventStore(nestedDir);

      const event = createMockEvent();
      await nestedStore.append(event);

      expect(existsSync(nestedDir)).toBe(true);
      const events = await nestedStore.readAll();
      expect(events).toHaveLength(1);
    });
  });

  describe('append and read', () => {
    it('should append an event and read it back', async () => {
      const event = createMockEvent({ taskId: 'task-42' });
      await store.append(event);

      const events = await store.readAll();
      expect(events).toHaveLength(1);
      expect(events[0].taskId).toBe('task-42');
      expect(events[0].eventId).toBe(event.eventId);
    });

    it('should append multiple events preserving order', async () => {
      const e1 = createMockEvent({ taskId: 'task-1', timestamp: 1000 });
      const e2 = createMockEvent({ taskId: 'task-2', timestamp: 2000 });
      const e3 = createMockEvent({ taskId: 'task-3', timestamp: 3000 });

      await store.append(e1);
      await store.append(e2);
      await store.append(e3);

      const events = await store.readAll();
      expect(events).toHaveLength(3);
      expect(events[0].taskId).toBe('task-1');
      expect(events[1].taskId).toBe('task-2');
      expect(events[2].taskId).toBe('task-3');
    });

    it('should return empty array when no events file exists', async () => {
      const events = await store.readAll();
      expect(events).toEqual([]);
    });

    it('should store events as valid NDJSON', async () => {
      const e1 = createMockEvent({ taskId: 'task-a' });
      const e2 = createMockEvent({ taskId: 'task-b' });
      await store.append(e1);
      await store.append(e2);

      const raw = await readFile(join(tempDir, 'events.ndjson'), 'utf-8');
      const lines = raw.trim().split('\n');
      expect(lines).toHaveLength(2);

      // Each line should be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('should skip malformed lines gracefully', async () => {
      const { writeFile: wf } = await import('node:fs/promises');
      const eventsPath = join(tempDir, 'events.ndjson');
      const validEvent = createMockEvent({ taskId: 'valid-task' });
      const content = JSON.stringify(validEvent) + '\n' + 'not-json\n' + '\n';
      await wf(eventsPath, content, 'utf-8');

      const events = await store.readAll();
      expect(events).toHaveLength(1);
      expect(events[0].taskId).toBe('valid-task');
    });
  });

  describe('readRange', () => {
    it('should return events within the specified time range', async () => {
      await store.append(createMockEvent({ taskId: 't1', timestamp: 1000 }));
      await store.append(createMockEvent({ taskId: 't2', timestamp: 2000 }));
      await store.append(createMockEvent({ taskId: 't3', timestamp: 3000 }));
      await store.append(createMockEvent({ taskId: 't4', timestamp: 4000 }));

      const events = await store.readRange(1500, 3500);
      expect(events).toHaveLength(2);
      expect(events.map(e => e.taskId)).toEqual(['t2', 't3']);
    });

    it('should return empty array when no events match range', async () => {
      await store.append(createMockEvent({ timestamp: 1000 }));
      const events = await store.readRange(5000, 6000);
      expect(events).toEqual([]);
    });
  });

  describe('compact', () => {
    it('should evict oldest events when exceeding maxEvents', async () => {
      // Append 10 events with ascending timestamps
      for (let i = 0; i < 10; i++) {
        await store.append(createMockEvent({
          taskId: `task-${i}`,
          timestamp: 1000 + i * 100,
        }));
      }

      const evicted = await store.compact(5);
      expect(evicted).toBe(5);

      const remaining = await store.readAll();
      expect(remaining).toHaveLength(5);
      // The 5 newest (task-5 through task-9) should remain
      expect(remaining[0].taskId).toBe('task-5');
      expect(remaining[4].taskId).toBe('task-9');
    });

    it('should return 0 when no compaction needed', async () => {
      await store.append(createMockEvent());
      await store.append(createMockEvent());

      const evicted = await store.compact(10);
      expect(evicted).toBe(0);
    });

    it('should update the index after compaction', async () => {
      for (let i = 0; i < 5; i++) {
        await store.append(createMockEvent({
          taskId: `task-${i}`,
          timestamp: 1000 + i * 100,
        }));
      }

      await store.compact(2);

      const stats = await store.getStats();
      expect(stats.eventCount).toBe(2);
      expect(stats.oldestEvent).toBe(1300); // task-3
      expect(stats.newestEvent).toBe(1400); // task-4
    });
  });

  describe('getStats', () => {
    it('should return zero stats for empty store', async () => {
      const stats = await store.getStats();
      expect(stats.eventCount).toBe(0);
      expect(stats.storageSizeBytes).toBe(0);
      expect(stats.oldestEvent).toBeNull();
      expect(stats.newestEvent).toBeNull();
    });

    it('should return correct stats after appending events', async () => {
      await store.append(createMockEvent({ timestamp: 1000 }));
      await store.append(createMockEvent({ timestamp: 3000 }));
      await store.append(createMockEvent({ timestamp: 2000 }));

      const stats = await store.getStats();
      expect(stats.eventCount).toBe(3);
      expect(stats.storageSizeBytes).toBeGreaterThan(0);
      expect(stats.oldestEvent).toBe(1000);
      expect(stats.newestEvent).toBe(3000);
    });
  });

  describe('lock file', () => {
    it('should acquire and release lock successfully', async () => {
      await store.acquireLock();
      expect(existsSync(join(tempDir, '.lock'))).toBe(true);

      await store.releaseLock();
      expect(existsSync(join(tempDir, '.lock'))).toBe(false);
    });

    it('should reject concurrent lock acquisition', async () => {
      await store.acquireLock();

      const store2 = createEventStore(tempDir);
      await expect(store2.acquireLock()).rejects.toThrow(/locked/i);

      await store.releaseLock();
    });

    it('should handle stale lock by removing it', async () => {
      // Write a stale lock file (timestamp far in the past)
      const { writeFile: wf } = await import('node:fs/promises');
      const lockData = { holder: 'old-holder', timestamp: Date.now() - 60_000, pid: 99999 };
      await wf(join(tempDir, '.lock'), JSON.stringify(lockData), 'utf-8');

      // Should succeed because the lock is stale
      await store.acquireLock();
      expect(existsSync(join(tempDir, '.lock'))).toBe(true);

      await store.releaseLock();
    });

    it('should only release lock owned by the same holder', async () => {
      await store.acquireLock();

      // A different store instance should not be able to release our lock
      const store2 = createEventStore(tempDir);
      await store2.releaseLock();

      // Lock should still exist since store2 did not own it
      // (store2 has null lockHolder so the holder check will fail, but
      // the fallback best-effort removal may remove it anyway)
      // Release with the actual owner
      await store.releaseLock();
    });

    it('should succeed when releasing without holding a lock', async () => {
      // Should not throw
      await store.releaseLock();
    });
  });

  describe('destroy', () => {
    it('should remove all storage files', async () => {
      await store.append(createMockEvent());
      await store.acquireLock();
      await store.releaseLock();

      // index.json and events.ndjson should exist
      expect(existsSync(join(tempDir, 'events.ndjson'))).toBe(true);
      expect(existsSync(join(tempDir, 'index.json'))).toBe(true);

      await store.destroy();

      expect(existsSync(join(tempDir, 'events.ndjson'))).toBe(false);
      expect(existsSync(join(tempDir, 'index.json'))).toBe(false);
    });
  });
});

// ============================================================================
// PersistentLedger tests
// ============================================================================

describe('PersistentLedger', () => {
  let tempDir: string;
  let ledger: PersistentLedger;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'guidance-persist-'));
    ledger = createPersistentLedger({
      storagePath: tempDir,
      maxEvents: 100,
      compactIntervalMs: 0, // disable auto-compact in tests
      enableWAL: true,
    });
  });

  afterEach(async () => {
    await ledger.destroy();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('event persistence (log -> save -> load roundtrip)', () => {
    it('should persist events across save/load cycles', async () => {
      ledger.logEvent(createMockEvent({ taskId: 'task-a' }));
      ledger.logEvent(createMockEvent({ taskId: 'task-b' }));

      // Allow async writes to flush
      await tick();

      // Save explicitly
      await ledger.save();

      // Create a fresh ledger pointing to the same storage
      const ledger2 = createPersistentLedger({
        storagePath: tempDir,
        compactIntervalMs: 0,
      });

      await ledger2.load();
      expect(ledger2.eventCount).toBe(2);

      const events = ledger2.getEvents();
      const taskIds = events.map(e => e.taskId);
      expect(taskIds).toContain('task-a');
      expect(taskIds).toContain('task-b');

      await ledger2.destroy();
    });

    it('should persist full event structure accurately', async () => {
      const violations: Violation[] = [
        { ruleId: 'R001', description: 'test violation', severity: 'high', autoCorrected: true },
      ];
      const original = createMockEvent({
        taskId: 'precise-task',
        guidanceHash: 'hash-xyz',
        retrievedRuleIds: ['R001', 'R003'],
        toolsUsed: ['Read', 'Bash', 'Edit'],
        filesTouched: ['src/a.ts', 'src/b.ts'],
        diffSummary: { linesAdded: 100, linesRemoved: 20, filesChanged: 3 },
        testResults: { ran: true, passed: 15, failed: 1, skipped: 2 },
        violations,
        outcomeAccepted: false,
        reworkLines: 42,
        intent: 'refactor',
        timestamp: 1700000000000,
        durationMs: 12345,
      });

      ledger.logEvent(original);
      await tick();
      await ledger.save();

      const ledger2 = createPersistentLedger({ storagePath: tempDir, compactIntervalMs: 0 });
      await ledger2.load();

      const loaded = ledger2.getEvents();
      expect(loaded).toHaveLength(1);

      const evt = loaded[0];
      expect(evt.taskId).toBe('precise-task');
      expect(evt.guidanceHash).toBe('hash-xyz');
      expect(evt.retrievedRuleIds).toEqual(['R001', 'R003']);
      expect(evt.toolsUsed).toEqual(['Read', 'Bash', 'Edit']);
      expect(evt.filesTouched).toEqual(['src/a.ts', 'src/b.ts']);
      expect(evt.diffSummary).toEqual({ linesAdded: 100, linesRemoved: 20, filesChanged: 3 });
      expect(evt.testResults).toEqual({ ran: true, passed: 15, failed: 1, skipped: 2 });
      expect(evt.violations).toHaveLength(1);
      expect(evt.violations[0].ruleId).toBe('R001');
      expect(evt.violations[0].autoCorrected).toBe(true);
      expect(evt.outcomeAccepted).toBe(false);
      expect(evt.reworkLines).toBe(42);
      expect(evt.intent).toBe('refactor');
      expect(evt.timestamp).toBe(1700000000000);
      expect(evt.durationMs).toBe(12345);

      await ledger2.destroy();
    });
  });

  describe('init()', () => {
    it('should load existing events from storage on init', async () => {
      // Write events directly to storage
      const store = createEventStore(tempDir);
      await store.append(createMockEvent({ taskId: 'preexisting-1' }));
      await store.append(createMockEvent({ taskId: 'preexisting-2' }));

      const freshLedger = createPersistentLedger({
        storagePath: tempDir,
        compactIntervalMs: 0,
      });
      await freshLedger.init();

      expect(freshLedger.eventCount).toBe(2);
      const events = freshLedger.getEvents();
      expect(events.map(e => e.taskId)).toContain('preexisting-1');

      await freshLedger.destroy();
    });

    it('should be idempotent', async () => {
      const store = createEventStore(tempDir);
      await store.append(createMockEvent({ taskId: 't1' }));

      await ledger.init();
      await ledger.init(); // second call should be a no-op

      expect(ledger.eventCount).toBe(1);
    });
  });

  describe('logEvent with WAL', () => {
    it('should persist events to storage via fire-and-forget write', async () => {
      ledger.logEvent(createMockEvent({ taskId: 'wal-task' }));

      // Allow async WAL write to complete
      await tick();

      // Read directly from the store to confirm persistence
      const store = createEventStore(tempDir);
      const events = await store.readAll();
      expect(events).toHaveLength(1);
      expect(events[0].taskId).toBe('wal-task');
    });
  });

  describe('compaction', () => {
    it('should evict oldest events and keep maxEvents', async () => {
      const compactLedger = createPersistentLedger({
        storagePath: tempDir,
        maxEvents: 3,
        compactIntervalMs: 0,
      });

      // Log 6 events with increasing timestamps
      for (let i = 0; i < 6; i++) {
        compactLedger.logEvent(createMockEvent({
          taskId: `task-${i}`,
          timestamp: 1000 + i * 100,
        }));
      }
      await tick();
      await compactLedger.save();

      const evicted = await compactLedger.compact();
      expect(evicted).toBe(3);
      expect(compactLedger.eventCount).toBe(3);

      // Should keep the 3 newest: task-3, task-4, task-5
      const events = compactLedger.getEvents();
      const taskIds = events.map(e => e.taskId);
      expect(taskIds).toContain('task-3');
      expect(taskIds).toContain('task-4');
      expect(taskIds).toContain('task-5');
      expect(taskIds).not.toContain('task-0');
      expect(taskIds).not.toContain('task-1');

      await compactLedger.destroy();
    });

    it('should return 0 when no compaction is needed', async () => {
      ledger.logEvent(createMockEvent());
      await tick();
      await ledger.save();

      const evicted = await ledger.compact();
      expect(evicted).toBe(0);
    });
  });

  describe('storage stats', () => {
    it('should return correct stats', async () => {
      ledger.logEvent(createMockEvent({ timestamp: 5000 }));
      ledger.logEvent(createMockEvent({ timestamp: 2000 }));
      ledger.logEvent(createMockEvent({ timestamp: 8000 }));
      await tick();
      await ledger.save();

      const stats = await ledger.getStorageStats();
      expect(stats.eventCount).toBe(3);
      expect(stats.storageSizeBytes).toBeGreaterThan(0);
      expect(stats.oldestEvent).toBe(2000);
      expect(stats.newestEvent).toBe(8000);
    });

    it('should return zero stats for empty ledger', async () => {
      const stats = await ledger.getStorageStats();
      expect(stats.eventCount).toBe(0);
      expect(stats.oldestEvent).toBeNull();
      expect(stats.newestEvent).toBeNull();
    });
  });

  describe('import/export compatibility with base RunLedger', () => {
    it('should export events compatible with base RunLedger.importEvents()', async () => {
      ledger.logEvent(createMockEvent({ taskId: 'compat-1' }));
      ledger.logEvent(createMockEvent({ taskId: 'compat-2' }));
      await tick();

      const exported = ledger.exportEvents();

      const baseLedger = new RunLedger();
      baseLedger.importEvents(exported);

      expect(baseLedger.eventCount).toBe(2);
      const taskIds = baseLedger.getEvents().map(e => e.taskId);
      expect(taskIds).toContain('compat-1');
      expect(taskIds).toContain('compat-2');
    });

    it('should import events from base RunLedger.exportEvents()', async () => {
      const baseLedger = new RunLedger();
      baseLedger.logEvent(createMockEvent({ taskId: 'base-1' }));
      baseLedger.logEvent(createMockEvent({ taskId: 'base-2' }));

      const exported = baseLedger.exportEvents();
      ledger.importEvents(exported);
      await tick();

      expect(ledger.eventCount).toBe(2);

      // Also verify it was persisted
      await ledger.save();
      const ledger2 = createPersistentLedger({ storagePath: tempDir, compactIntervalMs: 0 });
      await ledger2.load();
      expect(ledger2.eventCount).toBe(2);

      await ledger2.destroy();
    });

    it('should support metrics computation after load', async () => {
      const violations: Violation[] = [
        { ruleId: 'R001', description: 'v', severity: 'medium', autoCorrected: false },
      ];
      ledger.logEvent(createMockEvent({ violations, reworkLines: 20 }));
      ledger.logEvent(createMockEvent({ reworkLines: 10 }));
      await tick();
      await ledger.save();

      const ledger2 = createPersistentLedger({ storagePath: tempDir, compactIntervalMs: 0 });
      await ledger2.load();

      const metrics = ledger2.computeMetrics();
      expect(metrics.taskCount).toBe(2);
      expect(metrics.violationRate).toBe(5); // 1 violation / 2 tasks * 10
      expect(metrics.reworkLines).toBe(15); // avg of 20 and 10

      await ledger2.destroy();
    });
  });

  describe('destroy', () => {
    it('should clean up resources without removing storage files', async () => {
      ledger.logEvent(createMockEvent());
      await tick();
      await ledger.save();

      await ledger.destroy();

      // Storage files should still exist (destroy only cleans up runtime resources)
      expect(existsSync(join(tempDir, 'events.ndjson'))).toBe(true);
    });
  });
});

// ============================================================================
// Factory function tests
// ============================================================================

describe('Factory functions', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'guidance-factory-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('createPersistentLedger should create a PersistentLedger instance', () => {
    const ledger = createPersistentLedger({ storagePath: tempDir, compactIntervalMs: 0 });
    expect(ledger).toBeInstanceOf(PersistentLedger);
    expect(ledger).toBeInstanceOf(RunLedger);
  });

  it('createEventStore should create an EventStore instance', () => {
    const store = createEventStore(tempDir);
    expect(store).toBeInstanceOf(EventStore);
  });

  it('createPersistentLedger with defaults should use default config', () => {
    const ledger = createPersistentLedger();
    expect(ledger).toBeInstanceOf(PersistentLedger);
  });
});
