/**
 * RuVector PostgreSQL Bridge - Additional Attention Mechanisms
 *
 * Part 2: Sparse, Linear, Positional, Graph, Temporal, Multimodal, and Retrieval attention.
 *
 * @module @claude-flow/plugins/integrations/ruvector/attention-mechanisms
 */

import type {
  AttentionMechanism,
  AttentionConfig,
  AttentionInput,
} from './types.js';

import {
  BaseAttentionMechanism,
  type AttentionCategory,
  type AttentionOptions,
} from './attention.js';

// ============================================================================
// Sparse Attention Implementations
// ============================================================================

/**
 * Sparse Attention (BigBird/Longformer style).
 */
export class SparseAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'sparse_attention';
  readonly name = 'Sparse Attention';
  readonly description = 'Sparse attention with local, global, and random components';
  readonly category: AttentionCategory = 'sparse';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const blockSize = this.config.params?.blockSize ?? 64;
    const numGlobal = this.config.params?.numGlobalTokens ?? 2;
    const numRandom = this.config.params?.numRandomTokens ?? 3;
    const scale = this.getScale();
    const seqLen = keys.length;

    // Build sparse attention pattern
    const attendTo = new Set<number>();

    // Global tokens
    for (let i = 0; i < numGlobal && i < seqLen; i++) {
      attendTo.add(i);
    }

    // Local window
    const queryIdx = seqLen - 1;
    for (let i = Math.max(0, queryIdx - blockSize); i < Math.min(seqLen, queryIdx + blockSize); i++) {
      attendTo.add(i);
    }

    // Random tokens
    for (let r = 0; r < numRandom; r++) {
      attendTo.add(Math.floor(Math.random() * seqLen));
    }

    const scores = keys.map((k, i) => {
      if (!attendTo.has(i)) return -Infinity;
      return this.dotProduct(query, k) / scale;
    });

    const weights = this.softmax(scores);
    return this.weightedSum(values, weights);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    const blockSize = this.config.params?.blockSize ?? 64;
    const numGlobal = this.config.params?.numGlobalTokens ?? 2;
    return `SELECT ruvector.sparse_attention(${q}, ${k}, ${v}, ${blockSize}, ${numGlobal}, ${this.getScale()})`;
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private softmax(x: number[]): number[] {
    const filtered = x.filter(v => v !== -Infinity);
    if (filtered.length === 0) return x.map(() => 0);
    const max = Math.max(...filtered);
    const exp = x.map(v => v === -Infinity ? 0 : Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return sum > 0 ? exp.map(v => v / sum) : exp;
  }

  private weightedSum(values: number[][], weights: number[]): number[] {
    const dim = values[0].length;
    const result = new Array(dim).fill(0);
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < dim; j++) {
        result[j] += weights[i] * values[i][j];
      }
    }
    return result;
  }
}

/**
 * Block Sparse Attention.
 */
export class BlockSparseAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'block_sparse';
  readonly name = 'Block Sparse Attention';
  readonly description = 'Block-sparse attention with predefined block patterns';
  readonly category: AttentionCategory = 'sparse';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const blockSize = this.config.params?.blockSize ?? 64;
    const scale = this.getScale();
    const seqLen = keys.length;
    const numBlocks = Math.ceil(seqLen / blockSize);
    const queryBlock = Math.floor((seqLen - 1) / blockSize);

    const scores = keys.map((k, i) => {
      const keyBlock = Math.floor(i / blockSize);
      // Attend to same block and adjacent blocks
      if (Math.abs(keyBlock - queryBlock) > 1) return -Infinity;
      return this.dotProduct(query, k) / scale;
    });

    const weights = this.softmax(scores);
    return this.weightedSum(values, weights);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    const blockSize = this.config.params?.blockSize ?? 64;
    return `SELECT ruvector.block_sparse_attention(${q}, ${k}, ${v}, ${blockSize}, ${this.getScale()})`;
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private softmax(x: number[]): number[] {
    const filtered = x.filter(v => v !== -Infinity);
    if (filtered.length === 0) return x.map(() => 0);
    const max = Math.max(...filtered);
    const exp = x.map(v => v === -Infinity ? 0 : Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return sum > 0 ? exp.map(v => v / sum) : exp;
  }

  private weightedSum(values: number[][], weights: number[]): number[] {
    const dim = values[0].length;
    const result = new Array(dim).fill(0);
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < dim; j++) {
        result[j] += weights[i] * values[i][j];
      }
    }
    return result;
  }
}

