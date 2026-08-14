# ADR-037: Autopilot Mode with Parallel Task UI, Web Workers & RuVector WASM

**Status:** Accepted
**Date:** 2026-03-05
**Related:** ADR-035 (MCP Tool Groups), ADR-029 (HF Chat UI), ADR-002 (WASM Core)

## Context

HF Chat UI currently operates in a strict request-response cycle:

1. User sends message
2. AI responds (possibly calling MCP tools)
3. Chat UI renders tool results inline as a flat list
4. **AI stops and waits for the next user message**

This has two fundamental problems:

### Problem 1: No Auto-Continue

Multi-step agentic workflows (research → plan → implement → test → report) require the user to manually prompt "continue" after every tool call. For complex tasks, this creates 5-15 unnecessary round-trips.

**Claude Code** solves this with a bypass permissions toggle that lets the agent run autonomously.

### Problem 2: No Parallel Task Visibility

When the AI spawns multiple agents or runs concurrent tool calls, the UI shows them as a flat sequential list. There is no way to:

- See multiple tasks running in parallel with independent progress
- Collapse/expand individual task details to manage visual complexity
- Lazy-load task details only when the user expands them (memory efficiency)
- Manage agent swarms with browser-native performance

**Claude Code** shows parallel tool calls as collapsible cards — each with a header (tool name + status), expandable detail area, and real-time streaming. The collapsed state shows just the header; expanded shows full output. Multiple cards run simultaneously.

### Problem 3: No In-Browser Agent Intelligence

All agent coordination runs server-side. The browser is a dumb terminal. With RuVector WASM compiled to WebAssembly, agent routing, memory search, pattern matching, and swarm topology can run directly in the browser — reducing latency, enabling offline capabilities, and offloading the server.

**agentic-flow@latest** provides the backend autopilot capability. **RuVector WASM** provides in-browser intelligence. **Web Workers** provide non-blocking parallel execution. This ADR combines all three.

## Decision

Add three integrated capabilities to HF Chat UI:

1. **Autopilot Mode** — auto-continue toggle (server-side loop in MCP bridge)
2. **Parallel Task UI** — Claude Code-style collapsible task cards with lazy rendering
3. **WASM Agent Runtime** — RuVector WASM + Web Workers for in-browser agent coordination

---

## Part 1: Autopilot Mode

### UX Design

```
┌──────────────────────────────────────────────────────────────────┐
│  Chat messages...                                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Type a message...                              [Send]       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                          [Stop]              ⚡ Autopilot [ON]   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

- **Toggle position**: Below the input box, right-aligned
- **Visual states**: OFF (muted/gray), ON (electric blue glow, `⚡` icon)
- **Stop button**: Appears during autopilot execution, cancels the loop
- **Step counter**: Shows `Step 3/20` during execution

### How It Works

#### Standard Mode (Autopilot OFF)
```
User → AI → [tool_call] → execute → show result → STOP (wait for user)
```

#### Autopilot Mode (Autopilot ON)
```
User → AI → [tool_calls] → execute all in parallel → feed results back to AI →
  [more tool_calls] → execute → feed back → ... → text-only response → STOP
```

### Server-Side Autopilot Loop

The loop runs in the MCP bridge to avoid deep modifications to HF Chat UI's SvelteKit internals:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           MCP Bridge v2.1                                │
│                                                                          │
│  /chat/completions                                                       │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  1. Receive request with x-autopilot: true                         │  │
│  │                                                                    │  │
│  │  2. AUTOPILOT LOOP:                                                │  │
│  │     a. Send messages to upstream AI (Gemini/OpenAI/OpenRouter)     │  │
│  │     b. If response has tool_calls:                                 │  │
│  │        - Execute ALL tool calls in parallel (Promise.allSettled)   │  │
│  │        - Stream structured task events to client (SSE)             │  │
│  │        - Append tool results to messages[]                         │  │
│  │        - Loop back to (a)                                          │  │
│  │     c. If response is text-only: break, stream final response      │  │
│  │     d. If max_steps reached: break with warning                    │  │
│  │                                                                    │  │
│  │  3. Stream final response + done signal                            │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Protocol: Structured SSE Events

Instead of flat text markers, the bridge streams **structured JSON events** that the Parallel Task UI can parse:

```
// Stream opens
data: {"type":"autopilot_start","maxSteps":20}

// AI decides to call 3 tools in parallel
data: {"type":"task_group_start","groupId":"g1","step":1,"tasks":[
  {"taskId":"t1","tool":"memory_search","args":{"query":"auth patterns"},"status":"running"},
  {"taskId":"t2","tool":"agent_spawn","args":{"type":"researcher"},"status":"running"},
  {"taskId":"t3","tool":"hooks_route","args":{"task":"security audit"},"status":"running"}
]}

// Task t1 completes
data: {"type":"task_update","taskId":"t1","status":"completed","duration":230,
  "summary":"3 patterns found","detail":"[full result hidden until expanded]",
  "detailToken":"dt_a7f3"}

// Task t2 completes
data: {"type":"task_update","taskId":"t2","status":"completed","duration":1200,
  "summary":"Agent researcher-8b2c spawned","detail":null,"detailToken":"dt_b8e2"}

// Task t3 completes
data: {"type":"task_update","taskId":"t3","status":"completed","duration":180,
  "summary":"Routed to security-architect","detail":null,"detailToken":"dt_c9f1"}

// Group complete, AI continues
data: {"type":"task_group_end","groupId":"g1","step":1,"duration":1200}

// Next round — AI calls 2 more tools
data: {"type":"task_group_start","groupId":"g2","step":2,"tasks":[
  {"taskId":"t4","tool":"security_scan","args":{"target":"./src"},"status":"running"},
  {"taskId":"t5","tool":"agent_spawn","args":{"type":"coder"},"status":"running"}
]}

// ... more updates ...

// AI produces final text
data: {"type":"autopilot_text","content":"Based on my analysis, here are the findings..."}

// Done
data: {"type":"autopilot_end","totalSteps":4,"totalTasks":9,"duration":12400}

