/**
 * Performance Optimizer Plugin - Types Tests
 *
 * Tests for Zod schemas and type validation
 */

import { describe, it, expect } from 'vitest';
import {
  BottleneckDetectInputSchema,
  MemoryAnalyzeInputSchema,
  QueryOptimizeInputSchema,
  BundleOptimizeInputSchema,
  ConfigOptimizeInputSchema,
  successResult,
  errorResult,
  DEFAULT_CONFIG,
} from '../src/types.js';

describe('BottleneckDetectInputSchema', () => {
  it('should validate valid bottleneck detect input', () => {
    const validInput = {
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
        ],
      },
      analysisScope: ['cpu', 'memory'],
      threshold: {
        latencyP95: 200,
        throughput: 1000,
        errorRate: 0.01,
      },
    };

    const result = BottleneckDetectInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should use default analysisScope when not provided', () => {
    const input = {
      traceData: {
        format: 'chrome_devtools',
        spans: [],
      },
    };

    const result = BottleneckDetectInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.analysisScope).toEqual(['all']);
    }
  });

  it('should reject invalid trace format', () => {
    const invalidInput = {
      traceData: {
        format: 'invalid_format',
        spans: [],
      },
    };

    const result = BottleneckDetectInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject negative latencyP95 threshold', () => {
    const invalidInput = {
      traceData: {
        format: 'otlp',
        spans: [],
      },
      threshold: {
        latencyP95: -100,
      },
    };

    const result = BottleneckDetectInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject errorRate greater than 1', () => {
    const invalidInput = {
      traceData: {
        format: 'otlp',
        spans: [],
      },
      threshold: {
        errorRate: 1.5,
      },
    };

    const result = BottleneckDetectInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should accept all valid trace formats', () => {
    const formats = ['otlp', 'chrome_devtools', 'jaeger', 'zipkin'] as const;

    for (const format of formats) {
      const input = {
        traceData: { format, spans: [] },
      };
      const result = BottleneckDetectInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });
});

describe('MemoryAnalyzeInputSchema', () => {
  it('should validate valid memory analyze input', () => {
    const validInput = {
      heapSnapshot: '/path/to/snapshot.heapsnapshot',
      analysis: ['leak_detection', 'gc_pressure'],
    };

    const result = MemoryAnalyzeInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept empty input (all optional)', () => {
    const result = MemoryAnalyzeInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject heap snapshot path exceeding max length', () => {
    const invalidInput = {
      heapSnapshot: 'a'.repeat(501),
    };

    const result = MemoryAnalyzeInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject invalid analysis type', () => {
    const invalidInput = {
      analysis: ['invalid_analysis_type'],
    };

    const result = MemoryAnalyzeInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should accept timeline with valid entries', () => {
    const validInput = {
      timeline: [
        { timestamp: Date.now(), heapUsed: 100 },
        { timestamp: Date.now() + 1000, heapUsed: 150 },
      ],
    };

    const result = MemoryAnalyzeInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });
});

describe('QueryOptimizeInputSchema', () => {
  it('should validate valid query optimize input', () => {
    const validInput = {
      queries: [
        { sql: 'SELECT * FROM users WHERE id = 1', duration: 50 },
        { sql: 'SELECT * FROM orders WHERE user_id = 1', duration: 100 },
      ],
      patterns: ['n_plus_1', 'missing_index'],
      suggestIndexes: true,
    };

    const result = QueryOptimizeInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should require at least one query', () => {
    const invalidInput = {
      queries: [],
    };

    const result = QueryOptimizeInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject SQL exceeding max length', () => {
    const invalidInput = {
      queries: [{ sql: 'a'.repeat(10001), duration: 50 }],
    };

    const result = QueryOptimizeInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject negative duration', () => {
    const invalidInput = {
      queries: [{ sql: 'SELECT 1', duration: -10 }],
    };

    const result = QueryOptimizeInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should use default suggestIndexes value', () => {
    const input = {
      queries: [{ sql: 'SELECT 1', duration: 10 }],
    };

    const result = QueryOptimizeInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suggestIndexes).toBe(true);
    }
  });
});

describe('BundleOptimizeInputSchema', () => {
  it('should validate valid bundle optimize input', () => {
    const validInput = {
      bundleStats: '/path/to/stats.json',
      analysis: ['tree_shaking', 'code_splitting'],
      targets: {
        maxSize: 500000,
        maxChunks: 10,
      },
    };

    const result = BundleOptimizeInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should require bundleStats path', () => {
    const invalidInput = {
      analysis: ['tree_shaking'],
    };

    const result = BundleOptimizeInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject invalid analysis type', () => {
    const invalidInput = {
      bundleStats: '/path/to/stats.json',
      analysis: ['invalid_analysis'],
    };

    const result = BundleOptimizeInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject maxChunks less than 1', () => {
    const invalidInput = {
      bundleStats: '/path/to/stats.json',
      targets: { maxChunks: 0 },
    };

    const result = BundleOptimizeInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });
});

