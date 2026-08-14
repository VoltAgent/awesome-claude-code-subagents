---
name: autopilot-status
description: Quick autopilot progress summary with task completion stats
---
$ARGUMENTS
Show autopilot progress. Calls `autopilot_status` and `autopilot_progress` via MCP.

Displays:
- Enabled/disabled state
- Iteration count vs max
- Elapsed time vs timeout
- Task completion by source (team-tasks, swarm-tasks, file-checklist)
- Overall completion percentage

For detailed task breakdown, use `autopilot_progress`. For event log, use `autopilot_log`.
