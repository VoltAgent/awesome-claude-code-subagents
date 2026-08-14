/**
 * Tests for Memory Write Gating System
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemoryWriteGate,
  createMemoryWriteGate,
  createMemoryEntry,
  type MemoryAuthority,
  type MemoryEntry,
} from '../src/memory-gate.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeAuthority(overrides: Partial<MemoryAuthority> = {}): MemoryAuthority {
  return {
    agentId: 'agent-1',
    role: 'worker',
    namespaces: ['default', 'shared'],
    maxWritesPerMinute: 60,
    canDelete: false,
    canOverwrite: true,
    trustLevel: 0.8,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const authority = makeAuthority();
  return {
    key: 'test-key',
    namespace: 'default',
    value: 'test value',
    valueHash: 'abc123',
    authority,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ttlMs: null,
    decayRate: 0,
    confidence: 1,
    lineage: { operation: 'create' },
    contradictions: [],
    ...overrides,
  };
}

// ============================================================================
// Authority Check Tests
// ============================================================================

describe('MemoryWriteGate', () => {
  let gate: MemoryWriteGate;

  beforeEach(() => {
    gate = new MemoryWriteGate();
  });

  describe('authority checks', () => {
    it('should allow a worker to write to an allowed namespace', () => {
      const authority = makeAuthority({ role: 'worker', namespaces: ['default'] });
      const decision = gate.evaluateWrite(authority, 'key1', 'default', 'value');

      expect(decision.allowed).toBe(true);
      expect(decision.authorityCheck.passed).toBe(true);
      expect(decision.authorityCheck.actualRole).toBe('worker');
    });

    it('should block a worker writing to a disallowed namespace', () => {
      const authority = makeAuthority({ role: 'worker', namespaces: ['default'] });
      const decision = gate.evaluateWrite(authority, 'key1', 'restricted', 'value');

      expect(decision.allowed).toBe(false);
      expect(decision.authorityCheck.passed).toBe(false);
    });

    it('should block an observer from writing', () => {
      const authority = makeAuthority({ role: 'observer', namespaces: ['default'] });
      const decision = gate.evaluateWrite(authority, 'key1', 'default', 'value');

      expect(decision.allowed).toBe(false);
      expect(decision.authorityCheck.passed).toBe(false);
      expect(decision.authorityCheck.requiredRole).toBe('worker');
      expect(decision.authorityCheck.actualRole).toBe('observer');
    });

    it('should allow a queen to write to any namespace', () => {
      const authority = makeAuthority({ role: 'queen', namespaces: [] });
      const decision = gate.evaluateWrite(authority, 'key1', 'any-namespace', 'value');

      expect(decision.allowed).toBe(true);
      expect(decision.authorityCheck.passed).toBe(true);
    });

    it('should allow a coordinator to write to allowed namespaces', () => {
      const authority = makeAuthority({
        role: 'coordinator',
        namespaces: ['coordination', 'shared'],
      });
      const decision = gate.evaluateWrite(authority, 'key1', 'coordination', 'value');

      expect(decision.allowed).toBe(true);
      expect(decision.authorityCheck.passed).toBe(true);
    });

    it('should block a coordinator writing to disallowed namespace', () => {
      const authority = makeAuthority({
        role: 'coordinator',
        namespaces: ['coordination'],
      });
      const decision = gate.evaluateWrite(authority, 'key1', 'private', 'value');

      expect(decision.allowed).toBe(false);
      expect(decision.authorityCheck.passed).toBe(false);
    });
  });

  // ============================================================================
  // Rate Limiting Tests
  // ============================================================================

  describe('rate limiting', () => {
    it('should allow writes within the rate limit', () => {
      const authority = makeAuthority({ maxWritesPerMinute: 5 });

      for (let i = 0; i < 5; i++) {
        const decision = gate.evaluateWrite(authority, `key-${i}`, 'default', 'value');
        expect(decision.allowed).toBe(true);
        expect(decision.rateCheck.passed).toBe(true);
      }
    });

    it('should block writes exceeding the rate limit', () => {
      const authority = makeAuthority({ maxWritesPerMinute: 3 });

      // Use up the rate limit
      for (let i = 0; i < 3; i++) {
        gate.evaluateWrite(authority, `key-${i}`, 'default', 'value');
      }

      // This should be blocked
      const decision = gate.evaluateWrite(authority, 'key-extra', 'default', 'value');
      expect(decision.allowed).toBe(false);
      expect(decision.rateCheck.passed).toBe(false);
      expect(decision.rateCheck.writesInWindow).toBe(3);
      expect(decision.rateCheck.limit).toBe(3);
    });

    it('should track rate limits per agent independently', () => {
      const authority1 = makeAuthority({ agentId: 'agent-1', maxWritesPerMinute: 2 });
      const authority2 = makeAuthority({ agentId: 'agent-2', maxWritesPerMinute: 2 });

      // Fill up agent-1's limit
      gate.evaluateWrite(authority1, 'key1', 'default', 'value');
      gate.evaluateWrite(authority1, 'key2', 'default', 'value');

      // agent-2 should still be allowed
      const decision = gate.evaluateWrite(authority2, 'key3', 'default', 'value');
      expect(decision.allowed).toBe(true);

      // agent-1 should be blocked
      const blocked = gate.evaluateWrite(authority1, 'key4', 'default', 'value');
      expect(blocked.allowed).toBe(false);
    });

    it('should report rate limit status', () => {
      const authority = makeAuthority({ agentId: 'rate-agent', maxWritesPerMinute: 10 });
      gate.registerAuthority(authority);

      gate.evaluateWrite(authority, 'k1', 'default', 'v');
      gate.evaluateWrite(authority, 'k2', 'default', 'v');

      const status = gate.getRateLimitStatus('rate-agent');
      expect(status.writesInWindow).toBe(2);
      expect(status.limit).toBe(10);
      expect(status.resetAt).toBeGreaterThan(Date.now() - 1000);
    });
  });

  // ============================================================================
  // Overwrite Permission Tests
  // ============================================================================

  describe('overwrite permissions', () => {
    it('should allow overwrite when authority has canOverwrite', () => {
      const authority = makeAuthority({ canOverwrite: true });
      const existing = makeEntry({ key: 'shared-key', namespace: 'default' });

      const decision = gate.evaluateWrite(
        authority,
        'shared-key',
        'default',
        'new value',
        [existing]
      );

      expect(decision.allowed).toBe(true);
      expect(decision.overwriteCheck.isOverwrite).toBe(true);
      expect(decision.overwriteCheck.allowed).toBe(true);
    });

    it('should block overwrite when authority lacks canOverwrite', () => {
      const authority = makeAuthority({ canOverwrite: false });
      const existing = makeEntry({ key: 'shared-key', namespace: 'default' });

      const decision = gate.evaluateWrite(
        authority,
        'shared-key',
        'default',
        'new value',
        [existing]
      );

      expect(decision.allowed).toBe(false);
      expect(decision.overwriteCheck.isOverwrite).toBe(true);
      expect(decision.overwriteCheck.allowed).toBe(false);
      expect(decision.reason).toContain('Overwrite not permitted');
    });

    it('should not flag as overwrite when key does not exist', () => {
      const authority = makeAuthority({ canOverwrite: false });
      const existing = makeEntry({ key: 'other-key', namespace: 'default' });

      const decision = gate.evaluateWrite(
        authority,
        'new-key',
        'default',
        'value',
        [existing]
      );

      expect(decision.overwriteCheck.isOverwrite).toBe(false);
      expect(decision.overwriteCheck.allowed).toBe(true);
    });

    it('should not flag as overwrite when existing entries is empty', () => {
      const authority = makeAuthority({ canOverwrite: false });

      const decision = gate.evaluateWrite(authority, 'key', 'default', 'value', []);

      expect(decision.overwriteCheck.isOverwrite).toBe(false);
      expect(decision.overwriteCheck.allowed).toBe(true);
    });
  });

  // ============================================================================
  // Contradiction Detection Tests
  // ============================================================================

  describe('contradiction detection', () => {
    it('should detect "must" vs "never" contradictions', () => {
      const existing = makeEntry({
        key: 'rule-1',
        value: 'You must always validate inputs',
      });

      const contradictions = gate.detectContradictions(
        'You should never validate inputs',
        [existing]
      );

      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].entryKey).toBe('rule-1');
    });

    it('should detect "always" vs "never" contradictions', () => {
      const existing = makeEntry({
        key: 'rule-2',
        value: 'Always use encryption for data at rest',
      });

      const contradictions = gate.detectContradictions(
        'Never use encryption for temporary files',
        [existing]
      );

      expect(contradictions.length).toBeGreaterThan(0);
    });

    it('should detect "require" vs "forbid" contradictions', () => {
      const existing = makeEntry({
        key: 'rule-3',
        value: 'We require two-factor authentication',
      });

      const contradictions = gate.detectContradictions(
        'We forbid two-factor authentication for API keys',
        [existing]
      );

      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].description).toContain('require');
    });

    it('should detect "enable" vs "disable" contradictions', () => {
      const existing = makeEntry({
        key: 'config-1',
        value: 'Enable debug logging in production',
      });

      const contradictions = gate.detectContradictions(
        'Disable debug logging everywhere',
        [existing]
      );

      expect(contradictions.length).toBeGreaterThan(0);
    });

    it('should return empty when no contradictions exist', () => {
      const existing = makeEntry({
        key: 'fact-1',
        value: 'The server runs on port 3000',
      });

      const contradictions = gate.detectContradictions(
        'The database runs on port 5432',
        [existing]
      );

      expect(contradictions.length).toBe(0);
    });

    it('should include contradictions in write decision', () => {
      const authority = makeAuthority();
      const existing = makeEntry({
        key: 'policy-1',
        namespace: 'default',
        value: 'You must use TypeScript for all new code',
      });

      const decision = gate.evaluateWrite(
        authority,
        'policy-2',
        'default',
        'You should never use TypeScript',
        [existing]
      );

      expect(decision.contradictions.length).toBeGreaterThan(0);
      expect(decision.contradictions[0].existingKey).toBe('policy-1');
    });

    it('should not detect contradictions when tracking is disabled', () => {
      const gateNoTracking = new MemoryWriteGate({
        enableContradictionTracking: false,
      });
      const authority = makeAuthority();
      const existing = makeEntry({
        key: 'rule-x',
        namespace: 'default',
        value: 'You must always do X',
      });

      const decision = gateNoTracking.evaluateWrite(
        authority,
        'rule-y',
        'default',
        'You should never do X',
        [existing]
      );

      expect(decision.contradictions.length).toBe(0);
    });

    it('should detect contradictions across multiple existing entries', () => {
      const entries = [
        makeEntry({ key: 'r1', value: 'Always use strict mode' }),
        makeEntry({ key: 'r2', value: 'Require code reviews' }),
        makeEntry({ key: 'r3', value: 'The sky is blue' }),
      ];

      const contradictions = gate.detectContradictions(
        "Don't use strict mode and forbid code reviews",
        entries
      );

      expect(contradictions.length).toBe(2);
      const keys = contradictions.map((c) => c.entryKey);
      expect(keys).toContain('r1');
      expect(keys).toContain('r2');
    });
  });

  // ============================================================================
  // TTL Expiry Tests
  // ============================================================================

  describe('TTL expiry', () => {
    it('should identify expired entries', () => {
      const now = Date.now();
      const entries = [
        makeEntry({ key: 'expired', createdAt: now - 10_000, ttlMs: 5_000 }),
        makeEntry({ key: 'still-valid', createdAt: now - 1_000, ttlMs: 5_000 }),
        makeEntry({ key: 'no-ttl', createdAt: now - 100_000, ttlMs: null }),
      ];

      const expired = gate.getExpiredEntries(entries);

      expect(expired.length).toBe(1);
      expect(expired[0].key).toBe('expired');
    });

    it('should return empty when no entries are expired', () => {
      const now = Date.now();
      const entries = [
        makeEntry({ key: 'valid-1', createdAt: now, ttlMs: 60_000 }),
        makeEntry({ key: 'valid-2', createdAt: now, ttlMs: null }),
      ];

      const expired = gate.getExpiredEntries(entries);
      expect(expired.length).toBe(0);
    });

    it('should handle all entries expired', () => {
      const now = Date.now();
      const entries = [
        makeEntry({ key: 'old-1', createdAt: now - 20_000, ttlMs: 1_000 }),
        makeEntry({ key: 'old-2', createdAt: now - 30_000, ttlMs: 1_000 }),
      ];

      const expired = gate.getExpiredEntries(entries);
      expect(expired.length).toBe(2);
    });
  });

  // ============================================================================
  // Confidence Decay Tests
  // ============================================================================

  describe('confidence decay', () => {
    it('should return full confidence when decayRate is 0', () => {
      const entry = makeEntry({
        confidence: 0.9,
        decayRate: 0,
        updatedAt: Date.now() - 3_600_000, // 1 hour ago
      });

      const confidence = gate.computeConfidence(entry);
      expect(confidence).toBe(0.9);
    });

    it('should return 0 confidence when decayRate is 1', () => {
      const entry = makeEntry({
        confidence: 1,
        decayRate: 1,
        updatedAt: Date.now() - 1_000, // 1 second ago
      });

      const confidence = gate.computeConfidence(entry);
      expect(confidence).toBe(0);
    });

    it('should decay confidence over time', () => {
      const oneHourAgo = Date.now() - 3_600_000;
      const entry = makeEntry({
        confidence: 1.0,
        decayRate: 0.5,
        updatedAt: oneHourAgo,
      });

      const confidence = gate.computeConfidence(entry);

      // After 1 hour with decayRate 0.5: 1.0 * e^(-0.5 * 1) ~ 0.6065
      expect(confidence).toBeGreaterThan(0.5);
      expect(confidence).toBeLessThan(0.7);
    });

    it('should return near-full confidence for very recent entries', () => {
      const entry = makeEntry({
        confidence: 1.0,
        decayRate: 0.1,
        updatedAt: Date.now() - 100, // 100ms ago
      });

      const confidence = gate.computeConfidence(entry);
      expect(confidence).toBeGreaterThan(0.99);
    });

    it('should identify decayed entries below threshold', () => {
      const twoHoursAgo = Date.now() - 7_200_000;
      const entries = [
        makeEntry({
          key: 'fresh',
          confidence: 1.0,
          decayRate: 0.1,
          updatedAt: Date.now(),
        }),
        makeEntry({
          key: 'decayed',
          confidence: 1.0,
          decayRate: 2.0,
          updatedAt: twoHoursAgo,
        }),
        makeEntry({
          key: 'no-decay',
          confidence: 0.5,
          decayRate: 0,
          updatedAt: twoHoursAgo,
        }),
      ];

      const decayed = gate.getDecayedEntries(entries, 0.3);

      expect(decayed.length).toBe(1);
      expect(decayed[0].key).toBe('decayed');
    });
  });

  // ============================================================================
  // Lineage Tracking Tests
  // ============================================================================

  describe('lineage tracking', () => {
    it('should create entries with lineage via createMemoryEntry', () => {
      const authority = makeAuthority();
      const entry = createMemoryEntry('derived-key', 'default', 'derived value', authority, {
        lineage: {
          parentKey: 'parent-key',
          derivedFrom: ['source-1', 'source-2'],
          operation: 'merge',
        },
      });

      expect(entry.lineage.parentKey).toBe('parent-key');
      expect(entry.lineage.derivedFrom).toEqual(['source-1', 'source-2']);
      expect(entry.lineage.operation).toBe('merge');
    });

    it('should default lineage operation to "create"', () => {
      const authority = makeAuthority();
      const entry = createMemoryEntry('new-key', 'default', 'value', authority);

      expect(entry.lineage.operation).toBe('create');
      expect(entry.lineage.parentKey).toBeUndefined();
      expect(entry.lineage.derivedFrom).toBeUndefined();
    });

    it('should preserve lineage through entry creation', () => {
      const authority = makeAuthority();
      const entry = createMemoryEntry('key', 'ns', { data: 123 }, authority, {
        lineage: {
          derivedFrom: ['a', 'b', 'c'],
          operation: 'aggregate',
        },
      });

      expect(entry.lineage.derivedFrom).toHaveLength(3);
      expect(entry.lineage.operation).toBe('aggregate');
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('createMemoryWriteGate', () => {
    it('should create a gate with default config', () => {
      const gate = createMemoryWriteGate();
      expect(gate).toBeInstanceOf(MemoryWriteGate);
      expect(gate.isContradictionTrackingEnabled()).toBe(true);
    });

    it('should create a gate with custom config', () => {
      const authority = makeAuthority({ agentId: 'pre-reg' });
      const gate = createMemoryWriteGate({
        authorities: [authority],
        contradictionThreshold: 0.8,
        defaultTtlMs: 30_000,
        defaultDecayRate: 0.1,
        enableContradictionTracking: false,
      });

      expect(gate.isContradictionTrackingEnabled()).toBe(false);
      expect(gate.getDefaultTtlMs()).toBe(30_000);
      expect(gate.getDefaultDecayRate()).toBe(0.1);
      expect(gate.getAuthorityFor('pre-reg')).toBeDefined();
    });
  });

  // ============================================================================
  // Authority Registration Tests
  // ============================================================================

  describe('registerAuthority', () => {
    it('should register and retrieve an authority', () => {
      const authority = makeAuthority({ agentId: 'new-agent' });
      gate.registerAuthority(authority);

      const retrieved = gate.getAuthorityFor('new-agent');
      expect(retrieved).toBeDefined();
      expect(retrieved!.agentId).toBe('new-agent');
      expect(retrieved!.role).toBe('worker');
    });

    it('should update an existing authority', () => {
      const authority1 = makeAuthority({ agentId: 'agent-x', role: 'worker' });
      gate.registerAuthority(authority1);

      const authority2 = makeAuthority({ agentId: 'agent-x', role: 'coordinator' });
      gate.registerAuthority(authority2);

      const retrieved = gate.getAuthorityFor('agent-x');
      expect(retrieved!.role).toBe('coordinator');
    });

    it('should return undefined for unknown agent', () => {
      const retrieved = gate.getAuthorityFor('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  // ============================================================================
  // Contradiction Resolution Tests
  // ============================================================================

  describe('resolveContradiction', () => {
    it('should store and retrieve a resolution', () => {
      gate.resolveContradiction('entry-1', 'Resolved by promoting entry-1 as authoritative');

      const resolution = gate.getContradictionResolution('entry-1');
      expect(resolution).toBe('Resolved by promoting entry-1 as authoritative');
    });

    it('should return undefined for unresolved contradictions', () => {
      const resolution = gate.getContradictionResolution('unresolved-key');
      expect(resolution).toBeUndefined();
    });
  });

  // ============================================================================
  // createMemoryEntry Helper Tests
  // ============================================================================

  describe('createMemoryEntry', () => {
    it('should create an entry with computed value hash', () => {
      const authority = makeAuthority();
      const entry = createMemoryEntry('k', 'ns', { hello: 'world' }, authority);

      expect(entry.key).toBe('k');
      expect(entry.namespace).toBe('ns');
      expect(entry.value).toEqual({ hello: 'world' });
      expect(entry.valueHash).toBeTruthy();
      expect(entry.valueHash.length).toBe(64); // SHA-256 hex length
    });

    it('should apply TTL and decay options', () => {
      const authority = makeAuthority();
      const entry = createMemoryEntry('k', 'ns', 'v', authority, {
        ttlMs: 60_000,
        decayRate: 0.3,
        confidence: 0.75,
      });

      expect(entry.ttlMs).toBe(60_000);
      expect(entry.decayRate).toBe(0.3);
      expect(entry.confidence).toBe(0.75);
    });

    it('should default to no TTL, no decay, full confidence', () => {
      const authority = makeAuthority();
      const entry = createMemoryEntry('k', 'ns', 'v', authority);

      expect(entry.ttlMs).toBeNull();
      expect(entry.decayRate).toBe(0);
      expect(entry.confidence).toBe(1);
    });

    it('should set timestamps close to now', () => {
      const before = Date.now();
      const authority = makeAuthority();
      const entry = createMemoryEntry('k', 'ns', 'v', authority);
      const after = Date.now();

      expect(entry.createdAt).toBeGreaterThanOrEqual(before);
      expect(entry.createdAt).toBeLessThanOrEqual(after);
      expect(entry.updatedAt).toBe(entry.createdAt);
    });

    it('should initialize with empty contradictions', () => {
      const authority = makeAuthority();
      const entry = createMemoryEntry('k', 'ns', 'v', authority);

      expect(entry.contradictions).toEqual([]);
    });

    it('should produce different hashes for different values', () => {
      const authority = makeAuthority();
      const entry1 = createMemoryEntry('k', 'ns', 'value-a', authority);
      const entry2 = createMemoryEntry('k', 'ns', 'value-b', authority);

      expect(entry1.valueHash).not.toBe(entry2.valueHash);
    });
  });

  // ============================================================================
  // Combined Scenarios
  // ============================================================================

  describe('combined write evaluation', () => {
    it('should report multiple failure reasons', () => {
      // Observer trying to overwrite in a wrong namespace
      const authority = makeAuthority({
        role: 'observer',
        namespaces: ['other'],
        canOverwrite: false,
      });
      const existing = makeEntry({ key: 'target', namespace: 'default' });

      const decision = gate.evaluateWrite(
        authority,
        'target',
        'default',
        'new value',
        [existing]
      );

      expect(decision.allowed).toBe(false);
      expect(decision.authorityCheck.passed).toBe(false);
      // The reason should contain failure info
      expect(decision.reason).toContain('Authority check failed');
    });

    it('should allow a fully authorized write with no contradictions', () => {
      const authority = makeAuthority({
        role: 'queen',
        canOverwrite: true,
        maxWritesPerMinute: 100,
      });

      const decision = gate.evaluateWrite(
        authority,
        'new-fact',
        'knowledge',
        'The earth orbits the sun',
        []
      );

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('Write allowed');
      expect(decision.contradictions.length).toBe(0);
      expect(decision.authorityCheck.passed).toBe(true);
      expect(decision.rateCheck.passed).toBe(true);
      expect(decision.overwriteCheck.isOverwrite).toBe(false);
    });
  });
});
