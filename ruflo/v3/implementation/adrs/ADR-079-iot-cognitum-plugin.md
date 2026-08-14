# ADR-079: IoT Cognitum Plugin

## Status: PROPOSED

## Date: 2026-04-29

## Authors: Claude Flow Team

## Context

Claude Flow v3.5 orchestrates AI agents across development, security, and infrastructure domains -- but lacks a first-class integration with physical device fleets. The Cognitum platform provides AI-powered hardware (the Seed appliance) with on-device vector stores, Ed25519 cryptographic identity, OTA firmware updates, mesh networking, and MCP protocol integration. The `@cognitum-one/sdk` (v0.2.1) exposes 12 typed seed endpoints, mesh routing with failover, mDNS discovery, and a cloud control plane -- all capabilities that map naturally onto Ruflo's agent/swarm model.

Today, managing IoT device fleets requires switching between platform-specific dashboards, SSH sessions, and custom scripts. There is no way to say "deploy firmware v2.3 to all devices in the warehouse zone with <85% confidence telemetry anomaly score" and have an AI agent swarm coordinate that safely. This ADR defines `@claude-flow/plugin-iot-cognitum` -- the bridge between Ruflo's agent orchestration and Cognitum's device fleet.

### Strategic Framing

This is not a wrapper around an SDK. This is **the agent-device control plane.**

Every IoT platform scales devices. Nobody is defining how **AI agents reason about device fleets as first-class swarm members**. That's the shift. Most systems treat devices as dumb endpoints that report telemetry. This plugin treats every Cognitum Seed as a **semi-autonomous agent peer** with its own identity, trust score, vector store, and capability set -- coordinated by Ruflo's swarm topology exactly as software agents are.

The Cognitum Seed's on-device vector store (`store.query()`, `store.ingest()`) becomes an extension of AgentDB's HNSW-indexed memory. The Seed's mesh networking (`mesh.status()`, `mesh.peers()`, `mesh.swarmStatus()`) maps directly to Ruflo's swarm topology. The Seed's Ed25519 identity and pairing protocol map to Ruflo's trust model. The Seed's witness chain (`witness.chain()`) provides cryptographic auditability that extends Ruflo's audit service.

If Claude Flow ships this, every Cognitum Seed becomes a Ruflo agent. Every device fleet becomes a Ruflo swarm. The physical world joins the agent mesh.

### Architecture Evaluation

| Dimension | Score | Why |
|-----------|-------|-----|
| Security | 9/10 | Ed25519 identity + TLS cert pinning + pairing tokens + trust scoring inherits from SDK |
| Compliance | 8/10 | Witness chain + audit trail + IEC 62443 zones cover industrial IoT |
| Practicality | 8/10 | SDK already ships 12 typed endpoints; plugin composes them |
| Differentiation | 10/10 | No agent framework treats physical devices as swarm peers |
| Risk | Medium | Network partitions in device fleets; OTA rollback complexity |

### Business Impact

**Fleet-as-swarm** -- A logistics company manages 500 warehouse sensors as a Ruflo swarm. Anomaly detection triggers automatic recalibration via agent coordination. No custom dashboard needed -- Claude Code is the interface.

**Edge-cloud federation** -- Edge Seed devices federate with cloud Ruflo installations using the `@claude-flow/plugin-agent-federation` trust model. Telemetry stays on-premise; only anomaly signatures cross the boundary (PII-gated via the federation plugin).

**Firmware-as-deployment** -- OTA firmware updates use the same deployment pipeline as software releases: staged rollout, canary checks, automatic rollback. The `deployment` CLI commands extend naturally.

### Design Stance: Device-Agent Duality

Every Cognitum Seed is modelled as a Ruflo agent with hardware capabilities. The plugin maintains a `DeviceAgent` entity that wraps a `SeedClient` session and exposes the device's resources (store, OTA, mesh, witness) as agent capabilities. The swarm coordinator manages device agents alongside software agents -- same topology, same trust model, same hooks.

---

## Decision

Build `@claude-flow/plugin-iot-cognitum` as a first-class Claude Flow plugin that bridges Cognitum Seed device fleets into the Ruflo agent/swarm model with device trust scoring, telemetry-driven anomaly detection, fleet-aware OTA orchestration, and edge-cloud federation.

---

## 1. Architecture Overview

### 1.1 Device-Agent Bridge

The plugin establishes a bidirectional bridge between Cognitum Seed devices and Ruflo agents:

```
Ruflo Agent Swarm                          Cognitum Device Fleet
=================                          =====================

[Fleet Manager Agent]                      [Seed A] ---- mesh ---- [Seed B]
       |                                       |                       |
       v                                       |                       |
[Device Coordinator]                           |                       |
       |                                       |                       |
       +--- SeedClient(A) ----- mTLS ---------+                       |
       |                                                               |
       +--- SeedClient(B) ----- mTLS ---------------------------------+
       |
       v
[Telemetry Analyzer Agent]
       |
       v
[AgentDB / HNSW]
  - device state snapshots
  - telemetry patterns
  - anomaly signatures
  - firmware history
```

### 1.2 Protocol Mapping

The Cognitum SDK's 12 seed endpoints map to Ruflo agent operations:

| Cognitum SDK | Ruflo Concept | Plugin Operation |
|-------------|---------------|-----------------|
| `client.status()` | Agent health check | `device_status` MCP tool |
| `client.identity()` | Agent identity | Device registration |
| `client.pair.create()` | Agent handshake | Device pairing / trust establishment |
| `client.pair.status()` | Session status | Trust validation |
| `client.store.query()` | AgentDB semantic search | Federated vector query |
| `client.store.ingest()` | AgentDB store | Telemetry ingestion |
| `client.store.status()` | Memory metrics | Store health monitoring |
| `client.ota.config()` | Deployment config | Firmware channel management |
| `client.ota.checkNow()` | Deployment status | Firmware update check |
| `client.witness.chain()` | Audit trail | Cryptographic provenance |
| `client.mesh.status()` | Swarm topology | Mesh overlay health |
| `client.mesh.peers()` | Peer discovery | Device fleet discovery |
| `client.mesh.swarmStatus()` | Swarm coordination | Fleet swarm state |
| `client.mesh.clusterHealth()` | Cluster monitoring | Fleet cluster health |
| `client.custody.epoch()` | Epoch tracking | State synchronization |

### 1.3 Data Flow

```
Cognitum Seed Device                      Ruflo Plugin                        AgentDB
====================                      ============                        =======

[Sensor Data]
    |
    v
[On-device Vector Store]
    |
    v                                 [SeedClient.store.query()]
[store.query() response] ----------> [Telemetry Ingest Pipeline]
                                          |
                                          v
                                     [Anomaly Detection]
                                          |          |
                                          v          v
                                     [Alert Hook]  [HNSW Index]
                                          |          |
                                          v          v
                                     [Agent Swarm] [Pattern Store]
                                     (remediation)  (learning)


[OTA Update Available]
    |
    v                                 [SeedClient.ota.checkNow()]
[ota.checkNow() response] ---------> [Firmware Orchestrator]
                                          |
                                          v
                                     [Staged Rollout Engine]
                                          |
                                     [Canary Check] -----> [Rollback Gate]
                                          |                      |
                                          v                      v
                                     [Fleet OTA Sweep]    [Rollback All]


[Witness Chain]
    |
    v                                 [SeedClient.witness.chain()]
[witness.chain() response] --------> [Provenance Verifier]
                                          |
                                          v
                                     [Audit Service]
                                          |
                                          v
                                     [AgentDB: iot-audit namespace]
```

### 1.4 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Plugin, not core** | IoT is a specialized domain; ships as `@claude-flow/plugin-iot-cognitum`. |
| **Device = Agent** | Treating devices as agents enables swarm topology, trust scoring, and capability gating without new abstractions. |
| **SeedClient per device** | The SDK's `PeerSet` handles mesh routing; one `SeedClient` can manage N seeds via mesh. The plugin creates one client per logical fleet. |
| **mDNS + Explicit discovery** | Inherits the SDK's `DiscoveryProvider` interface. `MdnsDiscovery` for LAN, `ExplicitDiscovery` for WAN, `TailscaleDiscovery` for overlay networks. |
| **Trust scoring reuse** | Adapts the federation plugin's trust model (ADR-078 Section 2.1.1) for device trust, with IoT-specific signals: firmware currency, uptime, attestation chain length. |
| **Vector store federation** | Device-side HNSW data is queryable from Ruflo's AgentDB via the `store.query()` bridge -- the device's vector store extends the agent's memory. |
| **Witness chain as audit** | The Seed's Ed25519-signed witness chain provides hardware-rooted provenance that supplements Ruflo's software audit service. |
| **Claims-based OTA** | OTA operations require `iot:firmware:deploy` claims. Staged rollouts require `iot:firmware:fleet-deploy`. Prevents accidental fleet-wide bricking. |

---

## 2. Domain Model

### 2.1 Entities

