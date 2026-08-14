# ADR-048: Claude Code Auto Memory Integration

**Status:** Implemented
**Date:** 2026-02-08
**Authors:** RuvNet, Claude Flow Team
**Supersedes:** None
**Related:** ADR-006 (Unified Memory), ADR-018 (Claude Code Integration)

## Context

Claude Code has introduced **Auto Memory** — a persistent directory where Claude automatically records learnings, patterns, and insights as it works. Unlike CLAUDE.md files (human-written instructions), auto memory contains notes Claude writes for itself based on session discoveries.

### What Is Auto Memory?

Auto memory is a per-project persistent directory at `~/.claude/projects/<project>/memory/` containing:

```
~/.claude/projects/<project>/memory/
├── MEMORY.md          # Concise index (first 200 lines loaded into system prompt)
├── debugging.md       # Detailed notes on debugging patterns
├── api-conventions.md # API design decisions
└── ...                # Any topic files Claude creates
```

Key characteristics:

| Aspect | Details |
|--------|---------|
| Location | `~/.claude/projects/<project>/memory/` |
| Entrypoint | `MEMORY.md` — first 200 lines loaded at session start |
| Topic files | On-demand files for detailed notes (not auto-loaded) |
| Scope | Per-project (derived from git repo root) |
| Persistence | Survives across sessions |
| Activation | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0` to force on |

### What Claude Remembers

- **Project patterns**: build commands, test conventions, code style
- **Debugging insights**: solutions to tricky problems, common error causes
- **Architecture notes**: key files, module relationships, important abstractions
- **User preferences**: communication style, workflow habits, tool choices

### Problem Statement

Claude-flow v3 has its own rich memory system (`@claude-flow/memory`) backed by AgentDB with HNSW vector indexing. These two memory systems are currently disconnected:

1. **Auto memory** — markdown files, loaded into system prompt, human-readable
2. **AgentDB memory** — structured entries, vector-indexed, 150x-12,500x faster search

Without integration, insights discovered during swarm orchestration are lost between sessions, and auto memory cannot benefit from AgentDB's semantic search capabilities.

## Decision

Implement a **bidirectional bridge** between Claude Code auto memory and claude-flow's unified memory system, treating auto memory as a persistent projection of the most relevant AgentDB entries.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Claude Code Session                 │
│                                                      │
│  System Prompt ← MEMORY.md (first 200 lines)        │
│                                                      │
│  ┌──────────────────┐     ┌──────────────────────┐  │
│  │  Auto Memory Dir │◄───►│  AutoMemoryBridge    │  │
│  │  ~/.claude/...   │     │  (@claude-flow/memory)│  │
│  │                  │     │                       │  │
│  │  MEMORY.md       │     │  ┌─────────────────┐ │  │
│  │  debugging.md    │     │  │  AgentDB + HNSW │ │  │
│  │  patterns.md     │     │  │  (structured)   │ │  │
│  │  architecture.md │     │  └─────────────────┘ │  │
│  └──────────────────┘     └──────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │              Swarm Agents                     │   │
│  │  Agent 1 ──► store to AgentDB ──► sync to MD  │   │
│  │  Agent 2 ──► store to AgentDB ──► sync to MD  │   │
│  │  Agent N ──► store to AgentDB ──► sync to MD  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Integration Points

#### 1. Auto Memory Bridge Service

New service in `@claude-flow/memory` that syncs between AgentDB and auto memory files:

```typescript
interface AutoMemoryBridgeConfig {
  /** Auto memory directory path */
  memoryDir: string;

  /** Max lines for MEMORY.md (Claude Code reads first 200) */
  maxIndexLines: number; // default: 180 (leave headroom)

  /** Topic file mapping: AgentDB namespace → markdown file */
  topicMapping: Record<string, string>;

  /** Sync strategy */
  syncMode: 'on-write' | 'on-session-end' | 'periodic';

  /** Periodic sync interval in ms (if syncMode is 'periodic') */
  syncIntervalMs?: number;
}

interface IAutoMemoryBridge {
  /** Resolve auto memory directory for current project */
  resolveMemoryDir(): string;

