import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelemetryService } from '../../src/domain/services/telemetry-service.js';
import type { TelemetryServiceDeps } from '../../src/domain/services/telemetry-service.js';
import type { TelemetryReading } from '../../src/domain/entities/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(
  overrides: Partial<TelemetryServiceDeps> = {},
): TelemetryServiceDeps {
  return {
    queryVectors: vi.fn().mockResolvedValue({
      results: [
        { id: 1, distance: 0.12, metadata: { label: 'temp' } },
        { id: 2, distance: 0.34 },
      ],
      query_ms: 5,
    }),
    ingestVectors: vi.fn().mockResolvedValue({
      ingested: 3,
      epoch: 42,
    }),
    getStoreStatus: vi.fn().mockResolvedValue({
      total_vectors: 1000,
      deleted_vectors: 50,
      dimension: 384,
      file_size_bytes: 2_048_000,
      epoch: 42,
    }),
    ...overrides,
  };
}

function makeReading(
  overrides: Partial<TelemetryReading> = {},
): TelemetryReading {
  return {
    readingId: 'r-001',
    deviceId: 'dev-001',
    fleetId: 'fleet-1',
    timestamp: new Date('2026-01-15T12:00:00Z'),
    vector: [0.1, 0.2, 0.3],
    rawMetrics: { temperature: 22.5 },
    anomalyScore: 0.05,
    metadata: { source: 'sensor-a' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TelemetryService', () => {
  let deps: TelemetryServiceDeps;
  let service: TelemetryService;

  beforeEach(() => {
    deps = makeDeps();
    service = new TelemetryService(deps);
  });

  // -----------------------------------------------------------------------
  // queryDevice
  // -----------------------------------------------------------------------

  describe('queryDevice', () => {
    it('should return matches with deviceId and queryMs', async () => {
      const result = await service.queryDevice('dev-001', [0.1, 0.2], 5);

      expect(result.deviceId).toBe('dev-001');
      expect(result.queryMs).toBe(5);
      expect(result.matches).toEqual([
        { id: 1, distance: 0.12, metadata: { label: 'temp' } },
        { id: 2, distance: 0.34 },
      ]);
    });

    it('should pass deviceId, vector, and k to deps.queryVectors', async () => {
      const vector = [1.0, 2.0, 3.0];
      await service.queryDevice('dev-xyz', vector, 10);

      expect(deps.queryVectors).toHaveBeenCalledWith('dev-xyz', vector, 10);
    });

    it('should default queryMs to 0 when query_ms is undefined', async () => {
      deps = makeDeps({
        queryVectors: vi.fn().mockResolvedValue({
          results: [],
          query_ms: undefined,
        }),
      });
      service = new TelemetryService(deps);

      const result = await service.queryDevice('dev-001', [0.1], 1);

      expect(result.queryMs).toBe(0);
    });

    it('should return empty matches when no results', async () => {
      deps = makeDeps({
        queryVectors: vi.fn().mockResolvedValue({
          results: [],
          query_ms: 1,
        }),
      });
      service = new TelemetryService(deps);

      const result = await service.queryDevice('dev-001', [0.1], 1);

      expect(result.matches).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // ingestTelemetry
  // -----------------------------------------------------------------------

  describe('ingestTelemetry', () => {
    it('should convert TelemetryReading[] to vectors and return IngestResult', async () => {
      const readings = [
        makeReading({ readingId: 'r-001', vector: [0.1, 0.2, 0.3] }),
        makeReading({ readingId: 'r-002', vector: [0.4, 0.5, 0.6] }),
      ];

      const result = await service.ingestTelemetry('dev-001', readings);

      expect(result.deviceId).toBe('dev-001');
      expect(result.ingested).toBe(3);
      expect(result.epoch).toBe(42);
    });

    it('should pass correctly structured vectors to deps.ingestVectors', async () => {
      const timestamp = new Date('2026-03-01T10:00:00Z');
      const readings = [
        makeReading({
          readingId: 'r-100',
          vector: [1.0, 2.0],
          timestamp,
          anomalyScore: 0.9,
          metadata: { zone: 'A' },
        }),
      ];

      await service.ingestTelemetry('dev-001', readings);

      expect(deps.ingestVectors).toHaveBeenCalledWith('dev-001', [
        {
          values: [1.0, 2.0],
          metadata: {
            readingId: 'r-100',
            timestamp: '2026-03-01T10:00:00.000Z',
            anomalyScore: 0.9,
            zone: 'A',
          },
        },
      ]);
    });

    it('should merge reading metadata into vector metadata', async () => {
      const readings = [
        makeReading({
          metadata: { custom: 'value', source: 'test' },
        }),
      ];

      await service.ingestTelemetry('dev-001', readings);

      const calledVectors = (deps.ingestVectors as ReturnType<typeof vi.fn>)
        .mock.calls[0][1];
      expect(calledVectors[0].metadata).toHaveProperty('custom', 'value');
      expect(calledVectors[0].metadata).toHaveProperty('source', 'test');
      expect(calledVectors[0].metadata).toHaveProperty('readingId');
      expect(calledVectors[0].metadata).toHaveProperty('timestamp');
      expect(calledVectors[0].metadata).toHaveProperty('anomalyScore');
    });

    it('should handle empty readings array', async () => {
      deps = makeDeps({
        ingestVectors: vi.fn().mockResolvedValue({ ingested: 0 }),
      });
      service = new TelemetryService(deps);

      const result = await service.ingestTelemetry('dev-001', []);

      expect(deps.ingestVectors).toHaveBeenCalledWith('dev-001', []);
      expect(result.ingested).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getStoreHealth
  // -----------------------------------------------------------------------

  describe('getStoreHealth', () => {
    it('should compute liveRatio correctly', async () => {
      const result = await service.getStoreHealth('dev-001');

      // (1000 - 50) / 1000 = 0.95
      expect(result.liveRatio).toBeCloseTo(0.95, 10);
      expect(result.deviceId).toBe('dev-001');
      expect(result.totalVectors).toBe(1000);
      expect(result.deletedVectors).toBe(50);
      expect(result.dimension).toBe(384);
      expect(result.fileSizeBytes).toBe(2_048_000);
      expect(result.epoch).toBe(42);
    });

    it('should return liveRatio 1.0 when total_vectors is 0', async () => {
      deps = makeDeps({
        getStoreStatus: vi.fn().mockResolvedValue({
          total_vectors: 0,
          deleted_vectors: 0,
          dimension: 128,
          file_size_bytes: 0,
          epoch: 1,
        }),
      });
      service = new TelemetryService(deps);

      const result = await service.getStoreHealth('dev-001');

      expect(result.liveRatio).toBe(1.0);
    });

    it('should return liveRatio 0.0 when all vectors are deleted', async () => {
      deps = makeDeps({
        getStoreStatus: vi.fn().mockResolvedValue({
          total_vectors: 100,
          deleted_vectors: 100,
          dimension: 256,
        }),
      });
      service = new TelemetryService(deps);

      const result = await service.getStoreHealth('dev-001');

      expect(result.liveRatio).toBeCloseTo(0.0, 10);
    });

    it('should default fileSizeBytes to 0 when file_size_bytes is undefined', async () => {
      deps = makeDeps({
        getStoreStatus: vi.fn().mockResolvedValue({
          total_vectors: 10,
          deleted_vectors: 0,
          dimension: 64,
        }),
      });
      service = new TelemetryService(deps);

      const result = await service.getStoreHealth('dev-001');

      expect(result.fileSizeBytes).toBe(0);
    });

    it('should pass deviceId to deps.getStoreStatus', async () => {
      await service.getStoreHealth('dev-xyz');

      expect(deps.getStoreStatus).toHaveBeenCalledWith('dev-xyz');
    });
  });
});