```typescript
/**
 * A Cognitum Seed device registered with the Ruflo agent system.
 * Wraps the SDK's SeedClient and exposes device resources as agent capabilities.
 */
interface DeviceAgent {
  deviceId: string;                    // From SeedIdentity.device_id
  publicKey: string;                   // Ed25519 public key from identity()
  firmwareVersion: string;             // Current firmware version
  trustLevel: DeviceTrustLevel;        // IoT-adapted trust level
  trustScore: number;                  // Continuous score 0.0-1.0
  fleetId: string;                     // Logical fleet grouping
  zoneId: string;                      // IEC 62443 security zone
  status: DeviceStatus;                // online | offline | updating | quarantined
  lastSeen: Date;                      // Last successful heartbeat
  epoch: number;                       // Custody epoch for state sync
  capabilities: DeviceCapability[];    // Available device capabilities
  meshPeers: string[];                 // Known mesh peer device IDs
  vectorStoreStats: StoreStatus;       // On-device vector store metrics
  metadata: Record<string, unknown>;   // Extensible metadata
}

type DeviceStatus = 'online' | 'offline' | 'updating' | 'quarantined' | 'decommissioned';

type DeviceCapability =
  | 'vector-store'       // Has HNSW vector store
  | 'ota-update'         // Supports OTA firmware
  | 'mesh-routing'       // Participates in mesh network
  | 'witness-chain'      // Maintains Ed25519 witness chain
  | 'sensor-telemetry'   // Produces telemetry data
  | 'edge-compute'       // WASM runtime available
  | 'mcp-server';        // Exposes MCP tools

/**
 * A logical grouping of devices managed as a unit.
 * Maps to a Ruflo swarm with hierarchical topology.
 */
interface DeviceFleet {
  fleetId: string;
  name: string;
  description: string;
  zoneId: string;                      // IEC 62443 zone
  deviceIds: string[];
  firmwarePolicy: FirmwarePolicy;
  telemetryPolicy: TelemetryPolicy;
  healthThresholds: HealthThresholds;
  topology: FleetTopology;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A telemetry reading from a device, stored as a vector in AgentDB.
 */
interface TelemetryReading {
  readingId: string;
  deviceId: string;
  fleetId: string;
  timestamp: Date;
  vector: number[];                    // Embedding of telemetry data
  rawMetrics: Record<string, number>;  // Raw sensor values
  anomalyScore: number;                // 0.0 (normal) - 1.0 (anomalous)
  metadata: Record<string, unknown>;
}

/**
 * A firmware deployment operation targeting one or more devices.
 */
interface FirmwareDeployment {
  deploymentId: string;
  fleetId: string;
  targetVersion: string;
  currentVersion: string;
  strategy: DeploymentStrategy;
  status: DeploymentStatus;
  stages: DeploymentStage[];
  startedAt: Date;
  completedAt?: Date;
  rollbackTriggered: boolean;
  deviceResults: Map<string, DeviceDeploymentResult>;
}

type DeploymentStrategy = 'canary' | 'rolling' | 'blue-green' | 'all-at-once';
type DeploymentStatus = 'pending' | 'canary' | 'rolling' | 'completed' | 'rolled-back' | 'failed';
```

### 2.2 Value Objects

```typescript
enum DeviceTrustLevel {
  UNKNOWN = 0,        // Device seen but not paired
  REGISTERED = 1,     // Paired via pair.create(), identity verified
  PROVISIONED = 2,    // Firmware verified, policies applied, zone assigned
  CERTIFIED = 3,      // Extended uptime, clean witness chain, anomaly-free
  FLEET_TRUSTED = 4,  // Fleet-level attestation, institutional endorsement
}

interface DeviceTrustScore {
  overall: number;              // 0.0 - 1.0
  components: {
    pairingIntegrity: number;   // Pairing token validity, auth success rate
    firmwareCurrency: number;   // 1.0 if latest, decays with version lag
    uptimeStability: number;    // Uptime ratio over rolling window
    witnessIntegrity: number;   // Witness chain length / expected length
    anomalyHistory: number;     // 1.0 - (anomaly rate over rolling window)
    meshParticipation: number;  // Active mesh peer count / expected peers
  };
}

interface FirmwarePolicy {
  channel: string;                        // 'stable' | 'beta' | 'canary'
  autoUpdate: boolean;                    // Allow automatic updates
  approvalRequired: boolean;              // Human approval gate
  canaryPercentage: number;               // % of fleet for canary stage
  canaryDurationMinutes: number;          // How long canary runs before rollout
  rollbackOnAnomalyThreshold: number;     // Anomaly score that triggers rollback
  maintenanceWindow?: { start: string; end: string }; // ISO time window
}

interface TelemetryPolicy {
  ingestionIntervalSeconds: number;       // How often to pull telemetry
  retentionDays: number;                  // How long to keep in AgentDB
  anomalyDetectionEnabled: boolean;       // Run SONA anomaly detection
  anomalyThreshold: number;              // Score threshold for alerting
  vectorDimension: number;                // Embedding dimension for store
}

interface HealthThresholds {
  maxOfflineMinutes: number;              // Before quarantine
  minUptimeRatio: number;                 // Over rolling 24h window
  maxConsecutiveAnomalies: number;        // Before auto-quarantine
  minFirmwareCurrency: number;            // Min firmware version lag
}

type FleetTopology = 'star' | 'mesh' | 'hierarchical' | 'ring';
```

### 2.3 Domain Services

```typescript
/**
 * Manages device lifecycle: registration, pairing, health monitoring,
 * and decommissioning. Wraps SeedClient instances per device.
 */
interface DeviceLifecycleService {
  registerDevice(endpoint: string, fleetId: string): Promise<DeviceAgent>;
  pairDevice(deviceId: string, clientName: string): Promise<PairCreateResponse>;
  unpairDevice(deviceId: string, clientName: string): Promise<void>;
  heartbeat(deviceId: string): Promise<DeviceAgent>;
  quarantineDevice(deviceId: string, reason: string): Promise<void>;
  decommissionDevice(deviceId: string): Promise<void>;
  getDeviceStatus(deviceId: string): Promise<DeviceAgent>;
}

/**
 * Ingests telemetry from device vector stores, runs anomaly detection,
 * and stores patterns in AgentDB for SONA learning.
 */
interface TelemetryIngestionService {
  ingestFromDevice(deviceId: string, queryVector: number[], k: number): Promise<TelemetryReading[]>;
  batchIngest(fleetId: string): Promise<TelemetryReading[]>;
  detectAnomalies(readings: TelemetryReading[]): Promise<AnomalyDetection[]>;
  storePattern(pattern: TelemetryPattern): Promise<void>;
  queryPatterns(query: string, limit?: number): Promise<TelemetryPattern[]>;
}

/**
 * Orchestrates firmware deployments across device fleets with staged
 * rollout, canary verification, and automatic rollback.
 */
interface FirmwareOrchestrationService {
  checkUpdates(fleetId: string): Promise<Map<string, DeviceUpdateCheck>>;
  deployFirmware(fleetId: string, strategy: DeploymentStrategy): Promise<FirmwareDeployment>;
  advanceStage(deploymentId: string): Promise<FirmwareDeployment>;
  rollback(deploymentId: string, reason: string): Promise<FirmwareDeployment>;
  getDeploymentStatus(deploymentId: string): Promise<FirmwareDeployment>;
}

/**
 * Manages device fleet topology, mapping device mesh networks
 * to Ruflo swarm topologies.
 */
interface FleetTopologyService {
  createFleet(config: Omit<DeviceFleet, 'fleetId' | 'createdAt' | 'updatedAt'>): Promise<DeviceFleet>;
  addDeviceToFleet(deviceId: string, fleetId: string): Promise<void>;
  removeDeviceFromFleet(deviceId: string, fleetId: string): Promise<void>;
  getFleetTopology(fleetId: string): Promise<FleetTopologyMap>;
  syncMeshTopology(fleetId: string): Promise<void>;
  getFleetHealth(fleetId: string): Promise<FleetHealthReport>;
}

/**
 * Verifies witness chains for cryptographic provenance and
 * integrates with Ruflo's audit service.
 */
interface WitnessVerificationService {
  verifyChain(deviceId: string): Promise<WitnessVerification>;
  getProvenance(deviceId: string, sinceEpoch?: number): Promise<WitnessEntry[]>;
  exportAuditTrail(fleetId: string, format: 'json' | 'csv'): Promise<string>;
}
```

---

## 3. Application Layer

### 3.1 IoT Coordinator

The `IoTCoordinator` orchestrates all device operations, analogous to the `FederationCoordinator` in ADR-078:

```typescript
interface IoTCoordinatorConfig {
  cognitumApiKey?: string;             // For cloud control plane
  cloudBaseUrl?: string;               // Default: api.cognitum.one
  discoveryMode: 'explicit' | 'mdns' | 'tailscale' | 'mixed';
  defaultFleetTopology: FleetTopology;
  defaultFirmwarePolicy: FirmwarePolicy;
  defaultTelemetryPolicy: TelemetryPolicy;
  defaultHealthThresholds: HealthThresholds;
  tls: {
    ca?: string | Buffer;
    insecure?: boolean;                // Dev-only
  };
}

class IoTCoordinator {
  constructor(
    config: IoTCoordinatorConfig,
    deviceLifecycle: DeviceLifecycleService,
    telemetry: TelemetryIngestionService,
    firmware: FirmwareOrchestrationService,
    fleetTopology: FleetTopologyService,
    witness: WitnessVerificationService,
    trustEvaluator: DeviceTrustEvaluator,
    auditService: IoTAuditService,
  );

  // Lifecycle
  async initialize(): Promise<void>;
  async shutdown(): Promise<void>;
  getStatus(): IoTCoordinatorStatus;

  // Device operations (delegated to services)
  async registerDevice(endpoint: string, fleetId: string): Promise<DeviceAgent>;
  async queryDeviceTelemetry(deviceId: string, vector: number[], k: number): Promise<TelemetryReading[]>;
  async deployFirmware(fleetId: string, strategy: DeploymentStrategy): Promise<FirmwareDeployment>;
  async getFleetHealth(fleetId: string): Promise<FleetHealthReport>;
  async verifyWitnessChain(deviceId: string): Promise<WitnessVerification>;
}
```

### 3.2 Device Trust Evaluator

Adapts ADR-078's trust scoring for IoT-specific signals:

