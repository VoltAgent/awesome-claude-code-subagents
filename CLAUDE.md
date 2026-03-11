# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a curated collection of Claude Code subagent definitions - specialized AI assistants for specific development tasks. Subagents are markdown files with YAML frontmatter that Claude Code can load and use.

## Repository Structure

```
categories/
  01-core-development/     # Backend, frontend, fullstack, mobile, etc.
  02-language-specialists/ # Language/framework experts (TypeScript, Python, etc.)
  03-infrastructure/       # DevOps, cloud, Kubernetes, etc.
  04-quality-security/     # Testing, security auditing, code review
  05-data-ai/              # ML, data engineering, AI specialists
  06-developer-experience/ # Tooling, documentation, DX optimization
  07-specialized-domains/  # Blockchain, IoT, fintech, gaming
  08-business-product/     # Product management, business analysis
  09-meta-orchestration/   # Multi-agent coordination
  10-research-analysis/    # Research and analysis specialists
tools/
  subagent-catalog/        # Claude Code skill for browsing/fetching agents
.claude-plugin/
  marketplace.json         # Top-level plugin registry (all category versions must stay in sync)
categories/<category>/
  .claude-plugin/plugin.json  # Per-category plugin manifest (bump version when any .md changes)
```

## Subagent File Format

Each subagent follows this template:

```yaml
---
name: agent-name
description: When this agent should be invoked (used by Claude Code for auto-selection)
tools: Read, Write, Edit, Bash, Glob, Grep  # Comma-separated tool permissions
model: sonnet  # opus | sonnet | haiku | inherit
---

You are a [role description]...

[Agent-specific checklists, patterns, guidelines]

## Communication Protocol
[Inter-agent communication specs]

## Development Workflow
[Structured implementation phases]
```

### Tool Assignment by Role Type

- **Read-only** (reviewers, auditors): `Read, Grep, Glob`
- **Research** (analysts): `Read, Grep, Glob, WebFetch, WebSearch`
- **Code writers** (developers): `Read, Write, Edit, Bash, Glob, Grep`
- **Documentation**: `Read, Write, Edit, Glob, Grep, WebFetch, WebSearch`

### Model Routing

| Model | When to use | Examples |
|-------|-------------|---------|
| `opus` | Deep reasoning — architecture reviews, security audits, financial logic | `security-auditor`, `architect-reviewer` |
| `sonnet` | Everyday coding — writing, debugging, refactoring | `python-pro`, `backend-developer` |
| `haiku` | Quick tasks — docs, search, dependency checks | `documentation-engineer`, `seo-specialist` |
| `inherit` | Use whatever model the main conversation uses | — |

## Contributing a New Subagent

When adding a new agent, update these files:

1. **Agent .md file** - Create the actual agent definition in the correct category folder
2. **Main README.md** - Add link in appropriate category (alphabetical order)
   - Format: `- [**agent-name**](path/to/agent.md) - Brief description`
3. **Category README.md** - Add detailed description, update Quick Selection Guide table
4. **Category plugin.json** - Add the new agent's `.md` path to the `agents` array in `categories/<category>/.claude-plugin/plugin.json`
5. **Bump plugin versions** (see below)

## Plugin Versioning (Required for CI)

A CI workflow (`.github/workflows/enforce-plugin-version-bump.yml`) enforces that:

1. **Category plugin version must be bumped** whenever any `.md` file in that category changes.
   - File: `categories/<category>/.claude-plugin/plugin.json` → increment `"version"`

2. **Marketplace version must stay in sync** with the category plugin version.
   - File: `.claude-plugin/marketplace.json` → update the matching plugin entry's `"version"` to match

Versions use semver (e.g. `1.0.1` → `1.0.2`). PRs that modify category `.md` files without bumping both versions will fail CI.

## Subagent Storage in Claude Code

| Type | Path | Scope |
|------|------|-------|
| Project | `.claude/agents/` | Current project only |
| Global | `~/.claude/agents/` | All projects |

Project subagents take precedence over global ones with the same name.

## Tools

The `tools/subagent-catalog/` directory contains a Claude Code skill for browsing and fetching agents from this catalog. Install it with:

```bash
cp -r tools/subagent-catalog ~/.claude/commands/
```

Commands: `/subagent-catalog:search <query>`, `/subagent-catalog:fetch <name>`, `/subagent-catalog:list`
