/**
 * Vector Clock for federated claim aggregates.
 *
 * Replaces the per-aggregate integer `version` counter in
 * `InMemoryClaimEventStore` with a per-aggregate vector clock that captures
 * causal history across nodes. Two events with concurrent vector clocks
 * (neither is happens-before the other) signal a true concurrent-write
 * conflict that the application layer must resolve via the existing contest
 * mechanism.
 *
 * @module v3/claims/infrastructure/vector-clock
 * @see ADR-101 Component B
 */

/**
 * A vector clock — `{[nodeId]: integer}` representing the causal history
 * seen at the issuing node when an event was created.
 */
export interface VectorClock {
  readonly clocks: Readonly<Record<string, number>>;
}

/**
 * The all-zero vector clock. Used as the seed for new aggregates.
 */
export function zeroVectorClock(): VectorClock {
  return Object.freeze({ clocks: Object.freeze({}) });
}

/**
 * Increment the entry for `nodeId` in `vc` by 1.
 * Used when a node generates a new local event.
 *
 * Pure function — does not mutate `vc`.
 */
export function tickVectorClock(vc: VectorClock, nodeId: string): VectorClock {
  if (!nodeId) {
    throw new Error('tickVectorClock: nodeId must be non-empty');
  }
  const current = vc.clocks[nodeId] ?? 0;
  return Object.freeze({
    clocks: Object.freeze({ ...vc.clocks, [nodeId]: current + 1 }),
  });
}

/**
 * Merge two vector clocks by taking the per-node maximum.
 * Used when a node receives a remote event — the merged clock represents
 * "everything I know about, plus everything the remote knows about."
 *
 * Pure function — returns a new VectorClock.
 */
export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const merged: Record<string, number> = { ...a.clocks };
  for (const [nodeId, value] of Object.entries(b.clocks)) {
    const current = merged[nodeId] ?? 0;
    if (value > current) {
      merged[nodeId] = value;
    }
  }
  return Object.freeze({ clocks: Object.freeze(merged) });
}

/**
 * Result of comparing two vector clocks. Unlike scalar clocks, vector
 * clocks form a partial order — two clocks can be EQUAL, BEFORE, AFTER,
 * or CONCURRENT (genuinely incomparable).
 */
export type VectorClockOrder = 'equal' | 'before' | 'after' | 'concurrent';

/**
 * Compare two vector clocks. Returns:
 *   - 'equal'      : a and b are identical
 *   - 'before'     : a happens-before b (a ⊑ b strict)
 *   - 'after'      : b happens-before a
 *   - 'concurrent' : neither dominates — true concurrent writes
 *
 * Reference: Lamport 1978, "Time, Clocks, and the Ordering of Events".
 */
export function compareVectorClocks(a: VectorClock, b: VectorClock): VectorClockOrder {
  // Collect every nodeId that appears in either clock; missing entries are 0.
  const allNodes = new Set<string>([
    ...Object.keys(a.clocks),
    ...Object.keys(b.clocks),
  ]);

  let aDominates = false; // ∃ node where a > b
  let bDominates = false; // ∃ node where b > a

  for (const nodeId of allNodes) {
    const av = a.clocks[nodeId] ?? 0;
    const bv = b.clocks[nodeId] ?? 0;
    if (av > bv) aDominates = true;
    if (bv > av) bDominates = true;
  }

  if (!aDominates && !bDominates) return 'equal';
  if (aDominates && !bDominates) return 'after';
  if (!aDominates && bDominates) return 'before';
  return 'concurrent';
}

/**
 * `true` iff a and b are concurrent (neither happens-before the other).
 * The contest mechanism in `WorkStealingService` is invoked exactly when
 * this returns `true` for two writes against the same claim aggregate.
 */
export function areConcurrent(a: VectorClock, b: VectorClock): boolean {
  return compareVectorClocks(a, b) === 'concurrent';
}

/**
 * Serialize a vector clock to a stable string representation, suitable for
 * use as an idempotency key or log line. Sorted by nodeId for determinism.
 */
export function vectorClockToString(vc: VectorClock): string {
  const entries = Object.entries(vc.clocks).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}:${v}`).join(',') || '∅';
}

/**
 * Prune entries for nodes no longer in the federation.
 * Used during peer-eviction (per ADR-097) to keep clocks bounded.
 *
 * @param vc      Vector clock to prune
 * @param keepers Set of nodeIds that should remain
 */
export function pruneVectorClock(vc: VectorClock, keepers: ReadonlySet<string>): VectorClock {
  const pruned: Record<string, number> = {};
  for (const [nodeId, value] of Object.entries(vc.clocks)) {
    if (keepers.has(nodeId)) {
      pruned[nodeId] = value;
    }
  }
  return Object.freeze({ clocks: Object.freeze(pruned) });
}
