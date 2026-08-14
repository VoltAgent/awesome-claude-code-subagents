import type { DeviceAgent } from '../entities/index.js';

export interface DeviceRepository {
  save(device: DeviceAgent): Promise<void>;
  findById(deviceId: string): Promise<DeviceAgent | null>;
  findByFleet(fleetId: string): Promise<DeviceAgent[]>;
  findByZone(zoneId: string): Promise<DeviceAgent[]>;
  findAll(): Promise<DeviceAgent[]>;
  delete(deviceId: string): Promise<boolean>;
  count(): Promise<number>;
}
