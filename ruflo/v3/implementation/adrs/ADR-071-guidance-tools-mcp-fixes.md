# ADR-071: Guidance MCP Tools, Agent/Skill YAML Standardization, and MCP Server Fixes

- **Status**: Implemented
- **Date**: 2026-03-25
- **PR**: #1438 (feat/implement-stub-commands)

## Context

Three areas needed attention in v3.5.43:

1. **Capability discovery**: With 259 MCP tools, 26 CLI commands, 60+ agents, and 37 skills, the system had no way to navigate its own capabilities at runtime. Agents and the MCP client needed structured guidance to select the right tools for a task.

2. **Agent/skill YAML frontmatter**: 98% of agent definitions (135 files) and many skill files used invalid YAML frontmatter fields not recognized by Claude Code (`type`, `color`, `capabilities`, `priority`, `triggers`, `version`, `metadata`, etc.). Six agent files used `.yaml` extension instead of `.md`. Two skill files used lowercase `skill.md` instead of `SKILL.md`. The `tools` field used YAML array format instead of the required comma-separated string.

3. **MCP server startup failures**: Two bugs caused `mcp start` to fail with "MCP Server already running" even when no server was running:
   - `getStatus()` reported `running: true` with the current process PID for stdio transport before the server actually started, causing `start()` to block itself.
   - `isProcessRunning()` used `process.kill(pid, 0)` which returns true for any process owned by the user, not just the MCP server — leading to false positives when the OS recycled PIDs.

## Decision

### 1. Guidance MCP Tools

Add 5 new MCP tools to the `@claude-flow/cli` package:

| Tool | Purpose |
|------|---------|
| `guidance_capabilities` | List 16 capability areas with tools, commands, agents, skills, and when-to-use guidance |
| `guidance_recommend` | Task-based routing — given a description, recommend capabilities and workflow template |
| `guidance_discover` | Live filesystem scan of `.claude/agents/` and `.claude/skills/` |
| `guidance_workflow` | Step-by-step workflow templates for 15 task types (bugfix, feature, refactor, security, etc.) |
| `guidance_quickref` | Quick reference cards for 6 operational domains |

The tools use a static capability catalog with pattern-matched task routing. `guidance_discover` dynamically reads agent/skill definitions from the filesystem using a multi-strategy project root finder (CWD, package-relative, walk-up).

### 2. Agent/Skill YAML Standardization

Batch-fix all agent and skill files to comply with Claude Code's YAML frontmatter spec:

**Valid agent fields**: `name`, `description`, `tools` (comma-separated string), `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `initialPrompt`

**Valid skill fields**: `name`, `description`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools` (comma-separated), `model`, `effort`, `context`, `agent`, `hooks`

Changes:
- Convert 11 `.yaml` agent files to `.md`
- Remove invalid fields from 100+ agents (`type`, `color`, `capabilities`, `priority`, `triggers`, `role`, `version`, `metadata`, etc.)
- Remove malformed `hooks` fields (Python dict serialization artifacts)
- Fix `tools` from YAML arrays to comma-separated strings
- Rename 2 lowercase `skill.md` to `SKILL.md`
- Remove invalid skill fields, map `invocable` → `user-invocable`, `tools` → `allowed-tools`
- Update `init` executor to stop counting `.yaml` files

### 3. MCP Server PID Fixes

**Self-detection fix**: `start()` now skips the "already running" check when the reported PID matches the current process. `getStatus()` reports `running: true` with `process.pid` for stdio transport even before startup — this is correct for health checks but must not block the initial `start()` call.

**PID reuse guard**: `isProcessRunning()` now verifies the process is actually `node`/`claude-flow`/`npx` by inspecting `/proc/{pid}/cmdline` (Linux) or `ps -p` (macOS). Falls back to `kill -0` on platforms where this isn't available.

**Legacy cleanup**: `removePidFile()` now also removes `.claude-flow/mcp-server.pid` from older versions that wrote to a different path than the current `/tmp/claude-flow-mcp.pid`.

## Consequences

### Positive
- Agents can now discover and navigate capabilities at runtime via MCP
- All 107 agent files and 37 skill files have valid Claude Code frontmatter
- MCP server starts reliably without false "already running" errors
- `init` generates clean agents when scaffolding new projects

### Negative
- `hooks` fields were removed from agent frontmatter (they contained Claude Flow shell scripts, not Claude Code hook references — functionality preserved in CLI hooks system)
- Guidance tools use a static catalog that must be updated when new capabilities are added

## Files Changed

- `v3/@claude-flow/cli/src/mcp-tools/guidance-tools.ts` — new (5 tools)
- `v3/@claude-flow/cli/src/mcp-tools/index.ts` — export guidance tools
- `v3/@claude-flow/cli/src/mcp-client.ts` — register guidance tools
- `v3/@claude-flow/cli/src/mcp-server.ts` — PID self-detection + reuse guard + legacy cleanup
- `v3/@claude-flow/cli/src/init/executor.ts` — stop counting .yaml files
- `.claude/agents/**/*.md` — 100+ files standardized
- `.claude/skills/**/SKILL.md` — 17 files standardized
