# ADR-G026: Review Remediation -- Security, Memory Safety, and Code Quality Fixes

## Status
Accepted

## Date
2026-02-02

## Context

A comprehensive code review of the `@claude-flow/guidance` package identified several critical, high, and medium severity issues that required remediation before the package could be considered production-ready.

### Critical Issues Found

1. **`createProofChain()` called without signing key** (`ruvbot-integration.ts:858`). The `RuvBotBridge.handleSessionCreate()` method called `createProofChain()` without providing an HMAC signing key. The `ProofChain` constructor throws if no key is supplied, meaning any session with `enableProofChain: true` would crash at runtime.

2. **`createProofChain` factory type mismatch** (`proof.ts`). The factory accepted `config?: { signingKey?: string }`, allowing callers to omit the key entirely. The inner `ProofChain` constructor then throws, making the optional typing misleading and unsafe.

### High Issues Found

3. **Hardcoded fallback signing key** (`conformance-kit.ts:700`). The `ConformanceRunner` constructor fell back to `'default-signing-key'` when no key was provided, silently using a well-known value in what could be a production path.

4. **Duplicated `timingSafeEqual`**. Two independent implementations of constant-time string comparison existed in `proof.ts` and `authority.ts`. Both used manual byte-level XOR rather than Node.js's native `crypto.timingSafeEqual`, and neither was a faithful constant-time implementation (early return on length mismatch leaked length information).

5. **Unbounded event growth in `RunLedger`**. The ledger's in-memory `events` array had no upper bound, leading to unbounded memory growth in long-running sessions.

6. **O(n) `shift()` eviction** in `ThreatDetector.addSignal()` and `CollusionDetector.recordInteraction()`. Both used `Array.shift()` for single-element eviction on every insertion once at capacity. In V8, `shift()` is O(n) because it reindexes all remaining elements.

### Medium Issues Found

7. **`HashEmbeddingProvider` undocumented as test-only**. The hash-based embedding provider has no semantic meaning but lacked a clear warning against production use.

8. **`simulateChangeEffect` in optimizer presented as A/B testing**. The method applies fixed multipliers, not real traffic measurement, but the surrounding code and ADR language implied real experimentation.

9. **Uncached regex compilation in `matchGlob`**. `ShardRetriever.matchGlob()` compiled a new `RegExp` on every call for the same glob pattern.

## Decision

### 1. Require `signingKey` in `createProofChain` factory

Changed the factory signature from optional to required:

```typescript
export function createProofChain(config: { signingKey: string }): ProofChain {
  return new ProofChain(config.signingKey);
}
```

This makes the type system enforce what the runtime already enforced, catching missing keys at compile time.

### 2. Add `proofSigningKey` to `RuvBotBridgeConfig`

Added a `proofSigningKey?: string` field to the bridge configuration. When `enableProofChain` is `true`, the bridge now validates that the key is present before calling `createProofChain()`, throwing a clear error message instead of an opaque constructor crash.

### 3. Remove hardcoded fallback key in `ConformanceRunner`

The constructor now throws if no `signingKey` is provided. The `createConformanceRunner()` factory function provides a default test key (`'conformance-test-key'`) for convenience in test code, making it explicit that the default is for testing only.

### 4. Extract shared `timingSafeEqual` to `crypto-utils.ts`

Created `src/crypto-utils.ts` with a single implementation that delegates to Node.js native `crypto.timingSafeEqual` via `Buffer`. Both `proof.ts` and `authority.ts` now import from this shared module. The native implementation is truly constant-time at the CPU level.

### 5. Add bounded eviction to `RunLedger`

Added a `maxEvents` constructor parameter (default 0 = unlimited). When the limit is exceeded, the oldest 10% of events are removed in a single `splice()` call. This amortizes the O(n) cost across multiple insertions instead of paying it on every insert.

Both `logEvent()` and `finalizeEvent()` call the private `evictIfNeeded()` method. The `createLedger()` factory now accepts the `maxEvents` parameter.

### 6. Batch eviction in `ThreatDetector` and `CollusionDetector`

Replaced single-element `shift()` calls with batch `splice()`:
- `ThreatDetector.addSignal()`: trims 10% of `maxSignals` when over capacity
- `CollusionDetector.recordInteraction()`: trims 1,000 interactions (10% of the 10,000 limit) when over capacity

### 7. Document `HashEmbeddingProvider` as test-only

Added a JSDoc block explicitly stating the provider has no semantic meaning and must not be used in production.

### 8. Clarify `simulateChangeEffect` as heuristic

Replaced the JSDoc with a clear statement that the method applies conservative fixed multipliers, not real A/B test measurements.

### 9. Cache compiled regexes in `matchGlob`

Added a `Map<string, RegExp>` cache to `ShardRetriever` so that each glob pattern is compiled once and reused on subsequent calls.

## Consequences

### Positive

- **Type-safe proof chains.** Missing signing keys are now caught at compile time, not as runtime crashes.
- **No hardcoded secrets in production paths.** The conformance kit requires explicit keys; the factory default is clearly labelled for tests.
- **Single source of truth for `timingSafeEqual`.** One implementation using the native Node.js API, no manual byte comparison.
- **Bounded memory.** All three unbounded collections (ledger events, threat signals, collusion interactions) now have eviction policies.
- **Amortized eviction cost.** Batch splice avoids per-insert O(n) overhead.
- **Clear documentation.** Heuristic estimation and test-only components are explicitly labelled.

### Negative

- **Breaking change for `createProofChain`**. Callers that relied on the optional signature must now pass `{ signingKey }`. Existing tests were updated.
- **Breaking change for `ConformanceRunner` constructor**. Direct callers must now provide a signing key. The factory function mitigates this for test code.
- **Batch eviction drops more than minimum necessary.** Trimming 10% when one element exceeds the limit removes more data than strictly needed. This is an intentional trade-off for amortized performance.

## References

- `src/crypto-utils.ts` -- Shared timing-safe comparison
- `src/proof.ts` -- ProofChain, createProofChain factory
- `src/authority.ts` -- MemoryAuthority (imports crypto-utils)
- `src/ruvbot-integration.ts` -- RuvBotBridge, RuvBotBridgeConfig
- `src/conformance-kit.ts` -- ConformanceRunner, createConformanceRunner
- `src/ledger.ts` -- RunLedger, evictIfNeeded, createLedger
- `src/adversarial.ts` -- ThreatDetector.addSignal, CollusionDetector.recordInteraction
- `src/optimizer.ts` -- simulateChangeEffect documentation
- `src/retriever.ts` -- HashEmbeddingProvider documentation, matchGlob cache
- ADR-G005 -- Proof envelope model (updated to reflect signing key requirement)
- ADR-G014 -- Conformance kit (updated to reflect explicit key requirement)
