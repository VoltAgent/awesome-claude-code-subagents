# ADR-G010: Capability Algebra

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

Agent permissions were previously flat lists of allowed tools. This fails when agents need to delegate partial permissions, apply time-bound constraints, or compose permissions from multiple authorities. A structured permission model is required where capabilities are typed objects that can be reasoned about algebraically.

## Decision

Introduce `CapabilityAlgebra` with six operations on typed `Capability` objects:

| Operation | Semantics |
|-----------|-----------|
| `grant` | Create a new capability with scope, resource, actions, constraints |
| `restrict` | Narrow an existing capability (subset of actions, tighter constraints) |
| `delegate` | Transfer capability to another agent with delegation chain tracking |
| `expire` | Set or tighten time-to-live on a capability |
| `revoke` | Permanently invalidate a capability and all downstream delegations |
| `attest` | Attach a cryptographic attestation (claim + signature) to a capability |

Composition uses set-theoretic semantics:
- **Actions**: intersection (only actions present in both capabilities survive)
- **Constraints**: union (all constraints from both apply)
- **Expiry**: minimum (tightest expiry wins)

Capabilities carry delegation chains so any agent can trace the full authority path from the original grantor.

## Consequences

- Permissions become inspectable, composable, and auditable
- Delegation chains prevent privilege escalation (you cannot grant what you do not have)
- Expiry and revocation support time-bounded autonomy
- Attestations provide cryptographic evidence for capability validity
- 68 tests validate all operations and edge cases

## Alternatives Considered

- **RBAC (Role-Based Access Control)**: Too coarse for per-agent, per-task delegation
- **ACL lists**: No composition semantics, no delegation tracking
- **Capability URIs (like UCAN)**: Good model but requires JWT infrastructure not yet present
