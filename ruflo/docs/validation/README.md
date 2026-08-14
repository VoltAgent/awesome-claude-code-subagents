# Validation System

Three-layer regression-protection stack used by ruflo's CI to catch the regression classes that traditional unit tests miss. Adopt the same stack in any project — the toolkit is project-agnostic and ships in `plugins/ruflo-core/scripts/witness/`.

> **External-friendly version** (no ruflo-specific paths): [agentic-validation-system gist](https://gist.github.com/ruvnet/ee7763c36f7a9a1c1886da783abc872b). This document is the in-repo home with cross-references to ruflo's own implementation.

---

## Why traditional CI is not enough

Three regressions filed on 2026-05-08 (#1859, #1862, #1867) all passed unit tests + typecheck on the broken commits. Each had a different root cause but the same gap: **unit tests verify code paths, not user-visible failure modes.**

| Regression | What broke | Why CI passed | What user saw |
|---|---|---|---|
| `#1867` | `@claude-flow/memory` had `better-sqlite3` as a hard dep + static import | CI ran on Node 20 where prebuilds existed, so the static import evaluated fine | `npm install ruflo@latest` failed on Node 26 with `node-gyp` errors |
| `#1862` | `ruflo-core` plugin's `hooks.json` called `--format true` (not a real flag) | No CI test invoked the plugin's `hooks.json` against the CLI with realistic stdin | Every Write/Edit tool use printed `[ERROR] Invalid value for --format: true` |
| `#1859` | CLI parser preferred stray positionals over named flags (14 sites in `hooks.ts`) | Unit tests passed flags individually, never combined `--flag` + boolean-shaped value | `post-edit --file X --success true` recorded `"true"` as the file path |

The validation stack adds three layers that each test a *user-visible* failure mode against a real artifact, not a code path.

---

## Architecture

```
                 ┌─────────────────────────────────────────────────┐
                 │  Layer 1: Behavioral smoke tests                │
                 │  ─────────────────────────────                  │
                 │  Fresh `npm install` on real Node versions      │
                 │  Real subprocess invocation with real JSON      │
                 │  Asserts user-visible signal, not code path     │
                 └─────────────────────────────────────────────────┘
                                       ↓
                 ┌─────────────────────────────────────────────────┐
                 │  Layer 2: Cryptographic witness manifest        │
                 │  ─────────────────────────────                  │
                 │  SHA-256 + marker substring per fix             │
                 │  Ed25519-signed with deterministic seed         │
                 │  Anyone can re-derive the public key            │
                 └─────────────────────────────────────────────────┘
                                       ↓
                 ┌─────────────────────────────────────────────────┐
                 │  Layer 3: Append-only temporal history (JSONL)  │
                 │  ─────────────────────────────                  │
                 │  One snapshot per regen                         │
                 │  Per-fix status timeline                        │
                 │  Regression-introduction commit identification  │
                 └─────────────────────────────────────────────────┘
```

Each layer is independently useful and independently adoptable. Together:

- **Layer 1** catches the regression *as a user would experience it*.
- **Layer 2** confirms every documented fix is *still in the code*, even if Layer 1 has no specific test for it.
- **Layer 3** answers *when the regression was introduced*, so triage doesn't require manual `git bisect`.

---

## Layer 1 — Behavioral smoke tests

Build the artifact under test in CI, drive it through the *user-visible* failure path with a real subprocess, assert on the user-visible signal.

### Concrete instances in this repo

| Instance | Source | CI job |
|---|---|---|
| Install smoke | `v3/@claude-flow/memory/scripts/smoke-no-bsqlite.mjs` | `smoke-install-no-bsqlite` (`v3-ci.yml`) |
| Hook smoke | `plugins/ruflo-core/scripts/test-hooks.mjs` | `plugin-hooks-smoke` (`v3-ci.yml`) |

**Install smoke** — packs `@claude-flow/memory`, installs the tarball into `/tmp/smoke` with `--omit=optional` (simulates "native better-sqlite3 build failed" on Node 26 without prebuilds), asserts the package loads, runtime auto-falls-back to RVF/sql.js, round-trip works. Catches *any* form of "install fails when an optional native dep can't build."

**Hook smoke** — reads each PostToolUse hook from `plugins/ruflo-core/hooks/hooks.json`, pipes synthetic Claude-Code-style JSON to it, asserts both exit code 0 *and* that the recorded value matches the input. Negative assertions like `expect(stdout).not.toContain('Recording outcome for: true')` are critical — a naive `contains: 'true'` test would have spuriously passed against the broken CLI because the recorded value happened to be `"true"`.

See **ADR-102** (`v3/docs/adr/ADR-102-plugin-hook-cli-flag-regression-ci-guard.md`) for the full smoke-harness design + flag-priority CLI convention.

---

## Layer 2 — Cryptographic witness manifest

Every documented fix gets an entry containing the file path, a SHA-256 of that file at issuance, and a *marker substring* that must remain in the file while the fix is present. The whole manifest is hashed (SHA-256) and signed (Ed25519) using a deterministic seed derived from the git commit, so the public key can be re-derived without a committed private key.

| File | Purpose |
|---|---|
| `verification.md.json` | The signed manifest itself |
| `verification.md` | Human-readable witness documentation |
| `witness-fixes.json` | Project-specific NEW_FIXES list (input to regen) |

### How verification works

```bash
# Anyone with the same git commit can re-derive the public key
GITSHA=$(jq -r '.manifest.gitCommit' verification.md.json)
SEED=$(echo -n "$GITSHA:ruflo-witness/v1" | sha256sum | head -c 64)
# Then check Ed25519 signature against manifestHash with that key
```

For each fix entry, the verifier computes:

- **Pass** — file's SHA-256 matches manifest entry exactly
- **Drift** — file SHA-256 changed but the marker is still present (acceptable — codebase advanced)
- **Regressed** — the marker is *missing* from the file (real regression)
- **Missing** — the cited file no longer exists

CI gates publish on `regressed === 0 && signatureValid`.

### Why marker substrings, not just SHA-256

A SHA-256-only check would flag every benign whitespace change as a regression. The marker is the *semantic* invariant — "the fix is the presence of this specific substring." If a developer refactors the file but preserves the fix, marker stays present, drift is recorded, no false alarm. If a developer deletes the fix, marker disappears, regression is caught.

Choosing markers is the load-bearing skill. Bad markers: `'function'`, `'TODO'`. Good markers: `(await import('better-sqlite3')).default`, `import * as bcrypt from 'bcryptjs'`, `(ctx.flags.file as string) || ctx.args[0]`.

---

## Layer 3 — Append-only temporal history

Every regen of the witness appends one line to `verification-history.jsonl`. Queries against the history answer:

- *When* a regression was introduced (which commit window)
- *What* fixes have flapped between pass and regressed (likely a brittle marker)
- *Which* fixes are persistently drifting (probably an unstable file)

### Entry shape

```jsonc
{
  "v": 1,
  "commit": "...",
  "issuedAt": "2026-05-09T01:00:47.879Z",
  "branch": "main",
  "manifestHash": "...",
  "summary": { "totalFixes": 82, "verified": 82, "missing": 0 },
  "fixes": {
    "#1867": { "sha256": "...", "markerVerified": true },
    "F1":    { "sha256": "...", "markerVerified": true }
  }
}
```

### Regression-introduction queries

```bash
# For each currently-regressed fix, find the commit that introduced it
node plugins/ruflo-core/scripts/witness/history.mjs \
  --history verification-history.jsonl regressions
# Output:
#   F12
#     last pass:    a1b2c3d4  2026-05-07T14:23:11.000Z
#     regressed at: 9f8e7d6c  2026-05-08T09:14:55.000Z
```

`git log lastPass..regressedAt -- <file>` then collapses triage from "git bisect across many commits" to "read the diff for the few in this window."

See **ADR-103** (`v3/docs/adr/ADR-103-witness-temporal-history.md`) for the full design + plugin-distributed toolkit.

---

## Toolkit

All scripts live in `plugins/ruflo-core/scripts/witness/`. Project-agnostic — the only runtime dep is `@noble/ed25519`. Adopt by copying the directory into your repo.

| File | Purpose |
|---|---|
| `lib.mjs` | Shared regen + history primitives |
| `init.mjs` | Bootstrap empty manifest + history + fix template |
| `regen.mjs` | Sign manifest + append history |
| `verify.mjs` | Validate signature + markers (no CLI dep) |
| `history.mjs` | Query temporal log: `summary`, `regressions`, `timeline`, `list` |

Plus surface area for Claude Code:

| File | Purpose |
|---|---|
| `plugins/ruflo-core/skills/witness/SKILL.md` | Workflow guide + anti-patterns |
| `plugins/ruflo-core/commands/witness.md` | Slash command |
| `plugins/ruflo-core/agents/witness-curator.md` | Agent for adding fixes / interpreting regressions |

---

## Usage

### Bootstrap (any project)

```bash
node plugins/ruflo-core/scripts/witness/init.mjs --root .

# Edit witness-fixes.json: add { id, desc, file, marker } per fix
npm i @noble/ed25519

node plugins/ruflo-core/scripts/witness/regen.mjs \
  --manifest verification.md.json \
  --history  verification-history.jsonl \
  --fixes    witness-fixes.json
```

### Register a fix when shipping a release

1. Identify a distinctive marker substring that will be present while the fix is in the file. Use a unique pattern from the diff, not generic words.
2. Append `{ id, desc, file, marker }` to `witness-fixes.json`.
3. Run `regen.mjs --dry-run` to confirm `verified: N/N`.
4. Run without `--dry-run` to write the manifest + append history.
5. Commit `verification.md.json`, `verification-history.jsonl`, and `witness-fixes.json` together.

In ruflo: `node scripts/regen-witness.mjs` is a thin wrapper that hard-codes ruflo's paths.

### Investigate a regression

```bash
# CI says F12 regressed. Which commit introduced it?
node plugins/ruflo-core/scripts/witness/history.mjs \
  --history verification-history.jsonl regressions

# Triage with git
git log lastPassCommit..regressedAtCommit -- $(jq -r '.manifest.fixes[] | select(.id == "F12") | .file' verification.md.json)
```

---

## CI Integration Pitfalls

These are the specific traps that hit ruflo's GitHub Actions during the 2026-05-08 work and that adopters will hit too. The fixes are small once you know to look for them; the failure modes are subtle when you don't.

### 1. pnpm isolated linker hides `@noble/ed25519`

`verify.mjs` loads `@noble/ed25519` via `createRequire`. With pnpm's default *isolated* node-linker, transitive deps don't hoist to the workspace root unless a workspace member declares them directly. Locally you might have a flat copy at `<root>/node_modules` from an earlier `npm install` and never notice. In CI, fresh pnpm-only install — and the probe fails silently into `signatureValid: false`.

**Fix:** `verify.mjs` and `lib.mjs` probe paths now include the workspace packages that *do* declare `@noble/ed25519` directly. In ruflo:

```js
const probes = [
  repoRoot,
  join(repoRoot, 'v3'),
  join(repoRoot, 'v3/@claude-flow/cli'),                         // declares ed25519
  join(repoRoot, 'v3/@claude-flow/plugin-agent-federation'),     // declares ed25519
];
```

For other projects, edit the array to match wherever `@noble/ed25519` is a direct dep.

### 2. Don't dogfood the CLI in CI's witness-verify step

There are two ways to invoke the verifier: the bundled CLI subcommand (`ruflo verify`) and the standalone plugin script (`plugins/ruflo-core/scripts/witness/verify.mjs`). They produce identical output.

**Use the standalone in CI.** The CLI binary may transitively load native modules (`sharp`, `onnxruntime-node`). pnpm v8 doesn't run native postinstall scripts by default, so prebuilds aren't fetched and the CLI fails on first import — long before reaching the verify code. The standalone has zero deps beyond `@noble/ed25519`.

```yaml
# Don't do this in CI — pulls in CLI's native deps
- run: node bin/cli.js verify --manifest verification.md.json

# Do this — pure-JS, only @noble/ed25519
- run: node plugins/ruflo-core/scripts/witness/verify.mjs --manifest verification.md.json --json
```

### 3. `npm pack` chokes on `workspace:*` deps

If the smoke job packs a workspace package and installs the tarball with `--omit=optional` to simulate a Node version without prebuilds, `npm` rejects `workspace:*` protocol entries with `EUNSUPPORTEDPROTOCOL`.

**Fix:** use `pnpm pack` instead — it rewrites `workspace:*` to resolved versions.

```yaml
- name: Pack memory tarball (pnpm rewrites workspace:* → versions)
  working-directory: v3/@claude-flow/memory
  run: |
    TARBALL=$(pnpm pack --pack-destination /tmp 2>&1 | grep -E "\.tgz$" | head -1)
    echo "tarball=$TARBALL" >> "$GITHUB_OUTPUT"
```

### 4. Always print the verify output, never trust silent exit codes

`set -e` (the GitHub Actions default for `run:` blocks) kills the bash script the instant `verify.mjs` returns non-zero — *before* any diagnostic node block runs. Result: a 65ms job failure with no log output, and you have no idea which fix regressed or whether the signature even loaded.

**Fix:** wrap the verify call in `set +e ... set -e`, capture both streams, analyze unconditionally:

```yaml
- name: Verify witness manifest
  run: |
    set +e
    node plugins/ruflo-core/scripts/witness/verify.mjs \
      --manifest verification.md.json \
      --json > /tmp/witness-result.json 2> /tmp/witness-result.err
    VERIFY_EXIT=$?
    set -e
    echo "--- verify.mjs exit code: $VERIFY_EXIT ---"
    echo "--- stderr ---"
    cat /tmp/witness-result.err || true
    echo "--- summary ---"
    node -e "
      const fs = require('fs');
      const raw = fs.readFileSync('/tmp/witness-result.json', 'utf8');
      if (!raw.trim()) { console.error('verify.mjs produced no JSON output'); process.exit(1); }
      const r = JSON.parse(raw);
      console.log(JSON.stringify({signature: r.signature, summary: r.summary}, null, 2));
      const failures = (r.results || []).filter(x => x.status !== 'pass' && x.status !== 'drift');
      if (failures.length) {
        console.error('non-pass fixes:');
        for (const f of failures) console.error('  ' + f.status + ': ' + f.id + ' (' + f.file + ')');
      }
      if (!r.ok) { console.error('witness verify FAILED'); process.exit(1); }
      if (r.summary.regressed > 0) { console.error('regressed fixes:', r.summary.regressed); process.exit(1); }
      console.log('witness verify ok:', r.summary.pass, 'pass,', r.summary.drift, 'drift');
    "
```

This costs nothing on the green path and gives you a concrete failure cause on the red path.

---

## Capabilities matrix

| Failure class | Layer | Example |
|---|---|---|
| Install fails on platform without prebuilds | Layer 1 (install smoke) | `npm install` errors out during native build |
| Wrong CLI flag handling, parser ambiguity | Layer 1 (subprocess smoke) | `--flag value` records the wrong value |
| Plugin calls flag the CLI doesn't have | Layer 1 (subprocess smoke) | Hook prints `Invalid value for --format: true` |
| Documented fix silently removed | Layer 2 (witness markers) | Refactor deletes the load-bearing line, code still compiles |
| Fix regressed: which commit? | Layer 3 (history) | `git bisect` reduced to 3 commits in 18-hour window |
| Marker too brittle, flaps pass↔regressed | Layer 3 (history) | Status timeline shows oscillation |

---

## Adoption notes

- **No CLI required for adopters.** The standalone scripts depend only on `@noble/ed25519` (~15KB minified). Copy `plugins/ruflo-core/scripts/witness/` into your project, install one package, run.
- **JSONL is committed, not gitignored.** Without committed history, you lose Layer 3 entirely.
- **Markers are the load-bearing skill.** Generic markers false-positive; brittle markers flap. Aim for unique patterns specific to the fix mechanism.
- **The two layers complement each other.** Behavioral smoke catches things you wrote a test for. Witness catches things you didn't. Don't pick one.

---

## References

- [verification.md](../../verification.md) — the witness manifest itself + how-to-verify
- [verification.md.json](../../verification.md.json) — current signed manifest (82 fixes)
- [verification-history.jsonl](../../verification-history.jsonl) — temporal log
- [witness-fixes.json](../../witness-fixes.json) — ruflo's project-specific NEW_FIXES
- [ADR-102](../../v3/docs/adr/ADR-102-plugin-hook-cli-flag-regression-ci-guard.md) — smoke harness pattern + flag-priority convention
- [ADR-103](../../v3/docs/adr/ADR-103-witness-temporal-history.md) — JSONL history layer + plugin distribution
- [Public gist](https://gist.github.com/ruvnet/ee7763c36f7a9a1c1886da783abc872b) — external-friendly version
- [.github/workflows/v3-ci.yml](../../.github/workflows/v3-ci.yml) — `smoke-install-no-bsqlite`, `plugin-hooks-smoke`, `witness-verify` jobs
