import type { TelemetryReading, AnomalyDetection } from '../entities/index.js';
import type { AnomalyDetectionService, TelemetryBaseline } from './anomaly-detection-service.js';

export interface TelemetryIngestionDeps {
  queryDeviceStore: (
    deviceId: string,
    vector: number[],
    k: number,
  ) => Promise<Array<{ id: number | string; distance: number; metadata?: Record<string, unknown> }>>;
  getStoreStatus: (deviceId: string) => Promise<{ total_vectors: number; dimension: number }>;
}

export interface IngestionResult {
  deviceId: string;
  readingsProcessed: number;
  anomaliesDetected: number;
  anomalies: AnomalyDetection[];
  baseline?: TelemetryBaseline;
}

export class TelemetryIngestionService {
  constructor(
    private readonly deps: TelemetryIngestionDeps,
    private readonly anomalyDetector: AnomalyDetectionService,
  ) {}

  /**
   * Process a batch of telemetry readings: run anomaly detection on each,
   * and return the results.
   */
  processBatch(deviceId: string, readings: TelemetryReading[]): IngestionResult {
    const anomalies: AnomalyDetection[] = [];

    for (const reading of readings) {
      const detection = this.anomalyDetector.detect(reading);
      if (this.anomalyDetector.isAnomalous(detection)) {
        anomalies.push(detection);
      }
    }

    return {
      deviceId,
      readingsProcessed: readings.length,
      anomaliesDetected: anomalies.length,
      anomalies,
      baseline: this.anomalyDetector.getBaseline(deviceId),
    };
  }

  /**
   * Compute or refresh the baseline for a device from its recent readings.
   */
  refreshBaseline(deviceId: string, readings: TelemetryReading[]): TelemetryBaseline {
    return this.anomalyDetector.computeBaseline(deviceId, readings);
  }

  /** Get the current baseline for a device. */
  getBaseline(deviceId: string): TelemetryBaseline | undefined {
    return this.anomalyDetector.getBaseline(deviceId);
  }
}
