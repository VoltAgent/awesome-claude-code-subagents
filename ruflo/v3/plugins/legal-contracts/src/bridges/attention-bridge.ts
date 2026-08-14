/**
 * Flash Attention Bridge for Legal Contract Analysis
 *
 * Provides cross-attention computation for clause alignment and similarity
 * using ruvector-attention-wasm for high-performance attention operations.
 *
 * Features:
 * - Cross-attention for contract comparison
 * - Clause alignment between documents
 * - Semantic similarity scoring
 * - Memory-efficient attention patterns
 *
 * Based on ADR-034: Legal Contract Analysis Plugin
 *
 * @module v3/plugins/legal-contracts/bridges/attention-bridge
 */

import type {
  IAttentionBridge,
  ExtractedClause,
  ClauseAlignment,
} from '../types.js';

/**
 * WASM module interface for attention operations
 */
interface AttentionWasmModule {
  /** Compute scaled dot-product attention */
  attention_compute(
    query: Float32Array,
    key: Float32Array,
    value: Float32Array,
    queryLen: number,
    keyLen: number,
    dim: number,
    mask: Uint8Array | null
  ): Float32Array;

  /** Compute cross-attention scores only */
  attention_scores(
    query: Float32Array,
    key: Float32Array,
    queryLen: number,
    keyLen: number,
    dim: number
  ): Float32Array;

  /** Flash attention with memory optimization */
  flash_attention(
    query: Float32Array,
    key: Float32Array,
    value: Float32Array,
    queryLen: number,
    keyLen: number,
    dim: number,
    blockSize: number
  ): Float32Array;

  /** Memory management */
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  memory: WebAssembly.Memory;
}

/**
 * Flash Attention Bridge Implementation
 */
export class AttentionBridge implements IAttentionBridge {
  private wasmModule: AttentionWasmModule | null = null;
  private initialized = false;
  private readonly embeddingDim: number;

  constructor(embeddingDim = 384) {
    this.embeddingDim = embeddingDim;
  }

  /**
   * Initialize the WASM module
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import of WASM module
      // In production, this would load from @claude-flow/ruvector-upstream
      const wasmModule = await this.loadWasmModule();
      this.wasmModule = wasmModule;
      this.initialized = true;
    } catch (error) {
      // Fallback to pure JS implementation if WASM not available
      console.warn('WASM attention module not available, using JS fallback');
      this.wasmModule = null;
      this.initialized = true;
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Compute cross-attention between clause embeddings
   */
  async computeCrossAttention(
    queryEmbeddings: Float32Array[],
    keyEmbeddings: Float32Array[],
    mask?: boolean[][]
  ): Promise<Float32Array[][]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const queryLen = queryEmbeddings.length;
    const keyLen = keyEmbeddings.length;

    if (queryLen === 0 || keyLen === 0) {
      return [];
    }

    // Flatten embeddings for WASM
    const dim = queryEmbeddings[0]?.length ?? this.embeddingDim;
    const flatQuery = this.flattenEmbeddings(queryEmbeddings, dim);
    const flatKey = this.flattenEmbeddings(keyEmbeddings, dim);

    // Create mask if provided
    let maskArray: Uint8Array | null = null;
    if (mask) {
      maskArray = new Uint8Array(queryLen * keyLen);
      for (let i = 0; i < queryLen; i++) {
        for (let j = 0; j < keyLen; j++) {
          maskArray[i * keyLen + j] = mask[i]?.[j] ? 1 : 0;
        }
      }
    }

    // Compute attention scores
    let scores: Float32Array;
    if (this.wasmModule) {
      scores = this.wasmModule.attention_scores(
        flatQuery,
        flatKey,
        queryLen,
        keyLen,
        dim
      );
    } else {
      scores = this.computeAttentionScoresJS(flatQuery, flatKey, queryLen, keyLen, dim);
    }

    // Apply mask if provided
    if (maskArray) {
      for (let i = 0; i < scores.length; i++) {
        if (maskArray[i] === 0) {
          scores[i] = -Infinity;
        }
      }
    }

