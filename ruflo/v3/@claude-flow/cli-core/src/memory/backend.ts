/**
 * Memory backend abstraction (ADR-100 alpha.1).
 *
 * Defines the contract that any memory implementation in the Claude Flow
 * ecosystem must satisfy. cli-core ships JsonMemoryBackend (this directory)
 * for the lite path; @claude-flow/cli ships SqliteHnswMemoryBackend (heavy
 * path with vector search) which implements the same interface.
 *
 * Plugins / scripts that only need basic key-value persistence
 * (cost-tracker's session records, budget config, etc.) work against this
 * interface — semantic search degrades to substring fallback in the lite
 * backend, but every other operation is feature-complete.
 */

export interface MemoryEntry {
  key: string;
  value: unknown;
  namespace: string;
  tags: string[];
  storedAt: string;          // ISO timestamp
  accessCount: number;
  lastAccessed: string;      // ISO timestamp
  ttlSeconds?: number;       // optional time-to-live (relative to storedAt)
}

export interface MemorySearchResult extends MemoryEntry {
  /**
   * Similarity score [0, 1]. The lite (JSON) backend produces a substring-
   * match score (1.0 = exact substring, 0 < x < 1 = fuzzy). The heavy
   * (SQLite/HNSW) backend produces a true cosine similarity from the vector
   * index. Callers ranking by score should treat the value as backend-
   * specific — comparing scores across backends is meaningless.
   */
  score: number;

  /** Which backend produced this result. Useful for observability. */
  backend: 'json' | 'sqlite-hnsw' | string;
}

export interface StoreOptions {
  namespace?: string;        // default: "default"
  tags?: string[];
  ttl?: number;              // seconds; expires at storedAt + ttl
  upsert?: boolean;          // default: false (UNIQUE-constraint behavior)
}

export interface SearchOptions {
  namespace?: string;
  limit?: number;            // default: 10
  threshold?: number;        // default: 0 (lite backend) or 0.3 (heavy)
}

export interface ListOptions {
  namespace?: string;
  limit?: number;            // default: 100
  tags?: string[];           // intersection filter
}

export interface MemoryStats {
  totalEntries: number;
  namespaces: string[];
  sizeBytes: number;         // approximate on-disk size
  backend: string;
}

/**
 * The contract every memory backend implements.
 * All methods are async to allow for I/O-heavy or remote backends.
 */
export interface MemoryBackend {
  /**
   * Store a value under (namespace, key). If a record exists at that
   * coordinate AND opts.upsert is false (default), throws a UNIQUE-constraint
   * error. With upsert: true, replaces.
   */
  store(key: string, value: unknown, opts?: StoreOptions): Promise<void>;

  /**
   * Read by exact (namespace, key). Returns null on miss.
   * Increments accessCount + lastAccessed.
   */
  retrieve(key: string, opts?: { namespace?: string }): Promise<MemoryEntry | null>;

  /**
   * Search by query. Lite backend = substring match (score=1 for exact
   * substring, 0.5 for case-insensitive partial); heavy backend = cosine
   * similarity over HNSW. Both honor namespace + threshold + limit.
   */
  search(query: string, opts?: SearchOptions): Promise<MemorySearchResult[]>;

  /**
   * Enumerate entries (with optional namespace + tag filtering).
   * Does NOT increment accessCount.
   */
  list(opts?: ListOptions): Promise<MemoryEntry[]>;

  /**
   * Remove an entry by exact (namespace, key). Returns true if deleted,
   * false if no such entry existed.
   */
  delete(key: string, opts?: { namespace?: string }): Promise<boolean>;

  /**
   * Backend health + size summary. Used by `memory stats` CLI subcommand.
   */
  stats(): Promise<MemoryStats>;

  /**
   * Backend identifier. cli-core's JSON backend returns 'json'; cli's
   * SQLite/HNSW backend returns 'sqlite-hnsw'. Used for observability and
   * for `memory_search` MCP-tool callers that want to know which scoring
   * regime they're dealing with.
   */
  readonly id: string;
}
