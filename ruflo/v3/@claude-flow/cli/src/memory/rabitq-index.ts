/**
 * RaBitQ Index — 1-bit quantized vector pre-filter (32× compression)
 *
 * Wraps @ruvector/rabitq-wasm to provide Hamming-scan pre-filtering
 * over quantized embeddings. Candidates are reranked with exact cosine
 * similarity from the full-precision source (HNSW or SQLite).
 *
 * Lifecycle:
 *  1. build() — bulk-load all embeddings from SQLite into the WASM index
 *  2. search() — fast Hamming scan → candidate ids → caller reranks
 *  3. rebuild() — called when entry count drifts >20% from last build
 */

import * as fs from 'fs';
import * as path from 'path';

interface RabitqEntry {
  id: string;
  key: string;
  namespace: string;
}

interface RabitqState {
  index: any; // RabitqIndex from WASM
  entries: RabitqEntry[]; // positional: entries[i] ↔ row i in build()
  dimensions: number;
  builtAt: number;
  vectorCount: number;
}

const RABITQ_SEED = 42n;
const RABITQ_RERANK_FACTOR = 20;
const REBUILD_DRIFT_THRESHOLD = 0.2; // rebuild when count drifts >20%

let rabitqState: RabitqState | null = null;
let rabitqInitializing = false;

async function loadRabitqModule(): Promise<{
  RabitqIndex: any;
  initSync: (m: any) => any;
  version: () => string;
} | null> {
  try {
    const mod = await import('@ruvector/rabitq-wasm');

    // Node.js: use initSync with the WASM bytes
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve('@ruvector/rabitq-wasm/ruvector_rabitq_wasm_bg.wasm');
    const wasmBytes = fs.readFileSync(wasmPath);
    mod.initSync({ module: wasmBytes });

    return {
      RabitqIndex: mod.RabitqIndex,
      initSync: mod.initSync,
      version: mod.version,
    };
  } catch {
    return null;
  }
}

/**
 * Build or rebuild the RaBitQ index from SQLite embeddings.
 * Returns entry count or 0 if RaBitQ is unavailable.
 */
