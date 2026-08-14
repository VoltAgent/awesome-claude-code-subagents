import { describe, it, expect, vi } from 'vitest';
import { AgentDBTelemetryRepository } from '../../src/infrastructure/agentdb-telemetry-repository.js';
import type { AgentDBClient } from '../../src/infrastructure/agentdb-telemetry-repository.js';
import type { TelemetryReading, AnomalyDetection } from '../../src/domain/entities/telemetry.js';

function makeClient(overrides: Partial<AgentDBClient> = {}): AgentDBClient {
  return {
    store: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    retrieve: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeReading(overrides: Partial<TelemetryReading> = {}): TelemetryReading {
  return {
    readingId: 'r-001',
    deviceId: 'dev-001',
    fleetId: 'fleet-1',
    timestamp: new Date('2026-04-29T00:00:00Z'),
    vector: [1.0, 2.0, 3.0],
    rawMetrics: { temp: 25 },
    anomalyScore: 0,
    metadata: {},
    ...overrides,
  };
}

describe('AgentDBTelemetryRepository', () => {
  it('stores a reading with correct key and namespace', async () => {
    const client = makeClient();
    const repo = new AgentDBTelemetryRepository(client);
    const reading = makeReading();

    await repo.store(reading);

    expect(client.store).toHaveBeenCalledWith(
      'reading:dev-001:r-001',
      expect.any(String),
      { namespace: 'iot-telemetry', tags: ['device:dev-001', 'fleet:fleet-1'] },
    );
  });

  it('stores batch and returns count', async () => {
    const client = makeClient();
    const repo = new AgentDBTelemetryRepository(client);
    const readings = [
      makeReading({ readingId: 'r-001' }),
      makeReading({ readingId: 'r-002' }),
      makeReading({ readingId: 'r-003' }),
    ];

    const count = await repo.storeBatch(readings);

    expect(count).toBe(3);
    expect(client.store).toHaveBeenCalledTimes(3);
  });

  it('finds readings by device', async () => {
    const reading = makeReading();
    const client = makeClient({
      search: vi.fn().mockResolvedValue([
        { key: 'reading:dev-001:r-001', value: JSON.stringify({ ...reading, timestamp: reading.timestamp.toISOString() }), score: 1.0 },
      ]),
    });
    const repo = new AgentDBTelemetryRepository(client);

    const results = await repo.findByDevice('dev-001');

    expect(results).toHaveLength(1);
    expect(results[0].deviceId).toBe('dev-001');
    expect(client.search).toHaveBeenCalledWith('device:dev-001', { namespace: 'iot-telemetry', limit: 100 });
  });

  it('searches similar vectors', async () => {
    const client = makeClient();
    const repo = new AgentDBTelemetryRepository(client);

    await repo.searchSimilar([1.0, 2.0, 3.0], 5, 'dev-001');

    expect(client.search).toHaveBeenCalledWith(
      expect.stringContaining('device:dev-001'),
      { namespace: 'iot-telemetry', limit: 5 },
    );
  });

  it('stores anomaly with correct namespace', async () => {
    const client = makeClient();
    const repo = new AgentDBTelemetryRepository(client);
    const anomaly: AnomalyDetection = {
      readingId: 'r-001',
      deviceId: 'dev-001',
      score: 0.85,
      type: 'spike',
      confidence: 0.9,
      suggestedAction: 'alert',
      metadata: {},
    };

    await repo.storeAnomaly(anomaly);

    expect(client.store).toHaveBeenCalledWith(
      'anomaly:dev-001:r-001',
      expect.any(String),
      { namespace: 'iot-telemetry-anomalies', tags: ['device:dev-001', 'type:spike', 'action:alert'] },
    );
  });

  it('finds anomalies by device', async () => {
    const anomaly: AnomalyDetection = {
      readingId: 'r-001', deviceId: 'dev-001', score: 0.85,
      type: 'spike', confidence: 0.9, suggestedAction: 'alert', metadata: {},
    };
    const client = makeClient({
      search: vi.fn().mockResolvedValue([
        { key: 'anomaly:dev-001:r-001', value: JSON.stringify(anomaly), score: 1.0 },
      ]),
    });
    const repo = new AgentDBTelemetryRepository(client);

    const results = await repo.findAnomalies('dev-001');

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('spike');
  });

  it('counts readings for a device', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue([
        { key: 'a', value: '{}', score: 1 },
        { key: 'b', value: '{}', score: 1 },
      ]),
    });
    const repo = new AgentDBTelemetryRepository(client);

    const count = await repo.count('dev-001');

    expect(count).toBe(2);
  });

  it('deletes readings by device', async () => {
    const reading = makeReading();
    const client = makeClient({
      search: vi.fn().mockResolvedValue([
        { key: 'reading:dev-001:r-001', value: JSON.stringify({ ...reading, timestamp: reading.timestamp.toISOString() }), score: 1.0 },
      ]),
      delete: vi.fn().mockResolvedValue(true),
    });
    const repo = new AgentDBTelemetryRepository(client);

    const deleted = await repo.deleteByDevice('dev-001');

    expect(deleted).toBe(1);
    expect(client.delete).toHaveBeenCalledWith('reading:dev-001:r-001', { namespace: 'iot-telemetry' });
  });

  it('uses custom namespace from config', async () => {
    const client = makeClient();
    const repo = new AgentDBTelemetryRepository(client, { namespace: 'custom-ns' });

    await repo.store(makeReading());

    expect(client.store).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ namespace: 'custom-ns' }),
    );
  });
});
