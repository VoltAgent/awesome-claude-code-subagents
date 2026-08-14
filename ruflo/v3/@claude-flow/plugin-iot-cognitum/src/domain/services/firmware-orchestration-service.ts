import type { DeploymentStrategy, FirmwarePolicy } from '../entities/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RolloutStage =
  | 'pending'
  | 'canary'
  | 'rolling'
  | 'complete'
  | 'rolled-back'
  | 'failed';

export interface FirmwareRollout {
  rolloutId: string;
  fleetId: string;
  firmwareVersion: string;
  strategy: DeploymentStrategy;
  stage: RolloutStage;
  targetDeviceIds: string[];
  canaryDeviceIds: string[];
  completedDeviceIds: string[];
  failedDeviceIds: string[];
  anomalyThreshold: number;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface FirmwareOrchestrationDeps {
  getDeviceFirmwareVersion: (deviceId: string) => Promise<string>;
  deployFirmware: (
    deviceId: string,
    version: string,
  ) => Promise<{ success: boolean; error?: string }>;
  getDeviceAnomalyScore: (deviceId: string) => Promise<number>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * State-machine-based firmware rollout engine.
 *
 * Lifecycle: pending -> canary -> rolling -> complete
 *                         |                     |
 *                    rolled-back              failed
 */
export class FirmwareOrchestrationService {
  private readonly rollouts = new Map<string, FirmwareRollout>();
  private rolloutCounter = 0;

  constructor(private readonly deps: FirmwareOrchestrationDeps) {}

  /**
   * Create a new rollout.  Canary devices are selected as the first N%
   * of `targetDeviceIds` based on `policy.canaryPercentage`.
   */
  createRollout(
    fleetId: string,
    firmwareVersion: string,
    targetDeviceIds: string[],
    policy: FirmwarePolicy,
  ): FirmwareRollout {
    const rolloutId = `rollout-${fleetId}-${Date.now()}-${this.rolloutCounter++}`;

    const canaryCount = Math.max(
      1,
      Math.ceil(targetDeviceIds.length * (policy.canaryPercentage / 100)),
    );
    const canaryDeviceIds = targetDeviceIds.slice(0, canaryCount);

    const rollout: FirmwareRollout = {
      rolloutId,
      fleetId,
      firmwareVersion,
      strategy: 'canary',
      stage: 'pending',
      targetDeviceIds,
      canaryDeviceIds,
      completedDeviceIds: [],
      failedDeviceIds: [],
      anomalyThreshold: policy.rollbackOnAnomalyThreshold,
      startedAt: new Date(),
      updatedAt: new Date(),
    };

    this.rollouts.set(rolloutId, rollout);
    return rollout;
  }

  /**
   * Advance the rollout through its state machine:
   *   pending   -> canary   (deploy to canary devices)
   *   canary    -> rolling  (anomaly check passes)
   *   canary    -> rolled-back (anomaly check fails)
   *   rolling   -> complete (deploy to remaining devices)
   */
  async advanceRollout(rolloutId: string): Promise<FirmwareRollout> {
    const rollout = this.getExistingRollout(rolloutId);

    switch (rollout.stage) {
      case 'pending':
        return this.transitionPendingToCanary(rollout);
      case 'canary':
        return this.transitionCanaryToNextStage(rollout);
      case 'rolling':
        return this.transitionRollingToComplete(rollout);
      default:
        return rollout;
    }
  }

  /**
   * Force-rollback a rollout regardless of current stage.
   */
  rollbackRollout(rolloutId: string): FirmwareRollout {
    const rollout = this.getExistingRollout(rolloutId);
    rollout.stage = 'rolled-back';
    rollout.updatedAt = new Date();
    return rollout;
  }

  /**
   * Retrieve a rollout by ID.  Throws if not found.
   */
  getRollout(rolloutId: string): FirmwareRollout {
    return this.getExistingRollout(rolloutId);
  }

  /**
   * List rollouts, optionally filtered by fleet ID.
   */
  listRollouts(fleetId?: string): FirmwareRollout[] {
    const all = Array.from(this.rollouts.values());
    if (fleetId === undefined) return all;
    return all.filter((r) => r.fleetId === fleetId);
  }

  // ---------------------------------------------------------------------------
  // State-machine transitions
  // ---------------------------------------------------------------------------

  private async transitionPendingToCanary(
    rollout: FirmwareRollout,
  ): Promise<FirmwareRollout> {
    await this.deployToDevices(
      rollout,
      rollout.canaryDeviceIds,
      rollout.firmwareVersion,
    );
    rollout.stage = 'canary';
    rollout.updatedAt = new Date();
    return rollout;
  }

  private async transitionCanaryToNextStage(
    rollout: FirmwareRollout,
  ): Promise<FirmwareRollout> {
    for (const deviceId of rollout.canaryDeviceIds) {
      const score = await this.deps.getDeviceAnomalyScore(deviceId);
      if (score > rollout.anomalyThreshold) {
        rollout.stage = 'rolled-back';
        rollout.updatedAt = new Date();
        return rollout;
      }
    }

    rollout.stage = 'rolling';
    rollout.updatedAt = new Date();
    return rollout;
  }

  private async transitionRollingToComplete(
    rollout: FirmwareRollout,
  ): Promise<FirmwareRollout> {
    const remainingDeviceIds = rollout.targetDeviceIds.filter(
      (id) => !rollout.canaryDeviceIds.includes(id),
    );

    await this.deployToDevices(
      rollout,
      remainingDeviceIds,
      rollout.firmwareVersion,
    );

    rollout.stage = 'complete';
    rollout.updatedAt = new Date();
    rollout.completedAt = new Date();
    return rollout;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async deployToDevices(
    rollout: FirmwareRollout,
    deviceIds: string[],
    version: string,
  ): Promise<void> {
    for (const deviceId of deviceIds) {
      const result = await this.deps.deployFirmware(deviceId, version);
      if (result.success) {
        rollout.completedDeviceIds.push(deviceId);
      } else {
        rollout.failedDeviceIds.push(deviceId);
      }
    }
  }

  private getExistingRollout(rolloutId: string): FirmwareRollout {
    const rollout = this.rollouts.get(rolloutId);
    if (!rollout) {
      throw new Error(`Rollout ${rolloutId} not found`);
    }
    return rollout;
  }
}
