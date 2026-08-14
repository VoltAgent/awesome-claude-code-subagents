# ADR-112 — MCP tool discoverability: every description must answer "use this over native when?"

**Status**: Accepted (2026-05-11)
**Date**: 2026-05-11
**Authors**: claude (drafted with rUv)
**Related**: [#1748](https://github.com/ruvnet/ruflo/issues/1748), [#1896](https://github.com/ruvnet/ruflo/issues/1896), [AlphaSignal external audit](https://alphasignalai.substack.com/p/how-ruflo-turns-claude-code-into)
**Supersedes**: nothing

## Context

Ruflo ships 285 MCP tools across the CLI package. Claude Code already exposes a native toolset (`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `Task`, `TodoWrite`, `WebFetch`, `WebSearch`, etc.) that overlaps with many of ours. When Claude picks between two ways to do the same thing, the deciding signal is the tool description it sees in its system prompt — there is no other context.

Measurement on current main (2026-05-11):

```
$ node scripts/audit-tool-descriptions.mjs
Total MCP tools scanned:  285
With Use-when guidance:    9
Without guidance:         276
```

**Worse than the [AlphaSignal article](https://alphasignalai.substack.com/p/how-ruflo-turns-claude-code-into) reported** (it estimated 237/300 lack guidance). 97% of our tool descriptions are essentially "here is what this thing does" rather than "here is when to use this instead of `<native equivalent>`".

The downstream effect: Claude defaults to native tools for anything where they could plausibly work. Memory tools lose to file `Read`. `agent_spawn` loses to `Task`. `workflow_execute` loses to sequential Bash. Ruflo's value-add (cost attribution, learning loops, swarm coordination, witness chain) never fires because Claude doesn't know it should call us.

## Decision

**Every MCP tool description MUST include "Use when … is wrong because …" guidance.** The format:

```
<one-line what it does>. Use when <native equivalent> is wrong because
<concrete value-add: cost tracking | learning persistence | coordination
| witness chain | sandbox isolation | …>. For <inverse case>, native
<tool> is fine. <Optional: Pair with X first.>
```

### Decision rule for each tool

For each of the 285 tools, before merging any new description we ask:

1. **Is there a native tool that overlaps?** (Read/Write/Edit/Bash/Grep/Glob/Task/TodoWrite/WebFetch/WebSearch). If yes, the description MUST name it and state when to use Ruflo's version over it.
2. **What does the Ruflo version do that the native doesn't?** Concrete answers only:
   - Cost attribution (cost-tracking namespace)
   - Learning persistence (patterns namespace, ReasoningBank)
   - Cross-session memory (.swarm/memory.db)
   - Swarm coordination (multi-agent state)
   - Witness chain (Ed25519-signed audit)
   - Sandbox isolation (WASM)
   - Real-time observability (intelligence trajectory)
3. **When is native actually better?** State it. "For one-shot file reads, native Read is fine." Honesty builds Claude's trust in our guidance — if every description says "always use Ruflo", Claude learns to ignore them.

### Worst-offender priority order (Phase 1 — this iteration)

| Class | Tool count | Native overlap | Priority |
|---|---|---|---|
| `agent_*` | 8 | `Task` | **P1** — Claude defaults to `Task` |
| `memory_*` | 11 | `Read`/`Write` (file paths) | **P1** — memory loses to files |
| `agentdb_*` | 14 | `memory_*` (internal overlap!) | **P1** — disambiguate the two |
| `workflow_*` | 6 | sequential Bash + TodoWrite | **P1** |
| `hooks_*` | 17 | mostly no overlap | P2 |
| `swarm_*` | 6 | `Task` (multi-agent) | P2 |
| `embeddings_*` | 9 | none direct | P3 |
| `claims_*` | 4 | none direct | P3 |
| `task_*` | 6 | `TodoWrite` | P2 |
| everything else | ~204 | varies | P3 |

P1 is ~39 tools — the ones where Claude's choice happens most often.

### Anti-pattern descriptions (what NOT to write)

❌ `"Spawn an agent"`
❌ `"Store data in memory"`
❌ `"Search the audit log"`
❌ `"Manage WASM sandboxes"`
❌ `"Configure routing"`

These tell Claude **what** the tool does, never **when** to call it over a native alternative.

### Pattern description (what TO write)

✅ `"Spawn a Ruflo-tracked agent with cost attribution + memory persistence + swarm coordination. Use when native Task tool is wrong because you need (a) cost tracking per agent in the cost-tracking namespace, (b) cross-session learning via the patterns namespace, or (c) coordination with other agents in a swarm topology (hierarchical / mesh / consensus). For one-shot subtasks with no learning loop, native Task is fine. Pair with hooks_route to pick the right model first."`

That description exists in tree today (it's `agent_spawn`). It's the template every other description should match.

## Implementation plan

### Phase 1 — P1 batch (this PR)

39 tool descriptions edited to follow the template. One file at a time:
- `agent-tools.ts` (8 tools)
- `memory-tools.ts` (11 tools)
- `agentdb-tools.ts` (14 tools)
- `workflow-tools.ts` (6 tools)

### Phase 2 — P2 batch (follow-up PR)

~30 tools across `hooks-*`, `swarm-*`, `task-*`, `coordination-*`.

### Phase 3 — P3 sweep (follow-up PR)

~216 long-tail tools. Bulk pattern-match + ML-suggested descriptions reviewed by human before commit.

### Phase 4 — CI guard (must precede merge of phases 1-3 to be useful)

`scripts/audit-tool-descriptions.mjs` + a `tool-descriptions-audit` CI job that:
1. Scans every `MCPTool` definition in `src/mcp-tools/*.ts`.
2. Counts descriptions that **lack** all of these signals: `/Use when/i`, `/Prefer .* over/i`, `/Pair with/i`, `/fall back/i`, `/use over native/i`.
3. Emits a per-tool report.
4. **Fails the build if the no-guidance count rises above the registered baseline** (initially 276; this drops with each phase).
5. The baseline lives in `verification/mcp-tool-baseline.json` — auditable, monotone-decreasing.

This guard prevents new tools from shipping without guidance and prevents accidental regression of edited descriptions.

## Validation

This ADR closes when:
- Phase 1 (39 P1 tools) merged.
- CI guard active and passing.
- Tool-description audit script committed under `scripts/`.

Subsequent phases tracked in their own PRs, but the CI baseline is what guarantees forward progress.

## Notes

- The article's 237/300 was generous; current main is 276/285. ADR-095 G6/G3/G4/etc. fixes shipped while this stayed open — discoverability is the gap that quietly nullifies the rest.
- Every tool description shipped in this ADR's wake must answer "use this over native when?". Reviewers reject otherwise. No exceptions for "internal" tools — anything Claude sees in its tool list is subject to the rule.

## References

- [#1748](https://github.com/ruvnet/ruflo/issues/1748) — original discoverability tracking issue
- [#1896](https://github.com/ruvnet/ruflo/issues/1896) — external audit response
- [AlphaSignal AI article](https://alphasignalai.substack.com/p/how-ruflo-turns-claude-code-into) — external amplification
- `agent_spawn` description in `v3/@claude-flow/cli/src/mcp-tools/agent-tools.ts:183` — the template every other description should match
