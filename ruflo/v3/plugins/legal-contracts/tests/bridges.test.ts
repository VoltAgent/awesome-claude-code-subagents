/**
 * Legal Contracts Plugin - Bridge Tests
 *
 * Tests for DAGBridge initialization, lifecycle, and methods
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DAGBridge } from '../src/bridges/dag-bridge.js';

// Mock WASM module
vi.mock('../src/bridges/dag-wasm.js', () => ({
  initWasm: vi.fn().mockResolvedValue(undefined),
  wasmAvailable: vi.fn().mockReturnValue(false),
}));

describe('DAGBridge', () => {
  let bridge: DAGBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new DAGBridge();
  });

  afterEach(async () => {
    // DAGBridge doesn't have destroy method in the implementation
  });

  describe('Initialization', () => {
    it('should create bridge instance', () => {
      expect(bridge).toBeInstanceOf(DAGBridge);
    });

    it('should not be initialized before init', () => {
      expect(bridge.isInitialized()).toBe(false);
    });

    it('should initialize successfully', async () => {
      await bridge.initialize();
      expect(bridge.isInitialized()).toBe(true);
    });

    it('should handle double initialization gracefully', async () => {
      await bridge.initialize();
      await bridge.initialize();
      expect(bridge.isInitialized()).toBe(true);
    });
  });

  describe('Build Dependency Graph', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should build dependency graph from obligations', async () => {
      const obligations = [
        {
          id: 'obl-1',
          contractId: 'contract-1',
          type: 'payment',
          description: 'Payment Due',
          deadline: new Date('2025-02-01'),
          status: 'pending',
          party: 'Party A',
          dependsOn: [],
          blocks: ['obl-2'],
        },
        {
          id: 'obl-2',
          contractId: 'contract-1',
          type: 'delivery',
          description: 'Delivery Complete',
          deadline: new Date('2025-01-15'),
          status: 'pending',
          party: 'Party B',
          dependsOn: ['obl-1'],
          blocks: [],
        },
      ];

      const result = await bridge.buildDependencyGraph(obligations);

      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('edges');
      expect(result.nodes.length).toBe(2);
    });

    it('should handle empty obligations', async () => {
      const result = await bridge.buildDependencyGraph([]);

      expect(result.nodes.length).toBe(0);
      expect(result.edges.length).toBe(0);
    });

    it('should identify critical path', async () => {
      const obligations = [
        {
          id: 'start',
          contractId: 'c1',
          type: 'milestone',
          description: 'Start',
          deadline: new Date('2025-01-01'),
          status: 'completed',
          party: 'A',
          durationDays: 0,
          dependsOn: [],
          blocks: ['task-a', 'task-b'],
        },
        {
          id: 'task-a',
          contractId: 'c1',
          type: 'task',
          description: 'Task A',
          deadline: new Date('2025-01-05'),
          status: 'pending',
          party: 'A',
          durationDays: 5,
          dependsOn: ['start'],
          blocks: ['end'],
        },
        {
          id: 'task-b',
          contractId: 'c1',
          type: 'task',
          description: 'Task B',
          deadline: new Date('2025-01-03'),
          status: 'pending',
          party: 'B',
          durationDays: 3,
          dependsOn: ['start'],
          blocks: ['end'],
        },
        {
          id: 'end',
          contractId: 'c1',
          type: 'milestone',
          description: 'End',
          deadline: new Date('2025-01-06'),
          status: 'pending',
          party: 'A',
          durationDays: 0,
          dependsOn: ['task-a', 'task-b'],
          blocks: [],
        },
      ];

      const graph = await bridge.buildDependencyGraph(obligations);

      // Verify nodes have critical path info
      const criticalNodes = graph.nodes.filter(n => n.onCriticalPath);
      expect(criticalNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Topological Sort', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should perform topological sort', async () => {
      const obligations = [
        {
          id: 'c',
          contractId: 'c1',
          type: 'task',
          description: 'C',
          deadline: new Date(),
          status: 'pending',
          party: 'A',
          dependsOn: ['b'],
          blocks: [],
        },
        {
          id: 'a',
          contractId: 'c1',
          type: 'task',
          description: 'A',
          deadline: new Date(),
          status: 'pending',
          party: 'A',
          dependsOn: [],
          blocks: ['b'],
        },
        {
          id: 'b',
          contractId: 'c1',
          type: 'task',
          description: 'B',
          deadline: new Date(),
          status: 'pending',
          party: 'A',
          dependsOn: ['a'],
          blocks: ['c'],
        },
      ];

      const sorted = await bridge.topologicalSort(obligations);

      expect(sorted.length).toBe(3);

      // Verify ordering: a should come before b, b before c
      const indexA = sorted.findIndex(o => o.id === 'a');
      const indexB = sorted.findIndex(o => o.id === 'b');
      const indexC = sorted.findIndex(o => o.id === 'c');

      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
    });

    it('should handle empty input', async () => {
      const sorted = await bridge.topologicalSort([]);
      expect(sorted).toEqual([]);
    });
  });

  describe('Cycle Detection', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should detect no cycles in valid DAG', async () => {
      const obligations = [
        {
          id: 'a',
          contractId: 'c1',
          type: 'task',
          description: 'A',
          deadline: new Date(),
          status: 'pending',
          party: 'A',
          dependsOn: [],
          blocks: ['b'],
        },
        {
          id: 'b',
          contractId: 'c1',
          type: 'task',
          description: 'B',
          deadline: new Date(),
          status: 'pending',
          party: 'A',
          dependsOn: ['a'],
          blocks: [],
        },
      ];

      // Build graph first, then detect cycles
      const graph = await bridge.buildDependencyGraph(obligations);
      const cycles = await bridge.detectCycles(graph);

      // detectCycles returns string[][] (array of cycle arrays)
      expect(Array.isArray(cycles)).toBe(true);
      expect(cycles.length).toBe(0);
    });

    it('should detect simple cycle', async () => {
      const obligations = [
        {
          id: 'a',
          contractId: 'c1',
          type: 'task',
          description: 'A',
          deadline: new Date(),
          status: 'pending',
          party: 'A',
          dependsOn: ['b'], // Cycle: a -> b -> a
          blocks: ['b'],
        },
        {
          id: 'b',
          contractId: 'c1',
          type: 'task',
          description: 'B',
          deadline: new Date(),
          status: 'pending',
          party: 'A',
          dependsOn: ['a'],
          blocks: ['a'],
        },
      ];

      // Build graph first, then detect cycles
      const graph = await bridge.buildDependencyGraph(obligations);
      const cycles = await bridge.detectCycles(graph);

      // detectCycles returns string[][] (array of cycle arrays)
      expect(Array.isArray(cycles)).toBe(true);
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('JavaScript Fallback', () => {
    it('should work without WASM', async () => {
      const fallbackBridge = new DAGBridge();
      await fallbackBridge.initialize();

      const obligations = [
        {
          id: 'test',
          contractId: 'c1',
          type: 'task',
          description: 'Test',
          deadline: new Date(),
          status: 'pending',
          party: 'A',
          dependsOn: [],
          blocks: [],
        },
      ];

      const graph = await fallbackBridge.buildDependencyGraph(obligations);
      expect(graph.nodes.length).toBe(1);
    });
  });

  describe('Memory Management', () => {
    it('should handle multiple operations', async () => {
      await bridge.initialize();

      for (let i = 0; i < 3; i++) {
        const obligations = Array(10).fill(null).map((_, j) => ({
          id: `node-${i}-${j}`,
          contractId: 'c1',
          type: 'task',
          description: `Node ${j}`,
          deadline: new Date(),
          status: 'pending',
          party: 'A',
          dependsOn: j > 0 ? [`node-${i}-${j - 1}`] : [],
          blocks: j < 9 ? [`node-${i}-${j + 1}`] : [],
        }));

        await bridge.buildDependencyGraph(obligations);
        await bridge.topologicalSort(obligations);
      }

      expect(bridge.isInitialized()).toBe(true);
    });
  });
});
