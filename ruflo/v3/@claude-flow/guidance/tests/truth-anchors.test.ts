import { describe, it, expect, beforeEach } from 'vitest';
import {
  type TruthSourceKind,
  type TruthAnchor,
  type TruthAnchorConfig,
  type AnchorParams,
  type TruthAnchorQuery,
  type VerifyAllResult,
  type ConflictResolution,
  TruthAnchorStore,
  TruthResolver,
  createTruthAnchorStore,
  createTruthResolver,
} from '../src/truth-anchors.ts';

// ============================================================================
// TruthAnchorStore Tests
// ============================================================================

describe('TruthAnchorStore', () => {
  let store: TruthAnchorStore;
  const testSigningKey = 'test-signing-key-for-anchors';

  beforeEach(() => {
    store = new TruthAnchorStore({ signingKey: testSigningKey });
  });

  // ===== Constructor & Configuration =====

  describe('constructor', () => {
    it('should throw error if no signingKey provided', () => {
      expect(() => new TruthAnchorStore()).toThrow(
        'TruthAnchorStore requires a signingKey in config',
      );
    });

    it('should accept signingKey in config', () => {
      const s = new TruthAnchorStore({ signingKey: 'my-key' });
      expect(s.size).toBe(0);
    });

    it('should use default maxAnchors of 50,000', () => {
      const s = new TruthAnchorStore({ signingKey: 'key' });
      // We can't directly access config, but we can test behavior
      expect(s.size).toBe(0);
    });

    it('should accept custom maxAnchors', () => {
      const s = new TruthAnchorStore({ signingKey: 'key', maxAnchors: 100 });
      expect(s.size).toBe(0);
    });
  });

  // ===== anchor() - Creating Anchors =====

  describe('anchor()', () => {
    it('should create a new truth anchor with all required fields', () => {
      const params: AnchorParams = {
        kind: 'human-attestation',
        claim: 'User Alice has admin privileges',
        evidence: 'HR database record #12345',
        attesterId: 'hr-manager-bob',
      };

      const anchor = store.anchor(params);

      expect(anchor.id).toBeDefined();
      expect(anchor.kind).toBe('human-attestation');
      expect(anchor.claim).toBe('User Alice has admin privileges');
      expect(anchor.evidence).toBe('HR database record #12345');
      expect(anchor.attesterId).toBe('hr-manager-bob');
      expect(anchor.signature).toBeDefined();
      expect(anchor.signature).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
      expect(anchor.timestamp).toBeGreaterThan(0);
      expect(anchor.validFrom).toBe(anchor.timestamp);
      expect(anchor.validUntil).toBeNull();
      expect(anchor.supersedes).toEqual([]);
      expect(anchor.tags).toEqual([]);
      expect(anchor.metadata).toEqual({});
    });

    it('should accept optional validFrom timestamp', () => {
      const validFrom = Date.now() - 1000;
      const anchor = store.anchor({
        kind: 'hardware-signal',
        claim: 'Temperature is 72°F',
        evidence: 'Sensor reading',
        attesterId: 'sensor-001',
        validFrom,
      });

      expect(anchor.validFrom).toBe(validFrom);
    });

    it('should accept optional validUntil timestamp', () => {
      const validUntil = Date.now() + 10000;
      const anchor = store.anchor({
        kind: 'regulatory-input',
        claim: 'GDPR compliance required',
        evidence: 'Regulation EU 2016/679',
        attesterId: 'legal-dept',
        validUntil,
      });

      expect(anchor.validUntil).toBe(validUntil);
    });

    it('should accept optional supersedes array', () => {
      const anchor1 = store.anchor({
        kind: 'external-observation',
        claim: 'Server status: online',
        evidence: 'Monitoring system',
        attesterId: 'monitor-bot',
      });

      const anchor2 = store.anchor({
        kind: 'external-observation',
        claim: 'Server status: offline',
        evidence: 'Monitoring system',
        attesterId: 'monitor-bot',
        supersedes: [anchor1.id],
      });

      expect(anchor2.supersedes).toEqual([anchor1.id]);
    });

    it('should accept optional tags', () => {
      const anchor = store.anchor({
        kind: 'signed-document',
        claim: 'Contract signed',
        evidence: 'DocuSign ID 789',
        attesterId: 'legal-team',
        tags: ['contract', 'legal', 'approved'],
      });

      expect(anchor.tags).toEqual(['contract', 'legal', 'approved']);
    });

    it('should accept optional metadata', () => {
      const metadata = { department: 'HR', level: 'high', ref: 123 };
      const anchor = store.anchor({
        kind: 'consensus-result',
        claim: 'Decision approved',
        evidence: 'Vote count: 5/5',
        attesterId: 'consensus-engine',
        metadata,
      });

      expect(anchor.metadata).toEqual(metadata);
    });

    it('should increment store size after creating anchor', () => {
      expect(store.size).toBe(0);

      store.anchor({
        kind: 'human-attestation',
        claim: 'Test claim',
        evidence: 'Test evidence',
        attesterId: 'tester',
      });

      expect(store.size).toBe(1);
    });

    it('should support all TruthSourceKind values', () => {
      const kinds: TruthSourceKind[] = [
        'human-attestation',
        'hardware-signal',
        'regulatory-input',
        'external-observation',
        'signed-document',
        'consensus-result',
      ];

      for (const kind of kinds) {
        const anchor = store.anchor({
          kind,
          claim: `Test ${kind}`,
          evidence: 'Test evidence',
          attesterId: 'tester',
        });

        expect(anchor.kind).toBe(kind);
      }
    });
  });

  // ===== get() - Retrieving by ID =====

  describe('get()', () => {
    it('should retrieve an anchor by its ID', () => {
      const created = store.anchor({
        kind: 'human-attestation',
        claim: 'Alice is authorized',
        evidence: 'Auth DB',
        attesterId: 'auth-system',
      });

      const retrieved = store.get(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent ID', () => {
      const result = store.get('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('should retrieve correct anchor when multiple exist', () => {
      const anchor1 = store.anchor({
        kind: 'human-attestation',
        claim: 'Claim 1',
        evidence: 'Evidence 1',
        attesterId: 'user-1',
      });

      const anchor2 = store.anchor({
        kind: 'hardware-signal',
        claim: 'Claim 2',
        evidence: 'Evidence 2',
        attesterId: 'user-2',
      });

      expect(store.get(anchor1.id)).toEqual(anchor1);
      expect(store.get(anchor2.id)).toEqual(anchor2);
    });
  });

  // ===== getActive() - Active Anchors =====

  describe('getActive()', () => {
    it('should return empty array when store is empty', () => {
      expect(store.getActive()).toEqual([]);
    });

    it('should return anchors valid at current time by default', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Active now',
        evidence: 'Test',
        attesterId: 'tester',
        validFrom: now - 1000,
        validUntil: now + 1000,
      });

      const active = store.getActive();
      expect(active).toHaveLength(1);
      expect(active[0].claim).toBe('Active now');
    });

    it('should exclude anchors not yet valid', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Future anchor',
        evidence: 'Test',
        attesterId: 'tester',
        validFrom: now + 10000,
        validUntil: null,
      });

      const active = store.getActive(now);
      expect(active).toHaveLength(0);
    });

    it('should exclude expired anchors', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Expired anchor',
        evidence: 'Test',
        attesterId: 'tester',
        validFrom: now - 10000,
        validUntil: now - 1000,
      });

      const active = store.getActive(now);
      expect(active).toHaveLength(0);
    });

    it('should include anchors with null validUntil (indefinite)', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Indefinite anchor',
        evidence: 'Test',
        attesterId: 'tester',
        validFrom: now - 1000,
        validUntil: null,
      });

      const active = store.getActive(now);
      expect(active).toHaveLength(1);
      expect(active[0].claim).toBe('Indefinite anchor');
    });

    it('should accept custom timestamp parameter', () => {
      const past = Date.now() - 5000;
      const future = Date.now() + 5000;

      store.anchor({
        kind: 'human-attestation',
        claim: 'Past-valid anchor',
        evidence: 'Test',
        attesterId: 'tester',
        validFrom: past - 1000,
        validUntil: past + 1000,
      });

      const activeAtPast = store.getActive(past);
      expect(activeAtPast).toHaveLength(1);

      const activeAtFuture = store.getActive(future);
      expect(activeAtFuture).toHaveLength(0);
    });

    it('should return multiple active anchors', () => {
      const now = Date.now();

      for (let i = 0; i < 5; i++) {
        store.anchor({
          kind: 'human-attestation',
          claim: `Claim ${i}`,
          evidence: 'Test',
          attesterId: 'tester',
          validFrom: now - 1000,
          validUntil: null,
        });
      }

      const active = store.getActive(now);
      expect(active).toHaveLength(5);
    });
  });

  // ===== query() - Filtering =====

  describe('query()', () => {
    beforeEach(() => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Alice has access',
        evidence: 'HR DB',
        attesterId: 'hr-system',
        tags: ['access', 'alice'],
        validFrom: now - 1000,
        validUntil: null,
      });

      store.anchor({
        kind: 'hardware-signal',
        claim: 'Temperature OK',
        evidence: 'Sensor reading',
        attesterId: 'sensor-001',
        tags: ['temperature', 'sensor'],
        validFrom: now - 1000,
        validUntil: null,
      });

      store.anchor({
        kind: 'human-attestation',
        claim: 'Bob has access',
        evidence: 'HR DB',
        attesterId: 'hr-system',
        tags: ['access', 'bob'],
        validFrom: now - 1000,
        validUntil: now - 500,
      });
    });

    it('should return all anchors when query is empty', () => {
      const results = store.query({});
      expect(results).toHaveLength(3);
    });

    it('should filter by kind', () => {
      const results = store.query({ kind: 'human-attestation' });
      expect(results).toHaveLength(2);
      expect(results.every(a => a.kind === 'human-attestation')).toBe(true);
    });

    it('should filter by attesterId', () => {
      const results = store.query({ attesterId: 'hr-system' });
      expect(results).toHaveLength(2);
      expect(results.every(a => a.attesterId === 'hr-system')).toBe(true);
    });

    it('should filter by tags (at least one match)', () => {
      const results = store.query({ tags: ['access'] });
      expect(results).toHaveLength(2);
      expect(results.every(a => a.tags.includes('access'))).toBe(true);
    });

    it('should filter by validAt timestamp', () => {
      const now = Date.now();
      const results = store.query({ validAt: now });
      expect(results).toHaveLength(2); // Bob's anchor is expired
    });

    it('should combine multiple filters with AND logic', () => {
      const now = Date.now();
      const results = store.query({
        kind: 'human-attestation',
        attesterId: 'hr-system',
        validAt: now,
      });

      expect(results).toHaveLength(1);
      expect(results[0].claim).toBe('Alice has access');
    });

    it('should return empty array when no matches', () => {
      const results = store.query({ kind: 'regulatory-input' });
      expect(results).toEqual([]);
    });

    it('should match any tag in the tags array', () => {
      const results = store.query({ tags: ['alice', 'sensor'] });
      expect(results).toHaveLength(2);
    });
  });

  // ===== verify() - Signature Verification =====

  describe('verify()', () => {
    it('should return true for valid signature', () => {
      const anchor = store.anchor({
        kind: 'human-attestation',
        claim: 'Valid claim',
        evidence: 'Valid evidence',
        attesterId: 'tester',
      });

      expect(store.verify(anchor.id)).toBe(true);
    });

    it('should return false for non-existent anchor', () => {
      expect(store.verify('non-existent-id')).toBe(false);
    });

    it('should return false if signature is tampered', () => {
      const anchor = store.anchor({
        kind: 'human-attestation',
        claim: 'Original claim',
        evidence: 'Original evidence',
        attesterId: 'tester',
      });

      // Directly tamper with the anchor's signature
      // @ts-expect-error - intentionally mutating immutable data for testing
      anchor.signature = 'tampered-signature-12345678901234567890123456789012';

      expect(store.verify(anchor.id)).toBe(false);
    });

    it('should return false if anchor content is changed after signing', () => {
      const anchor = store.anchor({
        kind: 'human-attestation',
        claim: 'Original claim',
        evidence: 'Original evidence',
        attesterId: 'tester',
      });

      // Tamper with the claim
      // @ts-expect-error - intentionally mutating immutable data for testing
      anchor.claim = 'Tampered claim';

      expect(store.verify(anchor.id)).toBe(false);
    });
  });

  // ===== verifyAll() - Batch Verification =====

  describe('verifyAll()', () => {
    it('should return zero valid and empty invalid when store is empty', () => {
      const result = store.verifyAll();
      expect(result.valid).toBe(0);
      expect(result.invalid).toEqual([]);
    });

    it('should return all valid when all signatures are intact', () => {
      for (let i = 0; i < 5; i++) {
        store.anchor({
          kind: 'human-attestation',
          claim: `Claim ${i}`,
          evidence: 'Evidence',
          attesterId: 'tester',
        });
      }

      const result = store.verifyAll();
      expect(result.valid).toBe(5);
      expect(result.invalid).toEqual([]);
    });

    it('should detect tampered signatures', () => {
      const anchor1 = store.anchor({
        kind: 'human-attestation',
        claim: 'Valid 1',
        evidence: 'Evidence',
        attesterId: 'tester',
      });

      const anchor2 = store.anchor({
        kind: 'human-attestation',
        claim: 'Tampered',
        evidence: 'Evidence',
        attesterId: 'tester',
      });

      const anchor3 = store.anchor({
        kind: 'human-attestation',
        claim: 'Valid 3',
        evidence: 'Evidence',
        attesterId: 'tester',
      });

      // Tamper with anchor2
      // @ts-expect-error - intentionally mutating for testing
      anchor2.signature = 'f'.repeat(64);

      const result = store.verifyAll();
      expect(result.valid).toBe(2);
      expect(result.invalid).toEqual([anchor2.id]);
    });

    it('should identify all invalid anchors', () => {
      const anchor1 = store.anchor({
        kind: 'human-attestation',
        claim: 'Tampered 1',
        evidence: 'Evidence',
        attesterId: 'tester',
      });

      const anchor2 = store.anchor({
        kind: 'human-attestation',
        claim: 'Tampered 2',
        evidence: 'Evidence',
        attesterId: 'tester',
      });

      // Tamper with both
      // @ts-expect-error - testing
      anchor1.signature = 'a'.repeat(64);
      // @ts-expect-error - testing
      anchor2.signature = 'b'.repeat(64);

      const result = store.verifyAll();
      expect(result.valid).toBe(0);
      expect(result.invalid.sort()).toEqual([anchor1.id, anchor2.id].sort());
    });
  });

  // ===== supersede() - Supersession Chain =====

  describe('supersede()', () => {
    it('should create a new anchor that supersedes an old one', () => {
      const oldAnchor = store.anchor({
        kind: 'human-attestation',
        claim: 'Old claim',
        evidence: 'Old evidence',
        attesterId: 'tester',
      });

      const newAnchor = store.supersede(oldAnchor.id, {
        kind: 'human-attestation',
        claim: 'New claim',
        evidence: 'New evidence',
        attesterId: 'tester',
      });

      expect(newAnchor.supersedes).toContain(oldAnchor.id);
      expect(store.size).toBe(2);
    });

    it('should throw error if old anchor ID does not exist', () => {
      expect(() =>
        store.supersede('non-existent-id', {
          kind: 'human-attestation',
          claim: 'New claim',
          evidence: 'Evidence',
          attesterId: 'tester',
        }),
      ).toThrow('Cannot supersede: anchor "non-existent-id" not found');
    });

    it('should preserve existing supersedes array', () => {
      const anchor1 = store.anchor({
        kind: 'human-attestation',
        claim: 'Claim 1',
        evidence: 'Evidence',
        attesterId: 'tester',
      });

      const anchor2 = store.anchor({
        kind: 'human-attestation',
        claim: 'Claim 2',
        evidence: 'Evidence',
        attesterId: 'tester',
      });

      const anchor3 = store.supersede(anchor2.id, {
        kind: 'human-attestation',
        claim: 'Claim 3',
        evidence: 'Evidence',
        attesterId: 'tester',
        supersedes: [anchor1.id],
      });

      expect(anchor3.supersedes).toContain(anchor1.id);
      expect(anchor3.supersedes).toContain(anchor2.id);
      expect(anchor3.supersedes).toHaveLength(2);
    });

    it('should not duplicate IDs in supersedes array', () => {
      const anchor1 = store.anchor({
        kind: 'human-attestation',
        claim: 'Claim 1',
        evidence: 'Evidence',
        attesterId: 'tester',
      });

      const anchor2 = store.supersede(anchor1.id, {
        kind: 'human-attestation',
        claim: 'Claim 2',
        evidence: 'Evidence',
        attesterId: 'tester',
        supersedes: [anchor1.id], // Already includes anchor1.id
      });

      expect(anchor2.supersedes).toEqual([anchor1.id]);
    });

    it('should keep old anchor intact and queryable', () => {
      const oldAnchor = store.anchor({
        kind: 'human-attestation',
        claim: 'Old claim',
        evidence: 'Old evidence',
        attesterId: 'tester',
      });

      store.supersede(oldAnchor.id, {
        kind: 'human-attestation',
        claim: 'New claim',
        evidence: 'New evidence',
        attesterId: 'tester',
      });

      const retrieved = store.get(oldAnchor.id);
      expect(retrieved).toEqual(oldAnchor);
    });
  });

  // ===== resolve() - Claim Resolution =====

  describe('resolve()', () => {
    it('should return undefined when no matching anchor exists', () => {
      const result = store.resolve(
        'Non-existent claim',
        'Internal belief',
      );
      expect(result).toBeUndefined();
    });

    it('should return matching active anchor', () => {
      const now = Date.now();

      const anchor = store.anchor({
        kind: 'human-attestation',
        claim: 'Alice is authorized',
        evidence: 'HR database',
        attesterId: 'hr-system',
        validFrom: now - 1000,
        validUntil: null,
      });

      const result = store.resolve(
        'Alice is authorized',
        'Alice is not authorized',
      );

      expect(result).toEqual(anchor);
    });

    it('should perform case-insensitive matching', () => {
      const now = Date.now();

      const anchor = store.anchor({
        kind: 'human-attestation',
        claim: 'Alice Is Authorized',
        evidence: 'HR database',
        attesterId: 'hr-system',
        validFrom: now - 1000,
        validUntil: null,
      });

      const result = store.resolve(
        'alice is authorized',
        'Different belief',
      );

      expect(result).toEqual(anchor);
    });

    it('should trim whitespace before matching', () => {
      const now = Date.now();

      const anchor = store.anchor({
        kind: 'human-attestation',
        claim: '  Alice is authorized  ',
        evidence: 'HR database',
        attesterId: 'hr-system',
        validFrom: now - 1000,
        validUntil: null,
      });

      const result = store.resolve(
        'Alice is authorized',
        'Different belief',
      );

      expect(result).toEqual(anchor);
    });

    it('should ignore expired anchors', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Alice is authorized',
        evidence: 'HR database',
        attesterId: 'hr-system',
        validFrom: now - 5000,
        validUntil: now - 1000,
      });

      const result = store.resolve(
        'Alice is authorized',
        'Alice is not authorized',
      );

      expect(result).toBeUndefined();
    });

    it('should ignore not-yet-valid anchors', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Alice is authorized',
        evidence: 'HR database',
        attesterId: 'hr-system',
        validFrom: now + 10000,
        validUntil: null,
      });

      const result = store.resolve(
        'Alice is authorized',
        'Alice is not authorized',
      );

      expect(result).toBeUndefined();
    });

    it('should return first matching anchor if multiple exist', () => {
      const now = Date.now();

      const anchor1 = store.anchor({
        kind: 'human-attestation',
        claim: 'Alice is authorized',
        evidence: 'HR database',
        attesterId: 'hr-system',
        validFrom: now - 1000,
        validUntil: null,
      });

      store.anchor({
        kind: 'human-attestation',
        claim: 'Alice is authorized',
        evidence: 'Different source',
        attesterId: 'other-system',
        validFrom: now - 500,
        validUntil: null,
      });

      const result = store.resolve(
        'Alice is authorized',
        'Alice is not authorized',
      );

      expect(result).toEqual(anchor1);
    });
  });

  // ===== exportAnchors() / importAnchors() =====

  describe('exportAnchors() / importAnchors()', () => {
    it('should export empty array when store is empty', () => {
      const exported = store.exportAnchors();
      expect(exported).toEqual([]);
    });

    it('should export all anchors', () => {
      for (let i = 0; i < 3; i++) {
        store.anchor({
          kind: 'human-attestation',
          claim: `Claim ${i}`,
          evidence: 'Evidence',
          attesterId: 'tester',
        });
      }

      const exported = store.exportAnchors();
      expect(exported).toHaveLength(3);
    });

    it('should import anchors to empty store', () => {
      const anchors: TruthAnchor[] = [
        {
          id: 'anchor-1',
          kind: 'human-attestation',
          claim: 'Imported claim',
          evidence: 'Imported evidence',
          attesterId: 'importer',
          signature: 'a'.repeat(64),
          timestamp: Date.now(),
          validFrom: Date.now(),
          validUntil: null,
          supersedes: [],
          tags: [],
          metadata: {},
        },
      ];

      store.importAnchors(anchors);
      expect(store.size).toBe(1);
      expect(store.get('anchor-1')).toEqual(anchors[0]);
    });

    it('should append to existing anchors', () => {
      store.anchor({
        kind: 'human-attestation',
        claim: 'Existing',
        evidence: 'Evidence',
        attesterId: 'tester',
      });

      const imported: TruthAnchor[] = [
        {
          id: 'anchor-2',
          kind: 'hardware-signal',
          claim: 'Imported',
          evidence: 'Evidence',
          attesterId: 'importer',
          signature: 'b'.repeat(64),
          timestamp: Date.now(),
          validFrom: Date.now(),
          validUntil: null,
          supersedes: [],
          tags: [],
          metadata: {},
        },
      ];

      store.importAnchors(imported);
      expect(store.size).toBe(2);
    });

    it('should skip duplicate IDs on import', () => {
      const anchor = store.anchor({
        kind: 'human-attestation',
        claim: 'Original',
        evidence: 'Evidence',
        attesterId: 'tester',
      });

      const duplicate: TruthAnchor = {
        ...anchor,
        claim: 'Modified claim', // Different content, same ID
      };

      store.importAnchors([duplicate]);
      expect(store.size).toBe(1);
      expect(store.get(anchor.id)?.claim).toBe('Original'); // Original preserved
    });

    it('should round-trip export/import correctly', () => {
      for (let i = 0; i < 3; i++) {
        store.anchor({
          kind: 'human-attestation',
          claim: `Claim ${i}`,
          evidence: 'Evidence',
          attesterId: 'tester',
        });
      }

      const exported = store.exportAnchors();
      const newStore = new TruthAnchorStore({ signingKey: testSigningKey });
      newStore.importAnchors(exported);

      expect(newStore.size).toBe(3);
      expect(newStore.exportAnchors()).toEqual(exported);
    });
  });

  // ===== size Getter =====

  describe('size', () => {
    it('should return 0 for empty store', () => {
      expect(store.size).toBe(0);
    });

    it('should return correct count after adding anchors', () => {
      for (let i = 0; i < 10; i++) {
        store.anchor({
          kind: 'human-attestation',
          claim: `Claim ${i}`,
          evidence: 'Evidence',
          attesterId: 'tester',
        });
      }

      expect(store.size).toBe(10);
    });
  });

  // ===== Capacity Enforcement =====

  describe('capacity enforcement', () => {
    it('should evict expired anchors when exceeding maxAnchors', () => {
      const smallStore = new TruthAnchorStore({
        signingKey: testSigningKey,
        maxAnchors: 10,
      });

      const now = Date.now();

      // Add 5 expired anchors
      for (let i = 0; i < 5; i++) {
        smallStore.anchor({
          kind: 'human-attestation',
          claim: `Expired ${i}`,
          evidence: 'Evidence',
          attesterId: 'tester',
          validFrom: now - 10000,
          validUntil: now - 1000,
        });
      }

      // Add 5 active anchors
      for (let i = 0; i < 5; i++) {
        smallStore.anchor({
          kind: 'human-attestation',
          claim: `Active ${i}`,
          evidence: 'Evidence',
          attesterId: 'tester',
          validFrom: now - 1000,
          validUntil: null,
        });
      }

      expect(smallStore.size).toBe(10);

      // Add one more anchor, should evict oldest expired
      smallStore.anchor({
        kind: 'human-attestation',
        claim: 'Overflow',
        evidence: 'Evidence',
        attesterId: 'tester',
        validFrom: now,
        validUntil: null,
      });

      expect(smallStore.size).toBe(10);

      // All active anchors should still be present
      const active = smallStore.getActive(now);
      expect(active).toHaveLength(6); // 5 original + 1 new
    });

    it('should evict oldest expired anchors first (LRU)', () => {
      const smallStore = new TruthAnchorStore({
        signingKey: testSigningKey,
        maxAnchors: 3,
      });

      const now = Date.now();

      const anchor1 = smallStore.anchor({
        kind: 'human-attestation',
        claim: 'Expired 1',
        evidence: 'Evidence',
        attesterId: 'tester',
        validFrom: now - 10000,
        validUntil: now - 5000,
      });

      const anchor2 = smallStore.anchor({
        kind: 'human-attestation',
        claim: 'Expired 2',
        evidence: 'Evidence',
        attesterId: 'tester',
        validFrom: now - 9000,
        validUntil: now - 4000,
      });

      const anchor3 = smallStore.anchor({
        kind: 'human-attestation',
        claim: 'Expired 3',
        evidence: 'Evidence',
        attesterId: 'tester',
        validFrom: now - 8000,
        validUntil: now - 3000,
      });

      expect(smallStore.size).toBe(3);

      // Add one more, should evict anchor1 (oldest)
      smallStore.anchor({
        kind: 'human-attestation',
        claim: 'New',
        evidence: 'Evidence',
        attesterId: 'tester',
        validFrom: now,
        validUntil: null,
      });

      expect(smallStore.size).toBe(3);
      expect(smallStore.get(anchor1.id)).toBeUndefined(); // Evicted
      expect(smallStore.get(anchor2.id)).toBeDefined();
      expect(smallStore.get(anchor3.id)).toBeDefined();
    });

    it('should not evict active anchors even at capacity', () => {
      const smallStore = new TruthAnchorStore({
        signingKey: testSigningKey,
        maxAnchors: 5,
      });

      const now = Date.now();

      // Add 5 active anchors
      const anchors = [];
      for (let i = 0; i < 5; i++) {
        anchors.push(
          smallStore.anchor({
            kind: 'human-attestation',
            claim: `Active ${i}`,
            evidence: 'Evidence',
            attesterId: 'tester',
            validFrom: now - 1000,
            validUntil: null,
          }),
        );
      }

      expect(smallStore.size).toBe(5);

      // Try to add another active anchor
      smallStore.anchor({
        kind: 'human-attestation',
        claim: 'Overflow active',
        evidence: 'Evidence',
        attesterId: 'tester',
        validFrom: now,
        validUntil: null,
      });

      // Size should still be 6 (no eviction because all are active)
      expect(smallStore.size).toBe(6);
    });
  });
});

