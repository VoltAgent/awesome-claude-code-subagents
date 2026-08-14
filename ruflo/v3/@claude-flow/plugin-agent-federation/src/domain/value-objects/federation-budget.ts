/**
 * Federation budget + hop counter (ADR-097 Phase 1).
 *
 * Carried in {@link FederationEnvelope} alongside the existing
 * sourceNodeId/targetNodeId/payload. Sender supplies the original limits;
 * each outbound hop increments hopCount and decrements remaining budget.
 *
 * Phase 1 enforces at the *send* side because there is no inbound
 * dispatcher today (sendToNode is a stub — see researcher report).
 * Phase 2 will move the decrement to receive once the inbound path lands.
 *
 * Security invariants pinned by the reviewer (audit_1776853149979 follow-up):
 *
 *   1. validateBudget rejects NaN, ±Infinity, negative numbers, and
 *      non-integer hop counts. Returns a discriminated result so callers
 *      cannot accidentally use a bad budget unchecked.
 *   2. enforceBudget runs check-then-decrement in a single synchronous
 *      function with no awaits inside — two concurrent send calls cannot
 *      both pass the pre-check.
 *   3. Errors return constant strings ("HOP_LIMIT_EXCEEDED" /
 *      "BUDGET_EXCEEDED") with no remaining-budget echo so a caller can't
 *      use the error response as an oracle for the threshold.
 */

/** Maximum hops a federation message may travel before the breaker opens. */
export const DEFAULT_MAX_HOPS = 8;
/** Hard ceiling on caller-supplied maxUsd to prevent absurd integer math. */
const MAX_USD_CEILING = 1_000_000;
/** Hard ceiling on caller-supplied maxTokens. 1B tokens is more than any real session. */
const MAX_TOKENS_CEILING = 1_000_000_000;
/** Hard ceiling on hop count. */
const MAX_HOPS_CEILING = 64;

/**
 * Caller-supplied budget. All fields are optional; omitted fields are
 * treated as Infinity for the corresponding axis. Created via validateBudget;
 * never construct directly.
 */
export interface Budget {
  readonly maxHops: number;
  readonly maxTokens: number; // Infinity allowed
  readonly maxUsd: number;    // Infinity allowed
}

/** Discriminated result of validating raw user input into a Budget. */
export type BudgetValidationResult =
  | { ok: true; budget: Budget }
  | { ok: false; error: string };

/**
 * Validate a raw budget object. Pure, no side effects. Caller obtains either
 * a guaranteed-safe Budget or a structured error suitable for logging.
 *
 * Accepts undefined/null and returns a default unbounded budget (maxHops =
 * DEFAULT_MAX_HOPS, tokens/usd = Infinity). This preserves backward
 * compatibility for callers that don't pass a budget at all.
 */
export function validateBudget(
  raw: unknown,
  overrideMaxHops?: unknown,
): BudgetValidationResult {
  // Default unbounded budget when caller passes nothing.
  if (raw == null && overrideMaxHops == null) {
    return {
      ok: true,
      budget: {
        maxHops: DEFAULT_MAX_HOPS,
        maxTokens: Number.POSITIVE_INFINITY,
        maxUsd: Number.POSITIVE_INFINITY,
      },
    };
  }

  // Caller passed a bare maxHops without a budget object — accept it as a
  // hop-only budget. Useful for "no remote delegation allowed" via
  // maxHops: 0.
  if (raw == null && overrideMaxHops != null) {
    const hopCheck = checkHops(overrideMaxHops);
    if (!hopCheck.ok) return hopCheck;
    return {
      ok: true,
      budget: {
        maxHops: hopCheck.value,
        maxTokens: Number.POSITIVE_INFINITY,
        maxUsd: Number.POSITIVE_INFINITY,
      },
    };
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'budget must be an object' };
  }
  const obj = raw as Record<string, unknown>;

  const hopsRaw = overrideMaxHops ?? obj.maxHops;
  const hopCheck =
    hopsRaw == null
      ? { ok: true as const, value: DEFAULT_MAX_HOPS }
      : checkHops(hopsRaw);
  if (!hopCheck.ok) return hopCheck;

  const tokensCheck =
    obj.maxTokens == null
      ? { ok: true as const, value: Number.POSITIVE_INFINITY }
      : checkBound(obj.maxTokens, MAX_TOKENS_CEILING, 'maxTokens', true);
  if (!tokensCheck.ok) return tokensCheck;

  const usdCheck =
    obj.maxUsd == null
      ? { ok: true as const, value: Number.POSITIVE_INFINITY }
      : checkBound(obj.maxUsd, MAX_USD_CEILING, 'maxUsd', false);
  if (!usdCheck.ok) return usdCheck;

  return {
    ok: true,
    budget: {
      maxHops: hopCheck.value,
      maxTokens: tokensCheck.value,
      maxUsd: usdCheck.value,
    },
  };
}

