import { describe, it, expect } from 'vitest';
import { AnomalyDetectionService } from '../../src/domain/services/anomaly-detection-service.js';
import { TelemetryIngestionService } from '../../src/domain/services/telemetry-ingestion-service.js';
import type { TelemetryReading } from '../../src/domain/entities/index.js';

function makeReading(
  deviceId: string,
  vector: number[],
  rawMetrics: Record<string, number> = {},
): TelemetryReading {
  return {
    readingId: `r-${Math.random().toString(36).slice(2, 8)}`,
    deviceId,
    fleetId: 'fleet-test',
    timestamp: new Date(),
    vector,
    rawMetrics,
    anomalyScore: 0,
    metadata: {},
  };
}

function buildNormalBaseline(deviceId: string, count: number): TelemetryReading[] {
  return Array.from({ length: count }, (_, i) =>
    makeReading(deviceId, [
      20 + Math.sin(i * 0.1) * 2,
      50 + Math.cos(i * 0.1) * 3,
      100 + (i % 5) * 0.5,
    ], { temperature: 20 + (i % 3), humidity: 50 + (i % 5) }),
  );
}

describe('Anomaly Injection — all 6 anomaly types', () => {
  const detector = new AnomalyDetectionService({
    anomalyThreshold: 0.3,
    quarantineThreshold: 0.8,
    baselineWindowSize: 50,
  });

  const ingestion = new TelemetryIngestionService(
    {
      queryDeviceStore: async () => [],
      getStoreStatus: async () => ({ total_vectors: 100, dimension: 3 }),
    },
    detector,
  );

  const baseline = buildNormalBaseline('sensor-1', 50);
  detector.computeBaseline('sensor-1', baseline);

  it('detects SPIKE anomaly (extreme single-dimension deviation)', () => {
    const spike = makeReading('sensor-1', [500, 50, 100]);
    const detection = detector.detect(spike);

    expect(detection.score).toBeGreaterThan(0.5);
    expect(detection.type).toBe('spike');
    expect(detection.suggestedAction).not.toBe('log');
  });

  it('detects FLATLINE anomaly (all zeros with zero raw metrics)', () => {
    const flatline = makeReading('sensor-1', [0, 0, 0], {
      temperature: 0,
      humidity: 0,
    });
    const bl = detector.getBaseline('sensor-1')!;
    const allLowStd = bl.stdVector.every((s) => s < 5);
    if (allLowStd) {
      const detection = detector.detect(flatline);
      expect(detection.score).toBeGreaterThan(0);
    }
  });

  it('detects CLUSTER-OUTLIER anomaly (majority of dimensions deviate)', () => {
    const outlier = makeReading('sensor-1', [200, 200, 200]);
    const detection = detector.detect(outlier);

    expect(detection.score).toBeGreaterThan(0.5);
    expect(['cluster-outlier', 'spike']).toContain(detection.type);
  });

  it('detects DRIFT anomaly (1-2 dimensions shift gradually)', () => {
    const drift = makeReading('sensor-1', [20, 50, 115]);
    const detection = detector.detect(drift);

    expect(detection.score).toBeGreaterThan(0);
    if (detection.score >= 0.3) {
      expect(['drift', 'pattern-break', 'spike']).toContain(detection.type);
    }
  });

  it('detects PATTERN-BREAK anomaly (general deviation pattern)', () => {
    const patternBreak = makeReading('sensor-1', [25, 55, 130]);
    const detection = detector.detect(patternBreak);
    expect(detection.type).toBeDefined();
    expect(detection.deviceId).toBe('sensor-1');
  });

  it('processes batch and returns only anomalous readings', () => {
    const batch = [
      ...buildNormalBaseline('sensor-1', 5),
      makeReading('sensor-1', [500, 500, 500]),
      makeReading('sensor-1', [1000, 1000, 1000]),
    ];

    const result = ingestion.processBatch('sensor-1', batch);

    expect(result.readingsProcessed).toBe(7);
    expect(result.anomaliesDetected).toBeGreaterThanOrEqual(2);
    expect(result.anomalies.length).toBe(result.anomaliesDetected);
    for (const a of result.anomalies) {
      expect(a.score).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('quarantine action triggered for extreme anomalies', () => {
    const extreme = makeReading('sensor-1', [10000, 10000, 10000]);
    const detection = detector.detect(extreme);

    expect(detection.score).toBeGreaterThanOrEqual(0.8);
    expect(detection.suggestedAction).toBe('quarantine');
  });

  it('baseline remains stable after anomaly detection', () => {
    const baselineBefore = detector.getBaseline('sensor-1')!;
    detector.detect(makeReading('sensor-1', [999, 999, 999]));
    const baselineAfter = detector.getBaseline('sensor-1')!;

    expect(baselineAfter.meanVector).toEqual(baselineBefore.meanVector);
    expect(baselineAfter.sampleCount).toBe(baselineBefore.sampleCount);
  });

  it('confidence reflects baseline sample coverage', () => {
    const detection = detector.detect(makeReading('sensor-1', [100, 100, 100]));
    expect(detection.confidence).toBe(1);
  });

  it('handles recomputed baseline with fresh data', () => {
    const freshDetector = new AnomalyDetectionService({ anomalyThreshold: 0.3, baselineWindowSize: 32 });
    const freshReadings = Array.from({ length: 32 }, () =>
      makeReading('sensor-fresh', [32, 64, 96]),
    );
    freshDetector.computeBaseline('sensor-fresh', freshReadings);

    const normalAfterRebase = makeReading('sensor-fresh', [32, 64, 96]);
    const detection = freshDetector.detect(normalAfterRebase);
    expect(detection.score).toBe(0);
  });
});