// ============================================================================
// Linear Attention Implementations
// ============================================================================

/**
 * Linear Attention - O(N) complexity.
 */
export class LinearAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'linear_attention';
  readonly name = 'Linear Attention';
  readonly description = 'Linear complexity attention using kernel feature maps';
  readonly category: AttentionCategory = 'linear';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const featureMap = this.config.params?.featureMap ?? 'elu';
    const dim = values[0].length;

    // Apply feature map to query and keys
    const phiQ = this.applyFeatureMap(query, featureMap);
    const phiKs = keys.map(k => this.applyFeatureMap(k, featureMap));

    // Compute KV matrix (sum of outer products)
    const kvMatrix = new Array(dim).fill(null).map(() => new Array(dim).fill(0));
    const kSum = new Array(dim).fill(0);

    for (let i = 0; i < keys.length; i++) {
      for (let d1 = 0; d1 < dim; d1++) {
        kSum[d1] += phiKs[i][d1];
        for (let d2 = 0; d2 < dim; d2++) {
          kvMatrix[d1][d2] += phiKs[i][d1] * values[i][d2];
        }
      }
    }

    // Compute output: (phi(Q) @ KV) / (phi(Q) @ K_sum)
    const numerator = new Array(dim).fill(0);
    let denominator = 0;

    for (let d = 0; d < dim; d++) {
      denominator += phiQ[d] * kSum[d];
      for (let d2 = 0; d2 < dim; d2++) {
        numerator[d2] += phiQ[d] * kvMatrix[d][d2];
      }
    }

    return numerator.map(n => n / (denominator + 1e-6));
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    const featureMap = this.config.params?.featureMap ?? 'elu';
    return `SELECT ruvector.linear_attention(${q}, ${k}, ${v}, '${featureMap}')`;
  }

  private applyFeatureMap(x: number[], mapType: string): number[] {
    switch (mapType) {
      case 'elu':
        return x.map(v => v > 0 ? v + 1 : Math.exp(v));
      case 'relu':
        return x.map(v => Math.max(0, v));
      case 'exp':
        return x.map(v => Math.exp(v));
      default:
        return x.map(v => v > 0 ? v + 1 : Math.exp(v));
    }
  }
}

/**
 * Performer Attention (FAVOR+).
 */
export class PerformerAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'performer';
  readonly name = 'Performer Attention';
  readonly description = 'FAVOR+ mechanism using random feature approximation';
  readonly category: AttentionCategory = 'linear';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const numFeatures = this.config.params?.numFeatures ?? 256;
    const dim = query.length;

    // Generate random features (simplified - in practice these would be precomputed)
    const randomMatrix = this.generateRandomFeatures(dim, numFeatures);

    // Apply random feature map
    const phiQ = this.randomFeatureMap(query, randomMatrix);
    const phiKs = keys.map(k => this.randomFeatureMap(k, randomMatrix));

    // Linear attention computation
    const kvSum = new Array(numFeatures).fill(null).map(() => new Array(values[0].length).fill(0));
    const kSum = new Array(numFeatures).fill(0);

    for (let i = 0; i < keys.length; i++) {
      for (let f = 0; f < numFeatures; f++) {
        kSum[f] += phiKs[i][f];
        for (let d = 0; d < values[0].length; d++) {
          kvSum[f][d] += phiKs[i][f] * values[i][d];
        }
      }
    }

    const numerator = new Array(values[0].length).fill(0);
    let denominator = 0;

    for (let f = 0; f < numFeatures; f++) {
      denominator += phiQ[f] * kSum[f];
      for (let d = 0; d < values[0].length; d++) {
        numerator[d] += phiQ[f] * kvSum[f][d];
      }
    }

    return numerator.map(n => n / (denominator + 1e-6));
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    const numFeatures = this.config.params?.numFeatures ?? 256;
    return `SELECT ruvector.performer_attention(${q}, ${k}, ${v}, ${numFeatures})`;
  }

  private generateRandomFeatures(inputDim: number, numFeatures: number): number[][] {
    // Simplified random orthogonal features
    return Array(numFeatures).fill(null).map(() =>
      Array(inputDim).fill(0).map(() => (Math.random() - 0.5) * 2 / Math.sqrt(inputDim))
    );
  }

  private randomFeatureMap(x: number[], randomMatrix: number[][]): number[] {
    return randomMatrix.map(row => {
      const dot = row.reduce((sum, r, i) => sum + r * x[i], 0);
      return Math.exp(dot - 0.5 * x.reduce((s, v) => s + v * v, 0) / x.length);
    });
  }
}