```typescript
/**
 * Trust score formula for devices:
 *
 *   trust_score = 0.20 * pairing_integrity
 *               + 0.20 * firmware_currency
 *               + 0.15 * uptime_stability
 *               + 0.15 * witness_integrity
 *               + 0.15 * anomaly_history
 *               + 0.15 * mesh_participation
 *
 * Weights reflect IoT-specific priorities: identity and firmware
 * are critical; mesh participation matters for fleet coherence.
 */

interface DeviceTrustTransitionThresholds {
  '0->1': { condition: 'pair.create() succeeds' };
  '1->2': { upgradeScore: 0.65; minUptimeHours: 24; firmwareVerified: true };
  '2->3': { upgradeScore: 0.80; minUptimeHours: 168; witnessChainLength: 100; anomalyRate: 0.02 };
  '3->4': { upgradeScore: 0.92; institutionalAttestation: true; minFleetMembers: 5 };
}

// Automatic downgrade triggers (immediate, no hysteresis):
// - 3 consecutive auth failures (inherits SDK trust-score 3-strike cutoff)
// - Firmware hash mismatch detected in witness chain
// - Anomaly score > 0.9 sustained for > 5 minutes
// - Mesh partition lasting > 30 minutes with no heartbeat
// - TLS fingerprint mismatch (inherits SDK TlsPinError)
```

### 3.3 Anomaly Detection Engine

Uses SONA pattern learning from Ruflo's neural system:

```typescript
interface AnomalyDetection {
  readingId: string;
  deviceId: string;
  score: number;                       // 0.0 - 1.0
  type: AnomalyType;
  confidence: number;
  baselinePattern?: string;            // AgentDB pattern key
  suggestedAction: AnomalyAction;
  metadata: Record<string, unknown>;
}

type AnomalyType =
  | 'drift'              // Gradual deviation from baseline
  | 'spike'              // Sudden value change
  | 'flatline'           // No variance (sensor failure?)
  | 'oscillation'        // Rapid fluctuation
  | 'pattern-break'      // Breaks learned periodic pattern
  | 'cluster-outlier';   // Outlier relative to fleet cluster

type AnomalyAction =
  | 'log'                // Below threshold, log only
  | 'alert'              // Notify fleet manager agent
  | 'quarantine'         // Isolate device from fleet
  | 'recalibrate'        // Trigger sensor recalibration
  | 'rollback-firmware'  // Suspect firmware regression
  | 'human-review';      // Escalate to operator
```

---

## 4. Infrastructure Layer

### 4.1 Cognitum SDK Integration

```typescript
/**
 * Factory that creates and manages SeedClient instances per device/fleet.
 * Handles discovery provider selection, TLS configuration, and token management.
 */
class SeedClientFactory {
  constructor(config: IoTCoordinatorConfig);

  /**
   * Create a SeedClient for a single device endpoint.
   * Uses the SDK's mesh-aware routing when multiple endpoints are provided.
   */
  async createClient(
    endpoints: string | string[],
    options?: Partial<SeedClientOptions>,
  ): Promise<SeedClient>;

  /**
   * Create a SeedClient using mDNS discovery for LAN-local seeds.
   * Requires optional peer dependency: multicast-dns
   */
  async createMdnsClient(
    options?: Partial<SeedClientOptions>,
  ): Promise<SeedClient>;

  /**
   * Create a SeedClient using Tailscale discovery for overlay networks.
   */
  async createTailscaleClient(
    options?: Partial<SeedClientOptions>,
  ): Promise<SeedClient>;

  /**
   * Close all managed clients. Called during plugin shutdown.
   */
  async closeAll(): Promise<void>;
}

/**
 * Cloud control plane client for fleet-level operations.
 * Wraps the Cognitum class from @cognitum-one/sdk (main export).
 */
class CloudControlPlane {
  private readonly cognitum: Cognitum;

  constructor(config: CognitumConfig);

  async registerDevice(params: DeviceRegisterParams): Promise<void>;
  async checkUpdate(deviceId: string): Promise<DeviceUpdateCheck>;
  async heartbeat(deviceId: string): Promise<void>;
  async getFleetStatus(): Promise<FleetStatus>;
  async health(): Promise<HealthResponse>;

  // Brain knowledge base for fleet patterns
  async sharePattern(params: BrainShareParams): Promise<BrainMemory>;
  async searchPatterns(query: string): Promise<BrainSearchResult>;

  // MCP tool proxy
  async listMcpTools(): Promise<McpTool[]>;
  async callMcpTool(name: string, args?: Record<string, unknown>): Promise<McpToolCallResult>;
}
```

### 4.2 Persistence (AgentDB Repositories)

```typescript
// AgentDB namespaces used by the IoT plugin:
const IOT_NAMESPACES = {
  DEVICES: 'iot-devices',              // DeviceAgent state
  FLEETS: 'iot-fleets',               // DeviceFleet configurations
  TELEMETRY: 'iot-telemetry',          // TelemetryReading vectors (HNSW-indexed)
  ANOMALY_PATTERNS: 'iot-anomalies',   // Learned anomaly signatures
  FIRMWARE: 'iot-firmware',            // FirmwareDeployment records
  AUDIT: 'iot-audit',                  // IoT-specific audit events
  WITNESS: 'iot-witness',             // Witness chain snapshots
  TRUST: 'iot-trust',                  // Device trust score history
} as const;

/**
 * Telemetry vectors are stored with HNSW indexing for fast similarity search.
 * This enables: "find all readings similar to this anomalous reading" in <10ms.
 */
interface TelemetryRepository {
  store(reading: TelemetryReading): Promise<void>;
  batchStore(readings: TelemetryReading[]): Promise<void>;
  querySimilar(vector: number[], k: number, fleetId?: string): Promise<TelemetryReading[]>;
  queryByDevice(deviceId: string, since: Date, limit: number): Promise<TelemetryReading[]>;
  queryByAnomalyScore(threshold: number, limit: number): Promise<TelemetryReading[]>;
  prune(olderThan: Date): Promise<number>;
}

/**
 * Device state repository. Stores DeviceAgent snapshots with
 * trust score history for trend analysis.
 */
interface DeviceRepository {
  upsert(device: DeviceAgent): Promise<void>;
  get(deviceId: string): Promise<DeviceAgent | null>;
  listByFleet(fleetId: string): Promise<DeviceAgent[]>;
  listByStatus(status: DeviceStatus): Promise<DeviceAgent[]>;
  listByTrustLevel(level: DeviceTrustLevel): Promise<DeviceAgent[]>;
  getTrustHistory(deviceId: string, days: number): Promise<DeviceTrustScore[]>;
  delete(deviceId: string): Promise<void>;
}
```

### 4.3 Transport Layer

```typescript
/**
 * Adapts Cognitum SDK's transport (undici-based HTTP + TLS) for use
 * within the Ruflo plugin context. Handles:
 * - SeedClient construction with proper TLS config
 * - Per-peer cert pinning via mDNS fp= records
 * - TokenBook management (pairing tokens per peer)
 * - Health probe coordination with Ruflo's health check system
 */
class CognitumTransport {
  private readonly factory: SeedClientFactory;
  private readonly clients: Map<string, SeedClient>;       // fleetId -> SeedClient
  private readonly tokenBooks: Map<string, TokenBook>;     // fleetId -> TokenBook

  async connect(fleetId: string, endpoints: string[]): Promise<void>;
  async disconnect(fleetId: string): Promise<void>;
  async getClient(fleetId: string): Promise<SeedClient>;

  // Mesh topology sync
  async syncMeshState(fleetId: string): Promise<MeshStatus>;
  async getPeers(fleetId: string): Promise<MeshPeers>;

  // Health monitoring
  async probeHealth(fleetId: string): Promise<Map<string, PeerState>>;
}
```

---

## 5. Security Architecture

### 5.1 Device Trust Model

```
Trust Level 0: UNKNOWN        -- Device endpoint discovered but not paired
Trust Level 1: REGISTERED     -- pair.create() succeeded, Ed25519 identity verified
Trust Level 2: PROVISIONED    -- Firmware verified, policies applied, zone assigned
Trust Level 3: CERTIFIED      -- Extended clean operation, witness chain verified
Trust Level 4: FLEET_TRUSTED  -- Institutional attestation, fleet-level endorsement
```

Trust levels map to capability gates:

| Trust Level | Allowed Operations |
|-------------|-------------------|
| 0 | mDNS discovery, mesh status (WiFi-read endpoints only) |
| 1 | Status, identity, store status, OTA config read |
| 2 | Store query, telemetry ingestion, OTA check |
| 3 | Store ingest, firmware deploy (canary), witness chain query, mesh participation |
| 4 | Fleet-wide firmware deploy, cross-fleet federation, edge compute deployment |

### 5.2 Trust Score Formula

```
device_trust_score = 0.20 * pairing_integrity
                   + 0.20 * firmware_currency
                   + 0.15 * uptime_stability
                   + 0.15 * witness_integrity
                   + 0.15 * anomaly_history
                   + 0.15 * mesh_participation
```

| Component | Calculation | Range |
|-----------|------------|-------|
| `pairing_integrity` | Auth success rate; 0 on 3-strike lockout (SDK TrustScoreBlockedError) | 0.0 - 1.0 |
| `firmware_currency` | 1.0 if latest version; decays 0.1 per major version behind | 0.0 - 1.0 |
| `uptime_stability` | Seconds online / total seconds over rolling 7-day window | 0.0 - 1.0 |
| `witness_integrity` | Witness chain entries verified / expected entries | 0.0 - 1.0 |
| `anomaly_history` | 1.0 - (anomalous readings / total readings over 30 days) | 0.0 - 1.0 |
| `mesh_participation` | Active mesh peer connections / expected peer count | 0.0 - 1.0 |

Trust level transitions with hysteresis:

