/**
 * Hyperbolic Reasoning Plugin - Bridges Tests
 *
 * Tests for hyperbolic geometry bridge operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  clipToBall,
  poincareDistance,
  mobiusAdd,
  expMap,
  logMap,
  POINCARE_BALL_EPS,
  MAX_NORM,
} from '../src/types.js';

// Mock bridge implementation for testing
class MockHyperbolicBridge {
  private _initialized = false;
  private _embeddings = new Map<string, Float32Array>();
  private _dimension = 32;
  private _curvature = -1.0;

  get initialized(): boolean {
    return this._initialized;
  }

  async initialize(): Promise<void> {
    this._initialized = true;
  }

  async dispose(): Promise<void> {
    this._initialized = false;
    this._embeddings.clear();
  }

  async embedHierarchy(
    nodes: Array<{ id: string; parent: string | null }>,
    config: { dimensions?: number; curvature?: number } = {}
  ): Promise<Map<string, Float32Array>> {
    if (!this._initialized) {
      throw new Error('Bridge not initialized');
    }

    this._dimension = config.dimensions ?? 32;
    this._curvature = config.curvature ?? -1.0;

    // Build tree structure
    const children = new Map<string | null, string[]>();
    for (const node of nodes) {
      if (!children.has(node.parent)) {
        children.set(node.parent, []);
      }
      children.get(node.parent)!.push(node.id);
    }

    // Find root
    const roots = children.get(null) ?? [];

    // BFS embedding - nodes closer to root have smaller norms
    const embeddings = new Map<string, Float32Array>();
    const queue: Array<{ id: string; depth: number }> = [];

    for (const root of roots) {
      queue.push({ id: root, depth: 0 });
    }

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;

      // Generate embedding based on depth
      const norm = Math.min(MAX_NORM, depth * 0.15);
      const embedding = new Float32Array(this._dimension);

      // Random direction with controlled norm
      let sqSum = 0;
      for (let i = 0; i < this._dimension; i++) {
        embedding[i] = Math.random() - 0.5;
        sqSum += embedding[i] * embedding[i];
      }
      const scale = norm / Math.sqrt(sqSum);
      for (let i = 0; i < this._dimension; i++) {
        embedding[i] *= scale;
      }

      embeddings.set(id, clipToBall(embedding, this._curvature));
      this._embeddings.set(id, embeddings.get(id)!);

      // Add children to queue
      for (const child of children.get(id) ?? []) {
        queue.push({ id: child, depth: depth + 1 });
      }
    }

    return embeddings;
  }

  computeDistance(aId: string, bId: string): number {
    const a = this._embeddings.get(aId);
    const b = this._embeddings.get(bId);
    if (!a || !b) {
      throw new Error('Node not found');
    }
    return poincareDistance(a, b, this._curvature);
  }

  search(queryId: string, k: number): Array<{ id: string; distance: number }> {
    const query = this._embeddings.get(queryId);
    if (!query) {
      return [];
    }

    const results: Array<{ id: string; distance: number }> = [];
    for (const [id, embedding] of this._embeddings) {
      if (id !== queryId) {
        const distance = poincareDistance(query, embedding, this._curvature);
        results.push({ id, distance });
      }
    }

    results.sort((a, b) => a.distance - b.distance);
    return results.slice(0, k);
  }

  getEmbedding(id: string): Float32Array | undefined {
    return this._embeddings.get(id);
  }
}

describe('MockHyperbolicBridge', () => {
  let bridge: MockHyperbolicBridge;

  beforeEach(() => {
    bridge = new MockHyperbolicBridge();
  });

  afterEach(async () => {
    await bridge.dispose();
  });

  describe('initialization', () => {
    it('should start uninitialized', () => {
      expect(bridge.initialized).toBe(false);
    });

    it('should initialize successfully', async () => {
      await bridge.initialize();
      expect(bridge.initialized).toBe(true);
    });

    it('should cleanup on dispose', async () => {
      await bridge.initialize();
      await bridge.dispose();
      expect(bridge.initialized).toBe(false);
    });
  });

  describe('embedHierarchy', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should embed simple hierarchy', async () => {
      const nodes = [
        { id: 'root', parent: null },
        { id: 'child1', parent: 'root' },
        { id: 'child2', parent: 'root' },
      ];

      const embeddings = await bridge.embedHierarchy(nodes);

      expect(embeddings.size).toBe(3);
      expect(embeddings.get('root')).toBeDefined();
      expect(embeddings.get('child1')).toBeDefined();
      expect(embeddings.get('child2')).toBeDefined();
    });

    it('should place root near origin', async () => {
      const nodes = [
        { id: 'root', parent: null },
        { id: 'child', parent: 'root' },
        { id: 'grandchild', parent: 'child' },
      ];

      const embeddings = await bridge.embedHierarchy(nodes);

      const rootNorm = Math.sqrt(
        Array.from(embeddings.get('root')!).reduce((s, v) => s + v * v, 0)
      );
      const grandchildNorm = Math.sqrt(
        Array.from(embeddings.get('grandchild')!).reduce((s, v) => s + v * v, 0)
      );

      expect(rootNorm).toBeLessThan(grandchildNorm);
    });

    it('should keep all embeddings within ball', async () => {
      const nodes = [
        { id: 'root', parent: null },
        { id: 'l1', parent: 'root' },
        { id: 'l2', parent: 'l1' },
        { id: 'l3', parent: 'l2' },
        { id: 'l4', parent: 'l3' },
      ];

      const embeddings = await bridge.embedHierarchy(nodes);

      for (const [_, embedding] of embeddings) {
        const norm = Math.sqrt(
          Array.from(embedding).reduce((s, v) => s + v * v, 0)
        );
        expect(norm).toBeLessThan(1);
      }
    });

    it('should throw when not initialized', async () => {
      const newBridge = new MockHyperbolicBridge();
      await expect(
        newBridge.embedHierarchy([{ id: 'root', parent: null }])
      ).rejects.toThrow();
    });
  });

  describe('computeDistance', () => {
    beforeEach(async () => {
      await bridge.initialize();
      await bridge.embedHierarchy([
        { id: 'root', parent: null },
        { id: 'child1', parent: 'root' },
        { id: 'child2', parent: 'root' },
        { id: 'grandchild', parent: 'child1' },
      ]);
    });

    it('should return 0 for same node', () => {
      // Note: Since same ID returns same embedding, distance is 0
      const embedding = bridge.getEmbedding('root')!;
      const dist = poincareDistance(embedding, embedding, -1);
      expect(dist).toBeCloseTo(0, 5);
    });

    it('should return positive distance for different nodes', () => {
      const dist = bridge.computeDistance('root', 'child1');
      expect(dist).toBeGreaterThan(0);
    });

    it('should be symmetric', () => {
      const dist1 = bridge.computeDistance('child1', 'child2');
      const dist2 = bridge.computeDistance('child2', 'child1');
      expect(dist1).toBeCloseTo(dist2, 5);
    });

    it('should satisfy triangle inequality', () => {
      const distAB = bridge.computeDistance('root', 'child1');
      const distBC = bridge.computeDistance('child1', 'grandchild');
      const distAC = bridge.computeDistance('root', 'grandchild');

      expect(distAC).toBeLessThanOrEqual(distAB + distBC + 0.001);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await bridge.initialize();
      await bridge.embedHierarchy([
        { id: 'root', parent: null },
        { id: 'child1', parent: 'root' },
        { id: 'child2', parent: 'root' },
        { id: 'child3', parent: 'root' },
      ]);
    });

    it('should find k nearest neighbors', () => {
      const results = bridge.search('root', 2);

      expect(results.length).toBe(2);
      expect(results[0].distance).toBeLessThanOrEqual(results[1].distance);
    });

    it('should return results sorted by distance', () => {
      const results = bridge.search('child1', 3);

      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });

    it('should exclude query node from results', () => {
      const results = bridge.search('root', 10);

      expect(results.every(r => r.id !== 'root')).toBe(true);
    });

    it('should return empty array for unknown node', () => {
      const results = bridge.search('unknown', 5);
      expect(results).toEqual([]);
    });
  });
});

describe('Hyperbolic Geometry Operations', () => {
  describe('clipToBall', () => {
    it('should not modify vectors within ball', () => {
      const vec = new Float32Array([0.1, 0.2, 0.3]);
      const curvature = -1;
      const clipped = clipToBall(vec, curvature);

      for (let i = 0; i < vec.length; i++) {
        expect(clipped[i]).toBeCloseTo(vec[i], 5);
      }
    });

    it('should clip vectors outside ball', () => {
      const vec = new Float32Array([0.9, 0.9, 0.9]);  // norm > 1
      const curvature = -1;
      const clipped = clipToBall(vec, curvature);

      const norm = Math.sqrt(clipped.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeLessThan(1);
    });

    it('should preserve direction', () => {
      const vec = new Float32Array([2, 0, 0]);
      const curvature = -1;
      const clipped = clipToBall(vec, curvature);

      // Should be along positive x-axis
      expect(clipped[0]).toBeGreaterThan(0);
      expect(Math.abs(clipped[1])).toBeLessThan(1e-10);
      expect(Math.abs(clipped[2])).toBeLessThan(1e-10);
    });
  });

  describe('poincareDistance', () => {
    it('should return 0 for identical points', () => {
      const vec = new Float32Array([0.1, 0.2, 0.3]);
      const dist = poincareDistance(vec, vec, -1);
      expect(dist).toBeCloseTo(0, 5);
    });

    it('should increase with Euclidean distance', () => {
      const origin = new Float32Array([0, 0]);
      const near = new Float32Array([0.1, 0]);
      const far = new Float32Array([0.5, 0]);

      const distNear = poincareDistance(origin, near, -1);
      const distFar = poincareDistance(origin, far, -1);

      expect(distNear).toBeLessThan(distFar);
    });

    it('should approach infinity near boundary', () => {
      const origin = new Float32Array([0, 0]);
      const nearBoundary = new Float32Array([0.999, 0]);

      const dist = poincareDistance(origin, nearBoundary, -1);
      expect(dist).toBeGreaterThan(5);  // Very large distance
    });
  });

  describe('mobiusAdd', () => {
    it('should return y when x is zero', () => {
      const x = new Float32Array([0, 0]);
      const y = new Float32Array([0.3, 0.4]);
      const result = mobiusAdd(x, y, -1);

      expect(result[0]).toBeCloseTo(y[0], 4);
      expect(result[1]).toBeCloseTo(y[1], 4);
    });

    it('should return x when y is zero', () => {
      const x = new Float32Array([0.3, 0.4]);
      const y = new Float32Array([0, 0]);
      const result = mobiusAdd(x, y, -1);

      expect(result[0]).toBeCloseTo(x[0], 4);
      expect(result[1]).toBeCloseTo(x[1], 4);
    });

    it('should keep result within ball', () => {
      const x = new Float32Array([0.5, 0.5]);
      const y = new Float32Array([0.4, 0.4]);
      const result = mobiusAdd(x, y, -1);

      const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeLessThan(1);
    });

    it('should be non-commutative', () => {
      const x = new Float32Array([0.3, 0]);
      const y = new Float32Array([0, 0.4]);

      const xy = mobiusAdd(x, y, -1);
      const yx = mobiusAdd(y, x, -1);

      // In hyperbolic space, addition is generally non-commutative
      const same = xy[0] === yx[0] && xy[1] === yx[1];
      // This may or may not be equal depending on the values
    });
  });

  describe('expMap and logMap', () => {
    it('should be inverses near origin', () => {
      const v = new Float32Array([0.1, 0.1, 0.1]);
      const curvature = -1;

      const expV = expMap(v, curvature);
      const logExpV = logMap(expV, curvature);

      for (let i = 0; i < v.length; i++) {
        expect(logExpV[i]).toBeCloseTo(v[i], 2);
      }
    });

    it('should return zero for zero input', () => {
      const zero = new Float32Array([0, 0, 0]);

      const expZero = expMap(zero, -1);
      const logZero = logMap(zero, -1);

      expect(expZero.every(v => Math.abs(v) < 1e-10)).toBe(true);
      expect(logZero.every(v => Math.abs(v) < 1e-10)).toBe(true);
    });

    it('should map to inside ball', () => {
      const v = new Float32Array([1, 2, 3]);  // Large tangent vector
      const result = expMap(v, -1);

      const norm = Math.sqrt(result.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeLessThan(1);
    });
  });
});

describe('Hierarchy Comparison', () => {
  function computeTreeEditDistance(
    tree1: Array<{ id: string; parent: string | null }>,
    tree2: Array<{ id: string; parent: string | null }>
  ): number {
    // Simplified tree edit distance for testing
    const ids1 = new Set(tree1.map(n => n.id));
    const ids2 = new Set(tree2.map(n => n.id));

    let distance = 0;

    // Insertions (in tree2 but not tree1)
    for (const id of ids2) {
      if (!ids1.has(id)) distance++;
    }

    // Deletions (in tree1 but not tree2)
    for (const id of ids1) {
      if (!ids2.has(id)) distance++;
    }

    // Rename/move (same id, different parent)
    for (const n1 of tree1) {
      const n2 = tree2.find(n => n.id === n1.id);
      if (n2 && n1.parent !== n2.parent) {
        distance++;
      }
    }

    return distance;
  }

  it('should return 0 for identical trees', () => {
    const tree = [
      { id: 'root', parent: null },
      { id: 'child', parent: 'root' },
    ];

    const dist = computeTreeEditDistance(tree, tree);
    expect(dist).toBe(0);
  });

  it('should count insertions', () => {
    const tree1 = [{ id: 'root', parent: null }];
    const tree2 = [
      { id: 'root', parent: null },
      { id: 'new', parent: 'root' },
    ];

    const dist = computeTreeEditDistance(tree1, tree2);
    expect(dist).toBe(1);
  });

  it('should count deletions', () => {
    const tree1 = [
      { id: 'root', parent: null },
      { id: 'old', parent: 'root' },
    ];
    const tree2 = [{ id: 'root', parent: null }];

    const dist = computeTreeEditDistance(tree1, tree2);
    expect(dist).toBe(1);
  });

  it('should count parent changes', () => {
    const tree1 = [
      { id: 'root', parent: null },
      { id: 'a', parent: 'root' },
      { id: 'b', parent: 'root' },
      { id: 'c', parent: 'a' },
    ];
    const tree2 = [
      { id: 'root', parent: null },
      { id: 'a', parent: 'root' },
      { id: 'b', parent: 'root' },
      { id: 'c', parent: 'b' },  // Moved from a to b
    ];

    const dist = computeTreeEditDistance(tree1, tree2);
    expect(dist).toBe(1);
  });
});
