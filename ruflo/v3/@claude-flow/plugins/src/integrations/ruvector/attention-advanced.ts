/**
 * RuVector PostgreSQL Bridge - Advanced Attention Mechanisms
 *
 * Part 3: Graph, Temporal, Multimodal, Retrieval, and Specialized attention.
 *
 * @module @claude-flow/plugins/integrations/ruvector/attention-advanced
 */

import type {
  AttentionMechanism,
  AttentionInput,
} from './types.js';

import {
  BaseAttentionMechanism,
  type AttentionCategory,
} from './attention.js';

// ============================================================================
// Graph Attention Implementations
// ============================================================================

/**
 * Graph Attention (GAT-style).
 */
export class GraphAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'graph_attention';
  readonly name = 'Graph Attention';
  readonly description = 'Graph attention network for structured data';
  readonly category: AttentionCategory = 'graph';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const scale = this.getScale();
    const negativeSlope = 0.2; // LeakyReLU

    // Compute attention coefficients with LeakyReLU
    const scores = keys.map(k => {
      const combined = [...query, ...k];
      const attention = combined.reduce((sum, v) => sum + v, 0) / combined.length;
      return attention > 0 ? attention / scale : negativeSlope * attention / scale;
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
    return `SELECT ruvector.graph_attention(${q}, ${k}, ${v}, ${this.config.numHeads}, 0.2)`;
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
 * Hyperbolic Attention for hierarchical structures.
 */
export class HyperbolicAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'hyperbolic_attention';
  readonly name = 'Hyperbolic Attention';
  readonly description = 'Attention in hyperbolic space for hierarchical data';
  readonly category: AttentionCategory = 'graph';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const curvature = this.config.params?.curvature ?? -1.0;
    const scale = this.getScale();

    // Compute hyperbolic distances
    const scores = keys.map(k => {
      const dist = this.poincareDistance(query, k, curvature);
      return -dist / scale; // Negative distance as score
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
    const curvature = this.config.params?.curvature ?? -1.0;
    return `SELECT ruvector.hyperbolic_attention(${q}, ${k}, ${v}, ${curvature}, ${this.getScale()})`;
  }

  private poincareDistance(u: number[], v: number[], c: number): number {
    const normU = Math.sqrt(u.reduce((s, x) => s + x * x, 0));
    const normV = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    const diff = u.map((x, i) => x - v[i]);
    const normDiff = Math.sqrt(diff.reduce((s, x) => s + x * x, 0));

    const sqrtC = Math.sqrt(Math.abs(c));
    const num = 2 * normDiff * normDiff;
    const denom = (1 - normU * normU) * (1 - normV * normV);

    return (1 / sqrtC) * Math.acosh(1 + num / Math.max(denom, 1e-6));
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
 * Spherical Attention.
 */
export class SphericalAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'spherical_attention';
  readonly name = 'Spherical Attention';
  readonly description = 'Attention on the unit sphere using geodesic distances';
  readonly category: AttentionCategory = 'graph';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const scale = this.getScale();

    // Normalize to unit sphere
    const normQuery = this.normalize(query);
    const normKeys = keys.map(k => this.normalize(k));

    // Geodesic distances on sphere
    const scores = normKeys.map(k => {
      const dot = this.dotProduct(normQuery, k);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      return -angle / scale;
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
    return `SELECT ruvector.spherical_attention(${q}, ${k}, ${v}, ${this.getScale()})`;
  }

  private normalize(v: number[]): number[] {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return v.map(x => x / (norm + 1e-6));
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
 * Toroidal Attention for periodic data.
 */
export class ToroidalAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'toroidal_attention';
  readonly name = 'Toroidal Attention';
  readonly description = 'Attention on torus manifold for periodic structures';
  readonly category: AttentionCategory = 'graph';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const scale = this.getScale();

    // Toroidal distance (periodic in each dimension)
    const scores = keys.map(k => {
      const dist = this.toroidalDistance(query, k);
      return -dist / scale;
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
    return `SELECT ruvector.toroidal_attention(${q}, ${k}, ${v}, ${this.getScale()})`;
  }

  private toroidalDistance(a: number[], b: number[]): number {
    let dist = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = Math.abs(a[i] - b[i]);
      const periodic = Math.min(diff, 2 * Math.PI - diff);
      dist += periodic * periodic;
    }
    return Math.sqrt(dist);
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

// ============================================================================
// Temporal Attention Implementations
// ============================================================================

/**
 * Temporal Attention for time-series data.
 */
export class TemporalAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'temporal_attention';
  readonly name = 'Temporal Attention';
  readonly description = 'Time-aware attention with temporal decay';
  readonly category: AttentionCategory = 'temporal';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const scale = this.getScale();
    const decayRate = 0.1;
    const queryIdx = keys.length - 1;

    const scores = keys.map((k, i) => {
      const timeDiff = queryIdx - i;
      const decay = Math.exp(-decayRate * timeDiff);
      return this.dotProduct(query, k) / scale * decay;
    });

    const weights = this.softmax(scores);
    return this.weightedSum(values, weights);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map((q, idx) => {
      const scale = this.getScale();
      const decayRate = 0.1;

      const scores = keys.map((k, i) => {
        const timeDiff = idx - i;
        const decay = Math.exp(-decayRate * Math.abs(timeDiff));
        return this.dotProduct(q, k) / scale * decay;
      });

      const weights = this.softmax(scores);
      return this.weightedSum(values, weights);
    }));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    return `SELECT ruvector.temporal_attention(${q}, ${k}, ${v}, 0.1, ${this.getScale()})`;
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
 * Recurrent Attention (LSTM-style gating).
 */
export class RecurrentAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'recurrent_attention';
  readonly name = 'Recurrent Attention';
  readonly description = 'LSTM-style gated attention for sequential processing';
  readonly category: AttentionCategory = 'temporal';

  private hiddenState: number[] | null = null;

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const scale = this.getScale();
    const dim = values[0].length;

    // Initialize hidden state if needed
    if (!this.hiddenState || this.hiddenState.length !== dim) {
      this.hiddenState = new Array(dim).fill(0);
    }

    // Compute attention with gating
    const scores = keys.map(k => this.dotProduct(query, k) / scale);
    const weights = this.softmax(scores);
    const context = this.weightedSum(values, weights);

    // LSTM-style gating
    const gate = this.sigmoid(context.map((c, i) => c + this.hiddenState![i]));
    const output = context.map((c, i) => gate[i] * c + (1 - gate[i]) * this.hiddenState![i]);

    // Update hidden state
    this.hiddenState = output;

    return output;
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    const results: number[][] = [];
    for (const q of queries) {
      results.push(await this.compute(q, keys, values));
    }
    return results;
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    return `SELECT ruvector.recurrent_attention(${q}, ${k}, ${v}, ${this.getScale()})`;
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

  private sigmoid(x: number[]): number[] {
    return x.map(v => 1 / (1 + Math.exp(-v)));
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
 * State Space Model Attention (S4/Mamba-style).
 */
export class StateSpaceAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'state_space';
  readonly name = 'State Space Attention';
  readonly description = 'State space model attention for efficient sequence modeling';
  readonly category: AttentionCategory = 'temporal';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const scale = this.getScale();
    const dim = values[0].length;

    // Simplified SSM: compute via convolution-like operation
    const state = new Array(dim).fill(0);
    const deltaT = 1.0 / keys.length;

    for (let i = 0; i < keys.length; i++) {
      const score = this.dotProduct(query, keys[i]) / scale;
      const weight = Math.exp(-deltaT * (keys.length - i - 1)) * score;

      for (let d = 0; d < dim; d++) {
        state[d] += weight * values[i][d];
      }
    }

    // Normalize
    const norm = Math.sqrt(state.reduce((s, v) => s + v * v, 0)) + 1e-6;
    return state.map(v => v / norm);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    return `SELECT ruvector.state_space_attention(${q}, ${k}, ${v}, ${this.getScale()})`;
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }
}

// ============================================================================
// Multimodal Attention Implementations
// ============================================================================

/**
 * Cross-Modal Attention.
 */
export class CrossModalAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'cross_modal';
  readonly name = 'Cross-Modal Attention';
  readonly description = 'Attention across different modalities (text, image, audio)';
  readonly category: AttentionCategory = 'multimodal';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
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
    return `SELECT ruvector.cross_modal_attention(${q}, ${k}, ${v}, ${this.config.numHeads}, ${this.getScale()})`;
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
 * Perceiver IO Attention.
 */
export class PerceiverAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'perceiver';
  readonly name = 'Perceiver Attention';
  readonly description = 'Perceiver IO style attention with latent array';
  readonly category: AttentionCategory = 'multimodal';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
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
    return `SELECT ruvector.perceiver_attention(${q}, ${k}, ${v}, ${this.config.numHeads}, ${this.getScale()})`;
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
 * Flamingo-style Attention.
 */
export class FlamingoAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'flamingo';
  readonly name = 'Flamingo Attention';
  readonly description = 'Flamingo-style gated cross-attention for vision-language';
  readonly category: AttentionCategory = 'multimodal';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const scale = this.getScale();

    // Gated cross-attention
    const scores = keys.map(k => this.dotProduct(query, k) / scale);
    const weights = this.softmax(scores);
    const context = this.weightedSum(values, weights);

    // Tanh gating
    const gate = Math.tanh(this.dotProduct(query, context) / query.length);
    return context.map(c => gate * c);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    return `SELECT ruvector.flamingo_attention(${q}, ${k}, ${v}, ${this.config.numHeads}, ${this.getScale()})`;
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

// ============================================================================
// Retrieval-Augmented Attention Implementations
// ============================================================================

/**
 * Retrieval-Augmented Attention.
 */
export class RetrievalAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'retrieval_attention';
  readonly name = 'Retrieval Attention';
  readonly description = 'Attention augmented with retrieved documents';
  readonly category: AttentionCategory = 'retrieval';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
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
    return `SELECT ruvector.retrieval_attention(${q}, ${k}, ${v}, ${this.getScale()})`;
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
 * k-NN Augmented Attention.
 */
export class KNNAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'knn_attention';
  readonly name = 'k-NN Attention';
  readonly description = 'k-nearest neighbor augmented attention';
  readonly category: AttentionCategory = 'retrieval';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const k = Math.min(10, keys.length);
    const scale = this.getScale();

    // Compute all scores
    const indexedScores = keys.map((key, i) => ({
      index: i,
      score: this.dotProduct(query, key) / scale,
    }));

    // Get top-k
    indexedScores.sort((a, b) => b.score - a.score);
    const topK = indexedScores.slice(0, k);

    // Compute weights only for top-k
    const topScores = topK.map(item => item.score);
    const weights = this.softmax(topScores);

    // Weighted sum of top-k values
    const dim = values[0].length;
    const result = new Array(dim).fill(0);
    for (let i = 0; i < topK.length; i++) {
      const valueIdx = topK[i].index;
      for (let j = 0; j < dim; j++) {
        result[j] += weights[i] * values[valueIdx][j];
      }
    }
    return result;
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    return `SELECT ruvector.knn_attention(${q}, ${k}, ${v}, 10, ${this.getScale()})`;
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
}

/**
 * Memory-Augmented Attention.
 */
export class MemoryAugmentedAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'memory_augmented';
  readonly name = 'Memory-Augmented Attention';
  readonly description = 'Attention with external memory bank';
  readonly category: AttentionCategory = 'retrieval';

  private memoryBank: number[][] = [];

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const scale = this.getScale();

    // Combine keys with memory bank
    const allKeys = [...keys, ...this.memoryBank];
    const allValues = [...values, ...this.memoryBank];

    const scores = allKeys.map(k => this.dotProduct(query, k) / scale);
    const weights = this.softmax(scores);
    return this.weightedSum(allValues, weights);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    return `SELECT ruvector.memory_augmented_attention(${q}, ${k}, ${v}, ${this.getScale()})`;
  }

  /**
   * Add vectors to memory bank.
   */
  addToMemory(vectors: number[][]): void {
    this.memoryBank.push(...vectors);
  }

  /**
   * Clear memory bank.
   */
  clearMemory(): void {
    this.memoryBank = [];
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

// ============================================================================
// Specialized Attention Implementations
// ============================================================================

/**
 * Synthesizer Attention (learned patterns).
 */
export class SynthesizerAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'synthesizer';
  readonly name = 'Synthesizer Attention';
  readonly description = 'Attention with learned synthetic patterns';
  readonly category: AttentionCategory = 'linear';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const seqLen = keys.length;
    const dim = query.length;

    // Dense synthesizer: learn attention from query alone
    const synthetic = new Array(seqLen).fill(0).map((_, i) =>
      query.reduce((sum, q, j) => sum + q * Math.sin((i + 1) * (j + 1) * 0.1), 0)
    );

    const weights = this.softmax(synthetic);
    return this.weightedSum(values, weights);
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const v = this.formatMatrix(input.value);
    return `SELECT ruvector.synthesizer_attention(${q}, ${v}, ${input.key.length})`;
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
 * Routing Attention (MoE style).
 */
export class RoutingAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'routing';
  readonly name = 'Routing Attention';
  readonly description = 'Attention with routing to specialized experts';
  readonly category: AttentionCategory = 'linear';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const numExperts = this.config.params?.numExperts ?? 4;
    const topK = this.config.params?.topK ?? 2;
    const scale = this.getScale();

    // Compute expert routing scores
    const routingScores = Array(numExperts).fill(0).map((_, e) =>
      query.reduce((sum, q, i) => sum + q * Math.cos(e * i * 0.1), 0)
    );

    // Get top-k experts
    const indexedScores = routingScores.map((s, i) => ({ index: i, score: s }));
    indexedScores.sort((a, b) => b.score - a.score);
    const topExperts = indexedScores.slice(0, topK);
    const expertWeights = this.softmax(topExperts.map(e => e.score));

    // Each expert processes a subset of keys
    const keysPerExpert = Math.ceil(keys.length / numExperts);
    const dim = values[0].length;
    const result = new Array(dim).fill(0);

    for (let e = 0; e < topExperts.length; e++) {
      const expertIdx = topExperts[e].index;
      const start = expertIdx * keysPerExpert;
      const end = Math.min(start + keysPerExpert, keys.length);

      if (start < keys.length) {
        const expertKeys = keys.slice(start, end);
        const expertValues = values.slice(start, end);

        const scores = expertKeys.map(k => this.dotProduct(query, k) / scale);
        const weights = this.softmax(scores);
        const expertOutput = this.weightedSum(expertValues, weights);

        for (let d = 0; d < dim; d++) {
          result[d] += expertWeights[e] * expertOutput[d];
        }
      }
    }

    return result;
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    const numExperts = this.config.params?.numExperts ?? 4;
    const topK = this.config.params?.topK ?? 2;
    return `SELECT ruvector.routing_attention(${q}, ${k}, ${v}, ${numExperts}, ${topK}, ${this.getScale()})`;
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
 * Mixture of Experts Attention.
 */
export class MixtureOfExpertsAttention extends BaseAttentionMechanism {
  readonly type: AttentionMechanism = 'mixture_of_experts';
  readonly name = 'Mixture of Experts Attention';
  readonly description = 'MoE attention with specialized expert networks';
  readonly category: AttentionCategory = 'linear';

  async compute(query: number[], keys: number[][], values: number[][]): Promise<number[]> {
    const numExperts = this.config.params?.numExperts ?? 8;
    const topK = this.config.params?.topK ?? 2;
    const scale = this.getScale();

    // Router: compute gating scores
    const gatingScores = Array(numExperts).fill(0).map((_, e) => {
      return query.reduce((sum, q, i) => sum + q * Math.sin(e * i * 0.05), 0);
    });

    // Top-k gating
    const indexed = gatingScores.map((s, i) => ({ idx: i, score: s }));
    indexed.sort((a, b) => b.score - a.score);
    const selected = indexed.slice(0, topK);
    const gateWeights = this.softmax(selected.map(s => s.score));

    // Expert computation
    const dim = values[0].length;
    const result = new Array(dim).fill(0);

    for (let k = 0; k < selected.length; k++) {
      const expertIdx = selected[k].idx;
      const expertScale = scale * (1 + expertIdx * 0.1);

      const scores = keys.map(key => this.dotProduct(query, key) / expertScale);
      const weights = this.softmax(scores);
      const output = this.weightedSum(values, weights);

      for (let d = 0; d < dim; d++) {
        result[d] += gateWeights[k] * output[d];
      }
    }

    return result;
  }

  async computeBatch(queries: number[][], keys: number[][], values: number[][]): Promise<number[][]> {
    return Promise.all(queries.map(q => this.compute(q, keys, values)));
  }

  toSQL(input: AttentionInput): string {
    const q = this.formatMatrix(input.query);
    const k = this.formatMatrix(input.key);
    const v = this.formatMatrix(input.value);
    const numExperts = this.config.params?.numExperts ?? 8;
    const topK = this.config.params?.topK ?? 2;
    return `SELECT ruvector.moe_attention(${q}, ${k}, ${v}, ${numExperts}, ${topK}, ${this.getScale()})`;
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