/**
 * Linformer Attention (low-rank projection).
 */
export class LinformerAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'linformer';
  readonly name = 'Linformer Attention';
  readonly description = 'Low-rank projected attention for linear complexity';
  readonly category: AttentionCategory = 'linear';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const projectedDim = this.config.params?.numFeatures ?? Math.min(256, keys.length);
    const scale = this.getScale();

    // Project keys and values to lower dimension
    const projMatrix = this.generateProjectionMatrix(keys.length, projectedDim);
    const projectedKeys = this.projectSequence(keys, projMatrix);
    const projectedValues = this.projectSequence(values, projMatrix);

    // Standard attention on projected sequence
    const scores = projectedKeys.map(k => this.dotProduct(query, k) / scale);
    const weights = this.softmax(scores);
    return this.weightedSum(projectedValues, weights);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    const projDim = this.config.params?.numFeatures ?? 256;
    return `SELECT ruvector.linformer_attention(${q}, ${k}, ${v}, ${projDim}, ${this.getScale()})`;
  }

  private generateProjectionMatrix(seqLen: number, projDim: number): number[][] {
    return Array(projDim).fill(null).map(() =>
      Array(seqLen).fill(0).map(() => (Math.random() - 0.5) * 2 / Math.sqrt(seqLen))
    );
  }

  private projectSequence(seq: number[][], projMatrix: number[][]): number[][] {
    return projMatrix.map(projRow =>
      seq[0].map((_, d) => projRow.reduce((sum, p, i) => sum + p * seq[i][d], 0))
    );
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private softmax(x: number[]): number[] {
    const max = Math.max(...x);
    const exp = x.map(v => Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(v => v / sum);
  }

  private weightedSum(values: number[][], weights: number[]): number[] {
    const dim = values[0].length;
    const result = new Array(dim).fill(0);
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < dim; j++) {
        result[j] += weights[i] * values[i][j];
      }
    }
    return result;
  }
}

/**
 * Reformer Attention (LSH-based).
 */
export class ReformerAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'reformer';
  readonly name = 'Reformer Attention';
  readonly description = 'Locality-sensitive hashing attention for efficiency';
  readonly category: AttentionCategory = 'linear';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const numBuckets = this.config.params?.numBuckets ?? 32;
    const scale = this.getScale();

    // Compute LSH bucket for query
    const queryBucket = this.lshHash(query, numBuckets);

    // Only attend to keys in same or nearby buckets
    const scores = keys.map((k, i) => {
      const keyBucket = this.lshHash(k, numBuckets);
      if (Math.abs(keyBucket - queryBucket) > 1) return -Infinity;
      return this.dotProduct(query, k) / scale;
    });

    const weights = this.softmax(scores);
    return this.weightedSum(values, weights);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    const numBuckets = this.config.params?.numBuckets ?? 32;
    return `SELECT ruvector.reformer_attention(${q}, ${k}, ${v}, ${numBuckets}, ${this.getScale()})`;
  }

  private lshHash(vec: number[], numBuckets: number): number {
    // Simplified LSH: project to random hyperplanes
    const projection = vec.reduce((sum, v, i) => sum + v * Math.sin(i * 0.1), 0);
    return Math.floor((projection + 10) / 20 * numBuckets) % numBuckets;
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private softmax(x: number[]): number[] {
    const filtered = x.filter(v => v !== -Infinity);
    if (filtered.length === 0) return x.map(() => 0);
    const max = Math.max(...filtered);
    const exp = x.map(v => v === -Infinity ? 0 : Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return sum > 0 ? exp.map(v => v / sum) : exp;
  }

  private weightedSum(values: number[][], weights: number[]): number[] {
    const dim = values[0].length;
    const result = new Array(dim).fill(0);
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < dim; j++) {
        result[j] += weights[i] * values[i][j];
      }
    }
    return result;
  }
}

