/**
 * Seedable PRNG for reproducible training.
 *
 * The package previously used `Math.random()` everywhere — fast but
 * non-deterministic, which breaks reproducible training, A/B mode comparison,
 * and unit tests that assert on stochastic behavior.
 *
 * This module exposes a Mulberry32-based PRNG (small, fast, statistically
 * sound for non-cryptographic use) plus a global injection point. RL
 * algorithms, weight initialization, and exploration policies should call
 * `random()` / `randomInt()` / `randomNormal()` from here instead of
 * `Math.random()` directly.
 *
 * For deterministic runs:
 *
 *   import { setGlobalRng, Mulberry32 } from '@claude-flow/neural';
 *   setGlobalRng(new Mulberry32(42));
 *
 * After that, all `random()` consumers produce the same sequence on
 * every run. Pass a different seed to vary the trajectory.
 */

export interface RNG {
  /** Uniform sample in [0, 1) */
  next(): number;
  /** Integer sample in [min, max) */
  nextInt(min: number, max: number): number;
  /** Standard normal sample (Box-Muller) */
  nextNormal(): number;
  /** Reseed in place (mutates this instance) */
  seed(s: number): void;
}

/**
 * Mulberry32 — 32-bit chaotic-state PRNG. Period 2^32, passes BigCrush
 * subtests, ~5x faster than seedrandom. Not cryptographically secure.
 */
export class Mulberry32 implements RNG {
  private state: number;

  constructor(seedValue?: number) {
    // Default to a time-based non-deterministic seed; explicit 0 stays 0
    // (the user might want deterministically empty state).
    this.state = (seedValue !== undefined ? seedValue : Date.now() & 0x7fffffff) | 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min));
  }

  nextNormal(): number {
    // Box-Muller transform — generates a standard normal sample (mean 0, var 1)
    const u1 = this.next() || 1e-12; // avoid log(0)
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  seed(s: number): void {
    this.state = s | 0;
  }
}

/**
 * Math.random()-backed RNG for backward compatibility / production default.
 * Fast, non-deterministic, what the package shipped with before.
 */
export class MathRandomRng implements RNG {
  next(): number {
    return Math.random();
  }
  nextInt(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min));
  }
  nextNormal(): number {
    const u1 = Math.random() || 1e-12;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  seed(_s: number): void {
    // no-op — Math.random isn't seedable
  }
}

let globalRng: RNG = new MathRandomRng();

/**
 * Replace the global RNG. Pass a `Mulberry32(seed)` for reproducible runs,
 * or any custom RNG impl for testing. Idempotent.
 */
export function setGlobalRng(rng: RNG): void {
  globalRng = rng;
}

/** Get the current global RNG (mainly for tests/diagnostics). */
export function getGlobalRng(): RNG {
  return globalRng;
}

/** Reset to the default `Math.random()`-backed RNG. Mainly for tests. */
export function resetGlobalRng(): void {
  globalRng = new MathRandomRng();
}

/** Convenience: uniform sample in [0, 1) using the global RNG. */
export function random(): number {
  return globalRng.next();
}

/** Convenience: integer sample in [min, max) using the global RNG. */
export function randomInt(min: number, max: number): number {
  return globalRng.nextInt(min, max);
}

/** Convenience: standard normal sample using the global RNG. */
export function randomNormal(): number {
  return globalRng.nextNormal();
}
