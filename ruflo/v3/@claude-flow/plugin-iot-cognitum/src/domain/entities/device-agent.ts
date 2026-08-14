import type { DeviceTrustLevel } from './device-trust-level.js';

export type DeviceStatus =
  | 'online'
  | 'offline'
  | 'updating'
  | 'quarantined'
  | 'decommissioned';

export type DeviceCapability =
  | 'vector-store'
  | 'ota-update'
  | 'mesh-routing'
  | 'witness-chain'
  | 'sensor-telemetry'
  | 'edge-compute'
  | 'mcp-server';

export interface DeviceTrustScore {
  /** Composite trust score, 0.0 - 1.0. */
  overall: number;
  components: {
    /** Auth / pairing success rate. */
    pairingIntegrity: number;
    /** 1.0 if running latest firmware; decays with version lag. */
    firmwareCurrency: number;
    /** Uptime ratio over a rolling window. */
    uptimeStability: number;
    /** Witness chain length / expected length. */
    witnessIntegrity: number;
    /** 1.0 minus anomaly rate. */
    anomalyHistory: number;
    /** Active peer count / expected peers. */
    meshParticipation: number;
  };
}

export interface VectorStoreStats {
  totalVectors: number;
  deletedVectors: number;
  dimension: number;
  fileSizeBytes: number;
}

/**
 * Core entity: a Cognitum Seed device modelled as a Ruflo agent.
 */
export interface DeviceAgent {
  /** Unique device identifier from SeedIdentity.device_id. */
  deviceId: string;
  /** Ed25519 public key (hex-encoded). */
  publicKey: string;
  firmwareVersion: string;
  trustLevel: DeviceTrustLevel;
  trustScore: DeviceTrustScore;
  fleetId: string;
  /** IEC 62443 security zone identifier. */
  zoneId: string;
  status: DeviceStatus;
  lastSeen: Date;
  /** Firmware epoch counter. */
  epoch: number;
  capabilities: DeviceCapability[];
  /** Device IDs of active mesh peers. */
  meshPeers: string[];
  vectorStoreStats: VectorStoreStats;
  /** HTTP endpoint, e.g. "http://169.254.42.1". */
  endpoint: string;
  metadata: Record<string, unknown>;
}
