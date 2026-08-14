/**
 * Tests for the Artifact Ledger system
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ArtifactLedger,
  createArtifactLedger,
} from '../src/artifacts.js';
import type {
  Artifact,
  ArtifactKind,
  ArtifactLineage,
  RecordArtifactParams,
} from '../src/artifacts.js';

// ============================================================================
// Helpers
// ============================================================================

function createMockLineage(overrides: Partial<ArtifactLineage> = {}): ArtifactLineage {
  return {
    parentArtifacts: [],
    sourceRunId: 'run-1',
    sourceTraceRef: 'envelope-1',
    toolCallIds: ['tc-1'],
    memoryReads: ['key-1'],
    ...overrides,
  };
}

function createMockParams(overrides: Partial<RecordArtifactParams> = {}): RecordArtifactParams {
  return {
    runId: 'run-1',
    cellId: 'cell-coder-1',
    tenantId: 'tenant-acme',
    kind: 'code',
    name: 'main.ts',
    description: 'Main application entry point',
    content: 'console.log("hello");',
    metadata: { language: 'typescript' },
    lineage: createMockLineage(),
    tags: ['entry-point', 'typescript'],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ArtifactLedger', () => {
  let ledger: ArtifactLedger;

  beforeEach(() => {
    ledger = createArtifactLedger({ signingKey: 'test-artifact-key' });
  });

  // --------------------------------------------------------------------------
  // Recording artifacts
  // --------------------------------------------------------------------------

  describe('record', () => {
    it('should create an artifact with correct fields and signature', () => {
      const artifact = ledger.record(createMockParams());

      expect(artifact.artifactId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(artifact.runId).toBe('run-1');
      expect(artifact.cellId).toBe('cell-coder-1');
      expect(artifact.tenantId).toBe('tenant-acme');
      expect(artifact.kind).toBe('code');
      expect(artifact.name).toBe('main.ts');
      expect(artifact.description).toBe('Main application entry point');
      expect(artifact.content).toBe('console.log("hello");');
      expect(artifact.metadata).toEqual({ language: 'typescript' });
      expect(artifact.tags).toEqual(['entry-point', 'typescript']);
      expect(artifact.createdAt).toBeGreaterThan(0);
      expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(artifact.contentSize).toBeGreaterThan(0);
      expect(artifact.signature).toMatch(/^[a-f0-9]{64}$/);
      expect(artifact.lineage.parentArtifacts).toEqual([]);
      expect(artifact.lineage.sourceRunId).toBe('run-1');
      expect(artifact.lineage.sourceTraceRef).toBe('envelope-1');
    });

    it('should default metadata to empty object when not provided', () => {
      const artifact = ledger.record(createMockParams({ metadata: undefined }));

      expect(artifact.metadata).toEqual({});
    });

    it('should default tags to empty array when not provided', () => {
      const artifact = ledger.record(createMockParams({ tags: undefined }));

      expect(artifact.tags).toEqual([]);
    });

    it('should produce unique artifact IDs', () => {
      const a1 = ledger.record(createMockParams());
      const a2 = ledger.record(createMockParams());

      expect(a1.artifactId).not.toBe(a2.artifactId);
    });

    it('should compute correct content size for string content', () => {
      const content = 'hello world';
      const artifact = ledger.record(createMockParams({ content }));

      expect(artifact.contentSize).toBe(Buffer.byteLength(content, 'utf-8'));
    });

    it('should compute correct content size for object content', () => {
      const content = { data: [1, 2, 3], nested: { key: 'value' } };
      const artifact = ledger.record(createMockParams({ content }));

      expect(artifact.contentSize).toBe(
        Buffer.byteLength(JSON.stringify(content), 'utf-8'),
      );
    });

    it('should handle all artifact kinds', () => {
      const kinds: ArtifactKind[] = [
        'code', 'report', 'dataset', 'model-output',
        'memory-delta', 'config', 'trace-export', 'checkpoint',
      ];

      for (const kind of kinds) {
        const artifact = ledger.record(createMockParams({ kind }));
        expect(artifact.kind).toBe(kind);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Verification
  // --------------------------------------------------------------------------

  describe('verify', () => {
    it('should detect valid artifacts', () => {
      const artifact = ledger.record(createMockParams());
      const result = ledger.verify(artifact.artifactId);

      expect(result.verified).toBe(true);
      expect(result.signatureValid).toBe(true);
      expect(result.contentIntact).toBe(true);
      expect(result.lineageComplete).toBe(true);
      expect(result.verifiedAt).toBeGreaterThan(0);
    });

    it('should detect tampered content', () => {
      const artifact = ledger.record(createMockParams());

      // Tamper with content directly (bypass signature)
      const stored = ledger.get(artifact.artifactId)!;
      (stored as any).content = 'TAMPERED CONTENT';

      const result = ledger.verify(artifact.artifactId);

      expect(result.verified).toBe(false);
      expect(result.contentIntact).toBe(false);
    });

    it('should detect invalid signature', () => {
      const artifact = ledger.record(createMockParams());

      // Tamper with signature
      const stored = ledger.get(artifact.artifactId)!;
      (stored as any).signature = 'f'.repeat(64);

      const result = ledger.verify(artifact.artifactId);

      expect(result.verified).toBe(false);
      expect(result.signatureValid).toBe(false);
    });

    it('should detect incomplete lineage (missing parent)', () => {
      const artifact = ledger.record(createMockParams({
        lineage: createMockLineage({
          parentArtifacts: ['nonexistent-parent-id'],
        }),
      }));

      const result = ledger.verify(artifact.artifactId);

      expect(result.verified).toBe(false);
      expect(result.lineageComplete).toBe(false);
      // Signature and content should still be valid
      expect(result.signatureValid).toBe(true);
      expect(result.contentIntact).toBe(true);
    });

    it('should verify complete lineage when parents exist', () => {
      const parent = ledger.record(createMockParams({ name: 'parent.ts' }));
      const child = ledger.record(createMockParams({
        name: 'child.ts',
        lineage: createMockLineage({
          parentArtifacts: [parent.artifactId],
        }),
      }));

      const result = ledger.verify(child.artifactId);

      expect(result.verified).toBe(true);
      expect(result.lineageComplete).toBe(true);
    });

    it('should return all-false for unknown artifact ID', () => {
      const result = ledger.verify('nonexistent-id');

      expect(result.verified).toBe(false);
      expect(result.signatureValid).toBe(false);
      expect(result.contentIntact).toBe(false);
      expect(result.lineageComplete).toBe(false);
    });

    it('should use different signatures for different signing keys', () => {
      const ledgerA = createArtifactLedger({ signingKey: 'key-a' });
      const ledgerB = createArtifactLedger({ signingKey: 'key-b' });

      const artifactA = ledgerA.record(createMockParams());
      const artifactB = ledgerB.record(createMockParams());

      expect(artifactA.signature).not.toBe(artifactB.signature);
    });
  });

  // --------------------------------------------------------------------------
  // Retrieval
  // --------------------------------------------------------------------------

  describe('get', () => {
    it('should return the artifact by ID', () => {
      const artifact = ledger.record(createMockParams());
      const found = ledger.get(artifact.artifactId);

      expect(found).toBeDefined();
      expect(found!.artifactId).toBe(artifact.artifactId);
    });

    it('should return undefined for unknown ID', () => {
      expect(ledger.get('nonexistent')).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // getByRun
  // --------------------------------------------------------------------------

  describe('getByRun', () => {
    it('should return all artifacts for a run', () => {
      ledger.record(createMockParams({ runId: 'run-alpha', name: 'a.ts' }));
      ledger.record(createMockParams({ runId: 'run-alpha', name: 'b.ts' }));
      ledger.record(createMockParams({ runId: 'run-beta', name: 'c.ts' }));

      const results = ledger.getByRun('run-alpha');

      expect(results).toHaveLength(2);
      expect(results.every(a => a.runId === 'run-alpha')).toBe(true);
    });

    it('should return empty array for unknown run', () => {
      expect(ledger.getByRun('nonexistent')).toEqual([]);
    });

    it('should return artifacts sorted by creation time', () => {
      ledger.record(createMockParams({ runId: 'run-1', name: 'first.ts' }));
      ledger.record(createMockParams({ runId: 'run-1', name: 'second.ts' }));

      const results = ledger.getByRun('run-1');

      expect(results[0].createdAt).toBeLessThanOrEqual(results[1].createdAt);
    });
  });

  // --------------------------------------------------------------------------
  // getByKind
  // --------------------------------------------------------------------------

  describe('getByKind', () => {
    it('should return all artifacts of a specific kind', () => {
      ledger.record(createMockParams({ kind: 'code', name: 'app.ts' }));
      ledger.record(createMockParams({ kind: 'report', name: 'coverage.json' }));
      ledger.record(createMockParams({ kind: 'code', name: 'utils.ts' }));

      const codeArtifacts = ledger.getByKind('code');

      expect(codeArtifacts).toHaveLength(2);
      expect(codeArtifacts.every(a => a.kind === 'code')).toBe(true);
    });

    it('should return empty array when no artifacts match', () => {
      ledger.record(createMockParams({ kind: 'code' }));

      expect(ledger.getByKind('dataset')).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getByCell
  // --------------------------------------------------------------------------

  describe('getByCell', () => {
    it('should return all artifacts from a specific cell', () => {
      ledger.record(createMockParams({ cellId: 'cell-coder', name: 'code.ts' }));
      ledger.record(createMockParams({ cellId: 'cell-tester', name: 'test.ts' }));
      ledger.record(createMockParams({ cellId: 'cell-coder', name: 'util.ts' }));

      const results = ledger.getByCell('cell-coder');

      expect(results).toHaveLength(2);
      expect(results.every(a => a.cellId === 'cell-coder')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // getLineage
  // --------------------------------------------------------------------------

  describe('getLineage', () => {
    it('should traverse ancestry depth-first', () => {
      const grandparent = ledger.record(createMockParams({
        name: 'grandparent.ts',
        lineage: createMockLineage({ parentArtifacts: [] }),
      }));

      const parent = ledger.record(createMockParams({
        name: 'parent.ts',
        lineage: createMockLineage({
          parentArtifacts: [grandparent.artifactId],
        }),
      }));

      const child = ledger.record(createMockParams({
        name: 'child.ts',
        lineage: createMockLineage({
          parentArtifacts: [parent.artifactId],
        }),
      }));

      const lineage = ledger.getLineage(child.artifactId);

      expect(lineage).toHaveLength(2);
      expect(lineage[0].artifactId).toBe(parent.artifactId);
      expect(lineage[1].artifactId).toBe(grandparent.artifactId);
    });

    it('should handle multiple parents', () => {
      const parentA = ledger.record(createMockParams({ name: 'a.ts' }));
      const parentB = ledger.record(createMockParams({ name: 'b.ts' }));

      const child = ledger.record(createMockParams({
        name: 'merged.ts',
        lineage: createMockLineage({
          parentArtifacts: [parentA.artifactId, parentB.artifactId],
        }),
      }));

      const lineage = ledger.getLineage(child.artifactId);

      expect(lineage).toHaveLength(2);
      const lineageIds = lineage.map(a => a.artifactId);
      expect(lineageIds).toContain(parentA.artifactId);
      expect(lineageIds).toContain(parentB.artifactId);
    });

    it('should handle diamond ancestry without duplicates', () => {
      const root = ledger.record(createMockParams({ name: 'root.ts' }));

      const leftParent = ledger.record(createMockParams({
        name: 'left.ts',
        lineage: createMockLineage({ parentArtifacts: [root.artifactId] }),
      }));

      const rightParent = ledger.record(createMockParams({
        name: 'right.ts',
        lineage: createMockLineage({ parentArtifacts: [root.artifactId] }),
      }));

      const child = ledger.record(createMockParams({
        name: 'diamond.ts',
        lineage: createMockLineage({
          parentArtifacts: [leftParent.artifactId, rightParent.artifactId],
        }),
      }));

      const lineage = ledger.getLineage(child.artifactId);

      // Should have left, right, and root - no duplicates
      const uniqueIds = new Set(lineage.map(a => a.artifactId));
      expect(uniqueIds.size).toBe(lineage.length);
      expect(uniqueIds.size).toBe(3);
    });

    it('should return empty array for artifact with no parents', () => {
      const artifact = ledger.record(createMockParams());

      expect(ledger.getLineage(artifact.artifactId)).toEqual([]);
    });

    it('should return empty array for unknown artifact ID', () => {
      expect(ledger.getLineage('nonexistent')).toEqual([]);
    });

    it('should handle missing parent gracefully', () => {
      const child = ledger.record(createMockParams({
        lineage: createMockLineage({
          parentArtifacts: ['deleted-parent-id'],
        }),
      }));

      const lineage = ledger.getLineage(child.artifactId);

      expect(lineage).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // search
  // --------------------------------------------------------------------------

  describe('search', () => {
    beforeEach(() => {
      // Seed ledger with diverse artifacts
      ledger.record(createMockParams({
        runId: 'run-1', kind: 'code', tags: ['frontend', 'react'],
      }));
      ledger.record(createMockParams({
        runId: 'run-1', kind: 'report', tags: ['coverage'],
      }));
      ledger.record(createMockParams({
        runId: 'run-2', kind: 'code', tags: ['backend', 'api'],
      }));
      ledger.record(createMockParams({
        runId: 'run-2', kind: 'dataset', tags: ['training'],
      }));
    });

    it('should filter by kind', () => {
      const results = ledger.search({ kind: 'code' });

      expect(results).toHaveLength(2);
      expect(results.every(a => a.kind === 'code')).toBe(true);
    });

    it('should filter by runId', () => {
      const results = ledger.search({ runId: 'run-2' });

      expect(results).toHaveLength(2);
      expect(results.every(a => a.runId === 'run-2')).toBe(true);
    });

    it('should filter by tags (AND logic)', () => {
      const results = ledger.search({ tags: ['frontend', 'react'] });

      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('frontend');
      expect(results[0].tags).toContain('react');
    });

    it('should filter by time range (since)', () => {
      const now = Date.now();
      const results = ledger.search({ since: now + 100_000 });

      expect(results).toHaveLength(0);
    });

    it('should filter by time range (until)', () => {
      const results = ledger.search({ until: 0 });

      expect(results).toHaveLength(0);
    });

    it('should combine multiple filters with AND', () => {
      const results = ledger.search({ kind: 'code', runId: 'run-1' });

      expect(results).toHaveLength(1);
      expect(results[0].kind).toBe('code');
      expect(results[0].runId).toBe('run-1');
    });

    it('should return all artifacts with empty query', () => {
      const results = ledger.search({});

      expect(results).toHaveLength(4);
    });

    it('should return empty array when no artifacts match', () => {
      const results = ledger.search({ kind: 'checkpoint' });

      expect(results).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Export / Import roundtrip
  // --------------------------------------------------------------------------

  describe('export and import', () => {
    it('should roundtrip all artifacts through export/import', () => {
      ledger.record(createMockParams({ name: 'a.ts', kind: 'code' }));
      ledger.record(createMockParams({ name: 'b.json', kind: 'report' }));
      ledger.record(createMockParams({ name: 'c.csv', kind: 'dataset' }));

      const exported = ledger.export();

      expect(exported.artifacts).toHaveLength(3);
      expect(exported.version).toBe(1);
      expect(exported.createdAt).toBeTruthy();

      const restored = createArtifactLedger({ signingKey: 'test-artifact-key' });
      restored.import(exported);

      const stats = restored.getStats();
      expect(stats.totalArtifacts).toBe(3);
    });

    it('should preserve artifact contents through roundtrip', () => {
      const original = ledger.record(createMockParams({
        name: 'preserved.ts',
        content: 'const x = 42;',
        tags: ['important'],
      }));

      const exported = ledger.export();
      const restored = createArtifactLedger({ signingKey: 'test-artifact-key' });
      restored.import(exported);

      const reimported = restored.get(original.artifactId);

      expect(reimported).toBeDefined();
      expect(reimported!.name).toBe('preserved.ts');
      expect(reimported!.content).toBe('const x = 42;');
      expect(reimported!.tags).toEqual(['important']);
      expect(reimported!.signature).toBe(original.signature);
      expect(reimported!.contentHash).toBe(original.contentHash);
    });

    it('should verify imported artifacts with the same signing key', () => {
      const original = ledger.record(createMockParams());

      const exported = ledger.export();
      const restored = createArtifactLedger({ signingKey: 'test-artifact-key' });
      restored.import(exported);

      const result = restored.verify(original.artifactId);

      expect(result.verified).toBe(true);
      expect(result.signatureValid).toBe(true);
      expect(result.contentIntact).toBe(true);
    });

    it('should reject imports with unsupported version', () => {
      const bad: any = {
        artifacts: [],
        createdAt: new Date().toISOString(),
        version: 999,
      };

      expect(() => ledger.import(bad)).toThrow(/Unsupported artifact ledger version/);
    });

    it('should replace existing ledger contents on import', () => {
      ledger.record(createMockParams({ name: 'old.ts' }));
      ledger.record(createMockParams({ name: 'old2.ts' }));
      expect(ledger.getStats().totalArtifacts).toBe(2);

      const other = createArtifactLedger({ signingKey: 'test-artifact-key' });
      other.record(createMockParams({ name: 'new.ts' }));
      const exported = other.export();

      ledger.import(exported);
      expect(ledger.getStats().totalArtifacts).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // getStats
  // --------------------------------------------------------------------------

  describe('getStats', () => {
    it('should count artifacts correctly', () => {
      ledger.record(createMockParams({ kind: 'code' }));
      ledger.record(createMockParams({ kind: 'code' }));
      ledger.record(createMockParams({ kind: 'report' }));
      ledger.record(createMockParams({ kind: 'dataset' }));
      ledger.record(createMockParams({ kind: 'checkpoint' }));

      const stats = ledger.getStats();

      expect(stats.totalArtifacts).toBe(5);
      expect(stats.byKind.code).toBe(2);
      expect(stats.byKind.report).toBe(1);
      expect(stats.byKind.dataset).toBe(1);
      expect(stats.byKind.checkpoint).toBe(1);
      expect(stats.byKind['model-output']).toBe(0);
      expect(stats.byKind['memory-delta']).toBe(0);
      expect(stats.byKind.config).toBe(0);
      expect(stats.byKind['trace-export']).toBe(0);
    });

    it('should return zeros for empty ledger', () => {
      const stats = ledger.getStats();

      expect(stats.totalArtifacts).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(Object.values(stats.byKind).every(v => v === 0)).toBe(true);
    });

    it('should track total content size', () => {
      ledger.record(createMockParams({ content: 'short' }));
      ledger.record(createMockParams({ content: 'a longer piece of content' }));

      const stats = ledger.getStats();

      const expectedSize =
        Buffer.byteLength('short', 'utf-8') +
        Buffer.byteLength('a longer piece of content', 'utf-8');

      expect(stats.totalSize).toBe(expectedSize);
    });

    it('should include all artifact kinds in byKind even when zero', () => {
      const stats = ledger.getStats();
      const expectedKinds: ArtifactKind[] = [
        'code', 'report', 'dataset', 'model-output',
        'memory-delta', 'config', 'trace-export', 'checkpoint',
      ];

      for (const kind of expectedKinds) {
        expect(stats.byKind).toHaveProperty(kind);
        expect(stats.byKind[kind]).toBe(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Capacity / eviction
  // --------------------------------------------------------------------------

  describe('capacity management', () => {
    it('should evict oldest artifact when exceeding maxArtifacts', () => {
      const smallLedger = createArtifactLedger({
        signingKey: 'test-artifact-key',
        maxArtifacts: 3,
      });

      const first = smallLedger.record(createMockParams({ name: 'first.ts' }));
      smallLedger.record(createMockParams({ name: 'second.ts' }));
      smallLedger.record(createMockParams({ name: 'third.ts' }));

      // Recording a 4th should evict the first
      smallLedger.record(createMockParams({ name: 'fourth.ts' }));

      expect(smallLedger.getStats().totalArtifacts).toBe(3);
      expect(smallLedger.get(first.artifactId)).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Factory function
  // --------------------------------------------------------------------------

  describe('createArtifactLedger factory', () => {
    it('should throw when no signingKey is provided', () => {
      expect(() => createArtifactLedger()).toThrow('requires an explicit signingKey');
    });

    it('should create a ledger with an explicit signing key', () => {
      const ledger = createArtifactLedger({ signingKey: 'test-key' });
      const artifact = ledger.record(createMockParams());

      expect(artifact.signature).toMatch(/^[a-f0-9]{64}$/);

      const result = ledger.verify(artifact.artifactId);
      expect(result.verified).toBe(true);
    });

    it('should create a ledger with custom signing key', () => {
      const customLedger = createArtifactLedger({ signingKey: 'custom-key' });
      const artifact = customLedger.record(createMockParams());

      expect(customLedger.verify(artifact.artifactId).verified).toBe(true);
    });
  });
});
