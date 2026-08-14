# ADR-G025: Rust WASM Policy Kernel

## Status

Accepted

## Context

The Guidance Control Plane has security-critical hot paths (hashing,
signing, secret scanning, destructive command detection) that benefit
from:

1. **Determinism** — identical inputs must produce identical outputs
   across Node.js, Deno, and browser runtimes for replay parity.
2. **Predictable latency** — no GC pauses during gate evaluation.
3. **Portability** — ship a sealed policy engine that runs anywhere
   WASM runs.
4. **Smaller trusted computing base** — put all crypto and regex
   logic in a memory-safe, sandboxed Rust binary.

JavaScript implementations using `node:crypto` are fast (backed by
OpenSSL C code) but are not portable across runtimes and are not
deterministic across versions. Regex scanning in JS is subject to GC
stalls under load.

## Decision

Introduce a two-layer architecture:

**Layer A — Rust WASM kernel** (`wasm-kernel/`)
- Pure functions only. No filesystem, no network, no side effects.
- Compiles to `wasm32-unknown-unknown` with SIMD128 enabled.
- Modules: `proof` (SHA-256, HMAC-SHA256, chain verification),
  `gates` (secret scanning, destructive detection), `scoring`
  (shard scoring and ranking).

**Layer B — Node host bridge** (`src/wasm-kernel.ts`)
- Loads the WASM module at runtime with automatic JS fallback.
- Singleton `getKernel()` returns a `WasmKernel` interface.
- Batch API: `batchProcess()` sends multiple operations in one
  WASM boundary crossing.

### Key rule

The host calls the kernel once per event with a batch payload,
not thousands of tiny calls. This amortizes the WASM boundary
crossing cost.

### SIMD Configuration

The kernel compiles with `target-feature=+simd128` via
`.cargo/config.toml`. This enables:
- SIMD-accelerated `memchr` and Aho-Corasick in the `regex` crate
- Vectorized SHA-256 compression in the `sha2` crate
- Node.js 16+ supports WASM SIMD natively

To build without SIMD for maximum compatibility:
```
RUSTFLAGS="" wasm-pack build --target nodejs --release
```

## Performance

Measured with 10,000 synthetic events (SIMD + O2):

| Benchmark | JS | WASM SIMD | Ratio |
|-----------|-----|-----------|-------|
| Proof chain (10k events) | 76ms | 61ms | 1.25x |
| SHA-256 individual | 505k ops/s | 910k ops/s | 1.80x |
| Secret scan (clean) | 402k scans/s | 676k scans/s | 1.68x |
| Secret scan (dirty) | 185k scans/s | 362k scans/s | 1.96x |

SIMD vs non-SIMD WASM:

| Benchmark | No SIMD (Oz) | SIMD (O2) | SIMD gain |
|-----------|-------------|-----------|-----------|
| Proof chain (10k) | 95.0ms | 60.9ms | 1.56x |
| SHA-256 individual | 506k/s | 910k/s | 1.80x |
| Secret scan (clean) | 402k/s | 676k/s | 1.68x |
| Secret scan (dirty) | 185k/s | 362k/s | 1.96x |

## Consequences

**Positive:**
- Replay parity: identical proof root hash across JS and WASM
  (verified by acceptance test with 10k events)
- 1.25x–1.96x throughput gains with SIMD
- Deterministic across all platforms
- No GC pauses during gate evaluation
- WASM binary is sandboxed — cannot access filesystem or network

**Negative:**
- ~1.1MB WASM binary added to package (with SIMD + O2)
- Requires Rust toolchain + wasm-pack for rebuilding
- Batch API pattern needed to avoid boundary overhead
- Extra complexity in build pipeline

**Mitigated:**
- JS fallback ensures the package works without WASM
- WASM binary is pre-built and committed to `wasm-pkg/`
- 15 Rust unit tests + 15 WASM acceptance tests ensure parity

## Modules

| Module | Functions | Purpose |
|--------|-----------|---------|
| `proof` | `sha256_hex`, `hmac_sha256_hex`, `content_hash_sorted`, `verify_chain_json` | Crypto primitives for ProofChain |
| `gates` | `scan_secrets`, `detect_destructive` | Secret scanning, destructive detection |
| `scoring` | `score_shards`, `score_shards_json` | Shard relevance scoring for Retriever |

## Files

- `wasm-kernel/` — Rust crate with Cargo.toml, src/{lib,proof,gates,scoring}.rs
- `wasm-kernel/.cargo/config.toml` — SIMD target flags
- `wasm-pkg/` — Built WASM package (committed, ready to use)
- `src/wasm-kernel.ts` — Node host bridge with JS fallback
- `tests/wasm-kernel.test.ts` — 15 acceptance tests (parity + throughput)
