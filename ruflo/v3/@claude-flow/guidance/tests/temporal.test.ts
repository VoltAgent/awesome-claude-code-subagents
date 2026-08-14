/**
 * Comprehensive test suite for temporal.ts
 *
 * Tests bitemporal assertions with validity windows, supersession chains,
 * retraction, conflict detection, and temporal reasoning capabilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTemporalStore,
  createTemporalReasoner,
  TemporalStore,
  TemporalReasoner,
  type TemporalAssertion,
  type TemporalStatus,
  type SerializedTemporalStore,
} from '../src/temporal.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create time points relative to now for temporal testing.
 */
function createTimePoints() {
  const now = Date.now();
  return {
    now,
    past1h: now - 60 * 60 * 1000,
    past30m: now - 30 * 60 * 1000,
    past10m: now - 10 * 60 * 1000,
    future10m: now + 10 * 60 * 1000,
    future30m: now + 30 * 60 * 1000,
    future1h: now + 60 * 60 * 1000,
    past2h: now - 2 * 60 * 60 * 1000,
    past3h: now - 3 * 60 * 60 * 1000,
    future2h: now + 2 * 60 * 60 * 1000,
  };
}

// ============================================================================
// TemporalStore - Basic Assertion Tests
// ============================================================================

describe('TemporalStore - Basic Assertions', () => {
  let store: TemporalStore;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    times = createTimePoints();
  });

  it('should create a basic assertion with active status', () => {
    const assertion = store.assert(
      'System is online',
      'system-status',
      { validFrom: times.past1h, validUntil: times.future1h },
    );

    expect(assertion).toBeDefined();
    expect(assertion.id).toBeDefined();
    expect(assertion.claim).toBe('System is online');
    expect(assertion.namespace).toBe('system-status');
    expect(assertion.status).toBe('active');
    expect(assertion.window.validFrom).toBe(times.past1h);
    expect(assertion.window.validUntil).toBe(times.future1h);
    expect(assertion.window.assertedAt).toBeGreaterThanOrEqual(times.now);
    expect(assertion.window.retractedAt).toBeNull();
  });

  it('should create assertion with future status', () => {
    const assertion = store.assert(
      'Maintenance scheduled',
      'system-status',
      { validFrom: times.future1h, validUntil: times.future2h },
    );

    expect(assertion.status).toBe('future');
  });

  it('should create assertion with expired status', () => {
    const assertion = store.assert(
      'Old system version',
      'system-status',
      { validFrom: times.past3h, validUntil: times.past1h },
    );

    expect(assertion.status).toBe('expired');
  });

  it('should create assertion with indefinite validity (validUntil = null)', () => {
    const assertion = store.assert(
      'Company founded',
      'company-facts',
      { validFrom: times.past1h, validUntil: null },
    );

    expect(assertion.status).toBe('active');
    expect(assertion.window.validUntil).toBeNull();
  });

  it('should create assertion with custom options', () => {
    const assertion = store.assert(
      'Test claim',
      'test-ns',
      { validFrom: times.past1h, validUntil: times.future1h },
      {
        confidence: 0.8,
        source: 'test-system',
        tags: ['test', 'example'],
        metadata: { key: 'value' },
      },
    );

    expect(assertion.confidence).toBe(0.8);
    expect(assertion.source).toBe('test-system');
    expect(assertion.tags).toEqual(['test', 'example']);
    expect(assertion.metadata).toEqual({ key: 'value' });
  });

  it('should clamp confidence to [0, 1] range', () => {
    const assertion1 = store.assert(
      'Test 1',
      'test-ns',
      { validFrom: times.past1h, validUntil: times.future1h },
      { confidence: 1.5 },
    );

    const assertion2 = store.assert(
      'Test 2',
      'test-ns',
      { validFrom: times.past1h, validUntil: times.future1h },
      { confidence: -0.5 },
    );

    expect(assertion1.confidence).toBe(1.0);
    expect(assertion2.confidence).toBe(0.0);
  });

  it('should use default values for optional fields', () => {
    const assertion = store.assert(
      'Default test',
      'test-ns',
      { validFrom: times.past1h, validUntil: times.future1h },
    );

    expect(assertion.confidence).toBe(1.0);
    expect(assertion.source).toBe('system');
    expect(assertion.tags).toEqual([]);
    expect(assertion.metadata).toEqual({});
    expect(assertion.supersededBy).toBeNull();
    expect(assertion.supersedes).toBeNull();
  });
});

// ============================================================================
// TemporalStore - Status Computation Tests
// ============================================================================