    // Apply softmax row-wise
    const result: Float32Array[][] = [];
    for (let i = 0; i < queryLen; i++) {
      const row: Float32Array[] = [];
      const rowStart = i * keyLen;
      const rowEnd = rowStart + keyLen;
      const rowScores = scores.slice(rowStart, rowEnd);
      const softmaxed = this.softmax(rowScores);

      for (let j = 0; j < keyLen; j++) {
        row.push(new Float32Array([softmaxed[j] ?? 0]));
      }
      result.push(row);
    }

    return result;
  }

  /**
   * Align clauses between two documents using attention
   */
  async alignClauses(
    baseClauses: ExtractedClause[],
    compareClauses: ExtractedClause[]
  ): Promise<ClauseAlignment[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (baseClauses.length === 0 || compareClauses.length === 0) {
      return [];
    }

    // Get or compute embeddings
    const baseEmbeddings = await this.getOrComputeEmbeddings(baseClauses);
    const compareEmbeddings = await this.getOrComputeEmbeddings(compareClauses);

    // Compute similarity matrix using attention
    const similarities = await this.computeCrossAttention(baseEmbeddings, compareEmbeddings);

    // Create alignments based on similarity scores
    const alignments: ClauseAlignment[] = [];
    const usedCompare = new Set<number>();

    // For each base clause, find best matching compare clause
    for (let i = 0; i < baseClauses.length; i++) {
      const baseClause = baseClauses[i];
      if (!baseClause) continue;

      const row = similarities[i];
      if (!row) continue;

      // Find best match not already used
      let bestJ = -1;
      let bestScore = 0;

      for (let j = 0; j < compareClauses.length; j++) {
        if (usedCompare.has(j)) continue;

        const score = row[j]?.[0] ?? 0;
        if (score > bestScore) {
          bestScore = score;
          bestJ = j;
        }
      }

      const compareClause = bestJ >= 0 ? compareClauses[bestJ] : undefined;

      // Determine alignment type based on score
      let alignmentType: ClauseAlignment['alignmentType'];
      if (bestScore > 0.95) {
        alignmentType = 'exact';
      } else if (bestScore > 0.8) {
        alignmentType = 'similar';
      } else if (bestScore > 0.5) {
        alignmentType = 'related';
      } else {
        alignmentType = 'no_match';
      }

      const differences = this.computeDifferences(baseClause, compareClause);

      alignments.push({
        baseClauseId: baseClause.id,
        compareClauseId: compareClause?.id ?? '',
        similarity: bestScore,
        alignmentType,
        differences,
      });

      if (bestJ >= 0) {
        usedCompare.add(bestJ);
      }
    }

    return alignments;
  }

  /**
   * Find most relevant clauses for a given query
   */
  async findRelevantClauses(
    query: string | Float32Array,
    clauses: ExtractedClause[],
    topK: number
  ): Promise<Array<{ clause: ExtractedClause; score: number }>> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (clauses.length === 0) {
      return [];
    }

    // Convert query to embedding if string
    const queryEmbedding = typeof query === 'string'
      ? await this.embedText(query)
      : query;

    // Get clause embeddings
    const clauseEmbeddings = await this.getOrComputeEmbeddings(clauses);

    // Compute similarities
    const similarities = await this.computeCrossAttention(
      [queryEmbedding],
      clauseEmbeddings
    );

    const scores = similarities[0] ?? [];

    // Create scored results
    const scoredClauses = clauses.map((clause, i) => ({
      clause,
      score: scores[i]?.[0] ?? 0,
    }));

    // Sort by score and take top K
    scoredClauses.sort((a, b) => b.score - a.score);

    return scoredClauses.slice(0, topK);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Load WASM module dynamically
   */
  private async loadWasmModule(): Promise<AttentionWasmModule> {
    // In production, this would load from @claude-flow/ruvector-upstream
    // For now, throw to trigger JS fallback
    throw new Error('WASM module loading not implemented');
  }

  /**
   * Flatten array of embeddings into single Float32Array
   */
  private flattenEmbeddings(embeddings: Float32Array[], dim: number): Float32Array {
    const flat = new Float32Array(embeddings.length * dim);
    for (let i = 0; i < embeddings.length; i++) {
      const emb = embeddings[i];
      if (emb) {
        flat.set(emb.slice(0, dim), i * dim);
      }
    }
    return flat;
  }

  /**
   * Compute attention scores in pure JavaScript (fallback)
   */
  private computeAttentionScoresJS(
    query: Float32Array,
    key: Float32Array,
    queryLen: number,
    keyLen: number,
    dim: number
  ): Float32Array {
    const scores = new Float32Array(queryLen * keyLen);
    const scale = 1 / Math.sqrt(dim);

    for (let i = 0; i < queryLen; i++) {
      for (let j = 0; j < keyLen; j++) {
        let dot = 0;
        for (let k = 0; k < dim; k++) {
          const qVal = query[i * dim + k] ?? 0;
          const kVal = key[j * dim + k] ?? 0;
          dot += qVal * kVal;
        }
        scores[i * keyLen + j] = dot * scale;
      }
    }

    return scores;
  }

  /**
   * Compute softmax over array
   */
  private softmax(arr: Float32Array): Float32Array {
    const max = Math.max(...arr);
    const exps = new Float32Array(arr.length);
    let sum = 0;

    for (let i = 0; i < arr.length; i++) {
      const val = arr[i] ?? 0;
      const exp = Math.exp(val - max);
      exps[i] = exp;
      sum += exp;
    }

    for (let i = 0; i < exps.length; i++) {
      exps[i] = (exps[i] ?? 0) / sum;
    }

    return exps;
  }

  /**
   * Get embeddings from clauses or compute them
   */
  private async getOrComputeEmbeddings(clauses: ExtractedClause[]): Promise<Float32Array[]> {
    const embeddings: Float32Array[] = [];

    for (const clause of clauses) {
      if (clause.embedding) {
        embeddings.push(clause.embedding);
      } else {
        // Compute embedding from text
        const embedding = await this.embedText(clause.text);
        embeddings.push(embedding);
      }
    }

    return embeddings;
  }

  /**
   * Embed text to vector (placeholder - would use embedding model)
   */
  private async embedText(text: string): Promise<Float32Array> {
    // In production, this would use an embedding model
    // For now, create a simple hash-based embedding
    const embedding = new Float32Array(this.embeddingDim);

    // Simple hash-based embedding (placeholder)
    for (let i = 0; i < text.length && i < this.embeddingDim; i++) {
      const charCode = text.charCodeAt(i);
      const idx = i % this.embeddingDim;
      embedding[idx] = (embedding[idx] ?? 0) + charCode / 1000;
    }

    // Normalize
    let norm = 0;
    for (let i = 0; i < embedding.length; i++) {
      norm += (embedding[i] ?? 0) * (embedding[i] ?? 0);
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = (embedding[i] ?? 0) / norm;
      }
    }

    return embedding;
  }

  /**
   * Compute differences between two clauses
   */
  private computeDifferences(
    baseClause: ExtractedClause,
    compareClause: ExtractedClause | undefined
  ): string[] {
    const differences: string[] = [];

    if (compareClause === undefined) {
      differences.push('No matching clause found in comparison document');
      return differences;
    }

    // Type difference
    if (baseClause.type !== compareClause.type) {
      differences.push(`Type changed: ${baseClause.type} -> ${compareClause.type}`);
    }

    // Length difference
    const lengthDiff = Math.abs(baseClause.text.length - compareClause.text.length);
    if (lengthDiff > 100) {
      differences.push(`Significant length difference: ${lengthDiff} characters`);
    }

    // Key terms difference
    const baseTerms = new Set(baseClause.keyTerms);
    const compareTerms = new Set(compareClause.keyTerms);

    const addedTerms = [...compareTerms].filter(t => !baseTerms.has(t));
    const removedTerms = [...baseTerms].filter(t => !compareTerms.has(t));

    if (addedTerms.length > 0) {
      differences.push(`Added terms: ${addedTerms.join(', ')}`);
    }
    if (removedTerms.length > 0) {
      differences.push(`Removed terms: ${removedTerms.join(', ')}`);
    }

    return differences;
  }
}

/**
 * Create and export default bridge instance
 */
export function createAttentionBridge(embeddingDim = 384): IAttentionBridge {
  return new AttentionBridge(embeddingDim);
}

export default AttentionBridge;
