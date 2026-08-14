import type { DeviceAgent } from '../domain/entities/index.js';
import type { DeviceRepository } from '../domain/repositories/index.js';

export class InMemoryDeviceRepository implements DeviceRepository {
  private readonly devices = new Map<string, DeviceAgent>();

  async save(device: DeviceAgent): Promise<void> {
    this.devices.set(device.deviceId, device);
  }

  async findById(deviceId: string): Promise<DeviceAgent | null> {
    return this.devices.get(deviceId) ?? null;
  }

  async findByFleet(fleetId: string): Promise<DeviceAgent[]> {
    return [...this.devices.values()].filter(
      (d) => d.fleetId === fleetId,
    );
  }

  async findByZone(zoneId: string): Promise<DeviceAgent[]> {
    return [...this.devices.values()].filter(
      (d) => d.zoneId === zoneId,
    );
  }

  async findAll(): Promise<DeviceAgent[]> {
    return [...this.devices.values()];
  }

  async delete(deviceId: string): Promise<boolean> {
    return this.devices.delete(deviceId);
  }

  async count(): Promise<number> {
    return this.devices.size;
  }
}