describe('TemporalStore - Status Computation', () => {
  let store: TemporalStore;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    times = createTimePoints();
  });

  it('should compute active status when now is within validity window', () => {
    const assertion = store.assert(
      'Currently active',
      'test-ns',
      { validFrom: times.past1h, validUntil: times.future1h },
    );

    expect(assertion.status).toBe('active');
  });

  it('should compute future status when validFrom is in the future', () => {
    const assertion = store.assert(
      'Future claim',
      'test-ns',
      { validFrom: times.future1h, validUntil: times.future2h },
    );

    expect(assertion.status).toBe('future');
  });

  it('should compute expired status when validUntil is in the past', () => {
    const assertion = store.assert(
      'Expired claim',
      'test-ns',
      { validFrom: times.past3h, validUntil: times.past1h },
    );

    expect(assertion.status).toBe('expired');
  });

  it('should compute retracted status when assertion is retracted', () => {
    const assertion = store.assert(
      'Will be retracted',
      'test-ns',
      { validFrom: times.past1h, validUntil: times.future1h },
    );

    store.retract(assertion.id);
    const retrieved = store.get(assertion.id);

    expect(retrieved!.status).toBe('retracted');
    expect(retrieved!.window.retractedAt).toBeGreaterThanOrEqual(times.now);
  });

  it('should compute superseded status when assertion is superseded', () => {
    const old = store.assert(
      'Old version',
      'test-ns',
      { validFrom: times.past1h, validUntil: times.future1h },
    );

    store.supersede(old.id, 'New version', { validFrom: times.now, validUntil: times.future1h });
    const retrieved = store.get(old.id);

    expect(retrieved!.status).toBe('superseded');
    expect(retrieved!.supersededBy).toBeDefined();
  });

  it('should prioritize retracted over superseded in status computation', () => {
    const old = store.assert(
      'Old',
      'test-ns',
      { validFrom: times.past1h, validUntil: times.future1h },
    );

    const newAssertion = store.supersede(
      old.id,
      'New',
      { validFrom: times.now, validUntil: times.future1h },
    );

    store.retract(old.id);
    const retrieved = store.get(old.id);

    expect(retrieved!.status).toBe('retracted');
  });

  it('should recompute status on get() based on current time', () => {
    // Create an assertion that will expire soon
    const nearFutureEnd = times.now + 100; // 100ms in the future
    const assertion = store.assert(
      'Expiring soon',
      'test-ns',
      { validFrom: times.past1h, validUntil: nearFutureEnd },
    );

    expect(assertion.status).toBe('active');

    // Wait for expiration
    return new Promise(resolve => {
      setTimeout(() => {
        const retrieved = store.get(assertion.id);
        expect(retrieved!.status).toBe('expired');
        resolve(undefined);
      }, 150);
    });
  });
});

// ============================================================================
// TemporalStore - Retrieval Tests
// ============================================================================