// ============================================================================
// Positional Attention Implementations
// ============================================================================

/**
 * Relative Position Attention (T5, XLNet style).
 */
export class RelativePositionAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'relative_position';
  readonly name = 'Relative Position Attention';
  readonly description = 'Attention with relative position biases';
  readonly category: AttentionCategory = 'positional';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const maxRelPos = this.config.params?.maxRelativePosition ?? 128;
    const numBuckets = this.config.params?.numBuckets ?? 32;
    const scale = this.getScale();
    const queryIdx = keys.length - 1;

    const scores = keys.map((k, i) => {
      const relPos = i - queryIdx;
      const bias = this.getRelativePositionBias(relPos, maxRelPos, numBuckets);
      return this.dotProduct(query, k) / scale + bias;
    });

    const weights = this.softmax(scores);
    return this.weightedSum(values, weights);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map((q, idx) => {
      const maxRelPos = this.config.params?.maxRelativePosition ?? 128;
      const numBuckets = this.config.params?.numBuckets ?? 32;
      const scale = this.getScale();

      const scores = keys.map((k, i) => {
        const relPos = i - idx;
        const bias = this.getRelativePositionBias(relPos, maxRelPos, numBuckets);
        return this.dotProduct(q, k) / scale + bias;
      });

      const weights = this.softmax(scores);
      return this.weightedSum(values, weights);
    }));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    const maxRelPos = this.config.params?.maxRelativePosition ?? 128;
    return `SELECT ruvector.relative_position_attention(${q}, ${k}, ${v}, ${maxRelPos}, ${this.getScale()})`;
  }

  private getRelativePositionBias(relPos: number, maxDist: number, numBuckets: number): number {
    // T5-style relative position bucketing
    const clampedPos = Math.max(-maxDist, Math.min(maxDist, relPos));
    const bucket = Math.floor((clampedPos + maxDist) / (2 * maxDist) * numBuckets);
    return Math.sin(bucket * 0.1) * 0.1; // Simplified bias
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private softmax(x: number[]): number[] {
    const max = Math.max(...x);
    const exp = x.map(v => Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(v => v / sum);
  }

  private weightedSum(values: number[][], weights: number[]): number[] {
    const dim = values[0].length;
    const result = new Array(dim).fill(0);
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < dim; j++) {
        result[j] += weights[i] * values[i][j];
      }
    }
    return result;
  }
}

/**
 * Rotary Position Embedding (RoPE) Attention.
 */
