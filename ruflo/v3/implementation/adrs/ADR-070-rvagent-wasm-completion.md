# ADR-070: Complete @ruvector/rvagent-wasm & ruvllm-wasm Integration

**Status**: Implemented
**Date**: 2026-03-25
**Author**: RuvNet
**Supersedes**: Gaps identified in ADR-059

## Context

ADR-059 defined the integration plan for `@ruvector/rvagent-wasm` and
`@ruvector/ruvllm-wasm`. An audit on 2026-03-25 found that the code was fully
implemented but the wiring was incomplete:

| Item | ADR-059 Status | Actual State |
|------|---------------|--------------|
| `src/ruvector/agent-wasm.ts` | Planned | Implemented (387 lines) |
| `src/mcp-tools/wasm-agent-tools.ts` | Planned | Implemented (10 MCP tools) |
| `src/ruvector/ruvllm-wasm.ts` | Pending | Implemented (full module) |
| `src/mcp-tools/ruvllm-tools.ts` | Pending | Implemented (MCP tools) |
| `src/ruvector/index.ts` re-exports | Pending | Implemented (both modules) |
| `src/mcp-tools/index.ts` re-exports | Pending | Implemented (both tool sets) |
| `src/types/optional-modules.d.ts` | Planned | Implemented (ambient types) |
| `package.json` optional deps | Required | **Missing** — neither package listed |

The sole gap was that `@ruvector/rvagent-wasm` and `@ruvector/ruvllm-wasm` were
not declared in `package.json` `optionalDependencies`, meaning:

1. `npm install` would never fetch them
2. Runtime `import()` calls would always hit the graceful-degradation path
3. Users could not enable WASM agents without manually installing the packages

## Decision

Add both packages to `optionalDependencies` in `v3/@claude-flow/cli/package.json`:

```json
{
  "optionalDependencies": {
    "@ruvector/rvagent-wasm": "^0.1.0",
    "@ruvector/ruvllm-wasm": "^2.0.2"
  }
}
```

No code changes required — all integration modules, MCP tools, type
declarations, and re-exports were already in place.

## Implementation Summary

### rvagent-wasm (10 MCP Tools)

| Tool | File | Status |
|------|------|--------|
| `wasm_agent_create` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_prompt` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_tool` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_list` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_terminate` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_files` | `wasm-agent-tools.ts` | Working |
| `wasm_agent_export` | `wasm-agent-tools.ts` | Working |
| `wasm_gallery_list` | `wasm-agent-tools.ts` | Working |
| `wasm_gallery_search` | `wasm-agent-tools.ts` | Working |
| `wasm_gallery_create` | `wasm-agent-tools.ts` | Working |

### ruvllm-wasm MCP Tools

| Tool | File | Status |
|------|------|--------|
| `ruvllm_status` | `ruvllm-tools.ts` | Working |
| `ruvllm_hnsw_create` | `ruvllm-tools.ts` | Working |
| `ruvllm_sona_create` | `ruvllm-tools.ts` | Working |
| `ruvllm_microlora_create` | `ruvllm-tools.ts` | Working |
| `ruvllm_chat_format` | `ruvllm-tools.ts` | Working |
| `ruvllm_kvcache_create` | `ruvllm-tools.ts` | Working |

### Integration Modules

| Module | Lines | Exports |
|--------|-------|---------|
| `src/ruvector/agent-wasm.ts` | 387 | 20+ functions (lifecycle, gallery, RVF, MCP bridge) |
| `src/ruvector/ruvllm-wasm.ts` | ~350 | 12+ functions (HNSW, SONA, MicroLoRA, chat, KV, arena) |
| `src/ruvector/index.ts` | 245 | Re-exports all public API from both modules |

## Consequences

### Positive
- `npm install` now fetches WASM packages when available for the platform
- All 16 MCP tools become functional without manual package installation
- Consistent with existing `@ruvector/*` optional dependency pattern
- No breaking changes — graceful degradation still works when packages unavailable

### Negative
- Additional ~820 kB unpacked size in optional deps (620 kB + 200 kB)
- Both packages still have known upstream issues (see ADR-059 § Known Issues)

### Neutral
- ADR-059 can now be considered fully implemented
- No new code was needed — only the dependency declaration was missing
