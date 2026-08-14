export type AnomalyType =
  | 'drift'
  | 'spike'
  | 'flatline'
  | 'oscillation'
  | 'pattern-break'
  | 'cluster-outlier';

export type AnomalyAction =
  | 'log'
  | 'alert'
  | 'quarantine'
  | 'recalibrate'
  | 'rollback-firmware'
  | 'human-review';

/**
 * A single telemetry reading from a Cognitum Seed device.
 */
export interface TelemetryReading {
  readingId: string;
  deviceId: string;
  fleetId: string;
  timestamp: Date;
  /** Embedding vector for similarity search. */
  vector: number[];
  /** Raw sensor metrics keyed by metric name. */
  rawMetrics: Record<string, number>;
  /** Anomaly score, 0.0 (normal) - 1.0 (anomalous). */
  anomalyScore: number;
  metadata: Record<string, unknown>;
}

/**
 * Result of anomaly detection on a telemetry reading.
 */
export interface AnomalyDetection {
  readingId: string;
  deviceId: string;
  /** Anomaly score, 0.0 - 1.0. */
  score: number;
  type: AnomalyType;
  /** Detection confidence, 0.0 - 1.0. */
  confidence: number;
  /** Identifier of the baseline pattern this was compared against. */
  baselinePattern?: string;
  suggestedAction: AnomalyAction;
  metadata: Record<string, unknown>;
}
