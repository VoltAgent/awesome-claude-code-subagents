# ADR-G021: Human Authority and Irreversibility

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

The existing gate system (G004) decides allow/deny/warn but does not model *who* has authority to make that decision. An agent can deny itself access to a tool, but cannot express "this requires human approval" or "this needs institutional sign-off." Similarly, the system treats `rm -rf` and `echo hello` as equally reversible — there is no formal classification of which actions have permanent consequences that warrant elevated safeguards.

## Decision

Introduce `AuthorityGate` and `IrreversibilityClassifier`:

**Authority Hierarchy:**

| Level | Examples | Override Scope |
|-------|----------|----------------|
| `agent` | Autonomous decisions | Own tools and memory |
| `human` | Operator approval | Agent decisions, tool restrictions |
| `institutional` | Organization policy | Human and agent decisions |
| `regulatory` | External compliance | All lower levels |

Each level strictly dominates all levels below it. An agent cannot override a human decision; a human cannot override a regulatory constraint.

**Authority Gate:**
- `registerScope(scope)`: define what each authority level is permitted and what it can override
- `checkAuthority(scope, requestingLevel)`: returns `{ allowed, escalationRequired, requiredLevel }`
- `recordIntervention(intervention)`: HMAC-SHA256 signed human override record for audit trail
- `verifyIntervention(id)`: verify that an intervention record has not been tampered with

**Irreversibility Classification:**

| Class | Proof Level | Examples |
|-------|-------------|---------|
| `reversible` | standard | File edit, config change, log write |
| `costly-reversible` | elevated | Database migration, large refactor |
| `irreversible` | maximum | Email send, payment, data deletion, publishing |

- `classify(action)`: returns class, required proof level, and simulation recommendation
- `requiresSimulation(action)`: true for costly-reversible and irreversible actions
- Default patterns use regex matching; custom patterns can be added
- Irreversible actions: `/\b(send\s+email|publish|deploy\s+to\s+production|delete\s+(database|user|account)|payment|transfer\s+funds|broadcast)\b/i`
- Costly-reversible: `/\b(migrate|schema\s+change|major\s+refactor|rollback|restore\s+from\s+backup)\b/i`

**Integration with ProofChain (G005):**
- Irreversible actions require maximum proof level (all fields populated, signatures verified)
- Costly-reversible actions require elevated proof (additional attestation)
- Reversible actions use standard proof

## Consequences

- Authority boundaries are formal and typed, not implicit
- Escalation paths are explicit: agents know when they need human approval
- Irreversible actions cannot proceed without elevated safeguards
- Human interventions are cryptographically signed for audit
- The hierarchy is extensible (new levels can be inserted between existing ones)

## Alternatives Considered

- **Flat permission model**: No escalation semantics; every deny looks the same
- **Capability-based authority (UCAN-style)**: Good model but conflates authority with capability; these are orthogonal concerns
- **Confirmation prompts**: UI-level solution; does not work for unattended agents
