/**
 * Baseline Memory Adapter for LongMemEval
 *
 * Plain cosine similarity vector search without HNSW.
 * Used as a control to measure how much HNSW indexing helps.
 */

import type { MemoryAdapter, Session } from '../types.js';

export class BaselineAdapter implements MemoryAdapter {
  readonly name = 'Baseline (Cosine Similarity)';
  private entries: Array<{
    key: string;
    content: string;
    embedding: Float32Array | null;
    session_id: string;
    metadata: Record<string, unknown>;
  }> = [];
  private embedder: any = null;

  async init(): Promise<void> {
    // Try to load ONNX embedder for fair comparison
    try {
      const { OnnxEmbedder } = await import('../../../src/onnx-embedder.js');
      this.embedder = new OnnxEmbedder();
      await this.embedder.initialize();
    } catch {
      console.warn('[BaselineAdapter] ONNX embedder unavailable, using mock embeddings');
    }
  }

  async ingestSession(session: Session): Promise<void> {
    for (const msg of session.messages) {
      const key = `${session.session_id}:${msg.role}:${msg.timestamp ?? Date.now()}`;
      let embedding: Float32Array | null = null;

      if (this.embedder) {
        embedding = await this.embedder.embed(msg.content);
      }

      this.entries.push({
        key,
        content: msg.content,
        embedding,
        session_id: session.session_id,
        metadata: {
          session_id: session.session_id,
          role: msg.role,
          timestamp: msg.timestamp,
        },
      });
    }
  }

  async retrieve(
    question: string,
    topK: number = 10
  ): Promise<Array<{ content: string; score: number; session_id: string; metadata?: Record<string, unknown> }>> {
    if (!this.embedder || this.entries.length === 0) return [];

    const queryEmbedding = await this.embedder.embed(question);
    if (!queryEmbedding) return [];

    // Brute-force cosine similarity
    const scored = this.entries
      .filter(e => e.embedding !== null)
      .map(e => ({
        content: e.content,
        score: cosineSimilarity(queryEmbedding, e.embedding!),
        session_id: e.session_id,
        metadata: e.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  async getStats(): Promise<{ entries: number; sizeBytes: number }> {
    const contentBytes = this.entries.reduce((sum, e) => sum + e.content.length * 2, 0);
    const embeddingBytes = this.entries.reduce((sum, e) => sum + (e.embedding?.byteLength ?? 0), 0);
    return {
      entries: this.entries.length,
      sizeBytes: contentBytes + embeddingBytes,
    };
  }

  async close(): Promise<void> {
    this.entries = [];
    this.embedder = null;
  }
}

/** Cosine similarity between two vectors */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
