import type { IoTCoordinator } from '../application/iot-coordinator.js';

export interface MeshSyncConfig {
  intervalMs: number;
  onMeshPartition?: (deviceId: string, peerCount: number) => void;
  onSyncComplete?: (deviceId: string, peerCount: number) => void;
  onSyncError?: (deviceId: string, error: Error) => void;
}

export class MeshSyncWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly coordinator: IoTCoordinator;
  private readonly config: MeshSyncConfig;
  private readonly lastPeerCounts = new Map<string, number>();

  constructor(coordinator: IoTCoordinator, config: Partial<MeshSyncConfig> = {}) {
    this.coordinator = coordinator;
    this.config = {
      intervalMs: config.intervalMs ?? 120_000,
      onMeshPartition: config.onMeshPartition,
      onSyncComplete: config.onSyncComplete,
      onSyncError: config.onSyncError,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sync(), this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sync(): Promise<void> {
    const devices = this.coordinator.listDevices();
    for (const device of devices) {
      try {
        const topology = await this.coordinator.getDeviceMeshTopology(device.deviceId);
        const prevCount = this.lastPeerCounts.get(device.deviceId) ?? topology.peerCount;

        if (topology.peerCount === 0 && prevCount > 0) {
          this.config.onMeshPartition?.(device.deviceId, topology.peerCount);
        }

        this.lastPeerCounts.set(device.deviceId, topology.peerCount);
        this.config.onSyncComplete?.(device.deviceId, topology.peerCount);
      } catch (err) {
        this.config.onSyncError?.(device.deviceId, err as Error);
      }
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
