# ADR-045: Guidance System Integration — Claude Flow v3.1

**Status:** Accepted
**Date:** 2026-02-02
**Author:** Claude Flow Architecture
**Version:** 3.1.0-alpha.1

## Context

The `@claude-flow/guidance` package (published as `3.0.0-alpha.1`) provides a governance control plane for Claude Code sessions:

- **Compile**: CLAUDE.md → Constitution + Rule Shards + Rule Manifest
- **Enforce**: 4 enforcement gates (ingestion, retrieval, generation, emission)
- **Prove**: Proof envelopes with cryptographic audit trail
- **Evolve**: Automatic rule evolution and optimization
- **Analyze**: 6-dimension scoring (Structure, Coverage, Enforceability, Compilability, Clarity, Completeness)
- **A/B Test**: Headless comparative testing of governance configurations
- **Templates**: 6 CLAUDE.md templates (minimal, standard, full, security, performance, solo)

Currently, `@claude-flow/guidance` is:
1. A standalone package at `v3/@claude-flow/guidance/`
2. Used by `@claude-flow/cli` via dynamic `import()` — but NOT declared as a dependency
3. Not included in the umbrella `claude-flow` package's `files` array
4. Not available to end users running `npx claude-flow@alpha`

This means the `guidance` CLI commands silently fail at runtime when installed from npm.

## Decision

Integrate `@claude-flow/guidance` as a **first-class dependency** in both `@claude-flow/cli` and the `claude-flow` umbrella package, making it a core component of Claude Flow v3.1.

### 1. Dependency Graph

```
claude-flow (umbrella v3.1.0-alpha.1)
  └── @claude-flow/cli (v3.1.0-alpha.1)
        ├── @claude-flow/guidance (v3.0.0-alpha.1)  ← NEW
        ├── @claude-flow/shared
        ├── @claude-flow/mcp
        └── @claude-flow/aidefence
```

### 2. Package Changes

**`@claude-flow/cli/package.json`**:
```json
{
  "dependencies": {
    "@claude-flow/guidance": "^3.0.0-alpha.1"
  }
}
```

**`claude-flow/package.json` (umbrella)**:
```json
{
  "files": [
    "v3/@claude-flow/guidance/dist/**/*.js",
    "v3/@claude-flow/guidance/dist/**/*.d.ts",
    "v3/@claude-flow/guidance/package.json"
  ]
}
```

### 3. CLI Commands (6 subcommands)

The `guidance` command becomes a top-level CLI command with 6 subcommands:

| Subcommand | Description |
|------------|-------------|
| `guidance compile` | Compile CLAUDE.md into constitution + shards + manifest |
| `guidance retrieve` | Query compiled rule shards by semantic similarity |
| `guidance gates` | Run enforcement gates against tool calls |
| `guidance evolve` | Evolve rules based on session outcomes |
| `guidance optimize` | Analyze and optimize CLAUDE.md for higher governance score |
| `guidance ab-test` | Run A/B comparative benchmark between configurations |

### 4. Init System Integration

The CLAUDE.md generator (`claudemd-generator.ts`) now:
- Produces analyzer-validated A-grade templates (91-95/100)
- Supports 6 template variants via `runtime.claudeMdTemplate` option
- Uses enforceable bullet-format rules (100% enforceability score)
- Is selectable during `init --wizard`

### 5. Version Strategy

| Package | Current | v3.1 |
|---------|---------|------|
| `claude-flow` (umbrella) | 3.0.0-alpha.185 | 3.1.0-alpha.1 |
| `@claude-flow/cli` | 3.0.0-alpha.185 | 3.1.0-alpha.1 |
| `@claude-flow/guidance` | 3.0.0-alpha.1 | 3.0.0-alpha.1 (unchanged) |

The guidance package itself stays at 3.0.0-alpha.1 since its API is stable. The CLI and umbrella bump to 3.1.0 to reflect the governance integration as a feature milestone.

## Consequences

### Positive
- `guidance` commands work out-of-the-box for all users
- CLAUDE.md quality is measurable and enforceable
- A/B testing enables data-driven governance improvement
- Template system gives users appropriate defaults for their use case
- Init wizard can offer template selection

### Negative
- Increases install size (~200KB for guidance dist)
- Adds a build-order dependency (guidance must build before CLI)

### Neutral
- Dynamic imports remain (lazy loading for faster CLI startup)
- Guidance package can still evolve independently

## Implementation

1. Add `@claude-flow/guidance` to CLI's `dependencies`
2. Add guidance dist files to umbrella's `files` array
3. Version bump CLI and umbrella to 3.1.0-alpha.1
4. Update init wizard to offer template selection
5. Publish all packages with correct dist-tags

## Related ADRs

- ADR-G001: Guidance Control Plane
- ADR-G002: Constitution-Shard Split
- ADR-G004: Four Enforcement Gates
- ADR-G009: Headless Testing Harness
- ADR-026: Agent Booster Model Routing (3-tier system referenced in templates)
