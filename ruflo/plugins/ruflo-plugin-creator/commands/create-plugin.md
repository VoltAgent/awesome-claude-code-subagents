---
name: create-plugin
description: Scaffold a new Claude Code plugin interactively
---

Create a new Claude Code plugin:

1. Ask the user for: plugin name, description, desired skills, commands, and agents
2. Use the `create-plugin` skill to scaffold the complete directory structure
3. Run the `validate-plugin` skill to verify correctness
4. Show the user what was created and how to test it with `claude --plugin-dir ./plugins/<name>`