describe('TemporalStore - Retrieval', () => {
  let store: TemporalStore;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    times = createTimePoints();
  });

  it('should retrieve assertion by ID', () => {
    const assertion = store.assert(
      'Test claim',
      'test-ns',
      { validFrom: times.past1h, validUntil: times.future1h },
    );

    const retrieved = store.get(assertion.id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(assertion.id);
    expect(retrieved!.claim).toBe('Test claim');
  });

  it('should return undefined for non-existent ID', () => {
    const retrieved = store.get('non-existent-id');
    expect(retrieved).toBeUndefined();
  });

  it('should get all active assertions at a specific point in time', () => {
    store.assert('Past', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });
    store.assert('Active1', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('Active2', 'test-ns', { validFrom: times.past30m, validUntil: times.future30m });
    store.assert('Future', 'test-ns', { validFrom: times.future1h, validUntil: times.future2h });

    const active = store.getActiveAt(times.now);

    expect(active).toHaveLength(2);
    expect(active.every(a => a.status === 'active')).toBe(true);
    expect(active.map(a => a.claim).sort()).toEqual(['Active1', 'Active2']);
  });

  it('should filter getActiveAt by namespace', () => {
    store.assert('NS1 Active', 'ns1', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('NS2 Active', 'ns2', { validFrom: times.past1h, validUntil: times.future1h });

    const ns1Active = store.getActiveAt(times.now, 'ns1');
    const ns2Active = store.getActiveAt(times.now, 'ns2');

    expect(ns1Active).toHaveLength(1);
    expect(ns1Active[0].claim).toBe('NS1 Active');
    expect(ns2Active).toHaveLength(1);
    expect(ns2Active[0].claim).toBe('NS2 Active');
  });

  it('should return active assertions sorted by assertedAt descending', () => {
    const assertion1 = store.assert('First', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    // Small delay to ensure different assertedAt times
    const assertion2 = store.assert('Second', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const active = store.getActiveAt(times.now);

    expect(active).toHaveLength(2);
    expect(active[0].window.assertedAt).toBeGreaterThanOrEqual(active[1].window.assertedAt);
  });

  it('should get currently active assertions via getCurrentTruth', () => {
    store.assert('Active Now', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('Expired', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });

    const current = store.getCurrentTruth('test-ns');

    expect(current).toHaveLength(1);
    expect(current[0].claim).toBe('Active Now');
    expect(current[0].status).toBe('active');
  });

  it('should exclude retracted assertions from getActiveAt', () => {
    const assertion = store.assert('Will retract', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    store.retract(assertion.id);
    const active = store.getActiveAt(times.now);

    expect(active).toHaveLength(0);
  });

  it('should exclude superseded assertions from getActiveAt', () => {
    const old = store.assert('Old', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    store.supersede(old.id, 'New', { validFrom: times.now, validUntil: times.future1h });
    const active = store.getActiveAt(times.now);

    expect(active).toHaveLength(1);
    expect(active[0].claim).toBe('New');
  });
});

// ============================================================================
// TemporalStore - History and Query Tests
// ============================================================================

describe('TemporalStore - History and Query', () => {
  let store: TemporalStore;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    times = createTimePoints();
  });

  it('should get history of a claim ordered by assertedAt ascending', () => {
    const claim = 'System status';
    const ns = 'system';

    const assertion1 = store.assert(claim, ns, {
      validFrom: times.past3h,
      validUntil: times.past2h,
    });
    const assertion2 = store.assert(claim, ns, {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const history = store.getHistory(claim, ns);

    expect(history).toHaveLength(2);
    expect(history[0].id).toBe(assertion1.id);
    expect(history[1].id).toBe(assertion2.id);
    expect(history[0].window.assertedAt).toBeLessThanOrEqual(history[1].window.assertedAt);
  });

  it('should get history only for matching claim and namespace', () => {
    store.assert('Claim A', 'ns1', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('Claim B', 'ns1', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('Claim A', 'ns2', { validFrom: times.past1h, validUntil: times.future1h });

    const history = store.getHistory('Claim A', 'ns1');

    expect(history).toHaveLength(1);
    expect(history[0].claim).toBe('Claim A');
    expect(history[0].namespace).toBe('ns1');
  });

  it('should query assertions with namespace filter', () => {
    store.assert('NS1 Claim', 'ns1', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('NS2 Claim', 'ns2', { validFrom: times.past1h, validUntil: times.future1h });

    const results = store.query({ namespace: 'ns1' });

    expect(results).toHaveLength(1);
    expect(results[0].namespace).toBe('ns1');
  });

  it('should query assertions with pointInTime filter', () => {
    store.assert('Past', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });
    store.assert('Active', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });

    const results = store.query({ pointInTime: times.now });

    expect(results).toHaveLength(1);
    expect(results[0].claim).toBe('Active');
  });

  it('should query assertions with status filter', () => {
    store.assert('Active', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('Expired', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });
    store.assert('Future', 'test-ns', { validFrom: times.future1h, validUntil: times.future2h });

    const results = store.query({ status: ['expired', 'future'] });

    expect(results).toHaveLength(2);
    expect(results.map(r => r.status).sort()).toEqual(['expired', 'future']);
  });

  it('should query assertions with source filter', () => {
    store.assert('Source1', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h }, {
      source: 'source-a',
    });
    store.assert('Source2', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h }, {
      source: 'source-b',
    });

    const results = store.query({ source: 'source-a' });

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('source-a');
  });

  it('should query assertions with tags filter (all must be present)', () => {
    store.assert('Tagged1', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h }, {
      tags: ['tag-a', 'tag-b'],
    });
    store.assert('Tagged2', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h }, {
      tags: ['tag-a'],
    });
    store.assert('Tagged3', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h }, {
      tags: ['tag-b', 'tag-c'],
    });

    const results = store.query({ tags: ['tag-a', 'tag-b'] });

    expect(results).toHaveLength(1);
    expect(results[0].claim).toBe('Tagged1');
  });

  it('should query with multiple filters combined', () => {
    store.assert('Match', 'ns1', { validFrom: times.past1h, validUntil: times.future1h }, {
      source: 'test-source',
      tags: ['tag-a'],
    });
    store.assert('No Match NS', 'ns2', { validFrom: times.past1h, validUntil: times.future1h }, {
      source: 'test-source',
      tags: ['tag-a'],
    });
    store.assert('No Match Source', 'ns1', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    }, { source: 'other-source', tags: ['tag-a'] });

    const results = store.query({
      namespace: 'ns1',
      source: 'test-source',
      tags: ['tag-a'],
    });

    expect(results).toHaveLength(1);
    expect(results[0].claim).toBe('Match');
  });

  it('should return query results sorted by assertedAt descending', () => {
    const assertion1 = store.assert('First', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });
    const assertion2 = store.assert('Second', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const results = store.query({ namespace: 'test-ns' });

    expect(results).toHaveLength(2);
    expect(results[0].window.assertedAt).toBeGreaterThanOrEqual(results[1].window.assertedAt);
  });
});

// ============================================================================
// TemporalStore - Supersession Tests
// ============================================================================

describe('TemporalStore - Supersession', () => {
  let store: TemporalStore;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    times = createTimePoints();
  });

  it('should supersede an existing assertion', () => {
    const old = store.assert('Old version', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const newAssertion = store.supersede(old.id, 'New version', {
      validFrom: times.now,
      validUntil: times.future1h,
    });

    expect(newAssertion).toBeDefined();
    expect(newAssertion!.claim).toBe('New version');
    expect(newAssertion!.supersedes).toBe(old.id);

    const retrievedOld = store.get(old.id);
    expect(retrievedOld!.status).toBe('superseded');
    expect(retrievedOld!.supersededBy).toBe(newAssertion!.id);
  });

  it('should create bidirectional supersession links', () => {
    const old = store.assert('Old', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const newAssertion = store.supersede(old.id, 'New', {
      validFrom: times.now,
      validUntil: times.future1h,
    });

    const retrievedOld = store.get(old.id);
    const retrievedNew = store.get(newAssertion!.id);

    expect(retrievedOld!.supersededBy).toBe(retrievedNew!.id);
    expect(retrievedNew!.supersedes).toBe(retrievedOld!.id);
  });

  it('should return undefined when superseding non-existent assertion', () => {
    const result = store.supersede('non-existent-id', 'New', {
      validFrom: times.now,
      validUntil: times.future1h,
    });

    expect(result).toBeUndefined();
  });

  it('should preserve namespace when superseding', () => {
    const old = store.assert('Old', 'specific-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const newAssertion = store.supersede(old.id, 'New', {
      validFrom: times.now,
      validUntil: times.future1h,
    });

    expect(newAssertion!.namespace).toBe('specific-ns');
  });

  it('should allow superseding with custom options', () => {
    const old = store.assert('Old', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const newAssertion = store.supersede(
      old.id,
      'New',
      { validFrom: times.now, validUntil: times.future1h },
      { confidence: 0.9, source: 'test-source', tags: ['updated'] },
    );

    expect(newAssertion!.confidence).toBe(0.9);
    expect(newAssertion!.source).toBe('test-source');
    expect(newAssertion!.tags).toEqual(['updated']);
  });

  it('should build supersession chain with multiple replacements', () => {
    const v1 = store.assert('v1', 'test-ns', {
      validFrom: times.past3h,
      validUntil: times.past2h,
    });
    const v2 = store.supersede(v1.id, 'v2', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });
    const v3 = store.supersede(v2!.id, 'v3', {
      validFrom: times.now,
      validUntil: times.future1h,
    });

    const retrievedV1 = store.get(v1.id);
    const retrievedV2 = store.get(v2!.id);
    const retrievedV3 = store.get(v3!.id);

    expect(retrievedV1!.supersededBy).toBe(v2!.id);
    expect(retrievedV2!.supersededBy).toBe(v3!.id);
    expect(retrievedV2!.supersedes).toBe(v1.id);
    expect(retrievedV3!.supersedes).toBe(v2!.id);
  });
});

