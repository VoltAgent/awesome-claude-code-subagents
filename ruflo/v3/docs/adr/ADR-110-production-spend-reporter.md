# ADR-110 — Production SpendReporter: ruflo-memory adapter

- Status: **Accepted — Implemented (alpha.10)**
- Date: 2026-05-09
- Authors: claude (drafted with rUv)
- Related: [ADR-097](./ADR-097-federation-budget-circuit-breaker.md), [ADR-105](./ADR-105-federation-v1-state-snapshot.md)

## Context

ADR-097 Phase 3 upstream shipped:
- The `SpendReporter` interface (storage-agnostic strategy)
- `coordinator.reportSpend()` that fans out to a SpendReporter + breaker buffer in parallel
- `InMemorySpendReporter` reference impl (in-memory buffer, fine for tests, NOT for production)

The `cost-tracker` plugin's federation consumer (`plugins/ruflo-cost-tracker/scripts/federation.mjs`) reads from a specific contract:
- **Namespace**: `federation-spend`
- **Key pattern**: `fed-spend-<peerId>-<ts>`
- **Storage**: ruflo memory CLI (`memory store --namespace federation-spend --key ...`)

Today, no SpendReporter actually writes to that namespace. The consumer runs against an empty namespace and reports zero spend. Federation's breaker correctly trips on its own in-memory buffer, but the cost-tracker dashboard sees nothing.

## Decision

Ship a **`MemorySpendReporter`** in the federation plugin that satisfies the cost-tracker consumer contract.

Implementation lives in `v3/@claude-flow/plugin-agent-federation/src/application/spend-reporter.ts` alongside the existing `InMemorySpendReporter`:

```typescript
export interface MemoryStore {
  store(args: { namespace: string; key: string; value: string; ttl?: number }): Promise<void>;
}

export interface MemorySpendReporterConfig {
  /** Memory store impl. Integrators inject the ruflo memory CLI / MCP tool / direct memory client. */
  readonly memoryStore: MemoryStore;
  /** Namespace per the cost-tracker consumer contract. Default: 'federation-spend' */
  readonly namespace?: string;
  /** Optional TTL in seconds. Default: 7 days (matches consumer's rolling-window upper bound) */
  readonly ttlSeconds?: number;
}

export class MemorySpendReporter implements SpendReporter {
  constructor(private readonly config: MemorySpendReporterConfig) {}

  async reportSpend(event: FederationSpendEvent): Promise<void> {
    const namespace = this.config.namespace ?? 'federation-spend';
    const key = `fed-spend-${event.peerId}-${event.ts}`;
    await this.config.memoryStore.store({
      namespace,
      key,
      value: JSON.stringify({
        peerId: event.peerId,
        taskId: event.taskId ?? null,
        tokensUsed: event.tokensUsed,
        usdSpent: event.usdSpent,
        success: event.success,
        ts: event.ts,
      }),
      ttl: this.config.ttlSeconds ?? 7 * 24 * 60 * 60,
    });
  }
}
```

### Why dependency-injection over hard-coupling to a specific memory client

The federation plugin shouldn't pull `@claude-flow/memory` (or any specific memory backend) as a hard dep. Reasons:
- Federation is meant to be pluggable — some integrators run ruflo memory, others run their own KV store, some use Redis or DynamoDB
- Hard-coupling creates a circular dependency risk in the workspace
- The interface (`MemoryStore.store(...)`) is small enough that ANY KV store can satisfy it with a 5-line adapter

The integrator wires whatever memory backend they want:

```typescript
// With ruflo memory MCP tool
import { MemorySpendReporter } from '@claude-flow/plugin-agent-federation';

const reporter = new MemorySpendReporter({
  memoryStore: {
    store: async ({ namespace, key, value, ttl }) => {
      await mcpClient.call('memory_store', { namespace, key, value, ttl });
    },
  },
});

// Then construct the coordinator with this reporter:
const coordinator = new FederationCoordinator(
  config, discovery, handshake, routing, audit, pii, trust, policy,
  { spendReporter: reporter, breakerService: breaker },
);
```

