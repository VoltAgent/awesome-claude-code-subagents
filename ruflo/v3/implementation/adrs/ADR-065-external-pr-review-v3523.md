# ADR-065: External PR Review & Community Contribution Acceptance (v3.5.23)

## Status
**In Progress** — Review started 2026-03-17

## Date
2026-03-17

## Authors
- Ruflo Maintainers

## Context

Ruflo v3.5.22 achieved 100% capability audit (76/76 checks, 259 MCP tools). With the project gaining traction (5,900+ commits, growing community), external contributors are submitting PRs that fix real bugs and add valuable features. This ADR documents the review process, verdicts, and merge plan for the first batch of community PRs.

### Review Criteria

Each PR is evaluated on 4 axes:

| Axis | Weight | What We Check |
|------|--------|---------------|
| **Capability** | 30% | Does it fix a real bug or add real value? |
| **Security** | 30% | Path traversal, injection, poisoned data, module hijacking |
| **Regression** | 25% | Breaks existing behavior? Conflicts with v3.5.22? |
| **Code Quality** | 15% | Tests, idiomatic patterns, file size, consistency |

### Verdict Scale

- **ACCEPT** — Merge as-is
- **ACCEPT WITH CHANGES** — Merge after specific modifications
- **DEFER** — Good idea, needs more work or conflicts with current code
- **REJECT** — Doesn't meet quality/security bar

## PRs Under Review

### Tier 1: High Impact Bug Fixes

#### PR #1353 — fix(daemon): CPU-proportional maxCpuLoad replaces hardcoded 2.0
- **Author**: @luis-b-o
- **Files**: worker-daemon.ts, daemon.ts, + test file
- **Additions**: 934 / **Deletions**: 25
- **Issue**: #1077 — workers never start on multi-core machines
- **Fix**: `Math.max(cpuCount * 0.8, 2.0)` + cgroup v1/v2 container detection
- **Verdict**: ACCEPT WITH CHANGES
- **Security**: cgroup reads at fixed paths — no traversal risk. CLI flags validated with `NUMERIC_RE`. `sanitize()` strips control chars. Upper bound of 1000 prevents Infinity bypass.
- **Required changes**: (R1) State restoration in `initializeWorkerStates()` silently overrides config.json values from stale `daemon-state.json`. Add guard: skip restoring `resourceThresholds` when constructor received explicit values. (R2) Add upper bound check to `readDaemonConfigFromFile` for consistency. (R3) `.unref()` the 30s backoff timer to prevent blocking shutdown.

#### PR #1311 — fix: close semantic routing learning loop in hooks-tools
- **Author**: @eswann
- **Files**: hooks-tools.ts
- **Additions**: 161 / **Deletions**: 6
- **Issue**: #1310 — router never improves from task outcomes
- **Fix**: File-based persistence to `.claude-flow/routing-outcomes.json`, 500-entry FIFO cap
- **Verdict**: ACCEPT WITH CHANGES
- **Security**: No input validation on `agent`/`task` before JSON persistence. Add length + character whitelist: `agent.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(agent)`.
- **Required changes**: (1) Hoist `getMergedTaskPatterns()` out of `.map()` callback — currently N file reads per route call. (2) Add agent name validation. (3) Replace regex dir extraction with `dirname()`. (4) Consider in-memory cache for `loadRoutingOutcomes()`.
- **No merge conflicts**: v3.5.22 modified different sections of hooks-tools.ts.

### Tier 2: Build & Interop Fixes

#### PR #1346 — fix(cli): prevent TS2307 for optional @claude-flow/codex import
- **Author**: @TimChesko
- **Files**: init.ts
- **Additions**: 3 / **Deletions**: 1
- **Fix**: Move import specifier to variable to prevent static TS resolution
- **Verdict**: ACCEPT
- **Security**: No risk — `const` string literal, no user input. Existing precedent in `ruvllm-bridge.ts:310`.

#### PR #1334 — fix: resolve ESM/CJS interop in ruvector-training.ts
- **Author**: @fjdevel
- **Files**: ruvector-training.ts
- **Additions**: 12 / **Deletions**: 3
- **Fix**: `.default || module` pattern for CJS environments
- **Verdict**: REJECT (Rebase Required)
- **Note**: Correct fix but branched from pre-v3.5.22 base. All 4 change sites conflict with current main (file grew from 724 to 935 lines). Contributor needs to rebase onto main and re-apply at new line locations (~355, ~401, ~670).

