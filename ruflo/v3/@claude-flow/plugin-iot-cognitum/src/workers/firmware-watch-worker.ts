import type { IoTCoordinator } from '../application/iot-coordinator.js';

export interface FirmwareWatchConfig {
  intervalMs: number;
  onVersionMismatch?: (deviceId: string, expected: string, actual: string) => void;
  onWatchError?: (deviceId: string, error: Error) => void;
}

export class FirmwareWatchWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly coordinator: IoTCoordinator;
  private readonly config: FirmwareWatchConfig;
  private readonly knownVersions = new Map<string, string>();

  constructor(coordinator: IoTCoordinator, config: Partial<FirmwareWatchConfig> = {}) {
    this.coordinator = coordinator;
    this.config = {
      intervalMs: config.intervalMs ?? 300_000,
      onVersionMismatch: config.onVersionMismatch,
      onWatchError: config.onWatchError,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.watch(), this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async watch(): Promise<void> {
    const devices = this.coordinator.listDevices();
    for (const device of devices) {
      try {
        const refreshed = await this.coordinator.getDeviceStatus(device.deviceId);
        const knownVersion = this.knownVersions.get(device.deviceId);

        if (knownVersion && knownVersion !== refreshed.firmwareVersion) {
          this.config.onVersionMismatch?.(device.deviceId, knownVersion, refreshed.firmwareVersion);
        }

        this.knownVersions.set(device.deviceId, refreshed.firmwareVersion);
      } catch (err) {
        this.config.onWatchError?.(device.deviceId, err as Error);
      }
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
