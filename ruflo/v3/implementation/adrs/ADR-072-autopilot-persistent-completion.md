# ADR-072: Autopilot Integration — Persistent Swarm Completion for Claude-Flow CLI

- **Status**: Proposed
- **Date**: 2026-03-25
- **Depends on**: ADR-058 (Autopilot Swarm Completion in agentic-flow)
- **Related**: ADR-037 (Autopilot Chat Mode in Ruflo UI), ADR-071 (Guidance MCP Tools)

## Problem Statement

Claude Code agents and swarms routinely stop before all tasks are complete. This happens because:

1. **Context exhaustion**: Conversations hit context limits and lose track of remaining work
2. **Premature satisfaction**: Agents declare "done" after completing 60-80% of tasks, skipping edge cases, tests, or documentation
3. **No re-engagement**: When an agent stops, there is no mechanism to re-inject remaining task context and continue
4. **No cross-session continuity**: If a session ends, the next session has no structured awareness of what was left incomplete
5. **No learning**: The system doesn't learn from past completion patterns to predict and avoid failure modes

The result is that complex multi-phase tasks (implement feature + write tests + update docs + security review) consistently require 2-4 manual "continue" prompts to reach 100% completion.

## Decision

Integrate agentic-flow's **Autopilot Persistent Completion System** (ADR-058) into the `@claude-flow/cli` package at three layers:

1. **CLI commands** — 9 subcommands under `npx claude-flow autopilot`
2. **MCP tools** — 10 tools registered in the MCP server
3. **Stop hook integration** — Intercept agent stop events to check for remaining tasks
4. **CLAUDE.md injection** — Auto-inject autopilot instructions into project configuration

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Claude Code Session                       │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Agent 1  │    │  Agent 2  │    │  Agent 3  │    │  Agent N  │  │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘  │
│       │               │               │               │          │
│       └───────────────┼───────────────┼───────────────┘          │
│                       ▼                                          │
│              ┌────────────────┐                                  │
│              │  Stop Hook     │ ← Intercepts every agent stop    │
│              │  (pre-command) │                                   │
│              └───────┬────────┘                                  │
│                      ▼                                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Autopilot Coordinator                         │  │
│  │                                                           │  │
│  │  1. Discover tasks from 3 sources                         │  │
│  │  2. Check completion: all done?                           │  │
│  │     YES → Allow stop, record success episode              │  │
│  │     NO  → Build re-engagement context                     │  │
│  │           → Re-inject remaining tasks + learned patterns  │  │
│  │           → Increment iteration counter                   │  │
│  │           → Continue execution                            │  │
│  │                                                           │  │
│  │  Safety: max iterations (50), timeout (4hr), manual kill  │  │
│  └────────────────────┬──────────────────────────────────────┘  │
│                       ▼                                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              AutopilotLearning (AgentDB)                   │  │
│  │                                                           │  │
│  │  • Record completion/failure episodes                     │  │
│  │  • SONA trajectory tracking                               │  │
│  │  • Pattern discovery from past completions                │  │
│  │  • Predict optimal next action                            │  │
│  │  • Build re-engagement context with recommendations       │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Task Discovery Sources

Autopilot discovers incomplete tasks from three sources, aggregated into a unified view:

| Source | Location | Format | Priority |
|--------|----------|--------|----------|
| **Team Tasks** | `~/.claude/tasks/{team-name}/` | Claude Code task files | Highest |
| **Swarm Tasks** | `.claude-flow/swarm-tasks.json` | agentic-flow swarm state | High |
| **Checklist Files** | `.claude-flow/data/checklist.json` | Manual task checklists | Normal |

A task is **incomplete** if its status is not one of: `completed`, `done`, `cancelled`, `skipped`.

### Completion Criteria

The autopilot loop exits (allows the agent to stop) when **any** of these conditions is true:

1. **All tasks complete**: Every discovered task has a terminal status
2. **Max iterations reached**: Default 50, configurable up to 1000
3. **Timeout exceeded**: Default 240 minutes, configurable up to 24 hours
4. **Manual disable**: User runs `npx claude-flow autopilot disable` or calls `autopilot_disable` MCP tool
5. **No tasks found**: If all 3 sources return zero tasks (nothing to track)

