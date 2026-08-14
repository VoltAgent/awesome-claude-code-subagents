# ADR-G008: Optimizer Promotion Rule -- "Win Twice to Promote" for Rule Evolution

## Status
Accepted

## Date
2026-02-01

## Context

Guidance rules must evolve. Projects change, new patterns emerge, and the initial rule set becomes stale. But reckless rule changes cause instability:

- **Promoting too aggressively** moves an untested local rule into the constitution, where it affects every task. If the rule is wrong, it causes widespread false positives.
- **Demoting too aggressively** removes a safety rule from the constitution, creating a gap that the model exploits.
- **Modifying without testing** changes a rule based on a single violation, which may have been an outlier.

The optimizer loop needs a conservative promotion policy that balances evolution speed with stability.

The `OptimizerLoop` class in `src/optimizer.ts` implements a weekly optimization cycle with these steps:

1. Rank violations by frequency and cost
2. Propose changes for the top N violations
3. Evaluate changes against baseline metrics
4. Promote winners, record ADRs

The promotion policy is the critical decision: when does a rule change earn the right to be promoted from `local` (CLAUDE.local.md overlay) to `root` (CLAUDE.md constitution)?

## Decision

Require **two consecutive wins** before promoting a local rule to root. This is the `promotionWins` parameter in `OptimizerConfig`, defaulting to 2.

### The Full Optimization Cycle

#### Step 1: Violation Ranking

`RunLedger.rankViolations()` aggregates all violations across events:

```typescript
interface ViolationRanking {
  ruleId: string;
  frequency: number;        // How many times violated
  cost: number;             // Average rework lines per violation
  score: number;            // frequency * cost
}
```

Rankings are sorted by score descending. The top `topViolationsPerCycle` (default: 3) violations are addressed.

#### Step 2: Change Proposal

For each top violation, `proposeChanges()` generates a `RuleChange`:

- **Existing rule, frequently violated (>5 times):** Modify the rule text to be more specific and add automated enforcement annotation.
- **Existing rule, costly violations (>50 rework lines):** Elevate priority and add a cost warning.
- **Existing local rule near promotion threshold:** Propose `promote` change type.
- **No existing rule:** Propose `add` to create a new rule.

#### Step 3: A/B Evaluation

`evaluateChange()` computes candidate metrics by simulating the change's effect:

```typescript
// Conservative estimates per change type:
// modify:  40% violation reduction, 30% rework reduction
// add:     60% violation reduction, 50% rework reduction
// promote: 80% violation reduction, 60% rework reduction
// remove:  20% violation increase, 10% rework increase
```

The decision criteria are:
1. **Risk must not increase** beyond `maxRiskIncrease` (default: 0.05, i.e., 5%)
2. **Rework must decrease** by at least `improvementThreshold` (default: 0.10, i.e., 10%)

Both conditions must be met for `shouldPromote = true`.

#### Step 4: Promotion Tracking

The `promotionTracker` map in `OptimizerLoop` records win counts per rule ID:

```typescript
private promotionTracker = new Map<string, number>(); // ruleId -> win count
```

On each cycle:
- If `shouldPromote === true`: increment the win count. If `winCount >= promotionWins`, the rule is promoted.
- If `shouldPromote === false`: reset the win count to 0. If the failed change was a `promote` type, the rule is demoted.

#### Step 5: Promotion Application

`applyPromotions()` moves a shard to the constitution:

```typescript
const promotedRule: GuidanceRule = {
  ...shard.rule,
  source: 'root',
  isConstitution: true,
  priority: shard.rule.priority + 100,
  text: change.proposedText || shard.rule.text,
  updatedAt: Date.now(),
};
```

The rule gains:
- `source: 'root'` (was `'local'`)
- `isConstitution: true` (was `false`)
- Priority boost of +100 (ensures it dominates in contradiction resolution)

#### Step 6: ADR Recording

Every change decision (promoted or rejected) is recorded as a `RuleADR`:

```typescript
interface RuleADR {
  number: number;
  title: string;       // "Promote: modify rule R042" or "Reject: add rule NEW-001"
  decision: string;
  rationale: string;   // From the A/B test result
  change: RuleChange;
  testResult: ABTestResult;
  date: number;
}
```

