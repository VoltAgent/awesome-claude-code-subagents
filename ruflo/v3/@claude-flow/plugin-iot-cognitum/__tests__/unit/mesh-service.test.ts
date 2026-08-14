import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeshService } from '../../src/domain/services/mesh-service.js';
import type { MeshServiceDeps } from '../../src/domain/services/mesh-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(
  overrides: Partial<MeshServiceDeps> = {},
): MeshServiceDeps {
  return {
    getMeshStatus: vi.fn().mockResolvedValue({
      ap_active: true,
      auto_mesh: true,
      peer_count: 2,
      peers: [
        { device_id: 'peer-1', address: '10.0.0.1' },
        { device_id: 'peer-2' },
      ],
    }),
    getPeers: vi.fn().mockResolvedValue({
      count: 2,
      peers: [
        { device_id: 'peer-2', address: '10.0.0.2' },
        { device_id: 'peer-3', address: '10.0.0.3' },
      ],
    }),
    getSwarmStatus: vi.fn().mockResolvedValue({
      device_id: 'dev-001',
      epoch: 42,
      peer_count: 3,
      total_vectors: 5000,
      uptime_secs: 86_400,
    }),
    getClusterHealth: vi.fn().mockResolvedValue({
      cluster_enabled: true,
      peer_count: 3,
      auto_sync_interval_secs: 60,
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MeshService', () => {
  let deps: MeshServiceDeps;
  let service: MeshService;

  beforeEach(() => {
    deps = makeDeps();
    service = new MeshService(deps);
  });

  // -----------------------------------------------------------------------
  // getTopology
  // -----------------------------------------------------------------------

  describe('getTopology', () => {
    it('should parallel-fetch all 4 deps and return a MeshTopology', async () => {
      const topo = await service.getTopology('dev-001');

      expect(deps.getMeshStatus).toHaveBeenCalledWith('dev-001');
      expect(deps.getPeers).toHaveBeenCalledWith('dev-001');
      expect(deps.getSwarmStatus).toHaveBeenCalledWith('dev-001');
      expect(deps.getClusterHealth).toHaveBeenCalledWith('dev-001');

      expect(topo.deviceId).toBe('dev-001');
      expect(topo.apActive).toBe(true);
      expect(topo.autoMesh).toBe(true);
      expect(topo.clusterEnabled).toBe(true);
      expect(topo.autoSyncIntervalSecs).toBe(60);
      expect(topo.swarmEpoch).toBe(42);
      expect(topo.swarmTotalVectors).toBe(5000);
      expect(topo.swarmUptimeSecs).toBe(86_400);
    });

    it('should merge peers from mesh and getPeers, deduplicating by device_id', async () => {
      const topo = await service.getTopology('dev-001');

      // peer-1 from mesh only, peer-2 from both (getPeers has address), peer-3 from getPeers
      expect(topo.peers).toHaveLength(3);
      const ids = topo.peers.map((p) => p.deviceId).sort();
      expect(ids).toEqual(['peer-1', 'peer-2', 'peer-3']);
    });

    it('should set peerCount to the number of merged peers', async () => {
      const topo = await service.getTopology('dev-001');

      expect(topo.peerCount).toBe(topo.peers.length);
    });

    it('should default boolean fields to false when undefined', async () => {
      deps = makeDeps({
        getMeshStatus: vi.fn().mockResolvedValue({}),
        getClusterHealth: vi.fn().mockResolvedValue({}),
      });
      service = new MeshService(deps);

      const topo = await service.getTopology('dev-001');

      expect(topo.apActive).toBe(false);
      expect(topo.autoMesh).toBe(false);
      expect(topo.clusterEnabled).toBe(false);
      expect(topo.autoSyncIntervalSecs).toBe(0);
    });

    it('should handle empty peer arrays', async () => {
      deps = makeDeps({
        getMeshStatus: vi.fn().mockResolvedValue({ peers: [] }),
        getPeers: vi.fn().mockResolvedValue({ peers: [] }),
      });
      service = new MeshService(deps);

      const topo = await service.getTopology('dev-001');

      expect(topo.peers).toEqual([]);
      expect(topo.peerCount).toBe(0);
    });

    it('should handle undefined peers arrays', async () => {
      deps = makeDeps({
        getMeshStatus: vi.fn().mockResolvedValue({ ap_active: false }),
        getPeers: vi.fn().mockResolvedValue({ count: 0 }),
      });
      service = new MeshService(deps);

      const topo = await service.getTopology('dev-001');

      expect(topo.peers).toEqual([]);
      expect(topo.peerCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // discoverPeers
  // -----------------------------------------------------------------------

  describe('discoverPeers', () => {
    it('should return deduplicated peer device IDs', async () => {
      const peerIds = await service.discoverPeers('dev-001');

      const sorted = [...peerIds].sort();
      expect(sorted).toEqual(['peer-1', 'peer-2', 'peer-3']);
    });

    it('should return empty array when no peers', async () => {
      deps = makeDeps({
        getMeshStatus: vi.fn().mockResolvedValue({ peers: [] }),
        getPeers: vi.fn().mockResolvedValue({ peers: [] }),
      });
      service = new MeshService(deps);

      const peerIds = await service.discoverPeers('dev-001');

      expect(peerIds).toEqual([]);
    });

    it('should only call getMeshStatus and getPeers (not swarm/cluster)', async () => {
      await service.discoverPeers('dev-001');

      expect(deps.getMeshStatus).toHaveBeenCalledWith('dev-001');
      expect(deps.getPeers).toHaveBeenCalledWith('dev-001');
      expect(deps.getSwarmStatus).not.toHaveBeenCalled();
      expect(deps.getClusterHealth).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Peer merging logic
  // -----------------------------------------------------------------------

  describe('peer merging', () => {
    it('should deduplicate by device_id', async () => {
      deps = makeDeps({
        getMeshStatus: vi.fn().mockResolvedValue({
          peers: [
            { device_id: 'same-id', address: '10.0.0.1' },
          ],
        }),
        getPeers: vi.fn().mockResolvedValue({
          peers: [
            { device_id: 'same-id', address: '10.0.0.2' },
          ],
        }),
      });
      service = new MeshService(deps);

      const topo = await service.getTopology('dev-001');

      expect(topo.peers).toHaveLength(1);
      expect(topo.peers[0].deviceId).toBe('same-id');
    });

    it('should prefer entries with address over entries without', async () => {
      deps = makeDeps({
        getMeshStatus: vi.fn().mockResolvedValue({
          peers: [
            { device_id: 'peer-x' }, // no address
          ],
        }),
        getPeers: vi.fn().mockResolvedValue({
          peers: [
            { device_id: 'peer-x', address: '10.0.0.5' }, // has address
          ],
        }),
      });
      service = new MeshService(deps);

      const topo = await service.getTopology('dev-001');

      expect(topo.peers).toHaveLength(1);
      expect(topo.peers[0].address).toBe('10.0.0.5');
    });

    it('should not replace an entry that already has an address', async () => {
      deps = makeDeps({
        getMeshStatus: vi.fn().mockResolvedValue({
          peers: [
            { device_id: 'peer-x', address: '10.0.0.1' }, // has address
          ],
        }),
        getPeers: vi.fn().mockResolvedValue({
          peers: [
            { device_id: 'peer-x' }, // no address — should not overwrite
          ],
        }),
      });
      service = new MeshService(deps);

      const topo = await service.getTopology('dev-001');

      expect(topo.peers).toHaveLength(1);
      expect(topo.peers[0].address).toBe('10.0.0.1');
    });

    it('should skip peers without a device_id', async () => {
      deps = makeDeps({
        getMeshStatus: vi.fn().mockResolvedValue({
          peers: [
            { address: '10.0.0.1' }, // no device_id
            { device_id: 'valid-peer', address: '10.0.0.2' },
          ],
        }),
        getPeers: vi.fn().mockResolvedValue({ peers: [] }),
      });
      service = new MeshService(deps);

      const topo = await service.getTopology('dev-001');

      expect(topo.peers).toHaveLength(1);
      expect(topo.peers[0].deviceId).toBe('valid-peer');
    });
  });
});
