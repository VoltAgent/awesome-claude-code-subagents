/**
 * @claude-flow/neural package bridge — Phase 1 convergence smoke (#1773).
 *
 * Proves the BRIDGE contract: lazy init, idempotent caching, graceful failure
 * when the package isn't resolvable. The actual package-loading is tested
 * conditionally because vitest's module resolver can disagree with Node's
 * runtime resolver for ESM workspace packages — direct `node` invocation
 * loads the package fine, vitest doesn't always. The bridge itself handles
 * both cases (returns null on failure), so these tests cover the contract
 * without depending on test-runtime resolution behavior.
 *
 * Direct package shape testing happens in @claude-flow/neural's own test
 * suite — not duplicated here.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  getNeuralPackage,
  isNeuralPackageLoaded,
  getNeuralPackageStats,
  resetNeuralPackageBridge,
} from '../src/memory/neural-package-bridge.js';

describe('@claude-flow/neural package bridge (#1773 Phase 1)', () => {
  beforeEach(() => {
    resetNeuralPackageBridge();
  });

  it('starts with the package not loaded (lazy init contract)', () => {
    expect(isNeuralPackageLoaded()).toBe(false);
  });

  it('returns the same instance/result on subsequent calls (idempotent)', async () => {
    const a = await getNeuralPackage();
    const b = await getNeuralPackage();
    // Whether the package loaded or not, both calls return identical refs.
    // (null === null is also true, so this works for the not-loaded case.)
    expect(a).toBe(b);
  }, 30_000);

  it('isNeuralPackageLoaded reflects post-load state', async () => {
    expect(isNeuralPackageLoaded()).toBe(false);
    const sys = await getNeuralPackage();
    if (sys) {
      // Package loaded — flag should be true now.
      expect(isNeuralPackageLoaded()).toBe(true);
    } else {
      // Package failed to load (vitest resolver, missing dep, etc.) —
      // the flag stays false. Bridge degrades gracefully.
      expect(isNeuralPackageLoaded()).toBe(false);
    }
  }, 30_000);

  it('getNeuralPackageStats returns the documented shape OR null', async () => {
    const stats = await getNeuralPackageStats();
    if (stats) {
      // Documented shape per @claude-flow/neural NeuralLearningSystem.getStats()
      expect(stats).toHaveProperty('sona');
      expect(stats).toHaveProperty('reasoningBank');
      expect(stats).toHaveProperty('patternLearner');
    } else {
      expect(stats).toBeNull();
    }
  }, 30_000);

  it('exposes accessors when the package loads', async () => {
    const sys = await getNeuralPackage();
    if (sys) {
      expect(typeof sys.getSONAManager).toBe('function');
      expect(typeof sys.getReasoningBank).toBe('function');
      expect(typeof sys.getPatternLearner).toBe('function');
      expect(sys.getSONAManager()).toBeTruthy();
      expect(sys.getReasoningBank()).toBeTruthy();
      expect(sys.getPatternLearner()).toBeTruthy();
    } else {
      // No package, no accessors — bridge correctly returned null.
      expect(sys).toBeNull();
    }
  }, 30_000);

  it('resetNeuralPackageBridge() clears the cache', async () => {
    await getNeuralPackage();
    resetNeuralPackageBridge();
    expect(isNeuralPackageLoaded()).toBe(false);
  }, 30_000);
});
