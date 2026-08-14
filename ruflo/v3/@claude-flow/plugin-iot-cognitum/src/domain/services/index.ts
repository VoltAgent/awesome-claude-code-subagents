export {
  DeviceLifecycleService,
  type DeviceLifecycleDeps,
} from './device-lifecycle-service.js';

export {
  TelemetryService,
  type TelemetryServiceDeps,
  type StoreQueryResult,
  type IngestResult,
  type StoreHealthStatus,
} from './telemetry-service.js';

export {
  MeshService,
  type MeshServiceDeps,
  type MeshPeer,
  type MeshTopology,
} from './mesh-service.js';

export {
  AnomalyDetectionService,
  type AnomalyDetectionConfig,
  type TelemetryBaseline,
} from './anomaly-detection-service.js';

export {
  TelemetryIngestionService,
  type TelemetryIngestionDeps,
  type IngestionResult,
} from './telemetry-ingestion-service.js';

export {
  FleetTopologyService,
  type CreateFleetOptions,
  type FleetSummary,
} from './fleet-topology-service.js';

export {
  FirmwareOrchestrationService,
  type FirmwareOrchestrationDeps,
  type FirmwareRollout,
  type RolloutStage,
} from './firmware-orchestration-service.js';

export {
  WitnessVerificationService,
  type WitnessVerificationDeps,
  type WitnessVerificationResult,
  type WitnessEntry,
  type WitnessGap,
} from './witness-verification-service.js';

export {
  SONAIntegrationService,
  type SONAClient,
  type SONAIntegrationConfig,
} from './sona-integration-service.js';
