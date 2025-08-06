# Contributing to Awesome Claude Subagents

Thank you for your interest in contributing to this collection!

## 🤝 How to Contribute

### Adding a New Subagent

1. **Choose the right category** - Place your subagent in the most appropriate category folder
2. **Test your subagent** - Ensure it works with Claude Code
3. **Update required files** - When adding a new agent, you must update:
   - **Main README.md**: Add your agent to the appropriate category section in alphabetical order
   - **Category README.md**: Add detailed description, update Quick Selection Guide table, and if applicable, Common Technology Stacks
   - **Your agent .md file**: Create the actual agent definition following the template
4. **Submit a PR** - Include a clear description of the subagent's purpose

### Subagent Requirements

Each subagent should include:
- Clear role definition
- List of expertise areas
- Required MCP tools (if any)
- Communication protocol examples
- Core capabilities
- Example usage scenarios
- Best practices

### Required Updates When Adding a New Agent

When you add a new agent, you MUST update these files:

1. **Main README.md**
   - Add your agent link in the appropriate category section
   - Maintain alphabetical order
   - Format: `- [**agent-name**](path/to/agent.md) - Brief description`

2. **Category README.md** (e.g., `categories/02-language-specialists/README.md`)
   - Add detailed agent description in the "Available Subagents" section
   - Update the "Quick Selection Guide" table
   - If applicable, add to "Common Technology Stacks" section
   
3. **Your Agent File** (e.g., `categories/02-language-specialists/your-agent.md`)
   - Follow the standard template structure
   - Include all required sections

### Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Test contributions before submitting
- Follow the existing format and structure

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-subagent`)
3. Add your subagent following the template
4. Update ALL required locations:
   - Main README.md (add to category section in alphabetical order)
   - Category-specific README.md (add description, update tables)
5. Verify all links work correctly
6. Submit a pull request with a clear description

### Quality Guidelines

- Subagents should be production-ready
- Include clear documentation
- Provide practical examples
- Ensure compatibility with Claude Code

## 📝 License

By contributing, you agree that your contributions will be licensed under the MIT License.