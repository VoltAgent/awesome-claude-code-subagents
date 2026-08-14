# Capabilities Historical Reference

Per-OS performance baseline + capability status. Tracks how key user-visible operations evolve across releases. Each measurement appends one line to `verification/<os>/performance.jsonl` so regressions are catchable the same way `manifest.md.json` catches a documented fix disappearing.

> See [README.md](README.md) for the witness manifest layer (presence). This doc covers the **performance** layer (speed) — they're complementary.

---

## What's tracked

Each entry in `verification/<os>/performance.jsonl` records one capability×measurement at one git commit:

```jsonc
{
  "v": 1,
  "commit": "<full sha>",
  "issuedAt": "2026-05-09T15:00:00.000Z",
  "os": "macos",
  "capability": "install_pack",
  "durationMs": 373,
  "baselineMs": 410,           // present when --baseline flag set
  "deltaPct": -9               // negative = faster than rolling median
}
```

## Capabilities

| Capability | What it measures | Why it matters |
|---|---|---|
| `install_pack` | Time for `pnpm pack @claude-flow/memory` | Catch regressions in package size / pack-time pipeline |
| `install_no_optional` | `npm install <tarball> --omit=optional` end-to-end | The user-visible "fresh install on a platform without prebuilds" — this is what was 152s on Node 26 before #1867 fix; now ~5s on a clean dir |
| `memory_load` | Cold `import('@claude-flow/memory')` in a fresh node process | Catches accidentally-eager imports of heavy native modules |
| `memory_round_trip` | `createDatabase(auto) → store → get → shutdown` | End-to-end runtime behaviour of the auto-fallback path |
| `witness_verify` | `verify.mjs --manifest <os>/manifest.md.json` | The witness verification itself — should stay sub-second even at 100+ fixes |

Add capabilities by extending the `runners` map in `plugins/ruflo-core/scripts/witness/perf.mjs`. The framework supports any synchronous benchmark that throws on failure.

---

## Reference baselines (macOS, M-class hardware, Node 22.22.1, post-warmup)

Recorded 2026-05-09 against commit `5372f83`. Treat as "should not regress beyond ~3×" — anything larger is signal.

| Capability | Median ms | P95 ms | Notes |
|---|---:|---:|---|
| `install_pack` | 370 | 450 | pnpm-pack pipeline; rewrites workspace:* → resolved versions |
| `install_no_optional` | ~5,000 | 8,000 | Network-bound (npm registry); flaps with cache state |
| `memory_load` | 18 | 35 | Cold module load; sub-50ms = no eager native imports |
| `memory_round_trip` | ~80 | 120 | Backend selection + RVF fallback + open + write + read + close |
| `witness_verify` | 53 | 90 | 82 markers × file read + sha256; @noble/ed25519 sig verify |

Linux + Windows baselines populate as CI runs the perf job on those runners. Median across the rolling-5 window is the comparison baseline; a single slow run doesn't trigger a regression.

---

## Historical reference for key incidents

### #1867 — Node 26 install failure (2026-05-08)

| Phase | install_no_optional (median ms) | Notes |
|---|---:|---|
| Pre-fix (3.7.0-alpha.17) | **fails** | `node-gyp` cannot rebuild `better-sqlite3@^11` on Node 26; install never completes |
| Post-fix (3.7.0-alpha.18+) | ~5,000 | `better-sqlite3` moved to `optionalDependencies`; `--omit=optional` makes it skipable; runtime falls back to RVF/sql.js |

Captured in `verification.md.json` fix `#1867` (marker: `(await import('better-sqlite3')).default` — guards against re-introduction of a static import).

### #1859 + #1862 — Plugin/CLI flag drift (2026-05-08)

| Phase | hooks/post-edit handler | Result |
|---|---|---|
| Pre-fix | `cat | jq | tr | xargs -0 -I {} npx ... post-edit --file '{}' --format true` | `[ERROR] Invalid value for --format: true` on every Edit/Write |
| Post-fix | `bash -c '...; npx ... post-edit -f "$FILE" -s true'` | Records correct file path |

