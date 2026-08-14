import type { DeviceFleet } from '../entities/index.js';

export interface FleetRepository {
  save(fleet: DeviceFleet): Promise<void>;
  findById(fleetId: string): Promise<DeviceFleet | undefined>;
  findAll(): Promise<DeviceFleet[]>;
  delete(fleetId: string): Promise<boolean>;
  count(): Promise<number>;
}
