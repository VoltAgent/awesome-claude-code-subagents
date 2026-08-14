import type {
  ClaudeFlowPlugin,
  PluginContext,
  MCPToolDefinition,
  CLICommandDefinition,
  AgentTypeDefinition,
} from '@claude-flow/shared/src/plugin-interface.js';

import { IoTCoordinator } from './application/iot-coordinator.js';
import { HealthProbeWorker } from './workers/health-probe-worker.js';
import { TelemetryIngestWorker } from './workers/telemetry-ingest-worker.js';
import { AnomalyScanWorker } from './workers/anomaly-scan-worker.js';
import { MeshSyncWorker } from './workers/mesh-sync-worker.js';
import { FirmwareWatchWorker } from './workers/firmware-watch-worker.js';
import { WitnessAuditWorker } from './workers/witness-audit-worker.js';
import { InMemoryDeviceRepository } from './infrastructure/in-memory-device-repository.js';
import { InMemoryTrustHistoryRepository } from './infrastructure/in-memory-trust-history-repository.js';
import { InMemoryFleetRepository } from './infrastructure/in-memory-fleet-repository.js';
import { createMcpTools } from './mcp-tools.js';
import { createCliCommands } from './cli-commands.js';

export class IoTCognitumPlugin implements ClaudeFlowPlugin {
  readonly name = '@claude-flow/plugin-iot-cognitum';
  readonly version = '1.0.0-alpha.1';
  readonly description = 'IoT Cognitum Seed device-agent bridge';
  readonly author = 'Claude Flow Team';
  readonly dependencies = ['@claude-flow/shared'];

  private coordinator: IoTCoordinator | null = null;
  private healthProbe: HealthProbeWorker | null = null;
  private telemetryIngest: TelemetryIngestWorker | null = null;
  private anomalyScan: AnomalyScanWorker | null = null;
  private meshSync: MeshSyncWorker | null = null;
  private firmwareWatch: FirmwareWatchWorker | null = null;
  private witnessAudit: WitnessAuditWorker | null = null;
  private context: PluginContext | null = null;

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    const config = context.config;
    const defaultFleetId = (config['fleetId'] as string) ?? 'default';
    const defaultZoneId = (config['zoneId'] as string) ?? 'zone-0';
    const insecure = (config['tlsInsecure'] as boolean) ?? true;

    this.coordinator = new IoTCoordinator({
      defaultFleetId,
      defaultZoneId,
      defaultTls: { insecure },
      deviceRepository: new InMemoryDeviceRepository(),
      trustHistoryRepository: new InMemoryTrustHistoryRepository(),
      fleetRepository: new InMemoryFleetRepository(),
    }, {
      onDeviceRegistered: (device) => {
        context.logger.info(`Device registered: ${device.deviceId} at ${device.endpoint}`);
        context.eventBus.emit('iot:device-registered', device);
      },
      onTrustChange: (deviceId, oldLevel, newLevel) => {
        context.logger.info(`Trust change for ${deviceId}: ${oldLevel} -> ${newLevel}`);
        context.eventBus.emit('iot:trust-change', { deviceId, oldLevel, newLevel });
      },
    });

    context.services.register('iot:coordinator', this.coordinator);

    const healthIntervalMs = (config['healthIntervalMs'] as number) ?? 30_000;
    this.healthProbe = new HealthProbeWorker(this.coordinator, {
      intervalMs: healthIntervalMs,
      onDeviceOffline: (deviceId) => {
        context.logger.warn(`Device offline: ${deviceId}`);
        context.eventBus.emit('iot:device-offline', { deviceId });
      },
      onDeviceOnline: (deviceId) => {
        context.logger.info(`Device back online: ${deviceId}`);
        context.eventBus.emit('iot:device-online', { deviceId });
      },
    });
    this.healthProbe.start();

    const telemetryIntervalMs = (config['telemetryIntervalMs'] as number) ?? 60_000;
    this.telemetryIngest = new TelemetryIngestWorker(this.coordinator, {
      intervalMs: telemetryIntervalMs,
      onIngestionComplete: (deviceId, vectorCount) => {
        context.logger.debug(`Telemetry ingest for ${deviceId}: ${vectorCount} vectors`);
      },
      onIngestionError: (deviceId, error) => {
        context.logger.warn(`Telemetry ingest error for ${deviceId}: ${error.message}`);
      },
    });
    this.telemetryIngest.start();

    const anomalyScanIntervalMs = (config['anomalyScanIntervalMs'] as number) ?? 300_000;
    this.anomalyScan = new AnomalyScanWorker(this.coordinator, {
      intervalMs: anomalyScanIntervalMs,
      onAnomalyDetected: (deviceId, score) => {
        context.logger.warn(`Anomaly detected on ${deviceId}: trust score ${score.toFixed(3)}`);
        context.eventBus.emit('iot:anomaly-detected', { deviceId, score });
      },
      onScanError: (deviceId, error) => {
        context.logger.warn(`Anomaly scan error for ${deviceId}: ${error.message}`);
      },
    });
    this.anomalyScan.start();

    const meshSyncIntervalMs = (config['meshSyncIntervalMs'] as number) ?? 120_000;
    this.meshSync = new MeshSyncWorker(this.coordinator, {
      intervalMs: meshSyncIntervalMs,
      onMeshPartition: (deviceId, peerCount) => {
        context.logger.warn(`Mesh partition detected for ${deviceId}: ${peerCount} peers`);
        context.eventBus.emit('iot:mesh-partition', { deviceId, peerCount });
      },
      onSyncError: (deviceId, error) => {
        context.logger.warn(`Mesh sync error for ${deviceId}: ${error.message}`);
      },
    });
    this.meshSync.start();