Captured in `verification.md.json` fixes `#1862` (marker: `hooks post-edit -f \"$FILE\" -s true`) and `#1859` (CLI parser swap, marker: `ctx.flags.file || ctx.args[0]`).

### #1608 — bcrypt → bcryptjs migration (PR #1818)

| Phase | dependencies | Notes |
|---|---|---|
| Pre-migration | `bcrypt@6.0.0` (native, brings tar CVE chain) | 6 HIGH CVEs in transitive `tar` |
| Post-migration | `bcryptjs@^3.0.3` (pure-JS) | No native dep, no tar; same `$2a$` hash compatibility |

Captured in `verification.md.json` fix `#1608` (marker: `bcryptjs`). Briefly regressed in early sessions (dist not rebuilt against migrated source); witness-verify caught it as `markerVerified: false` and a rebuild restored it to `pass`.

### Memory backend fallback chain (ADR-009)

Auto-selection priority (highest first, falls through on failure):

1. **RVF** — pure-TS HNSW; always available. Default in CI.
2. **better-sqlite3** — native SQLite; fastest. Available when prebuild is fetched.
3. **sql.js** — WASM SQLite. Pure-JS fallback for restricted environments.
4. **JSON** — last-ditch flat file. Never used in practice.

Verified by `memory_round_trip` capability — the round-trip succeeds on whichever backend was selected, so a regression in fallback selection shows as a runtime error on platforms where the preferred backend is unavailable.

---

## Daily workflow

```bash
# Run all benchmarks now and append to verification/<os>/performance.jsonl
node plugins/ruflo-core/scripts/witness/perf.mjs

# Run with baseline comparison (median of last 5 entries per capability)
node plugins/ruflo-core/scripts/witness/perf.mjs --baseline

# Run a subset
node plugins/ruflo-core/scripts/witness/perf.mjs \
  --capabilities install_pack,memory_load \
  --json
```

For CI, gate on regressions exceeding a threshold:

```yaml
- name: Performance verification
  run: |
    node plugins/ruflo-core/scripts/witness/perf.mjs --baseline --json > /tmp/perf.json
    node -e "
      const r = require('/tmp/perf.json');
      const regressed = r.results.filter(x => x.deltaPct != null && x.deltaPct > 200);
      if (regressed.length) {
        console.error('regressions (>200% slower than baseline):');
        for (const x of regressed) console.error(\`  \${x.capability}: \${x.durationMs}ms vs \${x.baselineMs}ms baseline\`);
        process.exit(1);
      }
    "
```

---

## What's not tracked yet (and why)

- **HNSW search latency** — depends on dataset size; needs a fixture, follow-up.
- **CLI startup time** — `ruflo --version` is the obvious metric, but currently dominated by node startup + module graph; not stable enough as a regression signal until the cli-core split (PR #1764) lands.
- **Memory growth over long-running processes** — needs an instrumented harness; out of scope for snapshot-style verification.

---

## Schema

### `verification/<os>/performance.jsonl` (one entry per line)

```jsonc
{
  "v": 1,                     // schema version
  "commit": "<full sha>",
  "issuedAt": "<ISO timestamp>",
  "os": "linux" | "macos" | "windows",
  "capability": "<runner name>",
  "durationMs": 373,          // null if measurement errored
  "error": "...",             // present iff measurement errored
  "metadata": { /* free-form per-capability */ },
  "baselineMs": 410,          // optional; present when --baseline used
  "deltaPct": -9              // optional; (durationMs - baselineMs) / baselineMs * 100
}
```

The file is append-only and OS-specific. Cross-OS comparison happens by reading the three files and joining on capability — different OSes have different native code paths, so absolute numbers don't compare directly, but **trends do**.

---

## References

- [README.md](README.md) — the witness manifest layer (fix presence)
- [witness-fixes.json](witness-fixes.json) — fix list (input to manifest regen)
- [results.md](results.md) — last verification run report
- [`plugins/ruflo-core/scripts/witness/perf.mjs`](../plugins/ruflo-core/scripts/witness/perf.mjs) — benchmark runner
- [ADR-103](../v3/docs/adr/ADR-103-witness-temporal-history.md) — temporal history pattern (presence) that perf.mjs mirrors for measurements
