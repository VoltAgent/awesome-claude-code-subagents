import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthProbeWorker } from '../../src/workers/health-probe-worker.js';
import type { HealthProbeConfig } from '../../src/workers/health-probe-worker.js';
import type { IoTCoordinator } from '../../src/application/iot-coordinator.js';
import type { DeviceAgent } from '../../src/domain/entities/index.js';
import { DeviceTrustLevel } from '../../src/domain/entities/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDevice(deviceId: string): DeviceAgent {
  return {
    deviceId,
    publicKey: 'key',
    firmwareVersion: '1.0',
    trustLevel: DeviceTrustLevel.REGISTERED,
    trustScore: {
      overall: 0.5,
      components: {
        pairingIntegrity: 0,
        firmwareCurrency: 1,
        uptimeStability: 0.5,
        witnessIntegrity: 0.3,
        anomalyHistory: 1,
        meshParticipation: 0.5,
      },
    },
    fleetId: 'fleet-1',
    zoneId: 'zone-a',
    status: 'online',
    lastSeen: new Date(),
    epoch: 1,
    capabilities: [],
    meshPeers: [],
    vectorStoreStats: {
      totalVectors: 0,
      deletedVectors: 0,
      dimension: 128,
      fileSizeBytes: 0,
    },
    endpoint: 'http://169.254.42.1',
    metadata: {},
  };
}

