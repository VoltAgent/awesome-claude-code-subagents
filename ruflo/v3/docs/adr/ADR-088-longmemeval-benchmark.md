# ADR-088: LongMemEval Benchmark for AgentDB Memory System

**Status:** Accepted — Partially Implemented (Phases 1–3 executed; Phase 4 publication deferred — scores below 90% target)
**Date:** 2026-04-08 · **Updated:** 2026-05-09
**Author:** ruflo team  
**Relates to:** ADR-076 (Memory Bridge), ADR-077 (DiskANN), ADR-075 (Learning Pipeline)

## Context

[MemPalace](https://github.com/milla-jovovich/mempalace), a new open-source AI memory system, reported a **96.6% raw score** and **100% hybrid score** on [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025) — a benchmark of 500 questions testing long-term conversational memory across 6 question types. This prompted the question: how does Ruflo's AgentDB memory system compare?

### LongMemEval Landscape (April 2026)

| System | Score | Mode | API Required |
|--------|-------|------|-------------|
| MemPalace | 100% (500/500) | Hybrid (Haiku reranking) | Yes (Haiku) |
| MemPalace | 96.6% | Raw (local only) | No |
| OMEGA | 95.4% | Cloud | Yes |
| Observational Memory | 94.87% | gpt-5-mini | Yes |
| Supermemory | ~93% | gpt-4o | Yes |
| GPT-4o (long context) | 30-70% | Baseline | Yes |
| **AgentDB** | **Unknown** | — | — |

### Why This Matters

- LongMemEval is the de facto standard for evaluating AI memory systems
- Without a published score, AgentDB cannot be credibly compared
- AgentDB has architectural advantages (HNSW indexing, semantic routing, 19 controllers) that should perform well — but we need proof
- Independent analysis of MemPalace found their "+34% retrieval boost" is standard metadata filtering, not novel — AgentDB's actual HNSW + controller architecture may outperform

### What LongMemEval Tests

The benchmark evaluates 5 core memory abilities across 500 questions:

1. **Information Extraction** — Retrieve specific facts from past conversations
2. **Multi-Session Reasoning** — Combine information across multiple conversation sessions
3. **Temporal Reasoning** — Understand when events occurred and their ordering
4. **Knowledge Updates** — Track how facts change over time (corrections, updates)
5. **Abstention** — Correctly refuse to answer when information was never provided

Question types: single-session (1-hop), multi-session (1-hop), single-session (multi-hop), multi-session (multi-hop), knowledge update, temporal reasoning.

### Dataset

- **Source:** [HuggingFace](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned)
- **Files:** `longmemeval_oracle.json`, `longmemeval_s_cleaned.json`, `longmemeval_m_cleaned.json`
- **Size:** 500 questions across conversation histories of varying length
- **Evaluation:** `src/evaluation/evaluate_qa.py` (official script)
- **Paper:** [arXiv:2410.10813](https://arxiv.org/abs/2410.10813)

## Decision

Implement a full LongMemEval benchmark harness for AgentDB and publish results transparently, including per-category breakdowns and comparison with other systems.

### Architecture

```
v3/@claude-flow/memory/benchmarks/longmemeval/
├── README.md                    # Setup & reproduction instructions
├── harness.ts                   # Main benchmark runner
├── adapters/
│   ├── agentdb-adapter.ts       # AgentDB memory backend
│   ├── agentdb-hnsw-adapter.ts  # AgentDB + HNSW mode
│   └── baseline-adapter.ts      # Plain vector search baseline
├── ingest.ts                    # Load LongMemEval conversations into AgentDB
├── evaluate.ts                  # Run question answering + score
├── report.ts                    # Generate comparison report
├── results/                     # Published results (git-tracked)
│   └── .gitkeep
└── scripts/
    ├── download-dataset.sh      # Fetch from HuggingFace
    └── run-benchmark.sh         # End-to-end benchmark execution
```

### Benchmark Modes

| Mode | Description | API Cost |
|------|-------------|----------|
| **Raw** | AgentDB HNSW search only, no LLM | $0 |
| **Hybrid** | HNSW retrieval + Haiku reranking | ~$0.05 |
| **Full** | HNSW + controller routing + Haiku | ~$0.10 |
| **Baseline** | Plain cosine similarity (no HNSW) | $0 |

### Implementation Plan

#### Phase 1: Harness Setup (Week 1)
1. Download LongMemEval dataset from HuggingFace
2. Build conversation ingestion pipeline (load sessions into AgentDB)
3. Implement question-answering interface using AgentDB retrieval
4. Wire up official evaluation script (`evaluate_qa.py`) for scoring
5. Create baseline adapter (plain vector search) for comparison

#### Phase 2: AgentDB Optimization (Week 2)
1. Test with existing HNSW index configuration
2. Tune retrieval parameters:
   - `efSearch` (accuracy vs speed tradeoff)
   - `M` (graph connectivity)
   - Top-k retrieval count
   - Similarity threshold
3. Test controller-based routing for multi-hop questions
4. Test temporal metadata for time-based questions
5. Test knowledge update detection via version tracking

#### Phase 3: Comparative Evaluation (Week 3)
1. Run all 4 modes (raw, hybrid, full, baseline)
2. Break down scores by question type (6 categories)
3. Compare against published results:
   - MemPalace (96.6% raw, 100% hybrid)
   - OMEGA (95.4%)
   - Observational Memory (94.87%)
4. Measure latency per query (p50, p95, p99)
5. Measure memory usage and storage size
6. Generate public report with full methodology

#### Phase 4: Publication (Week 3)
1. Commit results to `results/` directory
2. Create GitHub issue with findings
3. Update CLAUDE.md and README with verified scores
4. If score >= 95%, create dedicated benchmark page

### Key Metrics to Report

| Metric | Description |
|--------|-------------|
| Overall accuracy | % of 500 questions correct |
| Per-type accuracy | Breakdown by 6 question types |
| Raw mode score | Zero-API, local-only score |
| Hybrid mode score | With Haiku reranking |
| Latency p50/p95/p99 | Query response time |
| Memory footprint | RAM usage during evaluation |
| Storage size | Disk usage for ingested conversations |
| Ingestion time | Time to load all conversations |

### Honesty Protocol

Following the honesty audit standards from v3.5.71+:

1. **No tuning on test set** — Report held-out scores; if any questions are used for debugging, disclose it explicitly
2. **Report all modes** — Don't cherry-pick the best number; show raw, hybrid, and baseline
3. **Per-category breakdown** — Don't hide weak categories behind a strong aggregate
4. **Reproducible** — Anyone can clone the repo, run the script, and get the same numbers
5. **Disclose failures** — If AgentDB scores lower than MemPalace on any category, report it prominently
6. **Compare fairly** — Use the same evaluation script and dataset version as other systems

### Success Criteria

| Target | Score | Priority |
|--------|-------|----------|
| Raw mode (zero API) | >= 90% | Must-have |
| Hybrid mode (Haiku) | >= 96% | Target |
| Competitive with MemPalace raw | >= 96.6% | Stretch |
| Beat MemPalace raw | > 96.6% | Aspirational |
| Latency p95 | < 200ms | Must-have |
| Full reproducibility | 100% | Must-have |

### Expected AgentDB Advantages

1. **HNSW indexing** — Approximate nearest neighbor search should outperform ChromaDB's brute-force on larger datasets
2. **Controller routing** — 19 specialized controllers can route multi-hop questions to the right retrieval strategy
3. **Temporal metadata** — AgentDB stores timestamps natively, which should help temporal reasoning questions
4. **Version tracking** — Knowledge update questions should benefit from AgentDB's entry versioning
5. **Semantic routing** — `agentdb_semantic-route` can classify question type and apply type-specific retrieval

### Expected AgentDB Disadvantages

1. **No verbatim storage** — AgentDB uses embeddings, not raw text storage; may lose detail on exact-match questions
2. **No conversation structure** — MemPalace's palace metaphor (wings/halls/rooms) provides hierarchical scoping that AgentDB lacks
3. **Embedding model size** — all-MiniLM-L6-v2 (384-dim) is smaller than some competitors' models

## Consequences

### Positive
- First published LongMemEval score for AgentDB — fills a credibility gap
- Identifies specific areas where AgentDB's retrieval can be improved
- Provides a reproducible benchmark for regression testing
- Positions Ruflo in the growing "AI memory leaderboard" conversation

### Negative
- If AgentDB scores significantly below 90%, it's a public admission of weakness
- Benchmark optimization could distract from feature development
- LongMemEval is a synthetic benchmark — real-world performance may differ

### Risks
- LongMemEval is a conversational memory benchmark; AgentDB is designed for agent orchestration memory — the benchmark may not test AgentDB's actual strengths
- Over-optimizing for a benchmark can lead to benchmark gaming (Goodhart's Law)

## Implementation status (2026-05-09)

Phases 1–3 executed. Phase 4 (publication) deferred — Content@1 peaked at 26.8%, well below the 90% must-have target, making public leaderboard submission premature.

| Phase | Status | Files | Commit(s) |
|---|---|---|---|
| **Phase 1** — Harness setup: ingest pipeline, agentdb-adapter, baseline-adapter, download/run scripts | Implemented | `v3/@claude-flow/memory/benchmarks/longmemeval/harness.ts`, `adapters/agentdb-adapter.ts`, `adapters/baseline-adapter.ts`, `scripts/*.sh`, `types.ts` | `b395d1255 feat: ADR-088 LongMemEval benchmark harness for AgentDB (#1566)` |
| **Phase 2** — Retrieval parameter tuning (efSearch, M, top-k, recency weighting, BM25+RRF hybrid) | Implemented | `v3/@claude-flow/memory/benchmarks/longmemeval/` (session files + run artifacts) | `6bbbdbe2a bench(adr-088): BM25 + RRF hybrid retrieval` · `f88e99ba1 docs(adr-088): add 2026-05-01 run results` |
| **Phase 3** — Comparative evaluation: n=500, all modes, per-category breakdown, ablations, SOTA config | Implemented | `v3/docs/adr/ADR-088-longmemeval-benchmark.md` (Run Results + Optimization Roadmap sections) | `edf5c6ed1 bench(adr-088): smart-pipeline ablations + bge-large hybrid; metric ceiling reached` · `b6ca2dd5d docs(adr-088): record smart+hybrid SOTA (C@1=26.8%, MRR=0.3269)` |
| **Phase 3 — QA eval harness** (RAG + LLM judge, comparable to leaderboard) | Implemented | `v3/@claude-flow/memory/benchmarks/longmemeval/evaluate-qa.ts` | `cd198a5c6 bench(adr-088): wire LongMemEval QA eval harness (RAG + LLM judge)` |
| **Phase 4** — Publish results, GitHub issue, README/CLAUDE.md update, benchmark page | **Deferred** | — | — |

### Key results (SOTA config: smart hybrid hash+BM25, n=500)

| Metric | Raw HNSW | Smart Hybrid (SOTA) |
|---|---|---|
| Session R@10 | 100.0% | 100.0% |
| Content@1 | 22.2% | **26.8%** |
| Content@3 | 35.8% | 37.0% |
| MRR (content) | 0.2967 | **0.3269** |

Session routing is solved (R@10 = 100%). Content-level retrieval is the gap — embedding model quality and chunking strategy are the primary levers. See Optimization Roadmap section for the tiered plan to close the gap.

### Deferred items

- **Phase 4 publication**: scores below the 90% must-have target; no public benchmark page or leaderboard entry created.
- **`agentdb-hnsw-adapter.ts`**: not built — harness uses `agentdb-adapter.ts` which covers HNSW mode inline; separate HNSW adapter file was not needed in practice.
- **`evaluate.ts` / `report.ts`** as separate modules: functionality merged into `harness.ts` and `evaluate-qa.ts` rather than split as originally planned.

## References

- [LongMemEval Paper (ICLR 2025)](https://arxiv.org/abs/2410.10813)
- [LongMemEval GitHub](https://github.com/xiaowu0162/LongMemEval)
- [LongMemEval Dataset](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned)
- [MemPalace GitHub](https://github.com/milla-jovovich/mempalace)
- [MemPalace Benchmark Analysis (lhl/agentic-memory)](https://github.com/lhl/agentic-memory/blob/main/ANALYSIS-mempalace.md)
- [MemPalace Benchmark Issues (#29)](https://github.com/milla-jovovich/mempalace/issues/29)
- [Observational Memory (Mastra)](https://mastra.ai/research/observational-memory)
- [OMEGA Benchmark](https://omegamax.co/benchmarks)
- [Emergence AI SOTA on LongMemEval](https://www.emergence.ai/blog/sota-on-longmemeval-with-rag)
