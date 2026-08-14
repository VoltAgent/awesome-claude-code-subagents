# ADR-076: Bridge Claude Code Auto-Memory to AgentDB Vector Search

**Status**: Implemented (Phase 1: helper hook) / Proposed (Phase 2: MCP tools)
**Date**: 2026-04-07
**Branch**: `feat/claude-code-memory-bridge`
**Related**: ADR-048 (AutoMemoryBridge), ADR-075 (learning pipeline), ruDevolution

## Context

Claude Code's auto-memory system stores project knowledge in `~/.claude/projects/*/memory/MEMORY.md` files with YAML frontmatter. Ruflo's AgentDB stores data in sql.js with ONNX embeddings (all-MiniLM-L6-v2, 384d) for semantic vector search. These two systems were disconnected.

[ruDevolution](https://github.com/ruvnet/rudevolution) research (`07-context-and-session-management.md`) documents Claude Code's memory internals: auto-memory paths, env vars (`autoMemoryEnabled`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY`), session persistence, dream mode, and compaction system.

## Decision

Two-phase approach:

### Phase 1: Helper Hook (Implemented)

The existing `auto-memory-hook.mjs` (SessionStart/SessionEnd) bridges Claude Code memory to AgentDB:

- **import**: Reads MEMORY.md → JSON backend → stores into sql.js with ONNX embeddings
- **import-all**: Imports ALL Claude memories across ALL projects into AgentDB
- **sync**: Writes insights back to MEMORY.md + flushes intelligence patterns
- **status**: Shows bridge, AgentDB, SONA, patterns status

**Limitation**: Only runs on session hooks. Not accessible from MCP or CLI during a session.

### Phase 2: MCP Tools + CLI Commands (Proposed)

Move bridge logic into proper MCP tools for real-time access:

| MCP Tool | Description | Replaces |
|----------|-------------|----------|
| `memory_import_claude` | Import current project's Claude memories into AgentDB | `import` command |
| `memory_import_all` | Import ALL Claude memories across ALL projects | `import-all` command |
| `memory_bridge_status` | Show bridge status, vector counts, SONA state | `status` command |
| `memory_bridge_sync` | Sync AgentDB insights back to MEMORY.md | `sync` command |
| `memory_search_unified` | Search across both Claude memory and AgentDB | New |

CLI equivalents:
```bash
ruflo memory import-claude          # Import current project memories
ruflo memory import-claude --all    # Import all projects
ruflo memory bridge-status          # Show bridge status
ruflo memory bridge-sync            # Sync back to MEMORY.md
ruflo memory search --unified       # Search both stores
```

**Why MCP over helpers:**
- Accessible during sessions (not just start/end)
- Discoverable via ToolSearch
- Testable via CLI
- Works via `npx ruflo` without file path dependencies
- Composable with other MCP tools (swarm, hooks, hive-mind)
- Claude Code can call them directly through the MCP server

### Phase 3: MicroLoRA Embedding Adaptation (Future)

Once `@ruvector/learning-wasm` MicroLoRA is functional (currently identity pass-through due to zero-initialized weights), adapt the base MiniLM-L6-v2 embeddings for Claude Code's domain vocabulary:

- Tool names, agent types, MCP concepts cluster closer
- Successful trajectory patterns reinforce embedding neighborhoods
- Contrastive loss from (anchor, positive, negative) triplets
- ~2.6μs per adaptation step

**Current blocker**: WASM binding issues in `computeContrastiveLoss` (array type mismatch) and `optimizerStep` (Buffer reference). Tracked in `@ruvector/learning-wasm`.

## Architecture

```
Phase 1 (current):                     Phase 2 (proposed):
                                        
SessionStart hook                      MCP Tool: memory_import_claude
  └→ auto-memory-hook.mjs import         └→ memory-tools.ts handler
       └→ AutoMemoryBridge                    └→ read MEMORY.md files
       └→ storeEntry() + ONNX                └→ storeEntry() + ONNX
                                              └→ return results to Claude
                                        
SessionEnd hook                        MCP Tool: memory_bridge_sync
  └→ auto-memory-hook.mjs sync           └→ callable any time
       └→ syncToAutoMemory()                  └→ syncToAutoMemory()
       └→ flushPatterns()                     └→ flushPatterns()
                                        
Not available mid-session              MCP Tool: memory_search_unified
                                         └→ search both Claude + AgentDB
                                         └→ merged, deduplicated results
```

## Verified Results (Phase 1)

| Metric | Value |
|--------|-------|
| Claude memory files found | 4 (across 3 projects) |
| Entries imported | 5 (with section-level granularity) |
| Embedding model | ONNX all-MiniLM-L6-v2, 384 dimensions |
| Search "security vulnerability" | → security_analysis (score: 0.435) |
| Search "npm publish feedback" | → publish workflow (score: 0.624) |
| Search "ruvector package" | → ruvector analysis (score: 0.678) |
| Vectorization time | ~2s for 5 entries |

## Files

### Phase 1 (Implemented)
- `.claude/helpers/auto-memory-hook.mjs` — vectorization bridge + import-all + pattern flush

### Phase 2 (Proposed)
- `v3/@claude-flow/cli/src/mcp-tools/memory-tools.ts` — add MCP tool handlers
- `v3/@claude-flow/cli/src/commands/memory.ts` — add CLI subcommands

## References

- [ruDevolution](https://github.com/ruvnet/rudevolution) — Claude Code internals via decompilation
- `07-context-and-session-management.md` — auto-memory paths, env vars, session persistence
- `13-extension-points.md` — hooks, MCP, agents, skills integration catalog
- ADR-048: AutoMemoryBridge design
- ADR-075: Self-learning pipeline wiring