// ============================================================================
// TemporalStore - Retraction Tests
// ============================================================================

describe('TemporalStore - Retraction', () => {
  let store: TemporalStore;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    times = createTimePoints();
  });

  it('should retract an assertion', () => {
    const assertion = store.assert('To retract', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const retracted = store.retract(assertion.id);

    expect(retracted).toBeDefined();
    expect(retracted!.status).toBe('retracted');
    expect(retracted!.window.retractedAt).toBeGreaterThanOrEqual(times.now);
  });

  it('should store retraction reason in metadata', () => {
    const assertion = store.assert('To retract', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    store.retract(assertion.id, 'Test reason');
    const retrieved = store.get(assertion.id);

    expect(retrieved!.metadata.retractedReason).toBe('Test reason');
  });

  it('should return undefined when retracting non-existent assertion', () => {
    const result = store.retract('non-existent-id');
    expect(result).toBeUndefined();
  });

  it('should preserve retracted assertions in store', () => {
    const assertion = store.assert('To retract', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    store.retract(assertion.id);

    expect(store.size).toBe(1);
    expect(store.get(assertion.id)).toBeDefined();
  });

  it('should allow retracting already superseded assertion', () => {
    const old = store.assert('Old', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    store.supersede(old.id, 'New', { validFrom: times.now, validUntil: times.future1h });
    const retracted = store.retract(old.id);

    expect(retracted!.status).toBe('retracted');
  });
});

// ============================================================================
// TemporalStore - Timeline Tests
// ============================================================================

describe('TemporalStore - Timeline', () => {
  let store: TemporalStore;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    times = createTimePoints();
  });

  it('should get timeline for single assertion', () => {
    const assertion = store.assert('Single', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const timeline = store.getTimeline(assertion.id);

    expect(timeline).toBeDefined();
    expect(timeline!.assertion.id).toBe(assertion.id);
    expect(timeline!.predecessors).toHaveLength(0);
    expect(timeline!.successors).toHaveLength(0);
  });

  it('should get timeline with predecessors', () => {
    const v1 = store.assert('v1', 'test-ns', {
      validFrom: times.past3h,
      validUntil: times.past2h,
    });
    const v2 = store.supersede(v1.id, 'v2', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });
    const v3 = store.supersede(v2!.id, 'v3', {
      validFrom: times.now,
      validUntil: times.future1h,
    });

    const timeline = store.getTimeline(v3!.id);

    expect(timeline!.predecessors).toHaveLength(2);
    expect(timeline!.predecessors[0].id).toBe(v1.id);
    expect(timeline!.predecessors[1].id).toBe(v2!.id);
    expect(timeline!.successors).toHaveLength(0);
  });

  it('should get timeline with successors', () => {
    const v1 = store.assert('v1', 'test-ns', {
      validFrom: times.past3h,
      validUntil: times.past2h,
    });
    const v2 = store.supersede(v1.id, 'v2', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });
    const v3 = store.supersede(v2!.id, 'v3', {
      validFrom: times.now,
      validUntil: times.future1h,
    });

    const timeline = store.getTimeline(v1.id);

    expect(timeline!.predecessors).toHaveLength(0);
    expect(timeline!.successors).toHaveLength(2);
    expect(timeline!.successors[0].id).toBe(v2!.id);
    expect(timeline!.successors[1].id).toBe(v3!.id);
  });

  it('should get timeline with both predecessors and successors', () => {
    const v1 = store.assert('v1', 'test-ns', {
      validFrom: times.past3h,
      validUntil: times.past2h,
    });
    const v2 = store.supersede(v1.id, 'v2', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });
    const v3 = store.supersede(v2!.id, 'v3', {
      validFrom: times.now,
      validUntil: times.future1h,
    });

    const timeline = store.getTimeline(v2!.id);

    expect(timeline!.predecessors).toHaveLength(1);
    expect(timeline!.predecessors[0].id).toBe(v1.id);
    expect(timeline!.successors).toHaveLength(1);
    expect(timeline!.successors[0].id).toBe(v3!.id);
  });

  it('should return undefined for non-existent assertion timeline', () => {
    const timeline = store.getTimeline('non-existent-id');
    expect(timeline).toBeUndefined();
  });

  it('should handle cycles in supersession chain gracefully', () => {
    const v1 = store.assert('v1', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });
    const v2 = store.supersede(v1.id, 'v2', {
      validFrom: times.now,
      validUntil: times.future1h,
    });

    // Manually create a cycle (should not happen in normal usage)
    const retrievedV1 = store.get(v1.id);
    if (retrievedV1) {
      retrievedV1.supersedes = v2!.id; // Create cycle: v1 → v2 → v1
    }

    const timeline = store.getTimeline(v1.id);

    expect(timeline).toBeDefined();
    // Should not infinite loop; visited set prevents re-traversal
    // v2 is found in predecessors (via supersedes chain), so it's already visited
    // when the successor walk reaches it, resulting in no successors
    const totalNodes = 1 + timeline!.predecessors.length + timeline!.successors.length;
    expect(totalNodes).toBeGreaterThan(0);
    expect(totalNodes).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// TemporalStore - Conflict Detection Tests
// ============================================================================

describe('TemporalStore - Conflict Detection', () => {
  let store: TemporalStore;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    times = createTimePoints();
  });

  it('should detect no conflicts when single assertion is active', () => {
    store.assert('Only active', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const conflicts = store.reconcile('test-ns');

    expect(conflicts).toHaveLength(0);
  });

  it('should detect no conflicts when no assertions are active', () => {
    store.assert('Expired', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });
    store.assert('Future', 'test-ns', { validFrom: times.future1h, validUntil: times.future2h });

    const conflicts = store.reconcile('test-ns');

    expect(conflicts).toHaveLength(0);
  });

  it('should detect conflicts when multiple assertions are active', () => {
    store.assert('Active 1', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });
    store.assert('Active 2', 'test-ns', {
      validFrom: times.past30m,
      validUntil: times.future30m,
    });

    const conflicts = store.reconcile('test-ns');

    expect(conflicts).toHaveLength(2);
    expect(conflicts.map(c => c.claim).sort()).toEqual(['Active 1', 'Active 2']);
  });

  it('should detect conflicts at a specific point in time', () => {
    store.assert('Past active', 'test-ns', { validFrom: times.past3h, validUntil: times.past1h });
    store.assert('Currently active', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const pastConflicts = store.reconcile('test-ns', times.past2h);
    const currentConflicts = store.reconcile('test-ns', times.now);

    expect(pastConflicts).toHaveLength(0); // Only one was active in the past
    expect(currentConflicts).toHaveLength(0); // Only one is active now
  });

  it('should not detect conflicts across different namespaces', () => {
    store.assert('NS1 Active', 'ns1', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('NS2 Active', 'ns2', { validFrom: times.past1h, validUntil: times.future1h });

    const ns1Conflicts = store.reconcile('ns1');
    const ns2Conflicts = store.reconcile('ns2');

    expect(ns1Conflicts).toHaveLength(0);
    expect(ns2Conflicts).toHaveLength(0);
  });

  it('should exclude retracted assertions from conflict detection', () => {
    const assertion1 = store.assert('Active 1', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });
    store.assert('Active 2', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    store.retract(assertion1.id);
    const conflicts = store.reconcile('test-ns');

    expect(conflicts).toHaveLength(0);
  });
});