export class RotaryPositionAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'rotary_position';
  readonly name = 'Rotary Position Attention';
  readonly description = 'RoPE-based attention with rotary position embeddings';
  readonly category: AttentionCategory = 'positional';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const base = this.config.params?.ropeBase ?? 10000;
    const scale = this.getScale();
    const queryPos = keys.length - 1;

    // Apply RoPE to query
    const rotatedQuery = this.applyRoPE(query, queryPos, base);

    // Apply RoPE to keys and compute attention
    const scores = keys.map((k, i) => {
      const rotatedKey = this.applyRoPE(k, i, base);
      return this.dotProduct(rotatedQuery, rotatedKey) / scale;
    });

    const weights = this.softmax(scores);
    return this.weightedSum(values, weights);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    const base = this.config.params?.ropeBase ?? 10000;
    const scale = this.getScale();

    return queries.map((q, qIdx) => {
      const rotatedQuery = this.applyRoPE(q, qIdx, base);
      const scores = keys.map((k, kIdx) => {
        const rotatedKey = this.applyRoPE(k, kIdx, base);
        return this.dotProduct(rotatedQuery, rotatedKey) / scale;
      });
      const weights = this.softmax(scores);
      return this.weightedSum(values, weights);
    });
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    const base = this.config.params?.ropeBase ?? 10000;
    return `SELECT ruvector.rotary_position_attention(${q}, ${k}, ${v}, ${base}, ${this.getScale()})`;
  }

  private applyRoPE(vec: number[], pos: number, base: number): number[] {
    const result = [...vec];
    const dim = vec.length;
    for (let i = 0; i < dim; i += 2) {
      const freq = 1 / Math.pow(base, i / dim);
      const angle = pos * freq;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = vec[i];
      const y = i + 1 < dim ? vec[i + 1] : 0;
      result[i] = x * cos - y * sin;
      if (i + 1 < dim) result[i + 1] = x * sin + y * cos;
    }
    return result;
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private softmax(x: number[]): number[] {
    const max = Math.max(...x);
    const exp = x.map(v => Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(v => v / sum);
  }

  private weightedSum(values: number[][], weights: number[]): number[] {
    const dim = values[0].length;
    const result = new Array(dim).fill(0);
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < dim; j++) {
        result[j] += weights[i] * values[i][j];
      }
    }
    return result;
  }
}

/**
 * ALiBi (Attention with Linear Biases).
 */
export class ALiBiAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'alibi';
  readonly name = 'ALiBi Attention';
  readonly description = 'Attention with linear position biases for extrapolation';
  readonly category: AttentionCategory = 'positional';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const scale = this.getScale();
    const queryIdx = keys.length - 1;
    const slope = this.getALiBiSlope(0, this.config.numHeads); // Head 0

    const scores = keys.map((k, i) => {
      const distance = Math.abs(i - queryIdx);
      const bias = -slope * distance;
      return this.dotProduct(query, k) / scale + bias;
    });

    const weights = this.softmax(scores);
    return this.weightedSum(values, weights);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map((q, qIdx) => {
      const scale = this.getScale();
      const slope = this.getALiBiSlope(0, this.config.numHeads);

      const scores = keys.map((k, kIdx) => {
        const distance = Math.abs(kIdx - qIdx);
        const bias = -slope * distance;
        return this.dotProduct(q, k) / scale + bias;
      });

      const weights = this.softmax(scores);
      return this.weightedSum(values, weights);
    }));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    return `SELECT ruvector.alibi_attention(${q}, ${k}, ${v}, ${this.config.numHeads}, ${this.getScale()})`;
  }

  private getALiBiSlope(headIdx: number, numHeads: number): number {
    const ratio = Math.pow(2, -8 / numHeads);
    return Math.pow(ratio, headIdx + 1);
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private softmax(x: number[]): number[] {
    const max = Math.max(...x);
    const exp = x.map(v => Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(v => v / sum);
  }

  private weightedSum(values: number[][], weights: number[]): number[] {
    const dim = values[0].length;
    const result = new Array(dim).fill(0);
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < dim; j++) {
        result[j] += weights[i] * values[i][j];
      }
    }
    return result;
  }
}

/**
 * Axial Attention (2D decomposition).
 */
export class AxialAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'axial';
  readonly name = 'Axial Attention';
  readonly description = '2D decomposed attention for images and structured data';
  readonly category: AttentionCategory = 'positional';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    // For 1D sequences, this is similar to standard attention
    const scale = this.getScale();
    const scores = keys.map(k => this.dotProduct(query, k) / scale);
    const weights = this.softmax(scores);
    return this.weightedSum(values, weights);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    return `SELECT ruvector.axial_attention(${q}, ${k}, ${v}, ${this.getScale()})`;
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private softmax(x: number[]): number[] {
    const max = Math.max(...x);
    const exp = x.map(v => Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(v => v / sum);
  }

  private weightedSum(values: number[][], weights: number[]): number[] {
    const dim = values[0].length;
    const result = new Array(dim).fill(0);
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < dim; j++) {
        result[j] += weights[i] * values[i][j];
      }
    }
    return result;
  }
}