| Transition | Upgrade Threshold | Downgrade Threshold | Min Duration |
|-----------|-------------------|---------------------|--------------|
| 0 -> 1 | pair.create() succeeds | pair.delete() or 3-strike | N/A |
| 1 -> 2 | score >= 0.65 | score < 0.45 | 24 hours |
| 2 -> 3 | score >= 0.80 | score < 0.60 | 7 days |
| 3 -> 4 | score >= 0.92 + institutional attestation | score < 0.75 | 30 days |

### 5.3 IoT-Specific Threat Model

| Threat | Detection | Mitigation |
|--------|-----------|------------|
| **Firmware injection** | Witness chain hash mismatch | Immediate quarantine + alert; block OTA from compromised channel |
| **Side-channel data exfil** | Anomalous outbound traffic pattern | Rate limit + PII pipeline scan on telemetry egress |
| **Unauthorized device pairing** | Unexpected pair.create() from unknown client name | Pairing window time-limited; require human approval via AuthorityGate |
| **Replay attack on mesh** | Duplicate nonce / stale epoch in mesh messages | SDK's nonce tracking + epoch monotonicity check |
| **Evil twin device** | Same device_id from different endpoint | TLS cert pinning (fp= fingerprint); reject mismatched identity |
| **Telemetry poisoning** | Anomaly detection on ingested vectors | Flag + quarantine source device; exclude from fleet baselines |
| **OTA MITM** | Channel integrity via TLS + witness chain | Only accept OTA from verified channels; verify witness after update |
| **Mesh partition exploit** | Extended partition with selective reachability | Cross-validate mesh status from multiple peers; quorum check |

### 5.4 Claims Integration

New claim types registered by the IoT plugin:

```typescript
type IoTClaimType =
  | 'iot:device:discover'         // Can discover devices via mDNS/explicit
  | 'iot:device:register'         // Can register (pair) new devices
  | 'iot:device:status'           // Can read device status and identity
  | 'iot:device:telemetry:read'   // Can query device vector stores
  | 'iot:device:telemetry:write'  // Can ingest vectors into device stores
  | 'iot:device:quarantine'       // Can quarantine a device
  | 'iot:device:decommission'     // Can decommission (unpair + remove)
  | 'iot:fleet:manage'            // Can create/modify fleets
  | 'iot:fleet:deploy'            // Can trigger fleet-wide deployments
  | 'iot:firmware:check'          // Can check for firmware updates
  | 'iot:firmware:deploy'         // Can deploy firmware to individual devices
  | 'iot:firmware:fleet-deploy'   // Can deploy firmware fleet-wide (high risk)
  | 'iot:firmware:rollback'       // Can rollback firmware
  | 'iot:witness:read'            // Can query witness chains
  | 'iot:admin'                   // Full IoT plugin administration
  ;
```

### 5.5 Authority Gate Integration

| Action | Authority Level | Irreversibility |
|--------|----------------|-----------------|
| Register new device | human | costly-reversible |
| Deploy firmware (canary) | human | costly-reversible |
| Deploy firmware (fleet-wide) | institutional | costly-reversible |
| Quarantine device | automatic (trust < threshold) | reversible |
| Decommission device | human | irreversible |
| Create fleet | human | reversible |
| Delete fleet | institutional | irreversible |
| Override anomaly quarantine | human | reversible |

---

## 6. Compliance Modes

### 6.1 IEC 62443 (Industrial Cybersecurity)

The IEC 62443 standard defines security zones and conduits for industrial automation. The plugin maps this to:

| IEC 62443 Concept | Plugin Implementation |
|-------------------|----------------------|
| **Security Zones** | `DeviceFleet.zoneId` -- each fleet belongs to one zone |
| **Conduits** | Inter-fleet communication channels with trust-gated access |
| **Security Levels (SL)** | Map to `DeviceTrustLevel`: SL1=REGISTERED, SL2=PROVISIONED, SL3=CERTIFIED, SL4=FLEET_TRUSTED |
| **System Under Consideration (SUC)** | The entire device fleet managed by one Ruflo installation |
| **Component Requirements (CR)** | Enforced via claims: each CR maps to an `iot:*` claim type |
| **Foundational Requirements (FR)** | FR1(ID/Auth)=pairing+TLS, FR2(Use Control)=claims, FR3(Integrity)=witness chain, FR4(Confidentiality)=TLS+PII pipeline, FR5(Data Flow)=trust-gated routing, FR6(Response)=anomaly auto-quarantine, FR7(Availability)=mesh failover |

Zone-crossing rules:

```typescript
interface ZoneCrossingPolicy {
  sourceZone: string;
  targetZone: string;
  allowed: boolean;
  minTrustLevel: DeviceTrustLevel;
  requirePiiScan: boolean;          // Strip PII from cross-zone telemetry
  requireAuditLog: boolean;         // Log every cross-zone operation
  rateLimit: number;                // Max operations per minute
}
```

### 6.2 NIST IoT Cybersecurity Framework

| NIST Function | Plugin Implementation |
|---------------|----------------------|
| **Identify** | Device inventory via `iot device list`; fleet topology via `iot fleet topology` |
| **Protect** | TLS cert pinning, Ed25519 pairing, claims-based access control |
| **Detect** | SONA anomaly detection on telemetry; mesh partition detection |
| **Respond** | Automatic quarantine; firmware rollback; alert hooks |
| **Recover** | Firmware rollback; device re-provisioning; fleet re-mesh |

### 6.3 Matter Protocol Compatibility

For smart home/building IoT deployments, the plugin supports Matter protocol semantics:

| Matter Concept | Plugin Mapping |
|---------------|----------------|
| **Fabric** | `DeviceFleet` |
| **Node** | `DeviceAgent` |
| **Commissioning** | `pair.create()` + trust level 0 -> 1 |
| **Operational Certificate** | Ed25519 identity + witness chain attestation |
| **Access Control Lists** | IoT claims (`iot:device:*`) |
| **OTA Provider** | Firmware orchestration service |

---

## 7. MCP Tools

### 7.1 Device Management Tools

```
iot_device_register
  Description: Register a new Cognitum Seed device with the Ruflo agent system
  Input:
    endpoint: string    (required) -- Device HTTPS endpoint (e.g., https://cognitum.local:8443)
    fleetId: string     (required) -- Fleet to assign device to
    clientName: string  (optional) -- Client name for pairing (default: ruflo-{timestamp})
    zoneId: string      (optional) -- IEC 62443 security zone
  Output: DeviceAgent JSON with deviceId, trustLevel, capabilities

iot_device_status
  Description: Get comprehensive device status including trust score, store stats, and mesh state
  Input:
    deviceId: string    (required) -- Device ID to query
    detailed: boolean   (optional) -- Include trust score breakdown and witness chain summary
  Output: DeviceAgent JSON with current state

iot_device_pair
  Description: Pair with a Cognitum Seed device (requires open pairing window on device)
  Input:
    deviceId: string    (required) -- Device ID to pair with
    clientName: string  (required) -- Human-readable client name for this pairing
  Output: Pairing status with redacted token confirmation

iot_device_unpair
  Description: Revoke pairing with a device
  Input:
    deviceId: string    (required) -- Device ID to unpair
    clientName: string  (required) -- Client name to revoke
  Output: Confirmation of pairing revocation

iot_device_quarantine
  Description: Quarantine a device, isolating it from fleet operations
  Input:
    deviceId: string    (required) -- Device ID to quarantine
    reason: string      (required) -- Reason for quarantine (audit trail)
  Output: Updated DeviceAgent with quarantined status

iot_device_decommission
  Description: Permanently decommission a device (requires human authority)
  Input:
    deviceId: string    (required) -- Device ID to decommission
    reason: string      (required) -- Reason for decommission
    force: boolean      (optional) -- Skip graceful shutdown (emergency only)
  Output: Decommission confirmation with audit event ID
```

### 7.2 Fleet Management Tools

```
iot_fleet_create
  Description: Create a new device fleet with topology, firmware, and telemetry policies
  Input:
    name: string                   (required) -- Fleet name
    description: string            (optional) -- Fleet description
    zoneId: string                 (optional) -- IEC 62443 security zone
    topology: string               (optional) -- star | mesh | hierarchical | ring (default: hierarchical)
    firmwareChannel: string        (optional) -- stable | beta | canary (default: stable)
    telemetryInterval: number      (optional) -- Seconds between telemetry pulls (default: 60)
  Output: DeviceFleet JSON

iot_fleet_status
  Description: Get fleet health including device statuses, anomaly summary, and firmware versions
  Input:
    fleetId: string    (required) -- Fleet ID to query
  Output: FleetHealthReport JSON

iot_fleet_topology
  Description: Get the fleet's mesh topology as seen from the device network layer
  Input:
    fleetId: string    (required) -- Fleet ID
  Output: Topology map with device connections, latencies, and health states

iot_fleet_discover
  Description: Discover Cognitum Seed devices on the local network via mDNS
  Input:
    timeoutMs: number  (optional) -- Discovery timeout in ms (default: 5000)
    fleetId: string    (optional) -- Auto-assign discovered devices to this fleet
  Output: Array of discovered device endpoints with device IDs and TLS fingerprints
```

### 7.3 Telemetry Tools

