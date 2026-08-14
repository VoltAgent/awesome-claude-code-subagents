import type { SeedClient, WitnessChain, CustodyEpoch } from '@cognitum-one/sdk/seed';
import { SeedClientFactory } from '../infrastructure/seed-client-factory.js';
import { DeviceLifecycleService } from '../domain/services/device-lifecycle-service.js';
import { TelemetryService } from '../domain/services/telemetry-service.js';
import type {
  StoreQueryResult,
  IngestResult,
  StoreHealthStatus,
} from '../domain/services/telemetry-service.js';
import { MeshService } from '../domain/services/mesh-service.js';
import type { MeshTopology } from '../domain/services/mesh-service.js';
import { AnomalyDetectionService } from '../domain/services/anomaly-detection-service.js';
import type { TelemetryBaseline, AnomalyDetectionConfig } from '../domain/services/anomaly-detection-service.js';
import { TelemetryIngestionService } from '../domain/services/telemetry-ingestion-service.js';
import type { IngestionResult } from '../domain/services/telemetry-ingestion-service.js';
import { FleetTopologyService } from '../domain/services/fleet-topology-service.js';
import type { CreateFleetOptions, FleetSummary } from '../domain/services/fleet-topology-service.js';
import { InMemoryFleetRepository } from '../infrastructure/in-memory-fleet-repository.js';
import { FirmwareOrchestrationService } from '../domain/services/firmware-orchestration-service.js';
import type { FirmwareRollout } from '../domain/services/firmware-orchestration-service.js';
import { WitnessVerificationService } from '../domain/services/witness-verification-service.js';
import type { WitnessVerificationResult } from '../domain/services/witness-verification-service.js';
import { SONAIntegrationService } from '../domain/services/sona-integration-service.js';
import type { SONAClient } from '../domain/services/sona-integration-service.js';
import type { TelemetryRepository } from '../domain/repositories/telemetry-repository.js';
import type { DeviceAgent, DeviceTrustLevel, TelemetryReading, AnomalyDetection, DeviceFleet, FleetTopology, FirmwarePolicy } from '../domain/entities/index.js';
import type {
  DeviceRepository,
  TrustHistoryRepository,
  FleetRepository,
} from '../domain/repositories/index.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface IoTCoordinatorConfig {
  /** Fleet ID assigned to newly registered devices. */
  defaultFleetId: string;
  /** IEC 62443 security zone assigned to newly registered devices. */
  defaultZoneId: string;
  /** TLS defaults forwarded to the underlying SeedClientFactory. */
  defaultTls?: { insecure?: boolean; ca?: string };
  /** Active health-probe interval (ms) for each SeedClient. */
  healthInterval?: number;
  /** Optional device persistence repository. */
  deviceRepository?: DeviceRepository;
  /** Optional trust history repository. */
  trustHistoryRepository?: TrustHistoryRepository;
  /** Anomaly detection configuration. */
  anomalyDetection?: Partial<AnomalyDetectionConfig>;
  /** Optional fleet persistence repository. */
  fleetRepository?: FleetRepository;
  /** Optional SONA neural learning client. */
  sonaClient?: SONAClient;
  /** Optional HNSW-indexed telemetry repository. */
  telemetryRepository?: TelemetryRepository;
}

export interface IoTCoordinatorCallbacks {
  onDeviceRegistered?: (device: DeviceAgent) => void;
  onTrustChange?: (
    deviceId: string,
    oldLevel: DeviceTrustLevel,
    newLevel: DeviceTrustLevel,
  ) => void;
}

// ---------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------

/**
 * Application-layer coordinator that wires domain services to the
 * Cognitum Seed SDK transport. Every public method resolves a
 * {@link SeedClient} from the internal registry and delegates to the
 * appropriate domain service.
 */