describe('ConfigOptimizeInputSchema', () => {
  it('should validate valid config optimize input', () => {
    const validInput = {
      workloadProfile: {
        type: 'api',
        metrics: {
          requestsPerSecond: 1000,
          avgResponseTime: 50,
          errorRate: 0.01,
          concurrency: 100,
        },
        constraints: {
          maxLatency: 100,
          maxMemory: 2048,
          maxCpu: 80,
        },
      },
      configSpace: {
        workers: { type: 'number', range: [1, 16], current: 4 },
        cacheEnabled: { type: 'boolean', current: true },
      },
      objective: 'latency',
    };

    const result = ConfigOptimizeInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject invalid workload type', () => {
    const invalidInput = {
      workloadProfile: {
        type: 'invalid_type',
      },
      configSpace: {},
      objective: 'latency',
    };

    const result = ConfigOptimizeInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject invalid objective', () => {
    const invalidInput = {
      workloadProfile: { type: 'web' },
      configSpace: {},
      objective: 'invalid_objective',
    };

    const result = ConfigOptimizeInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject CPU greater than 100', () => {
    const invalidInput = {
      workloadProfile: {
        type: 'api',
        constraints: { maxCpu: 150 },
      },
      configSpace: {},
      objective: 'throughput',
    };

    const result = ConfigOptimizeInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should accept all valid workload types', () => {
    const types = ['web', 'api', 'batch', 'stream', 'hybrid'] as const;

    for (const type of types) {
      const input = {
        workloadProfile: { type },
        configSpace: {},
        objective: 'balanced',
      };
      const result = ConfigOptimizeInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });
});

describe('successResult', () => {
  it('should create success result with JSON data', () => {
    const data = { status: 'ok', value: 42 };
    const result = successResult(data);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.status).toBe('ok');
    expect(parsed.value).toBe(42);
  });

  it('should handle null data', () => {
    const result = successResult(null);
    expect(result.content[0].text).toBe('null');
  });

  it('should handle array data', () => {
    const data = [1, 2, 3];
    const result = successResult(data);
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toEqual([1, 2, 3]);
  });
});

describe('errorResult', () => {
  it('should create error result from Error object', () => {
    const error = new Error('Test error message');
    const result = errorResult(error);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBe(true);

    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toBe('Test error message');
    expect(parsed.timestamp).toBeDefined();
  });

  it('should create error result from string', () => {
    const result = errorResult('String error message');

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.message).toBe('String error message');
  });

  it('should include timestamp in ISO format', () => {
    const result = errorResult('Test');
    const parsed = JSON.parse(result.content[0].text!);
    expect(() => new Date(parsed.timestamp)).not.toThrow();
  });
});

describe('DEFAULT_CONFIG', () => {
  it('should have valid bottleneck config', () => {
    expect(DEFAULT_CONFIG.bottleneck.latencyThresholdMs).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.bottleneck.errorRateThreshold).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CONFIG.bottleneck.errorRateThreshold).toBeLessThanOrEqual(1);
    expect(DEFAULT_CONFIG.bottleneck.cpuThreshold).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.bottleneck.cpuThreshold).toBeLessThanOrEqual(100);
    expect(DEFAULT_CONFIG.bottleneck.memoryThreshold).toBeGreaterThan(0);
  });

  it('should have valid memory config', () => {
    expect(DEFAULT_CONFIG.memory.leakThresholdMb).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.memory.gcPressureThreshold).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CONFIG.memory.gcPressureThreshold).toBeLessThanOrEqual(1);
    expect(DEFAULT_CONFIG.memory.maxHeapSize).toBeGreaterThan(0);
  });

  it('should have valid query config', () => {
    expect(DEFAULT_CONFIG.query.slowQueryThresholdMs).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.query.maxResultSize).toBeGreaterThan(0);
    expect(typeof DEFAULT_CONFIG.query.indexSuggestionEnabled).toBe('boolean');
  });

  it('should have valid bundle config', () => {
    expect(DEFAULT_CONFIG.bundle.maxSizeKb).toBeGreaterThan(0);
    expect(typeof DEFAULT_CONFIG.bundle.treeshakingEnabled).toBe('boolean');
    expect(typeof DEFAULT_CONFIG.bundle.codeSplittingEnabled).toBe('boolean');
  });
});
