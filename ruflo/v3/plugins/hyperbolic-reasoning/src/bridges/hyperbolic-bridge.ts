/**
 * Hyperbolic Bridge - Poincare Ball and Lorentz Model Operations
 *
 * Bridge to @ruvector/hyperbolic-hnsw-wasm for hyperbolic geometry operations
 * including embeddings, distance computation, and hierarchical search.
 */

import type {
  HyperbolicPoint,
  HyperbolicModel,
  Hierarchy,
  HierarchyNode,
  EmbeddedHierarchy,
  SearchResult,
  SearchResultItem,
  EmbedHierarchyInput,
} from '../types.js';
import {
  clipToBall,
  poincareDistance,
  mobiusAdd,
  expMap,
  logMap,
  POINCARE_BALL_EPS,
} from '../types.js';

/**
 * WASM module status
 */
export type WasmModuleStatus = 'unloaded' | 'loading' | 'ready' | 'error';

/**
 * Hyperbolic HNSW index
 */
interface HyperbolicIndex {
  readonly id: string;
  readonly embeddings: Map<string, HyperbolicPoint>;
  readonly curvature: number;
  readonly dimension: number;
}

/**
 * Hyperbolic WASM module interface
 */
interface HyperbolicWasmModule {
  // Embedding operations
  embed_poincare(vector: Float32Array, curvature: number): Float32Array;
  embed_lorentz(vector: Float32Array): Float32Array;

  // Distance
  poincare_distance(a: Float32Array, b: Float32Array, curvature: number): number;
  lorentz_distance(a: Float32Array, b: Float32Array): number;

  // Mobius operations
  mobius_add(x: Float32Array, y: Float32Array, curvature: number): Float32Array;
  mobius_scalar(r: number, x: Float32Array, curvature: number): Float32Array;

  // Exponential/logarithmic maps
  exp_map(v: Float32Array, curvature: number): Float32Array;
  log_map(x: Float32Array, curvature: number): Float32Array;

  // HNSW index
  create_index(dimension: number, curvature: number): number;
  add_to_index(indexPtr: number, id: string, point: Float32Array): void;
  search_index(indexPtr: number, query: Float32Array, k: number): Float32Array;

  // Memory
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  memory: WebAssembly.Memory;
}

/**
 * Default embedding configuration
 */
const DEFAULT_EMBED_CONFIG: NonNullable<EmbedHierarchyInput['parameters']> = {
  dimensions: 32,
  curvature: -1.0,
  learnCurvature: true,
  epochs: 100,
  learningRate: 0.01,
};

/**
 * Hyperbolic Embeddings Bridge
 */
export class HyperbolicBridge {
  readonly name = 'hyperbolic-reasoning-bridge';
  readonly version = '0.1.0';

  private _status: WasmModuleStatus = 'unloaded';
  private _module: HyperbolicWasmModule | null = null;
  private _indices: Map<string, HyperbolicIndex> = new Map();

  get status(): WasmModuleStatus {
    return this._status;
  }

  get initialized(): boolean {
    return this._status === 'ready';
  }

