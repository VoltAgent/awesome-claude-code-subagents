import { describe, it, expect, vi } from 'vitest';
import { AnomalyDetectionService } from '../../src/domain/services/anomaly-detection-service.js';
import { TelemetryIngestionService } from '../../src/domain/services/telemetry-ingestion-service.js';
import type { TelemetryReading } from '../../src/domain/entities/index.js';

function makeReading(
  deviceId: string,
  vector: number[],
  overrides: Partial<TelemetryReading> = {},
): TelemetryReading {
  return {
    readingId: overrides.readingId ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    deviceId,
    fleetId: 'fleet-1',
    timestamp: new Date(),
    vector,
    rawMetrics: {},
    anomalyScore: 0,
    metadata: {},
    ...overrides,
  };
}

function createService(anomalyConfig?: Parameters<typeof AnomalyDetectionService.prototype.constructor>[0]) {
  const deps = {
    queryDeviceStore: vi.fn().mockResolvedValue([]),
    getStoreStatus: vi.fn().mockResolvedValue({ total_vectors: 100, dimension: 3 }),
  };
  const detector = new AnomalyDetectionService(anomalyConfig);
  const svc = new TelemetryIngestionService(deps, detector);
  return { svc, detector, deps };
}

describe('TelemetryIngestionService', () => {
  describe('processBatch', () => {
    it('returns zero anomalies when no baseline exists', () => {
      const { svc } = createService();
      const readings = [makeReading('d1', [1, 2, 3])];
      const result = svc.processBatch('d1', readings);

      expect(result.deviceId).toBe('d1');
      expect(result.readingsProcessed).toBe(1);
      expect(result.anomaliesDetected).toBe(0);
      expect(result.anomalies).toHaveLength(0);
    });

    it('detects anomalies after baseline is set', () => {
      const { svc, detector } = createService({ anomalyThreshold: 0.3 });
      const baselineReadings = Array.from({ length: 20 }, () => makeReading('d1', [10, 20, 30]));
      baselineReadings[0] = makeReading('d1', [11, 21, 31]);
      baselineReadings[1] = makeReading('d1', [9, 19, 29]);
      detector.computeBaseline('d1', baselineReadings);

      const anomalousReadings = [
        makeReading('d1', [10, 20, 30]),
        makeReading('d1', [100, 200, 300]),
      ];
      const result = svc.processBatch('d1', anomalousReadings);

      expect(result.readingsProcessed).toBe(2);
      expect(result.anomaliesDetected).toBeGreaterThan(0);
      expect(result.anomalies.length).toBeGreaterThan(0);
      expect(result.baseline).toBeDefined();
    });

    it('processes empty batch without error', () => {
      const { svc } = createService();
      const result = svc.processBatch('d1', []);

      expect(result.readingsProcessed).toBe(0);
      expect(result.anomaliesDetected).toBe(0);
    });
  });

  describe('refreshBaseline', () => {
    it('delegates to anomaly detector', () => {
      const { svc } = createService();
      const readings = [
        makeReading('d1', [1, 2]),
        makeReading('d1', [3, 4]),
      ];
      const baseline = svc.refreshBaseline('d1', readings);

      expect(baseline.deviceId).toBe('d1');
      expect(baseline.sampleCount).toBe(2);
      expect(baseline.meanVector).toHaveLength(2);
    });
  });

  describe('getBaseline', () => {
    it('returns undefined before computation', () => {
      const { svc } = createService();
      expect(svc.getBaseline('d1')).toBeUndefined();
    });

    it('returns baseline after refresh', () => {
      const { svc } = createService();
      svc.refreshBaseline('d1', [makeReading('d1', [5, 10])]);
      const baseline = svc.getBaseline('d1');

      expect(baseline).toBeDefined();
      expect(baseline!.deviceId).toBe('d1');
    });
  });
});
