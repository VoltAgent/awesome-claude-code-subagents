/**
 * Self-consistency orchestrator (Wang et al. 2022, "Self-Consistency Improves
 * Chain of Thought Reasoning in Language Models").
 *
 * Runs an arbitrary stochastic operation N times and aggregates the results.
 * Reduces variance from single-shot stochastic predictions; on reasoning
 * benchmarks the technique typically gains 5–15pp accuracy at the cost of
 * Nx compute. The package's RL algorithms, pattern matching, and routing
 * all benefit since they sample randomly and can produce different outputs
 * across calls.
 *
 * Aggregators:
 *   - 'majority': pick the most common output (for discrete answers / labels).
 *                 Uses JSON.stringify for grouping; stable for primitive and
 *                 plain-object outputs. Float32Array values aggregate via
 *                 their array-form encoding.
 *   - 'mean':     numeric average (operation must return number).
 *                 Agreement = 1 - normalized stddev.
 *   - 'first':    take the first sample (no aggregation; useful for testing
 *                 or deterministic ops).
 *
 * Pair with `setGlobalRng(new Mulberry32(seed))` to make a self-consistency
 * run reproducible across machines.
 */

import type { RNG } from './rng.js';
import { random } from './rng.js';

export type SelfConsistencyAggregator = 'majority' | 'mean' | 'first';

export interface SelfConsistencyConfig {
  /** Number of samples to draw. Required. Larger N = more stable, more compute. */
  N: number;
  /** How to aggregate samples into a single answer. Default: 'majority'. */
  aggregator?: SelfConsistencyAggregator;
  /**
   * Optional RNG to advance per sample (e.g. to differentiate seeds across
   * samples when the operation reads from the global RNG). The orchestrator
   * itself doesn't directly call this RNG; it's provided so callers can
   * thread per-sample state (e.g. by reseeding before each call).
   */
  rng?: RNG;
}

export interface SelfConsistencyResult<T> {
  /** The aggregated answer (majority vote, mean, or first). */
  finalAnswer: T;
  /** Every sample produced, in the order produced. Length === config.N. */
  samples: T[];
  /**
   * For 'majority': fraction of samples matching finalAnswer (0..1).
   * For 'mean':    1 - normalized stddev (rough confidence proxy).
   * For 'first':   always 1.
   */
  agreement: number;
  /** The config used for this run. */
  config: SelfConsistencyConfig;
}

/**
 * Run an operation N times and aggregate. The operation is awaited
 * sequentially — if the caller wants concurrency they can wrap it themselves.
 */
export async function selfConsistency<T>(
  operation: () => Promise<T> | T,
  config: SelfConsistencyConfig,
): Promise<SelfConsistencyResult<T>> {
  if (!Number.isInteger(config.N) || config.N <= 0) {
    throw new Error(`selfConsistency: N must be a positive integer, got ${config.N}`);
  }

  const samples: T[] = [];
  for (let i = 0; i < config.N; i++) {
    samples.push(await operation());
  }

  const aggregator: SelfConsistencyAggregator = config.aggregator ?? 'majority';

  let finalAnswer: T;
  let agreement: number;

  if (aggregator === 'majority') {
    // Group by JSON-stringified value (handles primitives, plain objects,
    // arrays). Float32Array does NOT JSON-encode losslessly by default —
    // callers wanting f32 majority should pre-convert via Array.from.
    const counts = new Map<string, { value: T; count: number }>();
    for (const s of samples) {
      const key = canonicalKey(s);
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { value: s, count: 1 });
    }
    let best: { value: T; count: number } = { value: samples[0], count: 0 };
    for (const c of counts.values()) {
      if (c.count > best.count) best = c;
    }
    finalAnswer = best.value;
    agreement = best.count / samples.length;
  } else if (aggregator === 'mean') {
    const nums = samples as unknown as number[];
    if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      throw new Error("selfConsistency: aggregator='mean' requires every sample to be a finite number");
    }
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length;
    const stddev = Math.sqrt(variance);
    const range = Math.max(1e-9, Math.abs(mean) || 1); // avoid div-by-0
    finalAnswer = mean as unknown as T;
    agreement = Math.max(0, Math.min(1, 1 - stddev / range));
  } else {
    finalAnswer = samples[0];
    agreement = 1;
  }

  return { finalAnswer, samples, agreement, config };
}

/**
 * Canonical-form key for grouping. JSON.stringify is enough for primitives,
 * arrays, and plain objects with stable key order. Callers wanting locale-
 * insensitive or shape-aware aggregation should pre-canonicalize their
 * outputs before calling selfConsistency.
 */
function canonicalKey(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    // Cyclic structures, BigInt, etc.
    return String(v);
  }
}

// Re-export for callers that need it
export { random };
