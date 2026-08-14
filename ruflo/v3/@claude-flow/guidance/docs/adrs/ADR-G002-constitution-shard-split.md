# ADR-G002: Constitution / Shard Split -- Always-Loaded Core Rules vs. Task-Scoped Retrieval

## Status
Accepted

## Date
2026-02-01

## Context

A typical `CLAUDE.md` file for a production project contains 100-500 rules covering security, testing, architecture, deployment, performance, and coding style. Loading all rules into the context window on every turn has two costs:

1. **Token waste.** A 400-rule file at ~5 tokens per rule consumes ~2,000 tokens per turn. Over a 50-turn session, that is 100,000 tokens of repeated context that is mostly irrelevant to any single task.

2. **Attention dilution.** Transformer attention degrades with document length. A model asked to "fix the login bug" does not benefit from rules about Kubernetes deployment -- but those rules compete for attention with the security rules that are relevant.

The opposite extreme -- loading no rules and relying on the model's training -- causes drift. The model forgets project-specific conventions, introduces forbidden dependencies, or skips mandatory test steps.

We need a middle ground: a small, always-present set of invariants plus a larger set of rules retrieved on demand.

## Decision

Split the compiled rule set into two tiers:

### Tier 1: Constitution (always loaded)

The `GuidanceCompiler` in `src/compiler.ts` identifies constitution rules by scanning for section headers matching `CONSTITUTION_MARKERS`:

```typescript
const CONSTITUTION_MARKERS = [
  /^#+\s*(safety|security|invariant|constitution|critical|non[- ]?negotiable|always)/i,
  /^#+\s*(must|never|always|required|mandatory)/i,
];
```

Constitution rules are extracted into a `Constitution` object (defined in `src/types.ts`) with:
- A `rules` array of `GuidanceRule` objects, each with `isConstitution: true`
- A `text` field containing a compact rendering (capped at `maxConstitutionLines`, default 60)
- A `hash` field (SHA-256 truncated to 16 hex chars) for change detection

Constitution rules receive a priority boost of +100 over their base priority, ensuring they always dominate in contradiction resolution.

The constitution is designed to be 30-60 lines (~500 tokens) and covers:
- Security invariants (no hardcoded secrets, no force push to main)
- Safety invariants (no destructive ops without confirmation)
- Project-critical conventions (test before commit, lint before merge)

### Tier 2: Shards (retrieved per task)

All non-constitution rules become `RuleShard` objects. Each shard contains:
- The full `GuidanceRule` with intent tags, domain tags, tool classes, repo scopes
- A `compactText` field: `[RULE-ID] rule text @tag1 @tag2`
- An optional `embedding` vector (Float32Array) for semantic retrieval

The `ShardRetriever` in `src/retriever.ts` indexes shards by generating embeddings (via `IEmbeddingProvider`, defaulting to `HashEmbeddingProvider` for zero-dependency operation). At task start, retrieval works as follows:

1. Classify the task intent using weighted pattern matching (see ADR-G003)
2. Embed the task description
3. Score all shards by: `cosine_similarity + intent_boost(0.15) + risk_boost(0.05-0.10)`
4. Apply hard filters (risk class, repo scope)
5. Select top N (default 5) with contradiction resolution (higher priority wins)
6. Prepend the constitution, append selected shards

The `ShardRetriever.retrieve()` method returns a `RetrievalResult` containing the combined `policyText` ready for injection.

## Consequences

### Positive

- **Constant base cost.** The constitution costs ~500 tokens per turn regardless of total rule count. A 500-rule project pays the same constitution cost as a 50-rule project.
- **Relevance.** Shards are selected by semantic similarity and intent match, so only rules relevant to the current task consume context.
- **Scalability.** The rule set can grow without proportional context cost. Adding 100 new testing rules does not affect turns that are doing deployment work.
- **Contradiction safety.** The `selectWithContradictionCheck` method in `ShardRetriever` detects when two retrieved shards have contradictory language (must vs. never) in the same domain and keeps the higher-priority one.

### Negative

- **Missing shards.** If retrieval misses a relevant shard, the model lacks that guidance. Mitigation: critical rules belong in the constitution (always loaded), and the intent boost ensures domain-matched shards score higher.
- **Embedding quality.** The default `HashEmbeddingProvider` uses a deterministic hash-based pseudo-embedding that is not semantically meaningful. Production deployments should plug in an ONNX-based provider for real semantic similarity.
- **Constitution size pressure.** Teams may want to put too many rules in the constitution, defeating the purpose. The `maxConstitutionLines` cap (default 60) enforces discipline.

## Alternatives Considered

### 1. Load everything, rely on model attention
Load the full `CLAUDE.md` on every turn. Rejected because of the measured ~2,000 token cost and attention degradation on long documents. In testing, models skip rules beyond the first 100 lines with increasing probability.

### 2. Keyword-based retrieval (no embeddings)
Match shards by keyword overlap with the task description. Rejected because keyword matching misses synonyms and paraphrases. "Fix the auth issue" would not match a rule about "authentication vulnerability" without semantic similarity.

### 3. LLM-based retrieval (ask the model which rules apply)
Use a cheap model to select relevant rules. Rejected because it adds 200-500ms latency and a per-turn API cost. The embedding + cosine approach runs in <5ms with no API calls.

### 4. Fixed shard groups (manually curated)
Pre-define shard groups (e.g., "security pack", "testing pack") and load by task type. Rejected because it requires manual curation, does not adapt to new rule combinations, and breaks when rules span multiple domains.

## References

- `v3/@claude-flow/guidance/src/types.ts` -- `Constitution`, `RuleShard`, `PolicyBundle` type definitions
- `v3/@claude-flow/guidance/src/compiler.ts` -- `buildConstitution()`, `buildShards()`, `CONSTITUTION_MARKERS`
- `v3/@claude-flow/guidance/src/retriever.ts` -- `ShardRetriever.retrieve()`, `selectWithContradictionCheck()`
- ADR-G001 -- Why a separate control plane
- ADR-G003 -- Intent classification for shard retrieval
