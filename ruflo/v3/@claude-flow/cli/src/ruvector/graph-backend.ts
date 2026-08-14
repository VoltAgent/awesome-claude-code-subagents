/**
 * @ruvector/graph-node native graph database backend (ADR-087)
 *
 * Provides persistent graph storage for agent relationships, causal edges,
 * task dependencies, and swarm topology using native Rust bindings.
 *
 * API requirements discovered via testing:
 * - createNode: requires { id, type, embedding }
 * - createEdge: requires { from, to, label, description, embedding, properties }
 * - createHyperedge: requires { nodes[], label, description, embedding, properties }
 * - kHopNeighbors(nodeId, k): returns string[] of node IDs
 * - stats(): returns { totalNodes, totalEdges, avgDegree }
 */

import { join } from 'path';

// Lazy-loaded graph-node module
let graphNodeModule: any = null;
let graphDb: any = null;
let graphBackendLoaded = false;
let graphBackendAvailable = false;

const DEFAULT_EMBEDDING_DIM = 8; // Minimal embedding for graph structure

/**
 * Load @ruvector/graph-node via createRequire (CJS package)
 */
async function loadGraphNode(): Promise<any> {
  if (graphBackendLoaded) return graphNodeModule;
  graphBackendLoaded = true;
  try {
    const { createRequire } = await import('module');
    const requireCjs = createRequire(import.meta.url);
    graphNodeModule = requireCjs('@ruvector/graph-node');
    graphBackendAvailable = true;
    return graphNodeModule;
  } catch {
    graphBackendAvailable = false;
    return null;
  }
}

/**
 * Get or create the singleton graph database instance
 */
async function getGraphDb(): Promise<any> {
  if (graphDb) return graphDb;
  const mod = await loadGraphNode();
  if (!mod) return null;

  // Use persistent path if available, otherwise in-memory
  const dataDir = join(process.cwd(), '.claude-flow', 'graph');
  try {
    const fs = await import('fs');
    fs.mkdirSync(dataDir, { recursive: true });
    graphDb = new mod.GraphDatabase(join(dataDir, 'agents.db'));
  } catch {
    // Fallback to in-memory
    graphDb = new mod.GraphDatabase();
  }
  return graphDb;
}

/**
 * Create a minimal embedding for non-vector graph operations.
 * Uses a deterministic hash of the string content.
 */
function textToMiniEmbedding(text: string): Float32Array {
  const emb = new Float32Array(DEFAULT_EMBEDDING_DIM);
  for (let i = 0; i < text.length; i++) {
    emb[i % DEFAULT_EMBEDDING_DIM] += text.charCodeAt(i) / 256;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < emb.length; i++) norm += emb[i] * emb[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < emb.length; i++) emb[i] /= norm;
  return emb;
}

// ============================================================================
// Public API
// ============================================================================

export interface GraphNodeData {
  id: string;
  type: string;
  name?: string;
  properties?: Record<string, unknown>;
}

export interface GraphEdgeData {
  from: string;
  to: string;
  label: string;
  description?: string;
  weight?: number;
  properties?: Record<string, unknown>;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  avgDegree: number;
  backend: 'graph-node' | 'unavailable';
}

/**
 * Check if graph-node backend is available
 */
export async function isGraphBackendAvailable(): Promise<boolean> {
  await loadGraphNode();
  return graphBackendAvailable;
}

/**
 * Add a node to the graph (agent, task, pattern, etc.)
 */
export async function addNode(data: GraphNodeData): Promise<string | null> {
  const db = await getGraphDb();
  if (!db) return null;
  try {
    const embedding = textToMiniEmbedding(`${data.type}:${data.name || data.id}`);
    return await db.createNode({
      id: data.id,
      type: data.type,
      ...data.properties,
      embedding,
    });
  } catch {
    return null;
  }
}

/**
 * Add an edge between two nodes
 */
export async function addEdge(data: GraphEdgeData): Promise<string | null> {
  const db = await getGraphDb();
  if (!db) return null;
  try {
    const embedding = textToMiniEmbedding(`${data.label}:${data.from}->${data.to}`);
    return await db.createEdge({
      from: data.from,
      to: data.to,
      label: data.label,
      description: data.description || data.label,
      embedding,
      properties: { weight: data.weight ?? 1.0, ...data.properties },
    });
  } catch {
    return null;
  }
}

/**
 * Create a hyperedge connecting multiple nodes (e.g., swarm teams)
 */
export async function addHyperedge(
  nodeIds: string[],
  label: string,
  description?: string,
  properties?: Record<string, unknown>,
): Promise<string | null> {
  const db = await getGraphDb();
  if (!db) return null;
  try {
    const embedding = textToMiniEmbedding(`${label}:${nodeIds.join(',')}`);
    return await db.createHyperedge({
      nodes: nodeIds,
      label,
      description: description || label,
      embedding,
      properties: properties || {},
    });
  } catch {
    return null;
  }
}

/**
 * Get k-hop neighbors of a node
 */
export async function getNeighbors(nodeId: string, hops: number = 2): Promise<string[]> {
  const db = await getGraphDb();
  if (!db) return [];
  try {
    return await db.kHopNeighbors(nodeId, hops);
  } catch {
    return [];
  }
}

/**
 * Get graph statistics
 */
export async function getGraphStats(): Promise<GraphStats> {
  const db = await getGraphDb();
  if (!db) return { totalNodes: 0, totalEdges: 0, avgDegree: 0, backend: 'unavailable' };
  try {
    const stats = await db.stats();
    return { ...stats, backend: 'graph-node' };
  } catch {
    return { totalNodes: 0, totalEdges: 0, avgDegree: 0, backend: 'unavailable' };
  }
}

/**
 * Record a causal edge (used by agentdb_causal-edge MCP tool)
 */
export async function recordCausalEdge(
  sourceId: string,
  targetId: string,
  relation: string,
  weight?: number,
): Promise<{ success: boolean; edgeId?: string; backend: string }> {
  // Ensure both nodes exist
  await addNode({ id: sourceId, type: 'memory-entry' });
  await addNode({ id: targetId, type: 'memory-entry' });

  const edgeId = await addEdge({
    from: sourceId,
    to: targetId,
    label: relation,
    description: `${relation}: ${sourceId} -> ${targetId}`,
    weight,
  });

  return {
    success: edgeId !== null,
    edgeId: edgeId ?? undefined,
    backend: graphBackendAvailable ? 'graph-node' : 'unavailable',
  };
}

/**
 * Record agent collaboration (used by swarm coordination)
 */
export async function recordCollaboration(
  agentId: string,
  agentType: string,
  taskId: string,
  taskName: string,
): Promise<{ success: boolean }> {
  await addNode({ id: agentId, type: 'agent', name: agentType });
  await addNode({ id: taskId, type: 'task', name: taskName });
  const edgeId = await addEdge({
    from: agentId,
    to: taskId,
    label: 'assigned_to',
    description: `${agentType} works on ${taskName}`,
  });
  return { success: edgeId !== null };
}

/**
 * Record swarm team as a hyperedge
 */
export async function recordSwarmTeam(
  agentIds: string[],
  topology: string,
  taskDescription?: string,
): Promise<{ success: boolean; hyperedgeId?: string }> {
  const heId = await addHyperedge(
    agentIds,
    'swarm-team',
    taskDescription || `${topology} swarm with ${agentIds.length} agents`,
    { topology, agentCount: agentIds.length },
  );
  return { success: heId !== null, hyperedgeId: heId ?? undefined };
}
