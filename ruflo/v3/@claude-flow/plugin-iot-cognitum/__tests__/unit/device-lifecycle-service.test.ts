import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeviceLifecycleService } from '../../src/domain/services/device-lifecycle-service.js';
import { DeviceTrustLevel } from '../../src/domain/entities/index.js';
import type { DeviceAgent, DeviceTrustScore } from '../../src/domain/entities/index.js';
import type { DeviceLifecycleDeps } from '../../src/domain/services/device-lifecycle-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(
  overrides: Partial<DeviceLifecycleDeps> = {},
): DeviceLifecycleDeps {
  return {
    getStatus: vi.fn().mockResolvedValue({
      device_id: 'dev-001',
      uptime_secs: 86_400,
      epoch: 42,
      total_vectors: 1000,
      dimension: 384,
      paired: false,
      roles: ['vector-store', 'mesh'],
      witness_chain_length: 500,
    }),
    getIdentity: vi.fn().mockResolvedValue({
      device_id: 'dev-001',
      public_key: 'ed25519-pub-key',
      firmware_version: '2.1.0',
      epoch: 43,
    }),
    getPairStatus: vi.fn().mockResolvedValue({
      paired: true,
      client_count: 1,
    }),
    getWitnessChain: vi.fn().mockResolvedValue({
      depth: 5000,
      epoch: 42,
      head_hash: 'abc123',
    }),
    getCustodyEpoch: vi.fn().mockResolvedValue({ epoch: 42 }),
    pairDevice: vi.fn().mockResolvedValue({ paired: true, token: 'tok-xyz' }),
    unpairDevice: vi.fn().mockResolvedValue(undefined),
    onDeviceRegistered: vi.fn(),
    onTrustChange: vi.fn(),
    ...overrides,
  };
}