```
iot_telemetry_query
  Description: Query a device's on-board vector store for telemetry readings
  Input:
    deviceId: string    (required) -- Device ID to query
    vector: number[]    (required) -- Query vector for similarity search
    k: number           (optional) -- Number of results (default: 10)
    metric: string      (optional) -- cosine | euclidean | dot (default: cosine)
  Output: StoreQueryResponse with nearest telemetry readings

iot_telemetry_ingest
  Description: Ingest telemetry vectors into a device's on-board vector store
  Input:
    deviceId: string           (required) -- Target device ID
    vectors: StoreIngestItem[] (required) -- Vectors with optional metadata
  Output: StoreIngestResponse with ingest count and witness chain update

iot_telemetry_anomalies
  Description: Run anomaly detection on recent telemetry from a fleet
  Input:
    fleetId: string     (required) -- Fleet to analyze
    threshold: number   (optional) -- Anomaly score threshold (default: 0.7)
    limit: number       (optional) -- Max results (default: 50)
  Output: Array of AnomalyDetection with scores, types, and suggested actions

iot_telemetry_baseline
  Description: Compute or update the telemetry baseline for a fleet (used by SONA anomaly detection)
  Input:
    fleetId: string     (required) -- Fleet to baseline
    windowDays: number  (optional) -- Historical window for baseline (default: 7)
  Output: Baseline statistics with per-device and fleet-aggregate patterns
```

### 7.4 Firmware Tools

```
iot_firmware_check
  Description: Check for available firmware updates across a fleet
  Input:
    fleetId: string    (required) -- Fleet to check
  Output: Map of deviceId -> DeviceUpdateCheck with version info

iot_firmware_deploy
  Description: Deploy firmware to a fleet using a staged rollout strategy
  Input:
    fleetId: string         (required) -- Target fleet
    strategy: string        (optional) -- canary | rolling | blue-green | all-at-once (default: canary)
    canaryPercentage: number (optional) -- Canary stage percentage (default: 10)
    canaryDuration: number  (optional) -- Canary duration in minutes (default: 30)
  Output: FirmwareDeployment with deployment ID and stage details

iot_firmware_rollback
  Description: Rollback a firmware deployment
  Input:
    deploymentId: string   (required) -- Deployment to rollback
    reason: string         (required) -- Reason for rollback
  Output: Updated FirmwareDeployment with rollback status

iot_firmware_status
  Description: Get the status of a firmware deployment
  Input:
    deploymentId: string   (required) -- Deployment ID
  Output: FirmwareDeployment with per-device results
```

### 7.5 Audit & Witness Tools

```
iot_witness_verify
  Description: Verify a device's Ed25519 witness chain for cryptographic integrity
  Input:
    deviceId: string    (required) -- Device ID
    sinceEpoch: number  (optional) -- Start from this epoch
  Output: WitnessVerification with chain integrity status and any gaps

iot_audit_query
  Description: Query IoT audit logs with filtering
  Input:
    eventType: string   (optional) -- Filter by event type
    deviceId: string    (optional) -- Filter by device
    fleetId: string     (optional) -- Filter by fleet
    severity: string    (optional) -- info | warn | error | critical
    since: string       (optional) -- ISO 8601 start date
    limit: number       (optional) -- Max results (default: 50)
  Output: Array of IoTAuditEvent

iot_trust_review
  Description: Review device trust score with component breakdown
  Input:
    deviceId: string    (required) -- Device ID
  Output: DeviceTrustScore with component breakdown and trend
```

---

## 8. CLI Commands

```
iot init                                    # Initialize IoT plugin with Cognitum API key and default policies
iot device register <endpoint>              # Register a Seed device by endpoint
  --fleet <fleetId>                         #   Assign to fleet (required)
  --zone <zoneId>                           #   IEC 62443 security zone
  --client-name <name>                      #   Pairing client name
iot device list                             # List all registered devices
  --fleet <fleetId>                         #   Filter by fleet
  --status <status>                         #   Filter by status
  --trust-level <level>                     #   Filter by trust level (0-4)
  --format <table|json>                     #   Output format
iot device status <deviceId>                # Show device status with trust score
  --detailed                                #   Include trust breakdown and witness summary
iot device quarantine <deviceId>            # Quarantine a device
  --reason <reason>                         #   Reason (required)
iot device decommission <deviceId>          # Decommission a device (requires authority)
  --reason <reason>                         #   Reason (required)
  --force                                   #   Skip graceful shutdown
iot device discover                         # Discover devices via mDNS
  --timeout <ms>                            #   Discovery timeout (default 5000)
  --auto-register <fleetId>                 #   Auto-register to fleet

iot fleet create <name>                     # Create a new device fleet
  --zone <zoneId>                           #   Security zone
  --topology <type>                         #   star | mesh | hierarchical | ring
  --firmware-channel <channel>              #   stable | beta | canary
iot fleet list                              # List all fleets
  --format <table|json>                     #   Output format
iot fleet status <fleetId>                  # Fleet health report
  --detailed                                #   Include per-device breakdown
iot fleet topology <fleetId>                # Show fleet mesh topology
  --format <ascii|json|dot>                 #   Output format (ascii=visual, dot=graphviz)
iot fleet add-device <fleetId> <deviceId>   # Add device to fleet
iot fleet remove-device <fleetId> <deviceId> # Remove device from fleet

iot telemetry query <deviceId>              # Query device vector store
  --vector <json>                           #   Query vector (JSON array)
  --k <number>                              #   Number of results (default 10)
  --metric <cosine|euclidean|dot>           #   Distance metric
iot telemetry anomalies <fleetId>           # Run anomaly detection
  --threshold <number>                      #   Score threshold (default 0.7)
  --since <date>                            #   Start date
iot telemetry baseline <fleetId>            # Compute telemetry baseline
  --window <days>                           #   Historical window (default 7)

iot firmware check <fleetId>                # Check for firmware updates
iot firmware deploy <fleetId>               # Deploy firmware
  --strategy <canary|rolling|blue-green|all-at-once>
  --canary-pct <number>                     #   Canary percentage (default 10)
  --canary-duration <minutes>               #   Canary duration (default 30)
  --dry-run                                 #   Preview without deploying
iot firmware rollback <deploymentId>        # Rollback deployment
  --reason <reason>                         #   Reason (required)
iot firmware status <deploymentId>          # Deployment status
  --format <table|json>                     #   Output format

iot witness verify <deviceId>               # Verify witness chain
  --since-epoch <number>                    #   Start epoch
iot witness export <fleetId>                # Export witness audit trail
  --format <json|csv>                       #   Export format

iot audit                                   # Query audit logs
  --device <deviceId>                       #   Filter by device
  --fleet <fleetId>                         #   Filter by fleet
  --severity <level>                        #   Filter severity
  --since <date>                            #   Start date
  --export <json|csv|ndjson>                #   Export format
  --compliance <iec62443|nist-iot|none>     #   Compliance mode

iot trust <deviceId>                        # Review device trust
  --review                                  #   Show score breakdown
  --history <days>                          #   Show trust history

iot config                                  # View IoT plugin configuration
  --set-api-key <key>                       #   Set Cognitum API key
  --set-firmware-policy <path>              #   Set firmware policy JSON
  --set-telemetry-policy <path>             #   Set telemetry policy JSON
  --compliance <iec62443|nist-iot|none>     #   Set compliance mode
```

---

## 9. Agent Types

### 9.1 Device Coordinator Agent

```typescript
{
  type: 'iot-device-coordinator',
  name: 'IoT Device Coordinator',
  description: 'Manages device lifecycle: registration, pairing, health monitoring, trust evaluation, and decommissioning. Coordinates device agents within a fleet.',
  defaultConfig: {
    capabilities: [
      'iot:device:discover', 'iot:device:register', 'iot:device:status',
      'iot:device:quarantine', 'iot:device:decommission',
      'iot:fleet:manage', 'iot:trust:evaluate',
    ],
    maxConcurrentTasks: 20,
    priority: 90,
    timeout: 300_000,
  },
  requiredCapabilities: ['iot:device:discover', 'iot:device:register'],
  metadata: { trustAware: true, meshAware: true },
}
```

### 9.2 Fleet Manager Agent

```typescript
{
  type: 'iot-fleet-manager',
  name: 'IoT Fleet Manager',
  description: 'Manages fleet topology, policy enforcement, cross-fleet coordination, and fleet-level health assessment. Maps Cognitum mesh topology to Ruflo swarm topology.',
  defaultConfig: {
    capabilities: [
      'iot:fleet:manage', 'iot:fleet:deploy',
      'iot:device:status', 'iot:device:telemetry:read',
    ],
    maxConcurrentTasks: 10,
    priority: 85,
    timeout: 600_000,
  },
  requiredCapabilities: ['iot:fleet:manage'],
  metadata: { topologyAware: true, complianceAware: true },
}
```

### 9.3 Edge Deployer Agent

```typescript
{
  type: 'iot-edge-deployer',
  name: 'IoT Edge Deployer',
  description: 'Orchestrates firmware deployments with staged rollout, canary verification, anomaly-gated progression, and automatic rollback. Ensures firmware integrity via witness chain verification.',
  defaultConfig: {
    capabilities: [
      'iot:firmware:check', 'iot:firmware:deploy',
      'iot:firmware:fleet-deploy', 'iot:firmware:rollback',
      'iot:witness:read',
    ],
    maxConcurrentTasks: 5,
    priority: 95,    // High priority -- firmware ops are time-sensitive
    timeout: 1_800_000, // 30 minutes for fleet deployments
  },
  requiredCapabilities: ['iot:firmware:deploy'],
  metadata: { deploymentAware: true, rollbackCapable: true },
}
```

### 9.4 Telemetry Analyzer Agent

```typescript
{
  type: 'iot-telemetry-analyzer',
  name: 'IoT Telemetry Analyzer',
  description: 'Ingests telemetry from device vector stores, runs SONA-powered anomaly detection, learns baseline patterns, and triggers remediation workflows when anomalies exceed thresholds.',
  defaultConfig: {
    capabilities: [
      'iot:device:telemetry:read', 'iot:device:telemetry:write',
      'iot:device:status',
    ],
    maxConcurrentTasks: 15,
    priority: 80,
    timeout: 120_000,
  },
  requiredCapabilities: ['iot:device:telemetry:read'],
  metadata: { sonaEnabled: true, hnswEnabled: true, anomalyDetection: true },
}
```

