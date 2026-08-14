import type { DeviceFleet } from '../domain/entities/index.js';
import type { FleetRepository } from '../domain/repositories/index.js';

export class InMemoryFleetRepository implements FleetRepository {
  private readonly fleets = new Map<string, DeviceFleet>();

  async save(fleet: DeviceFleet): Promise<void> {
    this.fleets.set(fleet.fleetId, { ...fleet, updatedAt: new Date() });
  }

  async findById(fleetId: string): Promise<DeviceFleet | undefined> {
    return this.fleets.get(fleetId);
  }

  async findAll(): Promise<DeviceFleet[]> {
    return Array.from(this.fleets.values());
  }

  async delete(fleetId: string): Promise<boolean> {
    return this.fleets.delete(fleetId);
  }

  async count(): Promise<number> {
    return this.fleets.size;
  }
}
