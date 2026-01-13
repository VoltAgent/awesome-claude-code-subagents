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
```

## Subagent File Format

Each subagent follows this template:

```yaml
---
name: agent-name
description: When this agent should be invoked (used by Claude Code for auto-selection)
tools: Read, Write, Edit, Bash, Glob, Grep  # Comma-separated tool permissions
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

## Contributing a New Subagent

When adding a new agent, update these files:

1. **Main README.md** - Add link in appropriate category (alphabetical order)
2. **Category README.md** - Add detailed description, update Quick Selection Guide table
3. **Agent .md file** - Create the actual agent definition

Format for main README: `- [**agent-name**](path/to/agent.md) - Brief description`

## Subagent Storage in Claude Code

| Type | Path | Scope |
|------|------|-------|
| Project | `.claude/agents/` | Current project only |
| Global | `~/.claude/agents/` | All projects |

Project subagents take precedence over global ones with the same name.
