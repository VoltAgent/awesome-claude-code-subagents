import { describe, it, expect } from 'vitest';
import { AnomalyDetectionService } from '../../src/domain/services/anomaly-detection-service.js';
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
    rawMetrics: overrides.rawMetrics ?? {},
    anomalyScore: 0,
    metadata: {},
    ...overrides,
  };
}

describe('AnomalyDetectionService', () => {
  describe('computeBaseline', () => {
    it('computes mean and std from readings', () => {
      const svc = new AnomalyDetectionService();
      const readings = [
        makeReading('d1', [1, 2, 3]),
        makeReading('d1', [3, 4, 5]),
        makeReading('d1', [5, 6, 7]),
      ];
      const baseline = svc.computeBaseline('d1', readings);

      expect(baseline.deviceId).toBe('d1');
      expect(baseline.sampleCount).toBe(3);
      expect(baseline.meanVector).toHaveLength(3);
      expect(baseline.meanVector[0]).toBeCloseTo(3, 5);
      expect(baseline.meanVector[1]).toBeCloseTo(4, 5);
      expect(baseline.meanVector[2]).toBeCloseTo(5, 5);
      expect(baseline.stdVector).toHaveLength(3);
      expect(baseline.stdVector[0]).toBeGreaterThan(0);
      expect(baseline.computedAt).toBeInstanceOf(Date);
    });

    it('throws on empty readings', () => {
      const svc = new AnomalyDetectionService();
      expect(() => svc.computeBaseline('d1', [])).toThrow('Cannot compute baseline from empty readings');
    });

    it('handles single reading (std = 0)', () => {
      const svc = new AnomalyDetectionService();
      const baseline = svc.computeBaseline('d1', [makeReading('d1', [5, 10])]);

      expect(baseline.sampleCount).toBe(1);
      expect(baseline.meanVector).toEqual([5, 10]);
      expect(baseline.stdVector).toEqual([0, 0]);
    });

    it('caches baseline per device', () => {
      const svc = new AnomalyDetectionService();
      svc.computeBaseline('d1', [makeReading('d1', [1, 2])]);
      svc.computeBaseline('d2', [makeReading('d2', [10, 20])]);

      expect(svc.getBaseline('d1')!.meanVector).toEqual([1, 2]);
      expect(svc.getBaseline('d2')!.meanVector).toEqual([10, 20]);
    });
  });

  describe('getBaseline', () => {
    it('returns undefined for unknown device', () => {
      const svc = new AnomalyDetectionService();
      expect(svc.getBaseline('unknown')).toBeUndefined();
    });
  });

  describe('detect', () => {
    it('returns score 0 with no-baseline metadata when no baseline exists', () => {
      const svc = new AnomalyDetectionService();
      const reading = makeReading('d1', [1, 2, 3]);
      const detection = svc.detect(reading);

      expect(detection.score).toBe(0);
      expect(detection.confidence).toBe(0);
      expect(detection.metadata).toEqual({ reason: 'no-baseline' });
      expect(detection.deviceId).toBe('d1');
    });

    it('detects no anomaly for readings near baseline', () => {
      const svc = new AnomalyDetectionService();
      const readings = Array.from({ length: 20 }, () => makeReading('d1', [10, 20, 30]));
      svc.computeBaseline('d1', readings);

      const detection = svc.detect(makeReading('d1', [10, 20, 30]));
      expect(detection.score).toBe(0);
      expect(detection.suggestedAction).toBe('log');
    });

    it('detects anomaly for readings far from baseline', () => {
      const svc = new AnomalyDetectionService();
      const readings = Array.from({ length: 50 }, (_, i) =>
        makeReading('d1', [10 + (i % 2), 20 + (i % 3), 30]),
      );
      svc.computeBaseline('d1', readings);

      const detection = svc.detect(makeReading('d1', [100, 200, 300]));
      expect(detection.score).toBeGreaterThan(0.5);
    });

    it('classifies spike when maxZ > 5', () => {
      const svc = new AnomalyDetectionService({ baselineWindowSize: 10 });
      const readings = Array.from({ length: 10 }, () => makeReading('d1', [10, 20]));
      // Add slight variance so std != 0
      readings[0] = makeReading('d1', [11, 21]);
      readings[1] = makeReading('d1', [9, 19]);
      svc.computeBaseline('d1', readings);

      const detection = svc.detect(makeReading('d1', [100, 200]));
      expect(detection.type).toBe('spike');
    });

    it('suggests quarantine for high scores', () => {
      const svc = new AnomalyDetectionService({
        anomalyThreshold: 0.7,
        quarantineThreshold: 0.9,
      });
      const readings = Array.from({ length: 10 }, () => makeReading('d1', [10, 20]));
      readings[0] = makeReading('d1', [11, 21]);
      readings[1] = makeReading('d1', [9, 19]);
      svc.computeBaseline('d1', readings);

      const detection = svc.detect(makeReading('d1', [1000, 2000]));
      expect(detection.suggestedAction).toBe('quarantine');
    });

    it('confidence scales with sample count', () => {
      const svc = new AnomalyDetectionService({ baselineWindowSize: 100 });
      const smallSet = Array.from({ length: 10 }, () => makeReading('d1', [10]));
      smallSet[0] = makeReading('d1', [11]);
      svc.computeBaseline('d1', smallSet);

      const detection = svc.detect(makeReading('d1', [50]));
      expect(detection.confidence).toBeCloseTo(0.1, 1);
    });

    it('classifies flatline when all metrics are zero and z-scores low', () => {
      const svc = new AnomalyDetectionService();
      const readings = Array.from({ length: 10 }, () =>
        makeReading('d1', [0, 0], { rawMetrics: { a: 0, b: 0 } }),
      );
      svc.computeBaseline('d1', readings);

      const detection = svc.detect(
        makeReading('d1', [0, 0], { rawMetrics: { a: 0, b: 0 } }),
      );
      expect(detection.type).toBe('flatline');
    });
  });

  describe('isAnomalous', () => {
    it('returns true when score >= threshold', () => {
      const svc = new AnomalyDetectionService({ anomalyThreshold: 0.5 });
      expect(svc.isAnomalous({ score: 0.5 } as any)).toBe(true);
      expect(svc.isAnomalous({ score: 0.8 } as any)).toBe(true);
    });

    it('returns false when score < threshold', () => {
      const svc = new AnomalyDetectionService({ anomalyThreshold: 0.5 });
      expect(svc.isAnomalous({ score: 0.3 } as any)).toBe(false);
    });
  });
});
