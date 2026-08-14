import { describe, it, expect, beforeEach } from 'vitest';
import { FleetTopologyService } from '../../src/domain/services/fleet-topology-service.js';
import { InMemoryFleetRepository } from '../../src/infrastructure/in-memory-fleet-repository.js';

describe('FleetTopologyService', () => {
  let svc: FleetTopologyService;
  let repo: InMemoryFleetRepository;

  beforeEach(() => {
    repo = new InMemoryFleetRepository();
    svc = new FleetTopologyService(repo);
  });

  describe('createFleet', () => {
    it('creates a fleet with defaults', async () => {
      const fleet = await svc.createFleet({
        fleetId: 'f1',
        name: 'Warehouse Sensors',
        zoneId: 'zone-1',
      });

      expect(fleet.fleetId).toBe('f1');
      expect(fleet.name).toBe('Warehouse Sensors');
      expect(fleet.zoneId).toBe('zone-1');
      expect(fleet.deviceIds).toEqual([]);
      expect(fleet.topology).toBe('star');
      expect(fleet.firmwarePolicy.channel).toBe('stable');
      expect(fleet.firmwarePolicy.autoUpdate).toBe(false);
      expect(fleet.firmwarePolicy.canaryPercentage).toBe(10);
      expect(fleet.telemetryPolicy.anomalyDetectionEnabled).toBe(true);
      expect(fleet.healthThresholds.maxOfflineMinutes).toBe(10);
      expect(fleet.createdAt).toBeInstanceOf(Date);
    });

    it('creates a fleet with custom policies', async () => {
      const fleet = await svc.createFleet({
        fleetId: 'f2',
        name: 'Production',
        zoneId: 'zone-2',
        topology: 'mesh',
        firmwarePolicy: { autoUpdate: true, canaryPercentage: 5 },
        telemetryPolicy: { anomalyThreshold: 0.5 },
      });

      expect(fleet.topology).toBe('mesh');
      expect(fleet.firmwarePolicy.autoUpdate).toBe(true);
      expect(fleet.firmwarePolicy.canaryPercentage).toBe(5);
      expect(fleet.firmwarePolicy.channel).toBe('stable');
      expect(fleet.telemetryPolicy.anomalyThreshold).toBe(0.5);
      expect(fleet.telemetryPolicy.retentionDays).toBe(30);
    });

    it('throws on duplicate fleet ID', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      await expect(
        svc.createFleet({ fleetId: 'f1', name: 'B', zoneId: 'z2' }),
      ).rejects.toThrow('Fleet f1 already exists');
    });
  });

  describe('getFleet', () => {
    it('returns an existing fleet', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      const fleet = await svc.getFleet('f1');
      expect(fleet.fleetId).toBe('f1');
    });

    it('throws for non-existent fleet', async () => {
      await expect(svc.getFleet('nope')).rejects.toThrow('Fleet nope not found');
    });
  });

  describe('listFleets', () => {
    it('returns summaries of all fleets', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      await svc.createFleet({ fleetId: 'f2', name: 'B', zoneId: 'z2', topology: 'mesh' });

      const summaries = await svc.listFleets();
      expect(summaries).toHaveLength(2);
      expect(summaries[0].fleetId).toBe('f1');
      expect(summaries[1].topology).toBe('mesh');
      expect(summaries[0].deviceCount).toBe(0);
    });
  });

  describe('addDeviceToFleet / removeDeviceFromFleet', () => {
    it('adds a device to a fleet', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      const fleet = await svc.addDeviceToFleet('f1', 'dev-1');
      expect(fleet.deviceIds).toEqual(['dev-1']);
    });

    it('is idempotent on duplicate add', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      await svc.addDeviceToFleet('f1', 'dev-1');
      const fleet = await svc.addDeviceToFleet('f1', 'dev-1');
      expect(fleet.deviceIds).toEqual(['dev-1']);
    });

    it('adds multiple devices', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      await svc.addDeviceToFleet('f1', 'dev-1');
      await svc.addDeviceToFleet('f1', 'dev-2');
      const fleet = await svc.addDeviceToFleet('f1', 'dev-3');
      expect(fleet.deviceIds).toEqual(['dev-1', 'dev-2', 'dev-3']);
    });

    it('removes a device from a fleet', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      await svc.addDeviceToFleet('f1', 'dev-1');
      await svc.addDeviceToFleet('f1', 'dev-2');
      const fleet = await svc.removeDeviceFromFleet('f1', 'dev-1');
      expect(fleet.deviceIds).toEqual(['dev-2']);
    });

    it('is safe to remove a non-member device', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      const fleet = await svc.removeDeviceFromFleet('f1', 'dev-nope');
      expect(fleet.deviceIds).toEqual([]);
    });
  });

  describe('updateTopology', () => {
    it('changes the fleet topology', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      const fleet = await svc.updateTopology('f1', 'hierarchical');
      expect(fleet.topology).toBe('hierarchical');
    });
  });

  describe('updateFirmwarePolicy', () => {
    it('merges partial policy updates', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      const fleet = await svc.updateFirmwarePolicy('f1', {
        autoUpdate: true,
        canaryPercentage: 25,
      });
      expect(fleet.firmwarePolicy.autoUpdate).toBe(true);
      expect(fleet.firmwarePolicy.canaryPercentage).toBe(25);
      expect(fleet.firmwarePolicy.channel).toBe('stable');
    });
  });

  describe('deleteFleet', () => {
    it('deletes an existing fleet', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      await svc.deleteFleet('f1');
      await expect(svc.getFleet('f1')).rejects.toThrow();
    });

    it('throws for non-existent fleet', async () => {
      await expect(svc.deleteFleet('nope')).rejects.toThrow('Fleet nope not found');
    });
  });

  describe('getFleetDeviceCount', () => {
    it('returns the correct count', async () => {
      await svc.createFleet({ fleetId: 'f1', name: 'A', zoneId: 'z1' });
      await svc.addDeviceToFleet('f1', 'dev-1');
      await svc.addDeviceToFleet('f1', 'dev-2');
      expect(await svc.getFleetDeviceCount('f1')).toBe(2);
    });
  });
});
