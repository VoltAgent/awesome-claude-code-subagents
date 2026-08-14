---
id: ADR-0001
title: ruflo-adr plugin contract — pinning, namespace coordination, smoke as contract, REFERENCE.md token-optimization pattern
status: Proposed
date: 2026-05-04
authors:
  - reviewer (Claude Code)
tags: [plugin, adr, agentdb, namespace, token-optimization, smoke-test]
---

## Context

`ruflo-adr` is the meta-plugin that manages ADR lifecycle for projects (this one included — every other plugin in this repo is documenting itself with an ADR-0001 by the very contract this plugin proposes). The plugin already shipped four useful pieces:

- `agents/adr-architect.md` — agent contract pointing at `REFERENCE.md` for the heavy template (per ADR-098 Part 2 token-diet)
- `commands/adr.md` — 7-subcommand dispatcher (`create | list | status | supersede | check | graph | search`)
- 3 skills: `adr-create`, `adr-index`, `adr-review`
- `REFERENCE.md` containing the markdown template, AgentDB graph paths, code-ADR linking patterns

Gaps observed against the pattern established by `ruflo-ruvector` ADR-0001, `ruflo-agentdb` ADR-0001, `ruflo-browser` ADR-0001, `ruflo-intelligence` ADR-0001:

1. **No plugin-level ADR** of its own (the plugin that manages ADRs has no ADR — meta-irony worth fixing).
2. **No smoke test.** Every other plugin updated this session has a `scripts/smoke.sh` enforcing the contract.
3. **Free-form namespace usage.** The agent + skills write to `adr-patterns` (kebab-case, follows the convention) but never cite the convention from `ruflo-agentdb` ADR-0001.
4. **No Compatibility section.** Plugin doesn't pin to `@claude-flow/cli` v3.6.
5. **Version `0.1.1`.** Pre-pattern. Bump to `0.2.0` to align the cadence.

## Decision

Five plugin-local edits. No changes to CLI source or AgentDB internals.

### 1. Add this ADR

`docs/adrs/0001-adr-plugin-pattern.md` (this file). Status `Proposed`. Cross-links the four sibling ADRs.

### 2. README augmentation (no rewrite)

Append three sections, retain everything that's there:

- **Compatibility** — pin to `@claude-flow/cli` v3.6 (matches the cadence).
- **Namespace coordination** — explicit deferral to `ruflo-agentdb` ADR-0001 §"Namespace convention". `adr-patterns` is the canonical namespace this plugin owns; the reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.
- **Architecture Decisions** — link to this ADR.
- **Verification** — pointer to `scripts/smoke.sh`.

### 3. Plugin metadata bump

`plugin.json` moves `0.1.1 → 0.2.0`. New keywords: `lifecycle`, `compliance`, `causal-graph`, `mcp`. Description re-states the AgentDB graph backing.

### 4. Smoke contract (`scripts/smoke.sh`)

10 checks:

1. `plugin.json` declares `0.2.0` with the new keywords.
2. All 3 skills present (`adr-create`, `adr-index`, `adr-review`) with valid frontmatter (name + description + allowed-tools).
3. `commands/adr.md` covers all 7 subcommands (`create | list | status | supersede | check | graph | search`).
4. Agent references `REFERENCE.md` (the token-optimization pattern from ADR-098 Part 2).
5. Agent + skills use the `adr-patterns` namespace consistently.
6. README has Compatibility section pinning to `@claude-flow/cli` v3.6.
7. README has Namespace coordination section deferring to `ruflo-agentdb` ADR-0001.
8. ADR file exists with status `Proposed`.
9. `REFERENCE.md` exists and is non-empty.
10. No skill grants wildcard tool access.

### 5. Agent file: keep the existing namespace contract, drop nothing

The agent already writes to `adr-patterns` (correct kebab-case form per the namespace convention). No changes needed beyond the namespace coordination cross-reference, which lives in the README, not the agent.

## Consequences

**Positive:**
- Plugin joins the same contract every other plugin updated this session follows: pin → ADR → smoke → namespace coordination.
- The `adr-patterns` namespace is now contractually owned by this plugin (anyone else writing there is on notice).
- Drift in subcommand coverage / skill inventory is now catchable in CI.

**Negative:**
- Bump from `0.1.1` to `0.2.0` is a one-minor jump. Justified by the new contract, not by behavior change.

**Neutral:**
- No new MCP tools, no new skills, no new commands. Documentation + smoke only.

## Verification

```bash
bash plugins/ruflo-adr/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Related

- `plugins/ruflo-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md` — pinning + smoke-as-contract precedent
- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention this plugin defers to
- `plugins/ruflo-browser/docs/adrs/0001-browser-skills-architecture.md` — session-as-skill precedent
- `plugins/ruflo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md` — surface-completeness precedent
- `plugins/ruflo-adr/REFERENCE.md` — heavy reference data (template, AgentDB paths) per ADR-098 Part 2 token-diet