### Re-Engagement Protocol

When the autopilot coordinator detects incomplete tasks and decides to continue, it builds a **re-engagement context** that includes:

```typescript
interface ReEngagementContext {
  // From AutopilotLearning (AgentDB)
  pastFailures: Array<{ task: string; critique?: string; reward: number }>;
  pastSuccesses: Array<{ task: string; reward: number }>;
  patterns: Array<{ pattern: string; frequency: number; avgReward: number }>;
  recommendations: string[];
  confidence: number;  // 0-1, based on episode count

  // From task discovery
  remainingTasks: Array<{ id: string; subject: string; status: string; source: string }>;
  completedTasks: number;
  totalTasks: number;
  progressPercent: number;
}
```

This context is injected into the agent's prompt as:

```
AUTOPILOT: {completedTasks}/{totalTasks} tasks complete ({progressPercent}%).
Remaining: {remainingTasks as bullet list}
{if learning available: Past patterns suggest: {recommendations}}
Continue working on the remaining tasks. Do not stop until all are complete.
```

---

## Implementation Plan

### Phase 1: CLI Command (npx claude-flow autopilot)

**File**: `v3/@claude-flow/cli/src/commands/autopilot.ts`

Add 9 subcommands that delegate to agentic-flow's `handleAutopilotCommand()`:

| Subcommand | Description | Key Options |
|------------|-------------|-------------|
| `status` | Show autopilot state, iterations, progress | `--json` |
| `enable` | Enable persistent completion | — |
| `disable` | Disable re-engagement loop | — |
| `config` | Set max iterations, timeout, task sources | `--max-iterations`, `--timeout`, `--task-sources` |
| `reset` | Reset iteration counter and start time | — |
| `log` | View autopilot event log | `--last N`, `--json`, `--clear` |
| `learn` | Discover success patterns from AgentDB | `--json` |
| `history` | Search past completion episodes | `--query`, `--limit`, `--json` |
| `predict` | Predict optimal next action | `--json` |

**Import path**: `agentic-flow/dist/agentic-flow/src/cli/autopilot-cli.js` (not yet re-exported from coordination index — needs agentic-flow export fix or direct path import)

### Phase 2: MCP Tools Registration

**File**: `v3/@claude-flow/cli/src/mcp-tools/autopilot-tools.ts`

Register 10 MCP tools by wrapping agentic-flow's `registerAutopilotTools()` or implementing a thin adapter layer:

| MCP Tool | Purpose | Input |
|----------|---------|-------|
| `autopilot_status` | Current state + task progress | `{ json?: boolean }` |
| `autopilot_enable` | Enable persistent completion | `{}` |
| `autopilot_disable` | Disable re-engagement | `{}` |
| `autopilot_config` | Configure limits | `{ maxIterations?, timeoutMinutes?, taskSources? }` |
| `autopilot_reset` | Reset counters | `{}` |
| `autopilot_log` | Retrieve event log | `{ last?: number, json?: boolean }` |
| `autopilot_progress` | Detailed per-source task progress | `{}` |
| `autopilot_learn` | Discover success patterns | `{ json?: boolean }` |
| `autopilot_history` | Search past episodes | `{ query: string, limit?: number }` |
| `autopilot_predict` | Predict next action | `{ json?: boolean }` |

**Registration**: Add to `mcp-tools/index.ts` exports and `mcp-client.ts` `registerTools()`.

### Phase 3: Stop Hook Integration

**File**: `v3/@claude-flow/cli/src/hooks/autopilot-stop-hook.ts`

The stop hook is the critical integration point. It runs when an agent or the main Claude session attempts to end:

