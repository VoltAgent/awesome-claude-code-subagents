/**
 * Hybrid Logical Clock (HLC).
 *
 * Implements Kulkarni et al. 2014 — 64-bit-ish timestamps that:
 *   - monotonically advance on every event, even when wall clock goes backward,
 *   - track causality across nodes the way Lamport clocks do,
 *   - stay within a small bounded skew of physical time so they remain
 *     human-readable for debugging.
 *
 * In single-node mode the HLC degenerates: `physicalMs` tracks the wall clock
 * exactly and `logical` stays at 0, so HLC values are pairwise-comparable to
 * plain Unix timestamps. This is the property that lets ADR-101 wire HLC into
 * existing Date-based callsites without breaking single-node deployments.
 *
 * @module v3/claims/infrastructure/hlc
 * @see ADR-101 Component A
 */

/**
 * Maximum skew (ms) we will accept from a remote HLC before clamping.
 * Default 30 s. Configurable per federation.
 */
export const DEFAULT_MAX_SKEW_MS = 30_000;

/**
 * A point in HLC time.
 *
 * Encoding choice: a plain object rather than a packed bigint. We store these
 * in JSON-serialized federation envelopes and in event logs that are read by
 * humans during postmortems. Readability beats 8-byte packing at this scale.
 */
export interface HlcTimestamp {
  /** Wall-clock millis at issuance, possibly bumped forward by causal events. */
  readonly physicalMs: number;
  /** Tie-breaker: monotonic counter incremented when two HLCs share a physicalMs. */
  readonly logical: number;
  /** Issuing node identifier. Lets `compare` deterministically order HLCs from different nodes that share (physicalMs, logical). */
  readonly nodeId: string;
}

/**
 * The all-zero HLC. Used to represent "no clock seen yet" — e.g., events
 * loaded from a pre-HLC store that need an HLC field for the new code paths.
 * Always sorts before any real HLC.
 */
export function zeroHlc(nodeId = ''): HlcTimestamp {
  return Object.freeze({ physicalMs: 0, logical: 0, nodeId });
}

/**
 * Pluggable physical-time source. Tests inject a mock; production uses Date.now.
 */
export type PhysicalClock = () => number;

const SYSTEM_CLOCK: PhysicalClock = () => Date.now();

/**
 * The clock errors we throw on policy violations. Callers can catch these
 * specifically rather than relying on string matching.
 */
export class HlcSkewError extends Error {
  constructor(
    public readonly receivedPhysicalMs: number,
    public readonly localPhysicalMs: number,
    public readonly maxSkewMs: number,
  ) {
    super(
      `HLC skew exceeded: received physicalMs=${receivedPhysicalMs} ` +
      `vs local=${localPhysicalMs} (max=${maxSkewMs}ms)`,
    );
    this.name = 'HlcSkewError';
  }
}

/**
 * The clock interface that ClaimService and WorkStealingService depend on.
 * Pure interface so single-node deployments can pass a `LocalHlc` and
 * federated deployments can pass an instance backed by federation gossip.
 */
export interface IHlc {
  /** Generate a new HLC timestamp for a local event. */
  now(): HlcTimestamp;
  /** Update the clock from a received HLC. Returns the updated local time. */
  update(received: HlcTimestamp): HlcTimestamp;
  /** Read-only access to the most recently observed HLC. */
  peek(): HlcTimestamp;
}

/**
 * Local HLC implementation.
 *
 * Construction notes:
 *   - `nodeId` should be stable for the lifetime of a process. For federation
 *     it must be unique across the trust circle; in single-node mode any
 *     constant works.
 *   - The clock is mutable; treat the instance as a process-wide singleton.
 */
export class LocalHlc implements IHlc {
  private last: HlcTimestamp;

  constructor(
    public readonly nodeId: string,
    private readonly physicalClock: PhysicalClock = SYSTEM_CLOCK,
    public readonly maxSkewMs: number = DEFAULT_MAX_SKEW_MS,
  ) {
    if (!nodeId) {
      throw new Error('LocalHlc requires a non-empty nodeId');
    }
    // Seed with the smallest possible timestamp so the first now() always
    // takes the "wall clock advanced" branch and produces logical=0. Without
    // this seed, the first now() would see (last.physicalMs == wall) and
    // bump logical to 1, breaking single-node degeneracy with wall-clock ms.
    this.last = { physicalMs: -1, logical: 0, nodeId };
  }

  now(): HlcTimestamp {
    const wall = this.physicalClock();
    let physicalMs: number;
    let logical: number;

    if (wall > this.last.physicalMs) {
      // Wall clock advanced — adopt it, reset logical counter.
      physicalMs = wall;
      logical = 0;
    } else {
      // Wall clock didn't advance (or went backward); keep last physical and bump logical.
      physicalMs = this.last.physicalMs;
      logical = this.last.logical + 1;
    }

    this.last = { physicalMs, logical, nodeId: this.nodeId };
    return this.last;
  }

  update(received: HlcTimestamp): HlcTimestamp {
    const wall = this.physicalClock();

    // Skew guard: refuse HLCs that are too far in the future.
    // We DO NOT jump local clock forward to match — a misbehaving peer would
    // poison the global timeline. Instead we throw and let the caller decide.
    if (received.physicalMs > wall + this.maxSkewMs) {
      throw new HlcSkewError(received.physicalMs, wall, this.maxSkewMs);
    }

    const maxPhysical = Math.max(wall, this.last.physicalMs, received.physicalMs);

    let logical: number;
    if (maxPhysical === this.last.physicalMs && maxPhysical === received.physicalMs) {
      logical = Math.max(this.last.logical, received.logical) + 1;
    } else if (maxPhysical === this.last.physicalMs) {
      logical = this.last.logical + 1;
    } else if (maxPhysical === received.physicalMs) {
      logical = received.logical + 1;
    } else {
      logical = 0;
    }

    this.last = { physicalMs: maxPhysical, logical, nodeId: this.nodeId };
    return this.last;
  }

  peek(): HlcTimestamp {
    return this.last;
  }
}

/**
 * Compare two HLC timestamps. Returns -1, 0, or +1 like Date comparison.
 *
 * Order: physicalMs, then logical, then nodeId (lexicographic). The nodeId
 * tiebreaker is what makes this a total order across the federation.
 */
export function compareHlc(a: HlcTimestamp, b: HlcTimestamp): -1 | 0 | 1 {
  if (a.physicalMs < b.physicalMs) return -1;
  if (a.physicalMs > b.physicalMs) return 1;
  if (a.logical < b.logical) return -1;
  if (a.logical > b.logical) return 1;
  if (a.nodeId < b.nodeId) return -1;
  if (a.nodeId > b.nodeId) return 1;
  return 0;
}

/**
 * Convert HLC to a plain millisecond timestamp for legacy comparisons.
 * Lossy by design — the logical bits are dropped. Only use this on the
 * boundary with code that can't be HLC-ified yet.
 */
export function hlcToWallMs(t: HlcTimestamp): number {
  return t.physicalMs;
}

/**
 * Lift a wall-clock millisecond into HLC space at logical=0. Useful for
 * upgrading legacy events on read.
 */
export function wallMsToHlc(ms: number, nodeId: string): HlcTimestamp {
  return Object.freeze({ physicalMs: ms, logical: 0, nodeId });
}
