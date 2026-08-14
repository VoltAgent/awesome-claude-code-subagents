/**
 * Bridge to @claude-flow/neural — Phase 1 convergence (#1773).
 *
 * The cli has historically reimplemented SONA / ReasoningBank / PatternLearner
 * locally in `intelligence.ts`. The dedicated `@claude-flow/neural` package
 * (3.0.0-alpha.7+) ships the canonical implementations plus 7 RL algorithms
 * (PPO/DQN/A2C/Decision Transformer/Q-Learning/SARSA/Curiosity), 5 SONA
 * modes (RealTime/Balanced/Research/Edge/Batch), and an event listener
 * system that the cli's local impl doesn't have.
 *
 * This bridge lazy-loads `NeuralLearningSystem` from the package and exposes
 * a stable accessor for cli code that wants to use the richer surface. The
 * existing local LocalSonaCoordinator + LocalReasoningBank in intelligence.ts
 * stay intact for now — Phase 1 just proves the wiring works without
 * breaking the 769 cli tests. Phase 2+ migrates functions one at a time.
 *
 * Why lazy: instantiating NeuralLearningSystem pulls in @ruvector/sona and
 * a few transitive WASM modules — not free at process startup. The bridge
 * defers until something actually asks for it.
 */

import type { NeuralLearningSystem, SONAMode } from '@claude-flow/neural';

let pkgInstance: NeuralLearningSystem | null = null;
let pkgInitPromise: Promise<NeuralLearningSystem | null> | null = null;
let pkgInitFailed = false;

/**
 * Lazy-load + initialize the @claude-flow/neural NeuralLearningSystem. Returns
 * null if the package isn't resolvable (defensive — the package is in cli's
 * regular dependencies, but environments with --ignore-scripts or pnpm prune
 * can leave it unavailable). Idempotent across calls.
 */
export async function getNeuralPackage(mode: SONAMode = 'balanced'): Promise<NeuralLearningSystem | null> {
  if (pkgInstance) return pkgInstance;
  if (pkgInitFailed) return null;
  if (pkgInitPromise) return pkgInitPromise;

  pkgInitPromise = (async () => {
    try {
      const m = await import('@claude-flow/neural');
      const sys = m.createNeuralLearningSystem(mode);
      await sys.initialize();
      pkgInstance = sys;
      return sys;
    } catch (err) {
      // CLAUDE_FLOW_DEBUG-gated log so future regressions of this shape
      // don't disappear silently — same convention as the ruvllm coordinator
      // bridge (#1770).
      if (process.env.CLAUDE_FLOW_DEBUG) {
        // eslint-disable-next-line no-console
        console.error('[neural-package] @claude-flow/neural load failed:', (err as Error).message);
      }
      pkgInitFailed = true;
      return null;
    }
  })();

  return pkgInitPromise;
}

/**
 * Quick "is the package available?" probe without forcing initialization.
 * Returns true if a previous getNeuralPackage() call succeeded; null if
 * never tried or failed. Useful for dashboards that want to surface package
 * status without triggering load.
 */
export function isNeuralPackageLoaded(): boolean {
  return pkgInstance !== null;
}

/**
 * Get aggregated stats from the neural package alongside cli's local stats.
 * Returns null if the package isn't loaded — caller should fall back to
 * local-only stats. The return shape mirrors the package's NeuralLearningSystem
 * .getStats() output: { sona, reasoningBank, patternLearner }.
 */
export async function getNeuralPackageStats(): Promise<ReturnType<NeuralLearningSystem['getStats']> | null> {
  const sys = await getNeuralPackage();
  return sys ? sys.getStats() : null;
}

/**
 * Reset the bridge (mainly for tests). Drops the cached instance and
 * forgets any prior init failure so the next getNeuralPackage() retries.
 */
export function resetNeuralPackageBridge(): void {
  pkgInstance = null;
  pkgInitPromise = null;
  pkgInitFailed = false;
}