### Timeline

With a weekly optimization cycle and a 2-win requirement:

- **Week 1:** Rule R042 proposed, tested, wins. Win count: 1.
- **Week 2:** Rule R042 re-evaluated, wins again. Win count: 2. Promoted to root.
- **Total:** 2 weeks minimum from first observation to promotion.

For a rule that starts as a new local addition:

- **Week 1:** Violation observed, new rule proposed and added to CLAUDE.local.md.
- **Week 2:** New rule evaluated, wins. Win count: 1.
- **Week 3:** Rule re-evaluated, wins. Win count: 2. Promoted to root.
- **Total:** 3 weeks minimum from first violation to root promotion.

For the full journey from local experiment to root rule, accounting for the optimizer's conservative estimates and the need for sufficient events (`minEventsForOptimization: 10`), the realistic cycle is **4-6 weeks**.

## Consequences

### Positive

- **Stability.** A single good result cannot promote a rule. Two consecutive wins reduce the probability of promoting a rule that won by chance (from ~50% to ~25% for a random change).
- **Reversibility.** A single bad result resets the win count to 0, preventing a previously good rule from coasting to promotion after a degradation.
- **Transparency.** Every promotion and rejection is recorded as an ADR with full metrics, rationale, and the A/B test results.
- **Gradual evolution.** The 4-6 week cycle ensures that rule changes are observed across diverse tasks and sessions before becoming permanent.

### Negative

- **Slow reaction.** A critical new rule takes 2-3 weeks to reach root. If a new vulnerability pattern emerges, the rule must wait. Mitigation: teams can manually add critical rules directly to CLAUDE.md, bypassing the optimizer.
- **Conservative estimates.** The simulation (`simulateChangeEffect`) uses hardcoded reduction percentages (30-60%) rather than actual A/B test data. In production, the simulation should be replaced with real headless test suite runs.
- **Win count fragility.** A single bad week (regression unrelated to the rule) resets the counter. Mitigation: the `promotionWins` parameter is configurable; teams can set it to 1 for faster evolution at the cost of stability.

## Alternatives Considered

### 1. Immediate promotion on first win
Promote a rule as soon as it reduces rework without increasing risk. Rejected because a single measurement is noisy -- it could reflect task mix variance rather than rule quality.

### 2. Statistical significance testing
Require a statistically significant improvement (p < 0.05) before promotion. Rejected because it requires a large sample size (30-50 events per arm), which would take months to accumulate at typical usage rates. The "win twice" heuristic is simpler and faster while still providing basic noise filtering.

### 3. Human approval for all promotions
Require a human to review and approve every promotion. Rejected because it defeats the purpose of autonomous optimization. The ADR recording provides a human-reviewable audit trail without blocking the promotion process.

### 4. Decay-based promotion (accumulated score)
Track a cumulative score that decays over time, promoting when the score exceeds a threshold. Rejected because it is harder to reason about and explain. "Win twice" is simple, deterministic, and easy to document.

### 5. Three-win requirement
Require three consecutive wins. Considered but rejected as too slow. At a weekly cycle, three wins means 3 weeks minimum, which puts the full journey at 5-8 weeks. The marginal stability gain from a third win does not justify the delay.

## References

- `v3/@claude-flow/guidance/src/optimizer.ts` -- `OptimizerLoop.runCycle()`, `proposeChanges()`, `evaluateChange()`, `applyPromotions()`, `promotionTracker`
- `v3/@claude-flow/guidance/src/types.ts` -- `RuleChange`, `ABTestResult`, `OptimizationMetrics`, `ViolationRanking`, `RuleADR`
- `v3/@claude-flow/guidance/src/ledger.ts` -- `RunLedger.rankViolations()`, `computeMetrics()`
- `v3/@claude-flow/guidance/src/index.ts` -- `GuidanceControlPlane.optimize()`
- ADR-G002 -- Constitution/shard split that promotions modify
- ADR-G005 -- Proof envelopes that record the evidence for promotion decisions
