/**
 * Federation spend-reporting interface (ADR-097 Phase 3 upstream).
 *
 * The federation layer doesn't own model pricing — it can't know how much
 * a downstream agent's work cost until the integrator tells it. So the
 * coordinator exposes a `reportSpend()` method that callers invoke after
 * their downstream completes, and that method fans out to:
 *
 *   1. The injected SpendReporter (if any) — typically wires to the
 *      cost-tracker bus / `federation-spend` memory namespace
 *   2. The injected FederationBreakerService (if any) — its in-memory
 *      buffer becomes a transparent cache when the cost-tracker
 *      subscriber lands
 *
 * Both deps are constructor-optional. A coordinator with neither still
 * accepts reportSpend() calls (silent no-op) so callers don't need to
 * branch on which integrations are wired.
 *
 * Event shape matches the consumer contract pinned by
 * plugins/ruflo-cost-tracker/scripts/federation.mjs:
 *
 *   { peerId, taskId, tokensUsed, usdSpent, ts }
 *
 * Storage layout (consumer convention): namespace `federation-spend`,
 * key `fed-spend-<peerId>-<ts>`. The interface is storage-agnostic; the
 * default in-memory reporter included here is for tests + a reference
 * implementation. Production integrators write a thin adapter that
 * persists to ruflo memory / Redis / Datadog / their accounting system.
 */

/** A single per-send cost report from the integrator. */
export interface FederationSpendEvent {
  /** Peer this cost was incurred against. */
  readonly peerId: string;
  /** Optional task correlation key — not all callers will have one. */
  readonly taskId?: string;
  /** Tokens consumed (input + output). Negative values clamped to 0 by sink. */
  readonly tokensUsed: number;
  /** USD spent. Negative values clamped to 0 by sink. */
  readonly usdSpent: number;
  /** ISO 8601 timestamp. Caller-supplied for testability; auto-filled if omitted by reportSpend. */
  readonly ts: string;
  /** Whether the underlying send succeeded (drives breaker failure-ratio). */
  readonly success: boolean;
}

/**
 * Strategy interface the coordinator calls when reportSpend() fires.
 * Integrators implement this to push the event to whatever backend they
 * want — cost-tracker bus, Datadog, accounting DB, etc.
 *
 * Implementations must be tolerant: dropping or persisting later is
 * acceptable, but throwing here will surface to the integrator's caller.
 * Buffer and retry inside the implementation.
 */
export interface SpendReporter {
  reportSpend(event: FederationSpendEvent): Promise<void>;
}

/**
 * In-memory reporter for tests + a reference implementation. Production
 * code should wire a real SpendReporter that persists to durable storage.
 *
 * Buffer is unbounded — fine for tests, NOT fine for long-running
 * production. The cost-tracker consumer reads from durable storage, not
 * from this buffer.
 */
export class InMemorySpendReporter implements SpendReporter {
  private readonly buffer: FederationSpendEvent[] = [];

  async reportSpend(event: FederationSpendEvent): Promise<void> {
    this.buffer.push(event);
  }

  /** Snapshot of all reported events (test inspection). */
  getEvents(): readonly FederationSpendEvent[] {
    return [...this.buffer];
  }

  /** Drop everything (test cleanup). */
  clear(): void {
    this.buffer.length = 0;
  }
}

/**
 * Minimal memory-backend interface (ADR-110). The integrator wires this
 * to whatever store satisfies their durability/consistency needs:
 * ruflo memory, Redis, DynamoDB, file-backed JSON, etc. The federation
 * plugin doesn't import any specific memory client — pluggable by
 * design.
 */
export interface MemoryStore {
  /** Persist a value under (namespace, key). Optional TTL in seconds. */
  store(args: {
    namespace: string;
    key: string;
    value: string;
    ttl?: number;
  }): Promise<void>;
}

/** Configuration for `MemorySpendReporter`. See ADR-110. */
export interface MemorySpendReporterConfig {
  /** Memory store impl. Required. */
  readonly memoryStore: MemoryStore;
  /** Namespace per the cost-tracker consumer contract. Default: `federation-spend`. */
  readonly namespace?: string;
  /** Optional TTL in seconds. Default: 7 days. Cost-tracker rolling windows are 1h/24h/7d, so anything older is irrelevant. */
  readonly ttlSeconds?: number;
}

/** Default namespace per cost-tracker's `plugins/ruflo-cost-tracker/scripts/federation.mjs`. */
export const DEFAULT_FEDERATION_SPEND_NAMESPACE = 'federation-spend';

/** Default TTL: 7 days, matching cost-tracker's longest rolling window. */
export const DEFAULT_FEDERATION_SPEND_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Production reporter (ADR-110) that satisfies the cost-tracker
 * consumer contract: writes to namespace `federation-spend`, key
 * `fed-spend-<peerId>-<ts>`. The consumer
 * (`plugins/ruflo-cost-tracker/scripts/federation.mjs`) `memory list`s
 * the namespace, retrieves each key, and aggregates into rolling
 * windows.
 *
 * Storage-agnostic: the integrator injects a `MemoryStore`
 * implementation. Common wirings:
 *
 *   // ruflo memory MCP
 *   new MemorySpendReporter({
 *     memoryStore: {
 *       store: async (a) => mcpClient.call('memory_store', a),
 *     },
 *   });
 *
 *   // ruflo memory CLI shell-out
 *   new MemorySpendReporter({
 *     memoryStore: {
 *       store: async ({namespace, key, value, ttl}) => {
 *         await execFile('npx', ['ruflo', 'memory', 'store',
 *           '--namespace', namespace, '--key', key, '--value', value]);
 *       },
 *     },
 *   });
 *
 * Errors from the memory backend BUBBLE UP — the reporter does not
 * retry/swallow. Wrap with the integrator's preferred retry strategy
 * if needed.
 *
 * Negative `tokensUsed` / `usdSpent` are persisted as-is. Clamping is
 * the breaker's responsibility (see federation-breaker-service.ts);
 * the audit/spend log is an honest mirror of what the integrator
 * reported.
 */
export class MemorySpendReporter implements SpendReporter {
  private readonly memoryStore: MemoryStore;
  private readonly namespace: string;
  private readonly ttlSeconds: number;

  constructor(config: MemorySpendReporterConfig) {
    this.memoryStore = config.memoryStore;
    this.namespace = config.namespace ?? DEFAULT_FEDERATION_SPEND_NAMESPACE;
    this.ttlSeconds = config.ttlSeconds ?? DEFAULT_FEDERATION_SPEND_TTL_SECONDS;
  }

  async reportSpend(event: FederationSpendEvent): Promise<void> {
    const key = `fed-spend-${event.peerId}-${event.ts}`;
    const value = JSON.stringify({
      peerId: event.peerId,
      taskId: event.taskId ?? null,
      tokensUsed: event.tokensUsed,
      usdSpent: event.usdSpent,
      success: event.success,
      ts: event.ts,
    });
    await this.memoryStore.store({
      namespace: this.namespace,
      key,
      value,
      ttl: this.ttlSeconds,
    });
  }

  /** Read configured namespace (for the doctor/debug surface). */
  getNamespace(): string {
    return this.namespace;
  }

  /** Read configured TTL in seconds. */
  getTtlSeconds(): number {
    return this.ttlSeconds;
  }
}
