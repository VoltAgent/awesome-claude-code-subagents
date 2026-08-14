# Getting Started with @claude-flow/guidance

## Background: How Claude Code Uses Memory Files

In Claude Code, `CLAUDE.md` and `CLAUDE.local.md` are loaded into the agent's working context at session start. They are the primary mechanism for telling Claude Code how to behave on your project:

| File | Who it's for | Committed? |
|------|-------------|-----------|
| `CLAUDE.md` | The whole team | Yes |
| `CLAUDE.local.md` | You, on this machine | No (auto-gitignored) |

Claude Code searches **upward** from the current directory and loads every instance it finds. In a monorepo, a child directory's `CLAUDE.md` layers on top of the root's. Run `/memory` in Claude Code to see which files were loaded.

The `@import` pattern offers an alternative to `CLAUDE.local.md` for developers using multiple git worktrees:

```markdown
# In CLAUDE.md (committed):
@~/.claude/my_project_instructions.md
```

## What This Package Adds

The Guidance Control Plane takes these plain-text files and turns them into structured, enforceable, auditable policy. Without it, Claude Code loads `CLAUDE.md` as raw text and relies on the model to follow it. With it, rules become typed objects with gates that block violations before they execute.

## Installation

```bash
npm install @claude-flow/guidance@v3alpha
```

Requires Node.js 20+.

## Minimal Setup

```ts
import { createGuidanceControlPlane } from '@claude-flow/guidance';

const plane = createGuidanceControlPlane({
  rootGuidancePath: './CLAUDE.md',
  localGuidancePath: './CLAUDE.local.md', // optional, your personal overrides
});
await plane.initialize();
```

This reads both files, compiles them into a policy bundle (constitution + rule shards + manifest), and prepares all subsystems.

## What Happens at Initialization

1. **Load** — `CLAUDE.md` is read as the root guidance. `CLAUDE.local.md` (if present) is read as an overlay. Local rules supplement or override root rules.
2. **Compile** — Both files are parsed into structured rules. Each rule gets an ID, risk class, domain tags, tool class tags, and intent tags.
3. **Shard** — Rules are broken into task-scoped shards. The always-loaded invariants form the constitution (first ~30-60 lines of the root file). Everything else becomes retrievable shards.
4. **Index** — Shards are loaded into the retriever for similarity-based lookup.
5. **Activate gates** — Enforcement gates are configured from the compiled rules.

## Core Loop

Every agent task follows this pattern:

```ts
// 1. Retrieve relevant rules for this task
const guidance = await plane.retrieveForTask({
  taskDescription: 'Fix the login timeout bug',
  intent: 'bug-fix',
});
// guidance.constitution — always-loaded invariants
// guidance.shards — task-relevant rules

// 2. Gate commands before execution
const gateResults = plane.evaluateCommand('git reset --hard');
for (const result of gateResults) {
  if (result.decision === 'deny') {
    console.error(`Blocked: ${result.reason}`);
    // Don't execute the command
  }
}

// 3. Track the run
const event = plane.startRun('task-123', 'bug-fix');
// ... agent does work ...
const evaluations = await plane.finalizeRun(event);
```

## Using Individual Modules

You don't have to use the all-in-one control plane. Each module is independently importable:

```ts
// Just the gates
import { createGates } from '@claude-flow/guidance/gates';
const gates = createGates({ destructiveOps: true, secrets: true });

// Just the proof chain
import { createProofChain } from '@claude-flow/guidance/proof';
const chain = createProofChain('my-hmac-key');

// Just the trust system
import { createTrustSystem } from '@claude-flow/guidance/trust';
const trust = createTrustSystem();
```

All 20 modules are available as separate entry points. See the [API Reference](../reference/api-quick-reference.md) for the full list.

## CLAUDE.md vs. CLAUDE.local.md

### What goes in CLAUDE.md (shared, committed)

Team-level guidance everyone benefits from:

```markdown
# Build & Test
Run `npm test` before committing. Run `npm run build` to type-check.

# Coding Standards
- No `any` types. Use `unknown` when the type is truly unknown.
- All public functions require JSDoc.

# Architecture
This project uses a layered architecture. See docs/architecture.md.

# Domain Rules
- Never write to the `users` table without a migration.
- API responses must include `requestId` for tracing.
```

