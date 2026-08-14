# ADR-G014: Agent Cell Conformance Kit

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

The Agentic Container Specification and the Guidance Control Plane define contracts that every agent cell must honor. Without a concrete acceptance test, conformance claims are untestable. The system needs a canonical reference implementation (the Memory Clerk) and a test runner that validates all five axioms of the Agent Cell contract.

## Decision

Implement a three-part conformance kit:

### 1. SimulatedRuntime

A lightweight runtime that provides:
- Tool execution with gate enforcement
- Memory read/write with authority checking
- Coherence score tracking with privilege degradation
- Proof envelope recording for every action
- Budget tracking and enforcement

The runtime is deterministic — given the same inputs, it produces identical traces.

### 2. MemoryClerkCell

A canonical agent cell implementation that exercises the full contract:

| Phase | Operations | Count |
|-------|-----------|-------|
| Read | Memory reads across namespace | 20 |
| Infer | Single inference from read data | 1 |
| Write | Memory writes with gated coherence | 5 |
| Degrade | Coherence drop triggers privilege reduction | 1 |

The Memory Clerk is the simplest agent that exercises all five axioms:

1. **Declare intent** — manifest specifies reads, inference, writes
2. **Request capability** — capabilities granted for memory operations
3. **Justify writes** — writes include evidence from prior reads
4. **Accept decay** — coherence drop results in privilege reduction, not crash
5. **Emit proof** — every decision is recorded in a hash-chained proof envelope

### 3. ConformanceRunner

Orchestrates the test:

| Step | Validation |
|------|-----------|
| Run cell | Execute MemoryClerkCell in SimulatedRuntime |
| Check trace | All expected events present in correct order |
| Verify proof | Proof chain is intact (hash verification) |
| Replay | Run the same trace through gates again, verify identical decisions |
| Report | Pass/fail with detailed breakdown |

### Replay Verification

The runner captures the full event trace, then replays it through the gate system a second time. If any decision differs between the original run and the replay, the test fails. This validates determinism — the same inputs must always produce the same gate outcomes.

## Consequences

- The Memory Clerk becomes the canonical acceptance test for the entire control plane
- Any change to gates, coherence, or proof must still pass the conformance kit
- Replay verification ensures determinism across the full stack
- New agent cell implementations can be tested against the same runner
- 42 tests validate the runtime, cell, runner, and replay

## Alternatives Considered

- **Manual testing scripts**: Not reproducible, not deterministic
- **Property-based testing only**: Good for finding edge cases but doesn't validate the full contract lifecycle
- **External test harness**: Would require additional infrastructure; the in-process approach is faster and more portable
