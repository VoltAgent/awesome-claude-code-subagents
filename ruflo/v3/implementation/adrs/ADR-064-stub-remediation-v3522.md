# ADR-064: Stub Remediation & Full Implementation — v3.5.22

**Date:** 2026-03-17
**Status:** Implemented (22 stubs fully implemented in v3.5.43, PR #1438)
**Context:** Deep capability audit (ADR-063) identified stub implementations and broken features. This ADR documents the remediation plan and tracks which items were already functional vs genuinely needing fixes.

## Audit Correction

The ADR-063 audit flagged several items as "stub" or "missing" that are in fact **fully implemented**. The audit ran in Docker where some capabilities were degraded due to pruned dependencies, leading to false negatives.

### Already Implemented (No Changes Needed)

| Item | Finding | Evidence |
|------|---------|----------|
| **Session restore --latest** | Fully implemented with MCP integration | `session.ts:274-432` — interactive selector when no ID given |
| **Workflow persistence** | Saves to `.claude-flow/workflows/store.json` | `workflow-tools.ts:52-78` — `loadWorkflowStore()`/`saveWorkflowStore()` |
| **Daemon scheduler** | Working process management with PID files | `daemon.ts:234-458` — detached process, signal handling |
| **Flash Attention JS** | CPU-optimized block-wise implementation | `flash-attention.ts:67-150` — top-K sparse, fused softmax-matmul |
| **MCP path resolution** | Properly sanitized with `process.cwd()` | `session-tools.ts:34-39` — path sanitization regex |
| **Hook handler stdin** | Correct timeout + pause cleanup | `hook-handler.cjs:40-58` — graceful degradation |

### Genuinely Needs Implementation (7 Items)

| Priority | Item | Current State | Target |
|----------|------|---------------|--------|
| **P0** | @ruvector/learning-wasm integration | Not wired in CLI | Wire `@ruvector/learning-wasm@0.1.29` into neural commands |
| **P0** | Consensus vote counting | Proposals queued but no quorum validation | BFT 2/3 majority, Raft leader election, configurable quorum |
| **P1** | Memory delete HNSW cleanup | SQL row deleted, vector remains | Delete embedding row + rebuild search index |
| **P1** | SONA reinforcement learning | Signal recording only | Trajectory → reward → weight update loop |
| **P1** | EWC++ consolidation execution | Algorithm defined, not executed | Fisher matrix computation + penalty application |
| **P2** | Coverage hooks test integration | Returns 0% always | Read lcov.info / jest coverage-summary.json from disk |
| **P2** | Intelligence stats → neural bridge | Stats counter disconnected | Read from ReasoningBank `.claude-flow/neural/patterns.json` |

## Implementation Plan

### P0-1: @ruvector/learning-wasm Integration

Wire the published `@ruvector/learning-wasm@0.1.29` package into the CLI:

```
neural train → ruvector.initTraining() with WASM backend
neural predict → ruvector.predict() with Flash Attention
neural optimize → ruvector.quantize() for Int8
```

**Files:** `src/commands/neural.ts`, `src/ruvector/index.ts`
**Test:** `neural train --wasm` should use WASM backend, report >2x speedup

### P0-2: Consensus Protocol Implementation

Replace stub vote recording with real consensus algorithms:

**BFT (Byzantine Fault Tolerance):**
- Require 2f+1 votes where f = floor((n-1)/3)
- Validate vote signatures (hash-based)
- Detect conflicting votes from same agent

**Raft (Leader Election):**
- Term-based leader election
- Log replication to followers
- Heartbeat timeout triggers new election

**Quorum:**
- Configurable quorum threshold (default: majority)
- Timeout-based auto-resolution

**File:** `src/mcp-tools/hive-mind-tools.ts`
**Test:** Create proposal → submit votes → verify quorum reached/rejected

### P1-1: Memory Delete HNSW Cleanup

When deleting a memory entry:
1. Delete SQL row (existing)
2. Delete embedding from vector store
3. Mark HNSW index as dirty for rebuild on next search

**File:** `src/memory/memory-initializer.ts`
**Test:** Store entry → search finds it → delete → search no longer finds it

### P1-2: SONA Reinforcement Learning Loop

Implement the 4-step intelligence pipeline for real:

1. **RETRIEVE**: Find similar patterns via ReasoningBank (existing)
2. **JUDGE**: Score trajectory outcome (success/failure/partial)
3. **DISTILL**: Compute LoRA weight delta from successful trajectories
4. **CONSOLIDATE**: Apply EWC++ penalty to prevent catastrophic forgetting

**Implementation:**
- `recordTrajectoryStep()` → accumulate steps with outcomes
- `endTrajectory(verdict)` → compute reward signal
- `distillLearning()` → update pattern confidence scores based on outcomes
- `consolidate()` → apply EWC++ Fisher penalty

**Files:** `src/memory/intelligence.ts`, `src/memory/ewc-consolidation.ts`
**Test:** Train patterns → use them → record outcome → confidence scores change

### P1-3: EWC++ Consolidation Execution

The Fisher Information Matrix and consolidation formula are defined but not executed.

**Implementation:**
- After each successful trajectory, compute diagonal Fisher approximation
- Store Fisher values per pattern dimension
- On consolidation, apply penalty: `L_total = L_new + (lambda/2) * sum(F_i * (theta_i - theta_old_i)^2)`
- Persist Fisher matrices to `.swarm/ewc-fisher.json`

**File:** `src/memory/ewc-consolidation.ts`
**Test:** Train → consolidate → retrain different domain → verify original patterns preserved

### P2-1: Coverage Hooks Test Integration

Read real coverage data from common test tools:

**Supported formats:**
- `coverage/coverage-summary.json` (Jest/Istanbul)
- `coverage/lcov.info` (lcov)
- `.nyc_output/` (NYC)

**Implementation:**
- `coverage-gaps` reads coverage files, computes per-file gaps
- `coverage-route` uses coverage data to prioritize test-related tasks
- Falls back to "no coverage data found" message (not 0%)

**File:** `src/commands/hooks.ts` (coverage-gaps, coverage-route, coverage-suggest)

### P2-2: Intelligence Stats → Neural Bridge

Connect `hooks intelligence stats` to ReasoningBank data:

- Read pattern count from `.claude-flow/neural/patterns.json`
- Read trajectory count from `.claude-flow/neural/stats.json`
- Read SONA adaptation metrics from intelligence system

**File:** `src/commands/hooks.ts` (intelligence stats handler)

## Non-Functional Bug Fixes (8 Items)

| Issue | Fix | File |
|-------|-----|------|
| #1335 Daemon scheduler | Verify interval comparison uses consistent timestamps | `daemon.ts` |
| #1122 Memory delete HNSW | See P1-1 above | `memory-initializer.ts` |
| #1117 Orphan processes | Kill child process on timeout rejection | `src/utils/` |
| #1116 daemon.log 0 bytes | Use `import('fs')` instead of `require('fs')` in ESM | `daemon.ts` |
| #1113 Scheduling intervals | Fix interval multiplier calculation | `daemon.ts` |
| #1333 MCP from / | Already fixed — path sanitization is correct | N/A |
| #1342 Post-bash junk files | Quote/escape tool output in hook args | `hook-handler.cjs` |
| #1331 stdin hang | Already fixed — timeout + pause cleanup works | N/A |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@ruvector/learning-wasm` | 0.1.29 | MicroLoRA, Flash Attention WASM, Int8 quantization |
| `@claude-flow/memory` | 3.0.0-alpha.12 | AgentDB + ControllerRegistry |

## Success Criteria

1. `neural train --wasm` uses WASM backend and reports >2x speedup
2. `hive-mind consensus` validates votes with real quorum logic
3. `memory delete` removes both SQL row and embedding vector
4. `neural train` → `neural predict` → `hooks post-task` → confidence scores update
5. `coverage-gaps` reads real coverage files (or reports "no data" instead of 0%)
6. `hooks intelligence stats` shows real pattern/trajectory counts
7. All 8 bug fixes verified
8. Build clean, all 301+ command endpoints functional

## Consequences

### Positive
- Eliminates all known stub implementations
- WASM integration unlocks real Flash Attention and Int8 quantization performance
- Consensus protocols become functional for multi-agent coordination
- RL loop makes the learning system genuinely adaptive

### Negative
- `@ruvector/learning-wasm` adds ~2MB to package size
- Consensus overhead adds latency to hive-mind operations
- Real RL requires more computation than stub signal recording

### Risks
- WASM module may not load in all environments (fallback to JS required)
- Consensus with slow/unreachable agents needs timeout handling
- EWC++ Fisher matrices grow with pattern count — need size limits