```typescript
// Pseudocode for the stop hook
async function autopilotStopHook(context: StopHookContext): Promise<StopHookResult> {
  // 1. Check if autopilot is enabled
  const config = loadAutopilotConfig();
  if (!config.enabled) return { allowStop: true };

  // 2. Check safety limits
  const state = loadAutopilotState();
  if (state.iterations >= config.maxIterations) {
    logEvent('max-iterations-reached', state);
    return { allowStop: true, reason: `Max iterations (${config.maxIterations}) reached` };
  }
  if (Date.now() - state.startTime > config.timeoutMinutes * 60000) {
    logEvent('timeout-reached', state);
    return { allowStop: true, reason: `Timeout (${config.timeoutMinutes}min) reached` };
  }

  // 3. Discover tasks from all sources
  const tasks = await discoverTasks(config.taskSources);
  const incomplete = tasks.filter(t => !isTerminal(t.status));

  if (incomplete.length === 0) {
    // All done — record success and allow stop
    await learning.recordTaskCompletion({
      taskId: state.sessionId,
      subject: `Session completion: ${tasks.length} tasks`,
      status: 'completed',
      iterations: state.iterations,
      durationMs: Date.now() - state.startTime,
    });
    await learning.endSwarmTrajectory({ completed: tasks.length, total: tasks.length });
    logEvent('all-tasks-complete', { total: tasks.length, iterations: state.iterations });
    return { allowStop: true };
  }

  // 4. Tasks remain — build re-engagement context
  state.iterations++;
  saveAutopilotState(state);

  const reEngagement = await learning.getReEngagementContext(
    incomplete.map(t => ({ subject: t.subject, status: t.status }))
  );

  await learning.recordIterationStep(
    { completed: tasks.length - incomplete.length, total: tasks.length, iterations: state.iterations, progress: (tasks.length - incomplete.length) / tasks.length },
    []  // drift signals
  );

  logEvent('re-engaging', {
    iteration: state.iterations,
    completed: tasks.length - incomplete.length,
    remaining: incomplete.length,
    confidence: reEngagement.confidence,
  });

  // 5. Build continuation prompt
  const prompt = buildReEngagementPrompt(incomplete, reEngagement, state);

  return {
    allowStop: false,
    continueWith: prompt,
    reason: `${incomplete.length}/${tasks.length} tasks remaining (iteration ${state.iterations}/${config.maxIterations})`,
  };
}
```

**Hook registration**: Add to `.claude/settings.json` via `init` command:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "npx claude-flow@latest hooks autopilot-check"
          }
        ]
      }
    ]
  }
}
```

### Phase 4: CLAUDE.md Autopilot Instructions

**File**: `v3/@claude-flow/cli/src/init/executor.ts`

When `npx claude-flow init` runs, inject autopilot behavioral instructions into the generated CLAUDE.md:

```markdown
## Autopilot: Persistent Task Completion

This project uses autopilot for persistent swarm completion. When enabled:

1. **Do not stop early**: Continue working until ALL tasks in the task list are complete
2. **Check task status**: Before finishing, verify every task is marked `completed`
3. **Re-engage on incomplete**: If tasks remain, continue working on them
4. **Report progress**: Periodically report completion percentage

