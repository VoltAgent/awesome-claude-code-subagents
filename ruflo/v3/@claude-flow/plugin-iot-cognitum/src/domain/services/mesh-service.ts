// ---------------------------------------------------------------------------
// Dependency contract
// ---------------------------------------------------------------------------

export interface MeshServiceDeps {
  getMeshStatus: (deviceId: string) => Promise<{
    ap_active?: boolean;
    auto_mesh?: boolean;
    peer_count?: number;
    peers?: Array<{ device_id?: string; address?: string }>;
  }>;
  getPeers: (deviceId: string) => Promise<{
    count?: number;
    peers?: Array<{ device_id?: string; address?: string }>;
  }>;
  getSwarmStatus: (deviceId: string) => Promise<{
    device_id?: string;
    epoch?: number;
    peer_count?: number;
    total_vectors?: number;
    uptime_secs?: number;
  }>;
  getClusterHealth: (deviceId: string) => Promise<{
    cluster_enabled?: boolean;
    peer_count?: number;
    auto_sync_interval_secs?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface MeshPeer {
  deviceId: string;
  address?: string;
}

export interface MeshTopology {
  deviceId: string;
  apActive: boolean;
  autoMesh: boolean;
  clusterEnabled: boolean;
  autoSyncIntervalSecs: number;
  peerCount: number;
  peers: MeshPeer[];
  swarmEpoch?: number;
  swarmTotalVectors?: number;
  swarmUptimeSecs?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MeshService {
  constructor(private readonly deps: MeshServiceDeps) {}

  /**
   * Aggregate all mesh endpoints into a single topology snapshot.
   */
  async getTopology(deviceId: string): Promise<MeshTopology> {
    const [mesh, peers, swarm, cluster] = await Promise.all([
      this.deps.getMeshStatus(deviceId),
      this.deps.getPeers(deviceId),
      this.deps.getSwarmStatus(deviceId),
      this.deps.getClusterHealth(deviceId),
    ]);

    const mergedPeers = this.mergePeers(
      mesh.peers ?? [],
      peers.peers ?? [],
    );

    return {
      deviceId,
      apActive: mesh.ap_active ?? false,
      autoMesh: mesh.auto_mesh ?? false,
      clusterEnabled: cluster.cluster_enabled ?? false,
      autoSyncIntervalSecs: cluster.auto_sync_interval_secs ?? 0,
      peerCount: mergedPeers.length,
      peers: mergedPeers,
      swarmEpoch: swarm.epoch,
      swarmTotalVectors: swarm.total_vectors,
      swarmUptimeSecs: swarm.uptime_secs,
    };
  }

  /**
   * Discover and return the device IDs of all known mesh peers.
   */
  async discoverPeers(deviceId: string): Promise<string[]> {
    const [mesh, peers] = await Promise.all([
      this.deps.getMeshStatus(deviceId),
      this.deps.getPeers(deviceId),
    ]);

    const merged = this.mergePeers(
      mesh.peers ?? [],
      peers.peers ?? [],
    );

    return merged.map((p) => p.deviceId);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * De-duplicate peers from multiple sources, preferring entries that carry
   * both a device_id and an address.
   */
  private mergePeers(
    ...sources: Array<Array<{ device_id?: string; address?: string }>>
  ): MeshPeer[] {
    const seen = new Map<string, MeshPeer>();

    for (const list of sources) {
      for (const raw of list) {
        const id = raw.device_id;
        if (!id) continue;
        const existing = seen.get(id);
        if (!existing || (!existing.address && raw.address)) {
          seen.set(id, { deviceId: id, address: raw.address });
        }
      }
    }

    return [...seen.values()];
  }
}
