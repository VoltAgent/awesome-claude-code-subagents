import type { TelemetryReading, AnomalyDetection } from '../domain/entities/telemetry.js';
import type { TelemetryRepository } from '../domain/repositories/telemetry-repository.js';

export interface AgentDBTelemetryConfig {
  namespace: string;
  hnswM?: number;
  hnswEfConstruction?: number;
  hnswEfSearch?: number;
}

export interface AgentDBClient {
  store(key: string, value: string, options?: { namespace?: string; tags?: string[] }): Promise<void>;
  search(query: string, options?: { namespace?: string; limit?: number }): Promise<Array<{ key: string; value: string; score: number }>>;
  list(options?: { namespace?: string; limit?: number }): Promise<Array<{ key: string; value: string }>>;
  retrieve(key: string, options?: { namespace?: string }): Promise<string | null>;
  delete(key: string, options?: { namespace?: string }): Promise<boolean>;
}

export class AgentDBTelemetryRepository implements TelemetryRepository {
  private readonly config: Required<AgentDBTelemetryConfig>;
  private readonly client: AgentDBClient;

  constructor(client: AgentDBClient, config?: Partial<AgentDBTelemetryConfig>) {
    this.client = client;
    this.config = {
      namespace: config?.namespace ?? 'iot-telemetry',
      hnswM: config?.hnswM ?? 16,
      hnswEfConstruction: config?.hnswEfConstruction ?? 200,
      hnswEfSearch: config?.hnswEfSearch ?? 50,
    };
  }

  async store(reading: TelemetryReading): Promise<void> {
    const key = `reading:${reading.deviceId}:${reading.readingId}`;
    await this.client.store(key, JSON.stringify(this.serializeReading(reading)), {
      namespace: this.config.namespace,
      tags: [`device:${reading.deviceId}`, `fleet:${reading.fleetId}`],
    });
  }

  async storeBatch(readings: TelemetryReading[]): Promise<number> {
    let stored = 0;
    for (const reading of readings) {
      await this.store(reading);
      stored++;
    }
    return stored;
  }

  async findByDevice(deviceId: string, limit = 100): Promise<TelemetryReading[]> {
    const results = await this.client.search(`device:${deviceId}`, {
      namespace: this.config.namespace,
      limit,
    });
    return results
      .map((r) => this.deserializeReading(r.value))
      .filter((r): r is TelemetryReading => r !== null);
  }

  async searchSimilar(vector: number[], k: number, deviceId?: string): Promise<TelemetryReading[]> {
    const query = deviceId
      ? `vector:${vector.slice(0, 4).join(',')} device:${deviceId}`
      : `vector:${vector.slice(0, 4).join(',')}`;
    const results = await this.client.search(query, {
      namespace: this.config.namespace,
      limit: k,
    });
    return results
      .map((r) => this.deserializeReading(r.value))
      .filter((r): r is TelemetryReading => r !== null);
  }

  async storeAnomaly(anomaly: AnomalyDetection): Promise<void> {
    const key = `anomaly:${anomaly.deviceId}:${anomaly.readingId}`;
    await this.client.store(key, JSON.stringify(anomaly), {
      namespace: `${this.config.namespace}-anomalies`,
      tags: [`device:${anomaly.deviceId}`, `type:${anomaly.type}`, `action:${anomaly.suggestedAction}`],
    });
  }

  async findAnomalies(deviceId: string, limit = 50): Promise<AnomalyDetection[]> {
    const results = await this.client.search(`device:${deviceId}`, {
      namespace: `${this.config.namespace}-anomalies`,
      limit,
    });
    return results
      .map((r) => {
        try { return JSON.parse(r.value) as AnomalyDetection; } catch { return null; }
      })
      .filter((a): a is AnomalyDetection => a !== null);
  }

  async count(deviceId?: string): Promise<number> {
    const query = deviceId ? `device:${deviceId}` : '*';
    const results = await this.client.search(query, {
      namespace: this.config.namespace,
      limit: 10000,
    });
    return results.length;
  }

  async deleteByDevice(deviceId: string): Promise<number> {
    const readings = await this.findByDevice(deviceId, 10000);
    let deleted = 0;
    for (const reading of readings) {
      const key = `reading:${reading.deviceId}:${reading.readingId}`;
      const ok = await this.client.delete(key, { namespace: this.config.namespace });
      if (ok) deleted++;
    }
    return deleted;
  }

  private serializeReading(reading: TelemetryReading): Record<string, unknown> {
    return {
      ...reading,
      timestamp: reading.timestamp.toISOString(),
    };
  }

  private deserializeReading(raw: string): TelemetryReading | null {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        ...parsed,
        timestamp: new Date(parsed['timestamp'] as string),
      } as TelemetryReading;
    } catch {
      return null;
    }
  }
}
