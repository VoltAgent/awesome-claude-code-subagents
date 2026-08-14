/**
 * LongMemEval Benchmark Types
 * Based on: https://github.com/xiaowu0162/LongMemEval
 */

/** A single conversation session from the dataset */
export interface Session {
  session_id: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
  }>;
}

/** A benchmark question */
export interface Question {
  question_id: string;
  question: string;
  answer: string | string[];
  question_type: QuestionType;
  evidence_session_ids: string[];
  /** Number of reasoning hops required */
  num_hops: number;
}

/** The 6 question types in LongMemEval */
export type QuestionType =
  | 'single-session-single-hop'
  | 'single-session-multi-hop'
  | 'multi-session-single-hop'
  | 'multi-session-multi-hop'
  | 'knowledge-update'
  | 'temporal-reasoning';

/** Benchmark mode */
export type BenchmarkMode = 'raw' | 'hybrid' | 'full' | 'baseline';

/** Result for a single question */
export interface QuestionResult {
  question_id: string;
  question_type: QuestionType;
  predicted_answer: string;
  gold_answer: string | string[];
  correct: boolean;
  retrieval_time_ms: number;
  generation_time_ms: number;
  retrieved_chunks: number;
}

/** Aggregate results per question type */
export interface CategoryResult {
  question_type: QuestionType;
  total: number;
  correct: number;
  accuracy: number;
  avg_retrieval_ms: number;
  avg_generation_ms: number;
}

/** Full benchmark report */
export interface BenchmarkReport {
  timestamp: string;
  mode: BenchmarkMode;
  system: string;
  version: string;
  overall: {
    total: number;
    correct: number;
    accuracy: number;
  };
  by_category: CategoryResult[];
  latency: {
    retrieval_p50_ms: number;
    retrieval_p95_ms: number;
    retrieval_p99_ms: number;
    generation_p50_ms: number;
    generation_p95_ms: number;
  };
  storage: {
    sessions_ingested: number;
    total_messages: number;
    db_size_bytes: number;
    index_size_bytes: number;
  };
  config: {
    embedding_model: string;
    embedding_dims: number;
    hnsw_m: number;
    hnsw_ef_search: number;
    top_k: number;
    similarity_threshold: number;
  };
}

/** Memory adapter interface — implementations provide storage + retrieval */
export interface MemoryAdapter {
  /** Human-readable name */
  readonly name: string;

  /** Initialize the adapter and create indices */
  init(): Promise<void>;

  /** Ingest a conversation session */
  ingestSession(session: Session): Promise<void>;

  /** Retrieve relevant context for a question */
  retrieve(question: string, topK?: number): Promise<Array<{
    content: string;
    score: number;
    session_id: string;
    metadata?: Record<string, unknown>;
  }>>;

  /** Get storage stats */
  getStats(): Promise<{ entries: number; sizeBytes: number }>;

  /** Clean up resources */
  close(): Promise<void>;
}