    const firmwareWatchIntervalMs = (config['firmwareWatchIntervalMs'] as number) ?? 300_000;
    this.firmwareWatch = new FirmwareWatchWorker(this.coordinator, {
      intervalMs: firmwareWatchIntervalMs,
      onVersionMismatch: (deviceId, expected, actual) => {
        context.logger.warn(`Firmware mismatch on ${deviceId}: expected ${expected}, got ${actual}`);
        context.eventBus.emit('iot:firmware-mismatch', { deviceId, expected, actual });
      },
      onWatchError: (deviceId, error) => {
        context.logger.warn(`Firmware watch error for ${deviceId}: ${error.message}`);
      },
    });
    this.firmwareWatch.start();

    const witnessAuditIntervalMs = (config['witnessAuditIntervalMs'] as number) ?? 600_000;
    this.witnessAudit = new WitnessAuditWorker(this.coordinator, {
      intervalMs: witnessAuditIntervalMs,
      onGapDetected: (deviceId, fromEpoch, toEpoch) => {
        context.logger.warn(`Witness chain gap on ${deviceId}: epoch ${fromEpoch} → ${toEpoch}`);
        context.eventBus.emit('iot:witness-gap', { deviceId, fromEpoch, toEpoch });
      },
      onAuditError: (deviceId, error) => {
        context.logger.warn(`Witness audit error for ${deviceId}: ${error.message}`);
      },
    });
    this.witnessAudit.start();

    context.logger.info('IoT Cognitum plugin initialized');
  }

  async shutdown(): Promise<void> {
    if (this.witnessAudit) {
      this.witnessAudit.stop();
      this.witnessAudit = null;
    }
    if (this.firmwareWatch) {
      this.firmwareWatch.stop();
      this.firmwareWatch = null;
    }
    if (this.meshSync) {
      this.meshSync.stop();
      this.meshSync = null;
    }
    if (this.anomalyScan) {
      this.anomalyScan.stop();
      this.anomalyScan = null;
    }
    if (this.telemetryIngest) {
      this.telemetryIngest.stop();
      this.telemetryIngest = null;
    }
    if (this.healthProbe) {
      this.healthProbe.stop();
      this.healthProbe = null;
    }
    if (this.coordinator) {
      await this.coordinator.shutdown();
      this.coordinator = null;
    }
    this.context?.logger.info('IoT Cognitum plugin shut down');
    this.context = null;
  }

  registerMCPTools(): MCPToolDefinition[] {
    return createMcpTools(() => this.coordinator, () => this.context);
  }

  registerCLICommands(): CLICommandDefinition[] {
    return createCliCommands(() => this.coordinator, () => this.context);
  }

  registerAgentTypes(): AgentTypeDefinition[] {
    return [
      {
        type: 'device-coordinator',
        name: 'Device Coordinator',
        description: 'Manages Cognitum Seed device fleet as Ruflo agent swarm members',
        defaultConfig: {
          id: '',
          name: 'device-coordinator',
          type: 'coordinator',
          capabilities: ['iot:discover', 'iot:register', 'iot:monitor', 'iot:deploy'],
          maxConcurrentTasks: 10,
          priority: 85,
          timeout: 300_000,
          metadata: { pluginSource: '@claude-flow/plugin-iot-cognitum' },
        },
        requiredCapabilities: ['iot:discover', 'iot:register'],
        metadata: { trustAware: true, meshAware: true },
      },
      {
        type: 'telemetry-analyzer',
        name: 'Telemetry Analyzer',
        description: 'Analyzes Cognitum Seed device telemetry for anomalies and drift patterns',
        defaultConfig: {
          id: '',
          name: 'telemetry-analyzer',
          type: 'analyzer',
          capabilities: ['iot:telemetry', 'iot:anomaly-detect', 'iot:baseline'],
          maxConcurrentTasks: 5,
          priority: 75,
          timeout: 120_000,
          metadata: { pluginSource: '@claude-flow/plugin-iot-cognitum' },
        },
        requiredCapabilities: ['iot:telemetry'],
        metadata: { anomalyAware: true, baselineAware: true },
      },
      {
        type: 'fleet-manager',
        name: 'Fleet Manager',
        description: 'Manages device fleets, firmware rollouts, and fleet-wide policies',
        defaultConfig: {
          id: '',
          name: 'fleet-manager',
          type: 'coordinator',
          capabilities: ['iot:fleet-create', 'iot:fleet-manage', 'iot:firmware-deploy', 'iot:firmware-rollback'],
          maxConcurrentTasks: 8,
          priority: 90,
          timeout: 600_000,
          metadata: { pluginSource: '@claude-flow/plugin-iot-cognitum' },
        },
        requiredCapabilities: ['iot:fleet-create', 'iot:fleet-manage'],
        metadata: { firmwareAware: true, rolloutAware: true },
      },
      {
        type: 'witness-auditor',
        name: 'Witness Chain Auditor',
        description: 'Verifies Ed25519 witness chain integrity and detects provenance gaps',
        defaultConfig: {
          id: '',
          name: 'witness-auditor',
          type: 'auditor',
          capabilities: ['iot:witness-verify', 'iot:witness-audit', 'iot:custody-check'],
          maxConcurrentTasks: 3,
          priority: 70,
          timeout: 180_000,
          metadata: { pluginSource: '@claude-flow/plugin-iot-cognitum' },
        },
        requiredCapabilities: ['iot:witness-verify'],
        metadata: { cryptoAware: true, auditAware: true },
      },
    ];
  }

  async healthCheck(): Promise<boolean> {
    return this.coordinator !== null;
  }
}