// ============================================================================
// TemporalStore - Export/Import Tests
// ============================================================================

describe('TemporalStore - Export/Import', () => {
  let store: TemporalStore;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    times = createTimePoints();
  });

  it('should export all assertions', () => {
    store.assert('Claim 1', 'ns1', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('Claim 2', 'ns2', { validFrom: times.past1h, validUntil: times.future1h });

    const exported = store.exportAssertions();

    expect(exported.assertions).toHaveLength(2);
    expect(exported.version).toBe(1);
    expect(exported.createdAt).toBeDefined();
  });

  it('should export assertions with all fields', () => {
    store.assert(
      'Test claim',
      'test-ns',
      { validFrom: times.past1h, validUntil: times.future1h },
      { confidence: 0.8, source: 'test', tags: ['tag1'], metadata: { key: 'value' } },
    );

    const exported = store.exportAssertions();
    const assertion = exported.assertions[0];

    expect(assertion.claim).toBe('Test claim');
    expect(assertion.namespace).toBe('test-ns');
    expect(assertion.confidence).toBe(0.8);
    expect(assertion.source).toBe('test');
    expect(assertion.tags).toEqual(['tag1']);
    expect(assertion.metadata).toEqual({ key: 'value' });
  });

  it('should import assertions from export', () => {
    store.assert('Claim 1', 'ns1', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('Claim 2', 'ns2', { validFrom: times.past1h, validUntil: times.future1h });

    const exported = store.exportAssertions();

    const newStore = createTemporalStore();
    newStore.importAssertions(exported);

    expect(newStore.size).toBe(2);
    expect(newStore.query({ namespace: 'ns1' })).toHaveLength(1);
    expect(newStore.query({ namespace: 'ns2' })).toHaveLength(1);
  });

  it('should clear existing assertions on import', () => {
    store.assert('Old', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });

    const exported = store.exportAssertions();

    store.assert('New', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });
    expect(store.size).toBe(2);

    store.importAssertions(exported);
    expect(store.size).toBe(1);
    expect(store.query({ namespace: 'test-ns' })[0].claim).toBe('Old');
  });

  it('should throw error for unsupported version on import', () => {
    const invalidExport: SerializedTemporalStore = {
      assertions: [],
      createdAt: new Date().toISOString(),
      version: 999,
    };

    expect(() => store.importAssertions(invalidExport)).toThrow('Unsupported temporal store version');
  });

  it('should preserve supersession links on export/import', () => {
    const old = store.assert('Old', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });
    const newAssertion = store.supersede(old.id, 'New', {
      validFrom: times.now,
      validUntil: times.future1h,
    });

    const exported = store.exportAssertions();
    const newStore = createTemporalStore();
    newStore.importAssertions(exported);

    const importedOld = newStore.get(old.id);
    const importedNew = newStore.get(newAssertion!.id);

    expect(importedOld!.supersededBy).toBe(importedNew!.id);
    expect(importedNew!.supersedes).toBe(importedOld!.id);
  });
});

