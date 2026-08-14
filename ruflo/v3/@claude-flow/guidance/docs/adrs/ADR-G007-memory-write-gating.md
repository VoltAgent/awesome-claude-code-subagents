# ADR-G007: Memory Write Gating -- Authority, Rate Limiting, TTL, and Decay

## Status
Accepted

## Date
2026-02-01

## Context

In a multi-agent swarm, agents share state through a memory subsystem (AgentDB with HNSW indexing in Claude Flow V3). Without governance, agents can:

1. **Overwrite critical state.** A coder agent overwrites the architect's design decisions. A tester overwrites the coordinator's task assignments.
2. **Flood memory.** An agent in a loop writes thousands of entries, degrading search performance and consuming storage.
3. **Persist stale data.** Entries written during an early exploration phase remain indefinitely, misleading agents that retrieve them weeks later.
4. **Contradict each other.** Two agents write conflicting values for the same key (e.g., "auth strategy: JWT" vs. "auth strategy: session cookies") with no mechanism to detect or resolve the conflict.

The guidance control plane's role is to define policies for memory writes, just as it defines policies for tool calls. Memory is a shared resource that requires governance.

## Decision

Implement memory write gating through the guidance rule system and enforcement gates, with four governance mechanisms:

### 1. Authority-Based Write Permissions

Rules in the guidance file can specify which agent types have write access to which memory namespaces. The `GuidanceRule.domains` and `GuidanceRule.repoScopes` fields are repurposed for memory governance:

- A rule with `domain: memory` and `scope: swarm/*` applies to all memory writes in the `swarm` namespace
- The `toolClasses` field uses `mcp` to target memory operations (memory store/search are MCP tool calls)
- The `riskClass` determines the gate behavior: `critical` rules block unauthorized writes, `high` rules require confirmation

Example rule in `CLAUDE.md`:
```
[R050] Only coordinator agents may write to swarm/task-assignments namespace @security [mcp] #general scope:swarm/task-assignments priority:90 (critical)
```

### 2. Rate Limiting via Evaluators

The `ViolationRateEvaluator` in `src/ledger.ts` tracks violation frequency per rule. When configured with memory-specific rules, it detects agents that produce excessive violations (which correlates with excessive write attempts that are being blocked).

The ledger's `computeMetrics()` method provides the violation rate per 10 tasks, enabling detection of write storms.

### 3. TTL and Confidence Decay

The guidance rule system supports temporal governance through the optimizer loop. Rules tagged with `domain: memory` can specify decay behavior:

- The optimizer's violation ranking (`rankViolations()` in `src/ledger.ts`) tracks how often stale-data violations occur
- When stale data causes repeated violations, the optimizer proposes rule changes (ADR-G008) to add TTL enforcement or auto-cleanup policies
- Rules can reference verifiers (`verify:memory-fresh`) that evaluators use to check data freshness

### 4. Contradiction Tracking

The `ShardRetriever.areContradictory()` method in `src/retriever.ts` detects contradictory rules using negation patterns:

```typescript
const negationPatterns = [
  { positive: /\bmust\b/i, negative: /\bnever\b|\bdo not\b|\bavoid\b/i },
  { positive: /\balways\b/i, negative: /\bnever\b|\bdon't\b/i },
  { positive: /\brequire\b/i, negative: /\bforbid\b|\bprohibit\b/i },
];
```

This same mechanism applies to memory-governing rules. When two rules contradict (e.g., "agents must share state via memory" vs. "agents must not write to shared namespaces"), the higher-priority rule wins during retrieval (`selectWithContradictionCheck`).

### Integration with Gates

Memory writes flow through the existing gate infrastructure:

1. **Tool allowlist gate** (`evaluateToolAllowlist`) can restrict which memory tools are available
2. **Secrets gate** (`evaluateSecrets`) scans memory write content for secrets before storage
3. **Custom evaluators** can be registered via `RunLedger.addEvaluator()` for memory-specific checks (namespace authorization, rate limits, TTL enforcement)

## Consequences

### Positive

- **Governed memory.** Memory becomes a controlled resource with explicit permissions, just like file system access or command execution.
- **Drift prevention.** Authority-based writes prevent agent role confusion (a coder cannot overwrite architectural decisions).
- **Stale data mitigation.** The optimizer-driven TTL evolution ensures that memory governance adapts to observed problems rather than requiring upfront configuration of all possible decay scenarios.
- **Reuse of existing infrastructure.** No new gate type is needed. Memory governance uses the existing rule system, retrieval, gates, ledger, and optimizer.

### Negative

- **Indirect enforcement.** Memory writes go through MCP tools, so gating depends on the MCP layer invoking the guidance control plane. If an agent bypasses MCP (direct database access), the gates are ineffective.
- **Rule authoring burden.** Teams must write memory-specific rules in their `CLAUDE.md`. Without these rules, memory writes are ungoverned. Mitigation: the optimizer can propose memory rules based on observed conflicts.
- **No built-in TTL engine.** The current implementation governs TTL through rules and evaluators, not through an automatic expiration mechanism in the storage layer. True TTL requires integration with AgentDB's storage engine.

## Alternatives Considered

### 1. Dedicated memory gate (fifth gate type)
Add a `memory-write` gate alongside the four existing gates. Rejected because it would be a special case of the tool allowlist gate. Memory operations are tool calls; they do not need a separate enforcement path. Adding a fifth gate increases the API surface without proportional benefit.

### 2. RBAC system with agent identity tokens
Implement a full role-based access control system with cryptographic agent identity. Rejected as over-engineered for the current use case. The rule-based approach achieves authority separation without a token infrastructure. RBAC can be layered on if multi-tenant scenarios require it.

### 3. CRDT-based conflict resolution for memory writes
Use Conflict-free Replicated Data Types to automatically resolve write conflicts. Rejected because CRDTs solve a different problem (convergence under partition) and do not address authorization or staleness. CRDTs are available in the broader Claude Flow hive-mind system for distributed consensus, but memory governance is about policy, not data structures.

### 4. No memory governance, rely on agent prompts
Instruct agents via their prompts to "only write to your assigned namespace." Rejected for the same reason as relying on CLAUDE.md rules: prompts are advisory. Agents can and do ignore them, especially in long sessions.

## References

- `v3/@claude-flow/guidance/src/gates.ts` -- `EnforcementGates.evaluateToolUse()` for MCP tool gating
- `v3/@claude-flow/guidance/src/retriever.ts` -- `areContradictory()`, `selectWithContradictionCheck()`
- `v3/@claude-flow/guidance/src/ledger.ts` -- `ViolationRateEvaluator`, `RunLedger.addEvaluator()`, `computeMetrics()`
- `v3/@claude-flow/guidance/src/types.ts` -- `GuidanceRule.domains`, `GuidanceRule.repoScopes`, `GuidanceRule.toolClasses`
- ADR-G004 -- Four enforcement gates that memory gating builds on
- ADR-G008 -- Optimizer loop that evolves memory governance rules
