# ruflo-testgen

Test gap detection, coverage analysis, and automated test generation. SPARC Refinement-phase canonical owner.

## Install

```
/plugin marketplace add ruvnet/ruflo
/plugin install ruflo-testgen@ruflo
```

## What's Included

- **Coverage Gap Detection**: Identify untested code paths with prioritized gap analysis
- **Coverage-Aware Routing**: Route tasks to agents based on test coverage needs
- **Test Generation**: Automated test scaffolding for uncovered modules
- **TDD Support**: London School (mock-first) test patterns with agent coordination
- **testgaps Worker**: Background worker for continuous coverage analysis
- **Integration**: Works with hooks system for post-edit test suggestions

## Requires

- `ruflo-core` plugin (provides MCP server)

## Compatibility

- **CLI:** pinned to `@claude-flow/cli` v3.6 major+minor.
- **Verification:** `bash plugins/ruflo-testgen/scripts/smoke.sh` is the contract.

## testgaps worker + coverage CLI surface

This plugin's two MCP/CLI surfaces:

| Surface | Invocation |
|---------|-----------|
| **MCP**: dispatch the `testgaps` worker | `mcp tool call hooks_worker-dispatch --json -- '{"trigger":"testgaps"}'` |
| **CLI**: `coverage-gaps` (table of gaps) | `npx @claude-flow/cli@latest hooks coverage-gaps --format table --limit 20` |
| **CLI**: `coverage-route` (route a task by gap) | `npx @claude-flow/cli@latest hooks coverage-route --task "add auth tests"` |
| **CLI**: `coverage-suggest` (suggest tests for a path) | `npx @claude-flow/cli@latest hooks coverage-suggest --path src/` |

`testgaps` is one of 12 background workers documented in [ruflo-loop-workers ADR-0001](../ruflo-loop-workers/docs/adrs/0001-loop-workers-contract.md).

## SPARC Refinement-phase ownership

This plugin owns the **Refinement** phase per [ruflo-sparc ADR-0001](../ruflo-sparc/docs/adrs/0001-sparc-contract.md) §"Phase-to-plugin alignment". When SPARC's `sparc-refine` skill runs, it composes:

1. **This plugin** — coverage gap detection + TDD test generation
2. [ruflo-jujutsu](../ruflo-jujutsu/docs/adrs/0001-jujutsu-contract.md) — diff-aware refactor recommendations

Together they enforce the Refinement gate: ≥80% coverage on new code + diff risk score below threshold.

## Namespace coordination

This plugin owns the `test-gaps` AgentDB namespace (kebab-case, follows the convention from [ruflo-agentdb ADR-0001 §"Namespace convention"](../ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md)). Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.

`test-gaps` indexes detected gaps by file + priority + last-seen timestamp. Accessed via `memory_*` (namespace-routed).

## Verification

```bash
bash plugins/ruflo-testgen/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — ruflo-testgen plugin contract (testgaps-worker contract, SPARC Refinement ownership, smoke as contract)](./docs/adrs/0001-testgen-contract.md)

## Related Plugins

- `ruflo-loop-workers` — defines the `testgaps` background worker
- `ruflo-sparc` — Refinement-phase canonical handoff
- `ruflo-jujutsu` — diff-aware refactor companion in the Refinement gate
- `ruflo-agentdb` — namespace convention owner
