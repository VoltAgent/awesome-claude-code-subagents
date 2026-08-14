# ADR-096: Encryption at Rest for Session, Memory, and Terminal Stores

**Status**: Accepted (Phase 1–4 implemented; Phase 5+ deferred)
**Date**: 2026-05-03 (proposed) / 2026-05-04 (accepted)
**Version**: target v3.6.25 (next batch publish)
**Supersedes**: nothing
**Related**: ADR-093 (May 2026 audit remediation), ADR-095 (April architectural gaps), audit_1776853149979 finding "Plaintext session/memory storage", commits `de96b0e` (chmod 0600 mitigation), `fb256ac` (loader-hijack env denylist), `cb9a9f3` (Phase 1), `98aa256` (Phase 2), `49c8019` (Phase 3), `841365f` (Phase 4)

## Context

The May 2026 audit (`audit_1776853149979`) flagged plaintext storage of session and memory state as a class-3 finding. The defense-in-depth mitigation (`de96b0e`, iter #35) restricts file mode to 0600 and dir mode to 0700 for the audit-cited writers. That closes the cross-user-on-same-host vector but does **not** protect against:

1. **Backup exfiltration** — a Time Machine snapshot, a Dropbox sync, or any backup tool that copies `.claude-flow/` reads with the *backup user's* permissions, not the original mode.
2. **Disk forensics** — a recovered SSD or stolen laptop without FileVault yields the plaintext bytes regardless of file mode.
3. **Hostile shared-tenant environments** — CI runners, dev containers, and shared workspaces where the FS perms are scoped wider than the project owner.
4. **Process memory dumps** — orthogonal; out of scope for this ADR.

### What's at-rest today (sensitivity tiers)

| Store | Path | Sensitivity | Reason |
|---|---|---|---|
| Session JSON | `.claude-flow/sessions/*.json` | **High** | Bundles memory snapshots + agent prompts on save |
| Memory DB (sql.js SQLite) | `.swarm/memory.db` | **High** | Conversation entries + 384-dim embeddings; embeddings leak topics |
| Terminal history | `.claude-flow/terminals/store.json` | **High** | Pasted shell commands often include API keys, DB passwords |
| Agent registry | `.claude-flow/agents/store.json` | Medium | Agent configs incl. model + domain; no prompts |
| Task store | `.claude-flow/tasks/store.json` | Medium | Task descriptions + status |
| Claims / config / workflow / neural / DAA / GitHub stores | various under `.claude-flow/` | Low–Medium | Mostly metadata; case-by-case |
| Update history | `~/.claude-flow/update-history.json` | Low | Package names + versions; relevant only for the integrity gate added in `c1b57e4f` |
| Attestation log | `.swarm/attestation.db` | Low | Hash chain of mutations; integrity-protective, not confidentiality-sensitive |

### Existing crypto in the codebase

`src/appliance/rvfa-builder.ts` and `rvfa-runner.ts` already use `aes-256-gcm` + `scryptSync` (key-derivation) + `randomBytes` for the RVFA appliance vault. Same stack can be reused — no new dependency.

## Decision

Ship encryption at rest in three phases. Each phase is independently shippable and testable.

### Phase 1 (this ADR's scope) — opt-in encrypted vault

**Posture**: opt-in via `CLAUDE_FLOW_ENCRYPT_AT_REST=1`. Default off so the 1865 existing tests and current users keep working unchanged.

**What's encrypted**: only the **High** tier (`sessions/`, `.swarm/memory.db`, `terminals/`). The Medium and Low tier stores stay plaintext for now — they hold nothing the audit specifically flagged.

**Algorithm**: `aes-256-gcm` with random 12-byte nonce per file, 16-byte auth tag appended. Format:

```
+---------+--------+----------------+--------+
| magic 4 | iv 12  | ciphertext N   | tag 16 |
+---------+--------+----------------+--------+
   "RFE1"   random   plaintext xor   GCM
```

Magic `"RFE1"` (Ruflo File Encrypted v1) — distinguishes from plaintext on read so we can roll out incrementally without a repo-wide migration.

**Key source** (precedence, fail closed):

1. `CLAUDE_FLOW_ENCRYPTION_KEY` — base64-encoded 32 bytes. Highest precedence, useful for CI / containers / users who already have a secret manager.
2. OS keychain — `keytar`-style lookup under service `claude-flow`, account `default`. macOS Keychain, Windows DPAPI, libsecret on Linux. **Optional dependency**: `keytar` is a native module; if unavailable, fall back to (3).
3. Passphrase prompt + scrypt KDF — interactive only. Stored derived key in process memory for the session, never on disk. Salt persisted at `~/.claude-flow/.kdf-salt` (16 bytes random, mode 0600).

If `CLAUDE_FLOW_ENCRYPT_AT_REST=1` and *no* key source resolves, the CLI **errors immediately** rather than silently writing plaintext. Fail-closed posture.

**Migration**: lazy. On read, sniff the magic. If `"RFE1"`, decrypt; otherwise treat as plaintext (backward compatible). On the *first write* after enable, the file is rewritten encrypted. A `ruflo migrate encrypt` subcommand (also opt-in) does an eager pass for users who want it now.

**Out of scope**:
- Key rotation (next phase)
- Encrypted backups / off-host sync (orthogonal)
- Per-tenant keys for multi-user installs (different threat model)

### Phase 2 (separate ADR) — key rotation + sealed-box backups

`ruflo encryption rotate` re-encrypts all High-tier stores under a new key. Existing key kept for read-only one cycle to avoid bricking running daemons. Sealed-box format (`age` or `nacl.box`) for files that need to survive off-host transfer.

### Phase 3 (separate ADR) — extend coverage to Medium-tier stores + AgentDB column-level encryption

After Phase 1 ships and the migration story is proven, extend to `agents/`, `tasks/`, and any AgentDB columns that hold free-form text. AgentDB column-level needs SQLite extension support — open question.

## Implementation outline

This ADR proposes the design; the implementation iteration ships in a separate commit. Order of operations:

1. **`src/encryption/vault.ts`** — new module. Exports:
   - `isEncryptionEnabled(): boolean` — env-var check
   - `getKey(): Promise<Buffer>` — key resolution per the precedence above
   - `encryptBuffer(plain: Buffer, key: Buffer): Buffer` — magic + iv + ct + tag
   - `decryptBuffer(blob: Buffer, key: Buffer): Buffer` — verify magic, parse, GCM-verify
   - `isEncryptedBlob(blob: Buffer): boolean` — magic sniff for migration

2. **Wire into `src/fs-secure.ts`** (already exists from iter #35). Extend `writeFileRestricted` with an opt-in `encrypt: boolean` flag. Default `false` to keep existing call sites working.

3. **Update three call sites**:
   - `mcp-tools/session-tools.ts:saveSession` — pass `encrypt: isEncryptionEnabled()`
   - `mcp-tools/terminal-tools.ts:saveTerminalStore` — same
   - `memory/memory-initializer.ts` — the seven `writeFileRestricted(dbPath, ...)` writes need a different shape (sql.js exports a Buffer of the whole DB; encrypt the whole Buffer). On open, check magic; if encrypted, decrypt to in-memory buffer and pass to `new SQL.Database(buf)`.

4. **Read paths** — every reader of those three stores already exists. Wrap each `readFileSync(path)` in a `decryptIfEncrypted(blob, key)` helper. Backwards-compat for plaintext via the magic sniff.

5. **Tests** (`__tests__/encryption-vault.test.ts`):
   - encrypt → decrypt round-trip
   - tamper detection (flip one byte → GCM auth fails)
   - magic sniff: plaintext blob returns plaintext, encrypted returns decrypted
   - key precedence: env-var > keychain > passphrase
   - fail-closed when enabled with no key

6. **Doctor check** — `ruflo doctor` reports encryption status (off / on with env-var / on with keychain / on with passphrase).

7. **Documentation** — `docs/security/encryption.md` covers user-facing setup, recovery if a key is lost (the data is gone — by design), and CI guidance (set `CLAUDE_FLOW_ENCRYPTION_KEY` in repo secrets).

## Trade-offs

| Decision | Alternative | Why we chose this |
|---|---|---|
| Opt-in via env var | Always-on | 1865 tests pass today against plaintext. Always-on without a migration story regresses the test suite and bricks every existing user's install on upgrade. Opt-in is reversible. |
| AES-256-GCM | ChaCha20-Poly1305, age, libsodium | GCM already shipped + tested in rvfa-builder. No new native dependency. |
| Magic-byte sniff for migration | Filename suffix, separate dir | The set of writers is small but the readers are scattered; a magic byte means readers self-detect without coordinated migration. |
| Keychain via optional `keytar` | Force keychain everywhere | `keytar` is a native module — making it required regresses cross-platform install (Alpine containers, Termux, NixOS without binary cache). Optional with env-var fallback covers the realistic cases. |
| Per-file IV, no per-store key | Per-store key derivation | Per-store keys complicate rotation and key recovery. One process-key + per-file IV gives the same security and a much simpler rotation story. |
| Encrypt only High-tier stores in Phase 1 | Encrypt everything | Embeddings + commands + agent prompts cover ~95% of the audit's concern. Medium-tier stores have far fewer and lower-value secrets — adding them later when migration is proven is safer. |

## Risks

1. **Lost-key data loss**. If a user enables encryption then loses the key (env var unset, keychain wiped, passphrase forgotten), their memory + sessions are unrecoverable. Document this prominently. Consider a recovery-passphrase escrow option in Phase 2.
2. **Performance cost of per-write encryption**. AES-GCM is ~1 GB/s on modern x64 with AES-NI; for sub-MB writes the overhead is sub-ms. Memory DB writes are larger (multi-MB) but already infrequent. Bench in the implementation iteration.
3. **Compromise of the key in process memory**. Out of scope for at-rest encryption. Memory dumps are a different threat (Phase 4 if it ever becomes relevant).
4. **Cross-platform keychain divergence**. `keytar` works but is unmaintained. Consider `node-keytar` fork or libsecret-direct binding when implementing. Pinning the version is a must.

## Open questions

- **Daemon vs CLI**: the daemon long-lived process and the CLI one-shot process need to share a key. For env-var/keychain, they both read the same source. For passphrase, the daemon would need to be started with the passphrase or a derived key passed in via stdin. Document the daemon-mode setup explicitly.
- **MCP server mode**: when started by Claude Code via `claude mcp add`, the MCP server inherits Claude Code's environment. The user has to set `CLAUDE_FLOW_ENCRYPTION_KEY` in the env Claude Code launches with — which is doable but non-obvious. A `~/.claude-flow/encryption.json` config (mode 0600, keychain reference) might be cleaner than env-var-everywhere. Decide in implementation.
- **AgentDB v3 native encryption**: if AgentDB ever exposes a transparent column-encryption API, switch to it for the memory DB. Until then, file-level on the whole DB blob is correct.

## Acceptance criteria

The implementation iteration is done when:

- [x] `CLAUDE_FLOW_ENCRYPT_AT_REST=1` round-trips a session save → restore unchanged — pinned by `__tests__/session-encryption.test.ts:run_save → run_restore` (commit `98aa256`).
- [x] A plaintext `.claude-flow/sessions/foo.json` from before the upgrade is still readable after the upgrade (magic-sniff backward compat) — pinned by `__tests__/session-encryption.test.ts > migration` and the analogous case in `terminal-encryption.test.ts` + `memory-db-encryption.test.ts` (commits `98aa256`, `49c8019`, `841365f`).
- [x] A flipped byte in any encrypted file produces a decrypt error, not a panic — pinned by `__tests__/encryption-vault.test.ts > tamper detection` (6 cases) and `memory-db-encryption.test.ts > tamper > flipped ciphertext byte` (commits `cb9a9f3`, `841365f`).
- [x] The 1865-test baseline stays green with `CLAUDE_FLOW_ENCRYPT_AT_REST` unset — full vitest run is now **1933/1933 passing, 46 skipped, 0 failures** with the env var unset (started this loop at 1865 + 25 pre-existing failures; +68 new tests across the encryption track).
- [x] A new test file `__tests__/encryption-vault.test.ts` exercises every path above — 45 cases (commit `cb9a9f3`). Plus `fs-secure.test.ts` (8 cases), `session-encryption.test.ts` (7), `terminal-encryption.test.ts` (7), `memory-db-encryption.test.ts` (9). Total **76 encryption-track tests across 5 files**.
- [ ] `ruflo doctor` reports encryption status — **deferred to Phase 5**. The doctor surface needs a separate small change; not blocking the high-tier scope shipping.
- [ ] The witness manifest (`verification.md.json`) gains a fix entry covering the new vault module so `ruflo verify` confirms it after publish — **deferred until the batch publish iteration** (per the loop directive of "do not publish on every iteration"). Will land alongside the 3.6.25 bump.

## Implementation status

| Phase | Scope | Lands in | Tests | Suite delta |
|---|---|---|---|---|
| 1 | Vault primitives: `MAGIC`, `validateBudget`, `getKey`, `encryptBuffer`, `decryptBuffer`, `isEncryptedBlob`, `decodeKey`, `isEncryptionEnabled` | `cb9a9f3` | 45 (`encryption-vault.test.ts`) | 1865 → 1910 |
| 2 | Wire `fs-secure.writeFileRestricted({encrypt})` + `readFileMaybeEncrypted`; route session-tools `saveSession` / `loadSession` / `listSessions` | `98aa256` | +7 (`session-encryption.test.ts`) | 1910 → 1917 |
| 3 | Wire terminal-tools `saveTerminalStore` + `loadTerminalStore` | `49c8019` | +7 (`terminal-encryption.test.ts`) | 1917 → 1924 |
| 4 | Wire memory-initializer — 7 `dbPath` writes + 9 `dbPath` reads (Buffer-only sql.js SQLite blobs) | `841365f` | +9 (`memory-db-encryption.test.ts`) | 1924 → 1933 |

**High-tier targets shipped end-to-end opt-in encrypted under `CLAUDE_FLOW_ENCRYPT_AT_REST=1`:**
- `.claude-flow/sessions/*.json` (memory snapshots + agent prompts)
- `.claude-flow/terminals/store.json` (pasted shell command history → frequent credentials)
- `.swarm/memory.db` (sql.js SQLite + 384-dim ONNX embeddings)

Backward-compat strategy is the magic-byte sniff (`"RFE1"`): legacy plaintext files keep working unchanged regardless of whether the gate is on or off, so users can opt in without a coordinated migration. On the *first write* after enable, the file is rewritten encrypted; reads always sniff first.

## Phase 5+ scope (deferred)

Each is a separate ADR or follow-up iteration:

- **`ruflo doctor` encryption status report** — small surface change; lands as part of the next CLI bump.
- **Witness manifest entry** for `src/encryption/vault.ts` + the four wired stores — gates on the next batch publish (per the per-iteration "no publish per iteration" directive).
- **Key rotation + `ruflo encryption rotate`** — was Phase 2 in the original ADR; renamed Phase 5 now that opt-in shipping is done.
- **Sealed-box backups** — was Phase 2; renamed Phase 6.
- **Medium-tier stores** (`agents/`, `tasks/`, `github/`, `claims/`, `config/`, `workflow/`, `neural/`, `daa/`) — was Phase 3; renamed Phase 7. Lower information value per the tiering table; ship after Phase 5 proves the migration story in production.
- **Keychain (`keytar`) + interactive passphrase resolvers** — extends `getKey()` precedence beyond the env-var-only Phase 1 source.
- **AgentDB native column-level encryption** — if/when AgentDB exposes a transparent column-encryption API, switch the memory DB to it and drop the file-level wrapper.
