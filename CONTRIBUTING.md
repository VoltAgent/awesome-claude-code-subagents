# Contributing to Awesome Subagents

Thank you for your interest in contributing to this collection.

## How to Contribute

### Adding a New Agent

1. **Choose the right category** - Place your agent in the most appropriate category folder under `categories/`
2. **Test your agent** - Ensure the definition works with Claude Code (the canonical format)
3. **Update required files** - When adding a new agent, you must update:
   - **Main README.md** - Add your agent to the appropriate category section in alphabetical order
   - **Category README.md** - Add a detailed description and update the Quick Selection Guide table
   - **Your agent `.md` file** - Create the actual agent definition following the template below
4. **Submit a PR** - Include a clear description of the agent's purpose

### Agent Definition Format

All agents use the Claude Code frontmatter format as the canonical source. `generate.sh` handles translation to OpenCode and Cursor automatically.

```yaml
---
name: agent-name
description: When this agent should be invoked
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

You are a [role description and expertise areas]...
```

Each agent should include:

- Clear role definition
- List of expertise areas
- Required MCP tools (if any)
- Communication protocol examples
- Core capabilities
- Example usage scenarios
- Best practices

### Tool Assignment

Use only the minimum tools required for the agent's role:

- **Read-only** (reviewers, auditors): `Read, Grep, Glob`
- **Research** (analysts, researchers): `Read, Grep, Glob, WebFetch, WebSearch`
- **Code writers** (developers, engineers): `Read, Write, Edit, Bash, Glob, Grep`
- **Documentation** (writers, documenters): `Read, Write, Edit, Glob, Grep, WebFetch, WebSearch`

### Model Selection

- `opus` - Deep reasoning tasks (architecture reviews, security audits, financial logic)
- `sonnet` - Everyday coding tasks (writing, debugging, refactoring)
- `haiku` - Quick lightweight tasks (docs, search, dependency checks)

### Required Updates When Adding a New Agent

1. **Main README.md**
   - Add your agent link in the appropriate category section
   - Maintain alphabetical order within the category
   - Format: `- [**agent-name**](path/to/agent.md) - Brief description`

2. **Category README.md** (e.g., `categories/02-language-specialists/README.md`)
   - Add a detailed agent description in the "Available Subagents" section
   - Update the "Quick Selection Guide" table

3. **Your agent file** (e.g., `categories/02-language-specialists/your-agent.md`)
   - Follow the standard template structure
   - Include all required sections

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-agent`)
3. Add your agent following the template
4. Update all required locations (main README.md, category README.md)
5. Verify all links work correctly
6. Submit a pull request with a clear description

### Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Test contributions before submitting
- Follow the existing format and structure

## Licence

By contributing, you agree that your contributions will be licensed under the MIT Licence.

All agent definitions in this repository are provided "as is" without warranty. The maintainers do not audit or guarantee the security or correctness of any contribution and accept no liability for any issues arising from their use.
