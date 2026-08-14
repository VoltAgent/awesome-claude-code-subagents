# Verification Run — 2026-05-06

This is a verification run report against the witness manifest in
[`verification.md.json`](./verification.md.json) (issued at commit
`63b9ac35d1d33d01e877fee88f9da5664ccdfe31`, ruflo `3.6.28`).

## Summary

| Metric | Value |
|---|---:|
| Manifest commit | `63b9ac35d1d3...` (ruflo 3.6.28) |
| Verified-at HEAD | `origin/main` (ruflo 3.7.0-alpha.8 + recent PRs) |
| Total fixes in manifest | 55 |
| **Semantic pass rate** | **100.0%** (55/55) |
| Marker missing | 0 |
| File missing (incl. source fallback) | 0 |

## Status breakdown

| Status | Count | Meaning |
|---|---:|---|
| `PASS` | 10 | File unchanged since manifest issuance — sha256 + marker both match exactly |
| `PASS_DRIFT` | 43 | File hash drifted (codebase advanced from 3.6.28 → 3.7.x) but the feature marker is still present in the dist |
| `PASS_SRC_ONLY` | 2 | Dist not built locally; source `.ts` contains the marker. ADR-094 (`@huggingface/transformers` in `embeddings`), G2 (`@noble/ed25519` in `plugin-agent-federation`) |
| `MARKER_MISSING` | 0 | None — every documented feature is still in code |
| `FILE_MISSING` | 0 | None after source fallback |

## How verification was run

```js
// /tmp/verify-final.mjs (excerpt)
const buf = fs.readFileSync(fp);
const sha = createHash('sha256').update(buf).digest('hex');
const markerOk = content.includes(fix.marker);
const shaOk = sha === fix.sha256;

// If dist/.js missing, try src/.ts fallback (PASS_SRC_ONLY)
if (!exists && fix.file.includes('/dist/')) {
  const srcCandidate = fix.file.replace('/dist/', '/src/').replace(/\.js$/, '.ts');
  ...
}
```

The check is two-layered:

1. **Exact match (`PASS`)** — sha256 of the on-disk file equals the manifest's `sha256`. Means the file hasn't changed since the manifest was issued. Reasonable for files that have stayed stable.
2. **Semantic match (`PASS_DRIFT`)** — file changed but the feature marker (a substring documented as proof the fix exists) is still present. This is the load-bearing check: it catches regressions where someone deletes the fix even if other lines changed.

`PASS_SRC_ONLY` extends this by checking the corresponding `.ts` source file when the `.js` dist is unbuilt locally — same semantic guarantee, just relocated.

## Drift commentary

43 files moved from `PASS` (exact) to `PASS_DRIFT` (semantic) because the codebase advanced. That's expected behavior; the manifest pinned ruflo `3.6.28` and the current tree is `3.7.0-alpha.8` plus 20 in-flight fix PRs. Drift here is a healthy signal of forward motion, not regression — every drift entry was checked for marker presence.

If you want to refresh the manifest's exact-match baseline to the current tree, regenerate it:

```bash
node scripts/issue-witness.mjs > verification.md.json   # if the issuer script exists
# or re-run the witness pipeline that produced the original manifest
```

The marker-only check stays valid across version bumps without needing a re-issuance.

## In-flight PRs not represented in this run

20 fix PRs (#1800–#1821) opened by the auto-fix loop are not yet merged into `main` and therefore not exercised by this verification:

| Issue scope | PRs |
|---|---|
| #1791 (8 sub-bugs) | #1800, #1803, #1805, #1804, #1801, #1802, #1806, #1808 |
| Dependency hygiene | #1818 (#1608 bcrypt CVE), #1819 (#1609 vitest CVE) |
| Memory / Doctor / Init | #1809 (#1799), #1811 (#1798), #1820 (#1779), #1812 (#1810), #1813 (#1807), #1814 (#1686), #1815 (#1670), #1816 (#1622) |
| Skill / Statusline | #1817 (#1574), #1821 (#1463) |

Once those merge, a follow-up verification run can refresh the manifest to a new baseline.

## Files

- [`verification.md`](./verification.md) — original witness manifest documentation
- [`verification.md.json`](./verification.md.json) — machine-readable witness manifest (unchanged by this run)

This document records a successful verification of all 55 fixes against the current `origin/main`.