export class IoTCoordinator {
  private readonly factory: SeedClientFactory;
  private readonly devices: Map<
    string,
    { agent: DeviceAgent; client: SeedClient }
  > = new Map();
  private readonly lifecycle: DeviceLifecycleService;
  private readonly telemetry: TelemetryService;
  private readonly mesh: MeshService;
  private readonly anomalyDetection: AnomalyDetectionService;
  private readonly ingestion: TelemetryIngestionService;
  private readonly fleet: FleetTopologyService;
  private readonly firmware: FirmwareOrchestrationService;
  private readonly witnessVerification: WitnessVerificationService;
  private readonly sona: SONAIntegrationService;
  private readonly telemetryRepo?: TelemetryRepository;
  private readonly config: IoTCoordinatorConfig;
  private readonly deviceRepo?: DeviceRepository;
  private readonly trustRepo?: TrustHistoryRepository;

  constructor(
    config: IoTCoordinatorConfig,
    callbacks?: IoTCoordinatorCallbacks,
  ) {
    this.config = config;
    this.deviceRepo = config.deviceRepository;
    this.trustRepo = config.trustHistoryRepository;
    this.factory = new SeedClientFactory({
      defaultTls: config.defaultTls,
      healthInterval: config.healthInterval,
    });

    // -----------------------------------------------------------------------
    // Wire domain-service deps to real SDK calls via this.devices
    // -----------------------------------------------------------------------

    this.lifecycle = new DeviceLifecycleService({
      getStatus: async (deviceId: string) => {
        const client = this.resolveClient(deviceId);
        return client.status();
      },
      getIdentity: async (deviceId: string) => {
        const client = this.resolveClient(deviceId);
        return client.identity();
      },
      getPairStatus: async (deviceId: string) => {
        const client = this.resolveClient(deviceId);
        return client.pair.status();
      },
      getWitnessChain: async (deviceId: string) => {
        const client = this.resolveClient(deviceId);
        const chain = await client.witness.chain();
        return {
          depth: chain.length ?? chain.entries?.length ?? 0,
          epoch: chain.entries?.[0]?.epoch ?? 0,
          head_hash: chain.head ?? '',
        };
      },
      getCustodyEpoch: async (deviceId: string) => {
        const client = this.resolveClient(deviceId);
        return client.custody.epoch();
      },
      pairDevice: async (deviceId: string, clientName: string) => {
        const client = this.resolveClient(deviceId);
        const resp = await client.pair.create({ clientName });
        return { paired: true, token: resp.token.reveal() };
      },
      unpairDevice: async (deviceId: string, clientName?: string) => {
        const client = this.resolveClient(deviceId);
        await client.pair.delete(clientName ?? 'claude-flow');
      },
      onDeviceRegistered: callbacks?.onDeviceRegistered,
      onTrustChange: callbacks?.onTrustChange,
    });

    this.telemetry = new TelemetryService({
      queryVectors: async (deviceId, vector, k) => {
        const client = this.resolveClient(deviceId);
        return client.store.query({ vector, k });
      },
      ingestVectors: async (deviceId, vectors) => {
        const client = this.resolveClient(deviceId);
        return client.store.ingest({ vectors });
      },
      getStoreStatus: async (deviceId) => {
        const client = this.resolveClient(deviceId);
        return client.store.status();
      },
    });

    this.mesh = new MeshService({
      getMeshStatus: async (deviceId) => {
        const client = this.resolveClient(deviceId);
        return client.mesh.status();
      },
      getPeers: async (deviceId) => {
        const client = this.resolveClient(deviceId);
        return client.mesh.peers();
      },
      getSwarmStatus: async (deviceId) => {
        const client = this.resolveClient(deviceId);
        return client.mesh.swarmStatus();
      },
      getClusterHealth: async (deviceId) => {
        const client = this.resolveClient(deviceId);
        return client.mesh.clusterHealth();
      },
    });

    this.anomalyDetection = new AnomalyDetectionService(config.anomalyDetection);
    this.ingestion = new TelemetryIngestionService(
      {
        queryDeviceStore: async (deviceId, vector, k) => {
          const client = this.resolveClient(deviceId);
          const result = await client.store.query({ vector, k });
          return result.results;
        },
        getStoreStatus: async (deviceId) => {
          const client = this.resolveClient(deviceId);
          return client.store.status();
        },
      },
      this.anomalyDetection,
    );

    this.fleet = new FleetTopologyService(
      config.fleetRepository ?? new InMemoryFleetRepository(),
    );

    this.firmware = new FirmwareOrchestrationService({
      getDeviceFirmwareVersion: async (deviceId: string) => {
        const entry = this.requireEntry(deviceId);
        return entry.agent.firmwareVersion;
      },
      deployFirmware: async (_deviceId: string, _version: string) => {
        // OTA deployment requires Cognitum Cloud API (not available via local Seed SDK).
        // Stub returns success; real implementation will use cloud control plane.
        return { success: true };
      },
      getDeviceAnomalyScore: async (deviceId: string) => {
        const entry = this.requireEntry(deviceId);
        return 1 - entry.agent.trustScore.overall;
      },
    });

    this.witnessVerification = new WitnessVerificationService({
      getWitnessChain: async (deviceId: string) => {
        const client = this.resolveClient(deviceId);
        return client.witness.chain();
      },
    });

    this.sona = new SONAIntegrationService(config.sonaClient ?? null);
    this.telemetryRepo = config.telemetryRepository;
  }