  /**
   * Initialize the WASM module
   */
  async initialize(): Promise<void> {
    if (this._status === 'ready') return;
    if (this._status === 'loading') return;

    this._status = 'loading';

    try {
      // Dynamic import - module may not be installed
      const wasmModule = await import(/* webpackIgnore: true */ '@ruvector/hyperbolic-hnsw-wasm' as string).catch(() => null);

      if (wasmModule) {
        this._module = wasmModule as unknown as HyperbolicWasmModule;
      } else {
        this._module = this.createMockModule();
      }

      this._status = 'ready';
    } catch (error) {
      this._status = 'error';
      throw new Error(`Failed to initialize HyperbolicBridge: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Dispose of resources
   */
  async dispose(): Promise<void> {
    this._indices.clear();
    this._module = null;
    this._status = 'unloaded';
  }

  /**
   * Embed a hierarchy into hyperbolic space
   */
  async embedHierarchy(
    hierarchy: Hierarchy,
    config: Partial<EmbedHierarchyInput['parameters']> = {}
  ): Promise<EmbeddedHierarchy> {
    if (!this._module) {
      throw new Error('HyperbolicBridge not initialized');
    }

    const mergedConfig = { ...DEFAULT_EMBED_CONFIG, ...config };
    this.validateHierarchy(hierarchy);

    // Initialize embeddings
    const embeddings = new Map<string, HyperbolicPoint>();
    const nodeIndex = new Map<string, number>();
    const parentMap = new Map<string, string | null>();

    hierarchy.nodes.forEach((node, idx) => {
      nodeIndex.set(node.id, idx);
      parentMap.set(node.id, node.parent);
    });

    // Find root(s) and compute depths
    const depths = new Map<string, number>();
    const computeDepth = (nodeId: string): number => {
      if (depths.has(nodeId)) return depths.get(nodeId)!;

      const parent = parentMap.get(nodeId);
      if (parent === null || parent === undefined) {
        depths.set(nodeId, 0);
        return 0;
      }

      const depth = computeDepth(parent) + 1;
      depths.set(nodeId, depth);
      return depth;
    };

    hierarchy.nodes.forEach(node => computeDepth(node.id));

    // Initialize random embeddings
    const rawEmbeddings = new Map<string, Float32Array>();

    for (const node of hierarchy.nodes) {
      const depth = depths.get(node.id) ?? 0;
      const embedding = new Float32Array(mergedConfig.dimensions);

      // Initialize with depth-based radius
      // Root near center, deeper nodes near boundary
      const maxDepth = Math.max(...Array.from(depths.values()));
      const targetRadius = 0.1 + 0.8 * (depth / (maxDepth + 1));

      // Random direction
      let norm = 0;
      for (let i = 0; i < mergedConfig.dimensions; i++) {
        embedding[i] = (Math.random() - 0.5) * 2;
        norm += embedding[i]! * embedding[i]!;
      }
      norm = Math.sqrt(norm);

      // Scale to target radius
      for (let i = 0; i < mergedConfig.dimensions; i++) {
        embedding[i] = (embedding[i]! / norm) * targetRadius;
      }

      rawEmbeddings.set(node.id, embedding);
    }

    // Optimization loop using Riemannian SGD
    let curvature = mergedConfig.curvature;

    for (let epoch = 0; epoch < mergedConfig.epochs; epoch++) {
      const lr = mergedConfig.learningRate * Math.pow(0.99, epoch);

      // For each edge (parent-child pair), minimize hyperbolic distance
      for (const node of hierarchy.nodes) {
        if (node.parent === null) continue;

        const childEmb = rawEmbeddings.get(node.id);
        const parentEmb = rawEmbeddings.get(node.parent);

        if (!childEmb || !parentEmb) continue;

        // Compute gradient of hyperbolic distance
        const grad = this.computeDistanceGradient(childEmb, parentEmb, curvature);

        // Parent should be closer to origin than child
        const childNorm = Math.sqrt(childEmb.reduce((s, v) => s + v * v, 0));
        const parentNorm = Math.sqrt(parentEmb.reduce((s, v) => s + v * v, 0));

        if (parentNorm > childNorm * 0.9) {
          // Push parent toward origin
          for (let i = 0; i < mergedConfig.dimensions; i++) {
            parentEmb[i] = parentEmb[i]! * 0.95;
          }
        }

        // Apply gradient update in tangent space
        const childTangent = logMap(childEmb, curvature);
        for (let i = 0; i < mergedConfig.dimensions; i++) {
          childTangent[i] -= lr * grad.child[i]!;
        }

        const newChildEmb = expMap(childTangent, curvature);
        rawEmbeddings.set(node.id, clipToBall(newChildEmb, curvature));
      }

      // Learn curvature if enabled
      if (mergedConfig.learnCurvature && epoch % 10 === 0) {
        const curvatureGrad = this.estimateCurvatureGradient(hierarchy, rawEmbeddings, curvature);
        curvature = Math.max(-10, Math.min(-0.01, curvature - lr * curvatureGrad));
      }
    }

    // Create final embeddings
    for (const [nodeId, rawEmb] of rawEmbeddings) {
      embeddings.set(nodeId, {
        coordinates: clipToBall(rawEmb, curvature),
        curvature,
        dimension: mergedConfig.dimensions,
      });
    }

    // Compute quality metrics
    const metrics = this.computeEmbeddingMetrics(hierarchy, embeddings);

    return {
      embeddings,
      model: 'poincare_ball',
      curvature,
      dimension: mergedConfig.dimensions,
      metrics,
    };
  }

  /**
   * Compute hyperbolic distance between two points
   */
  distance(a: HyperbolicPoint, b: HyperbolicPoint): number {
    if (a.curvature !== b.curvature) {
      throw new Error('Cannot compute distance between points with different curvatures');
    }
    return poincareDistance(a.coordinates, b.coordinates, a.curvature);
  }

  /**
   * Check if one point is ancestor of another (closer to origin)
   */
  isAncestor(parent: HyperbolicPoint, child: HyperbolicPoint, threshold = 0.1): boolean {
    const parentNorm = Math.sqrt(parent.coordinates.reduce((s, v) => s + v * v, 0));
    const childNorm = Math.sqrt(child.coordinates.reduce((s, v) => s + v * v, 0));
    return parentNorm < childNorm - threshold;
  }

  /**
   * Get hierarchy depth from hyperbolic point
   */
  hierarchyDepth(point: HyperbolicPoint): number {
    const norm = Math.sqrt(point.coordinates.reduce((s, v) => s + v * v, 0));
    return Math.atanh(Math.min(norm, 1 - POINCARE_BALL_EPS));
  }

  /**
   * Create or get an index
   */
  createIndex(id: string, dimension: number, curvature: number): void {
    if (this._indices.has(id)) {
      throw new Error(`Index ${id} already exists`);
    }

    this._indices.set(id, {
      id,
      embeddings: new Map(),
      curvature,
      dimension,
    });
  }

  /**
   * Add point to index
   */
  addToIndex(indexId: string, nodeId: string, point: HyperbolicPoint): void {
    const index = this._indices.get(indexId);
    if (!index) {
      throw new Error(`Index ${indexId} not found`);
    }

    index.embeddings.set(nodeId, point);
  }

  /**
   * Search in hyperbolic space
   */
  async search(
    query: HyperbolicPoint,
    indexId: string,
    k: number,
    mode: 'nearest' | 'subtree' | 'ancestors' | 'siblings' | 'cone' = 'nearest'
  ): Promise<SearchResult> {
    const startTime = performance.now();
    const index = this._indices.get(indexId);

    if (!index) {
      throw new Error(`Index ${indexId} not found`);
    }

    const results: SearchResultItem[] = [];
    const queryDepth = this.hierarchyDepth(query);

    for (const [nodeId, point] of index.embeddings) {
      const dist = this.distance(query, point);
      const nodeDepth = this.hierarchyDepth(point);

      let include = false;

      switch (mode) {
        case 'nearest':
          include = true;
          break;
        case 'subtree':
          // Include nodes deeper than query
          include = this.isAncestor(query, point);
          break;
        case 'ancestors':
          // Include nodes shallower than query
          include = this.isAncestor(point, query);
          break;
        case 'siblings':
          // Include nodes at similar depth
          include = Math.abs(nodeDepth - queryDepth) < 0.5;
          break;
        case 'cone':
          // Include nodes in a hyperbolic cone
          include = this.inCone(query, point, Math.PI / 4);
          break;
      }

      if (include) {
        results.push({
          id: nodeId,
          distance: dist,
          similarity: Math.exp(-dist),
        });
      }
    }

    // Sort by distance and take top k
    results.sort((a, b) => a.distance - b.distance);
    const topK = results.slice(0, k);

    return {
      items: topK,
      totalCandidates: results.length,
      searchTimeMs: performance.now() - startTime,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private validateHierarchy(hierarchy: Hierarchy): void {
    if (hierarchy.nodes.length === 0) {
      throw new Error('Hierarchy must have at least one node');
    }

    if (hierarchy.nodes.length > 1_000_000) {
      throw new Error('Hierarchy exceeds maximum size of 1M nodes');
    }

    // Check for cycles
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (inStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      inStack.add(nodeId);

      const node = hierarchy.nodes.find(n => n.id === nodeId);
      if (node?.parent) {
        if (hasCycle(node.parent)) return true;
      }

      inStack.delete(nodeId);
      return false;
    };

    for (const node of hierarchy.nodes) {
      if (hasCycle(node.id)) {
        throw new Error('Hierarchy contains cycles');
      }
    }

    // Check max depth
    const depths = new Map<string, number>();
    const computeDepth = (node: HierarchyNode): number => {
      if (depths.has(node.id)) return depths.get(node.id)!;

      if (node.parent === null) {
        depths.set(node.id, 0);
        return 0;
      }

      const parent = hierarchy.nodes.find(n => n.id === node.parent);
      if (!parent) {
        depths.set(node.id, 0);
        return 0;
      }

      const depth = computeDepth(parent) + 1;
      depths.set(node.id, depth);
      return depth;
    };

    let maxDepth = 0;
    for (const node of hierarchy.nodes) {
      maxDepth = Math.max(maxDepth, computeDepth(node));
    }

    if (maxDepth > 100) {
      throw new Error(`Hierarchy too deep: ${maxDepth} > 100`);
    }
  }

  private computeDistanceGradient(
    x: Float32Array,
    y: Float32Array,
    c: number
  ): { child: Float32Array; parent: Float32Array } {
    const eps = 1e-6;
    const childGrad = new Float32Array(x.length);
    const parentGrad = new Float32Array(x.length);

    const d0 = poincareDistance(x, y, c);

    for (let i = 0; i < x.length; i++) {
      // Gradient w.r.t. x
      const xPlus = new Float32Array(x);
      xPlus[i] += eps;
      childGrad[i] = (poincareDistance(xPlus, y, c) - d0) / eps;

      // Gradient w.r.t. y
      const yPlus = new Float32Array(y);
      yPlus[i] += eps;
      parentGrad[i] = (poincareDistance(x, yPlus, c) - d0) / eps;
    }

    return { child: childGrad, parent: parentGrad };
  }

  private estimateCurvatureGradient(
    hierarchy: Hierarchy,
    embeddings: Map<string, Float32Array>,
    curvature: number
  ): number {
    const eps = 0.01;
    let loss0 = 0;
    let lossPlus = 0;

    for (const node of hierarchy.nodes) {
      if (node.parent === null) continue;

      const childEmb = embeddings.get(node.id);
      const parentEmb = embeddings.get(node.parent);

      if (!childEmb || !parentEmb) continue;

      loss0 += poincareDistance(childEmb, parentEmb, curvature);
      lossPlus += poincareDistance(childEmb, parentEmb, curvature + eps);
    }

    return (lossPlus - loss0) / eps;
  }

  private computeEmbeddingMetrics(
    hierarchy: Hierarchy,
    embeddings: Map<string, HyperbolicPoint>
  ): { distortionMean: number; distortionMax: number; mapScore: number } {
    let totalDistortion = 0;
    let maxDistortion = 0;
    let count = 0;

    // Compute distortion for parent-child pairs
    for (const node of hierarchy.nodes) {
      if (node.parent === null) continue;

      const childEmb = embeddings.get(node.id);
      const parentEmb = embeddings.get(node.parent);

      if (!childEmb || !parentEmb) continue;

      const hypDist = this.distance(childEmb, parentEmb);
      const idealDist = 1.0; // Target distance between parent and child

      const distortion = Math.abs(hypDist - idealDist) / idealDist;
      totalDistortion += distortion;
      maxDistortion = Math.max(maxDistortion, distortion);
      count++;
    }

    // Mean Average Precision for hierarchy preservation
    let mapScore = 0;
    let mapCount = 0;

    for (const node of hierarchy.nodes) {
      if (node.parent === null) continue;

      const childEmb = embeddings.get(node.id);
      const parentEmb = embeddings.get(node.parent);

      if (!childEmb || !parentEmb) continue;

      // Check if parent is correctly identified as ancestor
      if (this.isAncestor(parentEmb, childEmb)) {
        mapScore += 1;
      }
      mapCount++;
    }

    return {
      distortionMean: count > 0 ? totalDistortion / count : 0,
      distortionMax: maxDistortion,
      mapScore: mapCount > 0 ? mapScore / mapCount : 1,
    };
  }

  private inCone(apex: HyperbolicPoint, point: HyperbolicPoint, angle: number): boolean {
    // Check if point is within a hyperbolic cone with apex at the given point
    const apexNorm = Math.sqrt(apex.coordinates.reduce((s, v) => s + v * v, 0));
    const pointNorm = Math.sqrt(point.coordinates.reduce((s, v) => s + v * v, 0));

    if (pointNorm <= apexNorm) return false;

    // Compute angular distance
    const dot = apex.coordinates.reduce((s, v, i) => s + v * (point.coordinates[i] ?? 0), 0);
    const cosAngle = dot / (apexNorm * pointNorm + 1e-10);

    return Math.acos(Math.min(1, Math.max(-1, cosAngle))) < angle;
  }

  /**
   * Create mock module for development
   */
  private createMockModule(): HyperbolicWasmModule {
    return {
      embed_poincare: (v: Float32Array, c: number) => expMap(v, c),
      embed_lorentz: (v: Float32Array) => v,
      poincare_distance: poincareDistance,
      lorentz_distance: () => 0,
      mobius_add: mobiusAdd,
      mobius_scalar: (r: number, x: Float32Array, c: number) => {
        const result = expMap(new Float32Array(x.map(v => v * r)), c);
        return clipToBall(result, c);
      },
      exp_map: expMap,
      log_map: logMap,
      create_index: () => 0,
      add_to_index: () => undefined,
      search_index: () => new Float32Array(0),
      alloc: () => 0,
      dealloc: () => undefined,
      memory: new WebAssembly.Memory({ initial: 1 }),
    };
  }
}

/**
 * Create a new HyperbolicBridge instance
 */
export function createHyperbolicBridge(): HyperbolicBridge {
  return new HyperbolicBridge();
}
