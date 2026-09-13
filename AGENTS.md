# AGENTS.md

This file provides guidance to ZCode when working with code in this repository.

## Project Overview

This is a curated collection of ZCode subagent definitions - specialized AI assistants for specific development tasks. Subagents are markdown files with YAML frontmatter that ZCode can load and use. They are stored in `~/.zcode/agents/` and read at session start.

> This repository is a ZCode adaptation of [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents). When editing, keep the ZCode frontmatter conventions described below.

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
.zcode-plugin/             # Marketplace manifest (root)
  marketplace.json
```

Each category directory also carries its own `.zcode-plugin/plugin.json` manifest that lists its agents; ZCode installs categories as plugins from these manifests.

## Subagent File Format

Each subagent follows this template:

```yaml
---
name: agent-name
description: When this agent should be invoked (used by ZCode for auto-selection)
tools: Read, Write, Edit, Bash, Glob, Grep  # Comma-separated tool permissions
---

You are a [role description]...

[Agent-specific checklists, patterns, guidelines]

## Communication Protocol
[Inter-agent communication specs]

## Development Workflow
[Structured implementation phases]
```

### Frontmatter fields supported by ZCode

| Field | Notes |
|-------|-------|
| `name`, `description` | **Required.** Files missing either are ignored. |
| `tools` / `disallowedTools` | Allowed / denied tool lists. Omit or use `*` for everything. |
| `model` | A specific model id, or `inherit`/omitted to follow the primary agent's current model. Do **not** use Claude model tiers (`sonnet`, `opus`, `haiku`) — they are not valid ZCode model ids. |
| `thoughtLevel` | Reasoning level (e.g. `high`); only effective when a concrete model is set. |
| `color` | Preset identity color. |
| `maxTurns` | Max turns per invocation (positive integer). |
| `injectAgentsMd` | Whether AGENTS.md is injected into the subagent context (default on). |
| `mcpServers` | MCP server names required via exact match. |

### Tool Assignment by Role Type

ZCode built-in tools: `Read`, `Grep`, `Glob`, `Bash`, `Edit`, `Write`, `WebFetch`, `WebSearch`, `TodoWrite`. MCP tools are referenced as `mcp__<server>__<tool>`.

- **Read-only** (reviewers, auditors): `Read, Grep, Glob`
- **Research** (analysts): `Read, Grep, Glob, WebFetch, WebSearch`
- **Code writers** (developers): `Read, Write, Edit, Bash, Glob, Grep`
- **Documentation**: `Read, Write, Edit, Glob, Grep, WebFetch, WebSearch`

A custom `tools` list is exhaustive: listing any tool removes MCP tools unless they are added explicitly.

## Contributing a New Subagent

When adding a new agent, update these files:

1. **Main README.md** - Add link in appropriate category (alphabetical order)
2. **Category README.md** - Add detailed description, update Quick Selection Guide table
3. **Agent .md file** - Create the actual agent definition
4. **Category plugin.json** - Bump the version in `categories/<category>/.zcode-plugin/plugin.json` and keep the matching version in `.zcode-plugin/marketplace.json` in sync (CI enforces this)

Format for main README: `- [**agent-name**](path/to/agent.md) - Brief description`

## Subagent Storage in ZCode

| Type | Path | Scope |
|------|------|-------|
| User (global) | `~/.zcode/agents/` | All projects |

ZCode currently loads custom subagents from the user-level directory only (workspace/project-level subagent management is not available yet). Definition files are read at session start; running sessions do not hot-reload after edits.