### 9.5 Witness Auditor Agent

```typescript
{
  type: 'iot-witness-auditor',
  name: 'IoT Witness Auditor',
  description: 'Periodically verifies device witness chains for integrity, detects chain gaps or signature failures, and produces compliance audit reports for IEC 62443 and NIST IoT.',
  defaultConfig: {
    capabilities: [
      'iot:witness:read', 'iot:device:status',
    ],
    maxConcurrentTasks: 10,
    priority: 75,
    timeout: 300_000,
  },
  requiredCapabilities: ['iot:witness:read'],
  metadata: { complianceAware: true, auditCapable: true },
}
```

---

## 10. Hooks & Background Workers

### 10.1 Hook Registrations

| Hook | Event | Purpose |
|------|-------|---------|
| `pre-iot-deploy` | Before firmware deployment | Validate trust levels, check claims, verify witness chain integrity |
| `post-iot-deploy` | After firmware deployment | Record deployment result, update trust scores, train SONA patterns |
| `iot-device-discovered` | mDNS or explicit discovery finds a device | Log discovery, check against known device list, auto-register if configured |
| `iot-device-offline` | Device misses heartbeat threshold | Trigger health check sequence, escalate if persistent |
| `iot-anomaly-detected` | Telemetry anomaly exceeds threshold | Route to remediation agent, quarantine if score > 0.9 |
| `iot-trust-change` | Device trust level changes | Log audit event, notify fleet manager, check zone-crossing implications |
| `iot-witness-gap` | Gap detected in witness chain | Alert witness auditor, quarantine device, log critical audit event |
| `iot-firmware-rollback` | Rollback triggered | Log rollback reason, notify fleet manager, update deployment records |
| `iot-mesh-partition` | Mesh partition detected | Alert fleet manager, cross-validate with other peers, log network event |
| `iot-pairing-attempt` | Pairing attempt on any device | Audit log, validate pairing window, check for brute force |

### 10.2 Background Workers

| Worker | Priority | Interval | Description |
|--------|----------|----------|-------------|
| `iot-health-probe` | high | 30s | Active health probes to all registered devices via `status()` endpoint |
| `iot-telemetry-ingest` | normal | configurable (default 60s) | Pull telemetry from device vector stores and store in AgentDB |
| `iot-anomaly-scan` | normal | 5 min | Run SONA anomaly detection on recent telemetry batch |
| `iot-witness-audit` | normal | 1 hour | Verify witness chain integrity for all CERTIFIED+ devices |
| `iot-firmware-watch` | normal | 15 min | Check for firmware updates on all fleets, notify fleet managers |
| `iot-mesh-sync` | normal | 2 min | Sync mesh topology from device network layer to Ruflo swarm view |
| `iot-trust-decay` | low | 1 hour | Apply trust score decay for devices not seen recently |
| `iot-telemetry-prune` | low | daily | Prune telemetry older than retention policy window |

---

## 11. Swarm Coordination

### 11.1 Fleet-as-Swarm Topology

Device fleets map to Ruflo swarms with a natural hierarchical topology:

```
Fleet Level (Ruflo hierarchical swarm)
|
+-- [Fleet Manager Agent] ---- coordinates fleet-level operations
|       |
|       +-- [Device Coordinator Agent] ---- manages device lifecycle
|       |       |
|       |       +-- [DeviceAgent: Seed-A] ---- trust level 3
|       |       +-- [DeviceAgent: Seed-B] ---- trust level 2
|       |       +-- [DeviceAgent: Seed-C] ---- trust level 1
|       |
|       +-- [Telemetry Analyzer Agent] ---- processes telemetry
|       |
|       +-- [Edge Deployer Agent] ---- manages firmware
|       |
|       +-- [Witness Auditor Agent] ---- verifies chains

Device Mesh Level (Cognitum mesh)
|
+-- [Seed-A] ---- mesh ---- [Seed-B] ---- mesh ---- [Seed-C]
     peer_count: 2            peer_count: 2            peer_count: 1
```

The two levels operate semi-independently:
- **Fleet Level** uses Ruflo's swarm coordination (topology, consensus, task assignment).
- **Device Mesh Level** uses Cognitum's mesh networking (closest-first routing, failover, epoch sync).
- The plugin bridges the two: mesh topology changes propagate as swarm topology events; swarm decisions (deploy, quarantine) execute via SeedClient calls.

### 11.2 Multi-Fleet Coordination

For organizations with multiple fleets (e.g., different buildings, regions):

```
[Multi-Fleet Coordinator] ---- hierarchical-mesh topology
      |
      +-- [Fleet: Warehouse-A] ---- hierarchical
      |       +-- 50 devices
      |
      +-- [Fleet: Warehouse-B] ---- hierarchical
      |       +-- 30 devices
      |
      +-- [Fleet: Office-HQ] ---- star
              +-- 10 devices
```

Cross-fleet operations (e.g., "deploy firmware v2.3 to all warehouses") use Ruflo's hive-mind consensus to coordinate across fleet boundaries.

---

## 12. Integration with Existing Ruflo Capabilities

### 12.1 Federation Integration (ADR-078)

Edge Seed devices can federate with cloud Ruflo installations:

```
Edge Installation (on-premise)          Cloud Installation
============================            ==================

[Fleet Manager Agent]                   [Cloud Coordinator Agent]
       |                                         |
       +-- 50 Seed devices                       |
       |                                         |
       v                                         v
[Federation Plugin]                     [Federation Plugin]
       |                                         |
       +---- mTLS federation session ------------+
       |
       v
  PII Pipeline strips device telemetry before
  crossing trust boundary. Only anomaly
  signatures and fleet health summaries cross.
```

The federation plugin's trust model (0-4) operates at the installation level; the IoT plugin's device trust model (UNKNOWN-FLEET_TRUSTED) operates at the device level. Both are independent but complementary -- a device in a FLEET_TRUSTED state on an ATTESTED federation node has effective trust = min(installation_trust, device_trust).

### 12.2 Memory / AgentDB Integration

| AgentDB Feature | IoT Usage |
|-----------------|-----------|
| **HNSW vector search** | Telemetry similarity search: "find all readings similar to this anomaly" in <10ms |
| **Namespace isolation** | 8 dedicated namespaces (iot-devices, iot-telemetry, etc.) prevent collision with other plugins |
| **Pattern store** | Learned anomaly signatures stored as patterns for SONA retrieval |
| **Hierarchical recall** | Fleet -> zone -> device hierarchy for scoped telemetry queries |
| **Causal edges** | Link anomaly detections to their remediation actions for learning |

### 12.3 SONA / Neural Integration

| SONA Feature | IoT Usage |
|-------------|-----------|
| **Pattern learning** | Learn normal telemetry baselines per device and per fleet |
| **Anomaly detection** | SONA's deviation scoring applied to telemetry vectors |
| **Predictive maintenance** | Predict device failures from degradation patterns |
| **Firmware regression detection** | Detect performance degradation after OTA by comparing pre/post baselines |
| **Adaptive thresholds** | Auto-adjust anomaly thresholds per device based on historical false positive rates |

### 12.4 AIDefence Integration

| AIDefence Feature | IoT Usage |
|-------------------|-----------|
| **PII scanning** | Scan telemetry for accidental PII in sensor metadata before AgentDB storage |
| **Threat detection** | Detect injection attempts in MCP tool calls proxied through devices |
| **Learning** | Train on IoT-specific threat patterns (firmware injection, telemetry poisoning) |

### 12.5 Existing Hook Integration

| Existing Hook | IoT Extension |
|--------------|---------------|
| `pre-task` | Check `iot:*` claims before IoT operations |
| `post-task` | Record IoT operation metrics, train patterns |
| `pre-command` | Validate firmware deploy commands against safety rules |
| `post-command` | Track OTA command outcomes for learning |
| `route` | Route IoT tasks to specialized IoT agents |
| `worker dispatch` | Trigger IoT background workers (health-probe, telemetry-ingest) |

---

## 13. Plugin Structure

### 13.1 File Layout

```
v3/@claude-flow/plugin-iot-cognitum/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                           # Plugin entry point
    plugin.ts                          # IoTCognitumPlugin class (ClaudeFlowPlugin)
    mcp-tools.ts                       # MCP tool definitions (18 tools)
    cli-commands.ts                    # CLI command definitions (30+ commands)

    domain/
      entities/
        device-agent.ts                # DeviceAgent entity
        device-fleet.ts                # DeviceFleet entity
        telemetry-reading.ts           # TelemetryReading entity
        firmware-deployment.ts         # FirmwareDeployment entity
        device-trust-level.ts          # DeviceTrustLevel value object
      services/
        device-lifecycle-service.ts    # Device registration, pairing, health
        telemetry-ingestion-service.ts # Telemetry pull, anomaly detection
        firmware-orchestration-service.ts # Staged firmware deployment
        fleet-topology-service.ts      # Fleet management, mesh sync
        witness-verification-service.ts # Witness chain verification
      repositories/
        device-repository.ts           # Device persistence interface
        fleet-repository.ts            # Fleet persistence interface
        telemetry-repository.ts        # Telemetry persistence interface
        firmware-repository.ts         # Firmware deployment persistence
        audit-repository.ts            # IoT audit persistence

    application/
      iot-coordinator.ts               # Orchestrates all IoT operations
      device-trust-evaluator.ts        # Device trust scoring
      anomaly-detection-engine.ts      # SONA-powered anomaly detection
      firmware-rollout-engine.ts       # Staged rollout state machine

    infrastructure/
      cognitum/
        seed-client-factory.ts         # SeedClient creation and management
        cloud-control-plane.ts         # Cognitum Cloud API wrapper
        discovery-adapter.ts           # Adapts SDK discovery to Ruflo
      persistence/
        agentdb-device-repository.ts   # AgentDB-backed device storage
        agentdb-fleet-repository.ts    # AgentDB-backed fleet storage
        agentdb-telemetry-repository.ts # AgentDB-backed telemetry (HNSW)
        agentdb-firmware-repository.ts # AgentDB-backed firmware records
        agentdb-audit-repository.ts    # AgentDB-backed audit storage
      transport/
        mesh-bridge.ts                 # Bridges Cognitum mesh to Ruflo swarm
        health-probe-adapter.ts        # Adapts SDK health probes to workers

    api/
      hooks.ts                         # Hook registrations (10 hooks)
      workers.ts                       # Background worker definitions (8 workers)

  __tests__/
    unit/
      device-lifecycle-service.test.ts
      telemetry-ingestion-service.test.ts
      firmware-orchestration-service.test.ts
      device-trust-evaluator.test.ts
      anomaly-detection-engine.test.ts
      witness-verification-service.test.ts
    integration/
      device-registration-flow.test.ts
      firmware-deployment-flow.test.ts
      telemetry-anomaly-flow.test.ts
      fleet-topology-sync.test.ts
    acceptance/
      iot-compliance-iec62443.test.ts
      iot-compliance-nist.test.ts
```

