# ADR-075: Wire Self-Learning Pipeline End-to-End

**Status**: Implemented
**Date**: 2026-04-06
**Branch**: `feat/wire-learning-pipeline`

## Context

The learning pipeline had all building blocks (SONA, LocalReasoningBank, ONNX embeddings, trajectory recording, pattern search, file persistence) but they weren't connected end-to-end. Trajectories recorded without embeddings, so distillation produced 0 patterns. The memory bridge tried to use AgentDB's ReasoningBank/LearningSystem but they require a `better-sqlite3` db handle that `ControllerRegistry` doesn't expose.

## Decision

1. **Auto-generate embeddings in `recordTrajectory`** — each step gets ONNX embedding (all-MiniLM-L6-v2, 384d) before distillation
2. **Store successful trajectory steps as patterns** — directly into LocalReasoningBank with confidence scoring
3. **Wire intelligence module into hooks** — `session-start` initializes SONA+ReasoningBank, `post-task` records trajectories
4. **Wire intelligence into memory bridge** — bridge registers LocalReasoningBank and SONA as controllers (bypassing AgentDB's constructor requirements)
5. **Add `patternsLearned` and `signalsProcessed`** to global stats

## Verification

| Capability | Before | After | Evidence |
|-----------|--------|-------|---------|
| Trajectory recording | Worked but no patterns | 9 patterns from 3 trajectories | `stats.patternsLearned: 9` |
| Embedding generation | Not called during trajectory | Auto-generated per step | ONNX all-MiniLM-L6-v2, 384d |
| Pattern search | 0 results | Correct semantic matches | "auth" → JWT pattern (0.584), "security" → SQL injection (0.661) |
| Pattern persistence | File never created | `patterns.json` written | `persist.patternsExist: true` |
| SONA coordinator | Initialized but idle | Active with trajectories | `stats.sonaEnabled: true` |
| Intelligence in hooks | Not wired | session-start inits, post-task records | Automatic on every session |

## Architecture

```
Hook fires (session-start / post-task)
    │
    ├── intelligence.initializeIntelligence()
    │   ├── LocalSonaCoordinator (RL, <0.05ms adaptation)
    │   └── LocalReasoningBank (pattern storage + file persistence)
    │
    ├── intelligence.recordTrajectory(steps, verdict)
    │   ├── generateEmbedding(step.content)  ← ONNX all-MiniLM-L6-v2
    │   ├── sonaCoordinator.recordTrajectory()
    │   ├── sonaCoordinator.endTrajectory() → RL reward
    │   ├── sonaCoordinator.distillLearning() → EWC consolidation
    │   └── reasoningBank.store(pattern) → file persistence
    │
    └── intelligence.findSimilarPatterns(query)
        └── reasoningBank.findSimilar(embedding, {k, threshold})
```

## References

- Intelligence module: `v3/@claude-flow/cli/src/memory/intelligence.ts`
- Memory bridge: `v3/@claude-flow/cli/src/memory/memory-bridge.ts`
- Hooks wiring: `v3/@claude-flow/cli/src/mcp-tools/hooks-tools.ts`