data: [DONE]
```

### Detail Token Lazy Loading

Full tool results are NOT streamed inline — they are stored server-side and fetched on-demand when the user expands a task card:

```
GET /autopilot/detail/dt_a7f3
→ { "content": "[full 50KB memory search result]" }
```

This keeps the SSE stream lightweight (summaries only) and avoids wasting browser memory on collapsed task details.

---

## Part 2: Parallel Task UI (Claude Code-Style)

### Visual Design

When autopilot is running or the AI calls multiple tools, the chat renders **task cards** instead of flat text:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🤖 Assistant                                                         │
│                                                                      │
│ I'll analyze your codebase for security issues. Running 3 checks     │
│ in parallel...                                                       │
│                                                                      │
│ ┌─ Step 1/4 ─────────────────────────────────────────────────────┐   │
│ │                                                                 │   │
│ │  ✅ memory_search                              230ms    [▼]    │   │
│ │  ┌─────────────────────────────────────────────────────────┐   │   │
│ │  │ Found 3 patterns:                                       │   │   │
│ │  │ 1. JWT validation (confidence: 0.94)                    │   │   │
│ │  │ 2. CORS configuration (confidence: 0.87)                │   │   │
│ │  │ 3. Input sanitization (confidence: 0.82)                │   │   │
│ │  └─────────────────────────────────────────────────────────┘   │   │
│ │                                                                 │   │
│ │  ✅ agent_spawn(researcher)                    1.2s     [▶]    │   │
│ │                                                                 │   │
│ │  ⏳ hooks_route(security audit)                 ...     [▶]    │   │
│ │                                                                 │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│ ┌─ Step 2/4 ─────────────────────────────────────────────────────┐   │
│ │                                                                 │   │
│ │  🔄 security_scan(./src)                        ...     [▶]    │   │
│ │  🔄 agent_spawn(coder)                          ...     [▶]    │   │
│ │                                                                 │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│ ⚡ Autopilot running — Step 2/20                           [Stop]    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Task Card States

| State | Icon | Color | Description |
|-------|------|-------|-------------|
| `queued` | `○` | gray | Waiting to execute |
| `running` | `🔄` | blue pulse | Currently executing |
| `completed` | `✅` | green | Finished successfully |
| `failed` | `❌` | red | Error occurred |
| `blocked` | `⚠️` | amber | Requires user confirmation |
| `cancelled` | `⊘` | gray | Cancelled by user/timeout |

### Task Card Component

```svelte
<!-- src/lib/components/TaskCard.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let taskId: string;
  export let tool: string;
  export let status: 'queued' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled';
  export let summary: string = '';
  export let duration: number | null = null;
  export let detailToken: string | null = null;
  export let args: Record<string, any> = {};

  let expanded = false;
  let detail: string | null = null;
  let loadingDetail = false;

  // Status icons and colors
  const STATUS_CONFIG = {
    queued:    { icon: '○',  color: '#6b7280', pulse: false },
    running:  { icon: '🔄', color: '#3b82f6', pulse: true  },
    completed:{ icon: '✅', color: '#22c55e', pulse: false },
    failed:   { icon: '❌', color: '#ef4444', pulse: false },
    blocked:  { icon: '⚠️', color: '#f59e0b', pulse: true  },
    cancelled:{ icon: '⊘',  color: '#6b7280', pulse: false },
  };

  $: config = STATUS_CONFIG[status];

  // Lazy load detail only when expanded
  async function toggleExpand() {
    expanded = !expanded;
    if (expanded && detail === null && detailToken) {
      loadingDetail = true;
      try {
        const res = await fetch(`/autopilot/detail/${detailToken}`);
        const data = await res.json();
        detail = data.content;
      } catch (e) {
        detail = `Error loading detail: ${e.message}`;
      }
      loadingDetail = false;
    }
  }

  // Free memory when collapsed
  function collapse() {
    expanded = false;
    // Optionally release detail from memory after a delay
    // detail = null; // uncomment for aggressive memory saving
  }

  // Format duration
  $: durationStr = duration != null
    ? duration < 1000 ? `${duration}ms` : `${(duration/1000).toFixed(1)}s`
    : '...';

  // Format tool name for display
  $: displayName = tool.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

  // Compact args summary
  $: argsStr = Object.entries(args)
    .map(([k, v]) => typeof v === 'string' ? v : JSON.stringify(v))
    .join(', ')
    .substring(0, 60);
</script>

