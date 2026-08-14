# ADR-G011: Artifact Ledger

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

Autonomous agents produce artifacts (code, reports, datasets, model outputs, configs) that need provenance tracking. Without a signed record of what was produced, by whom, from what inputs, artifact authenticity cannot be verified and supply chain integrity is impossible.

## Decision

Introduce `ArtifactLedger` that records every production artifact with:

| Field | Purpose |
|-------|---------|
| `contentHash` | SHA-256 of artifact content for integrity verification |
| `kind` | Typed category: code, report, dataset, model-output, memory-delta, config, trace-export, checkpoint |
| `producerAgentId` | Which agent created this artifact |
| `lineage` | Array of parent artifact IDs (inputs used to create this) |
| `signature` | HMAC-SHA256 signature using a shared signing key |
| `metadata` | Arbitrary key-value pairs for context |

The ledger supports:
- **Recording** artifacts with automatic hashing and signing
- **Verification** of individual artifacts (signature + hash check)
- **Lineage queries** (ancestors and descendants of any artifact)
- **Search** by kind, producer, time range, or content hash
- **Export/Import** for cross-system transfer and audit
- **Statistics** aggregation by kind and producer

## Consequences

- Every artifact has a verifiable chain of custody
- Lineage graphs enable impact analysis (what downstream artifacts are affected by a change)
- Content hashing detects tampering or corruption
- 48 tests validate recording, verification, lineage traversal, search, and serialization
- Supports the Agentic Container Specification's supply chain integrity requirements

## Alternatives Considered

- **Git commits alone**: Insufficient for non-code artifacts and cross-agent lineage
- **External artifact registries (OCI)**: Too heavy for in-process use; planned as future integration
- **Simple hash logs**: No lineage, no signature, no search
