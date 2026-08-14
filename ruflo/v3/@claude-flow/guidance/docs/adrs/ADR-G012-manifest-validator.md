# ADR-G012: Manifest Validator and Conformance Suite

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

The Agentic Container System Specification (v0.1) defines Agent Cell Manifests that declare an agent's identity, budgets, data policy, tool policy, memory policy, and observability requirements. Without a validator, malformed or over-privileged manifests can enter the system and create security gaps.

## Decision

Implement `ManifestValidator` with **fails-closed** admission control:

### Validation Rules

| Check | Error Code | Severity |
|-------|-----------|----------|
| Missing apiVersion | `MISSING_FIELD` | Reject |
| Unsupported API version | `UNSUPPORTED_API_VERSION` | Reject |
| Missing cell name/purpose/codeRef | `MISSING_FIELD` | Reject |
| Invalid SHA-256 digest format | `INVALID_DIGEST` | Reject |
| Negative budget values | `BUDGET_NEGATIVE` | Reject |
| Budget exceeding maximum limits | `BUDGET_EXCEED` | Reject |
| Wildcard in network allowlist | `WILDCARD_NETWORK` | Reject (unless privileged) |
| Invalid data sensitivity enum | `INVALID_ENUM` | Reject |
| Region conflict (allowed intersects blocked) | `REGION_CONFLICT` | Reject |
| Missing memory namespace | `MISSING_FIELD` | Reject |

### Risk Scoring

Three axes compose the risk score (0-100):

| Axis | Weight | Factors |
|------|--------|---------|
| Tool risk | High | Bash, Task, network wildcards, write confirmation disabled |
| Data sensitivity | Medium | PII allowed, restricted data, long retention |
| Privilege surface | Medium | Global memory scope, overwrite mode, gates disabled |

### Lane Selection

Risk score determines execution lane:

| Condition | Lane |
|-----------|------|
| `portabilityRequired` | wasm (forced) |
| Risk exceeds `maxRiskScore` | wasm (forced) |
| Risk >= 70 | wasm |
| Risk >= 40 with native preference | sandboxed (downgrade) |
| Low risk | Respect `preferredLane` |

### Admission Decision

| Risk | Decision |
|------|----------|
| Below admit threshold (default 30) | `admit` |
| Between thresholds | `review` (human approval required) |
| Above reject threshold (default 70) or any validation error | `reject` |

### Conformance Suite

`ConformanceSuite` validates system behavior against golden traces — recorded sequences of events with expected gate decisions. Ships with 5 default traces covering destructive commands, secrets, budget exceedance, memory without evidence, and valid operations.

## Consequences

- No agent cell can enter the system without passing validation
- Any single validation error causes rejection (fails-closed)
- Risk scoring provides quantitative basis for lane selection
- Golden traces enable regression testing of gate behavior
- 59 tests validate all validation paths, risk computation, and lane selection

## Alternatives Considered

- **Schema-only validation (JSON Schema)**: Cannot express semantic constraints like region conflicts or risk-based lane selection
- **Soft validation with warnings**: Violates the Agentic Container Spec's "admission means contract" principle
- **External policy engine (OPA/Rego)**: Adds a dependency and runtime cost; can be added later as an alternative evaluator