<div class="task-card" class:expanded class:pulse={config.pulse}>
  <button class="task-header" on:click={toggleExpand}>
    <span class="status-icon">{config.icon}</span>
    <span class="tool-name" style="color: {config.color}">{tool}</span>
    {#if argsStr}
      <span class="tool-args">({argsStr})</span>
    {/if}
    <span class="spacer" />
    {#if summary && !expanded}
      <span class="summary">{summary}</span>
    {/if}
    <span class="duration">{durationStr}</span>
    <span class="expand-icon">{expanded ? '▼' : '▶'}</span>
  </button>

  {#if expanded}
    <div class="task-detail">
      {#if loadingDetail}
        <div class="loading">Loading...</div>
      {:else if detail}
        <pre class="detail-content">{detail}</pre>
      {:else if summary}
        <pre class="detail-content">{summary}</pre>
      {:else}
        <div class="empty">No detail available</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .task-card {
    border: 1px solid #2a2a3e;
    border-radius: 8px;
    margin: 2px 0;
    background: #12121f;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .task-card.expanded {
    border-color: #3b82f6;
  }
  .task-card.pulse {
    animation: pulse-border 2s infinite;
  }
  @keyframes pulse-border {
    0%, 100% { border-color: #2a2a3e; }
    50% { border-color: #3b82f6; }
  }
  .task-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    width: 100%;
    background: none;
    border: none;
    color: #e2e8f0;
    cursor: pointer;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 13px;
    text-align: left;
  }
  .task-header:hover {
    background: #1a1a2e;
  }
  .status-icon { flex-shrink: 0; }
  .tool-name { font-weight: 600; flex-shrink: 0; }
  .tool-args { color: #6b7280; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
  .spacer { flex: 1; }
  .summary { color: #94a3b8; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
  .duration { color: #6b7280; font-size: 11px; flex-shrink: 0; min-width: 45px; text-align: right; }
  .expand-icon { color: #6b7280; flex-shrink: 0; font-size: 10px; }
  .task-detail {
    border-top: 1px solid #2a2a3e;
    padding: 12px;
    max-height: 400px;
    overflow-y: auto;
  }
  .detail-content {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: #cbd5e1;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .loading { color: #6b7280; font-size: 12px; }
  .empty { color: #4b5563; font-size: 12px; font-style: italic; }
</style>
```

### Task Group Component (Step Container)

```svelte
<!-- src/lib/components/TaskGroup.svelte -->
<script lang="ts">
  import TaskCard from './TaskCard.svelte';

  export let groupId: string;
  export let step: number;
  export let tasks: Array<{
    taskId: string;
    tool: string;
    status: string;
    summary?: string;
    duration?: number;
    detailToken?: string;
    args?: Record<string, any>;
  }>;
  export let duration: number | null = null;
  export let collapsed = false;

  $: allDone = tasks.every(t => ['completed','failed','cancelled'].includes(t.status));
  $: anyRunning = tasks.some(t => t.status === 'running');
  $: failCount = tasks.filter(t => t.status === 'failed').length;
  $: passCount = tasks.filter(t => t.status === 'completed').length;

  // Auto-collapse completed groups after 2s to save screen space
  $: if (allDone && !collapsed) {
    setTimeout(() => { collapsed = true; }, 2000);
  }
</script>

<div class="task-group" class:collapsed class:running={anyRunning}>
  <button class="group-header" on:click={() => collapsed = !collapsed}>
    <span class="step-badge">Step {step}</span>
    <span class="task-count">
      {passCount}/{tasks.length} tasks
      {#if failCount > 0}
        <span class="fail-count">({failCount} failed)</span>
      {/if}
    </span>
    <span class="spacer" />
    {#if duration}
      <span class="group-duration">{(duration/1000).toFixed(1)}s</span>
    {/if}
    <span class="collapse-icon">{collapsed ? '▶' : '▼'}</span>
  </button>

  {#if !collapsed}
    <div class="group-tasks">
      {#each tasks as task (task.taskId)}
        <TaskCard {...task} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .task-group {
    border: 1px solid #1e1e32;
    border-radius: 10px;
    margin: 8px 0;
    background: #0d0d1a;
    overflow: hidden;
  }
  .task-group.running {
    border-color: #1e3a5f;
  }
  .group-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    width: 100%;
    background: #111128;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 12px;
  }
  .group-header:hover { background: #161633; }
  .step-badge {
    background: #1e293b;
    color: #60a5fa;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 11px;
  }
  .task-count { color: #6b7280; }
  .fail-count { color: #ef4444; }
  .spacer { flex: 1; }
  .group-duration { color: #6b7280; font-family: monospace; }
  .collapse-icon { color: #6b7280; font-size: 10px; }
  .group-tasks { padding: 4px 8px 8px; }
</style>
```

### Memory-Efficient Rendering Strategy

Task cards are designed to use **zero memory when collapsed**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    MEMORY MODEL                                  │
│                                                                  │
│  COLLAPSED TASK CARD (~200 bytes):                               │
│  ┌─────────────────────────────────────────────┐                │
│  │ taskId: "t1"                                 │                │
│  │ tool: "memory_search"                        │                │
│  │ status: "completed"                          │                │
│  │ summary: "3 patterns found"    ← 1 line      │                │
│  │ duration: 230                                │                │
│  │ detailToken: "dt_a7f3"         ← lazy ref    │                │
│  │ detail: null                   ← NOT LOADED  │                │
│  └─────────────────────────────────────────────┘                │
│                                                                  │
│  EXPANDED TASK CARD (~200 bytes + detail size):                  │
│  ┌─────────────────────────────────────────────┐                │
│  │ ... same fields ...                          │                │
│  │ detail: "[50KB full result]"   ← LOADED      │                │
│  └─────────────────────────────────────────────┘                │
│                                                                  │
│  COLLAPSED AGAIN (aggressive mode):                              │
│  ┌─────────────────────────────────────────────┐                │
│  │ ... same fields ...                          │                │
│  │ detail: null                   ← FREED       │                │
│  └─────────────────────────────────────────────┘                │
│                                                                  │
│  With 100 tasks × 50KB details:                                  │
│  All collapsed: 100 × 200B = 20KB                               │
│  All expanded:  100 × 50KB = 5MB                                │
│  Only 3 visible: 3 × 50KB + 97 × 200B = 170KB                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Key techniques:
1. **Detail tokens** — full results stored server-side, fetched on expand
2. **Null-on-collapse** — detail freed from memory when card collapses (optional aggressive mode)
3. **Virtual scrolling** — only DOM-render task cards in viewport (for 100+ tasks)
4. **Auto-collapse** — completed step groups auto-collapse after 2 seconds
5. **Summary truncation** — collapsed cards show max 100 chars

### Virtual Scrolling for Large Task Lists

When autopilot generates 50+ tasks, virtual scrolling prevents DOM bloat:

```svelte
<!-- src/lib/components/VirtualTaskList.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import TaskGroup from './TaskGroup.svelte';

  export let groups: Array<any> = [];

  let containerEl: HTMLElement;
  let visibleRange = { start: 0, end: 10 };
  const ITEM_HEIGHT = 48; // approx height of collapsed group

  function updateVisibleRange() {
    if (!containerEl) return;
    const scrollTop = containerEl.scrollTop;
    const clientHeight = containerEl.clientHeight;
    visibleRange = {
      start: Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 2),
      end: Math.min(groups.length, Math.ceil((scrollTop + clientHeight) / ITEM_HEIGHT) + 2),
    };
  }

  onMount(() => {
    containerEl?.addEventListener('scroll', updateVisibleRange, { passive: true });
    return () => containerEl?.removeEventListener('scroll', updateVisibleRange);
  });

  $: visibleGroups = groups.slice(visibleRange.start, visibleRange.end);
  $: topPadding = visibleRange.start * ITEM_HEIGHT;
  $: bottomPadding = (groups.length - visibleRange.end) * ITEM_HEIGHT;
</script>

<div class="virtual-list" bind:this={containerEl}>
  <div style="height: {topPadding}px" />
  {#each visibleGroups as group (group.groupId)}
    <TaskGroup {...group} />
  {/each}
  <div style="height: {bottomPadding}px" />
</div>

<style>
  .virtual-list {
    max-height: 600px;
    overflow-y: auto;
    scrollbar-width: thin;
  }
</style>
```

---

## Part 3: Web Workers for Non-Blocking Execution

All autopilot processing runs in Web Workers to keep the main thread responsive:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         BROWSER                                      │
│                                                                      │
│  ┌────────────────────┐     ┌─────────────────────────────────────┐ │
│  │    MAIN THREAD      │     │         WEB WORKERS                 │ │
│  │                     │     │                                     │ │
│  │  • Svelte UI        │     │  ┌─────────────────────────────┐   │ │
│  │  • User input       │◄───▶│  │  AutopilotWorker            │   │ │
│  │  • DOM rendering    │ msg │  │  • SSE stream parsing       │   │ │
│  │  • Task card state  │     │  │  • Task state machine       │   │ │
│  │                     │     │  │  • Event batching (16ms)    │   │ │
│  │  Only receives:     │     │  │  • Abort controller         │   │ │
│  │  - Batched UI       │     │  └─────────────────────────────┘   │ │
│  │    updates          │     │                                     │ │
│  │  - Final renders    │     │  ┌─────────────────────────────┐   │ │
│  │                     │     │  │  WasmAgentWorker             │   │ │
│  │  Never blocks on:   │     │  │  • RuVector WASM runtime    │   │ │
│  │  - SSE parsing      │     │  │  • Agent routing decisions  │   │ │
│  │  - JSON processing  │     │  │  • Memory/pattern search    │   │ │
│  │  - WASM execution   │     │  │  • Swarm topology mgmt     │   │ │
│  │                     │     │  └─────────────────────────────┘   │ │
│  │                     │     │                                     │ │
│  │                     │     │  ┌─────────────────────────────┐   │ │
│  │                     │     │  │  DetailFetchWorker           │   │ │
│  │                     │     │  │  • Lazy detail loading      │   │ │
│  │                     │     │  │  • LRU cache (max 20 items) │   │ │
│  │                     │     │  │  • Prefetch on hover        │   │ │
│  │                     │     │  └─────────────────────────────┘   │ │
│  │                     │     │                                     │ │
│  └────────────────────┘     └─────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### AutopilotWorker

Handles the SSE stream from the MCP bridge, parses structured events, batches UI updates at 60fps:

```typescript
// src/lib/workers/autopilot.worker.ts

interface TaskState {
  taskId: string;
  tool: string;
  status: string;
  summary?: string;
  duration?: number;
  detailToken?: string;
  args?: Record<string, any>;
}

interface GroupState {
  groupId: string;
  step: number;
  tasks: TaskState[];
  duration?: number;
}

let groups: Map<string, GroupState> = new Map();
let abortController: AbortController | null = null;
let batchTimeout: number | null = null;
let pendingUpdates: any[] = [];

// Batch UI updates at 60fps to prevent main thread jank
function flushUpdates() {
  if (pendingUpdates.length === 0) return;
  self.postMessage({ type: 'batch_update', updates: pendingUpdates, groups: [...groups.values()] });
  pendingUpdates = [];
  batchTimeout = null;
}

function queueUpdate(update: any) {
  pendingUpdates.push(update);
  if (!batchTimeout) {
    batchTimeout = setTimeout(flushUpdates, 16) as any; // ~60fps
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type, url, headers, body } = e.data;

  if (type === 'start') {
    abortController = new AbortController();
    groups.clear();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            flushUpdates();
            self.postMessage({ type: 'done', groups: [...groups.values()] });
            return;
          }

          try {
            const event = JSON.parse(data);
            handleEvent(event);
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        self.postMessage({ type: 'error', error: err.message });
      }
    }
  }

  if (type === 'stop') {
    abortController?.abort();
    flushUpdates();
    self.postMessage({ type: 'stopped', groups: [...groups.values()] });
  }
};

function handleEvent(event: any) {
  switch (event.type) {
    case 'autopilot_start':
      queueUpdate({ type: 'start', maxSteps: event.maxSteps });
      break;

    case 'task_group_start':
      groups.set(event.groupId, {
        groupId: event.groupId,
        step: event.step,
        tasks: event.tasks,
      });
      queueUpdate({ type: 'group_start', group: groups.get(event.groupId) });
      break;

    case 'task_update':
      for (const [, group] of groups) {
        const task = group.tasks.find(t => t.taskId === event.taskId);
        if (task) {
          Object.assign(task, event);
          queueUpdate({ type: 'task_update', taskId: event.taskId, ...event });
          break;
        }
      }
      break;

    case 'task_group_end':
      const group = groups.get(event.groupId);
      if (group) group.duration = event.duration;
      queueUpdate({ type: 'group_end', groupId: event.groupId, duration: event.duration });
      break;

    case 'autopilot_text':
      queueUpdate({ type: 'text', content: event.content });
      break;

    case 'autopilot_end':
      queueUpdate({ type: 'end', ...event });
      break;
  }
}
```

### DetailFetchWorker

Lazy-loads task details with LRU caching and hover-prefetch:

```typescript
// src/lib/workers/detail-fetch.worker.ts

const cache = new Map<string, string>();
const MAX_CACHE = 20;
const accessOrder: string[] = [];

function evictLRU() {
  while (cache.size > MAX_CACHE) {
    const oldest = accessOrder.shift();
    if (oldest) cache.delete(oldest);
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type, detailToken, bridgeUrl } = e.data;

  if (type === 'fetch' || type === 'prefetch') {
    // Check cache first
    if (cache.has(detailToken)) {
      const idx = accessOrder.indexOf(detailToken);
      if (idx > -1) accessOrder.splice(idx, 1);
      accessOrder.push(detailToken);
      if (type === 'fetch') {
        self.postMessage({ type: 'detail', detailToken, content: cache.get(detailToken) });
      }
      return;
    }

    try {
      const res = await fetch(`${bridgeUrl}/autopilot/detail/${detailToken}`);
      const data = await res.json();
      cache.set(detailToken, data.content);
      accessOrder.push(detailToken);
      evictLRU();

      if (type === 'fetch') {
        self.postMessage({ type: 'detail', detailToken, content: data.content });
      }
    } catch (err: any) {
      if (type === 'fetch') {
        self.postMessage({ type: 'detail_error', detailToken, error: err.message });
      }
    }
  }

  if (type === 'evict') {
    cache.delete(detailToken);
    const idx = accessOrder.indexOf(detailToken);
    if (idx > -1) accessOrder.splice(idx, 1);
  }
};
```

---

## Part 4: RuVector WASM In-Browser Agent Runtime

### Why WASM in the Browser?

Currently, all intelligence runs server-side: the MCP bridge calls ruvector/ruflo via stdio, gets results, sends them back. This adds latency and server load for operations that could run client-side.

RuVector's core capabilities — vector search, pattern matching, agent routing, HNSW indexing — are written in Rust and compile to WASM. Running them in-browser enables:

| Capability | Server-Side | WASM In-Browser |
|------------|-------------|-----------------|
| Agent routing decision | ~200ms (network + compute) | ~2ms (local WASM) |
| Pattern search (HNSW) | ~50ms (network + compute) | ~0.5ms (local WASM) |
| Swarm topology visualization | N/A (text only) | Real-time canvas rendering |
| Offline agent management | Not possible | Full local capability |
| Memory search preview | Requires API call | Instant local search |
| Cost estimation | Server calculates | Instant local estimate |

### Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    BROWSER — WASM AGENT RUNTIME                          │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     WasmAgentWorker                               │   │
│  │                                                                   │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  @ruvector/wasm (compiled from ruvector Rust crate)      │     │   │
│  │  │                                                          │     │   │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │     │   │
│  │  │  │  HNSW Index   │  │  Agent Router │  │  Pattern DB  │  │     │   │
│  │  │  │              │  │              │  │              │  │     │   │
│  │  │  │  • add()     │  │  • route()   │  │  • store()   │  │     │   │
│  │  │  │  • search()  │  │  • score()   │  │  • match()   │  │     │   │
│  │  │  │  • delete()  │  │  • rank()    │  │  • learn()   │  │     │   │
│  │  │  │              │  │              │  │              │  │     │   │
│  │  │  │  150x faster │  │  66+ agent   │  │  EWC++       │  │     │   │
│  │  │  │  than JS     │  │  types       │  │  anti-forget │  │     │   │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘  │     │   │
│  │  │                                                          │     │   │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │     │   │
│  │  │  │  Swarm Mgr    │  │  Cost Est.   │  │  Tokenizer   │  │     │   │
│  │  │  │              │  │              │  │              │  │     │   │
│  │  │  │  • topology  │  │  • estimate()│  │  • count()   │  │     │   │
│  │  │  │  • balance   │  │  • budget()  │  │  • truncate()│  │     │   │
│  │  │  │  • health    │  │  • alert()   │  │  • split()   │  │     │   │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘  │     │   │
│  │  │                                                          │     │   │
│  │  │  SharedArrayBuffer for zero-copy data between workers    │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Communication:                                                          │
│  • Main thread ↔ Workers: postMessage (structured clone)                 │
│  • Worker ↔ Worker: SharedArrayBuffer + Atomics (zero-copy)              │
│  • Worker ↔ WASM: direct memory access (linear memory)                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### WASM Module Loading

```typescript
// src/lib/wasm/ruvector-wasm.ts

let wasmInstance: any = null;
let wasmReady = false;

export async function initWasm(): Promise<void> {
  if (wasmReady) return;

  // Load WASM module (~800KB gzipped, cached by browser)
  const module = await import('@ruvector/wasm');
  await module.default(); // initialize WASM memory
  wasmInstance = module;
  wasmReady = true;
}

// Agent routing — runs in ~2ms vs ~200ms server-side
export function routeTask(taskDescription: string, context: string[]): AgentRecommendation[] {
  if (!wasmReady) throw new Error('WASM not initialized');
  return wasmInstance.route_task(taskDescription, context);
}

// HNSW pattern search — runs in ~0.5ms vs ~50ms server-side
export function searchPatterns(query: string, limit: number = 5): PatternMatch[] {
  if (!wasmReady) throw new Error('WASM not initialized');
  return wasmInstance.hnsw_search(query, limit);
}

// Swarm topology management
export function createSwarm(topology: string, maxAgents: number): SwarmState {
  if (!wasmReady) throw new Error('WASM not initialized');
  return wasmInstance.swarm_create(topology, maxAgents);
}

export function rebalanceSwarm(swarmId: string): SwarmState {
  return wasmInstance.swarm_rebalance(swarmId);
}

// Cost estimation — instant, no API call needed
export function estimateCost(model: string, inputTokens: number, outputTokens: number): CostEstimate {
  return wasmInstance.estimate_cost(model, inputTokens, outputTokens);
}

// Token counting — instant, for context window management
export function countTokens(text: string, model: string): number {
  return wasmInstance.count_tokens(text, model);
}

interface AgentRecommendation {
  agentType: string;
  confidence: number;
  reasoning: string;
}

interface PatternMatch {
  key: string;
  value: string;
  similarity: number;
  namespace: string;
}

interface SwarmState {
  id: string;
  topology: string;
  agents: Array<{ id: string; type: string; status: string; load: number }>;
  connections: Array<[string, string]>;
}

interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}
```

### WasmAgentWorker

Runs RuVector WASM in a dedicated Web Worker:

```typescript
// src/lib/workers/wasm-agent.worker.ts

import { initWasm, routeTask, searchPatterns, createSwarm, rebalanceSwarm, estimateCost, countTokens } from '../wasm/ruvector-wasm';

let initialized = false;

self.onmessage = async (e: MessageEvent) => {
  const { type, id, ...params } = e.data;

  // Lazy init — only load WASM when first needed
  if (!initialized) {
    try {
      await initWasm();
      initialized = true;
    } catch (err: any) {
      self.postMessage({ id, type: 'error', error: `WASM init failed: ${err.message}` });
      return;
    }
  }

  try {
    let result: any;

    switch (type) {
      case 'route_task':
        result = routeTask(params.task, params.context || []);
        break;
      case 'search_patterns':
        result = searchPatterns(params.query, params.limit);
        break;
      case 'create_swarm':
        result = createSwarm(params.topology, params.maxAgents);
        break;
      case 'rebalance_swarm':
        result = rebalanceSwarm(params.swarmId);
        break;
      case 'estimate_cost':
        result = estimateCost(params.model, params.inputTokens, params.outputTokens);
        break;
      case 'count_tokens':
        result = countTokens(params.text, params.model);
        break;
      default:
        result = { error: `Unknown type: ${type}` };
    }

    self.postMessage({ id, type: 'result', result });
  } catch (err: any) {
    self.postMessage({ id, type: 'error', error: err.message });
  }
};
```

### WASM-Powered UI Features

The WASM runtime enables browser-native features impossible with server-only architecture:

#### 1. Instant Agent Routing Preview

Before autopilot starts, WASM previews which agents will be used:

```
┌──────────────────────────────────────────────────────────────────┐
│  You: "Audit security of the authentication module"              │
│                                                                  │
│  ⚡ Autopilot will use:                              [Start]    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  🛡️ security-architect  (0.94)  — Lead security analysis │   │
│  │  🔍 researcher          (0.87)  — Code pattern search    │   │
│  │  🧪 tester              (0.82)  — Vulnerability testing  │   │
│  │  📝 reviewer            (0.76)  — Finding documentation  │   │
│  │                                                          │   │
│  │  Est. 6-8 steps  •  ~45s  •  ~$0.03 (Gemini Flash)     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

All computed locally in WASM: agent routing (2ms), cost estimation (instant), step prediction (from pattern DB).

#### 2. Live Swarm Topology Visualization

During autopilot, render swarm topology as an interactive graph:

```
┌──────────────────────────────────────────────────────────────────┐
│  Swarm Topology (hierarchical, 5 agents)           [Collapse ▼] │
│                                                                  │
│                    ┌────────────┐                                │
│                    │ coordinator│                                │
│                    │   (idle)   │                                │
│                    └─────┬──────┘                                │
│              ┌───────────┼───────────┐                          │
│        ┌─────┴─────┐ ┌──┴───┐ ┌─────┴─────┐                   │
│        │ security-  │ │coder │ │ researcher│                    │
│        │ architect  │ │(busy)│ │  (busy)   │                    │
│        │  (busy)    │ └──────┘ └───────────┘                    │
│        └────────────┘                                            │
│                          ┌──────┐                                │
│                          │tester│                                │
│                          │(idle)│                                │
│                          └──────┘                                │
│                                                                  │
│  Agents: 5  •  Active: 3  •  Load: 60%  •  Topology: optimal   │
└──────────────────────────────────────────────────────────────────┘
```

Rendered with `<canvas>` in the WasmAgentWorker, transferred to main thread via `OffscreenCanvas.transferToImageBitmap()`.

#### 3. Real-Time Cost Tracker

WASM tokenizer counts tokens locally, shows running cost during autopilot:

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚡ Autopilot — Step 4/20                           [Stop]      │
│  Tokens: 12,340 in / 3,200 out  •  Cost: $0.018  •  Budget: ∞  │
└──────────────────────────────────────────────────────────────────┘
```

#### 4. Offline Pattern Cache

WASM HNSW index caches recent patterns in IndexedDB. When offline or slow network, pattern searches still work:

```typescript
// Fallback chain:
// 1. WASM HNSW (local, ~0.5ms) → if hit, use it
// 2. Server MCP (remote, ~50ms) → if online, use it
// 3. IndexedDB cache (local, ~5ms) → stale but available
```

### Package Structure

```
@ruvector/wasm                         (npm, prebuilt WASM)
├── pkg/
│   ├── ruvector_wasm_bg.wasm          (~800KB gzipped)
│   ├── ruvector_wasm.js               (JS bindings)
│   └── ruvector_wasm.d.ts             (TypeScript types)
├── src/
│   ├── lib.rs                         (Rust source)
│   ├── hnsw.rs                        (HNSW index)
│   ├── router.rs                      (Agent routing)
│   ├── swarm.rs                       (Swarm topology)
│   ├── tokenizer.rs                   (Token counting)
│   └── cost.rs                        (Cost estimation)
└── package.json

chat-ui-mcp/chat-ui/
├── src/lib/
│   ├── components/
│   │   ├── AutopilotToggle.svelte     (toggle button)
│   │   ├── TaskCard.svelte            (individual task card)
│   │   ├── TaskGroup.svelte           (step group container)
│   │   ├── VirtualTaskList.svelte     (virtual scrolling)
│   │   ├── SwarmTopology.svelte       (canvas topology graph)
│   │   ├── CostTracker.svelte         (token/cost display)
│   │   └── AgentPreview.svelte        (pre-execution routing preview)
│   ├── workers/
│   │   ├── autopilot.worker.ts        (SSE stream processing)
│   │   ├── wasm-agent.worker.ts       (RuVector WASM runtime)
│   │   └── detail-fetch.worker.ts     (lazy detail loading + LRU cache)
│   ├── wasm/
│   │   └── ruvector-wasm.ts           (WASM module loader + API)
│   └── stores/
│       ├── autopilot.ts               (autopilot state store)
│       ├── tasks.ts                   (task/group state store)
│       └── wasm.ts                    (WASM readiness store)
```

---

## Part 5: MCP Bridge Autopilot Implementation

### Structured Event Streaming

```javascript
// mcp-bridge/index.js — autopilot handler

async function handleAutopilot(req, res, upstreamUrl, headers, body) {
  const maxSteps = parseInt(req.headers['x-autopilot-max-steps'] || '20', 10);
  const streamSteps = req.headers['x-autopilot-stream-steps'] === 'true';

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx compatibility

  let messages = [...body.messages];
  let step = 0;
  let aborted = false;
  let totalTasks = 0;
  const detailStore = new Map(); // detailToken → full result
  const startTime = Date.now();

  req.on('close', () => { aborted = true; });

  sendEvent(res, { type: 'autopilot_start', maxSteps });

  while (step < maxSteps && !aborted) {
    // 1. Call upstream AI provider (non-streaming for tool call parsing)
    const aiResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, messages, stream: false }),
    });
    const aiResult = await aiResponse.json();
    const choice = aiResult.choices?.[0];
    if (!choice) break;

    // 2. Check for tool calls
    const toolCalls = choice.message?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // Final text response — stream it
      sendEvent(res, { type: 'autopilot_text', content: choice.message?.content || '' });
      break;
    }

    // 3. Execute ALL tool calls in parallel
    step++;
    const groupId = `g${step}`;
    const taskEvents = toolCalls.map((tc, i) => ({
      taskId: `t${totalTasks + i + 1}`,
      tool: tc.function.name,
      args: safeParseArgs(tc.function.arguments),
      status: 'running',
    }));
    totalTasks += taskEvents.length;

    // Stream group start
    sendEvent(res, { type: 'task_group_start', groupId, step, tasks: taskEvents });

    // Append assistant message to conversation
    messages.push(choice.message);

    // Execute tools in parallel
    const groupStart = Date.now();
    const results = await Promise.allSettled(
      toolCalls.map(async (tc, i) => {
        const taskId = taskEvents[i].taskId;
        const toolName = tc.function.name;
        const toolArgs = safeParseArgs(tc.function.arguments);
        const taskStart = Date.now();

        // Check blocklist
        if (isBlockedTool(toolName)) {
          sendEvent(res, {
            type: 'task_update', taskId, status: 'blocked',
            summary: `${toolName} requires confirmation`,
            duration: Date.now() - taskStart,
          });
          return { toolCallId: tc.id, blocked: true, toolName };
        }

        try {
          const result = await executeTool(toolName, toolArgs);
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

          // Store full detail, generate token for lazy loading
          const detailToken = `dt_${taskId}`;
          detailStore.set(detailToken, resultStr);

          // Stream task completion with summary only
          const summary = resultStr.length > 120
            ? resultStr.substring(0, 120).replace(/\n/g, ' ') + '...'
            : resultStr.replace(/\n/g, ' ');

          sendEvent(res, {
            type: 'task_update', taskId, status: 'completed',
            summary, duration: Date.now() - taskStart, detailToken,
          });

          return { toolCallId: tc.id, content: resultStr };
        } catch (err) {
          sendEvent(res, {
            type: 'task_update', taskId, status: 'failed',
            summary: err.message, duration: Date.now() - taskStart,
          });
          return { toolCallId: tc.id, content: `Error: ${err.message}` };
        }
      })
    );

    // Stream group end
    sendEvent(res, { type: 'task_group_end', groupId, step, duration: Date.now() - groupStart });

    // Check if any tools were blocked — pause autopilot
    const blockedResults = results
      .filter(r => r.status === 'fulfilled' && r.value.blocked)
      .map(r => r.value);
    if (blockedResults.length > 0) {
      sendEvent(res, {
        type: 'autopilot_paused',
        reason: 'blocked_tools',
        tools: blockedResults.map(b => b.toolName),
      });
      break;
    }

    // Append tool results to messages
    for (const r of results) {
      if (r.status === 'fulfilled' && !r.value.blocked) {
        messages.push({
          role: 'tool',
          tool_call_id: r.value.toolCallId,
          content: r.value.content,
        });
      }
    }

    // Cooldown to prevent runaway
    await sleep(500);
  }

  if (step >= maxSteps && !aborted) {
    sendEvent(res, {
      type: 'autopilot_text',
      content: `\n⚠️ Autopilot reached max steps (${maxSteps}). Stopping.\n`,
    });
  }

  sendEvent(res, {
    type: 'autopilot_end',
    totalSteps: step,
    totalTasks,
    duration: Date.now() - startTime,
  });

  res.write('data: [DONE]\n\n');
  res.end();

  // Clean up detail store after 5 minutes
  setTimeout(() => detailStore.clear(), 5 * 60 * 1000);
}

// Detail fetch endpoint
app.get('/autopilot/detail/:token', (req, res) => {
  const content = detailStore.get(req.params.token);
  if (content) {
    res.json({ content });
  } else {
    res.status(404).json({ error: 'Detail expired or not found' });
  }
});

function sendEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function safeParseArgs(args) {
  try { return JSON.parse(args || '{}'); } catch { return {}; }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const AUTOPILOT_BLOCKED_PATTERNS = [
  /^deploy_/,
  /^security_delete/,
  /^browser_fill$/,
  /^browser_click$/,
];

function isBlockedTool(name) {
  return AUTOPILOT_BLOCKED_PATTERNS.some(p => p.test(name));
}
```

---

## Part 6: Integration with agentic-flow

When autopilot is ON and `MCP_GROUP_AGENTIC_FLOW=true`, the system prompt is augmented:

```javascript
const AUTOPILOT_SYSTEM_PROMPT = `
You are in AUTOPILOT MODE. You should:
1. Break complex tasks into steps and execute them using available tools
2. Call MULTIPLE tools in parallel when they are independent
3. After each tool result, analyze it and decide the next action
4. Continue until the task is complete — do NOT ask the user for confirmation
5. Use agentic_flow_agent for complex multi-step operations when available
6. Use memory_search to find relevant patterns before starting
7. Summarize your progress at each step
8. When done, provide a final summary of everything accomplished

Parallel execution patterns:
- Research: memory_search + hooks_route + agent_spawn(researcher) — all in parallel
- Code: agent_spawn(coder) + agent_spawn(tester) — parallel, then review
- Analysis: search multiple sources in parallel → synthesize → report
- Security: security_scan + hooks_route(audit) + memory_search(CVEs) — parallel
`;
```

---

## Part 7: Safety Controls

| Control | Default | Configurable | Description |
|---------|---------|-------------|-------------|
| **Max steps** | 20 | `x-autopilot-max-steps` header | Hard limit on tool call rounds |
| **Step timeout** | 30s | `AUTOPILOT_STEP_TIMEOUT` env | Per-tool execution timeout |
| **Cooldown** | 500ms | `AUTOPILOT_COOLDOWN` env | Delay between steps |
| **Stop button** | Always visible | N/A | User can abort at any time |
| **Blocked tools** | deploy, destructive ops | `AUTOPILOT_BLOCKED_TOOLS` env | Tools requiring confirmation |
| **Cost guard** | Disabled | `AUTOPILOT_MAX_COST` env | Stop if cost exceeds threshold |
| **Token limit** | None | `AUTOPILOT_MAX_TOKENS` env | Stop if total tokens exceed limit |
| **Detail TTL** | 5 min | `AUTOPILOT_DETAIL_TTL` env | How long full results are kept |
| **WASM memory** | 64MB | `RUVECTOR_WASM_MEMORY` | Max WASM heap size |
| **Detail cache** | 20 items | Hardcoded | LRU cache size in DetailFetchWorker |

---

## Part 8: Use Cases

The parallel task UI + autopilot + WASM runtime enables Claude Code-style workflows in the browser:

### 1. Codebase Analysis
```
User: "Analyze security of the auth module"
→ Autopilot spawns: security-architect, researcher, tester (parallel)
→ Each reports findings in collapsible task cards
→ AI synthesizes into final report
```

### 2. Multi-Agent Research
```
User: "Compare React, Vue, and Svelte for our use case"
→ Spawns 3 researcher agents in parallel
→ Each researches one framework
→ AI produces comparison table
```

### 3. Full Development Cycle
```
User: "Add rate limiting to the API"
→ Step 1: memory_search (patterns) + hooks_route (optimal agents)
→ Step 2: agent_spawn(architect) → produces design
→ Step 3: agent_spawn(coder) + agent_spawn(tester) (parallel)
→ Step 4: agent_spawn(reviewer) → produces review
→ Step 5: Final summary with code links
```

### 4. Swarm Orchestration
```
User: "Scrape pricing from 50 competitor websites"
→ WASM creates swarm topology (hierarchical, 10 agents)
→ Autopilot spawns navigator + 5 scrapers + 3 validators + monitor
→ Live topology graph shows agent status
→ Collapsible cards show per-site results
→ Final summary with data table
```

### 5. Monitoring Dashboard
```
User: "Monitor all our Cloud Run services"
→ Autopilot runs health checks on each service (parallel)
→ Task cards show service status (green/red)
→ WASM cost tracker shows API usage
→ Auto-refreshes every 60s in autopilot mode
```

---

## What Changes

| Component | Change |
|-----------|--------|
| **MCP Bridge** | Autopilot loop, structured SSE events, detail store, `/autopilot/detail/:token` endpoint |
| **Chat UI** | `AutopilotToggle`, `TaskCard`, `TaskGroup`, `VirtualTaskList`, `SwarmTopology`, `CostTracker`, `AgentPreview` components |
| **Chat UI** | 3 Web Workers: `autopilot.worker.ts`, `wasm-agent.worker.ts`, `detail-fetch.worker.ts` |
| **Chat UI** | WASM module loader + Svelte stores for state management |
| **Docker** | `AUTOPILOT_*` env vars, `@ruvector/wasm` dependency |
| **npm** | New `@ruvector/wasm` package (prebuilt WASM, ~800KB gzipped) |

## What Stays the Same

- All MCP tools, per-group endpoints, security, memory — unchanged
- Standard (non-autopilot) chat flow — unchanged
- Authentication (OIDC) — unchanged
- Docker Compose structure — unchanged
- MCP bridge backwards compatibility — unchanged

## Consequences

### Positive

- **Claude Code UX in browser** — parallel tasks, collapsible details, real-time progress
- **Zero memory waste** — collapsed cards use ~200 bytes; details load on demand
- **Non-blocking UI** — all heavy processing in Web Workers, main thread stays responsive
- **In-browser intelligence** — WASM agent routing/search in ~2ms vs ~200ms server-side
- **Eliminates continue fatigue** — autopilot runs complex tasks to completion
- **Offline capable** — WASM pattern search + IndexedDB cache work without network
- **Backward compatible** — autopilot OFF by default, existing flow unchanged
- **Versatile** — same UI for code analysis, research, scraping, monitoring, deployment

### Negative

- **WASM module size** — ~800KB initial download (cached after first load)
- **Web Worker complexity** — 3 workers with message passing adds architectural complexity
- **Token cost** — autopilot uses more tokens (no human filtering between steps)
- **Error cascade** — wrong tool call in step 2 may cascade through steps 3-20
- **Browser compatibility** — Web Workers + WASM requires modern browser (Chrome 80+, Firefox 78+, Safari 14+)

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Runaway loops | Hard max steps (20), per-step timeout (30s), cooldown (500ms) |
| Destructive actions | Blocked tool list, confirmation modal for dangerous tools |
| High token cost | WASM cost tracker, optional budget limit, step counter |
| WASM init failure | Graceful fallback to server-only mode (no WASM features) |
| Memory bloat | Virtual scrolling, LRU detail cache (20 items), null-on-collapse |
| Worker crash | Error boundaries, auto-restart with exponential backoff |
| Stale patterns | WASM HNSW syncs with server on reconnect |

## Related

- [ADR-035: MCP Tool Groups](ADR-035-MCP-TOOL-GROUPS.md) — per-group tool organization
- [ADR-029: HF Chat UI](ADR-029-HUGGINGFACE-CHAT-UI-CLOUD-RUN.md) — base deployment
- [ADR-002: WASM Core Package](ADR-002-WASM-CORE-PACKAGE.md) — WASM architecture
- [ADR-036: Servo Browser MCP](ADR-036-SERVO-RUST-BROWSER-MCP.md) — Rust/WASM browser engine
- [agentic-flow](https://www.npmjs.com/package/agentic-flow) — autonomous agent backend
- [ruvector](https://www.npmjs.com/package/ruvector) — WASM-compiled intelligence runtime
- Claude Code — UX inspiration for parallel tool cards and bypass mode