function makeMockCoordinator(devices: DeviceAgent[]): IoTCoordinator {
  return {
    listDevices: vi.fn().mockReturnValue(devices),
    getDeviceStatus: vi.fn().mockResolvedValue(devices[0] ?? makeDevice('x')),
  } as unknown as IoTCoordinator;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HealthProbeWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // start / stop / isRunning
  // -----------------------------------------------------------------------

  describe('start and stop', () => {
    it('should start an interval timer', () => {
      const coordinator = makeMockCoordinator([]);
      const worker = new HealthProbeWorker(coordinator, { intervalMs: 5000 });

      expect(worker.isRunning()).toBe(false);

      worker.start();

      expect(worker.isRunning()).toBe(true);

      worker.stop();
    });

    it('should stop the timer and report not running', () => {
      const coordinator = makeMockCoordinator([]);
      const worker = new HealthProbeWorker(coordinator, { intervalMs: 5000 });

      worker.start();
      worker.stop();

      expect(worker.isRunning()).toBe(false);
    });

    it('should be idempotent when called multiple times', () => {
      const coordinator = makeMockCoordinator([]);
      const worker = new HealthProbeWorker(coordinator, { intervalMs: 5000 });

      worker.start();
      worker.start(); // second start should be a no-op

      expect(worker.isRunning()).toBe(true);

      worker.stop();
      worker.stop(); // second stop should be a no-op

      expect(worker.isRunning()).toBe(false);
    });

    it('should invoke probe at the configured interval', async () => {
      const devices = [makeDevice('dev-001')];
      const coordinator = makeMockCoordinator(devices);
      const worker = new HealthProbeWorker(coordinator, { intervalMs: 1000 });

      worker.start();

      // No call yet at t=0 (setInterval fires after the first interval)
      expect(coordinator.getDeviceStatus).not.toHaveBeenCalled();

      // Advance past one interval
      await vi.advanceTimersByTimeAsync(1000);

      expect(coordinator.getDeviceStatus).toHaveBeenCalledTimes(1);

      // Advance past another interval
      await vi.advanceTimersByTimeAsync(1000);

      expect(coordinator.getDeviceStatus).toHaveBeenCalledTimes(2);

      worker.stop();
    });

    it('should use default intervalMs of 30000 when not specified', () => {
      const devices = [makeDevice('dev-001')];
      const coordinator = makeMockCoordinator(devices);
      const worker = new HealthProbeWorker(coordinator);

      worker.start();

      // At 29s, probe should NOT have fired
      vi.advanceTimersByTime(29_000);
      expect(coordinator.getDeviceStatus).not.toHaveBeenCalled();

      worker.stop();
    });
  });

  // -----------------------------------------------------------------------
  // probe
  // -----------------------------------------------------------------------

  describe('probe', () => {
    it('should call getDeviceStatus for each registered device', async () => {
      const devices = [makeDevice('dev-001'), makeDevice('dev-002')];
      const coordinator = makeMockCoordinator(devices);
      const worker = new HealthProbeWorker(coordinator);

      await worker.probe();

      expect(coordinator.listDevices).toHaveBeenCalledTimes(1);
      expect(coordinator.getDeviceStatus).toHaveBeenCalledTimes(2);
      expect(coordinator.getDeviceStatus).toHaveBeenCalledWith('dev-001');
      expect(coordinator.getDeviceStatus).toHaveBeenCalledWith('dev-002');
    });

    it('should not call getDeviceStatus when no devices are registered', async () => {
      const coordinator = makeMockCoordinator([]);
      const worker = new HealthProbeWorker(coordinator);

      await worker.probe();

      expect(coordinator.listDevices).toHaveBeenCalled();
      expect(coordinator.getDeviceStatus).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // onDeviceOffline
  // -----------------------------------------------------------------------

  describe('onDeviceOffline', () => {
    it('should emit onDeviceOffline when getDeviceStatus throws (previously online)', async () => {
      const devices = [makeDevice('dev-001')];
      const coordinator = makeMockCoordinator(devices);
      (coordinator.getDeviceStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused'),
      );

      const onDeviceOffline = vi.fn();
      const onProbeError = vi.fn();
      const worker = new HealthProbeWorker(coordinator, {
        intervalMs: 1000,
        onDeviceOffline,
        onProbeError,
      });

      // First probe — device was never seen before (prevStatus is undefined),
      // so it should emit onDeviceOffline
      await worker.probe();

      expect(onDeviceOffline).toHaveBeenCalledTimes(1);
      expect(onDeviceOffline).toHaveBeenCalledWith('dev-001');
      expect(onProbeError).toHaveBeenCalledTimes(1);
    });

    it('should NOT emit onDeviceOffline again if device was already offline', async () => {
      const devices = [makeDevice('dev-001')];
      const coordinator = makeMockCoordinator(devices);
      (coordinator.getDeviceStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Timeout'),
      );

      const onDeviceOffline = vi.fn();
      const worker = new HealthProbeWorker(coordinator, {
        intervalMs: 1000,
        onDeviceOffline,
      });

      // First probe — transitions to offline
      await worker.probe();
      expect(onDeviceOffline).toHaveBeenCalledTimes(1);

      // Second probe — already offline, should not emit again
      await worker.probe();
      expect(onDeviceOffline).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // onDeviceOnline
  // -----------------------------------------------------------------------

  describe('onDeviceOnline', () => {
    it('should emit onDeviceOnline when device comes back after being offline', async () => {
      const devices = [makeDevice('dev-001')];
      const coordinator = makeMockCoordinator(devices);

      const onDeviceOffline = vi.fn();
      const onDeviceOnline = vi.fn();
      const worker = new HealthProbeWorker(coordinator, {
        intervalMs: 1000,
        onDeviceOffline,
        onDeviceOnline,
      });

      // First probe — device goes offline
      (coordinator.getDeviceStatus as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Timeout'),
      );
      await worker.probe();
      expect(onDeviceOffline).toHaveBeenCalledTimes(1);

      // Second probe — device comes back online
      (coordinator.getDeviceStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeDevice('dev-001'),
      );
      await worker.probe();
      expect(onDeviceOnline).toHaveBeenCalledTimes(1);
      expect(onDeviceOnline).toHaveBeenCalledWith('dev-001');
    });

    it('should not emit onDeviceOnline on first successful probe (device was never offline)', async () => {
      const devices = [makeDevice('dev-001')];
      const coordinator = makeMockCoordinator(devices);

      const onDeviceOnline = vi.fn();
      const worker = new HealthProbeWorker(coordinator, {
        intervalMs: 1000,
        onDeviceOnline,
      });

      // First probe — device is online, prevStatus is undefined (not 'offline')
      await worker.probe();

      expect(onDeviceOnline).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // onProbeError
  // -----------------------------------------------------------------------

  describe('onProbeError', () => {
    it('should call onProbeError with deviceId and error when getDeviceStatus throws', async () => {
      const devices = [makeDevice('dev-001')];
      const coordinator = makeMockCoordinator(devices);
      const error = new Error('Network error');
      (coordinator.getDeviceStatus as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const onProbeError = vi.fn();
      const worker = new HealthProbeWorker(coordinator, {
        intervalMs: 1000,
        onProbeError,
      });

      await worker.probe();

      expect(onProbeError).toHaveBeenCalledWith('dev-001', error);
    });
  });

  // -----------------------------------------------------------------------
  // Multi-device scenarios
  // -----------------------------------------------------------------------

  describe('multi-device scenarios', () => {
    it('should track status independently per device', async () => {
      const devices = [makeDevice('dev-001'), makeDevice('dev-002')];
      const coordinator = makeMockCoordinator(devices);

      // dev-001 is online, dev-002 fails
      (coordinator.getDeviceStatus as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(makeDevice('dev-001'))
        .mockRejectedValueOnce(new Error('Offline'));

      const onDeviceOffline = vi.fn();
      const onDeviceOnline = vi.fn();
      const worker = new HealthProbeWorker(coordinator, {
        intervalMs: 1000,
        onDeviceOffline,
        onDeviceOnline,
      });

      await worker.probe();

      // Only dev-002 should be offline
      expect(onDeviceOffline).toHaveBeenCalledTimes(1);
      expect(onDeviceOffline).toHaveBeenCalledWith('dev-002');
      expect(onDeviceOnline).not.toHaveBeenCalled();

      // Second probe: dev-002 comes back, dev-001 goes offline
      (coordinator.getDeviceStatus as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Offline'))
        .mockResolvedValueOnce(makeDevice('dev-002'));

      await worker.probe();

      expect(onDeviceOffline).toHaveBeenCalledTimes(2);
      expect(onDeviceOffline).toHaveBeenCalledWith('dev-001');
      expect(onDeviceOnline).toHaveBeenCalledTimes(1);
      expect(onDeviceOnline).toHaveBeenCalledWith('dev-002');
    });
  });
});
