# Contributing to Awesome Claude Subagents

Thank you for your interest in contributing to this collection!

## 🎯 Design Philosophy

All agents in this collection follow [Anthropic's Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) guide. Key principles:

1. **Start Simple** - Keep agents focused with minimal complexity
2. **Clear Boundaries** - Always include "When NOT to Use" guidance
3. **Pattern-Based** - Use one of five proven workflow patterns
4. **Concrete Examples** - Show real-world usage scenarios

## 🤝 How to Contribute

### Adding a New Subagent

1. **Choose the right category** - Place your subagent in the most appropriate category folder
2. **Follow the template** - See [AGENT_TEMPLATE.md](AGENT_TEMPLATE.md) for the required structure
3. **Choose a workflow pattern** - Select the most appropriate Anthropic pattern
4. **Test your subagent** - Ensure it works with Claude Code
5. **Update required files** - Main README.md and Category README.md
6. **Submit a PR** - Include a clear description of the subagent's purpose

### Subagent Template (Required Structure)

```yaml
---
name: agent-name
description: One-line description of when to use this agent
tools: [minimal tools needed for this role]
---

# Role
[2-3 sentences defining expertise and focus]

# When to Use This Agent
- [Specific scenario 1]
- [Specific scenario 2]
- [Specific scenario 3]

# When NOT to Use
- [When simpler approaches suffice]
- [When another agent is more appropriate]

# Workflow Pattern
## Pattern: [Choose ONE]
- Prompt Chaining: Sequential steps
- Routing: Classify then delegate
- Parallelization: Independent concurrent tasks
- Orchestrator-Workers: Dynamic task delegation
- Evaluator-Optimizer: Iterative refinement

[How this agent applies the pattern]

# Core Process
1. [Concrete step 1]
2. [Concrete step 2]
3. [Concrete step 3]
4. [Concrete step 4]
5. [Concrete step 5]

# Tool Usage
- `Read`: [How this agent uses it]
- `Write/Edit`: [How this agent uses it]
- `Bash`: [How this agent uses it]
- `Glob/Grep`: [How this agent uses it]

# Error Handling
- [Error type]: [Recovery strategy]
- [Error type]: [Recovery strategy]

# Collaboration
- **Receives from**: [Agent names]
- **Hands off to**: [Agent names]

# Example
**Task**: [Concrete example task]
**Approach**: [Step-by-step approach]
**Output**: [Expected deliverable]
```

### Required Updates When Adding a New Agent

1. **Main README.md**
   - Add your agent link in the appropriate category section
   - Maintain alphabetical order
   - Format: `- [**agent-name**](path/to/agent.md) - Brief description`

2. **Category README.md** (e.g., `categories/02-language-specialists/README.md`)
   - Add detailed agent description
   - Update the Quick Selection Guide table

3. **Your Agent File** (e.g., `categories/02-language-specialists/your-agent.md`)
   - Follow the template structure above
   - Keep it under 150 lines
   - Include all required sections

### Quality Guidelines

- **Concise**: Agents should be 100-150 lines max
- **Focused**: One clear purpose per agent
- **Bounded**: Clear "When NOT to Use" section
- **Pattern-based**: Use one Anthropic workflow pattern
- **Practical**: Include concrete examples
- **Minimal tools**: Only request tools the agent actually needs

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-subagent`)
3. Add your subagent following the template
4. Ensure agent is under 150 lines
5. Update ALL required locations (READMEs)
6. Verify all links work correctly
7. Submit a pull request with a clear description

### Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Test contributions before submitting
- Follow the existing format and structure

## 📝 License

By contributing, you agree that your contributions will be licensed under the MIT License.
