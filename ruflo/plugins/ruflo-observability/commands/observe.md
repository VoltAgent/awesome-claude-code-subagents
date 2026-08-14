---
name: observe
description: Observability operations — trace agent execution, view metrics, filter logs, and correlate telemetry
---

Observability commands:

**`observe trace <task-id>`** -- Trace agent execution for a specific task.
1. Query `observability` namespace for all spans matching `<task-id>`
2. Build a trace tree from parent-child span relationships
3. Calculate duration for each span and identify the critical path
4. Flag bottlenecks: spans exceeding p95 duration for their operation type
5. Display: trace tree with span names, durations, status, and agent attribution

**`observe metrics [--period 1h]`** -- View aggregated system metrics.
1. Recall metrics data from `observability` namespace for the specified period
2. Aggregate counters (total), gauges (current), histograms (p50, p95, p99)
3. Compute: tasks completed, errors, active agents, avg task duration, token usage
4. Flag anomalies: metrics deviating >2 standard deviations from baseline
5. Display: metric name, current value, trend (up/down/stable), anomaly flag

**`observe logs [--level error]`** -- Filter and display structured logs.
1. Recall log entries from `observability` namespace filtered by level
2. Sort by timestamp (most recent first)
3. Group by correlation ID to show related log sequences
4. Display: timestamp, level, message, agent ID, task ID, correlation ID
5. If `--level error`, also show stack traces and suggested remediation

**`observe dashboard`** -- Show a combined observability dashboard.
1. Collect latest metrics, recent errors, and active traces
2. Display sections: System Health (gauges), Recent Activity (counters), Active Traces (spans), Errors (last 10)
3. Compute overall health score: green (all normal), yellow (warnings), red (errors)
4. Show cost summary from ruflo-cost-tracker if available

**`observe correlate <agent-id>`** -- Correlate all telemetry for a specific agent.
1. Query logs, traces, and metrics filtered by `<agent-id>`
2. Build a timeline of the agent's activity: spawn, task assignments, completions, errors
3. Cross-reference with other agents' telemetry for shared correlation IDs
4. Display: chronological timeline with logs, spans, and metric snapshots