### Autopilot Commands
- `npx claude-flow autopilot status` — Check current progress
- `npx claude-flow autopilot enable` — Enable persistent completion
- `npx claude-flow autopilot disable` — Disable (allow early stop)
- `npx claude-flow autopilot predict` — Get AI-recommended next action
```

### Phase 5: agentic-flow Export Fix

**File**: `agentic-flow/src/coordination/index.ts` (in agentic-flow repo)

The autopilot modules exist in the build output but are not re-exported. Add:

```typescript
// coordination/index.ts
export { AutopilotLearning } from './autopilot-learning.js';
export type { AutopilotEpisode, ReEngagementContext, LearningMetrics } from './autopilot-learning.js';
```

```typescript
// mcp/fastmcp/tools/index.ts
export { registerAutopilotTools } from './autopilot-tools.js';
```

```typescript
// cli/index.ts
export { handleAutopilotCommand } from './autopilot-cli.js';
```

Add to `package.json` exports:

```json
{
  "exports": {
    "./autopilot": "./dist/coordination/autopilot-learning.js",
    "./autopilot/cli": "./dist/cli/autopilot-cli.js",
    "./autopilot/mcp": "./dist/mcp/fastmcp/tools/autopilot-tools.js"
  }
}
```

Publish as `agentic-flow@3.0.0-alpha.3`.

---

## State Management

### Autopilot State File

**Location**: `.claude-flow/data/autopilot-state.json`

```json
{
  "sessionId": "ulid-session-id",
  "enabled": true,
  "startTime": 1770837879989,
  "iterations": 0,
  "maxIterations": 50,
  "timeoutMinutes": 240,
  "taskSources": ["team-tasks", "swarm-tasks", "file-checklist"],
  "lastCheck": null,
  "history": []
}
```

### Autopilot Event Log

**Location**: `.claude-flow/data/autopilot-log.json`

Array of events:

```json
[
  { "ts": 1770837880000, "event": "enabled", "config": { "maxIterations": 50 } },
  { "ts": 1770837890000, "event": "re-engaging", "iteration": 1, "completed": 3, "remaining": 5, "confidence": 0.72 },
  { "ts": 1770837990000, "event": "re-engaging", "iteration": 2, "completed": 6, "remaining": 2, "confidence": 0.85 },
  { "ts": 1770838090000, "event": "all-tasks-complete", "total": 8, "iterations": 3, "durationMs": 210000 }
]
```

### Configuration Persistence

**Location**: `.claude/settings.json` under `claudeFlow.autopilot`

```json
{
  "claudeFlow": {
    "autopilot": {
      "enabled": true,
      "maxIterations": 50,
      "timeoutMinutes": 240,
      "taskSources": ["team-tasks", "swarm-tasks", "file-checklist"],
      "completionCriteria": "all-tasks-done",
      "logFile": ".claude-flow/data/autopilot-log.json"
    }
  }
}
```

---

## Learning Integration

### Episode Recording

Every time autopilot allows a stop (success) or hits a limit (failure), it records an episode:

**Success episode**:
```typescript
await learning.recordTaskCompletion({
  taskId: sessionId,
  subject: `Completed: ${taskSummary}`,
  status: 'completed',
  iterations: state.iterations,
  durationMs: elapsed,
});
```

**Failure episode** (max iterations or timeout):
```typescript
await learning.recordTaskFailure({
  taskId: sessionId,
  subject: `Incomplete: ${incompleteTasks.length} remaining`,
  status: 'timeout',
  iterations: state.iterations,
  durationMs: elapsed,
  critique: `Stopped at ${progressPercent}% — remaining: ${incompleteList}`,
});
```

### Reward Calculation

The reward formula balances efficiency (fewer iterations = better) and speed (shorter duration = better):

```
reward = (1 - iterations/(iterations + 10)) * 0.6 + (1 - min(durationMs/3600000, 1)) * 0.4
```

| Iterations | Duration | Reward | Interpretation |
|-----------|----------|--------|----------------|
| 1 | 5 min | 0.94 | Excellent — completed quickly with no re-engagement |
| 3 | 15 min | 0.83 | Good — needed 3 iterations but stayed fast |
| 10 | 60 min | 0.54 | Moderate — struggled but completed within an hour |
| 50 | 240 min | 0.09 | Poor — hit max iterations, long duration |

### SONA Trajectory Tracking

For multi-step learning across sessions:

1. **Begin**: `learning.beginSwarmTrajectory(sessionId)` at autopilot enable
2. **Step**: `learning.recordIterationStep(state, driftSignals)` at each re-engagement
3. **End**: `learning.endSwarmTrajectory(finalState)` at completion or timeout
4. **Patterns**: `learning.discoverSuccessPatterns()` to extract reusable strategies

---

## Safety Mechanisms

| Mechanism | Default | Max | Description |
|-----------|---------|-----|-------------|
| Max iterations | 50 | 1000 | Hard limit on re-engagement attempts |
| Timeout | 240 min | 1440 min (24hr) | Wall-clock timeout from first enable |
| Manual disable | — | — | `autopilot disable` stops immediately |
| Task source validation | — | — | Only reads from known, safe paths |
| No destructive actions | — | — | Re-engagement only injects prompts, never executes commands |
| Progress monotonicity check | — | — | If progress hasn't increased in 5 iterations, warn and suggest different approach |
| Cost awareness | — | — | Log estimated token usage per iteration for budget tracking |

### Stall Detection

If the completion count hasn't increased for 5 consecutive iterations, autopilot logs a warning and includes it in the re-engagement context:

```
WARNING: No progress in 5 iterations. Consider:
- Breaking remaining tasks into smaller subtasks
- Trying a different approach
- Checking if tasks are blocked on external dependencies
```

After 10 stalled iterations, autopilot disables itself and records a failure episode with the stall pattern.

---

## Implementation Order

| Phase | Effort | Dependency | Description |
|-------|--------|------------|-------------|
| **5** | 30 min | agentic-flow repo | Export autopilot modules, publish alpha.3 |
| **1** | 2 hr | Phase 5 | CLI `autopilot` command with 9 subcommands |
| **2** | 2 hr | Phase 5 | 10 MCP tools registered in MCP server |
| **3** | 3 hr | Phase 1+2 | Stop hook integration with task discovery |
| **4** | 1 hr | Phase 1 | CLAUDE.md injection in `init` command |

**Total estimated effort**: 8-9 hours across both repos.

### Acceptance Criteria

1. `npx claude-flow autopilot status` returns current state (enabled, iterations, progress)
2. `npx claude-flow autopilot enable/disable` toggles persistent completion
3. `npx claude-flow autopilot config --max-iterations 100` persists to settings
4. All 10 MCP tools respond correctly when called via MCP client
5. Stop hook intercepts agent stop and re-engages when tasks remain
6. Stop hook allows stop when all tasks are complete
7. Stop hook respects max iterations and timeout limits
8. AgentDB learning records episodes and can discover patterns
9. `npx claude-flow autopilot predict` returns actionable recommendations
10. `npx claude-flow init` includes autopilot configuration in generated settings
11. Stall detection triggers after 5 iterations with no progress
12. All existing tests continue to pass (no regressions)

---

## Consequences

### Positive

- Swarms run to 100% completion without manual "continue" prompts
- System learns from every completion/failure, improving over time
- Predictive actions reduce iteration count for familiar task patterns
- Safety limits prevent runaway execution and cost overruns
- Works without AgentDB (graceful degradation — no learning, but still completes)
- Compatible with existing Claude Code task system, swarm tasks, and checklists

### Negative

- Additional agentic-flow dependency surface (autopilot modules must be published)
- Stop hook adds latency to every agent stop event (task discovery scan)
- Learning database grows over time (needs periodic pruning strategy)
- Complex multi-source task discovery may have edge cases with conflicting task states
- Re-engagement prompts consume tokens, adding to session cost

### Risks

- **False re-engagement**: Tasks marked as "in_progress" by a terminated agent could cause infinite re-engagement. Mitigation: stall detection + timeout.
- **Context exhaustion**: Re-engagement injects text that consumes context window. Mitigation: compact re-engagement prompts, limit to top 5 remaining tasks.
- **Cost runaway**: 50 iterations of re-engagement could be expensive. Mitigation: configurable limits, cost tracking in event log, budget-aware config option.

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `v3/@claude-flow/cli/src/commands/autopilot.ts` | CLI command with 9 subcommands |
| `v3/@claude-flow/cli/src/mcp-tools/autopilot-tools.ts` | 10 MCP tools |
| `v3/@claude-flow/cli/src/hooks/autopilot-stop-hook.ts` | Stop hook coordinator |
| `v3/@claude-flow/cli/__tests__/autopilot.test.ts` | Unit tests |

### Modified Files

| File | Change |
|------|--------|
| `v3/@claude-flow/cli/src/commands/index.ts` | Register autopilot command |
| `v3/@claude-flow/cli/src/mcp-tools/index.ts` | Export autopilotTools |
| `v3/@claude-flow/cli/src/mcp-client.ts` | Register autopilot tools in registerTools() |
| `v3/@claude-flow/cli/src/init/executor.ts` | Inject autopilot config in CLAUDE.md + settings |

### agentic-flow Repo Changes

| File | Change |
|------|--------|
| `src/coordination/index.ts` | Re-export AutopilotLearning |
| `src/mcp/fastmcp/tools/index.ts` | Re-export registerAutopilotTools |
| `src/cli/index.ts` | Re-export handleAutopilotCommand |
| `package.json` | Add `./autopilot`, `./autopilot/cli`, `./autopilot/mcp` exports |
