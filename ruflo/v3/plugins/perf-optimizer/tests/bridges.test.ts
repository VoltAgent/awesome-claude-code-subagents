/**
 * Performance Optimizer Plugin - Bridges Tests
 *
 * Tests for FPGA and Sparse bridge initialization and lifecycle
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PerfFpgaBridge, createPerfFpgaBridge } from '../src/bridges/fpga-bridge.js';
import { PerfSparseBridge, createPerfSparseBridge } from '../src/bridges/sparse-bridge.js';
import type { TraceSpan, WorkloadProfile } from '../src/types.js';

describe('PerfFpgaBridge', () => {
  let bridge: PerfFpgaBridge;

  beforeEach(() => {
    bridge = createPerfFpgaBridge();
  });

  afterEach(async () => {
    await bridge.destroy();
  });

  describe('initialization', () => {
    it('should start in unloaded state', () => {
      expect(bridge.isReady()).toBe(false);
    });

    it('should have correct name and version', () => {
      expect(bridge.name).toBe('perf-optimizer-fpga');
      expect(bridge.version).toBe('0.1.0');
    });

    it('should initialize successfully', async () => {
      await bridge.init();
      expect(bridge.isReady()).toBe(true);
    });

    it('should be idempotent for multiple init calls', async () => {
      await bridge.init();
      await bridge.init();
      expect(bridge.isReady()).toBe(true);
    });

    it('should cleanup on destroy', async () => {
      await bridge.init();
      expect(bridge.isReady()).toBe(true);

      await bridge.destroy();
      expect(bridge.isReady()).toBe(false);
    });
  });

  describe('optimizeConfig', () => {
    beforeEach(async () => {
      await bridge.init();
    });

    it('should optimize config for web workload', async () => {
      const workload: WorkloadProfile = {
        type: 'web',
        metrics: {
          requestsPerSecond: 1000,
          avgResponseTime: 50,
          errorRate: 0.01,
          concurrency: 100,
        },
        constraints: {
          maxLatency: 100,
          maxMemory: 2048,
        },
      };

      const configSpace = {
        workers: { min: 1, max: 16 },
        cacheSize: { min: 64, max: 1024 },
      };

      const result = await bridge.optimizeConfig(workload, configSpace);

      expect(result).toBeDefined();
      expect(result.parameters).toBeDefined();
      expect(result.predictedImprovement).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should throw when not initialized', async () => {
      const newBridge = createPerfFpgaBridge();

      const workload: WorkloadProfile = {
        type: 'api',
        metrics: {
          requestsPerSecond: 500,
          avgResponseTime: 100,
          errorRate: 0.02,
          concurrency: 50,
        },
        constraints: {},
      };

      await expect(newBridge.optimizeConfig(workload, {})).rejects.toThrow();
    });
  });

  describe('predictPerformance', () => {
    beforeEach(async () => {
      await bridge.init();
    });

    it('should predict performance for given config', async () => {
      const config = {
        workers: 4,
        cacheEnabled: true,
        batchSize: 32,
      };

      const workload: WorkloadProfile = {
        type: 'batch',
        metrics: {
          requestsPerSecond: 100,
          avgResponseTime: 500,
          errorRate: 0.001,
          concurrency: 10,
        },
        constraints: {},
      };

      const prediction = await bridge.predictPerformance(config, workload);

      expect(typeof prediction).toBe('number');
      expect(prediction).toBeGreaterThanOrEqual(0);
    });
  });

  describe('searchOptimalConfig', () => {
    beforeEach(async () => {
      await bridge.init();
    });

    it('should search for optimal config', async () => {
      const result = await bridge.searchOptimalConfig('latency', {
        maxMemory: 2048,
        maxCpu: 80,
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  describe('factory function', () => {
    it('should create bridge with default config', () => {
      const b = createPerfFpgaBridge();
      expect(b).toBeInstanceOf(PerfFpgaBridge);
    });

    it('should create bridge with custom config', () => {
      const b = createPerfFpgaBridge({ searchIterations: 500 });
      expect(b).toBeInstanceOf(PerfFpgaBridge);
    });
  });
});

describe('PerfSparseBridge', () => {
  let bridge: PerfSparseBridge;

  beforeEach(() => {
    bridge = createPerfSparseBridge();
  });

  afterEach(async () => {
    await bridge.destroy();
  });

  describe('initialization', () => {
    it('should start in unloaded state', () => {
      expect(bridge.isReady()).toBe(false);
    });

    it('should have correct name and version', () => {
      expect(bridge.name).toBe('perf-optimizer-sparse');
      expect(bridge.version).toBe('0.1.0');
    });

    it('should initialize successfully', async () => {
      await bridge.init();
      expect(bridge.isReady()).toBe(true);
    });

    it('should be idempotent for multiple init calls', async () => {
      await bridge.init();
      await bridge.init();
      expect(bridge.isReady()).toBe(true);
    });

    it('should cleanup on destroy', async () => {
      await bridge.init();
      await bridge.destroy();
      expect(bridge.isReady()).toBe(false);
    });
  });

  describe('encodeTraces', () => {
    beforeEach(async () => {
      await bridge.init();
    });

    it('should encode empty spans', async () => {
      const encoded = await bridge.encodeTraces([]);
      expect(encoded).toBeInstanceOf(Float32Array);
    });

    it('should encode valid spans', async () => {
      const spans: TraceSpan[] = [
        {
          traceId: 'trace-1',
          spanId: 'span-1',
          operationName: 'http.request',
          serviceName: 'api-gateway',
          startTime: Date.now(),
          duration: 150,
          status: 'ok',
          attributes: { 'http.method': 'GET' },
        },
        {
          traceId: 'trace-1',
          spanId: 'span-2',
          parentSpanId: 'span-1',
          operationName: 'db.query',
          serviceName: 'database',
          startTime: Date.now() + 10,
          duration: 100,
          status: 'ok',
          attributes: { 'db.type': 'postgresql' },
        },
      ];

      const encoded = await bridge.encodeTraces(spans);

      expect(encoded).toBeInstanceOf(Float32Array);
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should cache encodings', async () => {
      const spans: TraceSpan[] = [
        {
          traceId: 'trace-1',
          spanId: 'span-1',
          operationName: 'test',
          serviceName: 'test-service',
          startTime: Date.now(),
          duration: 50,
          status: 'ok',
          attributes: {},
        },
      ];

      const encoded1 = await bridge.encodeTraces(spans);
      const encoded2 = await bridge.encodeTraces(spans);

      expect(encoded1).toEqual(encoded2);
    });

    it('should throw when not initialized', async () => {
      const newBridge = createPerfSparseBridge();
      await expect(newBridge.encodeTraces([])).rejects.toThrow();
    });
  });

  describe('detectAnomalies', () => {
    beforeEach(async () => {
      await bridge.init();
    });

    it('should detect anomalies in encoded data', async () => {
      const encoded = new Float32Array([0, 0, 0, 5.0, 0, 0, 0, 10.0, 0, 0]);
      const threshold = 2.0;

      const anomalies = await bridge.detectAnomalies(encoded, threshold);

      expect(Array.isArray(anomalies)).toBe(true);
    });

    it('should return empty array for uniform data', async () => {
      const encoded = new Float32Array([1, 1, 1, 1, 1]);
      const threshold = 3.0;

      const anomalies = await bridge.detectAnomalies(encoded, threshold);

      expect(anomalies).toEqual([]);
    });

    it('should return empty array for zero data', async () => {
      const encoded = new Float32Array([0, 0, 0, 0, 0]);
      const threshold = 2.0;

      const anomalies = await bridge.detectAnomalies(encoded, threshold);

      expect(anomalies).toEqual([]);
    });
  });

  describe('analyzeCriticalPath', () => {
    beforeEach(async () => {
      await bridge.init();
    });

    it('should analyze critical path', async () => {
      const encoded = new Float32Array(100);
      encoded[10] = 0.8;
      encoded[25] = 0.6;
      encoded[50] = 0.4;

      const criticalPath = await bridge.analyzeCriticalPath(encoded);

      expect(Array.isArray(criticalPath)).toBe(true);
    });

    it('should return empty array for zero encoded data', async () => {
      const encoded = new Float32Array(100);

      const criticalPath = await bridge.analyzeCriticalPath(encoded);

      expect(criticalPath).toEqual([]);
    });
  });

  describe('analyzePatterns', () => {
    beforeEach(async () => {
      await bridge.init();
    });

    it('should analyze trace patterns', async () => {
      const spans: TraceSpan[] = [
        {
          traceId: 'trace-1',
          spanId: 'span-1',
          operationName: 'http.request',
          serviceName: 'api',
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
          duration: 100,
          status: 'ok',
          attributes: {},
        },
        {
          traceId: 'trace-1',
          spanId: 'span-3',
          parentSpanId: 'span-1',
          operationName: 'http.request',
          serviceName: 'api',
          startTime: Date.now() + 120,
          duration: 200,
          status: 'error',
          attributes: {},
        },
      ];

      const result = bridge.analyzePatterns(spans);

      expect(result.patterns).toBeInstanceOf(Map);
      expect(result.hotspots).toBeInstanceOf(Array);
      expect(result.dependencies).toBeInstanceOf(Map);
    });

    it('should identify hotspots (slow operations)', async () => {
      const spans: TraceSpan[] = [
        {
          traceId: 'trace-1',
          spanId: 'span-1',
          operationName: 'slow.operation',
          serviceName: 'test',
          startTime: Date.now(),
          duration: 500, // > 100ms threshold
          status: 'ok',
          attributes: {},
        },
      ];

      const result = bridge.analyzePatterns(spans);

      expect(result.hotspots).toContain('span-1');
    });
  });

  describe('factory function', () => {
    it('should create bridge with default config', () => {
      const b = createPerfSparseBridge();
      expect(b).toBeInstanceOf(PerfSparseBridge);
    });

    it('should create bridge with custom config', () => {
      const b = createPerfSparseBridge({
        maxDimensions: 512,
        sparsityRatio: 0.05,
      });
      expect(b).toBeInstanceOf(PerfSparseBridge);
    });
  });
});
