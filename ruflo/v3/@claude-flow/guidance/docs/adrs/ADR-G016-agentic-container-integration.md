# ADR-G016: Agentic Container System Integration

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

The Agentic Container System Specification (v0.1) defines a comprehensive runtime model for autonomous AI agents including execution lanes, agent cell manifests, tool gateways, memory planes, supply chain integrity, and observability. The Guidance Control Plane must serve as the governance backbone for this specification.

## Decision

Map each specification section to a control plane component:

### Specification Coverage

| Spec Section | Control Plane Component | Status |
|-------------|------------------------|--------|
| Runtime Lanes (WASM/Sandboxed/Native) | `ManifestValidator.selectLane()` | Implemented |
| Agent Cell Manifest | `ManifestValidator.validate()` | Implemented |
| Tool Gateway API | `DeterministicToolGateway` | Implemented |
| Memory Plane | `MemoryWriteGate` + `CoherenceScheduler` | Implemented |
| Supply Chain Integrity | `ArtifactLedger` + `ProofChain` | Implemented |
| Observability | `PersistentLedger` + `RunLedger` | Implemented |
| Identity & Secrets | `CapabilityAlgebra` + `EnforcementGates` (secret gate) | Implemented |
| Cost Accounting | `EconomicGovernor` | Implemented |
| Failure Modes | `CoherenceScheduler` (privilege degradation) | Implemented |
| Evolution | `EvolutionPipeline` | Implemented |

### Agent Cell Axiom

Every agent cell in the system must satisfy five axioms:

| # | Axiom | Enforcement Point |
|---|-------|-------------------|
| 1 | Declare intent before acting | ManifestValidator (admission) |
| 2 | Request capability, never assume it | CapabilityAlgebra (grant/check) |
| 3 | Justify every write with evidence | MemoryWriteGate (evidence check) |
| 4 | Accept decay as natural, not failure | CoherenceScheduler (privilege levels) |
| 5 | Emit proof for every decision | ProofChain (hash-chained envelopes) |

### Acceptance Test

The Memory Clerk conformance test (`ConformanceRunner` + `MemoryClerkCell`) validates all five axioms in a single deterministic test run. This is the canonical acceptance test for the entire system.

### Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Manifest validation | < 5ms | < 1ms |
| Gate evaluation | < 1ms | < 0.5ms |
| Proof append | < 2ms | < 1ms |
| Memory write check | < 3ms | < 1ms |
| Coherence computation | < 1ms | < 0.5ms |
| Full conformance test | < 100ms | ~50ms |

## Consequences

- The Guidance Control Plane provides complete governance for the Agentic Container Specification
- All specification requirements are covered by implemented, tested components
- The Memory Clerk acceptance test provides a single pass/fail gate for system integrity
- Performance targets are met with margin
- The system is ready for integration with the broader Claude Flow V3 runtime

## Alternatives Considered

- **Separate governance layer**: Would duplicate logic and create consistency issues
- **External policy engine**: Adds latency and operational complexity; can be layered on top later
- **Per-specification libraries**: Fragmented, harder to reason about holistically