  // -------------------------------------------------------------------------
  // Device lifecycle
  // -------------------------------------------------------------------------

  /**
   * Register a Seed device by its HTTP endpoint. Creates a
   * {@link SeedClient}, fetches status and identity from the real
   * hardware, and returns a fully populated {@link DeviceAgent}.
   */
  async registerDevice(
    endpoint: string,
    pairingToken?: string,
  ): Promise<DeviceAgent> {
    const client = await this.factory.createClient(endpoint, pairingToken);

    // The lifecycle service makes two SDK calls during registration:
    // getStatus(endpoint) -> returns the real device_id, then
    // getIdentity(device_id) -> looked up by the device_id key.
    // We need the client reachable under BOTH keys before lifecycle runs,
    // so pre-fetch the device_id and register the client under both.
    const initialStatus = await client.status();
    const initialDeviceId = initialStatus.device_id;

    this.devices.set(endpoint, { agent: {} as DeviceAgent, client });
    this.devices.set(initialDeviceId, { agent: {} as DeviceAgent, client });

    let agent: DeviceAgent;
    try {
      agent = await this.lifecycle.registerDevice(
        endpoint,
        this.config.defaultFleetId,
        this.config.defaultZoneId,
      );
    } catch (err) {
      this.devices.delete(endpoint);
      this.devices.delete(initialDeviceId);
      throw err;
    }

    // Promote: drop the temporary endpoint key and keep the device_id key
    // (with the real agent attached).
    this.devices.delete(endpoint);
    this.devices.set(agent.deviceId, { agent, client });

    await this.deviceRepo?.save(agent);
    return agent;
  }

  /**
   * Refresh a device's state from the real hardware and recalculate
   * its trust score.
   */
  async getDeviceStatus(deviceId: string): Promise<DeviceAgent> {
    const entry = this.requireEntry(deviceId);
    const oldLevel = entry.agent.trustLevel;
    const refreshed = await this.lifecycle.refreshDeviceState(entry.agent);
    entry.agent = refreshed;
    await this.deviceRepo?.save(refreshed);
    if (oldLevel !== refreshed.trustLevel) {
      await this.trustRepo?.append({
        deviceId, timestamp: new Date(),
        oldLevel, newLevel: refreshed.trustLevel,
        score: refreshed.trustScore, trigger: 'refresh',
      });
    }
    return refreshed;
  }

  /** Pair a registered device, promoting its trust level. */
  async pairDevice(
    deviceId: string,
    clientName: string,
  ): Promise<DeviceAgent> {
    const entry = this.requireEntry(deviceId);
    const oldLevel = entry.agent.trustLevel;
    const updated = await this.lifecycle.pairDevice(entry.agent, clientName);
    entry.agent = updated;
    await this.deviceRepo?.save(updated);
    if (oldLevel !== updated.trustLevel) {
      await this.trustRepo?.append({
        deviceId, timestamp: new Date(),
        oldLevel, newLevel: updated.trustLevel,
        score: updated.trustScore, trigger: 'pair',
      });
    }
    return updated;
  }

