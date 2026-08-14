/**
 * Code Intelligence Plugin - Bridge Tests
 *
 * Tests for GNNBridge initialization, lifecycle, and methods
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GNNBridge } from '../src/bridges/gnn-bridge.js';

// Mock WASM module
vi.mock('../src/bridges/gnn-wasm.js', () => ({
  initWasm: vi.fn().mockResolvedValue(undefined),
  wasmAvailable: vi.fn().mockReturnValue(false),
}));

describe('GNNBridge', () => {
  let bridge: GNNBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new GNNBridge();
  });

  afterEach(() => {
    // GNNBridge doesn't have explicit destroy
  });

  describe('Initialization', () => {
    it('should create bridge instance', () => {
      expect(bridge).toBeInstanceOf(GNNBridge);
    });

    it('should not be initialized before init', () => {
      expect(bridge.isInitialized()).toBe(false);
    });

    it('should initialize successfully', async () => {
      await bridge.initialize();
      expect(bridge.isInitialized()).toBe(true);
    });

    it('should initialize with custom embedding dimension', async () => {
      const customBridge = new GNNBridge(256);
      await customBridge.initialize();
      expect(customBridge.isInitialized()).toBe(true);
    });

    it('should handle double initialization gracefully', async () => {
      await bridge.initialize();
      await bridge.initialize();
      expect(bridge.isInitialized()).toBe(true);
    });
  });

  describe('Build Code Graph', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should build code graph from files', async () => {
      const files = [
        'src/utils.ts',
        'src/main.ts',
        'src/types.ts',
      ];

      const graph = await bridge.buildCodeGraph(files, true);

      expect(graph).toHaveProperty('nodes');
      expect(graph).toHaveProperty('edges');
      expect(graph).toHaveProperty('metadata');
      expect(graph.nodes.length).toBe(3);
    });

    it('should handle empty file list', async () => {
      const graph = await bridge.buildCodeGraph([], false);

      expect(graph.nodes.length).toBe(0);
      expect(graph.edges.length).toBe(0);
    });

    it('should detect file types correctly', async () => {
      const files = [
        'src/component.tsx',
        'src/style.css',
        'src/config.json',
        'src/script.py',
      ];

      const graph = await bridge.buildCodeGraph(files, false);

      expect(graph.nodes.length).toBe(4);
      // Each node should have detected language
      for (const node of graph.nodes) {
        expect(node).toHaveProperty('language');
      }
    });
  });

  describe('Compute Node Embeddings', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should compute embeddings for graph nodes', async () => {
      const files = ['src/a.ts', 'src/b.ts'];
      const graph = await bridge.buildCodeGraph(files, false);

      const embeddings = await bridge.computeNodeEmbeddings(graph, 64);

      expect(embeddings.size).toBe(2);
      expect(embeddings.has('src/a.ts')).toBe(true);
      expect(embeddings.has('src/b.ts')).toBe(true);
    });

    it('should return embeddings of correct dimension', async () => {
      const files = ['src/test.ts'];
      const graph = await bridge.buildCodeGraph(files, false);
      const embeddingDim = 128;

      const embeddings = await bridge.computeNodeEmbeddings(graph, embeddingDim);

      const embedding = embeddings.get('src/test.ts');
      expect(embedding).toBeDefined();
      expect(embedding!.length).toBe(embeddingDim);
    });

    it('should handle empty graph', async () => {
      const graph = await bridge.buildCodeGraph([], false);
      const embeddings = await bridge.computeNodeEmbeddings(graph, 64);

      expect(embeddings.size).toBe(0);
    });
  });

  describe('Impact Prediction', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should predict impact of changes', async () => {
      const files = [
        'src/core.ts',
        'src/utils.ts',
        'src/api.ts',
      ];
      const graph = await bridge.buildCodeGraph(files, true);

      // predictImpact returns Map<string, number> with node impact scores
      const impact = await bridge.predictImpact(graph, ['src/core.ts'], 3);

      expect(impact).toBeInstanceOf(Map);
      expect(impact.has('src/core.ts')).toBe(true);
    });

    it('should handle empty changed files', async () => {
      const files = ['src/a.ts', 'src/b.ts'];
      const graph = await bridge.buildCodeGraph(files, false);

      const impact = await bridge.predictImpact(graph, [], 3);

      expect(impact).toBeInstanceOf(Map);
      expect(impact.size).toBe(0);
    });
  });

  describe('Community Detection', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should detect communities in code graph', async () => {
      const files = [
        'src/auth/login.ts',
        'src/auth/logout.ts',
        'src/data/fetch.ts',
        'src/data/save.ts',
      ];
      const graph = await bridge.buildCodeGraph(files, true);

      // detectCommunities returns Map<string, number> (nodeId -> communityId)
      const communities = await bridge.detectCommunities(graph);

      expect(communities).toBeInstanceOf(Map);
      expect(communities.size).toBe(4);
    });

    it('should handle single node graph', async () => {
      const files = ['src/single.ts'];
      const graph = await bridge.buildCodeGraph(files, false);

      const communities = await bridge.detectCommunities(graph);

      expect(communities).toBeInstanceOf(Map);
      expect(communities.size).toBe(1);
    });
  });

  describe('Pattern Matching', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should find similar patterns', async () => {
      const files = [
        'src/userService.ts',
        'src/orderService.ts',
        'src/productService.ts',
      ];
      const graph = await bridge.buildCodeGraph(files, true);

      // Create a pattern graph to search for
      const patternGraph = await bridge.buildCodeGraph(['src/userService.ts'], false);

      // findSimilarPatterns expects (graph, patternGraph, threshold)
      const patterns = await bridge.findSimilarPatterns(graph, patternGraph, 0.5);

      expect(Array.isArray(patterns)).toBe(true);
      for (const pattern of patterns) {
        expect(pattern).toHaveProperty('matchId');
        expect(pattern).toHaveProperty('score');
      }
    });
  });

  describe('JavaScript Fallback', () => {
    it('should work without WASM', async () => {
      const fallbackBridge = new GNNBridge();
      await fallbackBridge.initialize();

      const files = ['src/test.ts'];
      const graph = await fallbackBridge.buildCodeGraph(files, false);

      expect(graph.nodes.length).toBe(1);
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should handle large file lists efficiently', async () => {
      const files = Array(100).fill(null).map((_, i) => `src/file${i}.ts`);

      const start = performance.now();
      const graph = await bridge.buildCodeGraph(files, true);
      const duration = performance.now() - start;

      expect(graph.nodes.length).toBe(100);
      expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
    });
  });

  describe('Memory Management', () => {
    it('should handle multiple graph operations', async () => {
      await bridge.initialize();

      for (let i = 0; i < 5; i++) {
        const files = Array(20).fill(null).map((_, j) => `src/module${i}/file${j}.ts`);
        const graph = await bridge.buildCodeGraph(files, true);
        await bridge.computeNodeEmbeddings(graph, 64);
      }

      expect(bridge.isInitialized()).toBe(true);
    });
  });
});
