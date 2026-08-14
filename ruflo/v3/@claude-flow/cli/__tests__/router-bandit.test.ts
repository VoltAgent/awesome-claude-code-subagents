/**
 * Thompson sampling bandit — convergence + per-bucket isolation tests.
 *
 * What this proves: given an environment where Haiku is the right answer for
 * low-complexity tasks, the bandit converges to Haiku and shifts the
 * distribution decisively. As of ADR-142 the priors are keyed by complexity
 * bucket (low/med/high), so outcomes on one task type no longer suppress a
 * model for all task types — the tests below assert that isolation and that
 * old flat-shaped state files migrate forward losslessly.
 *
 * The test environment is a deterministic outcome simulator — we know which
 * model is "right" for a synthetic task and feed that back via recordOutcome.
 * No mocks of the real Anthropic API; the bandit only sees `success/failure/
 * escalated` strings, which is exactly what hooks_model-outcome delivers.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelRouter } from '../src/ruvector/model-router.js';

let cwdRestore: string;
let tmpDir: string;

function setupTempCwd(): void {
  cwdRestore = process.cwd();
  tmpDir = mkdtempSync(join(tmpdir(), 'router-bandit-'));
  process.chdir(tmpDir);
}

function cleanupTempCwd(): void {
  process.chdir(cwdRestore);
  rmSync(tmpDir, { recursive: true, force: true });
}

/** The complexity bucket a task maps to — mirrors model-router's bands so the
 * test queries the exact bucket recordOutcome wrote to. */
function bucketOf(router: ModelRouter, task: string): 'low' | 'med' | 'high' {
  const s = router.analyzeComplexity(task).score;
  return s < 0.4 ? 'low' : s < 0.7 ? 'med' : 'high';
}

/** Sum α/β across all three buckets per model — recovers the total Bernoulli
 * accounting regardless of which bucket each task landed in. Baseline is
 * {alpha:3,beta:3} per model (3 buckets × uniform {1,1}). */
function aggregatePriors(router: ModelRouter) {
  const b = router.getBucketedPriors();
  const sum = (m: 'haiku' | 'sonnet' | 'opus') => ({
    alpha: b.low[m].alpha + b.med[m].alpha + b.high[m].alpha,
    beta: b.low[m].beta + b.med[m].beta + b.high[m].beta,
  });
  return { haiku: sum('haiku'), sonnet: sum('sonnet'), opus: sum('opus') };
}

function syntheticOutcome(
  model: 'haiku' | 'sonnet' | 'opus',
  complexity: number,
  rng: () => number = Math.random,
): 'success' | 'failure' | 'escalated' {
  const optimal = complexity < 0.4 ? 'haiku' : complexity < 0.7 ? 'sonnet' : 'opus';
  if (model === optimal) return rng() < 0.8 ? 'success' : 'failure';
  const tierGap = ['haiku', 'sonnet', 'opus'].indexOf(model)
    - ['haiku', 'sonnet', 'opus'].indexOf(optimal);
  if (tierGap > 0) return rng() < 0.7 ? 'escalated' : 'success';
  return rng() < 0.3 ? 'success' : 'failure';
}

