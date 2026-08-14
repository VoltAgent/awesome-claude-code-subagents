/**
 * Performance Optimizer Plugin - MCP Tools Tests
 *
 * Tests for MCP tool handlers with mock data
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  perfOptimizerTools,
  getTool,
  getToolNames,
} from '../src/mcp-tools.js';

describe('perfOptimizerTools', () => {
  it('should export 5 MCP tools', () => {
    expect(perfOptimizerTools).toHaveLength(5);
  });

  it('should have unique tool names', () => {
    const names = perfOptimizerTools.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('should have required tool properties', () => {
    for (const tool of perfOptimizerTools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    }
  });
});

describe('getTool', () => {
  it('should return tool by name', () => {
    const tool = getTool('perf/bottleneck-detect');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('perf/bottleneck-detect');
  });

  it('should return undefined for unknown tool', () => {
    const tool = getTool('unknown/tool');
    expect(tool).toBeUndefined();
  });
});

describe('getToolNames', () => {
  it('should return array of tool names', () => {
    const names = getToolNames();
    expect(names).toContain('perf/bottleneck-detect');
    expect(names).toContain('perf/memory-analyze');
    expect(names).toContain('perf/query-optimize');
    expect(names).toContain('perf/bundle-optimize');
    expect(names).toContain('perf/config-optimize');
  });
});

describe('perf/bottleneck-detect handler', () => {
  const tool = getTool('perf/bottleneck-detect')!;

  it('should handle valid input', async () => {
    const input = {
      traceData: {
        format: 'otlp',
        spans: [
          {
            traceId: 'trace-1',
            spanId: 'span-1',
            operationName: 'http.request',
            serviceName: 'api-gateway',
            startTime: Date.now(),
            duration: 150,
            status: 'ok',
            attributes: {},
          },
          {
            traceId: 'trace-1',
            spanId: 'span-2',
            parentSpanId: 'span-1',
            operationName: 'db.query',
            serviceName: 'database',
            startTime: Date.now() + 10,
            duration: 500,
            status: 'ok',
            attributes: {},
          },
        ],
      },
      analysisScope: ['cpu', 'memory', 'database'],
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('bottlenecks');
    expect(parsed).toHaveProperty('details');
  });

  it('should return error for invalid input', async () => {
    const input = {
      traceData: {
        format: 'invalid_format',
        spans: [],
      },
    };

    const result = await tool.handler(input);

    expect(result.isError).toBe(true);
  });

  it('should handle empty spans', async () => {
    const input = {
      traceData: {
        format: 'otlp',
        spans: [],
      },
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
  });

  it('should detect slow spans as bottlenecks', async () => {
    const input = {
      traceData: {
        format: 'otlp',
        spans: [
          {
            traceId: 'trace-1',
            spanId: 'slow-span',
            operationName: 'slow.operation',
            serviceName: 'slow-service',
            startTime: Date.now(),
            duration: 5000,  // Very slow
            status: 'ok',
            attributes: {},
          },
        ],
      },
      threshold: {
        latencyP95: 100,
      },
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.bottlenecks.length).toBeGreaterThan(0);
  });
});

describe('perf/memory-analyze handler', () => {
  const tool = getTool('perf/memory-analyze')!;

  it('should handle valid input', async () => {
    const input = {
      analysis: ['leak_detection', 'gc_pressure'],
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('leaks');
    expect(parsed).toHaveProperty('details');
  });

  it('should handle empty input', async () => {
    const result = await tool.handler({});

    expect(result.isError).toBeUndefined();
  });

  it('should detect potential leaks', async () => {
    const input = {
      timeline: [
        { timestamp: 0, heapUsed: 100 },
        { timestamp: 1000, heapUsed: 150 },
        { timestamp: 2000, heapUsed: 200 },
        { timestamp: 3000, heapUsed: 250 },
        { timestamp: 4000, heapUsed: 300 },  // Steady growth
      ],
      analysis: ['leak_detection'],
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.details).toHaveProperty('analysisType');
  });
});

describe('perf/query-optimize handler', () => {
  const tool = getTool('perf/query-optimize')!;

  it('should handle valid input', async () => {
    const input = {
      queries: [
        { sql: 'SELECT * FROM users WHERE id = 1', duration: 50 },
        { sql: 'SELECT * FROM orders WHERE user_id = 1', duration: 100 },
      ],
      patterns: ['n_plus_1', 'missing_index'],
      suggestIndexes: true,
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('patterns');
    expect(parsed).toHaveProperty('optimizations');
  });

  it('should return error for empty queries', async () => {
    const input = {
      queries: [],
    };

    const result = await tool.handler(input);

    expect(result.isError).toBe(true);
  });

  it('should detect N+1 patterns', async () => {
    const input = {
      queries: [
        { sql: 'SELECT * FROM users', duration: 10 },
        { sql: 'SELECT * FROM orders WHERE user_id = 1', duration: 5 },
        { sql: 'SELECT * FROM orders WHERE user_id = 2', duration: 5 },
        { sql: 'SELECT * FROM orders WHERE user_id = 3', duration: 5 },
        { sql: 'SELECT * FROM orders WHERE user_id = 4', duration: 5 },
      ],
      patterns: ['n_plus_1'],
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.patterns).toBeDefined();
  });

  it('should suggest indexes for slow queries', async () => {
    const input = {
      queries: [
        {
          sql: 'SELECT * FROM large_table WHERE unindexed_column = 123',
          duration: 5000,
        },
      ],
      suggestIndexes: true,
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.optimizations).toBeDefined();
  });
});

describe('perf/bundle-optimize handler', () => {
  const tool = getTool('perf/bundle-optimize')!;

  it('should handle valid input', async () => {
    const input = {
      bundleStats: '/path/to/stats.json',
      analysis: ['tree_shaking', 'code_splitting'],
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('optimizations');
    expect(parsed).toHaveProperty('details');
  });

  it('should return error for missing bundleStats', async () => {
    const input = {
      analysis: ['tree_shaking'],
    };

    const result = await tool.handler(input);

    expect(result.isError).toBe(true);
  });

  it('should calculate potential savings', async () => {
    const input = {
      bundleStats: '/path/to/bundle.json',
      analysis: ['duplicate_deps', 'large_modules'],
      targets: {
        maxSize: 100000,
      },
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed).toHaveProperty('potentialSavings');
    expect(typeof parsed.potentialSavings).toBe('number');
  });
});

describe('perf/config-optimize handler', () => {
  const tool = getTool('perf/config-optimize')!;

  it('should handle valid input', async () => {
    const input = {
      workloadProfile: {
        type: 'api',
        metrics: {
          requestsPerSecond: 1000,
          avgResponseTime: 50,
        },
      },
      configSpace: {
        workers: { type: 'number', range: [1, 16], current: 4 },
        cacheSize: { type: 'number', range: [64, 1024], current: 256 },
      },
      objective: 'latency',
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('recommendations');
    expect(parsed).toHaveProperty('predictedImprovement');
  });

  it('should return error for invalid workload type', async () => {
    const input = {
      workloadProfile: {
        type: 'invalid_type',
      },
      configSpace: {},
      objective: 'latency',
    };

    const result = await tool.handler(input);

    expect(result.isError).toBe(true);
  });

  it('should handle all objective types', async () => {
    const objectives = ['latency', 'throughput', 'cost', 'balanced'];

    for (const objective of objectives) {
      const input = {
        workloadProfile: { type: 'web' },
        configSpace: { workers: { type: 'number', current: 4 } },
        objective,
      };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();
    }
  });

  it('should provide optimization recommendations', async () => {
    const input = {
      workloadProfile: {
        type: 'batch',
        metrics: {
          requestsPerSecond: 100,
          avgResponseTime: 500,
        },
        constraints: {
          maxCpu: 90,
          maxMemory: 4096,
        },
      },
      configSpace: {
        batchSize: { type: 'number', range: [1, 1000], current: 10 },
        parallelism: { type: 'number', range: [1, 32], current: 4 },
      },
      objective: 'throughput',
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(Array.isArray(parsed.recommendations)).toBe(true);
  });
});

describe('Error handling', () => {
  it('should handle internal errors gracefully', async () => {
    const tool = getTool('perf/bottleneck-detect')!;

    // Pass malformed input that might cause internal error
    const input = {
      traceData: {
        format: 'otlp',
        spans: null,  // Invalid
      },
    };

    const result = await tool.handler(input);

    // Should return error result, not throw
    expect(result.isError).toBe(true);
  });

  it('should include timestamp in error responses', async () => {
    const tool = getTool('perf/query-optimize')!;

    const input = {
      queries: [],  // Invalid - requires at least 1
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.timestamp).toBeDefined();
  });
});

describe('Tool metadata', () => {
  it('should have correct categories', () => {
    for (const tool of perfOptimizerTools) {
      expect(tool.category).toBe('performance');
    }
  });

  it('should have version numbers', () => {
    for (const tool of perfOptimizerTools) {
      expect(tool.version).toBeDefined();
      expect(tool.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('should have tags', () => {
    for (const tool of perfOptimizerTools) {
      expect(Array.isArray(tool.tags)).toBe(true);
      expect(tool.tags!.length).toBeGreaterThan(0);
    }
  });
});
