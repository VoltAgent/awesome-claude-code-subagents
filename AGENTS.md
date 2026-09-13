# AGENTS.md

This file provides guidance to AI coding assistants (ZCode and OpenCode) when working with code in this repository.

## Project Overview

This is a curated collection of 158+ subagent definitions - specialized AI assistants for specific development tasks. Subagents are markdown files with YAML frontmatter that both **ZCode** and **OpenCode** can load and use.

- **ZCode** stores subagents in `~/.zcode/agents/` (global) or `.zcode/agents/` (local).
- **OpenCode** stores subagents in `~/.config/opencode/agents/` (global) or `.opencode/agents/` (project-level).

> This repository is an adaptation of [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) supporting both ZCode and OpenCode. When editing, keep the dual-assistant frontmatter conventions described below.

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
bin/
  cli.js                   # Cross-platform CLI installer (ZCode & OpenCode)
install-agents.sh          # Interactive bash installer
```

Each category directory also carries its own `.zcode-plugin/plugin.json` manifest that lists its agents; ZCode installs categories as plugins from these manifests.

## Subagent File Format

Each subagent follows this dual-compatible template:

```yaml
---
name: agent-name
description: When this agent should be invoked (used for auto-selection and delegation)
mode: subagent
tools: Read, Write, Edit, Bash, Glob, Grep  # Comma-separated tool permissions (ZCode)
---

You are a [role description]...

[Agent-specific checklists, patterns, guidelines]

## Communication Protocol
[Inter-agent communication specs]

## Development Workflow
[Structured implementation phases]
```

### Frontmatter fields and Platform Support

| Field | ZCode Support | OpenCode Support | Notes |
|-------|---------------|------------------|-------|
| `name` | **Required** | Supported | Identifier of the agent |
| `description` | **Required** | **Required** | Specifies function and invocation criteria |
| `mode` | Ignored | **Required** | Must be `subagent` so OpenCode registers it as a subagent (invocable via `@name`) |
| `tools` | Comma-separated list | Converted by installer | ZCode uses comma-separated list; OpenCode installer maps this to `permission` block |
| `permission` | Ignored | Supported | OpenCode granular permissions (`edit: deny`, `bash: deny`, etc.) |
| `model` | Model ID | Model ID | Omit or use `inherit` to follow parent agent model |
| `thoughtLevel` | Reasoning level | Passed to provider | e.g. `high` |
| `color` | Preset color | Hex or theme name | Visual identity |
| `maxTurns` / `steps` | Positive integer | Positive integer | Maximum iteration turns |

### Tool Assignment by Role Type

Both ZCode and OpenCode share equivalent core tools:

| Tool (ZCode) | Tool (OpenCode) | Role Access |
|--------------|-----------------|-------------|
| `Read`, `Grep`, `Glob` | `read`, `grep`, `glob` | Read-only reviewers, auditors |
| `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch` | `read`, `grep`, `glob`, `webfetch`, `websearch` | Research analysts |
| `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep` | `read`, `write`, `edit`, `bash`, `glob`, `grep` | Code writers, developers |
| `Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebFetch`, `WebSearch` | `read`, `write`, `edit`, `glob`, `grep`, `webfetch`, `websearch` | Technical writers, documentation |

## Subagent Storage Locations

| Assistant | Scope | Path |
|-----------|-------|------|
| **ZCode** | User (global) | `~/.zcode/agents/` |
| **ZCode** | Project (local)| `.zcode/agents/` |
| **OpenCode** | User (global) | `~/.config/opencode/agents/` |
| **OpenCode** | Project (local)| `.opencode/agents/` |

## Installing Subagents

Using the cross-platform zero-dependency CLI installer:

```bash
# OpenCode: Install starter pack globally
npx github:a2mus/awesome-zcode-subagents --opencode --starter

# OpenCode: Install into current project (.opencode/agents/)
npx github:a2mus/awesome-zcode-subagents --opencode --project --all

# ZCode: Install starter pack
npx github:a2mus/awesome-zcode-subagents --starter

# Install into BOTH ZCode and OpenCode simultaneously
npx github:a2mus/awesome-zcode-subagents --both --starter
```

Using the bash installer:

```bash
# Interactive menu (prompts for platform: ZCode or OpenCode)
./install-agents.sh

# Target OpenCode directly
./install-agents.sh --opencode
```

## Contributing a New Subagent

When adding a new agent, update these files:

1. **Main README.md** - Add link in appropriate category (alphabetical order)
2. **Category README.md** - Add detailed description, update Quick Selection Guide table
3. **Agent .md file** - Create definition with `mode: subagent` included in YAML frontmatter
4. **Category plugin.json** - Bump the version in `categories/<category>/.zcode-plugin/plugin.json` and keep the matching version in `.zcode-plugin/marketplace.json` in sync (CI enforces this)
