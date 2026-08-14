import type { IoTCoordinator } from '../application/iot-coordinator.js';

export interface WitnessAuditConfig {
  intervalMs: number;
  onGapDetected?: (deviceId: string, fromEpoch: number, toEpoch: number) => void;
  onAuditComplete?: (deviceId: string, chainLength: number) => void;
  onAuditError?: (deviceId: string, error: Error) => void;
}

export class WitnessAuditWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly coordinator: IoTCoordinator;
  private readonly config: WitnessAuditConfig;

  constructor(coordinator: IoTCoordinator, config: Partial<WitnessAuditConfig> = {}) {
    this.coordinator = coordinator;
    this.config = {
      intervalMs: config.intervalMs ?? 600_000,
      onGapDetected: config.onGapDetected,
      onAuditComplete: config.onAuditComplete,
      onAuditError: config.onAuditError,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.audit(), this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async audit(): Promise<void> {
    const devices = this.coordinator.listDevices();
    for (const device of devices) {
      try {
        const chain = await this.coordinator.getDeviceWitnessChain(device.deviceId);
        const entries = chain.entries ?? [];
        const sorted = [...entries].sort((a: any, b: any) => a.epoch - b.epoch);

        for (let i = 1; i < sorted.length; i++) {
          const expected = (sorted[i - 1] as any).epoch + 1;
          const actual = (sorted[i] as any).epoch;
          if (actual > expected) {
            this.config.onGapDetected?.(device.deviceId, (sorted[i - 1] as any).epoch, actual);
          }
        }

        const chainLength = chain.length ?? entries.length ?? 0;
        this.config.onAuditComplete?.(device.deviceId, chainLength);
      } catch (err) {
        this.config.onAuditError?.(device.deviceId, err as Error);
      }
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