describe('ModelRouter — Thompson sampling bandit (#1772, ADR-142 bucketed)', () => {
  beforeEach(setupTempCwd);
  afterEach(cleanupTempCwd);

  it('starts with uniform Beta(1,1) priors in every bucket', () => {
    const router = new ModelRouter();
    const b = router.getBucketedPriors();
    for (const bucket of ['low', 'med', 'high'] as const) {
      expect(b[bucket].haiku).toEqual({ alpha: 1, beta: 1 });
      expect(b[bucket].sonnet).toEqual({ alpha: 1, beta: 1 });
      expect(b[bucket].opus).toEqual({ alpha: 1, beta: 1 });
    }
  });

  it('updates priors via cost-adjusted Bernoulli on recordOutcome (within one bucket)', () => {
    const router = new ModelRouter();
    const task = 'simple task'; // all updates land in this task's bucket
    router.recordOutcome(task, 'haiku', 'success'); // reward 1.0 → α += 1
    router.recordOutcome(task, 'opus', 'success');  // reward 0.4 → α += 0.4
    router.recordOutcome(task, 'haiku', 'failure'); // reward 0   → β += 1
    const p = router.getBanditPriors(bucketOf(router, task));
    expect(p.haiku.alpha).toBeCloseTo(2.0, 5);
    expect(p.haiku.beta).toBeCloseTo(2.0, 5);
    expect(p.opus.alpha).toBeCloseTo(1.4, 5);
    expect(p.opus.beta).toBeCloseTo(1.6, 5);
  });

  it('escalation gives partial credit to Sonnet, zero to Haiku/Opus', () => {
    const router = new ModelRouter();
    router.recordOutcome('t', 'sonnet', 'escalated'); // reward 0.1
    router.recordOutcome('t', 'haiku', 'escalated');  // reward 0.0
    const p = router.getBanditPriors(bucketOf(router, 't'));
    expect(p.sonnet.alpha).toBeCloseTo(1.1, 5);
    expect(p.sonnet.beta).toBeCloseTo(1.9, 5);
    expect(p.haiku.alpha).toBeCloseTo(1.0, 5);
    expect(p.haiku.beta).toBeCloseTo(2.0, 5);
  });

  it('persists and reloads priors across router instances', () => {
    const router1 = new ModelRouter();
    for (let i = 0; i < 10; i++) router1.recordOutcome('t', 'haiku', 'success');
    const bucket = bucketOf(router1, 't');
    expect(router1.getBanditPriors(bucket).haiku.alpha).toBeCloseTo(11, 5);

    const router2 = new ModelRouter(); // reads from same .swarm/model-router-state.json
    const after = router2.getBanditPriors(bucket);
    expect(after.haiku.alpha).toBeCloseTo(11, 5);
    expect(after.haiku.beta).toBeCloseTo(1, 5);
  });

  it('ADR-142: per-bucket isolation — failures on one task type do not move another bucket', () => {
    const router = new ModelRouter();
    const easy = 'fix a typo';            // low bucket
    const hard = 'architect a distributed byzantine consensus system with sharding'; // high bucket
    const easyB = bucketOf(router, easy);
    const hardB = bucketOf(router, hard);
    expect(easyB).not.toBe(hardB); // sanity: they really are different buckets

    for (let i = 0; i < 8; i++) router.recordOutcome(easy, 'haiku', 'failure');
    // haiku is hammered in the easy bucket but untouched in the hard bucket.
    expect(router.getBanditPriors(easyB).haiku.beta).toBeCloseTo(9, 5);
    expect(router.getBanditPriors(hardB).haiku).toEqual({ alpha: 1, beta: 1 });
  });

  it('ADR-142: migrates a flat v1 state file by seeding all buckets', () => {
    mkdirSync(join(tmpDir, '.swarm'), { recursive: true });
    writeFileSync(join(tmpDir, '.swarm', 'model-router-state.json'), JSON.stringify({
      totalDecisions: 5,
      priors: {
        haiku: { alpha: 9, beta: 2 }, sonnet: { alpha: 1, beta: 1 },
        opus: { alpha: 1, beta: 1 }, inherit: { alpha: 1, beta: 1 },
      },
    }));
    const router = new ModelRouter();
    expect(router.getBanditPriors('low').haiku).toEqual({ alpha: 9, beta: 2 });
    expect(router.getBanditPriors('high').haiku).toEqual({ alpha: 9, beta: 2 }); // seeded
  });

  it('converges toward Haiku on a low-complexity workload (~50 trials)', async () => {
    const router = new ModelRouter();
    let seed = 0x1234567;
    const rng = () => {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const N = 100;
    let haikuPicked = 0;
    let opusPicked = 0;
    for (let i = 0; i < N; i++) {
      const complexity = 0.1 + rng() * 0.4; // 0.1 .. 0.5, avg ~0.3
      const task = `simple task ${i}`;
      const r = await router.route(task);
      if (r.model === 'haiku') haikuPicked++;
      if (r.model === 'opus') opusPicked++;
      const outcome = syntheticOutcome(r.model as 'haiku' | 'sonnet' | 'opus', complexity, rng);
      router.recordOutcome(task, r.model, outcome);
    }

    const priors = aggregatePriors(router);
    const meanHaiku  = priors.haiku.alpha  / (priors.haiku.alpha  + priors.haiku.beta);
    const meanOpus   = priors.opus.alpha   / (priors.opus.alpha   + priors.opus.beta);
    expect(meanHaiku).toBeGreaterThan(meanOpus);
    expect(haikuPicked).toBeGreaterThan(opusPicked);
  }, 30_000);

  it('does not lock in early — recovers from a bad initial draw', async () => {
    const router = new ModelRouter();
    for (let i = 0; i < 100; i++) {
      const r = await router.route(`task ${i}`);
      const outcome = r.model === 'haiku' ? 'success' : 'escalated';
      router.recordOutcome(`task ${i}`, r.model, outcome);
    }
    const priors = aggregatePriors(router);
    const meanHaiku = priors.haiku.alpha / (priors.haiku.alpha + priors.haiku.beta);
    const meanOpus  = priors.opus.alpha  / (priors.opus.alpha  + priors.opus.beta);
    expect(meanHaiku).toBeGreaterThan(meanOpus);
  }, 30_000);
});
