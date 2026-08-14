/**
 * ADR-087: @ruvector/graph-node native graph database backend tests
 *
 * Tests the wrapper module's exports and CJS import pattern.
 * The actual graph-node integration is verified by the e2e node script.
 */
import { describe, it, expect } from 'vitest';

describe('ADR-087: graph-node backend', () => {
  describe('module exports', () => {
    it('exports all expected functions', async () => {
      const mod = await import('../src/ruvector/graph-backend.js');
      expect(typeof mod.isGraphBackendAvailable).toBe('function');
      expect(typeof mod.addNode).toBe('function');
      expect(typeof mod.addEdge).toBe('function');
      expect(typeof mod.addHyperedge).toBe('function');
      expect(typeof mod.getNeighbors).toBe('function');
      expect(typeof mod.getGraphStats).toBe('function');
      expect(typeof mod.recordCausalEdge).toBe('function');
      expect(typeof mod.recordCollaboration).toBe('function');
      expect(typeof mod.recordSwarmTeam).toBe('function');
    });
  });

  describe('graceful degradation', () => {
    it('getGraphStats returns unavailable when graph-node not loaded', async () => {
      // In test environment, graph-node may or may not be available
      const { getGraphStats } = await import('../src/ruvector/graph-backend.js');
      const stats = await getGraphStats();
      expect(stats).toHaveProperty('totalNodes');
      expect(stats).toHaveProperty('totalEdges');
      expect(stats).toHaveProperty('avgDegree');
      expect(stats).toHaveProperty('backend');
      expect(['graph-node', 'unavailable']).toContain(stats.backend);
    });

    it('addNode returns string or null', async () => {
      const { addNode } = await import('../src/ruvector/graph-backend.js');
      const result = await addNode({ id: 'test-1', type: 'test' });
      // Either a node ID string or null if backend unavailable
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('getNeighbors returns array', async () => {
      const { getNeighbors } = await import('../src/ruvector/graph-backend.js');
      const result = await getNeighbors('nonexistent', 2);
      expect(Array.isArray(result)).toBe(true);
    });

    it('recordCausalEdge returns result with backend', async () => {
      const { recordCausalEdge } = await import('../src/ruvector/graph-backend.js');
      const result = await recordCausalEdge('a', 'b', 'caused');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('backend');
    });

    it('recordSwarmTeam returns result', async () => {
      const { recordSwarmTeam } = await import('../src/ruvector/graph-backend.js');
      const result = await recordSwarmTeam(['a', 'b'], 'mesh');
      expect(result).toHaveProperty('success');
    });
  });

  describe('CJS import pattern', () => {
    it('source uses createRequire for @ruvector/graph-node', async () => {
      const { readFileSync } = await import('fs');
      const { join } = await import('path');
      const content = readFileSync(join(import.meta.dirname, '..', 'src', 'ruvector', 'graph-backend.ts'), 'utf8');
      expect(content).toContain('createRequire');
      expect(content).toContain("'@ruvector/graph-node'");
      // Should NOT use ESM dynamic import for graph-node
      expect(content).not.toMatch(/await import\(['"]@ruvector\/graph-node['"]\)/);
    });
  });

  describe('type exports', () => {
    it('exports GraphNodeData interface shape', async () => {
      const { addNode } = await import('../src/ruvector/graph-backend.js');
      // TypeScript ensures this matches GraphNodeData
      const data = { id: 'x', type: 'agent', name: 'test', properties: { foo: 'bar' } };
      const result = await addNode(data);
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('exports GraphEdgeData interface shape', async () => {
      const { addEdge } = await import('../src/ruvector/graph-backend.js');
      const data = { from: 'a', to: 'b', label: 'test', description: 'desc', weight: 0.5, properties: {} };
      const result = await addEdge(data);
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });
});