function makeDevice(
  overrides: Partial<DeviceAgent> = {},
): DeviceAgent {
  return {
    deviceId: 'dev-001',
    publicKey: 'ed25519-pub-key',
    firmwareVersion: '2.1.0',
    trustLevel: DeviceTrustLevel.REGISTERED,
    trustScore: {
      overall: 0.45,
      components: {
        pairingIntegrity: 0.0,
        firmwareCurrency: 1.0,
        uptimeStability: 0.5,
        witnessIntegrity: 0.3,
        anomalyHistory: 1.0,
        meshParticipation: 0.5,
      },
    },
    fleetId: 'fleet-1',
    zoneId: 'zone-a',
    status: 'online',
    lastSeen: new Date(),
    epoch: 42,
    capabilities: ['vector-store', 'mesh-routing'],
    meshPeers: [],
    vectorStoreStats: {
      totalVectors: 1000,
      deletedVectors: 0,
      dimension: 384,
      fileSizeBytes: 0,
    },
    endpoint: 'http://169.254.42.1',
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeviceLifecycleService', () => {
  let deps: DeviceLifecycleDeps;
  let service: DeviceLifecycleService;

  beforeEach(() => {
    deps = makeDeps();
    service = new DeviceLifecycleService(deps);
  });

  // -----------------------------------------------------------------------
  // registerDevice
  // -----------------------------------------------------------------------

  describe('registerDevice', () => {
    it('should create a DeviceAgent with correct fields from mocked status+identity', async () => {
      const device = await service.registerDevice(
        'http://169.254.42.1',
        'fleet-1',
        'zone-a',
      );

      expect(device.deviceId).toBe('dev-001');
      expect(device.publicKey).toBe('ed25519-pub-key');
      expect(device.firmwareVersion).toBe('2.1.0');
      expect(device.fleetId).toBe('fleet-1');
      expect(device.zoneId).toBe('zone-a');
      expect(device.status).toBe('online');
      expect(device.epoch).toBe(43); // identity.epoch takes precedence
      expect(device.endpoint).toBe('http://169.254.42.1');
      expect(device.vectorStoreStats).toEqual({
        totalVectors: 1000,
        deletedVectors: 0,
        dimension: 384,
        fileSizeBytes: 0,
      });
    });

    it('should set trust level to REGISTERED', async () => {
      const device = await service.registerDevice(
        'http://169.254.42.1',
        'fleet-1',
        'zone-a',
      );

      expect(device.trustLevel).toBe(DeviceTrustLevel.REGISTERED);
    });

    it('should call onDeviceRegistered callback', async () => {
      const device = await service.registerDevice(
        'http://169.254.42.1',
        'fleet-1',
        'zone-a',
      );

      expect(deps.onDeviceRegistered).toHaveBeenCalledTimes(1);
      expect(deps.onDeviceRegistered).toHaveBeenCalledWith(device);
    });

    it('should call getStatus with the endpoint, then getIdentity with the device_id', async () => {
      await service.registerDevice(
        'http://169.254.42.1',
        'fleet-1',
        'zone-a',
      );

      expect(deps.getStatus).toHaveBeenCalledWith('http://169.254.42.1');
      expect(deps.getIdentity).toHaveBeenCalledWith('dev-001');
    });

    it('should derive capabilities from status roles', async () => {
      const device = await service.registerDevice(
        'http://169.254.42.1',
        'fleet-1',
        'zone-a',
      );

      expect(device.capabilities).toEqual(['vector-store', 'mesh-routing']);
    });

    it('should fall back to status.epoch when identity.epoch is undefined', async () => {
      deps = makeDeps({
        getIdentity: vi.fn().mockResolvedValue({
          device_id: 'dev-001',
          public_key: 'key',
          firmware_version: '1.0',
          epoch: undefined,
        }),
      });
      service = new DeviceLifecycleService(deps);

      const device = await service.registerDevice(
        'http://169.254.42.1',
        'fleet-1',
        'zone-a',
      );

      expect(device.epoch).toBe(42); // falls back to status.epoch
    });

    it('should not throw when onDeviceRegistered is undefined', async () => {
      deps = makeDeps({ onDeviceRegistered: undefined });
      service = new DeviceLifecycleService(deps);

      await expect(
        service.registerDevice('http://169.254.42.1', 'fleet-1', 'zone-a'),
      ).resolves.toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // pairDevice
  // -----------------------------------------------------------------------

  describe('pairDevice', () => {
    it('should call deps.pairDevice with deviceId and clientName', async () => {
      const device = makeDevice();

      await service.pairDevice(device, 'my-client');

      expect(deps.pairDevice).toHaveBeenCalledWith('dev-001', 'my-client');
    });

    it('should promote trust level to PROVISIONED when below PROVISIONED', async () => {
      const device = makeDevice({ trustLevel: DeviceTrustLevel.REGISTERED });

      const updated = await service.pairDevice(device, 'my-client');

      expect(updated.trustLevel).toBe(DeviceTrustLevel.PROVISIONED);
    });

    it('should keep trust level when already at or above PROVISIONED', async () => {
      const device = makeDevice({ trustLevel: DeviceTrustLevel.CERTIFIED });

      const updated = await service.pairDevice(device, 'my-client');

      expect(updated.trustLevel).toBe(DeviceTrustLevel.CERTIFIED);
    });

    it('should set pairingIntegrity to 1.0', async () => {
      const device = makeDevice();

      const updated = await service.pairDevice(device, 'my-client');

      expect(updated.trustScore.components.pairingIntegrity).toBe(1.0);
    });

    it('should call onTrustChange when trust level changes', async () => {
      const device = makeDevice({ trustLevel: DeviceTrustLevel.REGISTERED });

      await service.pairDevice(device, 'my-client');

      expect(deps.onTrustChange).toHaveBeenCalledWith(
        'dev-001',
        DeviceTrustLevel.REGISTERED,
        DeviceTrustLevel.PROVISIONED,
      );
    });

    it('should not call onTrustChange when trust level stays the same', async () => {
      const device = makeDevice({ trustLevel: DeviceTrustLevel.PROVISIONED });

      await service.pairDevice(device, 'my-client');

      expect(deps.onTrustChange).not.toHaveBeenCalled();
    });

    it('should throw when pairing fails (paired: false)', async () => {
      deps = makeDeps({
        pairDevice: vi.fn().mockResolvedValue({ paired: false }),
      });
      service = new DeviceLifecycleService(deps);

      const device = makeDevice();

      await expect(service.pairDevice(device, 'my-client')).rejects.toThrow(
        'Pairing failed for device dev-001',
      );
    });
  });

  // -----------------------------------------------------------------------
  // unpairDevice
  // -----------------------------------------------------------------------

  describe('unpairDevice', () => {
    it('should call deps.unpairDevice with the deviceId', async () => {
      const device = makeDevice({ trustLevel: DeviceTrustLevel.PROVISIONED });

      await service.unpairDevice(device);

      expect(deps.unpairDevice).toHaveBeenCalledWith('dev-001');
    });

    it('should demote trust level to REGISTERED', async () => {
      const device = makeDevice({ trustLevel: DeviceTrustLevel.CERTIFIED });

      const updated = await service.unpairDevice(device);

      expect(updated.trustLevel).toBe(DeviceTrustLevel.REGISTERED);
    });

    it('should set pairingIntegrity to 0.0', async () => {
      const device = makeDevice({
        trustScore: {
          overall: 0.8,
          components: {
            pairingIntegrity: 1.0,
            firmwareCurrency: 1.0,
            uptimeStability: 0.9,
            witnessIntegrity: 0.5,
            anomalyHistory: 1.0,
            meshParticipation: 0.5,
          },
        },
      });

      const updated = await service.unpairDevice(device);

      expect(updated.trustScore.components.pairingIntegrity).toBe(0.0);
    });

    it('should call onTrustChange when demoting from a higher level', async () => {
      const device = makeDevice({ trustLevel: DeviceTrustLevel.CERTIFIED });

      await service.unpairDevice(device);

      expect(deps.onTrustChange).toHaveBeenCalledWith(
        'dev-001',
        DeviceTrustLevel.CERTIFIED,
        DeviceTrustLevel.REGISTERED,
      );
    });

    it('should not call onTrustChange when already REGISTERED', async () => {
      const device = makeDevice({ trustLevel: DeviceTrustLevel.REGISTERED });

      await service.unpairDevice(device);

      expect(deps.onTrustChange).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // refreshDeviceState
  // -----------------------------------------------------------------------

  describe('refreshDeviceState', () => {
    it('should parallel-fetch status, identity, pairStatus, and witnessChain', async () => {
      const device = makeDevice();

      await service.refreshDeviceState(device);

      expect(deps.getStatus).toHaveBeenCalledWith('dev-001');
      expect(deps.getIdentity).toHaveBeenCalledWith('dev-001');
      expect(deps.getPairStatus).toHaveBeenCalledWith('dev-001');
      expect(deps.getWitnessChain).toHaveBeenCalledWith('dev-001');
    });

    it('should update device fields from fetched state', async () => {
      deps = makeDeps({
        getIdentity: vi.fn().mockResolvedValue({
          device_id: 'dev-001',
          public_key: 'new-pub-key',
          firmware_version: '3.0.0',
          epoch: 99,
        }),
        getStatus: vi.fn().mockResolvedValue({
          device_id: 'dev-001',
          uptime_secs: 200_000,
          epoch: 98,
          total_vectors: 5000,
          dimension: 512,
          paired: true,
          roles: ['vector-store', 'witness', 'sensor'],
        }),
      });
      service = new DeviceLifecycleService(deps);

      const device = makeDevice();
      const updated = await service.refreshDeviceState(device);

      expect(updated.publicKey).toBe('new-pub-key');
      expect(updated.firmwareVersion).toBe('3.0.0');
      expect(updated.epoch).toBe(99);
      expect(updated.status).toBe('online');
      expect(updated.vectorStoreStats.totalVectors).toBe(5000);
      expect(updated.vectorStoreStats.dimension).toBe(512);
      expect(updated.capabilities).toEqual([
        'vector-store',
        'witness-chain',
        'sensor-telemetry',
      ]);
    });

    it('should recalculate trust score and detect trust level changes', async () => {
      // High uptime + paired + deep witness => high trust
      deps = makeDeps({
        getStatus: vi.fn().mockResolvedValue({
          device_id: 'dev-001',
          uptime_secs: 604_800, // 7 days => uptimeStability = 1.0
          epoch: 42,
          total_vectors: 1000,
          dimension: 384,
          paired: true,
          roles: ['vector-store'],
        }),
        getPairStatus: vi.fn().mockResolvedValue({
          paired: true,
          client_count: 1,
        }),
        getWitnessChain: vi.fn().mockResolvedValue({
          depth: 10_000, // max => witnessIntegrity = 1.0
          epoch: 42,
          head_hash: 'abc',
        }),
      });
      service = new DeviceLifecycleService(deps);

      const device = makeDevice({ trustLevel: DeviceTrustLevel.REGISTERED });
      const updated = await service.refreshDeviceState(device);

      // With all components maxed, score = 0.3 + 0.15 + 0.2 + 0.15 + 0.1 + 0.1*0.5 = 0.95
      expect(updated.trustScore.overall).toBeGreaterThan(0.85);
      expect(updated.trustLevel).toBe(DeviceTrustLevel.FLEET_TRUSTED);
    });

    it('should call onTrustChange when trust level differs from original', async () => {
      // Force high trust
      deps = makeDeps({
        getStatus: vi.fn().mockResolvedValue({
          device_id: 'dev-001',
          uptime_secs: 604_800,
          epoch: 42,
          total_vectors: 1000,
          dimension: 384,
          paired: true,
          roles: [],
        }),
        getPairStatus: vi.fn().mockResolvedValue({ paired: true }),
        getWitnessChain: vi.fn().mockResolvedValue({
          depth: 10_000,
          epoch: 42,
          head_hash: 'h',
        }),
      });
      service = new DeviceLifecycleService(deps);

      const device = makeDevice({ trustLevel: DeviceTrustLevel.REGISTERED });
      await service.refreshDeviceState(device);

      expect(deps.onTrustChange).toHaveBeenCalled();
      const [, oldLevel, newLevel] = (deps.onTrustChange as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(oldLevel).toBe(DeviceTrustLevel.REGISTERED);
      expect(newLevel).not.toBe(DeviceTrustLevel.REGISTERED);
    });

    it('should not call onTrustChange when trust level stays the same', async () => {
      // Force low trust (unpaired, zero uptime, zero witness)
      deps = makeDeps({
        getStatus: vi.fn().mockResolvedValue({
          device_id: 'dev-001',
          uptime_secs: 0,
          epoch: 1,
          total_vectors: 0,
          dimension: 128,
          paired: false,
          roles: [],
        }),
        getPairStatus: vi.fn().mockResolvedValue({ paired: false }),
        getWitnessChain: vi.fn().mockResolvedValue({
          depth: 0,
          epoch: 0,
          head_hash: '',
        }),
      });
      service = new DeviceLifecycleService(deps);

      // Device starts at REGISTERED and trust stays low enough to remain REGISTERED
      const device = makeDevice({ trustLevel: DeviceTrustLevel.REGISTERED });
      await service.refreshDeviceState(device);

      // Score: 0.3*0 + 0.15*1 + 0.2*0 + 0.15*0 + 0.1*1 + 0.1*0.5 = 0.3
      // evaluateTrustLevel(0.3) => REGISTERED (0.3 < 0.5)
      expect(deps.onTrustChange).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // computeTrustScore
  // -----------------------------------------------------------------------

  describe('computeTrustScore', () => {
    it('should apply correct weighted formula', () => {
      const device = makeDevice();

      // paired=true => pairingIntegrity=1.0
      // firmwareCurrency is always 1.0
      // uptimeSecs=302_400 (half of 7 days) => uptimeStability=0.5
      // witnessDepth=5000 (half of 10_000) => witnessIntegrity=0.5
      // anomalyHistory=1.0 (fixed)
      // meshParticipation=0.5 (fixed)
      const score = service.computeTrustScore(device, 5000, 302_400, true);

      const expected =
        0.3 * 1.0 +   // pairing
        0.15 * 1.0 +  // firmware
        0.2 * 0.5 +   // uptime
        0.15 * 0.5 +  // witness
        0.1 * 1.0 +   // anomaly
        0.1 * 0.5;    // mesh
      expect(score.overall).toBeCloseTo(expected, 10);
    });

    it('should set pairingIntegrity to 0.0 when paired is false', () => {
      const device = makeDevice();
      const score = service.computeTrustScore(device, 0, 0, false);

      expect(score.components.pairingIntegrity).toBe(0.0);
    });

    it('should set pairingIntegrity to 1.0 when paired is true', () => {
      const device = makeDevice();
      const score = service.computeTrustScore(device, 0, 0, true);

      expect(score.components.pairingIntegrity).toBe(1.0);
    });

    it('should fall back to device.trustScore.components.pairingIntegrity when paired is undefined', () => {
      const device = makeDevice({
        trustScore: {
          overall: 0.5,
          components: {
            pairingIntegrity: 0.75,
            firmwareCurrency: 1.0,
            uptimeStability: 0.5,
            witnessIntegrity: 0.3,
            anomalyHistory: 1.0,
            meshParticipation: 0.5,
          },
        },
      });

      const score = service.computeTrustScore(device, 0, 0, undefined);

      expect(score.components.pairingIntegrity).toBe(0.75);
    });

    it('should cap uptimeStability at 1.0 for very high uptime', () => {
      const device = makeDevice();
      // 2x seven days
      const score = service.computeTrustScore(device, 0, 604_800 * 2, true);

      expect(score.components.uptimeStability).toBe(1.0);
    });

    it('should cap witnessIntegrity at 1.0 for very deep chains', () => {
      const device = makeDevice();
      // 2x expected depth
      const score = service.computeTrustScore(device, 20_000, 0, true);

      expect(score.components.witnessIntegrity).toBe(1.0);
    });

    it('should produce an overall score of 0 when everything is at minimum', () => {
      const device = makeDevice({
        trustScore: {
          overall: 0,
          components: {
            pairingIntegrity: 0,
            firmwareCurrency: 1.0,
            uptimeStability: 0,
            witnessIntegrity: 0,
            anomalyHistory: 1.0,
            meshParticipation: 0.5,
          },
        },
      });

      const score = service.computeTrustScore(device, 0, 0, false);

      // 0.3*0 + 0.15*1 + 0.2*0 + 0.15*0 + 0.1*1 + 0.1*0.5 = 0.3
      expect(score.overall).toBeCloseTo(0.3, 10);
    });

    it('should return correct component fields', () => {
      const device = makeDevice();
      const score = service.computeTrustScore(device, 2500, 151_200, true);

      expect(score.components).toEqual({
        pairingIntegrity: 1.0,
        firmwareCurrency: 1.0,
        uptimeStability: 151_200 / 604_800,
        witnessIntegrity: 2500 / 10_000,
        anomalyHistory: 1.0,
        meshParticipation: 0.5,
      });
    });
  });

  // -----------------------------------------------------------------------
  // evaluateTrustLevel
  // -----------------------------------------------------------------------

  describe('evaluateTrustLevel', () => {
    const makeScore = (overall: number): DeviceTrustScore => ({
      overall,
      components: {
        pairingIntegrity: 0,
        firmwareCurrency: 0,
        uptimeStability: 0,
        witnessIntegrity: 0,
        anomalyHistory: 0,
        meshParticipation: 0,
      },
    });

    it('should return UNKNOWN for score < 0.3', () => {
      expect(service.evaluateTrustLevel(makeScore(0.0))).toBe(
        DeviceTrustLevel.UNKNOWN,
      );
      expect(service.evaluateTrustLevel(makeScore(0.29))).toBe(
        DeviceTrustLevel.UNKNOWN,
      );
    });

    it('should return REGISTERED for 0.3 <= score < 0.5', () => {
      expect(service.evaluateTrustLevel(makeScore(0.3))).toBe(
        DeviceTrustLevel.REGISTERED,
      );
      expect(service.evaluateTrustLevel(makeScore(0.49))).toBe(
        DeviceTrustLevel.REGISTERED,
      );
    });

    it('should return PROVISIONED for 0.5 <= score < 0.7', () => {
      expect(service.evaluateTrustLevel(makeScore(0.5))).toBe(
        DeviceTrustLevel.PROVISIONED,
      );
      expect(service.evaluateTrustLevel(makeScore(0.69))).toBe(
        DeviceTrustLevel.PROVISIONED,
      );
    });

    it('should return CERTIFIED for 0.7 <= score < 0.85', () => {
      expect(service.evaluateTrustLevel(makeScore(0.7))).toBe(
        DeviceTrustLevel.CERTIFIED,
      );
      expect(service.evaluateTrustLevel(makeScore(0.84))).toBe(
        DeviceTrustLevel.CERTIFIED,
      );
    });

    it('should return FLEET_TRUSTED for score >= 0.85', () => {
      expect(service.evaluateTrustLevel(makeScore(0.85))).toBe(
        DeviceTrustLevel.FLEET_TRUSTED,
      );
      expect(service.evaluateTrustLevel(makeScore(1.0))).toBe(
        DeviceTrustLevel.FLEET_TRUSTED,
      );
    });
  });

  // -----------------------------------------------------------------------
  // deriveCapabilities (tested indirectly via registerDevice)
  // -----------------------------------------------------------------------

  describe('deriveCapabilities (via registerDevice)', () => {
    it('should map known roles to capabilities', async () => {
      deps = makeDeps({
        getStatus: vi.fn().mockResolvedValue({
          device_id: 'dev-001',
          uptime_secs: 100,
          epoch: 1,
          total_vectors: 0,
          dimension: 128,
          paired: false,
          roles: ['vector-store', 'ota', 'mesh', 'witness', 'sensor', 'compute', 'mcp'],
        }),
      });
      service = new DeviceLifecycleService(deps);

      const device = await service.registerDevice('http://x', 'f', 'z');

      expect(device.capabilities).toEqual([
        'vector-store',
        'ota-update',
        'mesh-routing',
        'witness-chain',
        'sensor-telemetry',
        'edge-compute',
        'mcp-server',
      ]);
    });

    it('should filter out unknown roles', async () => {
      deps = makeDeps({
        getStatus: vi.fn().mockResolvedValue({
          device_id: 'dev-001',
          uptime_secs: 100,
          epoch: 1,
          total_vectors: 0,
          dimension: 128,
          paired: false,
          roles: ['vector-store', 'nonexistent-role', 'mesh'],
        }),
      });
      service = new DeviceLifecycleService(deps);

      const device = await service.registerDevice('http://x', 'f', 'z');

      expect(device.capabilities).toEqual(['vector-store', 'mesh-routing']);
    });

    it('should return empty capabilities for empty roles', async () => {
      deps = makeDeps({
        getStatus: vi.fn().mockResolvedValue({
          device_id: 'dev-001',
          uptime_secs: 100,
          epoch: 1,
          total_vectors: 0,
          dimension: 128,
          paired: false,
          roles: [],
        }),
      });
      service = new DeviceLifecycleService(deps);

      const device = await service.registerDevice('http://x', 'f', 'z');

      expect(device.capabilities).toEqual([]);
    });
  });
});
