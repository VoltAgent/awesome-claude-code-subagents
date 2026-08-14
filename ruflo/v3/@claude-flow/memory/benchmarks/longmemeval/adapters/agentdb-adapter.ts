/**
 * AgentDB Memory Adapter for LongMemEval
 *
 * Uses AgentDB's HNSW-indexed vector search with ONNX embeddings
 * to store and retrieve conversation memories.
 */

import type { MemoryAdapter, Session } from '../types.js';

export class AgentDBAdapter implements MemoryAdapter {
  readonly name = 'AgentDB (HNSW + ONNX)';
  private db: any = null;
  private config: {
    hnswM: number;
    hnswEfSearch: number;
    topK: number;
    similarityThreshold: number;
  };

  constructor(options?: {
    hnswM?: number;
    hnswEfSearch?: number;
    topK?: number;
    similarityThreshold?: number;
  }) {
    this.config = {
      hnswM: options?.hnswM ?? 16,
      hnswEfSearch: options?.hnswEfSearch ?? 100,
      topK: options?.topK ?? 10,
      similarityThreshold: options?.similarityThreshold ?? 0.3,
    };
  }

  async init(): Promise<void> {
    // Dynamic import to avoid circular deps
    const { AgentDBBackend } = await import('../../../src/agentdb-backend.js');

    this.db = new AgentDBBackend({
      storagePath: '.longmemeval-bench',
      enableHNSW: true,
      hnswM: this.config.hnswM,
      hnswEfConstruction: 200,
      hnswEfSearch: this.config.hnswEfSearch,
    });

    await this.db.initialize();
  }

  async ingestSession(session: Session): Promise<void> {
    if (!this.db) throw new Error('Adapter not initialized');

    for (const msg of session.messages) {
      const key = `${session.session_id}:${msg.role}:${msg.timestamp ?? Date.now()}`;
      await this.db.store({
        key,
        value: msg.content,
        namespace: 'longmemeval',
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
    topK?: number
  ): Promise<Array<{ content: string; score: number; session_id: string; metadata?: Record<string, unknown> }>> {
    if (!this.db) throw new Error('Adapter not initialized');

    const k = topK ?? this.config.topK;
    const results = await this.db.search({
      query: question,
      namespace: 'longmemeval',
      limit: k,
      threshold: this.config.similarityThreshold,
    });

    return results.map((r: any) => ({
      content: r.value ?? r.content ?? '',
      score: r.score ?? r.similarity ?? 0,
      session_id: r.metadata?.session_id ?? 'unknown',
      metadata: r.metadata,
    }));
  }

  async getStats(): Promise<{ entries: number; sizeBytes: number }> {
    if (!this.db) return { entries: 0, sizeBytes: 0 };
    const stats = await this.db.getStats?.() ?? { entries: 0 };
    return {
      entries: stats.entries ?? 0,
      sizeBytes: stats.sizeBytes ?? 0,
    };
  }

  async close(): Promise<void> {
    if (this.db?.close) await this.db.close();
    this.db = null;
  }
}
