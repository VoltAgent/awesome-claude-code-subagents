import { describe, it, expect, vi } from 'vitest';
import { SONAIntegrationService } from '../../src/domain/services/sona-integration-service.js';
import type { SONAClient } from '../../src/domain/services/sona-integration-service.js';
import type { AnomalyDetection, TelemetryReading } from '../../src/domain/entities/telemetry.js';
import type { TelemetryBaseline } from '../../src/domain/services/anomaly-detection-service.js';

function makeSONAClient(overrides: Partial<SONAClient> = {}): SONAClient {
  return {
    storePattern: vi.fn().mockResolvedValue(undefined),
    searchPatterns: vi.fn().mockResolvedValue([]),
    trainTrajectory: vi.fn().mockResolvedValue(undefined),
    predict: vi.fn().mockResolvedValue({ prediction: 'normal', confidence: 0.8 }),
    ...overrides,
  };
}

function makeAnomaly(overrides: Partial<AnomalyDetection> = {}): AnomalyDetection {
  return {
    readingId: 'r-001', deviceId: 'dev-001', score: 0.85,
    type: 'spike', confidence: 0.9, suggestedAction: 'alert', metadata: {},
    ...overrides,
  };
}

function makeBaseline(): TelemetryBaseline {
  return {
    deviceId: 'dev-001',
    meanVector: [10, 20, 30],
    stdVector: [1, 2, 3],
    sampleCount: 50,
    computedAt: new Date(),
  };
}

function makeReading(overrides: Partial<TelemetryReading> = {}): TelemetryReading {
  return {
    readingId: 'r-001', deviceId: 'dev-001', fleetId: 'fleet-1',
    timestamp: new Date(), vector: [10, 20, 30],
    rawMetrics: { temp: 25 }, anomalyScore: 0, metadata: {},
    ...overrides,
  };
}

describe('SONAIntegrationService', () => {
  it('reports enabled when client provided', () => {
    const svc = new SONAIntegrationService(makeSONAClient());
    expect(svc.isEnabled).toBe(true);
  });

  it('reports disabled when client is null', () => {
    const svc = new SONAIntegrationService(null);
    expect(svc.isEnabled).toBe(false);
  });

  it('reports disabled when config.enabled is false', () => {
    const svc = new SONAIntegrationService(makeSONAClient(), { enabled: false });
    expect(svc.isEnabled).toBe(false);
  });

  it('learns anomaly pattern', async () => {
    const client = makeSONAClient();
    const svc = new SONAIntegrationService(client);
    const anomaly = makeAnomaly();
    const baseline = makeBaseline();

    await svc.learnAnomalyPattern(anomaly, baseline);

    expect(client.storePattern).toHaveBeenCalledWith(
      'anomaly:spike:dev-001',
      expect.objectContaining({ type: 'spike', score: 0.85, baselineSamples: 50 }),
    );
  });

  it('skips learning when disabled', async () => {
    const client = makeSONAClient();
    const svc = new SONAIntegrationService(client, { enabled: false });

    await svc.learnAnomalyPattern(makeAnomaly(), makeBaseline());

    expect(client.storePattern).not.toHaveBeenCalled();
  });

  it('learns baseline shift with drift vector', async () => {
    const client = makeSONAClient();
    const svc = new SONAIntegrationService(client);
    const oldBaseline = makeBaseline();
    const newBaseline: TelemetryBaseline = {
      ...makeBaseline(),
      meanVector: [12, 22, 28],
      sampleCount: 75,
    };

    await svc.learnBaselineShift('dev-001', oldBaseline, newBaseline);

    expect(client.storePattern).toHaveBeenCalledWith(
      'baseline-shift:dev-001',
      expect.objectContaining({
        driftVector: [2, 2, 2],
        maxDrift: 2,
        oldSamples: 50,
        newSamples: 75,
      }),
    );
  });

  it('records telemetry trajectory', async () => {
    const client = makeSONAClient();
    const svc = new SONAIntegrationService(client);
    const readings = [makeReading({ readingId: 'r-001' }), makeReading({ readingId: 'r-002' })];
    const anomalies = [makeAnomaly({ readingId: 'r-001' })];

    await svc.recordTelemetryTrajectory('dev-001', readings, anomalies);

    expect(client.trainTrajectory).toHaveBeenCalledWith(
      expect.stringContaining('iot-trajectories:dev-001:'),
      expect.arrayContaining([
        expect.objectContaining({ action: 'anomaly:spike', reward: -0.85 }),
        expect.objectContaining({ action: 'normal', reward: 1.0 }),
      ]),
    );
  });

  it('predicts anomaly risk when confidence meets threshold', async () => {
    const client = makeSONAClient({
      predict: vi.fn().mockResolvedValue({ prediction: 'spike', confidence: 0.85 }),
    });
    const svc = new SONAIntegrationService(client);

    const result = await svc.predictAnomalyRisk(makeReading());

    expect(result).toEqual({ risk: 'spike', confidence: 0.85 });
  });

  it('returns null when prediction confidence below threshold', async () => {
    const client = makeSONAClient({
      predict: vi.fn().mockResolvedValue({ prediction: 'spike', confidence: 0.3 }),
    });
    const svc = new SONAIntegrationService(client);

    const result = await svc.predictAnomalyRisk(makeReading());

    expect(result).toBeNull();
  });

  it('returns null for prediction when disabled', async () => {
    const svc = new SONAIntegrationService(null);

    const result = await svc.predictAnomalyRisk(makeReading());

    expect(result).toBeNull();
  });

  it('finds similar anomaly patterns', async () => {
    const client = makeSONAClient({
      searchPatterns: vi.fn().mockResolvedValue([
        { key: 'anomaly:spike:dev-002', pattern: { type: 'spike' }, score: 0.9 },
      ]),
    });
    const svc = new SONAIntegrationService(client);

    const results = await svc.findSimilarAnomalyPatterns(makeAnomaly());

    expect(results).toHaveLength(1);
    expect(client.searchPatterns).toHaveBeenCalledWith(
      expect.stringContaining('anomaly:spike'),
      5,
    );
  });

  it('returns empty for similar patterns when disabled', async () => {
    const svc = new SONAIntegrationService(null);

    const results = await svc.findSimilarAnomalyPatterns(makeAnomaly());

    expect(results).toHaveLength(0);
  });
});