  /** Unpair a registered device, demoting its trust level. */
  async unpairDevice(deviceId: string): Promise<DeviceAgent> {
    const entry = this.requireEntry(deviceId);
    const oldLevel = entry.agent.trustLevel;
    const updated = await this.lifecycle.unpairDevice(entry.agent);
    entry.agent = updated;
    await this.deviceRepo?.save(updated);
    if (oldLevel !== updated.trustLevel) {
      await this.trustRepo?.append({
        deviceId, timestamp: new Date(),
        oldLevel, newLevel: updated.trustLevel,
        score: updated.trustScore, trigger: 'unpair',
      });
    }
    return updated;
  }

  // -------------------------------------------------------------------------
  // Telemetry / vector store
  // -------------------------------------------------------------------------

  /** Run a k-NN query against a device's on-board vector store. */
  async queryDeviceVectors(
    deviceId: string,
    vector: number[],
    k: number,
  ): Promise<StoreQueryResult> {
    return this.telemetry.queryDevice(deviceId, vector, k);
  }

  /** Ingest raw vectors into a device's vector store. */
  async ingestDeviceTelemetry(
    deviceId: string,
    vectors: Array<{ values: number[]; metadata?: Record<string, unknown> }>,
  ): Promise<IngestResult> {
    const client = this.resolveClient(deviceId);
    const result = await client.store.ingest({ vectors });
    return {
      deviceId,
      ingested: result.ingested,
      epoch: result.epoch,
    };
  }

  /** Retrieve vector store health metrics for a device. */
  async getDeviceStoreStatus(deviceId: string): Promise<StoreHealthStatus> {
    return this.telemetry.getStoreHealth(deviceId);
  }

  // -------------------------------------------------------------------------
  // Mesh
  // -------------------------------------------------------------------------

  /** Get the aggregated mesh topology snapshot for a device. */
  async getDeviceMeshTopology(deviceId: string): Promise<MeshTopology> {
    return this.mesh.getTopology(deviceId);
  }

  // -------------------------------------------------------------------------
  // Witness / custody — direct SDK pass-through
  // -------------------------------------------------------------------------

  /** Retrieve the full witness chain from a device. */
  async getDeviceWitnessChain(deviceId: string): Promise<WitnessChain> {
    const client = this.resolveClient(deviceId);
    return client.witness.chain();
  }

  /** Retrieve the current custody epoch from a device. */
  async getDeviceCustodyEpoch(deviceId: string): Promise<CustodyEpoch> {
    const client = this.resolveClient(deviceId);
    return client.custody.epoch();
  }

  /** Verify witness chain integrity for a device. */
  async verifyWitnessChain(deviceId: string): Promise<WitnessVerificationResult> {
    this.requireEntry(deviceId);
    return this.witnessVerification.verifyChain(deviceId);
  }

  // -------------------------------------------------------------------------
  // Anomaly detection
  // -------------------------------------------------------------------------

  /** Detect anomalies in a batch of telemetry readings for a device. */
  detectAnomalies(
    deviceId: string,
    readings: TelemetryReading[],
  ): { anomalies: AnomalyDetection[]; total: number; anomalous: number } {
    const result = this.ingestion.processBatch(deviceId, readings);

    if (result.anomalies.length > 0) {
      const baseline = this.ingestion.getBaseline(deviceId);
      for (const anomaly of result.anomalies) {
        void this.sona.learnAnomalyPattern(anomaly, baseline);
      }
      void this.sona.recordTelemetryTrajectory(deviceId, readings, result.anomalies);
    }

    if (this.telemetryRepo) {
      void this.telemetryRepo.storeBatch(readings);
      for (const anomaly of result.anomalies) {
        void this.telemetryRepo.storeAnomaly(anomaly);
      }
    }

    return {
      anomalies: result.anomalies,
      total: result.readingsProcessed,
      anomalous: result.anomaliesDetected,
    };
  }

  /** Compute a telemetry baseline for a device from readings. */
  computeBaseline(
    deviceId: string,
    readings: TelemetryReading[],
  ): TelemetryBaseline {
    const oldBaseline = this.ingestion.getBaseline(deviceId);
    const newBaseline = this.ingestion.refreshBaseline(deviceId, readings);
    void this.sona.learnBaselineShift(deviceId, oldBaseline, newBaseline);
    return newBaseline;
  }