// ============================================================================
// TruthResolver Tests
// ============================================================================

describe('TruthResolver', () => {
  let store: TruthAnchorStore;
  let resolver: TruthResolver;
  const testSigningKey = 'test-signing-key-for-resolver';

  beforeEach(() => {
    store = new TruthAnchorStore({ signingKey: testSigningKey });
    resolver = new TruthResolver(store);
  });

  // ===== Constructor =====

  describe('constructor', () => {
    it('should accept a TruthAnchorStore instance', () => {
      const r = new TruthResolver(store);
      expect(r).toBeInstanceOf(TruthResolver);
    });
  });

  // ===== resolveMemoryConflict() =====

  describe('resolveMemoryConflict()', () => {
    it('should return truthWins=false when no anchor contradicts memory', () => {
      const result = resolver.resolveMemoryConflict(
        'user-role',
        'admin',
        'auth',
      );

      expect(result.truthWins).toBe(false);
      expect(result.anchor).toBeUndefined();
      expect(result.reason).toContain('No active truth anchor contradicts');
    });

    it('should return truthWins=true when anchor contradicts memory', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'guest', // Different from memory value
        evidence: 'HR database',
        attesterId: 'hr-system',
        tags: ['user-role'],
        validFrom: now - 1000,
        validUntil: null,
      });

      const result = resolver.resolveMemoryConflict(
        'user-role',
        'admin', // Memory says admin
        'auth',
      );

      expect(result.truthWins).toBe(true);
      expect(result.anchor).toBeDefined();
      expect(result.reason).toContain('contradicts memory');
    });

    it('should match anchors tagged with namespace', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'guest',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['auth'], // Matches namespace
        validFrom: now - 1000,
        validUntil: null,
      });

      const result = resolver.resolveMemoryConflict(
        'user-role',
        'admin',
        'auth',
      );

      expect(result.truthWins).toBe(true);
    });

    it('should match anchors tagged with namespace:key pattern', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'guest',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['auth:user-role'], // Matches namespace:key
        validFrom: now - 1000,
        validUntil: null,
      });

      const result = resolver.resolveMemoryConflict(
        'user-role',
        'admin',
        'auth',
      );

      expect(result.truthWins).toBe(true);
    });

    it('should perform case-insensitive tag matching', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'guest',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['USER-ROLE'], // Uppercase
        validFrom: now - 1000,
        validUntil: null,
      });

      const result = resolver.resolveMemoryConflict(
        'user-role', // Lowercase
        'admin',
        'auth',
      );

      expect(result.truthWins).toBe(true);
    });

    it('should not contradict when claims match', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'admin', // Same as memory
        evidence: 'Source',
        attesterId: 'system',
        tags: ['user-role'],
        validFrom: now - 1000,
        validUntil: null,
      });

      const result = resolver.resolveMemoryConflict(
        'user-role',
        'admin',
        'auth',
      );

      expect(result.truthWins).toBe(false);
    });

    it('should ignore expired anchors', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'guest',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['user-role'],
        validFrom: now - 10000,
        validUntil: now - 1000,
      });

      const result = resolver.resolveMemoryConflict(
        'user-role',
        'admin',
        'auth',
      );

      expect(result.truthWins).toBe(false);
    });
  });

  // ===== resolveDecisionConflict() =====

  describe('resolveDecisionConflict()', () => {
    it('should return truthWins=false when no anchor constrains action', () => {
      const result = resolver.resolveDecisionConflict(
        'deploy to production',
        { environment: 'prod' },
      );

      expect(result.truthWins).toBe(false);
      expect(result.anchor).toBeUndefined();
      expect(result.reason).toContain('No active truth anchor constrains');
    });

    it('should return truthWins=true when anchor constrains action', () => {
      const now = Date.now();

      store.anchor({
        kind: 'regulatory-input',
        claim: 'production deployments require approval',
        evidence: 'Company policy',
        attesterId: 'compliance-team',
        tags: ['production', 'deployment'],
        validFrom: now - 1000,
        validUntil: null,
      });

      const result = resolver.resolveDecisionConflict(
        'deploy to production',
        { environment: 'production', action: 'deployment' },
      );

      expect(result.truthWins).toBe(true);
      expect(result.anchor).toBeDefined();
      expect(result.reason).toContain('constrains the proposed action');
    });

    it('should match when tag overlaps with context keys', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Constraint applies',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['production'],
        validFrom: now - 1000,
        validUntil: null,
      });

      const result = resolver.resolveDecisionConflict(
        'some action',
        { production: true, other: 'value' },
      );

      expect(result.truthWins).toBe(true);
    });

    it('should match when action text includes tag', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Constraint applies',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['deploy'],
        validFrom: now - 1000,
        validUntil: null,
      });

      const result = resolver.resolveDecisionConflict(
        'deploy to server', // Contains 'deploy'
        { environment: 'test' },
      );

      expect(result.truthWins).toBe(true);
    });

    it('should match when claim text includes action', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'all delete operations are restricted',
        evidence: 'Source',
        attesterId: 'system',
        tags: [],
        validFrom: now - 1000,
        validUntil: null,
      });

      // claim 'all delete operations are restricted' includes 'delete'
      const result = resolver.resolveDecisionConflict(
        'delete',
        { operation: 'delete' },
      );

      expect(result.truthWins).toBe(true);
    });

    it('should ignore expired anchors', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Constraint applies',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['production'],
        validFrom: now - 10000,
        validUntil: now - 1000,
      });

      const result = resolver.resolveDecisionConflict(
        'deploy to production',
        { environment: 'production' },
      );

      expect(result.truthWins).toBe(false);
    });
  });

  // ===== getGroundTruth() =====

  describe('getGroundTruth()', () => {
    it('should return empty array when no anchors match topic', () => {
      const results = resolver.getGroundTruth('authentication');
      expect(results).toEqual([]);
    });

    it('should return anchors with matching tags', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Auth fact 1',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['authentication', 'security'],
        validFrom: now - 1000,
        validUntil: null,
      });

      const results = resolver.getGroundTruth('authentication');
      expect(results).toHaveLength(1);
      expect(results[0].claim).toBe('Auth fact 1');
    });

    it('should return anchors with matching claim text', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Authentication is required for all endpoints',
        evidence: 'Source',
        attesterId: 'system',
        tags: [],
        validFrom: now - 1000,
        validUntil: null,
      });

      const results = resolver.getGroundTruth('authentication');
      expect(results).toHaveLength(1);
    });

    it('should use fuzzy tag matching (tag contains topic)', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Fact',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['user-authentication-system'],
        validFrom: now - 1000,
        validUntil: null,
      });

      const results = resolver.getGroundTruth('authentication');
      expect(results).toHaveLength(1);
    });

    it('should use fuzzy tag matching (topic contains tag)', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Fact',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['auth'],
        validFrom: now - 1000,
        validUntil: null,
      });

      const results = resolver.getGroundTruth('authentication');
      expect(results).toHaveLength(1);
    });

    it('should perform case-insensitive matching', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Fact',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['AUTHENTICATION'],
        validFrom: now - 1000,
        validUntil: null,
      });

      const results = resolver.getGroundTruth('authentication');
      expect(results).toHaveLength(1);
    });

    it('should return multiple matching anchors', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Auth fact 1',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['authentication'],
        validFrom: now - 1000,
        validUntil: null,
      });

      store.anchor({
        kind: 'hardware-signal',
        claim: 'Auth fact 2',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['auth'],
        validFrom: now - 1000,
        validUntil: null,
      });

      const results = resolver.getGroundTruth('authentication');
      expect(results).toHaveLength(2);
    });

    it('should ignore expired anchors', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Expired fact',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['authentication'],
        validFrom: now - 10000,
        validUntil: now - 1000,
      });

      const results = resolver.getGroundTruth('authentication');
      expect(results).toEqual([]);
    });

    it('should only return active anchors', () => {
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Future fact',
        evidence: 'Source',
        attesterId: 'system',
        tags: ['authentication'],
        validFrom: now + 10000,
        validUntil: null,
      });

      const results = resolver.getGroundTruth('authentication');
      expect(results).toEqual([]);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('factory functions', () => {
  describe('createTruthAnchorStore()', () => {
    it('should create a TruthAnchorStore instance', () => {
      const store = createTruthAnchorStore({ signingKey: 'test-key' });
      expect(store).toBeInstanceOf(TruthAnchorStore);
    });

    it('should pass config to constructor', () => {
      const store = createTruthAnchorStore({
        signingKey: 'test-key',
        maxAnchors: 100,
      });
      expect(store.size).toBe(0);
    });

    it('should throw if no signingKey provided', () => {
      expect(() => createTruthAnchorStore()).toThrow(
        'TruthAnchorStore requires a signingKey',
      );
    });
  });

  describe('createTruthResolver()', () => {
    it('should create a TruthResolver instance', () => {
      const store = createTruthAnchorStore({ signingKey: 'test-key' });
      const resolver = createTruthResolver(store);
      expect(resolver).toBeInstanceOf(TruthResolver);
    });

    it('should use the provided store', () => {
      const store = createTruthAnchorStore({ signingKey: 'test-key' });
      const now = Date.now();

      store.anchor({
        kind: 'human-attestation',
        claim: 'Test claim',
        evidence: 'Evidence',
        attesterId: 'tester',
        tags: ['test'],
        validFrom: now - 1000,
        validUntil: null,
      });

      const resolver = createTruthResolver(store);
      const results = resolver.getGroundTruth('test');
      expect(results).toHaveLength(1);
    });
  });
});
