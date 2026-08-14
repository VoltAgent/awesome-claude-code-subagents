---
id: ADR-0001
title: ruflo-security-audit plugin contract — pinning, namespace coordination, AIDefence + audit_1776853149979 cross-references, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, security, audit, cve, namespace, smoke-test]
---

## Context

`ruflo-security-audit` (v0.2.0) — security review + dependency scanning + policy gates + CVE monitoring. 1 agent (`security-auditor`), 2 skills (`security-scan`, `dependency-check`), 1 command (`/audit`).

Drives `npx @claude-flow/cli@latest security scan|audit|cve|threats|validate|report` (CLI commands, not dedicated MCP tools — the security CLI command surface lives in `v3/@claude-flow/cli/src/commands/security.ts`).

Pairs with two sibling contracts:

- **AIDefence** ([ruflo-aidefence ADR-0001](../../ruflo-aidefence/docs/adrs/0001-aidefence-contract.md)) — owns the canonical 3-gate pattern (PII pre-storage, sanitization, prompt-injection). This plugin adds CVE / dependency / shell-injection scanning on top of those runtime gates.
- **audit_1776853149979 patterns** (existing README block) — class of shell-injection bugs the 3.6.25 release closed. The scanner is the regression-prevention mechanism for that class.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6); Namespace coordination (claims `security-findings`); AIDefence cross-reference block; Verification + Architecture Decisions sections.
3. Plugin metadata stays at `0.2.0` (already at the cadence). Keywords add `mcp`, `cve-monitoring`, `policy-gates`, `shell-injection`.
4. `scripts/smoke.sh` — 10 structural checks: version + keywords; both skills + agent + command with valid frontmatter; v3.6 pin; namespace coordination; AIDefence 3-gate cross-reference; audit_1776853149979 pattern catalog intact (execSync template-literals, numeric MCP inputs, package specs, loader-hijack env, plaintext secrets, MCP stdin DoS); ADR Proposed; no wildcard tools.

## Consequences

**Positive:** the audit_1776853149979 pattern catalog is now smoke-checked as a regression-prevention contract. Plugin joins the cadence.

**Negative:** none material.

## Verification

```bash
bash plugins/ruflo-security-audit/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/ruflo-aidefence/docs/adrs/0001-aidefence-contract.md` — canonical 3-gate runtime pattern this plugin's static analysis complements
- `plugins/ruflo-jujutsu/docs/adrs/0001-jujutsu-contract.md` — diff analysis substrate this plugin runs on for PR-time auditing
- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention
- `v3/@claude-flow/cli/src/commands/security.ts` — `security scan|audit|cve|threats|validate|report` CLI command surface

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/ruflo-security-audit/`. Contract elements implemented: 3-gate pattern alignment with ruflo-aidefence (runtime gates) documented; `audit_1776853149979` shell-injection regression class covered by scanner; namespace `security-findings` claimed; smoke-as-contract gate defined in `scripts/smoke.sh`.
