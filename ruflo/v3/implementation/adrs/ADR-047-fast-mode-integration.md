# ADR-047: Fast Mode Integration for Claude Code

**Status:** Proposed
**Date:** 2026-02-08
**Authors:** RuvNet, Claude Flow Team

## Context

Claude Code has introduced **Fast Mode** as a research preview feature that provides faster Opus 4.6 responses at higher cost. This feature is valuable for interactive work where latency matters more than cost, such as rapid iteration and live debugging.

### What is Fast Mode?

Fast Mode is not a different model - it uses the same Opus 4.6 with a different API configuration that prioritizes speed over cost efficiency. Users get identical quality and capabilities, just faster responses.

### Key Characteristics

| Aspect | Details |
|--------|---------|
| Toggle | `/fast` command or `"fastMode": true` in settings |
| Model | Opus 4.6 (same quality, faster delivery) |
| Indicator | `↯` icon next to prompt when active |
| Persistence | Persists across sessions |
| Availability | Pro/Max/Team/Enterprise plans (extra usage) |

### Pricing (Research Preview)

| Mode | Input (MTok) | Output (MTok) |
|------|--------------|---------------|
| Fast mode (<200K context) | $30 | $150 |
| Fast mode (>200K context) | $60 | $225 |
| Standard Opus 4.6 | $15 | $75 |

**Note:** 50% discount available until Feb 16, 2026 11:59pm PT.

## Decision

Integrate Fast Mode awareness into RuvFlow/Claude-Flow to enable:

1. **Automatic Fast Mode for time-critical swarm tasks**
2. **Settings integration** for user preference management
3. **Cost-aware routing** that considers fast mode pricing
4. **Statusline indicator** showing fast mode state

### Integration Points

#### 1. Settings Generator Update

Add fast mode configuration to `.claude/settings.json`:

```json
{
  "fastMode": false,
  "claudeFlow": {
    "fastMode": {
      "enabled": false,
      "autoEnable": {
        "forDebugTasks": true,
        "forInteractiveSessions": true,
        "forTimeCriticalTasks": true
      },
      "costWarning": true,
      "fallbackBehavior": "continue"
    }
  }
}
```

#### 2. Routing Intelligence

Update the 3-tier routing model (ADR-026) to include fast mode consideration:

| Tier | Handler | Fast Mode | Use Case |
|------|---------|-----------|----------|
| 1 | Agent Booster (WASM) | N/A | Simple transforms |
| 2 | Haiku | N/A | Simple tasks |
| 3a | Opus (Standard) | Off | Complex tasks, cost-sensitive |
| 3b | Opus (Fast) | On | Complex tasks, time-critical |

#### 3. CLI Hooks

Add fast mode hooks for swarm coordination:

```bash
# Pre-task hook checks if fast mode should be enabled
npx ruvflow hooks pre-task --enable-fast-mode-if-critical

# Post-task hook can disable fast mode to save costs
npx ruvflow hooks post-task --restore-standard-mode
```

#### 4. Swarm Coordination

For swarm tasks, fast mode decisions should consider:

- **Task urgency**: Enable for live debugging, disable for batch processing
- **Budget constraints**: Check remaining extra usage credits
- **Rate limits**: Handle automatic fallback gracefully

### Fast Mode vs Effort Level

These are complementary settings:

| Setting | Effect | Best For |
|---------|--------|----------|
| Fast Mode | Same quality, lower latency, higher cost | Interactive work |
| Lower Effort | Less thinking, faster, potentially lower quality | Straightforward tasks |
| Both | Maximum speed, higher cost, reduced thinking | Quick simple iterations |

### Rate Limit Handling

When fast mode rate limits are hit:

1. Fast mode automatically falls back to standard Opus 4.6
2. The `↯` icon turns gray (cooldown indicator)
3. Work continues at standard speed/pricing
4. Fast mode auto-re-enables when cooldown expires

RuvFlow should detect this and:
- Log the fallback event
- Adjust cost tracking accordingly
- Notify swarm coordinator of reduced speed

## Consequences

### Positive

1. **Faster interactive sessions**: 2-5x faster responses for debugging
2. **Flexible cost/speed tradeoff**: Users control when to prioritize speed
3. **Better UX**: Reduced waiting during rapid iteration
4. **Swarm optimization**: Time-critical tasks complete faster

### Negative

1. **Higher costs**: 2x token pricing in fast mode
2. **Extra usage required**: Not included in subscription limits
3. **Team/Enterprise friction**: Requires admin enablement
4. **Complexity**: Another dimension in routing decisions