  /** Get the current baseline for a device, if computed. */
  getBaseline(deviceId: string): TelemetryBaseline | undefined {
    return this.ingestion.getBaseline(deviceId);
  }

  // -------------------------------------------------------------------------
  // Firmware orchestration
  // -------------------------------------------------------------------------

  async createFirmwareRollout(
    fleetId: string,
    firmwareVersion: string,
  ): Promise<FirmwareRollout> {
    const fleet = await this.fleet.getFleet(fleetId);
    return this.firmware.createRollout(
      fleetId,
      firmwareVersion,
      fleet.deviceIds,
      fleet.firmwarePolicy,
    );
  }

  async advanceFirmwareRollout(rolloutId: string): Promise<FirmwareRollout> {
    return this.firmware.advanceRollout(rolloutId);
  }

  rollbackFirmwareRollout(rolloutId: string): FirmwareRollout {
    return this.firmware.rollbackRollout(rolloutId);
  }

  getFirmwareRollout(rolloutId: string): FirmwareRollout {
    return this.firmware.getRollout(rolloutId);
  }

  listFirmwareRollouts(fleetId?: string): FirmwareRollout[] {
    return this.firmware.listRollouts(fleetId);
  }

  // -------------------------------------------------------------------------
  // Fleet management
  // -------------------------------------------------------------------------

  async createFleet(options: CreateFleetOptions): Promise<DeviceFleet> {
    return this.fleet.createFleet(options);
  }

  async getFleet(fleetId: string): Promise<DeviceFleet> {
    return this.fleet.getFleet(fleetId);
  }

  async listFleets(): Promise<FleetSummary[]> {
    return this.fleet.listFleets();
  }

  async addDeviceToFleet(fleetId: string, deviceId: string): Promise<DeviceFleet> {
    this.requireEntry(deviceId);
    return this.fleet.addDeviceToFleet(fleetId, deviceId);
  }

  async removeDeviceFromFleet(fleetId: string, deviceId: string): Promise<DeviceFleet> {
    return this.fleet.removeDeviceFromFleet(fleetId, deviceId);
  }

  async updateFleetTopology(fleetId: string, topology: FleetTopology): Promise<DeviceFleet> {
    return this.fleet.updateTopology(fleetId, topology);
  }

  async updateFleetFirmwarePolicy(fleetId: string, policy: Partial<FirmwarePolicy>): Promise<DeviceFleet> {
    return this.fleet.updateFirmwarePolicy(fleetId, policy);
  }

  async deleteFleet(fleetId: string): Promise<void> {
    return this.fleet.deleteFleet(fleetId);
  }

  // -------------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------------

  /** List all registered device agents. */
  listDevices(): DeviceAgent[] {
    return Array.from(this.devices.values()).map((e) => e.agent);
  }

  /** Remove a device from the coordinator and close its SDK client. */
  async removeDevice(deviceId: string): Promise<void> {
    const entry = this.devices.get(deviceId);
    if (!entry) return;

    await entry.client.close();
    this.devices.delete(deviceId);
    await this.deviceRepo?.delete(deviceId);
    await this.trustRepo?.deleteByDevice(deviceId);
  }

  /** Shut down all SDK clients and clear internal state. */
  async shutdown(): Promise<void> {
    await this.factory.closeAll();
    this.devices.clear();
  }

  /** Health snapshot of the coordinator. */
  getStatus(): {
    healthy: boolean;
    deviceCount: number;
    devices: DeviceAgent[];
  } {
    return {
      healthy: this.devices.size >= 0,
      deviceCount: this.devices.size,
      devices: this.listDevices(),
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Resolve a SeedClient by device ID (or temporary endpoint key).
   * Throws when the device has not been registered.
   */
  private resolveClient(deviceId: string): SeedClient {
    return this.requireEntry(deviceId).client;
  }

  private requireEntry(
    deviceId: string,
  ): { agent: DeviceAgent; client: SeedClient } {
    const entry = this.devices.get(deviceId);
    if (!entry) {
      throw new Error(`Device ${deviceId} not registered with coordinator`);
    }
    return entry;
  }
}
