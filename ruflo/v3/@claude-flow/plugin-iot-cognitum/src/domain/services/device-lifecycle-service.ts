import type {
  DeviceAgent,
  DeviceTrustScore,
} from '../entities/index.js';
import { DeviceTrustLevel } from '../entities/index.js';

// ---------------------------------------------------------------------------
// Dependency contract — no direct SDK imports
// ---------------------------------------------------------------------------

export interface DeviceLifecycleDeps {
  getStatus: (deviceId: string) => Promise<{
    device_id: string;
    uptime_secs: number;
    epoch: number;
    total_vectors: number;
    dimension: number;
    paired: boolean;
    roles: string[];
    witness_chain_length?: number;
  }>;
  getIdentity: (deviceId: string) => Promise<{
    device_id: string;
    public_key?: string;
    firmware_version?: string;
    epoch?: number;
  }>;
  getPairStatus: (deviceId: string) => Promise<{
    paired: boolean;
    client_count?: number;
  }>;
  getWitnessChain: (deviceId: string) => Promise<{
    depth: number;
    epoch: number;
    head_hash: string;
  }>;
  getCustodyEpoch: (deviceId: string) => Promise<{
    epoch: number;
  }>;
  pairDevice: (deviceId: string, clientName: string) => Promise<{
    paired: boolean;
    token?: string;
  }>;
  unpairDevice: (deviceId: string, clientName?: string) => Promise<void>;
  onDeviceRegistered?: (device: DeviceAgent) => void;
  onTrustChange?: (
    deviceId: string,
    oldLevel: DeviceTrustLevel,
    newLevel: DeviceTrustLevel,
  ) => void;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DeviceLifecycleService {
  constructor(private readonly deps: DeviceLifecycleDeps) {}

  /**
   * Register a new device by fetching its status and identity, then
   * constructing a DeviceAgent entity with initial trust REGISTERED.
   */
  async registerDevice(
    endpoint: string,
    fleetId: string,
    zoneId: string,
  ): Promise<DeviceAgent> {
    const status = await this.deps.getStatus(endpoint);
    const identity = await this.deps.getIdentity(status.device_id);

    const initialScore = this.computeTrustScore(
      {} as DeviceAgent,
      status.witness_chain_length ?? 0,
      status.uptime_secs,
      status.paired,
    );

    const device: DeviceAgent = {
      deviceId: status.device_id,
      publicKey: identity.public_key ?? '',
      firmwareVersion: identity.firmware_version ?? 'unknown',
      trustLevel: DeviceTrustLevel.REGISTERED,
      trustScore: initialScore,
      fleetId,
      zoneId,
      status: 'online',
      lastSeen: new Date(),
      epoch: identity.epoch ?? status.epoch,
      capabilities: this.deriveCapabilities(status.roles),
      meshPeers: [],
      vectorStoreStats: {
        totalVectors: status.total_vectors,
        deletedVectors: 0,
        dimension: status.dimension,
        fileSizeBytes: 0,
      },
      endpoint,
      metadata: {},
    };

    this.deps.onDeviceRegistered?.(device);
    return device;
  }

  /**
   * Pair a device using the SDK's pair.create() and promote its trust level.
   */
  async pairDevice(
    device: DeviceAgent,
    clientName: string,
  ): Promise<DeviceAgent> {
    const result = await this.deps.pairDevice(device.deviceId, clientName);

    if (!result.paired) {
      throw new Error(`Pairing failed for device ${device.deviceId}`);
    }

    const oldLevel = device.trustLevel;
    const newLevel =
      device.trustLevel < DeviceTrustLevel.PROVISIONED
        ? DeviceTrustLevel.PROVISIONED
        : device.trustLevel;

    const updated: DeviceAgent = {
      ...device,
      trustLevel: newLevel,
      trustScore: {
        ...device.trustScore,
        overall: this.computeTrustScore(device, 0, 0, true).overall,
        components: {
          ...device.trustScore.components,
          pairingIntegrity: 1.0,
        },
      },
    };

    if (oldLevel !== newLevel) {
      this.deps.onTrustChange?.(device.deviceId, oldLevel, newLevel);
    }

    return updated;
  }

  /**
   * Unpair a device and demote its trust level.
   */
  async unpairDevice(device: DeviceAgent): Promise<DeviceAgent> {
    await this.deps.unpairDevice(device.deviceId);

    const oldLevel = device.trustLevel;
    const newLevel = DeviceTrustLevel.REGISTERED;

    const updated: DeviceAgent = {
      ...device,
      trustLevel: newLevel,
      trustScore: {
        ...device.trustScore,
        overall: this.computeTrustScore(device, 0, 0, false).overall,
        components: {
          ...device.trustScore.components,
          pairingIntegrity: 0.0,
        },
      },
    };

    if (oldLevel !== newLevel) {
      this.deps.onTrustChange?.(device.deviceId, oldLevel, newLevel);
    }

    return updated;
  }

  /**
   * Re-fetch all device state and recalculate trust.
   */
  async refreshDeviceState(device: DeviceAgent): Promise<DeviceAgent> {
    const [status, identity, pair, witness] = await Promise.all([
      this.deps.getStatus(device.deviceId),
      this.deps.getIdentity(device.deviceId),
      this.deps.getPairStatus(device.deviceId),
      this.deps.getWitnessChain(device.deviceId),
    ]);

    const updated: DeviceAgent = {
      ...device,
      publicKey: identity.public_key ?? device.publicKey,
      firmwareVersion: identity.firmware_version ?? device.firmwareVersion,
      epoch: identity.epoch ?? status.epoch,
      lastSeen: new Date(),
      status: 'online',
      vectorStoreStats: {
        ...device.vectorStoreStats,
        totalVectors: status.total_vectors,
        dimension: status.dimension,
      },
      capabilities: this.deriveCapabilities(status.roles),
    };

    const score = this.computeTrustScore(
      { ...updated, trustScore: device.trustScore } as DeviceAgent,
      witness.depth,
      status.uptime_secs,
      pair.paired,
    );
    const newLevel = this.evaluateTrustLevel(score);
    const oldLevel = device.trustLevel;

    updated.trustScore = score;
    updated.trustLevel = newLevel;

    if (oldLevel !== newLevel) {
      this.deps.onTrustChange?.(device.deviceId, oldLevel, newLevel);
    }

    return updated;
  }

  /**
   * Compute a composite trust score from device telemetry signals.
   */
  computeTrustScore(
    device: DeviceAgent,
    witnessDepth: number,
    uptimeSecs: number,
    paired?: boolean,
  ): DeviceTrustScore {
    const SEVEN_DAYS_SECS = 604_800;
    const EXPECTED_WITNESS_DEPTH = 10_000;

    const pairingIntegrity = paired !== undefined
      ? (paired ? 1.0 : 0.0)
      : (device.trustScore?.components?.pairingIntegrity ?? 0.0);
    const firmwareCurrency = 1.0; // Hardcoded — version comparison TBD
    const uptimeStability = Math.min(1.0, uptimeSecs / SEVEN_DAYS_SECS);
    const witnessIntegrity = Math.min(
      1.0,
      witnessDepth / EXPECTED_WITNESS_DEPTH,
    );
    const anomalyHistory = 1.0; // No anomaly detection yet
    const meshParticipation = 0.5; // Single device, no mesh peers

    const overall =
      0.3 * pairingIntegrity +
      0.15 * firmwareCurrency +
      0.2 * uptimeStability +
      0.15 * witnessIntegrity +
      0.1 * anomalyHistory +
      0.1 * meshParticipation;

    return {
      overall,
      components: {
        pairingIntegrity,
        firmwareCurrency,
        uptimeStability,
        witnessIntegrity,
        anomalyHistory,
        meshParticipation,
      },
    };
  }

  /**
   * Map a composite trust score to a discrete DeviceTrustLevel.
   */
  evaluateTrustLevel(score: DeviceTrustScore): DeviceTrustLevel {
    if (score.overall < 0.3) return DeviceTrustLevel.UNKNOWN;
    if (score.overall < 0.5) return DeviceTrustLevel.REGISTERED;
    if (score.overall < 0.7) return DeviceTrustLevel.PROVISIONED;
    if (score.overall < 0.85) return DeviceTrustLevel.CERTIFIED;
    return DeviceTrustLevel.FLEET_TRUSTED;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private deriveCapabilities(roles: string[]): DeviceAgent['capabilities'] {
    const CAP_MAP: Record<string, DeviceAgent['capabilities'][number]> = {
      'vector-store': 'vector-store',
      ota: 'ota-update',
      mesh: 'mesh-routing',
      witness: 'witness-chain',
      sensor: 'sensor-telemetry',
      compute: 'edge-compute',
      mcp: 'mcp-server',
    };
    return roles
      .map((r) => CAP_MAP[r])
      .filter((c): c is DeviceAgent['capabilities'][number] => c != null);
  }
}
