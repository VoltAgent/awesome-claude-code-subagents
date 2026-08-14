import type { AnomalyDetection, TelemetryReading } from '../entities/telemetry.js';
import type { TelemetryBaseline } from './anomaly-detection-service.js';

export interface SONAClient {
  storePattern(key: string, pattern: Record<string, unknown>): Promise<void>;
  searchPatterns(query: string, limit?: number): Promise<Array<{ key: string; pattern: Record<string, unknown>; score: number }>>;
  trainTrajectory(trajectoryId: string, steps: Array<{ action: string; reward: number; state: Record<string, unknown> }>): Promise<void>;
  predict(input: Record<string, unknown>): Promise<{ prediction: string; confidence: number }>;
}

export interface SONAIntegrationConfig {
  enabled: boolean;
  trajectoryNamespace: string;
  patternNamespace: string;
  minConfidence: number;
}

export class SONAIntegrationService {
  private readonly config: SONAIntegrationConfig;
  private readonly client: SONAClient | null;

  constructor(client: SONAClient | null, config?: Partial<SONAIntegrationConfig>) {
    this.client = client;
    this.config = {
      enabled: config?.enabled ?? (client !== null),
      trajectoryNamespace: config?.trajectoryNamespace ?? 'iot-trajectories',
      patternNamespace: config?.patternNamespace ?? 'iot-patterns',
      minConfidence: config?.minConfidence ?? 0.6,
    };
  }

  get isEnabled(): boolean {
    return this.config.enabled && this.client !== null;
  }

  async learnAnomalyPattern(anomaly: AnomalyDetection, baseline: TelemetryBaseline | undefined): Promise<void> {
    if (!this.isEnabled || !this.client) return;

    await this.client.storePattern(`anomaly:${anomaly.type}:${anomaly.deviceId}`, {
      type: anomaly.type,
      score: anomaly.score,
      action: anomaly.suggestedAction,
      deviceId: anomaly.deviceId,
      baselineSamples: baseline?.sampleCount ?? 0,
      timestamp: new Date().toISOString(),
    });
  }

  async learnBaselineShift(
    deviceId: string,
    oldBaseline: TelemetryBaseline | undefined,
    newBaseline: TelemetryBaseline,
  ): Promise<void> {
    if (!this.isEnabled || !this.client) return;

    const drift = oldBaseline
      ? newBaseline.meanVector.map((v, i) => Math.abs(v - oldBaseline.meanVector[i]))
      : newBaseline.meanVector.map(() => 0);

    await this.client.storePattern(`baseline-shift:${deviceId}`, {
      deviceId,
      driftVector: drift,
      maxDrift: Math.max(...drift),
      oldSamples: oldBaseline?.sampleCount ?? 0,
      newSamples: newBaseline.sampleCount,
      timestamp: new Date().toISOString(),
    });
  }

  async recordTelemetryTrajectory(
    deviceId: string,
    readings: TelemetryReading[],
    anomalies: AnomalyDetection[],
  ): Promise<void> {
    if (!this.isEnabled || !this.client) return;

    const steps = readings.map((r) => {
      const anomaly = anomalies.find((a) => a.readingId === r.readingId);
      return {
        action: anomaly ? `anomaly:${anomaly.type}` : 'normal',
        reward: anomaly ? -anomaly.score : 1.0,
        state: {
          vector: r.vector,
          anomalyScore: r.anomalyScore,
          deviceId: r.deviceId,
        },
      };
    });

    const trajectoryId = `${this.config.trajectoryNamespace}:${deviceId}:${Date.now()}`;
    await this.client.trainTrajectory(trajectoryId, steps);
  }

  async predictAnomalyRisk(reading: TelemetryReading): Promise<{ risk: string; confidence: number } | null> {
    if (!this.isEnabled || !this.client) return null;

    const result = await this.client.predict({
      vector: reading.vector,
      deviceId: reading.deviceId,
      anomalyScore: reading.anomalyScore,
    });

    if (result.confidence < this.config.minConfidence) return null;

    return { risk: result.prediction, confidence: result.confidence };
  }

  async findSimilarAnomalyPatterns(anomaly: AnomalyDetection, limit = 5): Promise<Array<{ key: string; pattern: Record<string, unknown>; score: number }>> {
    if (!this.isEnabled || !this.client) return [];

    return this.client.searchPatterns(`anomaly:${anomaly.type} score:${anomaly.score.toFixed(2)}`, limit);
  }
}
