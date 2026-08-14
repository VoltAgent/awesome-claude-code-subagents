# Ruflo Verification System

A cross-platform, cryptographically-signed regression-protection toolkit. Every documented fix in ruflo gets attested by a SHA-256 + marker substring + Ed25519 signature. Anyone with the same git commit can re-derive the public key and verify it independently.

> **Three-layer regression protection:**
> 1. **Behavioral smoke tests** (CI) — exercise user-visible failure modes
> 2. **Cryptographic witness manifest** (this folder) — attest fix presence
> 3. **Temporal history** (`<os>/history.jsonl`) — bisect when a regression was introduced
>
> See [docs/validation/README.md](../docs/validation/README.md) for the full architecture, [ADR-102](../v3/docs/adr/ADR-102-plugin-hook-cli-flag-regression-ci-guard.md) for the smoke-harness pattern, and [ADR-103](../v3/docs/adr/ADR-103-witness-temporal-history.md) for the temporal-history layer.

---

## Why this exists

Three regressions filed on 2026-05-08 (#1859, #1862, #1867) all passed unit tests on the broken commits but broke for users on first install. Unit tests verify code paths; users hit subprocess flag parsers, fresh `npm install` resolution, plugin/CLI version drift. **The witness layer attests that every documented fix's load-bearing code is still present** — even when the fix has no dedicated smoke test.

A regression that deletes the load-bearing line of a fix flips its `markerVerified` to `false`. The CI's `witness-verify` job blocks publish.

---

## Folder layout

```
verification/
  README.md                  ← you are here
  witness-fixes.json         ← input config (OS-independent)
  mcp-tool-baseline.json     ← ADR-112 — monotone-decreasing tool-discoverability baseline
  results.md                 ← human-readable last-run report
  inventory.json             ← reserved for capability inventory
  linux/
    manifest.md.json         ← signed by Linux CI runner
    history.jsonl            ← Linux temporal log
  macos/
    manifest.md.json         ← signed by macOS CI runner
    history.jsonl            ← macOS temporal log
  windows/
    manifest.md.json         ← signed by Windows CI runner
    history.jsonl            ← Windows temporal log
```

**Why per-OS?** File hashes drift across platforms (LF vs CRLF normalization, path separators, prebuilt binary differences). Each OS produces its own truthful snapshot. The `witness-verify` CI job runs once per OS and writes/verifies that OS's bundle, catching platform-specific marker drift before it reaches users on that platform.

**Why JSONL inside each OS folder?** The witness use case is structured key-value retrieval (snapshot N's commit + fix statuses), not vector similarity search. JSONL is git-diff-friendly, append-cheap, and human-readable — the better fit. The folder layout adopts the RVF-style cognitive container concept (per-OS bundle of manifest + history + metadata); the file format inside is JSONL.

---

## Tutorial — adopt the witness in your own project

### 1. Bootstrap

The witness toolkit lives in `plugins/ruflo-core/scripts/witness/` — copy it into your project (or install the ruflo-core plugin).

```bash
# Initialize per-OS folders + sample fix template
node plugins/ruflo-core/scripts/witness/init.mjs --root .

# Single runtime dependency
npm i @noble/ed25519
```

Outputs:

```
verification/
  witness-fixes.json     # template — edit with your fixes
  <os>/
    manifest.md.json     # empty seed
    history.jsonl        # empty seed
```

### 2. Register your first fix

Open `verification/witness-fixes.json`:

```json
{
  "fixes": [
    {
      "id": "MY-001",
      "desc": "Race condition in token refresh — early-return on in-flight refresh",
      "file": "dist/auth.js",
      "marker": "if (this._refreshing) return this._refreshing;"
    }
  ]
}
```

**Choosing a marker** is the load-bearing skill:

| Bad marker | Why it fails |
|---|---|
| `'function'` | False-positives in any file with a function |
| `'TODO'` | Flaps as TODOs come and go |
| `'fix'` | Too generic |

| Good marker | Why it works |
|---|---|
| `(await import('better-sqlite3')).default` | Distinctive AND specific to the fix mechanism |
| `(ctx.flags.file as string) \|\| ctx.args[0]` | The exact swap that fixes the bug |
| `import * as bcrypt from 'bcryptjs'` | Proves the bcrypt → bcryptjs migration is in dist |

Pick a unique substring from the diff that's specifically created by the fix.

### 3. Generate the signed manifest

In ruflo's monorepo there's a wrapper that hard-codes paths:

```bash
node scripts/regen-witness.mjs
```

For external projects, call the plugin script with explicit paths:

```bash
node plugins/ruflo-core/scripts/witness/regen.mjs \
  --manifest verification/macos/manifest.md.json \
  --history  verification/macos/history.jsonl \
  --fixes    verification/witness-fixes.json
```

Output:

```
witness regen summary
─────────────────────
  gitCommit:    abc123def456…
  branch:       main
  issuedAt:     2026-05-09T00:00:00.000Z
  total fixes:  1  (was 0)
  verified:     1
  missing:      0
  new entries:  MY-001
written:  verification/macos/manifest.md.json
appended: verification/macos/history.jsonl
```

`verified: N/N` confirms every marker is present in its cited file.

### 4. Verify

```bash
node plugins/ruflo-core/scripts/witness/verify.mjs \
  --manifest verification/macos/manifest.md.json
```

Output:

```
Manifest signature:
  hash matches:                    yes
  public key reproducible:         yes
  Ed25519 signature valid:         yes

Summary: pass=1 drift=0 regressed=0 missing=0
```

If `regressed > 0` or `signatureValid: no`, the manifest has been tampered with or a documented fix's marker has been deleted.

### 5. Investigate a regression

When CI reports `F12 regressed`:

```bash
node plugins/ruflo-core/scripts/witness/history.mjs \
  --history verification/macos/history.jsonl regressions
```

Output:

```
F12
  last pass:    a1b2c3d4  2026-05-07T14:23:11.000Z
  regressed at: 9f8e7d6c  2026-05-08T09:14:55.000Z
```

Then `git log lastPass..regressedAt -- <file>` collapses bisect from "many commits" to "the few in this 18-hour window."

### 6. Wire into CI

Add to `.github/workflows/<your-pipeline>.yml`:

```yaml
witness-verify:
  strategy:
    matrix:
      os: [ubuntu-latest, macos-latest, windows-latest]
  runs-on: ${{ matrix.os }}
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '22' }
    - run: npm i @noble/ed25519
    - shell: bash
      run: |
        case "$RUNNER_OS" in
          Linux)   OS_DIR=linux ;;
          macOS)   OS_DIR=macos ;;
          Windows) OS_DIR=windows ;;
        esac
        node plugins/ruflo-core/scripts/witness/verify.mjs \
          --manifest "verification/$OS_DIR/manifest.md.json" \
          --json > /tmp/result.json
        node -e "if (!require('/tmp/result.json').ok) process.exit(1)"
```

Block publish on failure. Every commit on every OS gets attested.

---

## Features

| Feature | Mechanism | What it catches |
|---|---|---|
| **SHA-256 fingerprint per fix** | Per-file hash recorded at issuance | Any change to the file |
| **Marker substring** | Distinctive code substring required to be present | Refactors that delete the fix |
| **Ed25519 signature** | Deterministic seed `sha256(gitCommit + ':ruflo-witness/v1')` | Manifest tampering, key-derivation drift |
| **Reproducible public key** | Anyone with the git commit re-derives the same pubkey | No committed private key needed |
| **Per-OS bundles** | `verification/{linux,macos,windows}/` | Platform-specific marker drift (CRLF, path separators) |
| **Temporal history (JSONL)** | One snapshot appended per regen | When a regression was introduced |
| **Drift vs regression** | sha256 changed but marker present → drift; marker missing → regression | False alarms suppressed; real regressions flagged |
| **Status timeline per fix** | `history.mjs timeline --id F12` | Flapping markers (too brittle) and persistent drift (too unstable) |

---

## Daily workflow cheat sheet

```bash
# Add a new fix
$EDITOR verification/witness-fixes.json
node scripts/regen-witness.mjs

# Verify the current tree
node plugins/ruflo-core/scripts/witness/verify.mjs \
  --manifest verification/macos/manifest.md.json

# Diff against the previous snapshot
node plugins/ruflo-core/scripts/witness/history.mjs \
  --history verification/macos/history.jsonl summary

# Find when a regression was introduced
node plugins/ruflo-core/scripts/witness/history.mjs \
  --history verification/macos/history.jsonl regressions

# Status timeline for one fix
node plugins/ruflo-core/scripts/witness/history.mjs \
  --history verification/macos/history.jsonl timeline --id F12
```

---

## Schema

### `<os>/manifest.md.json`

```jsonc
{
  "manifest": {
    "schema": "ruflo-witness/v1",
    "issuedAt": "2026-05-09T00:00:00.000Z",
    "gitCommit": "<full sha>",
    "branch": "main",
    "os": "macos",                              // matches the folder
    "releases": { "ruflo": "3.7.0-alpha.21", "@claude-flow/plugin-agent-federation": "1.0.0-alpha.15" },
    "summary": { "totalFixes": 102, "verified": 102, "missing": 0 },
    "fixes": [
      {
        "id": "F1",
        "desc": "...",
        "file": "v3/@claude-flow/cli/dist/...",
        "sha256": "<64 hex>",
        "marker": "<distinctive substring>",
        "markerVerified": true
      }
    ]
  },
  "integrity": {
    "manifestHashAlgo": "sha256",
    "manifestHash": "<64 hex of canonical manifest>",
    "signature": "<64-byte hex of Ed25519 signature over canonical manifest>",
    "signatureAlgo": "ed25519",
    "publicKey": "<32-byte hex>",
    "signature": "<64-byte hex>",
    "seedDerivation": "sha256(gitCommit + ':ruflo-witness/v1')"
  }
}
```

### `<os>/history.jsonl` (one entry per line)

```jsonc
{
  "v": 1,
  "commit": "<full sha>",
  "issuedAt": "2026-05-09T00:00:00.000Z",
  "branch": "main",
  "os": "macos",
  "manifestHash": "<hex>",
  "summary": { "totalFixes": 82, "verified": 82, "missing": 0 },
  "fixes": {
    "F1":     { "sha256": "...", "markerVerified": true },
    "#1867":  { "sha256": "...", "markerVerified": true }
  }
}
```

### `witness-fixes.json` (input, OS-independent)

```jsonc
{
  "fixes": [
    {
      "id": "MY-001",
      "desc": "human-readable description",
      "file": "path/relative/to/repo/root.js",
      "marker": "distinctive substring that must remain in the file"
    }
  ]
}
```

---

## Anti-patterns

- **Hand-editing `manifest.md.json`** — breaks the signature. Always regenerate via `regen.mjs`.
- **Markers that match generic patterns** (`'function'`, `'import'`, `'TODO'`) — false positives or flapping.
- **Skipping the history append** — without `--history`, you lose Layer 3 (regression introduction time).
- **Committing the manifest without the history** — they belong in the same commit.
- **Cross-OS manifest editing** — the manifest is signed for the OS that generated it. Don't copy a Linux manifest into the macOS folder.

---

## How it integrates with the rest of ruflo's regression stack

| Layer | Where | What it catches |
|---|---|---|
| Layer 1 — install smoke | `v3/@claude-flow/memory/scripts/smoke-no-bsqlite.mjs` + CI `smoke-install-no-bsqlite` | `npm install` failures on platforms without prebuilds |
| Layer 1 — hook smoke | `plugins/ruflo-core/scripts/test-hooks.mjs` + CI `plugin-hooks-smoke` | Plugin/CLI flag drift, parser ambiguity |
| Layer 1 — MCP protocol smoke | `plugins/ruflo-core/scripts/test-mcp-protocol.mjs` + CI `mcp-protocol-smoke` | HTTP MCP wire-format compliance |
| Layer 1 — memory-import smoke | `plugins/ruflo-core/scripts/test-memory-import.mjs` + CI `memory-import-smoke` | Memory_import_claude WSL path + key sanitization regressions |
| Layer 1 — tool-description audit | `scripts/audit-tool-descriptions.mjs` + CI `tool-descriptions-audit` (ADR-112) | Every MCP tool description must have "Use when … is wrong because …" guidance + length ≥ 80 + unique. Baseline at `verification/mcp-tool-baseline.json` monotone-decreasing |
| **Layer 2 — witness manifest** | **`verification/<os>/manifest.md.json`** + CI `witness-verify` | **Documented fix marker disappearing** |
| Layer 3 — temporal history | `verification/<os>/history.jsonl` + `history.mjs` | When a regression was introduced |

All CI jobs gate `publish`. A regression in any layer blocks the release on the platform where it was caught.

---

## References

- [docs/validation/README.md](../docs/validation/README.md) — full architecture overview (in-repo)
- [Public gist](https://gist.github.com/ruvnet/ee7763c36f7a9a1c1886da783abc872b) — external-friendly version
- [ADR-102](../v3/docs/adr/ADR-102-plugin-hook-cli-flag-regression-ci-guard.md) — smoke harness pattern + flag-priority CLI convention
- [ADR-103](../v3/docs/adr/ADR-103-witness-temporal-history.md) — JSONL history layer + plugin distribution
- [`plugins/ruflo-core/skills/witness/SKILL.md`](../plugins/ruflo-core/skills/witness/SKILL.md) — Claude Code skill workflow
- [`plugins/ruflo-core/agents/witness-curator.md`](../plugins/ruflo-core/agents/witness-curator.md) — curator agent definition
- [`.github/workflows/v3-ci.yml`](../.github/workflows/v3-ci.yml) — `smoke-install-no-bsqlite`, `plugin-hooks-smoke`, `witness-verify` jobs