  /** Sync high-value AgentDB entries → MEMORY.md + topic files */
  syncToAutoMemory(): Promise<SyncResult>;

  /** Import auto memory files → AgentDB entries */
  importFromAutoMemory(): Promise<ImportResult>;

  /** Write a specific insight to auto memory */
  recordInsight(insight: MemoryInsight): Promise<void>;

  /** Curate MEMORY.md to stay under 200 lines */
  curateIndex(): Promise<void>;
}
```

#### 2. Memory Directory Resolution

Auto memory path is derived from the git repo root:

```typescript
function resolveAutoMemoryDir(workingDir: string): string {
  const gitRoot = findGitRoot(workingDir);
  const projectKey = gitRoot
    ? gitRoot.replace(/\//g, '-').replace(/^-/, '')
    : workingDir.replace(/\//g, '-').replace(/^-/, '');

  return path.join(
    os.homedir(),
    '.claude',
    'projects',
    projectKey,
    'memory'
  );
}
```

#### 3. MEMORY.md Index Generation

MEMORY.md is the entrypoint — first 200 lines are loaded into every session. It must be concise and serve as an index to topic files:

```typescript
interface MemoryInsight {
  /** Category for organization in MEMORY.md */
  category: 'project-patterns' | 'debugging' | 'architecture'
           | 'preferences' | 'performance' | 'security';

  /** One-line summary for MEMORY.md index */
  summary: string;

  /** Detailed content (goes in topic file if > 2 lines) */
  detail?: string;

  /** Source: which agent/hook discovered this */
  source: string;

  /** Confidence score (0-1), used for curation priority */
  confidence: number;

  /** AgentDB entry ID for cross-reference */
  agentDbId?: string;
}
```

Generated MEMORY.md structure:

```markdown
# Claude Flow V3 Project Memory

## Project Patterns
- Use `pnpm` for package management (not npm)
- Build: `npm run build` in each package directory
- Tests: `vitest run` (London School TDD, mock-first)
- See `patterns.md` for detailed conventions

## Architecture
- DDD with bounded contexts in `v3/@claude-flow/`
- Key packages: cli, memory, security, hooks, guidance
- See `architecture.md` for module relationships

## Debugging
- HNSW index requires initialization before search
- SQLite WASM needs `sql.js` not native `better-sqlite3`
- See `debugging.md` for resolved issues

## Performance
- HNSW: 150x-12,500x faster than brute-force
- Int8 quantization: 3.92x memory reduction
- See `performance.md` for benchmark results

## Security
- Input validation at all system boundaries (Zod)
- Path traversal prevention in file operations
- See `security.md` for CVE status
```

#### 4. Hooks Integration

Auto memory syncs are triggered by claude-flow hooks:

| Hook | Auto Memory Action |
|------|--------------------|
| `session-start` | Import auto memory → AgentDB (if stale) |
| `session-end` | Sync AgentDB insights → auto memory files |
| `post-task` | Record task outcome as insight if noteworthy |
| `post-edit` | Record file pattern if new convention detected |
| `intelligence` | Store learned patterns with confidence scores |

```typescript
// session-end hook handler
async function onSessionEnd(ctx: HookContext): Promise<void> {
  const bridge = ctx.resolve<IAutoMemoryBridge>('autoMemoryBridge');

  // Sync high-confidence learnings to auto memory
  await bridge.syncToAutoMemory();

  // Curate MEMORY.md to stay under 200 lines
  await bridge.curateIndex();
}

// post-task hook handler
async function onPostTask(ctx: HookContext): Promise<void> {
  const bridge = ctx.resolve<IAutoMemoryBridge>('autoMemoryBridge');
  const task = ctx.taskResult;

  if (task.success && task.learnings.length > 0) {
    for (const learning of task.learnings) {
      await bridge.recordInsight({
        category: classifyInsight(learning),
        summary: learning.summary,
        detail: learning.detail,
        source: `agent:${task.agentType}`,
        confidence: task.confidenceScore,
        agentDbId: learning.memoryId,
      });
    }
  }
}
```

#### 5. Topic File Management

Detailed notes are stored in topic files (not loaded at startup — read on demand):

```typescript
const DEFAULT_TOPIC_MAPPING: Record<string, string> = {
  'patterns':      'patterns.md',
  'debugging':     'debugging.md',
  'architecture':  'architecture.md',
  'performance':   'performance.md',
  'security':      'security.md',
  'preferences':   'preferences.md',
  'swarm-results': 'swarm-results.md',
};
```

Topic files are kept under 500 lines each. When a topic file exceeds this, older low-confidence entries are archived or pruned.

#### 6. AgentDB ↔ Auto Memory Sync Strategy

**AgentDB → Auto Memory (on session-end):**

```typescript
async syncToAutoMemory(): Promise<SyncResult> {
  // 1. Query AgentDB for high-confidence entries since last sync
  const entries = await this.memory.query(
    query()
      .inNamespace('learnings')
      .where('confidence', '>=', 0.7)
      .where('updatedAt', '>=', this.lastSyncTime)
      .orderBy('confidence', 'desc')
      .limit(50)
      .build()
  );

  // 2. Classify entries into categories
  const categorized = this.categorize(entries);

  // 3. Update topic files with new entries
  for (const [category, items] of Object.entries(categorized)) {
    await this.appendToTopicFile(category, items);
  }

  // 4. Regenerate MEMORY.md index from topic file summaries
  await this.curateIndex();

  return { synced: entries.length, categories: Object.keys(categorized) };
}
```

**Auto Memory → AgentDB (on session-start):**

```typescript
async importFromAutoMemory(): Promise<ImportResult> {
  const memoryDir = this.resolveMemoryDir();
  if (!existsSync(memoryDir)) return { imported: 0 };

  // 1. Read all topic files
  const files = await glob('*.md', { cwd: memoryDir });

  let imported = 0;
  for (const file of files) {
    const content = await readFile(join(memoryDir, file), 'utf-8');
    const entries = this.parseMarkdownEntries(content);

    for (const entry of entries) {
      // 2. Check if already in AgentDB (by content hash)
      const exists = await this.memory.search(
        query().where('contentHash', '=', hash(entry.content)).build()
      );

      if (exists.length === 0) {
        // 3. Store with embedding for semantic search
        await this.memory.store({
          key: `auto-memory:${file}:${entry.heading}`,
          content: entry.content,
          namespace: 'auto-memory',
          type: 'semantic',
          tags: ['auto-memory', file.replace('.md', '')],
          metadata: {
            sourceFile: file,
            importedAt: new Date().toISOString(),
            contentHash: hash(entry.content),
          },
        });
        imported++;
      }
    }
  }

  return { imported };
}
```

#### 7. Swarm Agent Memory Persistence

When swarm agents complete tasks, their findings are automatically persisted:

```typescript
// In swarm coordinator (post-task)
async function persistSwarmLearnings(
  swarmResult: SwarmResult,
  bridge: IAutoMemoryBridge
): Promise<void> {
  // Extract learnings from all agents
  const learnings = swarmResult.agents
    .flatMap(agent => agent.findings)
    .filter(f => f.isNovel && f.confidence > 0.6);

  // Deduplicate by semantic similarity
  const unique = await deduplicateBySimilarity(learnings, 0.85);

  // Record each unique insight
  for (const learning of unique) {
    await bridge.recordInsight({
      category: learning.category,
      summary: learning.oneLiner,
      detail: learning.fullDescription,
      source: `swarm:${swarmResult.swarmId}:${learning.agentType}`,
      confidence: learning.confidence,
    });
  }
}
```

#### 8. CLI Commands

New subcommands under `npx claude-flow@v3alpha memory`:

```bash
# Sync AgentDB → auto memory files
npx claude-flow@v3alpha memory sync-auto

# Import auto memory → AgentDB
npx claude-flow@v3alpha memory import-auto

# Show auto memory status
npx claude-flow@v3alpha memory auto-status

# Curate MEMORY.md (prune to 200 lines)
npx claude-flow@v3alpha memory curate
```

#### 9. MCP Tool Extensions

New MCP tools for auto memory operations:

```typescript
// memory_auto_sync - Sync AgentDB to auto memory files
{
  name: 'memory_auto_sync',
  description: 'Sync high-confidence AgentDB entries to auto memory files',
  inputSchema: {
    type: 'object',
    properties: {
      direction: { enum: ['to-auto', 'from-auto', 'bidirectional'] },
      minConfidence: { type: 'number', default: 0.7 },
      categories: { type: 'array', items: { type: 'string' } },
    },
  },
}

// memory_auto_record - Record an insight to auto memory
{
  name: 'memory_auto_record',
  description: 'Record a specific insight to auto memory and AgentDB',
  inputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string' },
      summary: { type: 'string' },
      detail: { type: 'string' },
      confidence: { type: 'number' },
    },
    required: ['category', 'summary'],
  },
}
```

## Configuration

Add to `claude-flow.config.json`:

```json
{
  "memory": {
    "autoMemory": {
      "enabled": true,
      "syncMode": "on-session-end",
      "maxIndexLines": 180,
      "minConfidenceForSync": 0.7,
      "topicMapping": {
        "patterns": "patterns.md",
        "debugging": "debugging.md",
        "architecture": "architecture.md",
        "performance": "performance.md",
        "security": "security.md"
      },
      "pruneStrategy": "confidence-weighted",
      "maxTopicFileLines": 500
    }
  }
}
```

Add to `.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "0"
  }
}
```

## Consequences

### Positive

- **Cross-session learning**: Swarm insights persist across sessions via auto memory
- **Human-readable**: Auto memory files are plain markdown — inspectable and editable
- **Dual indexing**: MEMORY.md for system prompt loading + AgentDB for semantic search
- **Progressive enhancement**: Works without AgentDB (graceful fallback to file-only)
- **Agent continuity**: New agents in new sessions inherit previous session learnings

### Negative

- **Sync overhead**: Bidirectional sync adds latency at session boundaries (~100-500ms)
- **Staleness risk**: Auto memory files may diverge from AgentDB if syncs fail
- **200-line constraint**: MEMORY.md must be curated carefully to stay within limit
- **Storage duplication**: Same data exists in both markdown files and AgentDB

### Mitigations

| Risk | Mitigation |
|------|------------|
| Sync failure | Idempotent sync with content hashing; retry on next session |
| MEMORY.md overflow | Automated curation with confidence-weighted pruning |
| Staleness | Content hash comparison on import; skip unchanged entries |
| Duplication | AgentDB entries link to auto memory source via `contentHash` |

## Implementation Status

### Phase 1: Foundation -- COMPLETED
- [x] Implement `resolveAutoMemoryDir()` path resolution
- [x] Create `AutoMemoryBridge` class with full read/write/sync
- [x] `findGitRoot()` utility for git root detection
- [x] `parseMarkdownEntries()` for structured markdown parsing
- [x] `extractSummaries()` with metadata annotation stripping
- [x] `hashContent()` SHA-256 truncated dedup
- [x] `hasSummaryLine()` exact bullet-prefix dedup check
- [x] `pruneTopicFile()` for topic file line management
- [x] `formatInsightLine()` for markdown formatting
- [x] 73 unit tests passing (305ms runtime)
- [x] Exported from `@claude-flow/memory` index

### Phase 1b: Optimizations -- COMPLETED
- [x] Static `createDefaultEntry` import (was dynamic per-call)
- [x] `syncedInsightKeys` Set prevents double-write race condition
- [x] Atomic buffer clearing via `splice(0, length)`
- [x] `node:fs/promises` for async write I/O
- [x] `fetchExistingContentHashes()` single-query batch lookup
- [x] `bulkInsert()` for import batching
- [x] `pruneSectionsToFit()` prune-before-build (eliminates O(n^2))
- [x] `CATEGORY_LABELS` module-level constant (deduplicated)
- [x] `pruneStrategy` config wired into pruning logic
- [x] Error handling in `getStatus()` with try/catch
- [x] Monotonic `insightCounter` for unique keys (prevents same-ms collision)
- [x] `syncedInsightKeys` capped at 10k entries (prevents memory leak)
- [x] Pre-computed line count in `pruneSectionsToFit()` (decrement vs recount)
- [x] 73 unit tests passing (305ms runtime)

### Phase 1c: Claude Code Binary Analysis -- COMPLETED
- [x] Discovered three-scope agent memory system (project/local/user)
- [x] Documented agent `.md` frontmatter `memory` field
- [x] Identified session memory system (separate from auto memory)
- [x] Catalogued memory telemetry events (`tengu_memdir_*`)
- [x] Found auto memory feature flag (`tengu_oboe`) and controls
- [x] Documented dynamic vs static system prompt block loading
- [x] Identified MEMORY.md case migration (`memory.md` → `MEMORY.md`)
- [x] Catalogued memory-related environment variables
- [x] Identified file checkpointing system for rollback capability
- [x] Documented in Appendix A of this ADR

### Phase 2: Hooks Integration (Pending)
- [ ] Wire `session-end` hook to trigger sync
- [ ] Wire `session-start` hook to trigger import
- [ ] Wire `post-task` hook for insight recording
- [ ] Integration tests with mock hook context

### Phase 3: Curation & MCP (Pending)
- [ ] Add `memory sync-auto` CLI command
- [ ] Add `memory import-auto` CLI command
- [ ] Add `memory auto-status` CLI command
- [ ] Add MCP tools (`memory_auto_sync`, `memory_auto_record`)
- [ ] End-to-end tests with real AgentDB

### Phase 4: Swarm Integration (Pending)
- [ ] Add swarm result → auto memory pipeline
- [ ] Semantic deduplication for swarm learnings
- [ ] Dashboard/status command for auto memory health
- [ ] Performance benchmarks for sync operations

## Appendix A: Undocumented Claude Code Memory Capabilities

The following capabilities were discovered through binary analysis of Claude Code v2.1.37 (`/home/codespace/.local/share/claude/versions/2.1.37`). These are implementation details that may change between versions but are important for deep integration.

### A.1 Three-Scope Agent Memory System

Claude Code supports three distinct memory scopes for agents, beyond the project-level auto memory:

| Scope | Path | Shared via VCS | Use Case |
|-------|------|----------------|----------|
| `project` | `.claude/agent-memory/<agent-name>/` | Yes (committed) | Team-shared agent knowledge |
| `local` | `.claude/agent-memory-local/<agent-name>/` | No (gitignored) | Machine-specific agent state |
| `user` | `~/.claude/agent-memory/<agent-name>/` | No (global) | Cross-project agent knowledge |

Each scope has its own `MEMORY.md` entrypoint. Scope is selected via agent definition frontmatter:

```yaml
---
memory: "project"  # or "local" or "user"
---
# Agent instructions here
```

When `memory` is set in an agent's `.md` definition file, Claude Code automatically adds Read/Write/Edit tools to the agent's toolset for its memory directory. The scope-specific path is resolved by internal function `B7A(agentName, scope)`.

**Integration opportunity for AutoMemoryBridge:** Support agent-scoped memory directories in addition to the project-level auto memory directory. This would allow per-agent persistent learning across sessions.

### A.2 Session Memory System

Separate from auto memory, Claude Code has a **session memory** system for within-session context tracking:

| Feature Flag | Purpose |
|-------------|---------|
| `tengu_session_memory` | Enable session memory |
| `tengu_sm_compact` | Enable session memory compaction |
| `tengu_sm_config` | Session memory configuration |

Session memory is loaded as a **static** system prompt block (`Id("session_memory", ...)`), unlike auto memory which is a **dynamic** block (`Dd("auto_memory", ...)`) re-read from disk each turn. This means:

- **Auto memory**: MEMORY.md is re-read from disk on every model turn — edits are immediately visible
- **Session memory**: Loaded once and cached — tracks within-session context, compacted for efficiency

Environment variable `CLAUDE_CODE_SM_COMPACT` controls session memory compaction behavior.

### A.3 Memory Telemetry Events

Claude Code emits telemetry events for memory directory operations:

| Event | Trigger |
|-------|---------|
| `tengu_memdir_accessed` | Memory directory is accessed |
| `tengu_memdir_file_edit` | A memory file is edited |
| `tengu_memdir_file_read` | A memory file is read |
| `tengu_memdir_file_write` | A memory file is written |
| `tengu_memdir_loaded` | Memory directory is loaded at session start |
| `tengu_agent_memory_loaded` | Agent-scoped memory is loaded |

These events can be used for monitoring bridge sync health and detecting when auto memory files are modified outside of the bridge.

### A.4 Auto Memory Feature Flag & Control

| Mechanism | Value | Effect |
|-----------|-------|--------|
| Feature flag `tengu_oboe` | enabled/disabled | Server-side toggle for auto memory |
| Env var `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | `1` / `0` | Client-side override |
| Function `PG()` | boolean | Runtime check combining both |

