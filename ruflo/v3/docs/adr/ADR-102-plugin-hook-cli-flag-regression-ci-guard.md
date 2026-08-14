# ADR-102: CI Smoke Harness for Plugin Hook + CLI Flag Regressions

**Status**: Accepted
**Date**: 2026-05-08
**Version**: v3.7.0-alpha.17 → v3.7.0-alpha.18
**Related**: #1859, #1862, #1867, ADR-100 (cli-core split)

## Context

Two issues filed within ~30 minutes on 2026-05-08 (#1859, #1862) and one filed ~5 hours later (#1867) all had the same shape: a regression that affected every Claude Code session using ruflo, shipped to users via `latest` and `alpha` dist-tags, and was *not* reproducible by any test in the existing suite — because no test exercised the user-visible invocation path.

The existing `v3-ci.yml` ran `pnpm test` (vitest unit tests in workspace context) and `pnpm typecheck`. Both passed for the broken builds because:

- `@claude-flow/memory` had a static `import 'better-sqlite3'` whose evaluation succeeded under the test runner's Node 20 + `pnpm install` (prebuilds present). It would only fail when a user ran `npm install` on Node 26 (no prebuilds) — which CI never did.
- `@claude-flow/cli` had a `ctx.args[0] || ctx.flags.X` priority anti-pattern in 14 hook handlers. No test exercised these handlers as a subprocess with both `--flag` and a value-shaped boolean (e.g. `--success true`) on the command line, so the parser's stray-positional behaviour was invisible.
- `plugins/ruflo-core/hooks/hooks.json` called CLI flags that didn't exist (`--format true`, `--update-memory true`, `--track-metrics true`, `--store-results true`). Every Write/Edit/Bash tool use crashed with `[ERROR] Invalid value for --format: true` once Claude Code fired the hook — but no test in the repo *invoked* `hooks.json` against the CLI with realistic stdin.

The common thread is a CI gap, not a coding gap. Each fix was small (~20 LOC) once the root cause was found; the cost was entirely in the user-visible failure window.

## Bugs Covered

### Bug 1 — Plugin hooks called non-existent CLI flags (#1862)

**Symptom**: Every `PostToolUse:Write` (and `Edit`, `MultiEdit`) hook fired by Claude Code printed:

```
PostToolUse:Write hook error
[ERROR] Invalid value for --format: true. Must be one of: text, json, table
```

**Root cause**: `plugins/ruflo-core/hooks/hooks.json` line 38 invoked `npx claude-flow@alpha hooks post-edit --file <path> --format true --update-memory true`. The CLI has a *global* `--format` option restricted to `text|json|table` — the parser rejected `true` before any handler ran. `--update-memory` is also not a real flag.

The Bash hook (line 29) had the equivalent issue: `--track-metrics true --store-results true` are also not real flags.

**Fix**: `plugins/ruflo-core/hooks/hooks.json` rewritten to call only the documented flags (`-f`/`-s` for post-edit, `-c`/`-s`/`-e` for post-command). Required republishing `ruflo-core@0.2.1`.

### Bug 2 — CLI parser preferred stray positionals over named flags (#1859 part A)

**Symptom**: `claude-flow hooks post-edit --file src/foo.ts --success true` recorded `"true"` as the file path:

```
[INFO] Recording outcome for: true
[OK] Outcome recorded for true
```

**Root cause**: `v3/@claude-flow/cli/src/commands/hooks.ts` resolved the primary value with the same anti-pattern across **14 handlers**:

```ts
const filePath = ctx.args[0] || ctx.flags.file as string || 'unknown';
```

Because `--success` is declared as `type: 'boolean'`, the parser doesn't consume the next token as its value. Writing `--success true` (the form documented in the CLI's *own* help examples) leaves the literal string `"true"` in `ctx.args[0]`, which then beats the named flag.

**Fix**: Bulk regex swap of all 14 sites:

```ts
const filePath = (ctx.flags.file as string) || ctx.args[0] || 'unknown';
```

Backward-compatible: legacy positional-only callers (`hooks post-edit src/foo.ts`) still work because the positional is the fallback. The flag now wins when both are set, which matches user expectation.

### Bug 3 — Bash hook mangled multi-line commands (#1859 part B)

**Symptom**: When Claude Code ran a heredoc Bash command, the hook errored with:

```
[ERROR] Required option missing: --command
```