// ============================================================================
// TemporalStore - Pruning Tests
// ============================================================================

describe('TemporalStore - Pruning', () => {
  let store: TemporalStore;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    times = createTimePoints();
  });

  it('should prune expired assertions before cutoff time', () => {
    store.assert('Old expired', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });
    store.assert('Recent expired', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.past30m,
    });
    store.assert('Active', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });

    const pruned = store.pruneExpired(times.past1h);

    expect(pruned).toBe(1);
    expect(store.size).toBe(2);
  });

  it('should not prune active assertions', () => {
    store.assert('Active', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });

    const pruned = store.pruneExpired(times.future1h);

    expect(pruned).toBe(0);
    expect(store.size).toBe(1);
  });

  it('should not prune future assertions', () => {
    store.assert('Future', 'test-ns', { validFrom: times.future1h, validUntil: times.future2h });

    const pruned = store.pruneExpired(times.now);

    expect(pruned).toBe(0);
    expect(store.size).toBe(1);
  });

  it('should not prune retracted assertions', () => {
    const assertion = store.assert('To retract', 'test-ns', {
      validFrom: times.past3h,
      validUntil: times.past2h,
    });
    store.retract(assertion.id);

    const pruned = store.pruneExpired(times.past1h);

    expect(pruned).toBe(0);
    expect(store.size).toBe(1);
  });

  it('should not prune superseded assertions', () => {
    const old = store.assert('Old', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });
    store.supersede(old.id, 'New', { validFrom: times.now, validUntil: times.future1h });

    const pruned = store.pruneExpired(times.past1h);

    expect(pruned).toBe(0);
    expect(store.size).toBe(2);
  });

  it('should not prune assertions with null validUntil', () => {
    store.assert('Indefinite', 'test-ns', { validFrom: times.past1h, validUntil: null });

    const pruned = store.pruneExpired(times.now);

    expect(pruned).toBe(0);
    expect(store.size).toBe(1);
  });

  it('should return count of pruned assertions', () => {
    store.assert('Expired 1', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });
    store.assert('Expired 2', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });
    store.assert('Expired 3', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });

    const pruned = store.pruneExpired(times.now);

    expect(pruned).toBe(3);
    expect(store.size).toBe(0);
  });
});

// ============================================================================
// TemporalStore - Configuration and Management Tests
// ============================================================================

describe('TemporalStore - Configuration and Management', () => {
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    times = createTimePoints();
  });

  it('should create store with default configuration', () => {
    const store = createTemporalStore();
    const config = store.getConfig();

    expect(config.maxAssertions).toBe(100_000);
    expect(config.autoExpireCheckIntervalMs).toBe(60_000);
  });

  it('should create store with custom configuration', () => {
    const store = createTemporalStore({
      maxAssertions: 1000,
      autoExpireCheckIntervalMs: 30_000,
    });
    const config = store.getConfig();

    expect(config.maxAssertions).toBe(1000);
    expect(config.autoExpireCheckIntervalMs).toBe(30_000);
  });

  it('should track store size', () => {
    const store = createTemporalStore();

    expect(store.size).toBe(0);

    store.assert('Claim 1', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });
    expect(store.size).toBe(1);

    store.assert('Claim 2', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });
    expect(store.size).toBe(2);
  });

  it('should clear all assertions', () => {
    const store = createTemporalStore();

    store.assert('Claim 1', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('Claim 2', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });

    expect(store.size).toBe(2);

    store.clear();
    expect(store.size).toBe(0);
  });

  it('should enforce capacity by pruning oldest expired assertions', () => {
    const store = createTemporalStore({ maxAssertions: 3 });

    // Add expired assertions
    store.assert('Expired 1', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });
    store.assert('Expired 2', 'test-ns', {
      validFrom: times.past2h,
      validUntil: times.past1h,
    });

    // Add active assertion
    store.assert('Active', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });

    expect(store.size).toBe(3);

    // Adding one more should trigger capacity enforcement
    store.assert('New', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });

    // Should have pruned the oldest expired assertion
    expect(store.size).toBe(3);
  });

  it('should return immutable config copy', () => {
    const store = createTemporalStore({ maxAssertions: 1000 });
    const config1 = store.getConfig();
    config1.maxAssertions = 500;

    const config2 = store.getConfig();
    expect(config2.maxAssertions).toBe(1000);
  });
});

// ============================================================================
// TemporalReasoner - Basic Reasoning Tests
// ============================================================================

