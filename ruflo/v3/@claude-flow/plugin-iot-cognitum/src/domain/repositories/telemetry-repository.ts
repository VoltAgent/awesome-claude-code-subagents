import type { TelemetryReading, AnomalyDetection } from '../entities/telemetry.js';

export interface TelemetryRepository {
  store(reading: TelemetryReading): Promise<void>;
  storeBatch(readings: TelemetryReading[]): Promise<number>;
  findByDevice(deviceId: string, limit?: number): Promise<TelemetryReading[]>;
  searchSimilar(vector: number[], k: number, deviceId?: string): Promise<TelemetryReading[]>;
  storeAnomaly(anomaly: AnomalyDetection): Promise<void>;
  findAnomalies(deviceId: string, limit?: number): Promise<AnomalyDetection[]>;
  count(deviceId?: string): Promise<number>;
  deleteByDevice(deviceId: string): Promise<number>;
}