### Neutral

1. **Same model quality**: No accuracy tradeoff
2. **Research preview**: Feature may change

## Implementation

### Phase 1: Awareness (Settings)

```typescript
// types.ts - Add fast mode types
interface FastModeConfig {
  enabled: boolean;
  autoEnable: {
    forDebugTasks: boolean;
    forInteractiveSessions: boolean;
    forTimeCriticalTasks: boolean;
  };
  costWarning: boolean;
  fallbackBehavior: 'continue' | 'pause' | 'notify';
}
```

### Phase 2: Settings Generator

Update `settings-generator.ts`:

```typescript
// Add to generateSettings()
settings.fastMode = options.fastMode?.enabled || false;

settings.claudeFlow.fastMode = {
  enabled: options.fastMode?.enabled || false,
  autoEnable: {
    forDebugTasks: true,
    forInteractiveSessions: true,
    forTimeCriticalTasks: true,
  },
  costWarning: true,
  fallbackBehavior: 'continue',
};
```

### Phase 3: Routing Integration

Update pre-task hook to consider fast mode:

```typescript
// In hooks/pre-task.ts
async function shouldEnableFastMode(task: TaskDescription): Promise<boolean> {
  const config = await loadFastModeConfig();

  if (!config.enabled) return false;

  // Check task characteristics
  if (config.autoEnable.forDebugTasks && task.isDebugTask) return true;
  if (config.autoEnable.forTimeCriticalTasks && task.priority === 'critical') return true;
  if (config.autoEnable.forInteractiveSessions && isInteractiveSession()) return true;

  return false;
}
```

### Phase 4: Statusline Integration

Update statusline to show fast mode state:

```javascript
// In statusline.cjs
const fastModeIndicator = fastModeEnabled ? '↯' : '';
const modelDisplay = `${modelName}${fastModeIndicator}`;
```

### Phase 5: Documentation

Update CLAUDE.md with fast mode guidance:

```markdown
## Fast Mode

Enable fast mode for time-critical tasks:

\`\`\`bash
# Toggle in Claude Code
/fast

# Or in settings
"fastMode": true
\`\`\`

**Cost:** 2x standard Opus 4.6 pricing
**Best for:** Live debugging, rapid iteration, tight deadlines
**Avoid for:** Batch processing, CI/CD, cost-sensitive workloads
```

## Alternatives Considered

### 1. Always Use Fast Mode

**Pros:** Maximum speed
**Cons:** 2x costs, not always needed
**Decision:** Rejected - costs would be prohibitive for long tasks

### 2. Ignore Fast Mode

**Pros:** Simpler implementation
**Cons:** Miss performance optimization opportunity
**Decision:** Rejected - users expect modern feature support

### 3. Auto-Detect and Enable

**Pros:** Zero user configuration
**Cons:** Unpredictable costs, user may not want it
**Decision:** Rejected - cost control requires explicit opt-in

## Migration

No migration needed - this is an additive feature. Existing users:
- Default: fast mode disabled
- Opt-in: Enable via settings or `/fast` command

## Metrics for Success

| Metric | Target |
|--------|--------|
| Adoption rate | 20% of interactive sessions |
| User satisfaction | Positive feedback on speed |
| Cost predictability | No surprise bills |

## References

- Source: https://code.claude.com/docs/en/fast-mode
- Related: ADR-026 (3-Tier Model Routing)
- Related: ADR-018 (Claude Code Integration)

## Appendix: CLI Reference

### Commands

| Command | Description |
|---------|-------------|
| `/fast` | Toggle fast mode on/off |
| `/model` | Switch models (fast mode stays on Opus) |

### Settings

```json
{
  "fastMode": true,
  "claudeFlow": {
    "fastMode": {
      "enabled": true,
      "autoEnable": {
        "forDebugTasks": true,
        "forInteractiveSessions": true,
        "forTimeCriticalTasks": true
      },
      "costWarning": true,
      "fallbackBehavior": "continue"
    }
  }
}
```

### Rate Limit Behavior

1. Fast mode has separate rate limits from standard Opus
2. On rate limit: automatic fallback to standard Opus
3. Visual indicator: `↯` icon turns gray during cooldown
4. Auto-recovery: fast mode re-enables when cooldown expires

---

**Decision Date:** 2026-02-08
**Review Date:** 2026-03-08 (30 days post-implementation)