**Root cause**: The hook used `cat | jq -r '.tool_input.command' | tr '\n' '\0' | xargs -0 -I {} npx ...`. The `tr '\n' '\0'` converted real newlines (jq -r's unescaped output) into null delimiters, and `xargs -0 -I {}` split the multi-line command into multiple null-delimited records — invoking the CLI multiple times, sometimes with empty `--command ''` arguments that the CLI rejected.

**Fix**: Replaced with a `bash -c` wrapper that reads stdin once, extracts via jq into env vars, and invokes the CLI exactly once with the multi-line command quoted:

```json
"command": "/bin/bash -c 'INPUT=$(cat); CMD=$(printf %s \"$INPUT\" | jq -r \".tool_input.command // empty\"); [ -z \"$CMD\" ] && exit 0; EXIT=$(printf %s \"$INPUT\" | jq -r \".tool_response.exit_code // 0\"); SUCCESS=$([ \"$EXIT\" = \"0\" ] && echo true || echo false); npx claude-flow@alpha hooks post-command -c \"$CMD\" -s \"$SUCCESS\" -e \"$EXIT\"'"
```

## Decision

### 1. Add an integration smoke harness for plugin hooks

`plugins/ruflo-core/scripts/test-hooks.mjs` drives **each** PostToolUse hook from `hooks/hooks.json` against a CLI binary (local build under test), with synthetic Claude-Code-style JSON on stdin. It asserts both:

- **Exit code** — catches "flag the CLI doesn't accept" (Bug 1).
- **Recorded value matches input** — catches "parser ambiguity records the wrong value" (Bug 2). E.g. when stdin says `file_path = /tmp/foo.ts`, output must contain `/tmp/foo.ts` and must *not* contain `Recording outcome for: true`.

Negative assertions (`absent: 'Recording … : true'`) are critical. A naive `contains: 'true'` test would have spuriously passed against the broken CLI because the recorded value happened to be the string "true".

**Empirical validation**: Against the published broken `@claude-flow/cli@3.7.0-alpha.17` the harness reports `2/7 passed` with the exact #1859/#1862 symptoms. Against the fixed `@3.7.0-alpha.18` it reports `7/7 passed`.

### 2. Wire it into `v3-ci.yml` as a blocking job

`plugin-hooks-smoke` runs before `publish`, decoupled from the workspace `build` job (which is gated on unrelated test failures). The matrix is **cross-platform** to catch OS-specific shell behaviour:

```yaml
plugin-hooks-smoke:
  strategy:
    matrix:
      os: [ubuntu-latest, macos-latest]   # bash needed; Windows out of scope
      node: ['22']
  steps:
    - install + scoped build of @claude-flow/cli...
    - node plugins/ruflo-core/scripts/test-hooks.mjs \
        "node $GITHUB_WORKSPACE/v3/@claude-flow/cli/bin/cli.js"
```

Cross-platform reasoning per job (full matrix in §5):

| Job | Linux | macOS | Windows | Why |
|---|---|---|---|---|
| `plugin-hooks-smoke` | ✓ | ✓ | — | Plugin's `hooks.json` uses `/bin/bash -c` and synthetic JSON-on-stdin assumes POSIX shell. Windows users run Claude Code via WSL/git-bash, which the test would also need to simulate; out of scope for this guard. |
| `smoke-install-no-bsqlite` | ✓ | ✓ | — | Smoke script uses bash patterns; same reasoning. |
| `witness-verify` | ✓ | ✓ | ✓ | Pure JS (only `@noble/ed25519`). Catches platform-specific JSON canonicalisation or path-resolution bugs (e.g. Windows CRLF normalisation breaking the manifest hash) before they reach users. |

This *blocks* publishing on hook regression. A future PR that adds a non-existent flag to `hooks.json`, or re-introduces the `ctx.args[0] || ctx.flags.X` priority bug, fails this job before reaching users on whichever OS the bug surfaces.

### 3. Codify the CLI flag-priority convention

`v3/@claude-flow/cli/src/commands/hooks.ts` sets the precedent for all `CommandContext` consumers: **named flags win over stray positionals**. The 14 changed sites are:

```
pre-edit          line 302   --file
post-edit         line 431   --file
pre-command       line 530   --command
post-command      line 659   --command
route             line 745   --task
explain           line 897   --task
transfer          line 1525  --source
pre-task          line 1764  --description
session-restore   line 2106  --sessionId
coverage-route    line 3067  --task
coverage-suggest  line 3339  --path
coverage-gaps     line 4730  --task
post-task         line 5093  --taskId
notify            line 5192  --message
```

Future handlers must follow `(ctx.flags.X as string) || ctx.args[0]`, not the reverse.

### 4. Smoke-harness pattern as a class

This is the second instance (after `smoke-install-no-bsqlite` from #1867) of the same template:

> Build the artifact under test in a fresh CI job. Drive it through the *user-visible* failure path (a real `npm install` on a clean dir; a real plugin hook against a real CLI). Assert on the user-visible signal (install succeeds; correct value recorded). Block publish on failure.

Future regression categories should follow the same shape rather than relying on in-process unit tests that miss subprocess/install/parser realities.

### 5. Cross-platform matrix

GitHub Actions provides `ubuntu-latest`, `macos-latest`, and `windows-latest` runners. The matrix per job reflects whether platform behaviour is load-bearing for *that specific guard*:

| Job | ubuntu | macos | windows | Rationale |
|---|---|---|---|---|
| `smoke-install-no-bsqlite` | ✓ | ✓ | — | Tests `npm install --omit=optional` round-trip behaviour. The smoke script uses bash; Windows runners have git-bash but the regression class (native build failure on Node 26 without prebuilds) is OS-independent. Linux + macOS coverage is sufficient signal for the JS code path. |
| `plugin-hooks-smoke` | ✓ | ✓ | — | The plugin's `hooks.json` uses `/bin/bash -c '...'`. Windows users run Claude Code via WSL/git-bash (where the test would behave the same as Linux/macOS); native cmd/PowerShell isn't the user environment for these hooks. |
| `witness-verify` | ✓ | ✓ | ✓ | Pure JS — only `@noble/ed25519`. Catches platform-specific bugs that pure unit tests miss: e.g. Windows CRLF line-ending normalization breaking the canonical manifest hash, or Node `path` differences breaking the marker-cited file lookup. Always full coverage. |
| `build` | ✓ | ✓ | ✓ | Pre-existing matrix; covers tsc behaviour across OSes. |

Bash steps in cross-platform jobs use `shell: bash` to make Windows fall through to git-bash, and `$RUNNER_TEMP` instead of `/tmp` for OS-portable temp paths.

The matrix expansion costs ~6 extra runner-minutes per CI invocation (3 OSes × ~2 min for witness-verify, 1 OS × ~2 min each for the two smoke jobs that gained macOS). Acceptable for catching OS drift before users do.

## Implementation

| Artifact | Path | Purpose |
|----------|------|---------|
| Plugin hook fix | `plugins/ruflo-core/hooks/hooks.json` | Real flags, multi-line-safe wrappers |
| Smoke harness | `plugins/ruflo-core/scripts/test-hooks.mjs` | 7 assertions; runs against any CLI invocation string |
| CI job | `.github/workflows/v3-ci.yml` (`plugin-hooks-smoke`) | ubuntu + macos × Node 22; blocks `publish` |
| CLI parser fix | `v3/@claude-flow/cli/src/commands/hooks.ts` | 14-site flag/positional priority swap |
| Witness verify cross-platform | `v3-ci.yml` (`witness-verify`) | ubuntu + macos + windows; pure-JS verifier dogfooding |

The smoke harness accepts an arbitrary CLI invocation string, so it can also run against the *published* CLI (`npx --yes @claude-flow/cli@latest`) as a post-release sanity check — the same script doubles as a pre-merge guard and a release canary.

## Consequences

### Protected against

- Re-adding a flag to `hooks.json` that the CLI doesn't accept.
- Re-introducing the `ctx.args[0] || flags.X` anti-pattern in any of the 14 handlers (or a 15th).
- Multi-line Bash commands silently dropping or producing `--command ''`.
- Plugin/CLI flag drift in either direction (CLI removes a flag the plugin uses; plugin starts using a flag the CLI doesn't have).

### Not protected against (residual risk)

- Plugins beyond `ruflo-core`. The harness is currently scoped to one plugin's `hooks.json`. Other plugins (`ruflo-swarm`, `ruflo-federation`, etc.) ship their own hook configs and could regress independently. Generalizing the harness to discover and exercise *all* plugin hook configs is a follow-up.
- Hooks that call commands other than the documented set. The harness only verifies that exit code is 0 and the recorded value matches input — it doesn't verify behavioural side effects (memory writes, neural training, etc.).
- Non-bash shells (Windows `cmd.exe`, PowerShell). The hook commands assume bash. Windows users running Claude Code outside WSL will see different failure modes that this harness doesn't cover. Tracked separately under #1857.

### User-visible impact

- `ruflo-core@0.2.0` users still see the original errors until they update to `0.2.1` (plugin republish via IPFS — separate ship).
- `npx ruflo@latest` (3.7.0-alpha.18) users get the parser fix immediately. Even with the cached `ruflo-core@0.2.0` plugin, the Bash hook's flag-priority symptom (recording "true" instead of the command) is fixed; only the Edit hook's `--format true` rejection remains until the plugin republish lands.

### Maintenance cost

- ~150 LOC of new code (test harness + CI job).
- ~7 second additional CI time per Node version (matrix doubles to 14s aggregate).
- The harness runs the actual CLI binary, so it surfaces issues like missing dependencies, broken postinstall scripts, and prebuild gaps that pure-vitest tests would miss.

## References

- #1859 — ruflo-core@0.2.0 ships broken PostToolUse hooks (Bash + Edit)
- #1862 — ruflo-core plugin v0.2.0: PostToolUse hook fails with --format true
- #1867 — Established the post-build install smoke pattern (`smoke-install-no-bsqlite`) that this ADR generalizes
- ADR-100 — cli-core split: relevant because the parser anti-pattern lives in the layer that ADR-100 isolates