export async function buildRabitqIndex(options?: {
  dbPath?: string;
  dimensions?: number;
  force?: boolean;
}): Promise<{
  success: boolean;
  vectorCount: number;
  dimensions: number;
  compressionRatio: number;
  buildTimeMs: number;
  wasmVersion?: string;
  error?: string;
}> {
  if (rabitqInitializing) {
    return { success: false, vectorCount: 0, dimensions: 0, compressionRatio: 0, buildTimeMs: 0, error: 'Build already in progress' };
  }

  rabitqInitializing = true;
  const startTime = Date.now();

  try {
    const mod = await loadRabitqModule();
    if (!mod) {
      rabitqInitializing = false;
      return { success: false, vectorCount: 0, dimensions: 0, compressionRatio: 0, buildTimeMs: 0, error: '@ruvector/rabitq-wasm not available' };
    }

    const dimensions = options?.dimensions ?? 384;
    const swarmDir = path.resolve(process.cwd(), '.swarm');
    const dbPath = options?.dbPath ? path.resolve(options.dbPath) : path.join(swarmDir, 'memory.db');

    const entries: RabitqEntry[] = [];
    const vectors: number[] = [];

    // Try bridge first (reads via better-sqlite3, sees WAL data)
    let usedBridge = false;
    try {
      const { bridgeGetAllEmbeddings } = await import('./memory-bridge.js');
      const bridgeRows = await bridgeGetAllEmbeddings({ dimensions, dbPath: options?.dbPath });
      if (bridgeRows && bridgeRows.length > 0) {
        for (const row of bridgeRows) {
          entries.push({ id: row.id, key: row.key, namespace: row.namespace });
          vectors.push(...row.embedding);
        }
        usedBridge = true;
      }
    } catch { /* bridge unavailable, fall through */ }

    // Fallback: read .swarm/memory.db via sql.js
    if (!usedBridge) {
      if (!fs.existsSync(dbPath)) {
        rabitqInitializing = false;
        return { success: false, vectorCount: 0, dimensions, compressionRatio: 0, buildTimeMs: 0, error: 'Database not found' };
      }

      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs();
      const fileBuffer = fs.readFileSync(dbPath);
      const db = new SQL.Database(fileBuffer);

      const result = db.exec(`
        SELECT id, key, namespace, embedding
        FROM memory_entries
        WHERE status = 'active' AND embedding IS NOT NULL
        LIMIT 50000
      `);

      if (result[0]?.values) {
        for (const row of result[0].values) {
          const [id, key, ns, embeddingJson] = row as [string, string, string, string];
          if (!embeddingJson) continue;

          try {
            const embedding = JSON.parse(embeddingJson) as number[];
            if (embedding.length !== dimensions) continue;

            entries.push({ id: String(id), key: key || String(id), namespace: ns || 'default' });
            vectors.push(...embedding);
          } catch {
            // skip invalid
          }
        }
      }

      db.close();
    }

    if (entries.length < 2) {
      rabitqInitializing = false;
      return { success: false, vectorCount: entries.length, dimensions, compressionRatio: 0, buildTimeMs: Date.now() - startTime, error: 'Need at least 2 vectors to build RaBitQ index' };
    }

    // Build the RaBitQ index
    const flatVectors = new Float32Array(vectors);
    const index = mod.RabitqIndex.build(flatVectors, dimensions, RABITQ_SEED, RABITQ_RERANK_FACTOR);

    // Free old index if exists
    if (rabitqState?.index) {
      try { rabitqState.index.free(); } catch { /* already freed */ }
    }

    rabitqState = {
      index,
      entries,
      dimensions,
      builtAt: Date.now(),
      vectorCount: entries.length,
    };

    // Persist metadata for fast reload hint
    try {
      const metaPath = path.join(swarmDir, 'rabitq.meta.json');
      fs.writeFileSync(metaPath, JSON.stringify({
        vectorCount: entries.length,
        dimensions,
        builtAt: rabitqState.builtAt,
        wasmVersion: mod.version(),
      }));
    } catch { /* best-effort */ }

    const rawBytes = entries.length * dimensions * 4; // f32 = 4 bytes
    const quantizedBytes = entries.length * Math.ceil(dimensions / 8); // 1 bit per dim
    const compressionRatio = rawBytes / Math.max(quantizedBytes, 1);

    rabitqInitializing = false;
    return {
      success: true,
      vectorCount: entries.length,
      dimensions,
      compressionRatio: Math.round(compressionRatio * 10) / 10,
      buildTimeMs: Date.now() - startTime,
      wasmVersion: mod.version(),
    };
  } catch (error) {
    rabitqInitializing = false;
    return {
      success: false,
      vectorCount: 0,
      dimensions: 0,
      compressionRatio: 0,
      buildTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Search the RaBitQ index for candidate IDs.
 * Returns null if index not built or unavailable.
 * Caller is responsible for reranking with exact similarity.
 */
export async function searchRabitq(
  queryEmbedding: number[],
  options?: { k?: number; namespace?: string }
): Promise<Array<{
  id: string;
  key: string;
  namespace: string;
  distance: number;
  position: number;
}> | null> {
  if (!rabitqState?.index) return null;

  try {
    const query = new Float32Array(queryEmbedding);
    if (query.length !== rabitqState.dimensions) return null;

    const k = options?.k ?? 10;
    // Get more candidates than needed for namespace filtering + rerank
    const expandedK = Math.min(k * 3, rabitqState.vectorCount);

    const rawResults = rabitqState.index.search(query, expandedK);

    const results: Array<{
      id: string;
      key: string;
      namespace: string;
      distance: number;
      position: number;
    }> = [];

    for (const hit of rawResults) {
      const pos = hit.id; // row index from build()
      const entry = rabitqState.entries[pos];
      if (!entry) continue;

      // Namespace filter
      if (options?.namespace && options.namespace !== 'all' && entry.namespace !== options.namespace) {
        continue;
      }

      results.push({
        id: entry.id,
        key: entry.key,
        namespace: entry.namespace,
        distance: hit.distance,
        position: pos,
      });

      // Free WASM SearchResult to prevent leak
      try { hit.free(); } catch { /* already freed */ }

      if (results.length >= k) break;
    }

    // Free remaining SearchResults
    for (const hit of rawResults) {
      try { hit.free(); } catch { /* already freed or used */ }
    }

    return results;
  } catch {
    return null;
  }
}

/**
 * Check if the RaBitQ index needs rebuilding.
 */
export async function shouldRebuildRabitq(currentEntryCount: number): Promise<boolean> {
  if (!rabitqState) return currentEntryCount >= 10; // Build if we have enough vectors

  const drift = Math.abs(currentEntryCount - rabitqState.vectorCount) / Math.max(rabitqState.vectorCount, 1);
  return drift > REBUILD_DRIFT_THRESHOLD;
}

/**
 * Get RaBitQ index status.
 */
export function getRabitqStatus(): {
  available: boolean;
  initialized: boolean;
  vectorCount: number;
  dimensions: number;
  builtAt: number | null;
  compressionRatio: number;
} {
  return {
    available: rabitqState !== null,
    initialized: rabitqState !== null,
    vectorCount: rabitqState?.vectorCount ?? 0,
    dimensions: rabitqState?.dimensions ?? 384,
    builtAt: rabitqState?.builtAt ?? null,
    compressionRatio: rabitqState ? Math.round((rabitqState.dimensions * 4) / Math.ceil(rabitqState.dimensions / 8) * 10) / 10 : 0,
  };
}
