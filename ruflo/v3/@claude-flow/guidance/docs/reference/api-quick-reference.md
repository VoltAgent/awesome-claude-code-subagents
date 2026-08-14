# API Quick Reference

All exports from `@claude-flow/guidance`. Each module is also available as a standalone import.

## Import Map

| Import Path | Key Exports |
|-------------|-------------|
| `@claude-flow/guidance` | `GuidanceControlPlane`, `createGuidanceControlPlane` |
| `@claude-flow/guidance/compiler` | `GuidanceCompiler`, `createCompiler` |
| `@claude-flow/guidance/retriever` | `ShardRetriever`, `createRetriever`, `HashEmbeddingProvider` |
| `@claude-flow/guidance/gates` | `EnforcementGates`, `createGates` |
| `@claude-flow/guidance/hooks` | `GuidanceHookProvider`, `createGuidanceHooks` |
| `@claude-flow/guidance/ledger` | `RunLedger`, `createLedger`, `TestsPassEvaluator`, `ForbiddenCommandEvaluator`, `ForbiddenDependencyEvaluator`, `ViolationRateEvaluator`, `DiffQualityEvaluator` |
| `@claude-flow/guidance/optimizer` | `OptimizerLoop`, `createOptimizer` |
| `@claude-flow/guidance/persistence` | `PersistentLedger`, `EventStore`, `createPersistentLedger`, `createEventStore` |
| `@claude-flow/guidance/headless` | `HeadlessRunner`, `createHeadlessRunner`, `createComplianceSuite` |
| `@claude-flow/guidance/gateway` | `DeterministicToolGateway`, `createToolGateway` |
| `@claude-flow/guidance/artifacts` | `ArtifactLedger`, `createArtifactLedger` |
| `@claude-flow/guidance/evolution` | `EvolutionPipeline`, `createEvolutionPipeline` |
| `@claude-flow/guidance/manifest-validator` | `ManifestValidator`, `ConformanceSuite`, `createManifestValidator`, `createConformanceSuite` |
| `@claude-flow/guidance/proof` | `ProofChain`, `createProofChain` |
| `@claude-flow/guidance/memory-gate` | `MemoryWriteGate`, `createMemoryWriteGate`, `createMemoryEntry` |
| `@claude-flow/guidance/coherence` | `CoherenceScheduler`, `EconomicGovernor`, `createCoherenceScheduler`, `createEconomicGovernor` |
| `@claude-flow/guidance/capabilities` | `CapabilityAlgebra`, `createCapabilityAlgebra` |
| `@claude-flow/guidance/conformance-kit` | `SimulatedRuntime`, `MemoryClerkCell`, `ConformanceRunner`, `createMemoryClerkCell`, `createConformanceRunner` |
| `@claude-flow/guidance/ruvbot-integration` | `RuvBotGuidanceBridge`, `AIDefenceGate`, `RuvBotMemoryAdapter`, `createRuvBotBridge`, `createAIDefenceGate`, `createRuvBotMemoryAdapter` |
| `@claude-flow/guidance/meta-governance` | `MetaGovernor`, `createMetaGovernor` |
| `@claude-flow/guidance/adversarial` | `ThreatDetector`, `CollusionDetector`, `MemoryQuorum`, `createThreatDetector`, `createCollusionDetector`, `createMemoryQuorum` |
| `@claude-flow/guidance/trust` | `TrustAccumulator`, `TrustScoreLedger`, `TrustSystem`, `getTrustBasedRateLimit`, `createTrustAccumulator`, `createTrustSystem` |
| `@claude-flow/guidance/truth-anchors` | `TruthAnchorStore`, `TruthResolver`, `createTruthAnchorStore`, `createTruthResolver` |
| `@claude-flow/guidance/uncertainty` | `UncertaintyLedger`, `UncertaintyAggregator`, `createUncertaintyLedger`, `createUncertaintyAggregator` |
| `@claude-flow/guidance/temporal` | `TemporalStore`, `TemporalReasoner`, `createTemporalStore`, `createTemporalReasoner` |
| `@claude-flow/guidance/authority` | `AuthorityGate`, `IrreversibilityClassifier`, `createAuthorityGate`, `createIrreversibilityClassifier`, `isHigherAuthority`, `getAuthorityHierarchy` |
| `@claude-flow/guidance/continue-gate` | `ContinueGate`, `createContinueGate` |
| `@claude-flow/guidance/wasm-kernel` | `getKernel`, `isWasmAvailable`, `resetKernel` |
| `@claude-flow/guidance/generators` | `generateClaudeMd`, `generateClaudeLocalMd`, `generateSkillMd`, `generateAgentMd`, `generateAgentIndex`, `scaffold` |
| `@claude-flow/guidance/analyzer` | `analyze`, `benchmark`, `autoOptimize`, `optimizeForSize`, `headlessBenchmark`, `validateEffect`, `abBenchmark`, `getDefaultABTasks`, `formatReport`, `formatBenchmark` |

