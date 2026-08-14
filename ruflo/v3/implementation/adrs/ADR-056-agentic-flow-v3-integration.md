# ADR-056: agentic-flow 3.0.0-alpha.1 Integration

## Status
Accepted (2026-02-27)

## Date
2026-02-27

## Context

The `agentic-flow` package is the upstream coordination engine that powers claude-flow's ReasoningBank, Router, Agent Booster, QUIC transport, and intelligence subsystems. The major version upgrade from 2.0.7 to 3.0.0-alpha.1 introduces breaking changes, new modules, and a complete rewrite of the build pipeline.

### Previous State (2.0.7)

- Older SDK integration (`@anthropic-ai/sdk ^0.39`)
- No WASM modules
- No ReasoningBank pipeline
- No FastMCP 3.x support
- No Federation or Billing subsystems
- Known transitive vulnerabilities (sqlite3, tar)

### Upgrade Motivation

1. **Zero vulnerabilities** — sqlite3 removed from agentdb peer deps, vitest upgraded to v4
2. **FastMCP 3.x** — Zod-validated MCP tools with streaming support
3. **WASM acceleration** — ReasoningBank (211 KB) and QUIC transport (127 KB)
4. **AgentDB v3 controllers** — 8 controllers now fully exported (ADR-055 Phase 2)
5. **Claude Agent SDK** — `@anthropic-ai/claude-agent-sdk ^0.1.5` integration
6. **Modern dependencies** — Express 5.1, Anthropic SDK 0.65, Zod 3.25

## Decision

Upgrade `agentic-flow` from `^2.0.7` to `^3.0.0-alpha.1` in `@claude-flow/cli`, preserving all lazy-import patterns and fallback behavior.

### Package Overview

| Metric | Value |
|--------|-------|
| Version | 3.0.0-alpha.1 |
| Package size | 32 MB installed |
| Dist files | 595 `.d.ts` + 629 `.js` |
| WASM modules | 2 (ReasoningBank 211 KB, QUIC 127 KB) |
| Export subpaths | 10 |
| Dependencies | 20 runtime |
| Binaries | `agentic-flow`, `agentdb` |

### Export Subpaths

| Subpath | Module | Purpose |
|---------|--------|---------|
| `.` | `dist/index.js` | Core orchestration, agents, types |
| `./orchestration` | `dist/orchestration/index.js` | Workflow orchestration engine |
| `./sdk` | `dist/sdk/index.js` | E2B, plugins, security, streaming |
| `./security` | `dist/security/index.js` | Input validation, threat detection |
| `./reasoningbank` | `dist/reasoningbank/index.js` | 4-step learning pipeline (RETRIEVE→JUDGE→DISTILL→CONSOLIDATE) |
| `./reasoningbank/backend-selector` | Backend auto-selection | SQLite/WASM backend routing |
| `./reasoningbank/wasm-adapter` | WASM adapter | Browser-compatible WASM binding |
| `./router` | `dist/router/index.js` | ModelRouter with multi-provider support |
| `./agent-booster` | `dist/agent-booster/index.js` | WASM-accelerated code transforms |
| `./transport/quic` | `dist/transport/quic.js` | QUIC/UDP transport layer |

### Module Architecture (37 dist directories)

```
dist/
├── agentdb/         # AgentDB CLI and controllers
├── agents/          # 7 agent types (claudeAgent, directApi, webResearch, codeReview, data, claudeFlow, claudeAgentDirect)
├── benchmarks/      # Performance benchmarking
├── billing/         # 5-tier metering and subscriptions
├── cli/             # CLI proxy and wrappers
├── config/          # Configuration management
├── coordination/    # Multi-agent coordination primitives
├── core/            # Core engine and types
├── dashboard/       # Monitoring dashboard
├── db/              # Database layer
├── embeddings/      # Vector embedding engine
├── federation/      # EphemeralAgent, FederationHub
├── hooks/           # Hook system (pre/post edit/command/task)
├── intelligence/    # RuVector: SONA, HNSW, EWC++, EmbeddingCache, EmbeddingService
├── llm/             # Multi-provider LLM integration
├── mcp/             # FastMCP 3.x servers + 33+ MCP tools
├── memory/          # Memory management
├── middleware/       # Rate limiting
├── optimizations/   # Performance optimizations
├── orchestration/   # Workflow orchestration
├── packages/        # Sub-package management
├── proxy/           # Anthropic→OpenRouter proxy, QUIC proxy
├── reasoningbank/   # 4-step learning pipeline with WASM
├── router/          # Model routing (4+ providers)
├── routing/         # Request routing
├── sdk/             # E2B, plugins, security, streaming
├── security/        # Input validation, threat detection
├── services/        # Background services
├── swarm/           # Swarm orchestration
├── transport/       # QUIC/UDP transport
├── types/           # TypeScript type definitions
├── utils/           # Shared utilities
├── wasm/            # WASM module loaders
└── workers/         # Background workers
```

