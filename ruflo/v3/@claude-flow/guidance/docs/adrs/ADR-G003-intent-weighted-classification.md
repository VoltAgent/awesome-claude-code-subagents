# ADR-G003: Intent-Weighted Classification -- Deterministic Task Intent Without LLM Calls

## Status
Accepted

## Date
2026-02-01

## Context

The shard retriever (ADR-G002) must classify the current task's intent to boost relevant shards. For example, a "fix the XSS vulnerability" task should boost security shards, while "add the user profile page" should boost feature and architecture shards.

Intent classification must satisfy three constraints:

1. **Speed.** Classification runs on every task start, adding to the critical path before the model begins work. Anything above 5ms is noticeable.
2. **Determinism.** The same task description must always produce the same intent. Non-deterministic classification (e.g., from an LLM) would make retrieval results unpredictable and untestable.
3. **Zero dependencies.** The guidance package must work without network access, API keys, or external services. This rules out calling an LLM or a remote classification API.

The system supports 11 intent categories defined in `src/types.ts` as the `TaskIntent` union type: `bug-fix`, `feature`, `refactor`, `security`, `performance`, `testing`, `docs`, `deployment`, `architecture`, `debug`, and `general`.

## Decision

Use weighted regular expression patterns per intent category, with highest-total-score-wins as the classification strategy.

The `INTENT_PATTERNS` map in `src/retriever.ts` defines, for each `TaskIntent`, an array of `{ pattern: RegExp; weight: number }` entries. Example:

```typescript
'security': [
  { pattern: /\b(security|auth|permission|access control|encrypt|secret|token)\b/i, weight: 0.9 },
  { pattern: /\b(cve|vulnerability|injection|xss|csrf|sanitize)\b/i, weight: 1.0 },
],
```

Classification algorithm in `ShardRetriever.classifyIntent()`:

1. For each intent category (excluding `general`), iterate its patterns
2. For each pattern that matches the task description, add its weight to the category's score
3. The category with the highest total score wins
4. Normalize confidence to [0, 1] by dividing by 3 (the approximate max achievable score for a single category)
5. If no category scores above 0, fall back to `general`

The `general` intent has a single catch-all pattern `/./ ` with weight 0.1, ensuring it never wins over a real match but provides a fallback.

### Weight Design Principles

- **High-specificity terms get weight 0.9-1.0.** Words like "cve", "vulnerability", "xss" are unambiguous signals for security.
- **Medium-specificity terms get weight 0.5-0.8.** Words like "fix", "add", "create" are common across intents but lean toward specific categories.
- **Low-specificity terms get weight 0.3.** Words like "user", "page", "component" weakly suggest feature work but are ambiguous.
- **Additive scoring handles multi-signal tasks.** A description like "fix the authentication vulnerability in the login page" scores security at 0.9 (auth) + 1.0 (vulnerability) = 1.9, which dominates bug-fix's 0.8 (fix).

### Plural and Variant Handling

Patterns use word boundary anchors (`\b`) and case-insensitive flags (`/i`). Alternation groups handle variants: `tests?` matches both "test" and "tests", `mocks?` matches "mock" and "mocks".

### Override Mechanism

`RetrievalRequest.intent` allows callers to override the detected intent. This is useful when the calling context has stronger signal (e.g., the user explicitly tagged the task or the hook system classified it).

## Consequences

### Positive

- **Sub-millisecond classification.** Regex matching against 20-30 patterns completes in <0.1ms on modern hardware. Measured at 0.02ms in benchmarks.
- **Fully deterministic.** Same input always produces the same output. Tests can assert exact intent classifications.
- **No external dependencies.** No API keys, network, or ONNX models required. Works offline, in CI, and in sandboxed environments.
- **Transparent scoring.** The score breakdown is inspectable: developers can see exactly which patterns matched and with what weight.
- **Handles multi-intent tasks.** A task description that touches both security and testing will score both, with the dominant concern winning.

### Negative

- **No semantic understanding.** The classifier cannot understand novel phrasings that do not match any pattern. "Make the system less hackable" would not match the security patterns. Mitigation: patterns are designed to cover common phrasings, and the intent boost is additive (shards can still be retrieved by semantic similarity alone).
- **Manual maintenance.** New intent signals require adding patterns. Mitigation: the optimizer loop (ADR-G008) can propose new patterns based on misclassifications observed in the ledger.
- **English-only.** Patterns are English regex. Non-English task descriptions will fall back to `general`. Mitigation: the `intent` override in `RetrievalRequest` allows external classifiers to supply the intent.

## Alternatives Considered

### 1. LLM-based classification
Send the task description to a cheap model (e.g., Haiku) with a classification prompt. Rejected because it adds 200-500ms latency, requires an API key, is non-deterministic across runs, and costs money per classification.

### 2. TF-IDF + cosine similarity against intent exemplars
Pre-compute TF-IDF vectors for each intent and compare. Rejected because TF-IDF requires a corpus, adds a vocabulary dependency, and is slower than regex for this small pattern set. The benefit of TF-IDF (handling novel terms) is marginal when the intent categories are well-defined.

### 3. Embedding-based classification
Embed the task description and compare to intent centroid embeddings. Rejected because it requires an embedding model (adding a dependency), is slower than regex (~5ms vs. <0.1ms), and the 11-class problem is simple enough for pattern matching.

### 4. Unweighted keyword matching
Match keywords without weights, count matches. Rejected because it treats ambiguous keywords (like "fix") equally with specific ones (like "cve"), leading to frequent misclassification when descriptions contain generic action verbs.

## References

- `v3/@claude-flow/guidance/src/retriever.ts` -- `INTENT_PATTERNS` map, `ShardRetriever.classifyIntent()`
- `v3/@claude-flow/guidance/src/types.ts` -- `TaskIntent` union type
- ADR-G002 -- Constitution/shard split that depends on intent classification
