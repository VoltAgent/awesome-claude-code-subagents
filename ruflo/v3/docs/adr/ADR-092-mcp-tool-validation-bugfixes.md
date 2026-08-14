# ADR-092: MCP Tool Input Validation Bugfixes

**Status**: Accepted  
**Date**: 2026-04-28  
**Version**: v3.6.0 → v3.6.1

## Context

Comprehensive tool verification (~190 MCP tools across 4 servers) revealed 6 bugs in input validation and WASM serialization within `@claude-flow/cli`. All stem from overly strict or mismatched validators, null safety gaps, and raw WASM objects leaking through the MCP JSON layer.

## Bugs Fixed

### Bug 1 — `analyze_diff` rejects `~` and `^` in git refs (v3.6.0)

**Symptom**: `analyze_diff(ref: "HEAD~1")` → error "ref contains invalid characters".  
**Root cause**: All 5 `analyze_diff*` tools passed the `ref` parameter through `validateIdentifier()`, which only allows `[a-zA-Z0-9_\-.:])`. Standard git revision selectors `~`, `^`, and `/` were rejected.  
**Fix**: Added `validateGitRef()` with regex `[a-zA-Z0-9_\-.:~^/]` and switched all 5 `analyze_diff*` handlers to use it. Shell metacharacters remain blocked.  
**Files**: `validate-input.ts`, `analyze-tools.ts`

### Bug 2 — `transfer_plugin-info` rejects `@` in npm package names (v3.6.1)

**Symptom**: `transfer_plugin-info(name: "@claude-flow/embeddings")` → error "name contains invalid characters".  
**Root cause**: Plugin name passed through `validateIdentifier()` which rejects `@` and `/`.  
**Fix**: Added `validatePackageName()` with npm-scoped name regex `(@[a-zA-Z0-9_\-]+\/)?[a-zA-Z0-9_\-][a-zA-Z0-9_\-.]{0,213}` and switched `transfer_plugin-info` to use it.  
**Files**: `validate-input.ts`, `transfer-tools.ts`

### Bug 3 — `agentdb_batch` insert crashes on null embedder (v3.6.1)

**Symptom**: `agentdb_batch(operation: "insert", entries: [...])` → "Cannot read properties of null (reading 'embedBatch')".  
**Root cause**: `bridgeBatchOperation` calls `batch.insertEpisodes()` which internally calls `this.embedder.embedBatch()`, but the embedder dependency is null when the BatchOperations controller initializes without an embedding provider.  
**Fix**: Added guard checking `insertEpisodes` availability and a try/catch that surfaces actionable error ("Use memory_store instead" or "run embeddings_init first"). Also updated tool description to clarify that batch entries go to the AgentDB episodes table, not the `memory_search` namespace.  
**Files**: `memory-bridge.ts`, `agentdb-tools.ts`

### Bug 4 — `ruvllm_hnsw_route` returns raw WASM pointers (v3.6.1)

**Symptom**: Route results contain `[{__wbg_ptr: 1205504}]` instead of pattern data.  
**Root cause**: `router.route()` returns WASM objects that JSON.stringify converts to `{__wbg_ptr: N}` instead of extracting the underlying fields.  
**Fix**: Added serialization step in `createHnswRouter().route()` that maps WASM results to plain `{name, score, metadata}` objects.  
**Files**: `ruvllm-wasm.ts`

### Bug 5 — `ruvllm_microlora_adapt` hardcoded 768 dimension (v3.6.1)

**Symptom**: Creating with `inputDim: 16` then calling adapt → "Input size mismatch: expected 768, got 16".  
**Root cause**: The WASM binary internally validates against a fixed 768-dim expectation regardless of the configured `inputDim`. The JS wrapper correctly creates a `Float32Array(config.inputDim)` but the WASM rejects non-768 sizes.  
**Fix**: Added try/catch in `adapt()` that detects the mismatch error and surfaces an actionable message explaining the 768-dim requirement.  
**Files**: `ruvllm-wasm.ts`

### Bug 6 — `agentdb_batch` entries not findable via `memory_search` (v3.6.1)

**Symptom**: Entries stored via `agentdb_batch` insert can't be found via `memory_search` or deleted.  
**Root cause**: `agentdb_batch` writes to the AgentDB episodes table while `memory_search` queries the sql.js memory table — different storage backends with no cross-query.  
**Fix**: Updated `agentdb_batch` tool description to document this distinction and guide users to `memory_store` for entries that need to be searchable via `memory_search`.  
**Files**: `agentdb-tools.ts`

## Decision

- Introduce domain-specific validators (`validateGitRef`, `validatePackageName`) rather than relaxing the general `validateIdentifier` regex
- WASM return values must always be serialized to plain JS objects before entering the MCP JSON layer
- When a dependency is null at runtime, surface an actionable error message pointing to the correct alternative

## Consequences

- `analyze_diff` now accepts all standard git revision syntax
- `transfer_plugin-info` now accepts npm-scoped package names
- `agentdb_batch` returns a clear error instead of a null dereference crash
- `ruvllm_hnsw_route` returns usable JSON data instead of opaque WASM pointers
- `ruvllm_microlora_adapt` explains the 768-dim requirement instead of a cryptic mismatch error
- Users are guided to `memory_store` when they need `memory_search`-compatible storage