---

## GuidanceControlPlane

The all-in-one orchestrator.

```ts
const plane = createGuidanceControlPlane(config?)
await plane.initialize()
```

| Method | Returns | Description |
|--------|---------|-------------|
| `initialize()` | `Promise<void>` | Read CLAUDE.md, compile, load shards, activate gates |
| `compile(root, local?)` | `Promise<PolicyBundle>` | Compile without reading files |
| `retrieveForTask(request)` | `Promise<RetrievalResult>` | Get constitution + relevant shards |
| `evaluateCommand(cmd)` | `GateResult[]` | Gate a shell command |
| `evaluateToolUse(tool, params)` | `GateResult[]` | Gate a tool call |
| `evaluateEdit(path, content, lines)` | `GateResult[]` | Gate a file edit |
| `startRun(taskId, intent)` | `RunEvent` | Begin tracking a run |
| `recordViolation(event, violation)` | `void` | Log a violation |
| `finalizeRun(event)` | `Promise<EvaluatorResult[]>` | Close run, evaluate |
| `optimize()` | `Promise<{promoted, demoted, adrsCreated}>` | Evolve rules |
| `getStatus()` | `ControlPlaneStatus` | System status |
| `getMetrics()` | Metrics object | Violation rate, rework, etc. |
| `getBundle()` | `PolicyBundle \| null` | Current compiled bundle |
| `getLedger()` | `RunLedger` | Access the run ledger |

---

## EnforcementGates