### What goes in CLAUDE.local.md (private, not committed)

Machine-specific or personal notes:

```markdown
# My Environment
- Local API: http://localhost:3001
- Test DB: postgres://localhost:5432/myapp_test

# Preferences
- Show git diffs before committing
- I prefer verbose error messages
```

### The @import alternative for worktrees

If you use multiple git worktrees, `CLAUDE.local.md` is awkward because each worktree needs its own copy. The `@` import pattern inside `CLAUDE.md` points to a shared file in your home directory:

```markdown
@~/.claude/my_project_instructions.md
```

### How the optimizer uses both files

The optimizer watches which `CLAUDE.local.md` experiments reduce violations. When a local rule consistently outperforms the root, the optimizer proposes promoting it to `CLAUDE.md` with an ADR:

```ts
const optimized = await plane.optimize();
// optimized.promoted — rules moved from local to root
// optimized.demoted — ineffective root rules flagged
// optimized.adrsCreated — decision records
```

## WASM Acceleration

If the pre-built WASM binary is available, hot-path operations (hashing, secret scanning, destructive detection) run 1.25-1.96x faster automatically:

```ts
import { getKernel, isWasmAvailable } from '@claude-flow/guidance/wasm-kernel';

console.log(isWasmAvailable()); // true if WASM loaded
const k = getKernel(); // WASM or JS fallback — same API either way
```

No configuration needed. The bridge detects WASM availability at load time.

## File Organization

```
@claude-flow/guidance/
  src/
    index.ts            # Control plane + re-exports
    compiler.ts         # CLAUDE.md → PolicyBundle
    retriever.ts        # Shard similarity retrieval
    gates.ts            # Enforcement gates (4 built-in)
    gateway.ts          # Tool gateway (idempotency + schema + budget)
    proof.ts            # Hash-chained proof envelopes
    continue-gate.ts    # Step-level agent control
    memory-gate.ts      # Memory write authorization
    capabilities.ts     # Typed permission algebra
    trust.ts            # Trust score accumulation
    authority.ts        # Authority levels + irreversibility
    adversarial.ts      # Threat/collusion detection + quorum
    meta-governance.ts  # Governance over governance
    coherence.ts        # Coherence scoring + economic budgets
    uncertainty.ts      # Probabilistic belief tracking
    temporal.ts         # Bitemporal assertions
    truth-anchors.ts    # Immutable external facts
    ledger.ts           # Run logging + evaluators
    optimizer.ts        # Rule evolution
    headless.ts         # Automated compliance testing
    wasm-kernel.ts      # WASM host bridge
  wasm-kernel/          # Rust source for WASM kernel
  wasm-pkg/             # Pre-built WASM binary
  tests/                # 1088 tests across 24 files
  docs/
    guides/             # Conceptual guides
    tutorials/          # Step-by-step walkthroughs
    reference/          # API reference
    diagrams/           # Architecture diagrams
    adrs/               # Architecture Decision Records (G001-G025)
```

## Verification

To confirm both files are being loaded and enforced:

1. Add a unique rule to `CLAUDE.md`: `# Test: Always respond in English`
2. Add a different rule to `CLAUDE.local.md`: `# Test: Prefer bullet points`
3. Start Claude Code and run `/memory` — both files should appear as loaded
4. Ask Claude to restate each unique rule to confirm both were applied

Then, initialize the guidance control plane and confirm:

```ts
const plane = createGuidanceControlPlane({
  rootGuidancePath: './CLAUDE.md',
  localGuidancePath: './CLAUDE.local.md',
});
await plane.initialize();
const bundle = plane.getBundle();
console.log(bundle.constitution.length);  // > 0
console.log(bundle.shards.length);        // > 0
```

## Next Steps

- [Architecture Overview](./architecture-overview.md) — How the 7 layers connect
- [Enforcement Gates Tutorial](../tutorials/enforcement-gates.md) — Wire gates into hooks
- [Multi-Agent Security](./multi-agent-security.md) — Threat detection, collusion, quorum
- [WASM Kernel Guide](./wasm-kernel.md) — Building and benchmarking