### MCP Tools (33+ via FastMCP 3.x)

| Category | Tool Files | Tools |
|----------|-----------|-------|
| Agent | add-agent, add-command, execute, list, parallel | Agent lifecycle |
| Hooks | pre/post-edit, pre/post-command, pretrain, route, explain, metrics, transfer, intelligence-bridge, intelligence-tools, benchmark, build-agents | 15 hook tools |
| Swarm | init, spawn, orchestrate, p2p-swarm | Swarm coordination |
| Memory | memory-tools | Store/search/retrieve |
| Neural | neural-tools, sona-tools, sona-rvf-tools | Neural pattern training |
| Performance | performance-tools, quantization-tools | Profiling and optimization |
| Infrastructure | infrastructure-tools, streaming-tools | System management |
| Intelligence | attention-tools, ruvector-tools, rvf-tools, gnn-tools | RuVector subsystem |
| Specialized | consensus-tools, cost-optimizer, daa-tools, explainability, github-tools, hidden-controllers, quic-tools, workflow-tools, autopilot-tools, session-tools | Domain-specific |
| Agent Booster | agent-booster-tools, enhanced-booster-tools | WASM code transforms |

### FastMCP Server Modes

| Server | Transport | Description |
|--------|-----------|-------------|
| `poc-stdio` | stdio | Proof-of-concept stdio server |
| `stdio-full` | stdio | Full-featured stdio server |
| `http-sse` | HTTP/SSE | Server-Sent Events transport |
| `http-streaming-updated` | HTTP | Streaming HTTP transport |
| `claude-flow-sdk` | SDK | Claude Flow SDK server |
| `hooks-server` | mixed | Hooks-specific server |

### Intelligence Modules

| Module | Description |
|--------|-------------|
| `RuVectorIntelligence` | Core intelligence engine (SONA + HNSW + EWC++) |
| `IntelligenceStore` | Persistent pattern storage |
| `EmbeddingService` | Vector embedding generation |
| `EmbeddingCache` | Embedding result caching |
| `agent-booster-enhanced` | WASM-accelerated code transforms |
| `wasm-acceleration` | WASM module loader and fallbacks |
| `embedding-benchmark` | Embedding performance measurement |

### ReasoningBank Modules

| Module | Description |
|--------|-------------|
| `index` | Core ReasoningBank engine |
| `AdvancedMemory` | Extended memory with forgetting curves |
| `HybridBackend` | SQLite + WASM hybrid storage |
| `agentdb-adapter` | AgentDB integration adapter |
| `backend-selector` | Auto-select optimal backend |
| `wasm-adapter` | Browser/Node WASM binding |
| `benchmark` | ReasoningBank performance tests |

### Key Dependencies (20 runtime)

| Dependency | Version | Purpose |
|-----------|---------|---------|
| `@anthropic-ai/claude-agent-sdk` | ^0.1.5 | Claude Agent SDK |
| `@anthropic-ai/sdk` | ^0.65.0 | Anthropic API |
| `@ai-sdk/google` | ^3.0.31 | Google AI integration |
| `@google/genai` | ^1.43.0 | Gemini provider |
| `@octokit/rest` | ^21.0.0 | GitHub API |
| `@ruvector/graph-node` | ^2.0.2 | GNN graph operations |
| `@xenova/transformers` | ^2.17.2 | Local embeddings |
| `agentdb` | ^1.4.3 | AgentDB v3 controllers |
| `express` | ^5.1.0 | HTTP server (MCP) |
| `fastmcp` | ^3.19.0 | FastMCP 3.x framework |
| `sql.js` | ^1.14.0 | WASM SQLite |
| `tiktoken` | ^1.0.22 | Token counting |
| `zod` | ^3.25.76 | Schema validation |

