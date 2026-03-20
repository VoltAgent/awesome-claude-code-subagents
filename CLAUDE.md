# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a curated collection of AI coding agent definitions for Claude Code, OpenCode, and Cursor. Agent definitions in `categories/` use the Claude Code format as the canonical source. `generate.sh` translates them into equivalent definitions for OpenCode.

Cursor reads `.claude/agents/` and `~/.claude/agents/` natively, so no Cursor-specific generation is needed.

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

- `./generate.sh` - Reads `categories/` and generates equivalent definitions in `agent-specific/opencode/`
- `./setup.sh` - Creates symlinks from tool config directories into this repository. Claude Code symlinks from `categories/` directly; OpenCode symlinks from `agent-specific/`. Cursor reads `.claude/agents/` natively so no extra step is needed.

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
| Cursor | `.claude/agents/` (native) | `~/.claude/agents/` (native) |

Project-level agents take precedence over global ones with the same name.
