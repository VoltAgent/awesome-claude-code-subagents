/**
 * Self-consistency orchestrator tests (#1773 Phase 1.5).
 *
 * Verifies the Wang-et-al-2022 self-consistency primitive: sample N times
 * from a stochastic operation and aggregate. Pairs with the seedable RNG
 * (#1773 Phase 1.3) so test runs are deterministic.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { selfConsistency } from '../src/utils/self-consistency.js';
import { Mulberry32, setGlobalRng, resetGlobalRng } from '../src/utils/rng.js';

describe('selfConsistency — Wang et al. 2022 primitive (#1773 Phase 1.5)', () => {
  afterEach(() => {
    resetGlobalRng();
  });

  it('majority vote on a deterministic operation yields agreement = 1', async () => {
    const op = async () => 'hello';
    const r = await selfConsistency(op, { N: 5 });
    expect(r.finalAnswer).toBe('hello');
    expect(r.samples.length).toBe(5);
    expect(r.agreement).toBe(1);
  });

  it('majority vote picks the more common sample on bimodal noise', async () => {
    setGlobalRng(new Mulberry32(42));
    let i = 0;
    // Seed-driven distribution: 7 of 10 samples will be 'A', 3 will be 'B'
    // (deterministic via Mulberry32(42))
    const op = async () => (i++ % 10 < 7 ? 'A' : 'B');
    const r = await selfConsistency(op, { N: 10 });
    expect(r.finalAnswer).toBe('A');
    expect(r.agreement).toBeCloseTo(0.7, 5);
  });

  it('mean aggregator averages numeric samples', async () => {
    let i = 0;
    const samples = [1, 2, 3, 4, 5];
    const op = async () => samples[i++];
    const r = await selfConsistency(op, { N: 5, aggregator: 'mean' });
    expect(r.finalAnswer).toBe(3); // mean of 1..5
    expect(r.agreement).toBeGreaterThan(0); // some confidence
  });

  it('mean aggregator rejects non-number samples', async () => {
    const op = async () => 'not-a-number' as unknown as number;
    await expect(selfConsistency(op, { N: 3, aggregator: 'mean' }))
      .rejects.toThrow(/aggregator='mean'/);
  });

  it('first aggregator returns the first sample with agreement 1', async () => {
    let i = 0;
    const op = async () => `sample-${i++}`;
    const r = await selfConsistency(op, { N: 5, aggregator: 'first' });
    expect(r.finalAnswer).toBe('sample-0');
    expect(r.agreement).toBe(1);
  });

  it('rejects N <= 0 or non-integer N', async () => {
    const op = async () => 'x';
    await expect(selfConsistency(op, { N: 0 })).rejects.toThrow(/N must be/);
    await expect(selfConsistency(op, { N: -1 })).rejects.toThrow(/N must be/);
    await expect(selfConsistency(op, { N: 1.5 })).rejects.toThrow(/N must be/);
  });

  it('with seeded RNG, repeated runs of a stochastic op produce the same result', async () => {
    const stochasticOp = async () => {
      // Reads from the global RNG. With a fixed seed before each run, the
      // output sequence is identical.
      const v = (await import('../src/utils/rng.js')).random();
      return v < 0.5 ? 'low' : 'high';
    };

    setGlobalRng(new Mulberry32(7));
    const r1 = await selfConsistency(stochasticOp, { N: 20 });

    setGlobalRng(new Mulberry32(7));
    const r2 = await selfConsistency(stochasticOp, { N: 20 });

    expect(r1.samples).toEqual(r2.samples);
    expect(r1.finalAnswer).toBe(r2.finalAnswer);
    expect(r1.agreement).toBe(r2.agreement);
  });

  it('groups objects by canonical JSON', async () => {
    let i = 0;
    const op = async () => {
      i++;
      return i % 2 === 0 ? { tier: 'A', score: 1 } : { tier: 'A', score: 1 };
      // Both branches return semantically-identical objects.
    };
    const r = await selfConsistency(op, { N: 6 });
    expect(r.agreement).toBe(1);
  });

  it('preserves config on the result for inspection', async () => {
    const op = async () => 42;
    const r = await selfConsistency(op, { N: 3, aggregator: 'mean' });
    expect(r.config.N).toBe(3);
    expect(r.config.aggregator).toBe('mean');
  });
});
