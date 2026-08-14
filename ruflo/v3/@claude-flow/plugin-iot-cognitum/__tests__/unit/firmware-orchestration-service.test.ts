import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FirmwareOrchestrationService,
  type FirmwareOrchestrationDeps,
  type FirmwareRollout,
} from '../../src/domain/services/firmware-orchestration-service.js';
import type { FirmwarePolicy } from '../../src/domain/entities/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePolicy(overrides: Partial<FirmwarePolicy> = {}): FirmwarePolicy {
  return {
    channel: 'stable',
    autoUpdate: false,
    approvalRequired: false,
    canaryPercentage: 10,
    canaryDurationMinutes: 30,
    rollbackOnAnomalyThreshold: 0.5,
    ...overrides,
  };
}

function makeDeps(
  overrides: Partial<FirmwareOrchestrationDeps> = {},
): FirmwareOrchestrationDeps {
  return {
    getDeviceFirmwareVersion: vi.fn().mockResolvedValue('1.0.0'),
    deployFirmware: vi.fn().mockResolvedValue({ success: true }),
    getDeviceAnomalyScore: vi.fn().mockResolvedValue(0.1),
    ...overrides,
  };
}

function deviceIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `dev-${i + 1}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FirmwareOrchestrationService', () => {
  let deps: FirmwareOrchestrationDeps;
  let svc: FirmwareOrchestrationService;

  beforeEach(() => {
    deps = makeDeps();
    svc = new FirmwareOrchestrationService(deps);
  });

  // ---- createRollout -------------------------------------------------------

  describe('createRollout', () => {
    it('creates a rollout in pending stage', () => {
      const rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(10),
        makePolicy(),
      );

      expect(rollout.fleetId).toBe('fleet-1');
      expect(rollout.firmwareVersion).toBe('2.0.0');
      expect(rollout.stage).toBe('pending');
      expect(rollout.strategy).toBe('canary');
      expect(rollout.targetDeviceIds).toHaveLength(10);
      expect(rollout.completedDeviceIds).toEqual([]);
      expect(rollout.failedDeviceIds).toEqual([]);
      expect(rollout.startedAt).toBeInstanceOf(Date);
      expect(rollout.updatedAt).toBeInstanceOf(Date);
      expect(rollout.completedAt).toBeUndefined();
    });

    it('selects correct canary devices (10% of 10 = 1)', () => {
      const rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(10),
        makePolicy({ canaryPercentage: 10 }),
      );

      expect(rollout.canaryDeviceIds).toEqual(['dev-1']);
    });

    it('selects correct canary devices (20% of 10 = 2)', () => {
      const rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(10),
        makePolicy({ canaryPercentage: 20 }),
      );

      expect(rollout.canaryDeviceIds).toEqual(['dev-1', 'dev-2']);
    });

    it('always selects at least 1 canary device', () => {
      const rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(100),
        makePolicy({ canaryPercentage: 0 }),
      );

      expect(rollout.canaryDeviceIds).toHaveLength(1);
    });

    it('sets anomaly threshold from policy', () => {
      const rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(5),
        makePolicy({ rollbackOnAnomalyThreshold: 0.8 }),
      );

      expect(rollout.anomalyThreshold).toBe(0.8);
    });
  });

  // ---- advanceRollout: pending -> canary -----------------------------------

  describe('advanceRollout: pending -> canary', () => {
    it('deploys firmware to canary devices', async () => {
      const rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(10),
        makePolicy({ canaryPercentage: 20 }),
      );

      const updated = await svc.advanceRollout(rollout.rolloutId);

      expect(updated.stage).toBe('canary');
      expect(deps.deployFirmware).toHaveBeenCalledTimes(2);
      expect(deps.deployFirmware).toHaveBeenCalledWith('dev-1', '2.0.0');
      expect(deps.deployFirmware).toHaveBeenCalledWith('dev-2', '2.0.0');
      expect(updated.completedDeviceIds).toEqual(['dev-1', 'dev-2']);
    });

    it('tracks failed canary deployments', async () => {
      const deployFirmware = vi
        .fn()
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'timeout' });

      deps = makeDeps({ deployFirmware });
      svc = new FirmwareOrchestrationService(deps);

      const rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(10),
        makePolicy({ canaryPercentage: 20 }),
      );

      const updated = await svc.advanceRollout(rollout.rolloutId);

      expect(updated.stage).toBe('canary');
      expect(updated.completedDeviceIds).toEqual(['dev-1']);
      expect(updated.failedDeviceIds).toEqual(['dev-2']);
    });
  });

  // ---- advanceRollout: canary -> rolling -----------------------------------

  describe('advanceRollout: canary -> rolling', () => {
    let rollout: FirmwareRollout;

    beforeEach(async () => {
      rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(10),
        makePolicy({ canaryPercentage: 10 }),
      );
      await svc.advanceRollout(rollout.rolloutId); // pending -> canary
    });

    it('moves to rolling when anomaly scores are below threshold', async () => {
      const updated = await svc.advanceRollout(rollout.rolloutId);

      expect(updated.stage).toBe('rolling');
      expect(deps.getDeviceAnomalyScore).toHaveBeenCalledWith('dev-1');
    });

    it('rolls back when anomaly score exceeds threshold', async () => {
      vi.mocked(deps.getDeviceAnomalyScore).mockResolvedValue(0.9);

      const updated = await svc.advanceRollout(rollout.rolloutId);

      expect(updated.stage).toBe('rolled-back');
    });

    it('rolls back when anomaly score equals threshold', async () => {
      // threshold is 0.5, score is 0.5 — should NOT roll back (> not >=)
      vi.mocked(deps.getDeviceAnomalyScore).mockResolvedValue(0.5);

      const updated = await svc.advanceRollout(rollout.rolloutId);

      expect(updated.stage).toBe('rolling');
    });

    it('rolls back when anomaly score just exceeds threshold', async () => {
      vi.mocked(deps.getDeviceAnomalyScore).mockResolvedValue(0.51);

      const updated = await svc.advanceRollout(rollout.rolloutId);

      expect(updated.stage).toBe('rolled-back');
    });
  });

  // ---- advanceRollout: rolling -> complete ---------------------------------

  describe('advanceRollout: rolling -> complete', () => {
    let rollout: FirmwareRollout;

    beforeEach(async () => {
      rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(5),
        makePolicy({ canaryPercentage: 20 }),
      );
      await svc.advanceRollout(rollout.rolloutId); // pending -> canary
      await svc.advanceRollout(rollout.rolloutId); // canary -> rolling
    });

    it('deploys to remaining devices and completes', async () => {
      const updated = await svc.advanceRollout(rollout.rolloutId);

      expect(updated.stage).toBe('complete');
      expect(updated.completedAt).toBeInstanceOf(Date);
      // Canary had 1 device (20% of 5 = 1), remaining = 4
      expect(updated.completedDeviceIds).toContain('dev-2');
      expect(updated.completedDeviceIds).toContain('dev-3');
      expect(updated.completedDeviceIds).toContain('dev-4');
      expect(updated.completedDeviceIds).toContain('dev-5');
    });

    it('does not redeploy to canary devices', async () => {
      vi.mocked(deps.deployFirmware).mockClear();

      await svc.advanceRollout(rollout.rolloutId);

      const calledDevices = vi
        .mocked(deps.deployFirmware)
        .mock.calls.map((c) => c[0]);
      expect(calledDevices).not.toContain('dev-1');
    });

    it('tracks failed deployments during rolling phase', async () => {
      vi.mocked(deps.deployFirmware).mockClear();
      vi.mocked(deps.deployFirmware)
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'disk full' })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true });

      const updated = await svc.advanceRollout(rollout.rolloutId);

      expect(updated.stage).toBe('complete');
      expect(updated.failedDeviceIds).toContain('dev-3');
    });
  });

  // ---- advanceRollout: terminal stages -------------------------------------

  describe('advanceRollout: terminal stages', () => {
    it('is a no-op when already complete', async () => {
      const rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(3),
        makePolicy({ canaryPercentage: 34 }),
      );
      await svc.advanceRollout(rollout.rolloutId); // pending -> canary
      await svc.advanceRollout(rollout.rolloutId); // canary -> rolling
      await svc.advanceRollout(rollout.rolloutId); // rolling -> complete

      const updated = await svc.advanceRollout(rollout.rolloutId);

      expect(updated.stage).toBe('complete');
    });

    it('is a no-op when already rolled back', async () => {
      const rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(5),
        makePolicy(),
      );
      svc.rollbackRollout(rollout.rolloutId);

      const updated = await svc.advanceRollout(rollout.rolloutId);

      expect(updated.stage).toBe('rolled-back');
    });
  });

  // ---- rollbackRollout -----------------------------------------------------

  describe('rollbackRollout', () => {
    it('sets stage to rolled-back from pending', () => {
      const rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(5),
        makePolicy(),
      );

      const updated = svc.rollbackRollout(rollout.rolloutId);

      expect(updated.stage).toBe('rolled-back');
      expect(updated.updatedAt).toBeInstanceOf(Date);
    });

    it('sets stage to rolled-back from canary', async () => {
      const rollout = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(5),
        makePolicy(),
      );
      await svc.advanceRollout(rollout.rolloutId); // pending -> canary

      const updated = svc.rollbackRollout(rollout.rolloutId);

      expect(updated.stage).toBe('rolled-back');
    });

    it('throws for unknown rollout', () => {
      expect(() => svc.rollbackRollout('nope')).toThrow(
        'Rollout nope not found',
      );
    });
  });

  // ---- getRollout ----------------------------------------------------------

  describe('getRollout', () => {
    it('returns an existing rollout', () => {
      const created = svc.createRollout(
        'fleet-1',
        '2.0.0',
        deviceIds(3),
        makePolicy(),
      );

      const fetched = svc.getRollout(created.rolloutId);

      expect(fetched.rolloutId).toBe(created.rolloutId);
      expect(fetched.fleetId).toBe('fleet-1');
    });

    it('throws for unknown rollout', () => {
      expect(() => svc.getRollout('does-not-exist')).toThrow(
        'Rollout does-not-exist not found',
      );
    });
  });

  // ---- listRollouts --------------------------------------------------------

  describe('listRollouts', () => {
    it('returns all rollouts when no fleetId filter', () => {
      svc.createRollout('fleet-1', '2.0.0', deviceIds(3), makePolicy());
      svc.createRollout('fleet-2', '2.0.0', deviceIds(3), makePolicy());

      expect(svc.listRollouts()).toHaveLength(2);
    });

    it('filters by fleetId', () => {
      svc.createRollout('fleet-1', '2.0.0', deviceIds(3), makePolicy());
      svc.createRollout('fleet-2', '2.0.0', deviceIds(3), makePolicy());
      svc.createRollout('fleet-1', '3.0.0', deviceIds(3), makePolicy());

      const fleet1 = svc.listRollouts('fleet-1');

      expect(fleet1).toHaveLength(2);
      expect(fleet1.every((r) => r.fleetId === 'fleet-1')).toBe(true);
    });

    it('returns empty array when no rollouts match', () => {
      svc.createRollout('fleet-1', '2.0.0', deviceIds(3), makePolicy());

      expect(svc.listRollouts('fleet-999')).toEqual([]);
    });
  });
});