```ts
const gates = createGates(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `evaluateCommand(cmd)` | `GateResult[]` | Check command against all gates |
| `evaluateToolUse(tool, params)` | `GateResult[]` | Check tool call |
| `evaluateEdit(path, content, lines)` | `GateResult[]` | Check file edit |
| `setActiveRules(rules)` | `void` | Load compiled rules |
| `getActiveGateCount()` | `number` | Number of active gates |

**GateResult**: `{ decision: 'allow'|'deny'|'warn', rule, reason, evidence }`

---

## DeterministicToolGateway

```ts
const gw = createToolGateway(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `evaluate(tool, params)` | `GatewayDecision` | Full pipeline: idempotency → schema → budget → gates |
| `registerSchema(schema)` | `void` | Register tool parameter schema |
| `setBudget(budget)` | `void` | Set multi-dimensional budget |
| `getBudget()` | `Budget` | Current budget state |

---

## ProofChain

```ts
const chain = createProofChain(hmacKey)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `appendEvent(event, toolCalls, memOps)` | `ProofEnvelope` | Add envelope |
| `verify()` | `boolean` | Verify entire chain |
| `verifyEnvelope(index)` | `boolean` | Verify single envelope |
| `getEnvelope(index)` | `ProofEnvelope` | Get envelope by index |
| `serialize()` | `SerializedProofChain` | Export for persistence |
| `ProofChain.deserialize(data, key)` | `ProofChain` | Restore from export |
| `length` | `number` | Number of envelopes |

---

## ContinueGate

```ts
const gate = createContinueGate(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `evaluate(context)` | `ContinueDecision` | Decide: continue/checkpoint/throttle/pause/stop |
| `getHistory()` | `ContinueDecision[]` | Past decisions |
| `getStats()` | Stats object | Counts per decision type |

**StepContext fields**: `stepNumber`, `tokensUsed`, `tokenBudget`, `toolCallsUsed`, `toolCallBudget`, `timeMs`, `timeBudgetMs`, `coherenceScore`, `uncertaintyScore`, `reworkCount`

---

## MemoryWriteGate

```ts
const gate = createMemoryWriteGate(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `registerAuthority(auth)` | `void` | Register agent permissions |
| `evaluateWrite(agentId, ns, key, val, ttl)` | `WriteDecision` | Authorize a write |

---

## CapabilityAlgebra

```ts
const algebra = createCapabilityAlgebra()
```

| Method | Returns | Description |
|--------|---------|-------------|
| `grant(params)` | `Capability` | Create a new capability |
| `check(agentId, scope, resource, action)` | `CapabilityCheckResult` | Check permission |
| `attenuate(capId, changes)` | `Capability` | Narrow a capability |
| `delegate(capId, toAgent, limits)` | `Capability` | Delegate to another agent |
| `revoke(capId)` | `void` | Revoke (cascades to delegations) |
| `intersect(capA, capB)` | `Capability` | Actions in both |
| `merge(capA, capB)` | `Capability` | Constraints from both |

---

## TrustSystem

```ts
const trust = createTrustSystem(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `recordOutcome(agentId, outcome)` | `void` | Record allow/deny/warn |
| `getSnapshot(agentId)` | `TrustSnapshot` | Current score and tier |
| `getLedger()` | `TrustScoreLedger` | Full history |

**Tiers**: `trusted` (>=0.8), `standard` (>=0.5), `probation` (>=0.3), `untrusted` (<0.3)

---

## AuthorityGate

```ts
const auth = createAuthorityGate(signingKey)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `registerScope(scope)` | `void` | Set authority requirements |
| `check(level, action)` | `AuthorityCheckResult` | Check if level is sufficient |
| `recordIntervention(params)` | `HumanIntervention` | Record signed approval |

---

## IrreversibilityClassifier

```ts
const irrev = createIrreversibilityClassifier()
```

| Method | Returns | Description |
|--------|---------|-------------|
| `classify(action)` | `IrreversibilityResult` | reversible/costly-reversible/irreversible |
| `addPattern(class, regex)` | `void` | Add custom pattern (ReDoS-validated) |

---

## ThreatDetector

```ts
const detector = createThreatDetector(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `analyzeInput(input, context)` | `ThreatSignal[]` | Scan for threats |
| `analyzeMemoryWrite(ns, key, val, ctx)` | `ThreatSignal[]` | Scan memory write |

---

## CollusionDetector

```ts
const detector = createCollusionDetector(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `recordInteraction(from, to, hash)` | `void` | Log agent interaction |
| `detectCollusion()` | `CollusionReport` | Check for rings/frequency anomalies |

---

## MemoryQuorum

```ts
const quorum = createMemoryQuorum(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `propose(key, value, agentId)` | `string` | Create proposal, get ID |
| `vote(proposalId, agentId, approve)` | `void` | Cast vote |
| `resolve(proposalId)` | `QuorumResult` | Tally votes |

---

## MetaGovernor

```ts
const gov = createMetaGovernor(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `checkInvariants(state)` | `InvariantReport` | Verify constitutional invariants |
| `proposeAmendment(desc, changes, author)` | `string` | Propose change |
| `voteOnAmendment(id, voter, approve)` | `void` | Cast vote |
| `resolveAmendment(id)` | `Amendment` | Resolve with supermajority |

---

## UncertaintyLedger

```ts
const ledger = createUncertaintyLedger(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `assert(ns, claim, params)` | `string` | Create belief |
| `addEvidence(id, evidence)` | `void` | Add supporting/opposing evidence |
| `get(id)` | `Belief` | Get belief with computed confidence |
| `query(filters)` | `Belief[]` | Filter by namespace/status/confidence/tags |

---

## TemporalStore

```ts
const store = createTemporalStore()
```

| Method | Returns | Description |
|--------|---------|-------------|
| `assert(ns, key, value, window)` | `string` | Create temporal assertion |
| `retract(id)` | `void` | Soft-delete |
| `getAt(ns, timestamp)` | `TemporalAssertion[]` | Active at time T |

---

## TruthAnchorStore

```ts
const store = createTruthAnchorStore(signingKey)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `create(params)` | `TruthAnchor` | Create immutable signed anchor |
| `get(id)` | `TruthAnchor` | Retrieve anchor |
| `verify(id)` | `boolean` | Verify signature |
| `verifyAll()` | `VerifyAllResult` | Verify entire store |

---

## CoherenceScheduler

```ts
const scheduler = createCoherenceScheduler(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `computeScore(events)` | `CoherenceScore` | Compute from recent events |
| `getPrivilegeLevel(score)` | `PrivilegeLevel` | full/restricted/read-only/suspended |

---

## EconomicGovernor

```ts
const econ = createEconomicGovernor(config?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `recordUsage(usage)` | `void` | Track resource consumption |
| `checkBudgets()` | `BudgetAlert[]` | Check for threshold crossings |
| `getUsage()` | `BudgetUsage` | Current usage across all dimensions |

---

## WASM Kernel

```ts
const k = getKernel()
```

| Method | Returns | Description |
|--------|---------|-------------|
| `k.available` | `boolean` | true = WASM, false = JS fallback |
| `k.sha256(input)` | `string` | SHA-256 hash (hex) |
| `k.hmacSha256(key, input)` | `string` | HMAC-SHA256 (hex) |
| `k.contentHash(json)` | `string` | Sorted-key content hash |
| `k.signEnvelope(key, json)` | `string` | Sign proof envelope |
| `k.verifyChain(json, key)` | `boolean` | Verify proof chain |
| `k.scanSecrets(content)` | `string[]` | Scan for secrets |
| `k.detectDestructive(cmd)` | `string \| null` | Detect destructive commands |
| `k.batchProcess(ops)` | `BatchResult[]` | Batch operations |

| Helper | Returns | Description |
|--------|---------|-------------|
| `isWasmAvailable()` | `boolean` | Check without loading |
| `resetKernel()` | `void` | Force re-detection on next `getKernel()` |

---

## Generators

```ts
import { generateClaudeMd, scaffold } from '@claude-flow/guidance/generators';
```

| Function | Returns | Description |
|----------|---------|-------------|
| `generateClaudeMd(profile)` | `string` | Generate CLAUDE.md from a `ProjectProfile` |
| `generateClaudeLocalMd(profile)` | `string` | Generate CLAUDE.local.md from a `LocalProfile` |
| `generateSkillMd(skill)` | `string` | Generate a skill definition markdown |
| `generateAgentMd(agent)` | `string` | Generate an agent manifest markdown |
| `generateAgentIndex(agents)` | `string` | Generate an agent index file |
| `scaffold(options)` | `ScaffoldResult` | Full project scaffolding |

**Key types**: `ProjectProfile`, `LocalProfile`, `SkillDefinition`, `AgentDefinition`, `ScaffoldOptions`, `ScaffoldResult`

---

## Analyzer

```ts
import { analyze, validateEffect } from '@claude-flow/guidance/analyzer';
```

### Scoring & Reporting

| Function | Returns | Description |
|----------|---------|-------------|
| `analyze(content, localContent?)` | `AnalysisResult` | 6-dimension analysis with composite score (0-100) and grade (A-F) |
| `benchmark(before, after, local?)` | `BenchmarkResult` | Compare two CLAUDE.md versions |
| `formatReport(result)` | `string` | Formatted analysis report |
| `formatBenchmark(result)` | `string` | Formatted benchmark comparison |

**AnalysisResult**: `{ compositeScore, grade, dimensions[], metrics, suggestions[], analyzedAt }`

**6 Dimensions**: Structure (20%), Coverage (20%), Enforceability (25%), Compilability (15%), Clarity (10%), Completeness (10%)

### Optimization

| Function | Returns | Description |
|----------|---------|-------------|
| `autoOptimize(content, local?, maxIter?)` | `{ optimized, benchmark, appliedSuggestions }` | Iterative score improvement |
| `optimizeForSize(content, options)` | `{ optimized, benchmark, appliedSteps, proof }` | Context-size-aware optimization |

**OptimizeOptions**: `{ contextSize: 'compact'|'standard'|'full', targetScore?, maxIterations?, proofKey? }`

| Context Size | Line Budget | Use Case |
|-------------|-------------|----------|
| `compact` | 80 lines | Small context windows, cost optimization |
| `standard` | 200 lines | Default for most projects |
| `full` | 500 lines | Large context windows, maximum coverage |

### Headless Benchmarking

| Function | Returns | Description |
|----------|---------|-------------|
| `headlessBenchmark(original, optimized, options?)` | `Promise<HeadlessBenchmarkResult>` | Run compliance tasks via `claude -p` |

**Options**: `{ executor?, proofKey?, workDir? }`

Accepts an `IHeadlessExecutor` for testing without the real CLI.

### Empirical Behavioral Validation

| Function | Returns | Description |
|----------|---------|-------------|
| `validateEffect(original, optimized, options?)` | `Promise<ValidationReport>` | Prove score improvements produce behavioral improvements |

**Options**: `{ executor?, tasks?, proofKey?, workDir?, trials? }`

**ValidationReport fields**:

| Field | Type | Description |
|-------|------|-------------|
| `before` / `after` | `ValidationRun` | Analysis + task results + adherence per phase |
| `correlation.pearsonR` | `number` | Linear correlation (-1 to 1) |
| `correlation.spearmanRho` | `number` | Rank correlation (-1 to 1) |
| `correlation.cohensD` | `number \| null` | Effect size magnitude |
| `correlation.effectSizeLabel` | `string` | negligible / small / medium / large |
| `correlation.verdict` | `string` | positive-effect / negative-effect / no-effect / inconclusive |
| `proofChain` | `ProofEnvelope[]` | Tamper-evident audit trail |
| `report` | `string` | Full formatted evidence report |

**IContentAwareExecutor**: Extends `IHeadlessExecutor` with `setContext(claudeMdContent)` — called before each phase so the executor can vary behavior based on guidance quality.

**15 default validation tasks** cover all 6 dimensions: secret handling, force push prevention, type safety, test-before-commit, build/test awareness, security rules, architecture knowledge, destructive action blocking, code style, error handling, deployment, and environment variables.

### A/B Benchmark Harness

| Function | Returns | Description |
|----------|---------|-------------|
| `abBenchmark(claudeMd, options?)` | `Promise<ABReport>` | Run 20 tasks under Config A (no guidance) vs Config B (with guidance) |
| `getDefaultABTasks()` | `ABTask[]` | Get the 20 default benchmark tasks spanning 7 classes |

**Options**: `{ executor?, tasks?, proofKey?, workDir? }`

**ABReport fields**:

| Field | Type | Description |
|-------|------|-------------|
| `configA` / `configB` | `{ label, taskResults, metrics }` | Per-config results |
| `configA.metrics.compositeScore` | `number` | `success_rate − 0.1*cost − 0.2*violations − 0.1*interventions` |
| `configB.metrics.classSuccessRates` | `Record<ABTaskClass, number>` | Per-class success rates |
| `compositeDelta` | `number` | B − A composite score difference |
| `classDeltas` | `Record<ABTaskClass, number>` | Per-class success rate deltas |
| `categoryShift` | `boolean` | `true` if B beats A by ≥0.2 across ≥3 task classes |
| `proofChain` | `ProofEnvelope[]` | Tamper-evident audit trail |
| `report` | `string` | Full formatted A/B benchmark report |

**7 task classes**: `bug-fix` (3), `feature` (5), `refactor` (3), `security` (3), `deployment` (2), `test` (2), `performance` (2)

**Gate simulation** detects 7 violation categories: `destructive-command`, `hardcoded-secret`, `force-push`, `unsafe-type`, `skipped-hook`, `missing-test`, `policy-violation`.
