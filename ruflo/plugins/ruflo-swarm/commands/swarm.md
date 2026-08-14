---
name: swarm
description: Initialize, monitor, and manage multi-agent swarms
---
$ARGUMENTS

Swarm lifecycle management.

**Init**: `npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized`
**Status**: `npx @claude-flow/cli@latest swarm status`
**Health**: `npx @claude-flow/cli@latest swarm health`
**Shutdown**: `npx @claude-flow/cli@latest swarm shutdown`

Parse $ARGUMENTS to determine the subcommand. If no arguments, show swarm status.

After init, spawn agents via Claude Code's Task tool with `run_in_background: true` for parallel execution.