### Breaking Changes from 2.x

1. **Export subpaths**: New conditional exports for `./reasoningbank` (node vs browser)
2. **FastMCP 3.x**: All MCP tools migrated from custom protocol to Zod-validated FastMCP
3. **WASM requirement**: ReasoningBank and QUIC modules load WASM; fallback to JS for environments without WASM support
4. **Express 5.1**: HTTP transport uses Express 5 (breaking from Express 4.x middleware patterns)
5. **agentdb ^1.4.3**: New controller exports (HierarchicalMemory, MemoryConsolidation, SemanticRouter, GNNService, RVFOptimizer, MutationGuard, AttestationLog, GuardedVectorBackend)
6. **Provider-specific keys**: No more fallback from `ANTHROPIC_API_KEY` to other providers

## Integration Surface

### Files That Import agentic-flow (Updated)

| File | Import | Usage |
|------|--------|-------|
| `src/services/agentic-flow-bridge.ts` | `import('agentic-flow/reasoningbank')`, `import('agentic-flow/router')`, `import('agentic-flow/orchestration')` | **NEW** — Unified lazy-loading bridge for all v3 subpaths |
| `src/memory/memory-initializer.ts` | `import('agentic-flow/reasoningbank')`, `import('agentic-flow')` | Tier 1: ReasoningBank `computeEmbedding`, Tier 2: legacy core |
| `src/ruvector/enhanced-model-router.ts` | `import('agentic-flow/agent-booster')` | Agent Booster with local module (no npx), npx fallback |
| `src/commands/hooks.ts` | `import('agentic-flow/reasoningbank')`, `import('agentic-flow')` | Token optimizer — v3 ReasoningBank first, legacy fallback |
| `src/mcp-tools/neural-tools.ts` | `import('agentic-flow/reasoningbank')`, `import('@claude-flow/embeddings')` | Tier 1: ReasoningBank WASM, Tier 2: embeddings, Tier 3: mock |
| `src/commands/doctor.ts` | `import('agentic-flow/reasoningbank')`, `import('agentic-flow')` | **NEW** — Health check for agentic-flow capabilities |
| `src/commands/embeddings.ts` | provider option | `agentic-flow` as embedding provider |
| `src/types/optional-modules.d.ts` | Type declarations | Full types for 7 agentic-flow subpath modules |
| `src/init/executor.ts` | Version reference | Package version table (updated to 3.0.0-alpha.1) |
| `src/update/validator.ts` | Version constraint | Minimum version: 3.0.0-alpha.1 |

All imports use **lazy dynamic `import()`** with `.catch(() => null)` fallbacks. The CLI functions correctly without agentic-flow installed — it degrades gracefully to local-only embeddings and no WASM acceleration.

### Integration Changes Made

| # | File | Change |
|---|------|--------|
| I1 | `optional-modules.d.ts` | Expanded from 2 to 7 `agentic-flow/*` module declarations with full type coverage |
| I2 | `enhanced-model-router.ts` | Agent Booster: npx → local `import('agentic-flow/agent-booster')` with npx fallback |
| I3 | `memory-initializer.ts` | Added Tier 1: `computeEmbedding` from `agentic-flow/reasoningbank` before legacy fallback |
| I4 | `neural-tools.ts` | Added Tier 1: ReasoningBank WASM embeddings before @claude-flow/embeddings |
| I5 | `hooks.ts` | Token optimizer: v3 ReasoningBank direct import, detects version in spinner label |
| I6 | `doctor.ts` | New `checkAgenticFlow()` health check — detects ReasoningBank/Embeddings/Judgement/Consolidation |
| I7 | `agentic-flow-bridge.ts` | **NEW** — Unified bridge with `capabilities()`, `isAvailable()`, `computeEmbedding()`, `retrieveMemories()` |
| I8 | `executor.ts` | Version table: `2.0.1-alpha` → `3.0.0-alpha.1` |
| I9 | `validator.ts` | Min version: `0.1.0` → `3.0.0-alpha.1` |
| I10 | `hooks-tools.ts` | Comment: `agentic-flow@alpha` → `agentic-flow v3` |

