import type {
  DeviceFleet,
  FleetTopology,
  FirmwarePolicy,
  TelemetryPolicy,
  HealthThresholds,
} from '../entities/index.js';
import type { FleetRepository } from '../repositories/index.js';

export interface CreateFleetOptions {
  fleetId: string;
  name: string;
  description?: string;
  zoneId: string;
  topology?: FleetTopology;
  firmwarePolicy?: Partial<FirmwarePolicy>;
  telemetryPolicy?: Partial<TelemetryPolicy>;
  healthThresholds?: Partial<HealthThresholds>;
}

export interface FleetSummary {
  fleetId: string;
  name: string;
  zoneId: string;
  deviceCount: number;
  topology: FleetTopology;
  createdAt: Date;
}

const DEFAULT_FIRMWARE_POLICY: FirmwarePolicy = {
  channel: 'stable',
  autoUpdate: false,
  approvalRequired: true,
  canaryPercentage: 10,
  canaryDurationMinutes: 30,
  rollbackOnAnomalyThreshold: 0.8,
};

const DEFAULT_TELEMETRY_POLICY: TelemetryPolicy = {
  ingestionIntervalSeconds: 60,
  retentionDays: 30,
  anomalyDetectionEnabled: true,
  anomalyThreshold: 0.7,
  vectorDimension: 128,
};

const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  maxOfflineMinutes: 10,
  minUptimeRatio: 0.95,
  maxConsecutiveAnomalies: 3,
  minFirmwareCurrency: 0.8,
};

export class FleetTopologyService {
  constructor(private readonly repo: FleetRepository) {}

  async createFleet(options: CreateFleetOptions): Promise<DeviceFleet> {
    const existing = await this.repo.findById(options.fleetId);
    if (existing) throw new Error(`Fleet ${options.fleetId} already exists`);

    const fleet: DeviceFleet = {
      fleetId: options.fleetId,
      name: options.name,
      description: options.description ?? '',
      zoneId: options.zoneId,
      deviceIds: [],
      topology: options.topology ?? 'star',
      firmwarePolicy: { ...DEFAULT_FIRMWARE_POLICY, ...options.firmwarePolicy },
      telemetryPolicy: { ...DEFAULT_TELEMETRY_POLICY, ...options.telemetryPolicy },
      healthThresholds: { ...DEFAULT_HEALTH_THRESHOLDS, ...options.healthThresholds },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.repo.save(fleet);
    return fleet;
  }

  async getFleet(fleetId: string): Promise<DeviceFleet> {
    const fleet = await this.repo.findById(fleetId);
    if (!fleet) throw new Error(`Fleet ${fleetId} not found`);
    return fleet;
  }

  async listFleets(): Promise<FleetSummary[]> {
    const fleets = await this.repo.findAll();
    return fleets.map((f) => ({
      fleetId: f.fleetId,
      name: f.name,
      zoneId: f.zoneId,
      deviceCount: f.deviceIds.length,
      topology: f.topology,
      createdAt: f.createdAt,
    }));
  }

  async addDeviceToFleet(fleetId: string, deviceId: string): Promise<DeviceFleet> {
    const fleet = await this.getFleet(fleetId);
    if (fleet.deviceIds.includes(deviceId)) {
      return fleet;
    }
    fleet.deviceIds.push(deviceId);
    await this.repo.save(fleet);
    return fleet;
  }

  async removeDeviceFromFleet(fleetId: string, deviceId: string): Promise<DeviceFleet> {
    const fleet = await this.getFleet(fleetId);
    fleet.deviceIds = fleet.deviceIds.filter((id) => id !== deviceId);
    await this.repo.save(fleet);
    return fleet;
  }

  async updateTopology(fleetId: string, topology: FleetTopology): Promise<DeviceFleet> {
    const fleet = await this.getFleet(fleetId);
    fleet.topology = topology;
    await this.repo.save(fleet);
    return fleet;
  }

  async updateFirmwarePolicy(
    fleetId: string,
    policy: Partial<FirmwarePolicy>,
  ): Promise<DeviceFleet> {
    const fleet = await this.getFleet(fleetId);
    fleet.firmwarePolicy = { ...fleet.firmwarePolicy, ...policy };
    await this.repo.save(fleet);
    return fleet;
  }

  async deleteFleet(fleetId: string): Promise<void> {
    const deleted = await this.repo.delete(fleetId);
    if (!deleted) throw new Error(`Fleet ${fleetId} not found`);
  }

  async getFleetDeviceCount(fleetId: string): Promise<number> {
    const fleet = await this.getFleet(fleetId);
    return fleet.deviceIds.length;
  }
}
