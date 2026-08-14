export type FleetTopology = 'star' | 'mesh' | 'hierarchical' | 'ring';

export type DeploymentStrategy =
  | 'canary'
  | 'rolling'
  | 'blue-green'
  | 'all-at-once';

export interface FirmwarePolicy {
  channel: string;
  autoUpdate: boolean;
  approvalRequired: boolean;
  canaryPercentage: number;
  canaryDurationMinutes: number;
  rollbackOnAnomalyThreshold: number;
  maintenanceWindow?: { start: string; end: string };
}

export interface TelemetryPolicy {
  ingestionIntervalSeconds: number;
  retentionDays: number;
  anomalyDetectionEnabled: boolean;
  anomalyThreshold: number;
  vectorDimension: number;
}

export interface HealthThresholds {
  maxOfflineMinutes: number;
  minUptimeRatio: number;
  maxConsecutiveAnomalies: number;
  minFirmwareCurrency: number;
}

/**
 * Fleet grouping for Cognitum Seed devices.
 * A fleet shares firmware policy, telemetry policy, and health thresholds.
 */
export interface DeviceFleet {
  fleetId: string;
  name: string;
  description: string;
  /** IEC 62443 security zone for the fleet. */
  zoneId: string;
  deviceIds: string[];
  firmwarePolicy: FirmwarePolicy;
  telemetryPolicy: TelemetryPolicy;
  healthThresholds: HealthThresholds;
  topology: FleetTopology;
  createdAt: Date;
  updatedAt: Date;
}