describe('TemporalReasoner - Basic Reasoning', () => {
  let store: TemporalStore;
  let reasoner: TemporalReasoner;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    reasoner = createTemporalReasoner(store);
    times = createTimePoints();
  });

  it('should answer what was true in the past', () => {
    store.assert('Past fact', 'test-ns', { validFrom: times.past3h, validUntil: times.past1h });
    store.assert('Current fact', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const pastTruth = reasoner.whatWasTrue('test-ns', times.past2h);

    expect(pastTruth).toHaveLength(1);
    expect(pastTruth[0].claim).toBe('Past fact');
  });

  it('should answer what is true right now', () => {
    store.assert('Past fact', 'test-ns', { validFrom: times.past3h, validUntil: times.past1h });
    store.assert('Current fact', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });
    store.assert('Future fact', 'test-ns', {
      validFrom: times.future1h,
      validUntil: times.future2h,
    });

    const currentTruth = reasoner.whatIsTrue('test-ns');

    expect(currentTruth).toHaveLength(1);
    expect(currentTruth[0].claim).toBe('Current fact');
  });

  it('should answer what will be true in the future', () => {
    store.assert('Current fact', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });
    store.assert('Future fact', 'test-ns', {
      validFrom: times.future1h,
      validUntil: times.future2h,
    });

    const futureTruth = reasoner.whatWillBeTrue('test-ns', times.future1h + 1000);

    expect(futureTruth).toHaveLength(1);
    expect(futureTruth[0].claim).toBe('Future fact');
  });

  it('should return empty array when nothing was true in the past', () => {
    store.assert('Current fact', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const pastTruth = reasoner.whatWasTrue('test-ns', times.past3h);

    expect(pastTruth).toHaveLength(0);
  });

  it('should return empty array when nothing is true right now', () => {
    store.assert('Past fact', 'test-ns', { validFrom: times.past3h, validUntil: times.past1h });
    store.assert('Future fact', 'test-ns', {
      validFrom: times.future1h,
      validUntil: times.future2h,
    });

    const currentTruth = reasoner.whatIsTrue('test-ns');

    expect(currentTruth).toHaveLength(0);
  });

  it('should return empty array when nothing will be true in the future', () => {
    store.assert('Current fact', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const futureTruth = reasoner.whatWillBeTrue('test-ns', times.future2h);

    expect(futureTruth).toHaveLength(0);
  });
});

// ============================================================================
// TemporalReasoner - Change Detection Tests
// ============================================================================

describe('TemporalReasoner - Change Detection', () => {
  let store: TemporalStore;
  let reasoner: TemporalReasoner;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    reasoner = createTemporalReasoner(store);
    times = createTimePoints();
  });

  it('should detect new assertions as changes', () => {
    const checkpoint = times.past1h;

    store.assert('New claim', 'test-ns', { validFrom: times.now, validUntil: times.future1h });

    const changes = reasoner.hasChanged('test-ns', checkpoint);

    expect(changes).toHaveLength(1);
    expect(changes[0].changeType).toBe('asserted');
    expect(changes[0].assertion.claim).toBe('New claim');
  });

  it('should detect retracted assertions as changes', () => {
    const assertion = store.assert('To retract', 'test-ns', {
      validFrom: times.past2h,
      validUntil: times.future1h,
    });

    const checkpoint = times.past1h;
    store.retract(assertion.id);

    const changes = reasoner.hasChanged('test-ns', checkpoint);

    expect(changes.some(c => c.changeType === 'retracted')).toBe(true);
  });

  it('should detect superseded assertions as changes', () => {
    const old = store.assert('Old', 'test-ns', {
      validFrom: times.past2h,
      validUntil: times.future1h,
    });

    const checkpoint = times.past1h;
    store.supersede(old.id, 'New', { validFrom: times.now, validUntil: times.future1h });

    const changes = reasoner.hasChanged('test-ns', checkpoint);

    expect(changes.some(c => c.changeType === 'superseded')).toBe(true);
    expect(changes.some(c => c.changeType === 'asserted')).toBe(true);
  });

  it('should detect expired assertions as changes', () => {
    const checkpoint = times.past1h;

    store.assert('Expired recently', 'test-ns', {
      validFrom: times.past2h,
      validUntil: times.past30m,
    });

    const changes = reasoner.hasChanged('test-ns', checkpoint);

    expect(changes.some(c => c.changeType === 'expired')).toBe(true);
  });

  it('should sort changes by changedAt timestamp', () => {
    const checkpoint = times.past2h;

    store.assert('First', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('Second', 'test-ns', { validFrom: times.now, validUntil: times.future1h });

    const changes = reasoner.hasChanged('test-ns', checkpoint);

    expect(changes.length).toBeGreaterThan(0);
    for (let i = 1; i < changes.length; i++) {
      expect(changes[i].changedAt).toBeGreaterThanOrEqual(changes[i - 1].changedAt);
    }
  });

  it('should not detect changes before checkpoint', () => {
    // Create the assertion first, then set checkpoint AFTER it was created
    store.assert('Old', 'test-ns', { validFrom: times.past3h, validUntil: times.past2h });

    // Checkpoint must be after the assertion's assertedAt (Date.now()) to avoid
    // detecting the assertion itself as a new change
    const checkpoint = Date.now() + 1;
    const changes = reasoner.hasChanged('test-ns', checkpoint);

    expect(changes).toHaveLength(0);
  });

  it('should include all change types in a complex scenario', () => {
    const checkpoint = times.past1h;

    // New assertion
    store.assert('New', 'test-ns', { validFrom: times.now, validUntil: times.future1h });

    // Retracted assertion
    const toRetract = store.assert('Retracted', 'test-ns', {
      validFrom: times.past2h,
      validUntil: times.future1h,
    });
    store.retract(toRetract.id);

    // Superseded assertion
    const old = store.assert('Old', 'test-ns', {
      validFrom: times.past2h,
      validUntil: times.future1h,
    });
    store.supersede(old.id, 'Replacement', { validFrom: times.now, validUntil: times.future1h });

    // Expired assertion
    store.assert('Expired', 'test-ns', { validFrom: times.past2h, validUntil: times.past30m });

    const changes = reasoner.hasChanged('test-ns', checkpoint);

    const changeTypes = new Set(changes.map(c => c.changeType));
    expect(changeTypes.has('asserted')).toBe(true);
    expect(changeTypes.has('retracted')).toBe(true);
    expect(changeTypes.has('superseded')).toBe(true);
    expect(changeTypes.has('expired')).toBe(true);
  });
});