### 13.2 Plugin Registration

```typescript
export class IoTCognitumPlugin implements ClaudeFlowPlugin {
  readonly name = '@claude-flow/plugin-iot-cognitum';
  readonly version = '1.0.0-alpha.1';
  readonly description = 'Cognitum Seed IoT device fleet management with agent-device duality';
  readonly author = 'Claude Flow Team';
  readonly dependencies = ['@claude-flow/security', '@claude-flow/memory'];

  readonly permissions: PluginPermissions = {
    network: true,       // SeedClient HTTP/TLS connections
    memory: true,        // AgentDB for telemetry, device state
    mcp: true,           // MCP tool registration
    agents: true,        // Agent type registration
  };

  readonly trustLevel: PluginTrustLevel = 'official';

  async initialize(context: PluginContext): Promise<void> {
    // 1. Read config: API key, discovery mode, TLS settings
    // 2. Initialize SeedClientFactory
    // 3. Initialize CloudControlPlane (if API key provided)
    // 4. Create domain services
    // 5. Create IoTCoordinator
    // 6. Register IoT claim types with @claude-flow/claims
    // 7. Register hooks and background workers
    // 8. Register CLI commands and MCP tools
    // 9. Start health probe worker
  }

  async shutdown(): Promise<void> {
    // 1. Stop all background workers
    // 2. Close all SeedClient connections
    // 3. Flush remaining telemetry to AgentDB
    // 4. Ship remaining audit logs
  }

  registerMCPTools(): MCPToolDefinition[] { /* 18 tools */ }
  registerCLICommands(): CLICommandDefinition[] { /* 30+ commands */ }
  registerAgentTypes(): AgentTypeDefinition[] { /* 5 agent types */ }
  async healthCheck(): Promise<boolean> { /* coordinator status */ }
}
```

### 13.3 package.json

```json
{
  "name": "@claude-flow/plugin-iot-cognitum",
  "version": "1.0.0-alpha.1",
  "description": "Cognitum Seed IoT device fleet management for Claude Flow",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cognitum-one/sdk": "^0.2.1",
    "@claude-flow/shared": "workspace:*",
    "@claude-flow/security": "workspace:*",
    "@claude-flow/memory": "workspace:*"
  },
  "peerDependencies": {
    "multicast-dns": "^7.2.5"
  },
  "peerDependenciesMeta": {
    "multicast-dns": {
      "optional": true
    }
  },
  "devDependencies": {
    "@types/node": "^25.6.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  },
  "engines": {
    "node": ">=18"
  },
  "license": "MIT",
  "keywords": [
    "claude-flow",
    "cognitum",
    "iot",
    "seed",
    "fleet-management",
    "device-management",
    "mcp",
    "ai-agents"
  ]
}
```

---

## 14. Delivery Plan

### Phase 1: Foundation (Weeks 1-3) -- "One Device"

**Goal:** Plugin skeleton, single device registration, status monitoring, trust scoring.

**Deliverables:**
- Plugin structure with `ClaudeFlowPlugin` implementation
- `SeedClientFactory` wrapping `@cognitum-one/sdk` v0.2.1
- `DeviceLifecycleService`: register, pair, unpair, status, heartbeat
- `DeviceTrustEvaluator` with 6-component scoring formula
- AgentDB repositories for devices and trust history
- CLI: `iot init`, `iot device register`, `iot device list`, `iot device status`
- MCP: `iot_device_register`, `iot_device_status`, `iot_device_pair`
- Agent type: `iot-device-coordinator`
- Unit tests: device lifecycle (100% coverage), trust scoring
- Background worker: `iot-health-probe` (30s interval via SDK `status()`)

**Success Criteria:**
- Register a Cognitum Seed device via endpoint URL
- Pair using `pair.create()` and establish trust level REGISTERED
- Health probe detects online/offline transitions within 60s
- Trust score computed from all 6 components
- Plugin loads via `PluginLoader` without errors

**Integration Points:**
- `@cognitum-one/sdk`: `SeedClient`, `SeedClientOptions`, `StatusResource`, `PairResource`, `IdentityResource`
- `@claude-flow/shared`: `ClaudeFlowPlugin`, `PluginContext`
- `@claude-flow/memory`: AgentDB for device state
- `@claude-flow/security`: `TokenGenerator` for generating client names

### Phase 2: Telemetry & Anomaly Detection (Weeks 4-6) -- "Seeing Patterns"

**Goal:** Ingest telemetry from device vector stores, run anomaly detection, store patterns in HNSW.

**Deliverables:**
- `TelemetryIngestionService`: query device stores, batch ingest to AgentDB
- `AnomalyDetectionEngine`: SONA-powered anomaly scoring with 6 anomaly types
- Telemetry baseline computation per device and per fleet
- AgentDB HNSW-indexed telemetry repository
- CLI: `iot telemetry query`, `iot telemetry anomalies`, `iot telemetry baseline`
- MCP: `iot_telemetry_query`, `iot_telemetry_ingest`, `iot_telemetry_anomalies`, `iot_telemetry_baseline`
- Agent type: `iot-telemetry-analyzer`
- Hooks: `iot-anomaly-detected` (triggers quarantine/alert)
- Workers: `iot-telemetry-ingest` (configurable interval), `iot-anomaly-scan` (5 min)
- Integration test: ingest from live/mocked Seed, detect injected anomaly

**Success Criteria:**
- Query device vector store via `store.query()` and ingest results to AgentDB
- HNSW similarity search returns related telemetry in <10ms
- Anomaly detection correctly identifies all 6 anomaly types on synthetic data
- Baseline computation produces stable reference within 7 days of data
- Anomaly above threshold auto-triggers quarantine hook

**Integration Points:**
- `@cognitum-one/sdk`: `StoreResource` (query, ingest, status)
- `@claude-flow/memory`: AgentDB HNSW indexing for telemetry vectors
- `@claude-flow/hooks`: Neural pattern hooks for SONA learning

### Phase 3: Fleet Management & Firmware (Weeks 7-10) -- "Managing Fleets"

**Goal:** Fleet topology, firmware orchestration with staged rollout, witness chain verification.

**Deliverables:**
- `FleetTopologyService`: create/manage fleets, sync mesh topology
- `FirmwareOrchestrationService`: staged rollout engine (canary -> rolling -> complete)
- `FirmwareRolloutEngine`: state machine with anomaly-gated stage advancement
- `WitnessVerificationService`: Ed25519 chain verification, gap detection
- Mesh bridge: Cognitum `mesh.status()` / `mesh.peers()` -> Ruflo swarm topology
- CLI: full `iot fleet *`, `iot firmware *`, `iot witness *` command suites
- MCP: `iot_fleet_*`, `iot_firmware_*`, `iot_witness_*` tools
- Agent types: `iot-fleet-manager`, `iot-edge-deployer`, `iot-witness-auditor`
- Hooks: `pre-iot-deploy`, `post-iot-deploy`, `iot-witness-gap`, `iot-firmware-rollback`
- Workers: `iot-firmware-watch`, `iot-mesh-sync`, `iot-witness-audit`
- Integration test: 3-device fleet, canary deploy, verify rollback on anomaly

**Success Criteria:**
- Create fleet, add 3+ devices, observe mesh topology sync
- Canary firmware deployment to 10% of fleet, verify health, advance to full rollout
- Automatic rollback when anomaly score exceeds threshold during canary
- Witness chain verification detects injected gap
- Mesh partition triggers alert within 2 mesh-sync intervals

**Integration Points:**
- `@cognitum-one/sdk`: `OtaResource`, `MeshResource`, `WitnessResource`, `CustodyResource`
- `@claude-flow/swarm`: Swarm topology mapping
- `@claude-flow/guidance/authority`: AuthorityGate for fleet-wide deploys

### Phase 4: Compliance & Federation (Weeks 11-14) -- "Enterprise Ready"

**Goal:** IEC 62443 compliance, NIST IoT framework, federation integration, cloud control plane.

**Deliverables:**
- IEC 62443 zone enforcement with zone-crossing policies
- NIST IoT framework mapping with compliance audit reports
- Federation bridge: edge fleet -> cloud installation via ADR-078 trust model
- `CloudControlPlane`: Cognitum Cloud API integration for fleet-level ops
- mDNS discovery integration (`@cognitum-one/sdk/seed/discovery/mdns`)
- Tailscale discovery integration
- Compliance audit CLI: `iot audit --compliance iec62443`
- Workers: `iot-trust-decay`, `iot-telemetry-prune`
- Acceptance tests: IEC 62443 zone isolation, NIST function coverage

