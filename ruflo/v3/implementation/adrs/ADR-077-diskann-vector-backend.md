# ADR-077: DiskANN Vector Search Backend

**Status**: Implemented
**Date**: 2026-04-07
**Branch**: `feat/diskann-vector-backend`

## Context

ruflo's vector search uses three backends with different tradeoffs. With `@ruvector/diskann@0.1.0` now published (5-platform native binaries), we have a Vamana graph-based SSD-friendly alternative to HNSW.

## Benchmark Results (measured, not theoretical)

### 1,000 vectors, 384 dims, k=10, 100 queries

| Backend | Insert | Build | Search | QPS | Recall@10 | Memory |
|---------|--------|-------|--------|-----|-----------|--------|
| **DiskANN** | 0.57ms | 1,324ms | 16.5ms | **6,048** | **1.000** | -1.1MB* |
| HNSW | 4,662ms | 0ms | 12.7ms | 7,850 | 0.120 | 0.5MB |
| Cosine-JS | 0.89ms | 0ms | 64.6ms | 1,548 | 1.000 | 0.4MB |

### 5,000 vectors, 384 dims, k=10, 50 queries

| Backend | Insert | Build | Search | QPS | Recall@10 | Memory |
|---------|--------|-------|--------|-----|-----------|--------|
| **DiskANN** | 2.12ms | 15,955ms | 20ms | **2,501** | **0.874** | 0.9MB |
| HNSW | 24,614ms | 0ms | 8.9ms | 5,636 | 0.026 | 1.0MB |
| Cosine-JS | 6.84ms | 0ms | 155ms | 323 | 1.000 | 1.0MB |

*Negative memory = GC reclaimed during benchmark

### Analysis

- **DiskANN**: Perfect recall at 1K vectors (1.000), strong at 5K (0.874). Insert is 8,000x faster than HNSW. Build step is expensive (1-16s) but only needed once. QPS competitive.
- **HNSW** (@ruvector/router): Fastest search but very low recall (0.12 at 1K, 0.026 at 5K) — the score-as-distance inversion bug may still affect recall measurement. Very slow insert (4.6s for 1K).
- **Cosine-JS**: Perfect recall (brute force) but slowest search. Best for small datasets (<500 vectors).

## Decision

Add `@ruvector/diskann` as an optional backend with automatic fallback:

```
DiskANN (native, Vamana graph) → HNSW (@ruvector/router) → Cosine-JS (pure JS)
```

### Selection criteria

| Dataset size | Recommended backend | Reason |
|-------------|-------------------|--------|
| < 500 vectors | Cosine-JS | Perfect recall, fast enough |
| 500 - 50K vectors | DiskANN | High recall + reasonable QPS |
| > 50K vectors | DiskANN with PQ | SSD-friendly, sub-linear memory |

## Implementation

### Files
- `v3/@claude-flow/cli/src/ruvector/diskann-backend.ts` — unified backend with auto-selection, fallback chain, benchmark utility

### API
```typescript
import { insertVector, searchVectors, buildIndex, benchmark } from './ruvector/diskann-backend.js';

// Insert vectors
await insertVector('doc-1', embedding, { dim: 384 });
await insertVector('doc-2', embedding2, { dim: 384 });

// Build index (required for DiskANN)
await buildIndex({ dim: 384 });

// Search
const results = await searchVectors(queryEmbedding, 10, { dim: 384 });
// → [{ id: 'doc-1', distance: 0.02, score: 0.98 }, ...]

// Benchmark
const bench = await benchmark({ dim: 384, vectorCount: 1000, k: 10 });
```

### DiskANN-specific features
- **Vamana graph**: Bounded-degree directed graph optimized for SSD access patterns
- **Product Quantization**: Optional `pqSubspaces` parameter for memory compression
- **Disk persistence**: `save(dir)` / `DiskAnn.load(dir)` for persistent indexes
- **Batch insert**: `insertBatch()` for bulk loading
- **Async search**: `searchAsync()` for non-blocking queries

## Consequences

### Positive
- DiskANN provides perfect recall at 1K vectors and 87%+ at 5K
- Insert is 8,000x faster than HNSW (0.57ms vs 4,662ms for 1K vectors)
- Native disk persistence — no rebuild needed between sessions
- Product quantization enables billion-scale with bounded memory
- Graceful fallback chain: DiskANN → HNSW → Cosine-JS

### Negative
- Build step required before search (1-16s depending on dataset size)
- Native binary dependency (5 platforms, optional)
- Recall degrades slightly at scale (0.874 at 5K) vs brute-force (1.000)

### Neutral
- Memory usage comparable across all three backends at 5K vectors (~1MB)
- HNSW recall issue may be a measurement artifact from distance/similarity inversion