The 200-line limit for MEMORY.md is defined as constant `iRH=200` in the compiled source.

### A.5 Nested Memory Attachment Triggers

Claude Code maintains a `nestedMemoryAttachmentTriggers` Set that tracks file read operations which trigger memory context attachment. When a file within a memory directory is read, additional memory context may be automatically attached to the conversation.

### A.6 Dynamic vs Static System Prompt Blocks

Claude Code uses two loading mechanisms for memory in the system prompt:

```
Auto memory:    Dd("auto_memory", ...)  → Dynamic block, re-read from disk each turn
Session memory: Id("session_memory", ...) → Static block, loaded once per session
```

This is significant for the bridge: any writes to MEMORY.md or topic files are visible to the model on the very next turn, without requiring a session restart.

### A.7 MEMORY.md Case Migration

Claude Code includes an automatic migration function `IP9()` that renames `memory.md` to `MEMORY.md` (lowercase to uppercase). This migration runs on agent memory load, ensuring consistent casing across all memory directories.

The bridge should always create files as `MEMORY.md` (uppercase) to match Claude Code's expected convention.

### A.8 Memory-Related Environment Variables

| Variable | Purpose |
|----------|---------|
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | Disable auto memory entirely |
| `CLAUDE_CODE_SM_COMPACT` | Session memory compaction |
| `CLAUDE_CODE_AGENT_NAME` | Agent name for memory scoping |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | Enable agent teams (affects shared task lists) |
| `CLAUDE_CODE_ENABLE_TASKS` | Enable task list feature |
| `CLAUDE_CODE_TEAM_NAME` | Team name for coordination |
| `CLAUDE_CODE_TASK_LIST_ID` | Task list identifier |
| `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` | Disable file history snapshots |
| `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING` | Enable SDK-level file checkpointing |

