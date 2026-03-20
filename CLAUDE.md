# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a curated collection of AI coding agent definitions for Claude Code, OpenCode, and Cursor. Agent definitions in `categories/` use the Claude Code format as the canonical source. `generate.sh` translates them into equivalent definitions for OpenCode and Cursor.

## Repository Structure

```
categories/          # Canonical agent definitions (Claude Code format)
  01-core-development/     # Backend, frontend, fullstack, mobile, etc.
  02-language-specialists/ # Language/framework experts (TypeScript, Python, etc.)
  03-infrastructure/       # DevOps, cloud, Kubernetes, etc.
  04-quality-security/     # Testing, security auditing, code review
  05-data-ai/              # ML, data engineering, AI specialists
  06-developer-experience/ # Tooling, documentation, DX optimisation
  07-specialized-domains/  # Blockchain, IoT, fintech, gaming
  08-business-product/     # Product management, business analysis
  09-meta-orchestration/   # Multi-agent coordination
  10-research-analysis/    # Research and analysis specialists
agent-specific/      # Generated output (gitignored, do not edit)
  opencode/          # Generated OpenCode definitions
  cursor/            # Generated Cursor definitions (with readonly: true where applicable)
generate.sh          # Translates categories/ into agent-specific/
setup.sh             # Creates symlinks into tool config directories
```

## Agent File Format

Each agent in `categories/` follows this template:

```yaml
---
name: agent-name
description: When this agent should be invoked (used for auto-selection)
tools: Read, Write, Edit, Bash, Glob, Grep  # Comma-separated tool permissions
model: sonnet  # sonnet | opus | haiku
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

## Scripts

- `./generate.sh` - Reads `categories/` and generates equivalent definitions in `agent-specific/opencode/` and `agent-specific/cursor/`. Cursor definitions include a `model` field mapped from the source (`sonnet` -> `claude-4.6-sonnet`, `opus` -> `claude-4.6-opus`, `haiku` -> `claude-4.5-haiku`) and `readonly: true` for agents that have no Write, Edit, or Bash tools.
- `./setup.sh` - Creates a single symlink named `awesome-subagents/` inside each tool's agents directory, pointing to the relevant source directory. Uses an interactive checkbox selector so users can choose which tools (Claude Code, OpenCode, Cursor) to link. Claude Code symlinks from `categories/` directly; OpenCode and Cursor symlink from `agent-specific/`.

## Contributing a New Agent

When adding a new agent, update these files:

1. **Main README.md** - Add link in appropriate category (alphabetical order)
2. **Category README.md** - Add detailed description, update Quick Selection Guide table
3. **Agent `.md` file** - Create the actual agent definition

Format for main README: `- [**agent-name**](path/to/agent.md) - Brief description`

## Agent Storage Locations

| Tool | Project | Global |
|------|---------|--------|
| Claude Code | `.claude/agents/` | `~/.claude/agents/` |
| OpenCode | `.opencode/agents/` | `~/.config/opencode/agents/` |
| Cursor | `.cursor/agents/` | `~/.cursor/agents/` |

Project-level agents take precedence over global ones with the same name.
