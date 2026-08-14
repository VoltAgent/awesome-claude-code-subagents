---
id: ADR-0001
title: ruflo-aidefence plugin contract — pinning, namespace coordination, 3-gate pattern, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, aidefence, security, pii, prompt-injection, namespace, smoke-test]
---

## Context

`ruflo-aidefence` documents the AIDefence MCP family (`aidefence_scan`, `_analyze`, `_stats`, `_learn`, `_is_safe`, `_has_pii`) — 6 tools at `v3/@claude-flow/cli/src/mcp-tools/security-tools.ts:108, 191, 277, 329, 424, 479`. Plugin is at v0.2.0 with full surface coverage and a "Defence-in-depth pairing" block already documenting the host-level hardening (loader-hijack denylist, file mode 0600, encryption-at-rest opt-in).

Gaps observed against the pattern from `ruflo-ruvector` / `ruflo-agentdb` / `ruflo-browser` / `ruflo-intelligence` / `ruflo-adr` ADRs:

1. **No plugin-level ADR.** Every other plugin updated this session has one.
2. **No smoke test.**
3. **Free-form `security-patterns` namespace.** The agent writes there without referencing `ruflo-agentdb` ADR-0001's namespace convention.
4. **No Compatibility section.**
5. **The ruflo-browser ADR-0001 §4** mandates three AIDefence gates (PII pre-storage, cookie sanitization, prompt-injection check on returned content) — `ruflo-aidefence` should canonicalize this 3-gate pattern so other plugins consume it the same way.

## Decision

### 1. Add this ADR (Proposed)

`docs/adrs/0001-aidefence-contract.md`. Cross-links the five sibling ADRs.

### 2. README augmentation

Append three sections, retain existing content:

- **Compatibility** — pin to `@claude-flow/cli` v3.6.
- **Namespace coordination** — `security-patterns` as the canonical namespace this plugin owns; defer to `ruflo-agentdb` ADR-0001 §"Namespace convention".
- **The 3-gate pattern** — formalize the gates `ruflo-browser` ADR-0001 §4 already uses. Three gates, every consumer plugin handling untrusted content should apply them in this order:
  1. **Pre-storage PII gate** (`aidefence_has_pii`) — before any AgentDB / memory_store write
  2. **Sanitization gate** (`aidefence_scan`) — for cookies, tokens, high-entropy blobs; vault rather than embed
  3. **Prompt-injection gate** (`aidefence_is_safe`) — for any extracted content flowing back to an LLM
- **Architecture Decisions** + **Verification** sections.

### 3. Plugin metadata

`plugin.json` keeps `0.2.0` (already at the cadence). Description retained. Keywords add `prompt-injection`, `defense-in-depth`, `mcp`.

### 4. Smoke contract (`scripts/smoke.sh`)

10 checks:

1. plugin.json declares `0.2.0` with the new keywords.
2. All 6 `aidefence_*` MCP tools referenced in plugin docs.
3. `transfer_detect-pii` is also referenced (used by pii-detect skill).
4. README has Compatibility section pinning to v3.6.
5. README defers to `ruflo-agentdb` ADR-0001 namespace convention.
6. README documents the 3-gate pattern (PII pre-storage, sanitization, prompt-injection).
7. README's "Defence-in-depth pairing" block remains intact (loader-hijack denylist, file mode 0600, encryption-at-rest).
8. ADR-0001 exists with status `Proposed`.
9. Both skills (`safety-scan`, `pii-detect`) have valid frontmatter (name + description + allowed-tools).
10. No skill grants wildcard tool access.

## Consequences

**Positive:**
- 3-gate pattern is now contractually owned by this plugin; consumer plugins reference it instead of re-deriving.
- Joins the contract every other plugin updated this session follows.
- `security-patterns` namespace is now declared.

**Negative:**
- One downstream plugin (`ruflo-browser`) embeds the 3-gate pattern in its own ADR §4. Updating it to defer here is a separate, mechanical task (the gates remain identical; only the canonical home changes).

**Neutral:**
- No new MCP tools, no new skills, no new commands. Documentation + smoke only. Plugin behavior unchanged.

## Verification

```bash
bash plugins/ruflo-aidefence/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/ruflo-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md`
- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention
- `plugins/ruflo-browser/docs/adrs/0001-browser-skills-architecture.md` — §4 codifies the 3-gate pattern this ADR canonicalizes
- `plugins/ruflo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md`
- `plugins/ruflo-adr/docs/adrs/0001-adr-plugin-pattern.md`
- `v3/@claude-flow/cli/src/mcp-tools/security-tools.ts` — 6 `aidefence_*` tool definitions

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/ruflo-aidefence/`. Contract elements implemented: 3-gate pattern (PII pre-storage gate via `aidefence_has_pii`, sanitization gate via `aidefence_scan`, prompt-injection gate via `aidefence_is_safe`); ADR-097 budget integration deferred (Phase 3); smoke-as-contract gate defined in `scripts/smoke.sh`.