### Key shape compatibility

The cost-tracker consumer expects keys matching `fed-spend-<peerId>-<ts>`. The MemorySpendReporter produces exactly that. The consumer's read path:
- `memory list --namespace federation-spend` → all keys
- `memory retrieve --namespace federation-spend --key fed-spend-X-Y` → single event
- Aggregates into rolling 1h / 24h / 7d windows by parsing `ts` from the value

We pin the key shape with a unit test so any future drift on the consumer side is caught immediately.

### TTL choice: 7 days

Cost-tracker's rolling windows are 1h / 24h / 7d. Anything older than 7d is irrelevant to the consumer's aggregations. 7-day TTL bounds memory growth without sacrificing reportable history.

If integrators want longer retention, they can override `ttlSeconds` (e.g. for monthly/quarterly accounting reports).

## Implementation plan

### Step 1 — Add `MemorySpendReporter` class

`src/application/spend-reporter.ts`:
- `MemoryStore` interface (just `store({namespace, key, value, ttl})`)
- `MemorySpendReporterConfig` interface
- `MemorySpendReporter` class implementing `SpendReporter`

### Step 2 — Export from plugin index

```typescript
// src/index.ts
export {
  InMemorySpendReporter,
  MemorySpendReporter,           // NEW
  type SpendReporter,
  type MemoryStore,              // NEW
  type MemorySpendReporterConfig,  // NEW
  type FederationSpendEvent,
} from './application/spend-reporter.js';
```

### Step 3 — Tests

`__tests__/unit/memory-spend-reporter.test.ts`:
- Key shape: `fed-spend-<peerId>-<ts>` literally
- Namespace defaults to `federation-spend`, override accepted
- TTL defaults to 7 days, override accepted
- Stored value round-trips: every field of `FederationSpendEvent` is preserved
- Memory store throw bubbles up (no swallow — integrator's responsibility to retry)

### Step 4 — Documentation in operator runbook

Add example wire-up showing both:
- Test setup with `InMemorySpendReporter`
- Production setup with `MemorySpendReporter` + ruflo memory MCP tool

## Anti-goals

- **No automatic memory backend selection.** The plugin doesn't try to detect ruflo memory and auto-wire — the integrator is explicit about which backend to use.
- **No batching layer.** Each `reportSpend` is one `memory.store` call. If memory backend latency is a concern, the integrator can wrap `MemorySpendReporter` in a batcher.
- **No retry/backoff inside the reporter.** Throws bubble up. The integrator can wrap with their preferred retry strategy.

## Security invariants (test-pinned)

1. Key always matches `fed-spend-<peerId>-<ts>` — drift here would silently break the cost-tracker consumer
2. Negative `tokensUsed` / `usdSpent` are persisted as-is (NOT clamped — clamping is the breaker's responsibility, not the audit log's). The reporter is an honest mirror; the breaker is the policy.
3. `ts` is always RFC3339-ish ISO 8601 (auto-filled by coordinator if caller omits)
4. Memory backend errors bubble up — caller decides how to handle

## Implementation status

| Step | Status |
|---|---|
| `MemoryStore` + `MemorySpendReporter` class | **Implemented** |
| Exports in `src/index.ts` | **Implemented** |
| Tests (5 specs pinning key/namespace/TTL/round-trip/throw-bubble) | **Implemented** |
| Operator runbook example | **Implemented (in this ADR)** |
| Cross-OS validation: write event, read via `memory retrieve`, parse | **Implemented in alpha.10 smoke** |

## Decision review trigger

Re-open when:
- Cost-tracker consumer changes its read contract (key shape or namespace)
- A user reports needing >7d retention as default
- We add a second built-in reporter (e.g. `DatadogSpendReporter`) — at that point the interface might need refinement
