import type {
  TelemetryReading,
  AnomalyDetection,
  AnomalyType,
  AnomalyAction,
} from '../entities/index.js';

export interface AnomalyDetectionConfig {
  /** Score threshold above which a reading is anomalous. Default 0.7. */
  anomalyThreshold: number;
  /** Score threshold for quarantine action. Default 0.9. */
  quarantineThreshold: number;
  /** Window size for baseline computation. */
  baselineWindowSize: number;
}

export interface TelemetryBaseline {
  deviceId: string;
  /** Mean vector across the baseline window. */
  meanVector: number[];
  /** Standard deviation per dimension. */
  stdVector: number[];
  /** Number of readings in the baseline. */
  sampleCount: number;
  /** When the baseline was last computed. */
  computedAt: Date;
}

export class AnomalyDetectionService {
  private readonly config: AnomalyDetectionConfig;
  private readonly baselines = new Map<string, TelemetryBaseline>();

  constructor(config?: Partial<AnomalyDetectionConfig>) {
    this.config = {
      anomalyThreshold: config?.anomalyThreshold ?? 0.7,
      quarantineThreshold: config?.quarantineThreshold ?? 0.9,
      baselineWindowSize: config?.baselineWindowSize ?? 100,
    };
  }

  /**
   * Compute a baseline from a window of readings for a device.
   * Calculates mean and standard deviation per vector dimension.
   */
  computeBaseline(deviceId: string, readings: TelemetryReading[]): TelemetryBaseline {
    if (readings.length === 0) throw new Error('Cannot compute baseline from empty readings');

    const dim = readings[0].vector.length;
    const n = readings.length;

    // Compute mean
    const mean = new Array<number>(dim).fill(0);
    for (const r of readings) {
      for (let i = 0; i < dim; i++) mean[i] += r.vector[i] / n;
    }

    // Compute standard deviation
    const std = new Array<number>(dim).fill(0);
    for (const r of readings) {
      for (let i = 0; i < dim; i++) {
        const diff = r.vector[i] - mean[i];
        std[i] += (diff * diff) / n;
      }
    }
    for (let i = 0; i < dim; i++) std[i] = Math.sqrt(std[i]);

    const baseline: TelemetryBaseline = {
      deviceId,
      meanVector: mean,
      stdVector: std,
      sampleCount: n,
      computedAt: new Date(),
    };

    this.baselines.set(deviceId, baseline);
    return baseline;
  }

  /** Get the current baseline for a device, if one has been computed. */
  getBaseline(deviceId: string): TelemetryBaseline | undefined {
    return this.baselines.get(deviceId);
  }

  /**
   * Detect anomalies in a reading by comparing against the device's baseline.
   * Uses z-score based detection: how many standard deviations each dimension
   * deviates from the baseline mean.
   */
  detect(reading: TelemetryReading): AnomalyDetection {
    const baseline = this.baselines.get(reading.deviceId);

    if (!baseline) {
      return {
        readingId: reading.readingId,
        deviceId: reading.deviceId,
        score: 0,
        type: 'drift',
        confidence: 0,
        suggestedAction: 'log',
        metadata: { reason: 'no-baseline' },
      };
    }

    // Z-score per dimension
    const zScores = reading.vector.map((v, i) => {
      const s = baseline.stdVector[i];
      return s > 0 ? Math.abs(v - baseline.meanVector[i]) / s : 0;
    });

    const maxZ = Math.max(...zScores);
    const meanZ = zScores.reduce((a, b) => a + b, 0) / zScores.length;

    // Composite anomaly score (0-1): 3 std devs maps to score 1.0
    const score = Math.min(1, meanZ / 3);

    const type = this.classifyAnomaly(reading, zScores, maxZ);
    const suggestedAction = this.suggestAction(score);
    const confidence = Math.min(1, baseline.sampleCount / this.config.baselineWindowSize);

    return {
      readingId: reading.readingId,
      deviceId: reading.deviceId,
      score,
      type,
      confidence,
      baselinePattern: `baseline-${reading.deviceId}`,
      suggestedAction,
      metadata: { maxZ, meanZ, baselineSamples: baseline.sampleCount },
    };
  }

  /** Classify an anomaly type based on the z-score pattern. */
  private classifyAnomaly(
    reading: TelemetryReading,
    zScores: number[],
    maxZ: number,
  ): AnomalyType {
    const highZCount = zScores.filter((z) => z > 2).length;
    const allLow = zScores.every((z) => z < 0.5);

    if (maxZ > 5) return 'spike';
    if (allLow && reading.rawMetrics && Object.values(reading.rawMetrics).every((v) => v === 0))
      return 'flatline';
    if (highZCount > zScores.length * 0.5) return 'cluster-outlier';
    if (highZCount > 0 && highZCount <= 2) return 'drift';
    return 'pattern-break';
  }

  private suggestAction(score: number): AnomalyAction {
    if (score >= this.config.quarantineThreshold) return 'quarantine';
    if (score >= this.config.anomalyThreshold) return 'alert';
    return 'log';
  }

  /** Check whether a detection result exceeds the anomaly threshold. */
  isAnomalous(detection: AnomalyDetection): boolean {
    return detection.score >= this.config.anomalyThreshold;
  }
}
