import type { IoTCoordinator } from '../application/iot-coordinator.js';

export interface AnomalyScanConfig {
  intervalMs: number;
  onAnomalyDetected?: (deviceId: string, score: number) => void;
  onScanError?: (deviceId: string, error: Error) => void;
}

export class AnomalyScanWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly coordinator: IoTCoordinator;
  private readonly config: AnomalyScanConfig;

  constructor(coordinator: IoTCoordinator, config: Partial<AnomalyScanConfig> = {}) {
    this.coordinator = coordinator;
    this.config = {
      intervalMs: config.intervalMs ?? 300_000,
      onAnomalyDetected: config.onAnomalyDetected,
      onScanError: config.onScanError,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.scan(), this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async scan(): Promise<void> {
    const devices = this.coordinator.listDevices();
    for (const device of devices) {
      try {
        const refreshed = await this.coordinator.getDeviceStatus(device.deviceId);
        if (refreshed.trustScore.overall < 0.5) {
          this.config.onAnomalyDetected?.(device.deviceId, refreshed.trustScore.overall);
        }
      } catch (err) {
        this.config.onScanError?.(device.deviceId, err as Error);
      }
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
