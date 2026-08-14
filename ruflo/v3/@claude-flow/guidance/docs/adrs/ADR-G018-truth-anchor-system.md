# ADR-G018: Truth Anchor System

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

All prior modules operate on internal state: memory entries, gate decisions, coherence scores. None of them can distinguish between an internally generated belief and an externally verified fact. When an agent's memory says "user role is admin" and a human HR record says "user role is guest," the system has no mechanism to prefer the external truth. Internal beliefs can drift, decay, or be poisoned. External facts should be immutable anchors.

## Decision

Introduce `TruthAnchorStore` and `TruthResolver`:

**Truth Anchors:**
- Append-only store of externally-signed facts
- Each anchor carries: kind, claim, evidence, attesterId, HMAC-SHA256 signature
- Six source kinds: `human-attestation`, `hardware-signal`, `regulatory-input`, `external-observation`, `signed-document`, `consensus-result`
- Anchors are immutable once created — cannot be overwritten, decayed, or deleted
- Supersession chain: new anchors can declare they supersede old ones without mutating them
- Max 50,000 anchors with LRU eviction of expired anchors only (active anchors are never evicted)

**Truth Resolution:**
- `resolveMemoryConflict(key, memoryValue, namespace)`: truth anchor always wins over internal memory
- `resolveDecisionConflict(action, context)`: truth anchors constrain proposed agent actions
- `getGroundTruth(topic)`: fuzzy tag/claim matching to retrieve all relevant anchors
- Case-insensitive matching, tag-contains-topic and topic-contains-tag heuristics

**Signature Verification:**
- Every anchor is signed with HMAC-SHA256 at creation
- `verify(id)` recomputes and compares the signature
- `verifyAll()` batch-verifies the entire store, returning valid count and invalid IDs

## Consequences

- The system can now distinguish fact from belief
- Truth anchors provide a ground-truth backstop against memory poisoning and hallucination
- Supersession chains model evolving external facts without mutating history
- Signature verification catches tampering at any point
- 61 tests validate signing, verification, supersession, conflict resolution, and query

## Alternatives Considered

- **Pinning memory entries as immutable**: Mixes internal and external state; no signature chain
- **External oracle service**: Adds network dependency; truth anchors are local-first
- **W3C Verifiable Credentials**: Good model but requires DID infrastructure not present in this context