### A.9 File Checkpointing System

Claude Code has a file history/checkpointing system that creates snapshots of files before modifications. Related environment variables:

- `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` — Disable the feature
- `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING` — Enable for SDK consumers

This system provides rewind/backup capabilities and emits telemetry events for tracking file changes. The AutoMemoryBridge could leverage this to recover from failed sync operations.

### A.10 Integration Implications for AutoMemoryBridge

Based on these discoveries, the following enhancements should be considered for future phases:

1. **Agent-scoped bridge instances**: Create per-agent AutoMemoryBridge instances that sync to agent memory directories (project/local/user scope)
2. **Session memory coordination**: Avoid duplicating information between auto memory and session memory
3. **Telemetry-driven sync**: Use `tengu_memdir_*` events to trigger incremental syncs instead of full-directory scans
4. **Dynamic block awareness**: Leverage the fact that MEMORY.md edits are visible on the next turn for real-time knowledge injection
5. **Case migration compatibility**: Always use uppercase `MEMORY.md` to match Claude Code's migration behavior
6. **File checkpointing integration**: Use checkpoints for atomic sync operations with rollback capability

## References

- [Claude Code Auto Memory Documentation](https://code.claude.com/docs/en/memory)
- ADR-006: Unified Memory Service
- ADR-018: Claude Code Deep Integration Architecture
- ADR-017: RuVector Integration
- Claude Code v2.1.37 binary analysis (2026-02-08)
