/**
 * Product Quantization Validation Tests
 *
 * Validates the PQ implementation inside the Quantizer class (hnsw-index.ts):
 * k-means convergence, encoding, distance, compression, training threshold,
 * and pre-training fallback.
 */
import { describe, it, expect } from 'vitest';
import { HNSWIndex } from '../../@claude-flow/memory/src/hnsw-index.js';

const DIM = 384;
const NUM_SUB = 8;

/** Create a deterministic vector: cluster centre + small noise */
function makeVec(centre: number[], noise = 0.01, seed = 0): Float32Array {
  const v = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) {
    v[i] = centre[i % centre.length] + noise * Math.sin(seed * 17 + i);
  }
  return v;
}

/** Build three well-separated cluster centres */
const C1 = Array.from({ length: DIM }, () => 1.0);
const C2 = Array.from({ length: DIM }, () => -1.0);
const C3 = Array.from({ length: DIM }, () => 0.0);

// ---------------------------------------------------------------------------
// Helpers to reach into the private Quantizer via the index
// ---------------------------------------------------------------------------
function createPQIndex(maxElements = 600): HNSWIndex {
  return new HNSWIndex({
    dimensions: DIM,
    M: 4,
    efConstruction: 20,
    maxElements,
    metric: 'euclidean',
    quantization: { type: 'product', subquantizers: NUM_SUB, codebookSize: 256 },
  });
}

function getQuantizer(index: HNSWIndex): any {
  return (index as any).quantizer;
}

// ===========================================================================
describe('Product Quantization', () => {
  // -------------------------------------------------------------------------
  // 1. k-means converges on 3 clear clusters
  // -------------------------------------------------------------------------
  it('k-means converges on 3 well-separated clusters', () => {
    const q = getQuantizer(createPQIndex());

    // Build tiny dataset of 2-d points in 3 clusters.
    // Interleave so the first 3 points seed one centroid per cluster
    // (kMeans init picks the first k data points).
    const data: number[][] = [];
    for (let i = 0; i < 30; i++) {
      data.push([0 + Math.random() * 0.1, 0 + Math.random() * 0.1]);
      data.push([10 + Math.random() * 0.1, 10 + Math.random() * 0.1]);
      data.push([20 + Math.random() * 0.1, 20 + Math.random() * 0.1]);
    }

    // Access private kMeans
    const centroids: number[][] = (q as any).kMeans(data, 3, 50);

    expect(centroids).toHaveLength(3);

    // Each centroid should be near one of [0,0], [10,10], [20,20]
    const targets = [[0, 0], [10, 10], [20, 20]];
    const matched = new Set<number>();
    for (const c of centroids) {
      for (let t = 0; t < targets.length; t++) {
        const dist = Math.hypot(c[0] - targets[t][0], c[1] - targets[t][1]);
        if (dist < 1.0 && !matched.has(t)) { matched.add(t); break; }
      }
    }
    expect(matched.size).toBe(3);
  });

  // -------------------------------------------------------------------------
  // 2. PQ encoding returns correct number of indices
  // -------------------------------------------------------------------------
  it('PQ encoding returns numSubquantizers indices after training', async () => {
    const index = createPQIndex();
    const q = getQuantizer(index);

    // Feed 256 vectors to trigger training
    const vecs: number[][] = [];
    for (let i = 0; i < 256; i++) {
      const v = makeVec(i < 128 ? C1 : C2, 0.05, i);
      vecs.push(Array.from(v));
    }
    q.trainingVectors = vecs;
    q.codebooks = q.trainProductQuantizer(vecs, NUM_SUB, 256);
    q.pqTrained = true;

    const encoded = q.encode(makeVec(C1, 0.01, 999));
    expect(encoded).toBeInstanceOf(Float32Array);
    expect(encoded.length).toBe(NUM_SUB);
    // All indices should be in [0, 256)
    for (let i = 0; i < encoded.length; i++) {
      expect(encoded[i]).toBeGreaterThanOrEqual(0);
      expect(encoded[i]).toBeLessThan(256);
    }
  });

  // -------------------------------------------------------------------------
  // 3. PQ distance between identical vectors is 0
  // -------------------------------------------------------------------------
  it('PQ distance between identical encoded vectors is 0', () => {
    const index = createPQIndex();
    const q = getQuantizer(index);

    // Train codebooks
    const vecs: number[][] = [];
    for (let i = 0; i < 256; i++) vecs.push(Array.from(makeVec(C1, 0.1, i)));
    q.codebooks = q.trainProductQuantizer(vecs, NUM_SUB, 256);
    q.pqTrained = true;

    const v = makeVec(C1, 0.01, 42);
    const enc = q.encode(v);
    const indices = new Uint8Array(enc);

    const dist = q.productQuantizeDistance(indices, indices);
    expect(dist).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 4. PQ distance between different vectors is > 0
  // -------------------------------------------------------------------------
  it('PQ distance between different encoded vectors is > 0', () => {
    const index = createPQIndex();
    const q = getQuantizer(index);

    const vecs: number[][] = [];
    for (let i = 0; i < 256; i++) {
      vecs.push(Array.from(makeVec(i < 128 ? C1 : C2, 0.05, i)));
    }
    q.codebooks = q.trainProductQuantizer(vecs, NUM_SUB, 256);
    q.pqTrained = true;

    const enc1 = new Uint8Array(q.encode(makeVec(C1, 0.001, 0)));
    const enc2 = new Uint8Array(q.encode(makeVec(C2, 0.001, 1)));

    const dist = q.productQuantizeDistance(enc1, enc2);
    expect(dist).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 5. Compression ratio: 384-dim float32 -> 8 bytes with 8 sub-quantizers
  // -------------------------------------------------------------------------
  it('compression ratio is correct (384-dim f32 -> 8 sub-quantizers)', () => {
    const index = createPQIndex();
    const stats = index.getStats();
    // product quantization compression ratio = subquantizers count
    expect(stats.compressionRatio).toBe(NUM_SUB);
  });

  // -------------------------------------------------------------------------
  // 6. Training threshold: accumulates until 256, then trains
  // -------------------------------------------------------------------------
  it('training threshold works: not trained until 256 vectors', () => {
    const index = createPQIndex(600);
    const q = getQuantizer(index);

    // Feed 255 vectors — should NOT be trained yet
    for (let i = 0; i < 255; i++) {
      q.encode(makeVec(C1, 0.1, i));
    }
    expect(q.isPQTrained).toBe(false);
    expect(q.trainingVectors).toHaveLength(255);

    // Feed the 256th — should trigger training
    q.encode(makeVec(C2, 0.1, 256));
    expect(q.isPQTrained).toBe(true);
    expect(q.getCodebooks()).not.toBeNull();
    expect(q.getCodebooks()!).toHaveLength(NUM_SUB);
    // Training data freed after training
    expect(q.trainingVectors).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 7. Pre-training fallback: returns averaged sub-vectors before training
  // -------------------------------------------------------------------------
  it('pre-training fallback returns sub-vector means', () => {
    const index = createPQIndex();
    const q = getQuantizer(index);

    // A constant vector of 2.0 everywhere
    const constant = new Float32Array(DIM).fill(2.0);
    const result = q.encode(constant);

    // Before training, each element should be the mean of the sub-vector slice
    // For a constant 2.0 vector, every sub-vector mean is 2.0
    expect(result.length).toBe(NUM_SUB);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(2.0, 5);
    }
  });
});
