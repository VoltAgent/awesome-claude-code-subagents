/**
 * Hybrid Logical Clock tests.
 *
 * Coverage targets (per ADR-101 Component A):
 *   - monotonic advance under wall-clock advance
 *   - logical bumps when wall clock stalls
 *   - logical bumps when wall clock goes backward
 *   - update() merges remote causality correctly
 *   - skew guard rejects far-future remote HLCs
 *   - compare yields a total order across nodes
 *   - degeneracy: single-node HLCs are wall-clock-equivalent
 */

import { describe, expect, it } from 'vitest';
import {
  LocalHlc,
  HlcSkewError,
  compareHlc,
  zeroHlc,
  hlcToWallMs,
  wallMsToHlc,
  DEFAULT_MAX_SKEW_MS,
  type HlcTimestamp,
} from '../src/infrastructure/hlc';

/** Build a controllable physical-clock function for tests. */
function fakeClock(start: number) {
  let t = start;
  return {
    advance(ms: number) { t += ms; },
    setTo(ms: number) { t = ms; },
    read: () => t,
  };
}

describe('LocalHlc', () => {
  it('refuses an empty nodeId', () => {
    expect(() => new LocalHlc('')).toThrow(/non-empty nodeId/);
  });

  describe('now()', () => {
    it('advances physicalMs when wall clock advances', () => {
      const wall = fakeClock(1_000);
      const hlc = new LocalHlc('node-A', wall.read);
      const t0 = hlc.now();
      wall.advance(500);
      const t1 = hlc.now();
      expect(t1.physicalMs).toBe(1_500);
      expect(t1.logical).toBe(0);
      expect(compareHlc(t0, t1)).toBe(-1);
    });

    it('bumps logical when wall clock has not advanced', () => {
      const wall = fakeClock(1_000);
      const hlc = new LocalHlc('node-A', wall.read);
      const t0 = hlc.now();
      const t1 = hlc.now();
      const t2 = hlc.now();
      // wall clock didn't move — logical should monotonically increase
      expect(t1.physicalMs).toBe(t0.physicalMs);
      expect(t1.logical).toBe(t0.logical + 1);
      expect(t2.logical).toBe(t1.logical + 1);
      expect(compareHlc(t0, t1)).toBe(-1);
      expect(compareHlc(t1, t2)).toBe(-1);
    });

    it('bumps logical when wall clock goes backward', () => {
      const wall = fakeClock(2_000);
      const hlc = new LocalHlc('node-A', wall.read);
      const t0 = hlc.now();
      wall.setTo(1_000); // NTP correction, VM resume, etc.
      const t1 = hlc.now();
      // physical does NOT regress; logical bumps to keep monotonicity
      expect(t1.physicalMs).toBe(t0.physicalMs);
      expect(t1.logical).toBeGreaterThan(t0.logical);
      expect(compareHlc(t0, t1)).toBe(-1);
    });
  });

  describe('update()', () => {
    it('takes the max physical and bumps logical when remote is concurrent', () => {
      const wall = fakeClock(1_000);
      const local = new LocalHlc('node-A', wall.read);
      // Remote is at physical 1000, logical 7 — same physical as ours
      const remote: HlcTimestamp = { physicalMs: 1_000, logical: 7, nodeId: 'node-B' };
      const merged = local.update(remote);
      expect(merged.physicalMs).toBe(1_000);
      expect(merged.logical).toBe(8); // max(0, 7) + 1
      expect(merged.nodeId).toBe('node-A');
    });

    it('adopts remote physical when remote is ahead', () => {
      const wall = fakeClock(1_000);
      const local = new LocalHlc('node-A', wall.read);
      const remote: HlcTimestamp = { physicalMs: 1_500, logical: 3, nodeId: 'node-B' };
      const merged = local.update(remote);
      expect(merged.physicalMs).toBe(1_500);
      expect(merged.logical).toBe(4); // remote.logical + 1
    });

    it('keeps local physical when remote is in the past', () => {
      const wall = fakeClock(2_000);
      const local = new LocalHlc('node-A', wall.read);
      const t0 = local.now();
      const remote: HlcTimestamp = { physicalMs: 500, logical: 99, nodeId: 'node-B' };
      const merged = local.update(remote);
      expect(merged.physicalMs).toBe(t0.physicalMs);
      // local's physical wins, logical bumps
      expect(merged.logical).toBeGreaterThan(t0.logical);
    });

    it('throws HlcSkewError when remote is too far in the future', () => {
      const wall = fakeClock(1_000);
      const local = new LocalHlc('node-A', wall.read, 5_000); // 5s skew tolerance
      const farFuture: HlcTimestamp = {
        physicalMs: 1_000 + 6_000, // 6s ahead
        logical: 0,
        nodeId: 'node-B',
      };
      expect(() => local.update(farFuture)).toThrow(HlcSkewError);
    });

    it('accepts remote within the skew window', () => {
      const wall = fakeClock(1_000);
      const local = new LocalHlc('node-A', wall.read, 5_000);
      const justInside: HlcTimestamp = {
        physicalMs: 1_000 + 4_999,
        logical: 0,
        nodeId: 'node-B',
      };
      expect(() => local.update(justInside)).not.toThrow();
    });

    it('default skew tolerance is 30s', () => {
      const wall = fakeClock(0);
      const local = new LocalHlc('node-A', wall.read);
      expect(local.maxSkewMs).toBe(DEFAULT_MAX_SKEW_MS);
      expect(DEFAULT_MAX_SKEW_MS).toBe(30_000);
    });
  });

  describe('compareHlc', () => {
    it('orders by physical first, then logical, then nodeId', () => {
      const aEarly: HlcTimestamp = { physicalMs: 1, logical: 0, nodeId: 'A' };
      const aLate: HlcTimestamp = { physicalMs: 2, logical: 0, nodeId: 'A' };
      const aLogical: HlcTimestamp = { physicalMs: 1, logical: 1, nodeId: 'A' };
      const bSame: HlcTimestamp = { physicalMs: 1, logical: 0, nodeId: 'B' };

      expect(compareHlc(aEarly, aLate)).toBe(-1);
      expect(compareHlc(aLate, aEarly)).toBe(1);
      expect(compareHlc(aEarly, aLogical)).toBe(-1);
      expect(compareHlc(aEarly, bSame)).toBe(-1); // A < B lex
      expect(compareHlc(bSame, aEarly)).toBe(1);
      expect(compareHlc(aEarly, aEarly)).toBe(0);
    });

    it('produces a total order on a randomized set', () => {
      const items: HlcTimestamp[] = [];
      for (let i = 0; i < 50; i++) {
        items.push({
          physicalMs: Math.floor(Math.random() * 100),
          logical: Math.floor(Math.random() * 10),
          nodeId: ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)]!,
        });
      }
      const sorted = [...items].sort(compareHlc);
      for (let i = 1; i < sorted.length; i++) {
        expect(compareHlc(sorted[i - 1]!, sorted[i]!)).toBeLessThanOrEqual(0);
      }
    });
  });

  describe('helpers', () => {
    it('hlcToWallMs returns physicalMs', () => {
      expect(hlcToWallMs({ physicalMs: 42, logical: 99, nodeId: 'X' })).toBe(42);
    });

    it('wallMsToHlc lifts wall ms at logical=0', () => {
      const lifted = wallMsToHlc(42, 'X');
      expect(lifted).toEqual({ physicalMs: 42, logical: 0, nodeId: 'X' });
    });

    it('zeroHlc sorts before everything', () => {
      const z = zeroHlc('A');
      const real: HlcTimestamp = { physicalMs: 1, logical: 0, nodeId: 'A' };
      expect(compareHlc(z, real)).toBe(-1);
    });
  });

  describe('single-node degeneracy', () => {
    it('produces wall-clock-equivalent ordering when no updates ever arrive', () => {
      // ADR-101 promise: in single-node mode, HLC physicalMs tracks wall clock
      // and is pairwise-comparable to plain Unix timestamps.
      const wall = fakeClock(1_000);
      const hlc = new LocalHlc('solo', wall.read);

      const t0 = hlc.now();
      wall.advance(100);
      const t1 = hlc.now();
      wall.advance(50);
      const t2 = hlc.now();

      // Each timestamp should match wall when wall advanced
      expect(t0.physicalMs).toBe(1_000);
      expect(t1.physicalMs).toBe(1_100);
      expect(t2.physicalMs).toBe(1_150);
      // Logical stays at 0 because wall advanced each time
      expect(t0.logical).toBe(0);
      expect(t1.logical).toBe(0);
      expect(t2.logical).toBe(0);
      // → comparing physicalMs yields the same order as comparing HLCs
      expect(t0.physicalMs < t1.physicalMs).toBe(true);
      expect(t1.physicalMs < t2.physicalMs).toBe(true);
    });
  });
});
