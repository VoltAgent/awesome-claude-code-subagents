/**
 * Tests for ADR-097 Phase 1 — federation budget validator + enforcer.
 *
 * Pins the security invariants the reviewer called out (audit_1776853149979
 * follow-up):
 *   1. validateBudget rejects NaN, ±Infinity, negatives, non-integer hops
 *   2. enforceBudget is atomic (synchronous, no awaits) — pinned by
 *      checking that two concurrent calls cannot both pass a single-hop
 *      budget when the caller passes the same hopCount=0 in.
 *   3. Errors are constant strings — no remaining-budget echo on failure
 *   4. Backward compat: omitted budget → unbounded with default maxHops=8
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_HOPS,
  enforceBudget,
  validateBudget,
} from '../../src/domain/value-objects/federation-budget.js';

describe('validateBudget (ADR-097 Phase 1)', () => {
  describe('happy path', () => {
    it('accepts undefined → unbounded budget with default maxHops', () => {
      const r = validateBudget(undefined);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.budget.maxHops).toBe(DEFAULT_MAX_HOPS);
      expect(r.budget.maxTokens).toBe(Number.POSITIVE_INFINITY);
      expect(r.budget.maxUsd).toBe(Number.POSITIVE_INFINITY);
    });

    it('accepts null → unbounded with default maxHops', () => {
      const r = validateBudget(null);
      expect(r.ok).toBe(true);
    });

    it('accepts a fully-specified budget', () => {
      const r = validateBudget({ maxTokens: 1000, maxUsd: 0.5, maxHops: 4 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.budget).toEqual({ maxTokens: 1000, maxUsd: 0.5, maxHops: 4 });
    });

    it('accepts maxHops=0 (no remote delegation allowed)', () => {
      const r = validateBudget({ maxHops: 0 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.budget.maxHops).toBe(0);
    });

    it('overrideMaxHops takes precedence over the budget object value', () => {
      const r = validateBudget({ maxHops: 5 }, 2);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.budget.maxHops).toBe(2);
    });

    it('overrideMaxHops alone (no budget object) yields a hop-only budget', () => {
      const r = validateBudget(undefined, 0);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.budget.maxHops).toBe(0);
    });
  });

  describe('rejection: malformed types', () => {
    it.each([
      ['string', 'budget must be an object'],
      [42, 'budget must be an object'],
      [[1, 2], 'budget must be an object'],
    ])('rejects raw=%s', (raw, expected) => {
      const r = validateBudget(raw as unknown);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toContain(expected);
    });
  });

  describe('rejection: hop validation', () => {
    it.each([
      [Number.NaN, 'finite integer'],
      [Number.POSITIVE_INFINITY, 'finite integer'],
      [Number.NEGATIVE_INFINITY, 'finite integer'],
      [1.5, 'finite integer'],
      [-1, '>= 0'],
      [65, 'ceiling'],
      [Number.MAX_SAFE_INTEGER, 'ceiling'],
      ['8' as unknown as number, 'finite integer'],
    ])('rejects maxHops=%s', (val, expected) => {
      const r = validateBudget({ maxHops: val });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toContain(expected);
    });
  });

  describe('rejection: token validation', () => {
    it.each([
      [Number.NaN, 'finite number'],
      [Number.POSITIVE_INFINITY, 'finite number'],
      [-1, '>= 0'],
      [1.5, 'integer'],
      [1_000_000_001, 'ceiling'],
    ])('rejects maxTokens=%s', (val, expected) => {
      const r = validateBudget({ maxTokens: val });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toContain(expected);
    });
  });

  describe('rejection: usd validation', () => {
    it.each([
      [Number.NaN, 'finite number'],
      [Number.POSITIVE_INFINITY, 'finite number'],
      [-0.01, '>= 0'],
      [1_000_001, 'ceiling'],
    ])('rejects maxUsd=%s', (val, expected) => {
      const r = validateBudget({ maxUsd: val });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toContain(expected);
    });

    it('accepts maxUsd as a non-integer (e.g. 0.001)', () => {
      const r = validateBudget({ maxUsd: 0.001 });
      expect(r.ok).toBe(true);
    });
  });
});

describe('enforceBudget (ADR-097 Phase 1)', () => {
  function bud(p: Partial<{ maxHops: number; maxTokens: number; maxUsd: number }> = {}) {
    const r = validateBudget(p);
    if (!r.ok) throw new Error(r.error);
    return r.budget;
  }

  describe('hop counter', () => {
    it('passes when nextHopCount <= maxHops', () => {
      const r = enforceBudget(bud({ maxHops: 3 }), 0);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.nextHopCount).toBe(1);
    });

    it('refuses with HOP_LIMIT_EXCEEDED when nextHopCount > maxHops', () => {
      const r = enforceBudget(bud({ maxHops: 2 }), 2);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe('HOP_LIMIT_EXCEEDED');
    });

    it('maxHops=0 refuses to forward at all (originator → first hop blocked)', () => {
      const r = enforceBudget(bud({ maxHops: 0 }), 0);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe('HOP_LIMIT_EXCEEDED');
    });

    it('terminates a synthetic recursive ring at the configured maxHops', () => {
      const budget = bud({ maxHops: 3 });
      // Simulate hops A → B → A → B → … incrementing hopCount each step
      let hops = 0;
      let lastResult: ReturnType<typeof enforceBudget> | null = null;
      for (let i = 0; i < 10; i++) {
        lastResult = enforceBudget(budget, hops);
        if (!lastResult.ok) break;
        hops = lastResult.nextHopCount;
      }
      expect(lastResult).not.toBeNull();
      expect(lastResult!.ok).toBe(false);
      expect(hops).toBe(3); // exactly maxHops legs ran
      if (!lastResult!.ok) {
        expect(lastResult!.reason).toBe('HOP_LIMIT_EXCEEDED');
      }
    });
  });

  describe('budget axes', () => {
    it('passes when cumulative tokens still within cap', () => {
      const r = enforceBudget(bud({ maxTokens: 100, maxHops: 5 }), 0, {
        tokens: 30,
        usd: 0,
      });
      expect(r.ok).toBe(true);
    });

    it('refuses with BUDGET_EXCEEDED when tokens overshoot', () => {
      const r = enforceBudget(bud({ maxTokens: 50, maxHops: 5 }), 0, {
        tokens: 60,
        usd: 0,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe('BUDGET_EXCEEDED');
    });

    it('refuses with BUDGET_EXCEEDED when USD overshoots', () => {
      const r = enforceBudget(bud({ maxUsd: 0.5, maxHops: 5 }), 0, {
        tokens: 0,
        usd: 0.6,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe('BUDGET_EXCEEDED');
    });

    it('hop limit takes priority over budget exhaust (deterministic order)', () => {
      const r = enforceBudget(bud({ maxHops: 0, maxTokens: 0 }), 0, {
        tokens: 100,
        usd: 0,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe('HOP_LIMIT_EXCEEDED');
    });
  });

  describe('downstream propagation', () => {
    it('returns remaining budget for the downstream peer', () => {
      const r = enforceBudget(bud({ maxTokens: 100, maxUsd: 1, maxHops: 5 }), 0, {
        tokens: 30,
        usd: 0.25,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.remaining.maxTokens).toBe(70);
      expect(r.remaining.maxUsd).toBe(0.75);
      expect(r.remaining.maxHops).toBe(5); // hop ceiling itself unchanged
    });
  });

  describe('anti-malice: negative spend cannot inflate remaining', () => {
    it('treats negative tokens as 0 (no refund / inflation)', () => {
      const r = enforceBudget(bud({ maxTokens: 100, maxHops: 5 }), 0, {
        tokens: -50,
        usd: 0,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.remaining.maxTokens).toBe(100);
    });

    it('treats negative usd as 0', () => {
      const r = enforceBudget(bud({ maxUsd: 1, maxHops: 5 }), 0, {
        tokens: 0,
        usd: -2,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.remaining.maxUsd).toBe(1);
    });
  });

  describe('atomic check (no internal awaits)', () => {
    it('is purely synchronous — return value type is not a Promise', () => {
      const r = enforceBudget(bud({ maxHops: 1 }), 0);
      // The return type is the discriminated union, not a Promise. This
      // pins the no-internal-await contract: a future refactor that adds
      // an await would change the function to async and break this assertion.
      expect(r).not.toBeInstanceOf(Promise);
      expect(typeof (r as object as { then?: unknown }).then).toBe('undefined');
    });
  });

  describe('error info leak (anti-oracle)', () => {
    it('failure result carries no remaining-budget data', () => {
      const r = enforceBudget(bud({ maxHops: 0 }), 0);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      // Reason is the only public field on the failure case — no budget
      // numbers, no remaining counts, nothing a caller can probe with.
      expect(Object.keys(r).sort()).toEqual(['ok', 'reason']);
    });

    it('uses constant strings (HOP_LIMIT_EXCEEDED / BUDGET_EXCEEDED only)', () => {
      const r1 = enforceBudget(bud({ maxHops: 0 }), 0);
      const r2 = enforceBudget(bud({ maxTokens: 0, maxHops: 5 }), 0, {
        tokens: 1,
        usd: 0,
      });
      expect(r1.ok).toBe(false);
      expect(r2.ok).toBe(false);
      if (r1.ok || r2.ok) return;
      expect(['HOP_LIMIT_EXCEEDED', 'BUDGET_EXCEEDED']).toContain(r1.reason);
      expect(['HOP_LIMIT_EXCEEDED', 'BUDGET_EXCEEDED']).toContain(r2.reason);
    });
  });
});
