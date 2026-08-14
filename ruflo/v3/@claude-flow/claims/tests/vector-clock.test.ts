/**
 * Vector clock tests — partial-order behaviour, concurrent detection, GC.
 */

import { describe, expect, it } from 'vitest';
import {
  zeroVectorClock,
  tickVectorClock,
  mergeVectorClocks,
  compareVectorClocks,
  areConcurrent,
  vectorClockToString,
  pruneVectorClock,
  type VectorClock,
} from '../src/infrastructure/vector-clock';

const vc = (clocks: Record<string, number>): VectorClock =>
  Object.freeze({ clocks: Object.freeze({ ...clocks }) });

describe('vector clock', () => {
  describe('tickVectorClock', () => {
    it('increments a fresh node from 0 to 1', () => {
      const t = tickVectorClock(zeroVectorClock(), 'A');
      expect(t.clocks).toEqual({ A: 1 });
    });

    it('increments an existing node', () => {
      const t = tickVectorClock(vc({ A: 5 }), 'A');
      expect(t.clocks).toEqual({ A: 6 });
    });

    it('does not mutate the input', () => {
      const original = vc({ A: 5 });
      const _ = tickVectorClock(original, 'A');
      expect(original.clocks).toEqual({ A: 5 });
    });

    it('refuses empty nodeId', () => {
      expect(() => tickVectorClock(zeroVectorClock(), '')).toThrow();
    });
  });

  describe('mergeVectorClocks', () => {
    it('takes per-node maximum', () => {
      const a = vc({ A: 3, B: 1 });
      const b = vc({ A: 1, B: 5, C: 2 });
      expect(mergeVectorClocks(a, b).clocks).toEqual({ A: 3, B: 5, C: 2 });
    });

    it('is commutative', () => {
      const a = vc({ A: 1, B: 2 });
      const b = vc({ A: 3, B: 0, C: 1 });
      expect(mergeVectorClocks(a, b).clocks).toEqual(mergeVectorClocks(b, a).clocks);
    });

    it('handles disjoint node sets', () => {
      const a = vc({ A: 1 });
      const b = vc({ B: 1 });
      expect(mergeVectorClocks(a, b).clocks).toEqual({ A: 1, B: 1 });
    });
  });

  describe('compareVectorClocks', () => {
    it('returns equal for identical clocks', () => {
      expect(compareVectorClocks(vc({ A: 1 }), vc({ A: 1 }))).toBe('equal');
      expect(compareVectorClocks(zeroVectorClock(), zeroVectorClock())).toBe('equal');
    });

    it('returns before/after for strict dominance', () => {
      // a strictly precedes b
      const a = vc({ A: 1, B: 1 });
      const b = vc({ A: 2, B: 1 });
      expect(compareVectorClocks(a, b)).toBe('before');
      expect(compareVectorClocks(b, a)).toBe('after');
    });

    it('returns concurrent for incomparable clocks', () => {
      // A wrote on node X, B wrote on node Y — neither knows about the other
      const a = vc({ X: 1 });
      const b = vc({ Y: 1 });
      expect(compareVectorClocks(a, b)).toBe('concurrent');
      expect(areConcurrent(a, b)).toBe(true);
    });

    it('treats missing entries as 0', () => {
      expect(compareVectorClocks(vc({ A: 0 }), zeroVectorClock())).toBe('equal');
      expect(compareVectorClocks(vc({ A: 1 }), zeroVectorClock())).toBe('after');
      expect(compareVectorClocks(zeroVectorClock(), vc({ A: 1 }))).toBe('before');
    });
  });

  describe('vectorClockToString', () => {
    it('sorts by nodeId for determinism', () => {
      // Same content, different insertion order — string must match
      const a = vc({ B: 2, A: 1, C: 3 });
      const b = vc({ A: 1, C: 3, B: 2 });
      expect(vectorClockToString(a)).toBe(vectorClockToString(b));
      expect(vectorClockToString(a)).toBe('A:1,B:2,C:3');
    });

    it('renders the empty clock as ∅', () => {
      expect(vectorClockToString(zeroVectorClock())).toBe('∅');
    });
  });

  describe('pruneVectorClock', () => {
    it('keeps only nodes in the keeper set', () => {
      const before = vc({ A: 1, B: 2, C: 3 });
      const keepers = new Set(['A', 'C']);
      expect(pruneVectorClock(before, keepers).clocks).toEqual({ A: 1, C: 3 });
    });

    it('returns empty when no keepers match', () => {
      const before = vc({ A: 1 });
      expect(pruneVectorClock(before, new Set()).clocks).toEqual({});
    });
  });

  describe('end-to-end causal scenario', () => {
    it('captures the canonical Lamport handoff scenario', () => {
      // Three nodes: A creates an event, B receives it and creates its own,
      // C creates a concurrent event without seeing B's. The clocks should
      // identify A→B as causal and B↔C as concurrent.
      let onA = zeroVectorClock();
      let onB = zeroVectorClock();
      let onC = zeroVectorClock();

      // A: local event
      onA = tickVectorClock(onA, 'A');
      const eventA = onA;

      // B: receives event from A, then creates its own
      onB = mergeVectorClocks(onB, eventA);
      onB = tickVectorClock(onB, 'B');
      const eventB = onB;

      // C: creates a local event without seeing A or B
      onC = tickVectorClock(onC, 'C');
      const eventC = onC;

      expect(compareVectorClocks(eventA, eventB)).toBe('before');
      expect(compareVectorClocks(eventA, eventC)).toBe('concurrent');
      expect(compareVectorClocks(eventB, eventC)).toBe('concurrent');
    });
  });
});
