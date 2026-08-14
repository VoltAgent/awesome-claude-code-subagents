import type { TelemetryReading } from '../entities/index.js';

// ---------------------------------------------------------------------------
// Dependency contract
// ---------------------------------------------------------------------------

export interface TelemetryServiceDeps {
  queryVectors: (
    deviceId: string,
    vector: number[],
    k: number,
  ) => Promise<{
    results: Array<{
      id: number | string;
      distance: number;
      metadata?: Record<string, unknown>;
    }>;
    query_ms?: number;
  }>;
  ingestVectors: (
    deviceId: string,
    vectors: Array<{
      values: number[];
      metadata?: Record<string, unknown>;
    }>,
  ) => Promise<{
    ingested: number;
    epoch?: number;
  }>;
  getStoreStatus: (deviceId: string) => Promise<{
    total_vectors: number;
    deleted_vectors: number;
    dimension: number;
    file_size_bytes?: number;
    epoch?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface StoreQueryResult {
  deviceId: string;
  matches: Array<{
    id: number | string;
    distance: number;
    metadata?: Record<string, unknown>;
  }>;
  queryMs: number;
}

export interface IngestResult {
  deviceId: string;
  ingested: number;
  epoch?: number;
}

export interface StoreHealthStatus {
  deviceId: string;
  totalVectors: number;
  deletedVectors: number;
  dimension: number;
  fileSizeBytes: number;
  /** Ratio of live vectors to total (1.0 = no tombstones). */
  liveRatio: number;
  epoch?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TelemetryService {
  constructor(private readonly deps: TelemetryServiceDeps) {}

  /**
   * Run a k-NN query against a device's vector store.
   */
  async queryDevice(
    deviceId: string,
    vector: number[],
    k: number,
  ): Promise<StoreQueryResult> {
    const raw = await this.deps.queryVectors(deviceId, vector, k);
    return {
      deviceId,
      matches: raw.results,
      queryMs: raw.query_ms ?? 0,
    };
  }

  /**
   * Convert telemetry readings to vectors and ingest them into the device
   * vector store.
   */
  async ingestTelemetry(
    deviceId: string,
    readings: TelemetryReading[],
  ): Promise<IngestResult> {
    const vectors = readings.map((r) => ({
      values: r.vector,
      metadata: {
        readingId: r.readingId,
        timestamp: r.timestamp.toISOString(),
        anomalyScore: r.anomalyScore,
        ...r.metadata,
      },
    }));

    const result = await this.deps.ingestVectors(deviceId, vectors);
    return {
      deviceId,
      ingested: result.ingested,
      epoch: result.epoch,
    };
  }

  /**
   * Retrieve vector store health metrics for a device.
   */
  async getStoreHealth(deviceId: string): Promise<StoreHealthStatus> {
    const raw = await this.deps.getStoreStatus(deviceId);
    const live = raw.total_vectors - raw.deleted_vectors;
    return {
      deviceId,
      totalVectors: raw.total_vectors,
      deletedVectors: raw.deleted_vectors,
      dimension: raw.dimension,
      fileSizeBytes: raw.file_size_bytes ?? 0,
      liveRatio: raw.total_vectors > 0 ? live / raw.total_vectors : 1.0,
      epoch: raw.epoch,
    };
  }
}