### Compatibility Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Lazy imports | Compatible | All v3 subpath imports work with `.catch(() => null)` fallbacks |
| Type declarations | Compatible | 7 module declarations in `optional-modules.d.ts` |
| AgentDB controllers | Compatible | ADR-055 Phase 2 already adapted bridge for new exports |
| Memory bridge | Compatible | `memory-bridge.ts` hardened in ADR-055 |
| Embedding service | Compatible | 3-tier: ReasoningBank → @claude-flow/embeddings → mock |
| Router integration | Compatible | Local agent-booster import with npx fallback |
| Doctor health check | New | Detects all 4 ReasoningBank capabilities |
| Unified bridge | New | Single entry point for all agentic-flow v3 modules |

### Version Alignment

| Package | Dependency | Required Version |
|---------|-----------|-----------------|
| `@claude-flow/cli` | `agentic-flow` | `^3.0.0-alpha.1` (updated) |
| `@claude-flow/cli` | `agentdb` | `^3.0.0-alpha.10` (updated) |

## Consequences

### Positive

1. **Zero production vulnerabilities** — sqlite3 removed from agentdb peer deps, all transitive vuln chains broken
2. **WASM acceleration available** — ReasoningBank (211 KB) and QUIC (127 KB) WASM modules for native-speed operations
3. **FastMCP 3.x** — 33+ Zod-validated MCP tools with proper error handling and streaming
4. **Richer intelligence** — RuVectorIntelligence with SONA, HNSW, EWC++, Flash Attention
5. **Federation support** — EphemeralAgent and FederationHub for cross-instance coordination
6. **Billing infrastructure** — 5-tier metering system for commercial deployment
7. **Modern SDK** — Claude Agent SDK 0.1.5 for native agent spawning

### Negative

1. **Package size** — 32 MB installed (up from ~18 MB for 2.0.7) due to WASM and expanded module set
2. **WASM environment requirement** — Some CI environments may not support WASM; fallbacks exist but with reduced performance
3. **Alpha stability** — 3.0.0-alpha.1 may have API changes before stable release

### Risks

1. **WASM fallback path**: If WASM fails to load, JS fallbacks activate automatically. Performance degrades but functionality is preserved.
2. **Express 5 compatibility**: HTTP transport uses Express 5. Any middleware that depends on Express 4 patterns needs migration.
3. **FastMCP Zod schemas**: All MCP tool inputs are now Zod-validated. Invalid inputs get clear error messages instead of silent failures.

## Verification

```bash
# Verify installation
node -e "require('agentic-flow/package.json').version"  # → 3.0.0-alpha.1

# Verify WASM modules present
ls node_modules/agentic-flow/wasm/reasoningbank/*.wasm  # → 211K
ls node_modules/agentic-flow/wasm/quic/*.wasm           # → 127K

# Verify exports resolve
node -e "import('agentic-flow').then(m => console.log('Core:', !!m))"
node -e "import('agentic-flow/reasoningbank').then(m => console.log('RB:', !!m))"
node -e "import('agentic-flow/router').then(m => console.log('Router:', !!m))"

# Verify CLI tests pass
cd v3/@claude-flow/cli && npm test  # → 445 passed

# Verify zero production vulnerabilities
npm audit --omit=dev  # → 0 vulnerabilities
```

## Related ADRs

- **ADR-053**: AgentDB v3 Controller Activation — Initial 8 controllers + 6 MCP tools
- **ADR-054**: RVF-Powered Plugin Marketplace — IPFS plugin registry
- **ADR-055**: AgentDB Controller Bug Remediation — Fixed 30 security findings, upgraded stubs to real implementations