function checkHops(
  v: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
    return { ok: false, error: 'maxHops must be a finite integer' };
  }
  if (v < 0) return { ok: false, error: 'maxHops must be >= 0' };
  if (v > MAX_HOPS_CEILING) {
    return { ok: false, error: `maxHops exceeds ceiling (${MAX_HOPS_CEILING})` };
  }
  return { ok: true, value: v };
}

function checkBound(
  v: unknown,
  ceiling: number,
  label: string,
  requireInteger: boolean,
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return { ok: false, error: `${label} must be a finite number` };
  }
  if (requireInteger && !Number.isInteger(v)) {
    return { ok: false, error: `${label} must be an integer` };
  }
  if (v < 0) return { ok: false, error: `${label} must be >= 0` };
  if (v > ceiling) {
    return { ok: false, error: `${label} exceeds ceiling (${ceiling})` };
  }
  return { ok: true, value: v };
}

/**
 * Enforcement decision returned by enforceBudget. Discriminated so the
 * caller can map directly to a constant-string error — no remaining-budget
 * echo on the failure side (anti-oracle).
 */
export type BudgetEnforcement =
  | { ok: true; nextHopCount: number; remaining: Budget }
  | { ok: false; reason: 'HOP_LIMIT_EXCEEDED' | 'BUDGET_EXCEEDED' };

/**
 * Atomic (single synchronous function, no internal awaits) hop check.
 *
 * Returns the hopCount value the OUTBOUND envelope should carry plus the
 * remaining budget that downstream peers will see. Callers must use the
 * returned values; mutating the input Budget is forbidden (it's readonly).
 *
 * Contract:
 *   - hopCount represents how many hops the message has already taken.
 *   - The next outbound hop increments it: nextHopCount = hopCount + 1.
 *   - The check fires AFTER increment: nextHopCount must be <= maxHops.
 *   - This means maxHops=0 refuses to forward at all, which matches the
 *     ADR's "no remote delegation allowed" semantic.
 *
 * tokensSpent / usdSpent are caller-reported actuals from the immediately
 * preceding leg (or 0 on the originator). The check fires on the
 * *post-spend* totals so a leg that overshoots is caught before the next
 * outbound dispatch.
 */
export function enforceBudget(
  budget: Budget,
  hopCount: number,
  spent: { tokens: number; usd: number } = { tokens: 0, usd: 0 },
): BudgetEnforcement {
  const nextHopCount = hopCount + 1;
  if (nextHopCount > budget.maxHops) {
    return { ok: false, reason: 'HOP_LIMIT_EXCEEDED' };
  }
  // Negative spend is a programming error; treat as 0 rather than refunding
  // the budget (which would let a malicious caller inflate remaining).
  const ts = Math.max(0, spent.tokens);
  const us = Math.max(0, spent.usd);
  const remainingTokens = budget.maxTokens - ts;
  const remainingUsd = budget.maxUsd - us;
  if (remainingTokens < 0 || remainingUsd < 0) {
    return { ok: false, reason: 'BUDGET_EXCEEDED' };
  }
  return {
    ok: true,
    nextHopCount,
    remaining: {
      maxHops: budget.maxHops,
      maxTokens: remainingTokens,
      maxUsd: remainingUsd,
    },
  };
}