#### PR #1314 — fix(memory): add prepublishOnly guard
- **Author**: @eric-cielo
- **Files**: memory/package.json
- **Additions**: 3 / **Deletions**: 1
- **Fix**: Verify 6 required exports exist at runtime before publish
- **Verdict**: ACCEPT
- **Security**: No concerns — `node -e` with hardcoded string literals only. Complementary to existing `files` field (runtime verification vs tarball inclusion).

### Tier 3: Package & Plugin Fixes

#### PR #1341 — Fix hooks package type export paths
- **Author**: @Gujiassh
- **Verdict**: ACCEPT
- **Details**: `.d.js` → `.d.ts` across 8 subpath exports. Old paths pointed to nonexistent files (TypeScript never emits `.d.js`). Pure metadata fix, no runtime changes.

#### PR #1338 — Fix performance attention runtime interop
- **Author**: @Gujiassh
- **Verdict**: ACCEPT WITH CHANGES
- **Details**: Creates CJS/ESM compatibility layer for `@ruvector/attention` using `createRequire`. Correct approach, no security concerns.
- **Required changes**: (1) Add wrappers for `MultiHeadAttention` and `LinearAttention` (imported by benchmarks but dropped by PR). (2) Add comment explaining `computeRaw` alias exists for backward compat.

#### PR #1337 — Fix benchmark environment lookup in ESM
- **Author**: @Gujiassh
- **Verdict**: ACCEPT
- **Details**: `require('os')` → `import os from 'node:os'`. Correct ESM fix with regression test. No env injection risk.

#### PR #1336 — Fix PluginManager priority and version checks
- **Author**: @Gujiassh
- **Verdict**: ACCEPT
- **Security**: Version check now routes through `getCoreVersion()` — marginally improves enforcement consistency. `||` → `??` for numeric priority is a strict correctness improvement (honors explicit `priority: 0`).

### Not Reviewed (Out of Scope)

| PR | Reason |
|----|--------|
| #1357 | launch.json — dev config, not needed in repo |
| #1350, #1324 | Duplicate MiniMax provider PRs — need dedup |
| #1325 | NextAuth.js example — unrelated to core |
| #1319, #1317, #1305, #1304 | Docs/branding — low priority |

## Merge Plan

Merge in dependency order, clean PRs first:

```
Phase 1 — Clean accepts (no changes needed):
  #1346 (TS2307 fix, 3 lines)
  #1314 (prepublish guard, 3 lines)
  #1341 (hooks type exports, 8 lines)
  #1337 (benchmark ESM, 31 lines)
  #1336 (plugin priority, 13 lines)

Phase 2 — Accept with changes (request fixes, then merge):
  #1353 (daemon CPU — request R1/R2/R3 fixes from @luis-b-o)
  #1311 (routing loop — request input validation + hoist from @eswann)
  #1338 (attention interop — request missing wrappers from @Gujiassh)

Phase 3 — Rejected (request rebase):
  #1334 (ESM/CJS ruvector — needs rebase onto post-v3.5.22 main)
```

## Security Review Checklist

- [ ] No hardcoded credentials or tokens
- [ ] No path traversal in file operations
- [ ] No command injection in shell calls
- [ ] No unvalidated input used in routing decisions
- [ ] No module resolution hijacking via dynamic imports
- [ ] No unbounded data growth (check FIFO caps)
- [ ] No breaking changes to public API surface

## Post-Merge Validation

After merging accepted PRs:
1. Full `tsc` build — 0 errors
2. Run test suite
3. Verify 259 MCP tools still register
4. Verify daemon starts on multi-core (if #1353 merged)
5. Verify routing learning persists (if #1311 merged)
6. Publish as v3.5.23

## Decision

**Reviews complete.** 9 PRs reviewed by parallel agent swarm on 2026-03-17.

| Verdict | Count | PRs |
|---------|-------|-----|
| **ACCEPT** | 5 | #1346, #1314, #1341, #1337, #1336 |
| **ACCEPT WITH CHANGES** | 3 | #1353, #1311, #1338 |
| **REJECT (rebase)** | 1 | #1334 |

**Phase 1 merge approved.** 5 clean PRs ready for immediate merge.
**Phase 2 pending.** Review comments posted; awaiting contributor fixes.
**Phase 3 blocked.** Contributor must rebase onto post-v3.5.22 main.