// ============================================================================
// TemporalReasoner - Conflict and Projection Tests
// ============================================================================

describe('TemporalReasoner - Conflict and Projection', () => {
  let store: TemporalStore;
  let reasoner: TemporalReasoner;
  let times: ReturnType<typeof createTimePoints>;

  beforeEach(() => {
    store = createTemporalStore();
    reasoner = createTemporalReasoner(store);
    times = createTimePoints();
  });

  it('should detect conflicts when multiple assertions are active', () => {
    store.assert('Claim 1', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });
    store.assert('Claim 2', 'test-ns', {
      validFrom: times.past30m,
      validUntil: times.future30m,
    });

    const conflicts = reasoner.conflictsAt('test-ns');

    expect(conflicts).toHaveLength(2);
  });

  it('should not detect conflicts when only one assertion is active', () => {
    store.assert('Only one', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });

    const conflicts = reasoner.conflictsAt('test-ns');

    expect(conflicts).toHaveLength(0);
  });

  it('should detect conflicts at a specific point in time', () => {
    store.assert('Past conflict 1', 'test-ns', {
      validFrom: times.past3h,
      validUntil: times.past1h,
    });
    store.assert('Past conflict 2', 'test-ns', {
      validFrom: times.past3h,
      validUntil: times.past1h,
    });
    store.assert('Current single', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future1h,
    });

    const pastConflicts = reasoner.conflictsAt('test-ns', times.past2h);
    const currentConflicts = reasoner.conflictsAt('test-ns', times.now);

    expect(pastConflicts).toHaveLength(2);
    expect(currentConflicts).toHaveLength(0);
  });

  it('should project assertion forward to future time when valid', () => {
    const assertion = store.assert('Long-lived', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future2h,
    });

    const willBeActive = reasoner.projectForward(assertion.id, times.future1h);

    expect(willBeActive).toBe(true);
  });

  it('should project assertion forward to false when expired', () => {
    const assertion = store.assert('Short-lived', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future30m,
    });

    const willBeActive = reasoner.projectForward(assertion.id, times.future1h);

    expect(willBeActive).toBe(false);
  });

  it('should project assertion forward to false when retracted', () => {
    const assertion = store.assert('To retract', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future2h,
    });

    store.retract(assertion.id);
    const willBeActive = reasoner.projectForward(assertion.id, times.future1h);

    expect(willBeActive).toBe(false);
  });

  it('should project assertion forward to false when superseded', () => {
    const old = store.assert('Old', 'test-ns', {
      validFrom: times.past1h,
      validUntil: times.future2h,
    });

    store.supersede(old.id, 'New', { validFrom: times.now, validUntil: times.future2h });
    const willBeActive = reasoner.projectForward(old.id, times.future1h);

    expect(willBeActive).toBe(false);
  });

  it('should return false when projecting non-existent assertion', () => {
    const willBeActive = reasoner.projectForward('non-existent-id', times.future1h);

    expect(willBeActive).toBe(false);
  });

  it('should project future assertion correctly', () => {
    const assertion = store.assert('Future', 'test-ns', {
      validFrom: times.future1h,
      validUntil: times.future2h,
    });

    const willBeActiveBefore = reasoner.projectForward(assertion.id, times.future30m);
    const willBeActiveDuring = reasoner.projectForward(assertion.id, times.future1h + 1000);
    const willBeActiveAfter = reasoner.projectForward(assertion.id, times.future2h + 1000);

    expect(willBeActiveBefore).toBe(false);
    expect(willBeActiveDuring).toBe(true);
    expect(willBeActiveAfter).toBe(false);
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe('Factory Functions', () => {
  it('should create TemporalStore with factory function', () => {
    const store = createTemporalStore({ maxAssertions: 5000 });

    expect(store).toBeInstanceOf(TemporalStore);
    expect(store.getConfig().maxAssertions).toBe(5000);
  });

  it('should create TemporalReasoner with factory function', () => {
    const store = createTemporalStore();
    const reasoner = createTemporalReasoner(store);

    expect(reasoner).toBeInstanceOf(TemporalReasoner);
  });

  it('should create reasoner that works with its store', () => {
    const store = createTemporalStore();
    const reasoner = createTemporalReasoner(store);
    const times = createTimePoints();

    store.assert('Test', 'test-ns', { validFrom: times.past1h, validUntil: times.future1h });

    const truth = reasoner.whatIsTrue('test-ns');

    expect(truth).toHaveLength(1);
    expect(truth[0].claim).toBe('Test');
  });
});
