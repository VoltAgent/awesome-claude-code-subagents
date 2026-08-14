---
# ADR-067: RuVector WASM Utilization Improvement Plan

**Status**: Proposed
**Date**: 2026-03-26
**Author**: RuvNet

## Context

The CLI declares 6 `@ruvector` WASM packages in `optionalDependencies`, promising significant performance improvements (Flash Attention 2.49x-7.47x, SONA <0.05ms adaptation, HNSW 150x-12,500x search). A utilization audit revealed that most of these packages are either dead code, permanently falling back to JS implementations, or only reachable through MCP tools rather than the CLI surface.

Key audit findings:

- **@ruvector/router** is dead code: imported but never called, all routing falls back to JS logic
- **@ruvector/learning-wasm** falls back to the JS implementation 100% of the time
- **@ruvector/attention** is only exercised in benchmark paths, never in production request flows
- **@ruvector/sona** engine is created but rarely invoked for actual pattern learning
- **@ruvector/rvagent-wasm** and **@ruvector/ruvllm-wasm** are properly integrated but only exposed via MCP tools, not the CLI
- All WASM-dependent tests use mocks -- 0% real WASM coverage
- Declared performance targets are not verifiable in production because the WASM paths are never reached

## Decision

Adopt a tiered remediation plan to close the gap between declared capabilities and actual utilization.

### Tier 1 -- Immediate (dead code removal)

Remove `@ruvector/router` from `optionalDependencies` and delete the unused import, OR integrate it into the `hooks route` command so the WASM router is actually invoked when available. Prefer integration if the package is functional; prefer removal if it is not.

### Tier 2 -- Short-term (CLI exposure)

Expose `rvagent-wasm` and `ruvllm-wasm` capabilities through CLI commands so they are not locked behind MCP-only access:

- `agent wasm-create` -- create an agent backed by the WASM runtime
- `agent wasm-prompt` -- send a prompt to a WASM-backed agent
- `neural wasm-infer` -- run inference through ruvllm-wasm

### Tier 3 -- Medium-term (WASM-first fallback inversion)

Invert the current pattern where WASM is optional and JS is default. For `learning-wasm`, `sona`, and `attention`:

1. Attempt WASM load first
2. Log a warning when falling back to JS
3. Surface fallback status in `doctor` health checks
4. Wire `attention` into production memory-search paths (not just benchmarks)

### Tier 4 -- Validation (real test coverage)

- Replace mocked WASM tests with integration tests that load actual WASM binaries
- Add a CI benchmark suite that runs on each release to verify performance claims
- Gate performance target claims in documentation on passing CI benchmarks

## Utilization Matrix

| Package | Current State | Utilization | Target State | Target Utilization |
|---------|--------------|-------------|--------------|-------------------|
| `@ruvector/router` | Imported, never called | 0% | Integrated into `hooks route` or removed | 100% or removed |
| `@ruvector/learning-wasm` | Always falls back to JS | 0% (WASM) | WASM-first with JS fallback + warning | 80%+ (WASM) |
| `@ruvector/attention` | Benchmark-only | ~5% | Production memory-search + benchmark | 60%+ |
| `@ruvector/sona` | Engine created, rarely invoked | ~10% | Active in `hooks pretrain`, `neural train` | 70%+ |
| `@ruvector/rvagent-wasm` | MCP-only | 40% | MCP + CLI (`agent wasm-*`) | 90%+ |
| `@ruvector/ruvllm-wasm` | MCP-only | 40% | MCP + CLI (`neural wasm-infer`) | 90%+ |

## Consequences

### Positive

- Actually achieve declared performance targets (Flash Attention, SONA adaptation times)
- Remove dead code that inflates package size and confuses contributors
- Expose hidden capabilities to CLI users who do not use MCP
- Real test coverage prevents regressions in WASM integration
- CI benchmarks make performance claims auditable

### Negative

- Increases the effective dependency surface from optional to semi-required
- WASM binaries add to package size (~2-5 MB per package)
- More complex initialization logic with WASM-first loading

### Risks

- WASM packages may not load on all platforms (Alpine, older Node, constrained CI). JS fallback must remain available.
- WASM binary updates may lag behind JS implementation changes, requiring coordinated releases.
- CI benchmark results may vary across runner hardware, requiring tolerance bands.

## Related

- ADR-066: v3.5.24 Audit Remediation (prior audit cycle)
- `v3/@claude-flow/cli/package.json` -- optionalDependencies declarations
- `v3/@claude-flow/cli/src/hooks/` -- hooks route command
- `v3/@claude-flow/cli/src/mcp/tools/` -- MCP tool definitions for rvagent and ruvllm
