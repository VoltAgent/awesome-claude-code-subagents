import type { IoTCoordinator } from '../application/iot-coordinator.js';

export interface HealthProbeConfig {
  intervalMs: number;
  onDeviceOffline?: (deviceId: string) => void;
  onDeviceOnline?: (deviceId: string) => void;
  onProbeError?: (deviceId: string, error: Error) => void;
}

export class HealthProbeWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly coordinator: IoTCoordinator;
  private readonly config: HealthProbeConfig;
  private readonly lastKnownStatus: Map<string, 'online' | 'offline'> =
    new Map();

  constructor(coordinator: IoTCoordinator, config: Partial<HealthProbeConfig> = {}) {
    this.coordinator = coordinator;
    this.config = {
      intervalMs: config.intervalMs ?? 30_000,
      onDeviceOffline: config.onDeviceOffline,
      onDeviceOnline: config.onDeviceOnline,
      onProbeError: config.onProbeError,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.probe(), this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async probe(): Promise<void> {
    const devices = this.coordinator.listDevices();
    for (const device of devices) {
      const prevStatus = this.lastKnownStatus.get(device.deviceId);
      try {
        await this.coordinator.getDeviceStatus(device.deviceId);
        this.lastKnownStatus.set(device.deviceId, 'online');
        if (prevStatus === 'offline') {
          this.config.onDeviceOnline?.(device.deviceId);
        }
      } catch (err) {
        this.lastKnownStatus.set(device.deviceId, 'offline');
        if (prevStatus !== 'offline') {
          this.config.onDeviceOffline?.(device.deviceId);
        }
        this.config.onProbeError?.(device.deviceId, err as Error);
      }
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
