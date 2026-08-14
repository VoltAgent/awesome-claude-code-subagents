import type { IoTCoordinator } from '../application/iot-coordinator.js';

export interface TelemetryIngestConfig {
  intervalMs: number;
  onIngestionComplete?: (deviceId: string, vectorCount: number) => void;
  onIngestionError?: (deviceId: string, error: Error) => void;
}

export class TelemetryIngestWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly coordinator: IoTCoordinator;
  private readonly config: TelemetryIngestConfig;

  constructor(coordinator: IoTCoordinator, config: Partial<TelemetryIngestConfig> = {}) {
    this.coordinator = coordinator;
    this.config = {
      intervalMs: config.intervalMs ?? 60_000,
      onIngestionComplete: config.onIngestionComplete,
      onIngestionError: config.onIngestionError,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.ingest(), this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async ingest(): Promise<void> {
    const devices = this.coordinator.listDevices();
    for (const device of devices) {
      try {
        const storeStatus = await this.coordinator.getDeviceStoreStatus(device.deviceId);
        this.config.onIngestionComplete?.(device.deviceId, storeStatus.totalVectors);
      } catch (err) {
        this.config.onIngestionError?.(device.deviceId, err as Error);
      }
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
