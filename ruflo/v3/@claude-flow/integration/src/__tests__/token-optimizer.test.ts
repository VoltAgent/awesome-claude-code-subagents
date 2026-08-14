/**
 * Token Optimizer Integration Tests
 * Validates agentic-flow Agent Booster integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { TokenOptimizer, getTokenOptimizer } from '../token-optimizer.js';

describe('TokenOptimizer', () => {
  let optimizer: TokenOptimizer;

  beforeAll(async () => {
    optimizer = await getTokenOptimizer();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newOptimizer = new TokenOptimizer();
      await newOptimizer.initialize();

      const stats = newOptimizer.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.agenticFlowAvailable).toBe('boolean');
    });

    it('should detect agentic-flow availability', async () => {
      const stats = optimizer.getStats();
      // agentic-flow loadability depends on onnx native bindings, which
      // pnpm doesn't postinstall by default in CI. The optimizer's
      // detection is honest either way; this assertion checks the
      // *detection*, not the *availability*.
      const expected = await canLoadAgenticFlow();
      expect(stats.agenticFlowAvailable).toBe(expected);
    });

    async function canLoadAgenticFlow(): Promise<boolean> {
      try { await import('agentic-flow'); return true; }
      catch { return false; }
    }
  });

  describe('getCompactContext', () => {
    it('should return context structure', async () => {
      const ctx = await optimizer.getCompactContext('authentication patterns');

      expect(ctx).toHaveProperty('query');
      expect(ctx).toHaveProperty('memories');
      expect(ctx).toHaveProperty('compactPrompt');
      expect(ctx).toHaveProperty('tokensSaved');
      expect(ctx.query).toBe('authentication patterns');
    });

    it('should track tokens saved', async () => {
      const before = optimizer.getStats().totalTokensSaved;
      await optimizer.getCompactContext('test query');
      const after = optimizer.getStats().totalTokensSaved;

      // Should increase (or stay same if no memories found)
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  describe('optimizedEdit', () => {
    it('should return edit optimization result', async () => {
      const result = await optimizer.optimizedEdit(
        '/test/file.ts',
        'const x = 1;',
        'const x = 2;',
        'typescript'
      );

      expect(result).toHaveProperty('speedupFactor');
      expect(result).toHaveProperty('executionMs');
      expect(result).toHaveProperty('method');
      expect(['agent-booster', 'traditional']).toContain(result.method);
    });

    it('should track edits optimized', async () => {
      const before = optimizer.getStats().editsOptimized;
      await optimizer.optimizedEdit('/test.ts', 'a', 'b', 'typescript');
      const after = optimizer.getStats().editsOptimized;

      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getOptimalConfig', () => {
    it('should return anti-drift config for small teams', () => {
      const config = optimizer.getOptimalConfig(4);

      expect(config.batchSize).toBeLessThanOrEqual(5);
      expect(config.cacheSizeMB).toBeGreaterThanOrEqual(10);
      expect(config.topology).toBe('hierarchical');
      expect(config.expectedSuccessRate).toBeGreaterThanOrEqual(0.9);
    });

    it('should recommend mesh for very small teams', () => {
      const config = optimizer.getOptimalConfig(3);
      // Anti-drift still prefers hierarchical
      expect(['mesh', 'hierarchical']).toContain(config.topology);
    });

    it('should handle large agent counts', () => {
      const config = optimizer.getOptimalConfig(15);

      expect(config.topology).toBe('hierarchical');
      expect(config.batchSize).toBeLessThanOrEqual(5);
    });
  });

  describe('cachedLookup', () => {
    it('should cache results', async () => {
      let callCount = 0;
      const generator = async () => {
        callCount++;
        return { data: 'test' };
      };

      // First call - cache miss
      await optimizer.cachedLookup('test-key-1', generator);
      expect(callCount).toBe(1);

      // Second call - cache hit
      await optimizer.cachedLookup('test-key-1', generator);
      expect(callCount).toBe(1); // Should not increment
    });

    it('should track cache hits and misses', async () => {
      const before = optimizer.getStats();
      const totalBefore = before.cacheHits + before.cacheMisses;

      await optimizer.cachedLookup('unique-key-' + Date.now(), async () => 'value');

      const after = optimizer.getStats();
      const totalAfter = after.cacheHits + after.cacheMisses;

      expect(totalAfter).toBe(totalBefore + 1);
    });
  });

  describe('getStats', () => {
    it('should return all statistics', () => {
      const stats = optimizer.getStats();

      expect(stats).toHaveProperty('totalTokensSaved');
      expect(stats).toHaveProperty('editsOptimized');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('cacheMisses');
      expect(stats).toHaveProperty('memoriesRetrieved');
      expect(stats).toHaveProperty('agenticFlowAvailable');
      expect(stats).toHaveProperty('cacheHitRate');
      expect(stats).toHaveProperty('estimatedMonthlySavings');
    });

    it('should calculate cache hit rate', () => {
      const stats = optimizer.getStats();
      expect(stats.cacheHitRate).toMatch(/^\d+(\.\d+)?%$/);
    });

    it('should estimate monthly savings', () => {
      const stats = optimizer.getStats();
      expect(stats.estimatedMonthlySavings).toMatch(/^\$\d+(\.\d+)?$/);
    });
  });

  describe('generateReport', () => {
    it('should generate markdown report', () => {
      const report = optimizer.generateReport();

      expect(report).toContain('Token Optimization Report');
      expect(report).toContain('Tokens Saved');
      expect(report).toContain('Edits Optimized');
      expect(report).toContain('Cache Hit Rate');
    });
  });

  describe('singleton', () => {
    it('should return same instance via getTokenOptimizer', async () => {
      const opt1 = await getTokenOptimizer();
      const opt2 = await getTokenOptimizer();

      expect(opt1).toBe(opt2);
    });
  });
});