**Success Criteria:**
- Zone-crossing policy blocks unauthorized cross-zone telemetry
- Compliance audit report passes IEC 62443 FR1-FR7 checklist
- Edge fleet federates with cloud installation; only anomaly signatures cross boundary
- mDNS discovers Seed devices on LAN within 5 seconds
- Cloud control plane registers devices and checks firmware updates

**Integration Points:**
- `@claude-flow/plugin-agent-federation`: Trust model, PII pipeline
- `@claude-flow/aidefence`: Telemetry PII scanning
- `@cognitum-one/sdk`: `Cognitum` (cloud client), `MdnsDiscovery`, `TailscaleDiscovery`

### Phase 5: Production Hardening (Weeks 15-18) -- "Ship It"

**Goal:** Performance, reliability, distribution, documentation.

**Deliverables:**
- Performance optimization: <50ms telemetry ingest, <10ms HNSW search
- Rate limiting per device (respect SDK's ADR-0005 retry/rate-limit)
- Circuit breaker for unhealthy devices (integrates with SDK's PeerSet health)
- Load test: 100 devices, 1000 telemetry readings/minute
- IPFS registry entry for plugin distribution
- npm publish as `@claude-flow/plugin-iot-cognitum`
- Skills: Claude Code skills for common IoT workflows

**Success Criteria:**
- Telemetry ingest p99 <50ms at 1000 readings/min across 100 devices
- HNSW search p99 <10ms for telemetry similarity
- Zero data loss in 24-hour soak test with device churn
- All tests green (unit, integration, acceptance, load)
- Plugin installable via `npx @claude-flow/cli plugins install @claude-flow/plugin-iot-cognitum`

---

## 15. Validation Benchmark

### Test Scenario

```
Setup:
  - Fleet A: 10 Seed devices (simulated), firmware v1.0, healthy baseline
  - Fleet B: 5 Seed devices (simulated), firmware v1.0, healthy baseline
  - 1 device in Fleet A will be injected with anomalous telemetry
  - 1 device in Fleet A will receive firmware v2.0 (canary)

Phase 1: Baseline Establishment
  - All 15 devices produce telemetry for 10 minutes (simulated time)
  - Baseline computed for both fleets
  - Verify: all devices reach trust level PROVISIONED (2)
  - Verify: anomaly scores < 0.3 for all devices

Phase 2: Anomaly Injection
  - Device A-7 produces anomalous telemetry (spike + drift)
  - Verify: anomaly detected within 2 scan intervals
  - Verify: iot-anomaly-detected hook fires
  - Verify: device A-7 quarantined automatically
  - Verify: fleet A health report shows 9/10 healthy
  - Verify: device A-7 trust score drops below downgrade threshold

Phase 3: Canary Firmware Deploy
  - Deploy firmware v2.0 to Fleet A with canary strategy (10% = 1 device)
  - Verify: only 1 device (A-1) receives update
  - Verify: pre-iot-deploy hook validates trust levels
  - Device A-1 produces healthy telemetry post-update
  - Verify: canary stage advances after configured duration
  - Rolling deployment proceeds to remaining healthy devices (8, excluding quarantined A-7)
  - Verify: all 8 devices report firmware v2.0
  - Verify: witness chains updated with firmware change entries

Phase 4: Firmware Regression Detection
  - Device A-3 (post-update) starts producing anomalous telemetry
  - Verify: firmware regression detected by SONA pattern comparison
  - Verify: rollback triggered for device A-3
  - Verify: A-3 returns to firmware v1.0
  - Verify: audit trail contains complete deployment + rollback record

Phase 5: Witness Chain Integrity
  - Verify: all device witness chains are contiguous
  - Verify: witness.chain() entries match expected epoch sequence
  - Verify: compliance audit for IEC 62443 FR3 (integrity) passes

Pass criteria: All verify statements pass.
```

---

## 16. Failure Modes & Mitigations

| Failure Mode | Probability | Impact | Mitigation |
|-------------|------------|--------|------------|
| **Device network unreachable** | High | Medium | SDK's PeerSet failover + mesh routing. Mark peer degraded after 3 failures; cycle to next. Health probe detects within 30s. |
| **mDNS discovery returns 0 peers** | Medium | Medium | Fall back to explicit endpoints. SDK preserves previous PeerSet when discovery returns empty (SeedClient.rediscover() semantics). |
| **OTA bricks a device** | Low | Critical | Canary strategy limits blast radius. Anomaly detection during canary gates fleet rollout. Automatic rollback on anomaly > threshold. |
| **Telemetry vector dimension mismatch** | Medium | Low | Validate dimension against `store.status().dimension` before ingest. Reject with clear error. |
| **Trust score oscillation** | Medium | Low | Hysteresis thresholds with min-duration gates prevent rapid up/down cycling. |
| **AgentDB storage exhaustion** | Low | Medium | `iot-telemetry-prune` worker enforces retention policy. Monitor via `memory stats` CLI. |
| **SeedClient auth 3-strike lockout** | Low | Medium | SDK's `TrustScoreBlockedError` surfaces clearly. `resetTrustScore()` after token rotation. Plugin logs lockout as critical audit event. |
| **Mesh partition (split brain)** | Low | High | Cross-validate mesh status from multiple peers. Quorum check before fleet-wide operations. Partition event triggers human alert. |
| **Witness chain signature forgery** | Very Low | Critical | Ed25519 signatures are computationally infeasible to forge. Witness chain gaps are detected and trigger immediate quarantine. |
| **Over-engineering compliance** | Medium | Medium | Ship IEC 62443 zones as zone ID strings first. Full zone-crossing policy enforcement in Phase 4. Let operators pull us toward complexity. |

---

## 17. What Makes This Novel

1. **Device-agent duality** -- No agent framework treats physical devices as first-class swarm peers with the same trust model, capability gating, and coordination patterns as software agents.

2. **Vector store federation** -- The Cognitum Seed's on-device HNSW store extends AgentDB's memory. A query that starts in Claude Code can search across both software agent memory and physical device sensor data in a single HNSW traversal.

3. **Firmware-as-deployment** -- OTA firmware updates follow the same staged rollout, canary verification, and anomaly-gated progression as software deployments. The infrastructure is unified.

4. **Witness chain + audit** -- The Seed's Ed25519 witness chain provides hardware-rooted cryptographic provenance. Combined with Ruflo's software audit service, every operation from "agent decided to update firmware" to "device confirmed new firmware epoch" has a verifiable chain.

5. **IoT trust scoring** -- A continuous trust score that combines pairing integrity, firmware currency, uptime, witness chain integrity, anomaly history, and mesh participation. No IoT platform does this with the granularity of per-component scoring and hysteresis-protected transitions.

6. **Compliance as code** -- IEC 62443 zones, NIST IoT framework functions, and Matter protocol semantics are not bolted-on checklists. They are structural properties of the domain model: zones are fleet attributes, FRs map to capabilities, commissioning is pair.create().

---

## 18. Integration Points Summary

| Component | Existing File / Package | Integration |
|-----------|------------------------|-------------|
| Plugin interface | `shared/src/plugin-interface.ts` | Implements `ClaudeFlowPlugin` |
| Plugin loader | `shared/src/plugin-loader.ts` | Loaded via `PluginLoader.loadPlugin()` |
| Cognitum SDK | `@cognitum-one/sdk` v0.2.1 | `SeedClient`, `Cognitum`, discovery providers |
| Security module | `security/src/index.ts` | `TokenGenerator` for client name generation |
| Memory / AgentDB | `memory/src/index.ts` | 8 namespaces, HNSW-indexed telemetry |
| Claims | `claims/src/domain/types.ts` | 15 `iot:*` claim types |
| Authority gate | `guidance/src/authority.ts` | Fleet-wide deploys, decommission require human authority |
| Hooks system | `hooks/src/index.ts` | 10 IoT-specific hooks |
| Neural / SONA | `neural/src/index.ts` | Anomaly detection, baseline learning |
| AIDefence | `aidefence/src/index.ts` | PII scanning on telemetry, threat detection |
| Federation plugin | `plugin-agent-federation/src/index.ts` | Edge-cloud device federation |
| Plugin discovery | `cli/src/plugins/store/discovery.ts` | IPFS registry entry |
| Swarm coordination | `swarm/src/index.ts` | Fleet-as-swarm topology mapping |

---

## 19. Consequences

**Positive:**
- Claude Flow becomes the first agent framework with native IoT device fleet management.
- Every Cognitum Seed becomes a Ruflo agent, unifying the physical and software agent mesh.
- SONA learns from device behavior, enabling predictive maintenance without custom ML pipelines.
- Compliance (IEC 62443, NIST IoT) is structural, not a checklist bolted on after the fact.
- The device trust model closes the gap between "is this device healthy?" and "should this device be trusted?"

**Negative:**
- Network reliability is lower for physical devices than software agents. Health probes add overhead.
- The SDK's `undici` dependency adds ~1MB to the plugin; acceptable for a device management plugin.
- mDNS discovery requires the optional `multicast-dns` peer dependency. Explicit endpoints work without it.
- Firmware deployment is inherently risky. The canary + rollback mitigation reduces but does not eliminate bricking risk.

**Neutral:**
- The Cognitum SDK is at v0.2.1 -- early but stable (201 passing tests, wire-verified against live hardware). SDK breaking changes will require plugin updates.
- Device fleet sizes vary from 5 to 5000. The plugin architecture supports both but Phase 5 load testing targets 100 devices.
- Cloud control plane integration is optional. The plugin works fully offline with direct SeedClient connections.
