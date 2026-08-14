# ADR-035: Advanced Code Intelligence Plugin

**Status:** Proposed
**Date:** 2026-01-24
**Category:** Advanced Development Tool
**Author:** Plugin Architecture Team
**Version:** 1.0.0
**Deciders:** Plugin Architecture Team, Developer Experience Team
**Supersedes:** None

## Context

Modern codebases are complex, distributed, and constantly evolving. Developers need advanced tooling that goes beyond traditional static analysis to understand code semantics, detect architectural drift, and provide intelligent refactoring suggestions. Existing tools often lack the graph-based reasoning and fast similarity search needed for large-scale codebases.

## Decision

Create an **Advanced Code Intelligence Plugin** that leverages RuVector WASM packages for semantic code search, architectural analysis, and intelligent refactoring with support for 20+ programming languages.

## Plugin Name

`@claude-flow/plugin-code-intelligence`

## Description

A comprehensive code intelligence plugin combining graph neural networks for code structure analysis with ultra-fast vector search for semantic code similarity. The plugin enables dead code detection, API surface analysis, refactoring impact prediction, and architectural drift monitoring while integrating seamlessly with existing IDE workflows.

## Key WASM Packages

| Package | Purpose |
|---------|---------|
| `micro-hnsw-wasm` | Semantic code search and clone detection (150x faster) |
| `ruvector-gnn-wasm` | Code dependency graphs, call graphs, and control flow analysis |
| `ruvector-mincut-wasm` | Module boundary detection and optimal code splitting |
| `sona` | Self-optimizing learning from code review patterns |
| `ruvector-dag-wasm` | Build dependency analysis and incremental compilation |

## MCP Tools

### 1. `code/semantic-search`

Find semantically similar code across the codebase.

```typescript
{
  name: 'code/semantic-search',
  description: 'Search for semantically similar code patterns',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query or code snippet'
      },
      scope: {
        type: 'object',
        properties: {
          paths: { type: 'array', items: { type: 'string' } },
          languages: { type: 'array', items: { type: 'string' } },
          excludeTests: { type: 'boolean', default: false }
        }
      },
      searchType: {
        type: 'string',
        enum: ['semantic', 'structural', 'clone', 'api_usage'],
        default: 'semantic'
      },
      topK: { type: 'number', default: 10 }
    },
    required: ['query']
  }
}
```

### 2. `code/architecture-analyze`

Analyze codebase architecture using graph algorithms.

```typescript
{
  name: 'code/architecture-analyze',
  description: 'Analyze codebase architecture and detect drift',
  inputSchema: {
    type: 'object',
    properties: {
      rootPath: { type: 'string', default: '.' },
      analysis: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'dependency_graph', 'layer_violations', 'circular_deps',
            'component_coupling', 'module_cohesion', 'dead_code',
            'api_surface', 'architectural_drift'
          ]
        }
      },
      baseline: { type: 'string', description: 'Git ref for drift comparison' },
      outputFormat: { type: 'string', enum: ['json', 'graphviz', 'mermaid'] }
    }
  }
}
```

### 3. `code/refactor-impact`

Predict impact of proposed refactoring.

```typescript
{
  name: 'code/refactor-impact',
  description: 'Analyze impact of proposed code changes using GNN',
  inputSchema: {
    type: 'object',
    properties: {
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            type: { type: 'string', enum: ['rename', 'move', 'delete', 'extract', 'inline'] },
            details: { type: 'object' }
          }
        }
      },
      depth: { type: 'number', default: 3, description: 'Dependency depth to analyze' },
      includeTests: { type: 'boolean', default: true }
    },
    required: ['changes']
  }
}
```

### 4. `code/split-suggest`

Suggest optimal module boundaries using MinCut.

```typescript
{
  name: 'code/split-suggest',
  description: 'Suggest optimal code splitting using MinCut algorithm',
  inputSchema: {
    type: 'object',
    properties: {
      targetPath: { type: 'string' },
      strategy: {
        type: 'string',
        enum: ['minimize_coupling', 'balance_size', 'feature_isolation'],
        default: 'minimize_coupling'
      },
      constraints: {
        type: 'object',
        properties: {
          maxModuleSize: { type: 'number' },
          minModuleSize: { type: 'number' },
          preserveBoundaries: { type: 'array', items: { type: 'string' } }
        }
      },
      targetModules: { type: 'number', description: 'Target number of modules' }
    },
    required: ['targetPath']
  }
}
```

### 5. `code/learn-patterns`

Learn code patterns from repository history.

```typescript
{
  name: 'code/learn-patterns',
  description: 'Learn recurring patterns from code changes using SONA',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'object',
        properties: {
          gitRange: { type: 'string', default: 'HEAD~100..HEAD' },
          authors: { type: 'array', items: { type: 'string' } },
          paths: { type: 'array', items: { type: 'string' } }
        }
      },
      patternTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['bug_patterns', 'refactor_patterns', 'api_patterns', 'test_patterns']
        }
      },
      minOccurrences: { type: 'number', default: 3 }
    }
  }
}
```

## Use Cases

1. **Code Review**: Find similar code patterns to ensure consistency
2. **Refactoring**: Predict impact of changes before implementing
3. **Architecture Governance**: Detect and prevent architectural drift
4. **Onboarding**: Help new developers understand codebase structure
5. **Technical Debt**: Identify dead code and unnecessary dependencies

## Architecture

```
+------------------+     +----------------------+     +------------------+
|   Source Code    |---->|  Code Intelligence   |---->|  Embedding Index |
| (Git Repository) |     |  (Multi-Language)    |     | (HNSW + GNN)     |
+------------------+     +----------------------+     +------------------+
                                   |
                         +---------+---------+
                         |         |         |
                    +----+---+ +---+----+ +--+-----+
                    |  GNN   | |MinCut  | | SONA   |
                    |Graphs  | |Split   | |Learn   |
                    +--------+ +--------+ +--------+
```

## Supported Languages

| Tier 1 (Full Support) | Tier 2 (Partial) | Tier 3 (Basic) |
|----------------------|------------------|----------------|
| TypeScript, JavaScript | Python, Java | Rust, Go, C++ |
| React, Vue, Angular | Ruby, PHP | Swift, Kotlin |

## Performance Targets

| Metric | Target | Baseline (Traditional) | Improvement |
|--------|--------|------------------------|-------------|
| Semantic code search | <100ms for 1M LOC | ~2s (ripgrep regex) | 20x |
| Architecture analysis | <10s for 100K LOC | ~5min (manual review) | 30x |
| Refactor impact | <5s for single change | ~30min (IDE analysis) | 360x |
| Module splitting | <30s for 50K LOC | ~2hr (architect review) | 240x |
| Pattern learning | <2min for 1000 commits | N/A (not possible) | Novel |

## Security Considerations

### Input Validation (CRITICAL)

All MCP tool inputs MUST be validated using Zod schemas:

```typescript
// code/semantic-search input validation
const SemanticSearchSchema = z.object({
  query: z.string().min(1).max(5000),
  scope: z.object({
    paths: z.array(z.string().max(500)).max(100).optional(),
    languages: z.array(z.string().max(50)).max(20).optional(),
    excludeTests: z.boolean().default(false)
  }).optional(),
  searchType: z.enum(['semantic', 'structural', 'clone', 'api_usage']).default('semantic'),
  topK: z.number().int().min(1).max(1000).default(10)
});

// code/architecture-analyze input validation
const ArchitectureAnalyzeSchema = z.object({
  rootPath: z.string().max(500).default('.'),
  analysis: z.array(z.enum([
    'dependency_graph', 'layer_violations', 'circular_deps',
    'component_coupling', 'module_cohesion', 'dead_code',
    'api_surface', 'architectural_drift'
  ])).optional(),
  baseline: z.string().max(100).optional(),
  outputFormat: z.enum(['json', 'graphviz', 'mermaid']).optional()
});

// code/refactor-impact input validation
const RefactorImpactSchema = z.object({
  changes: z.array(z.object({
    file: z.string().max(500),
    type: z.enum(['rename', 'move', 'delete', 'extract', 'inline']),
    details: z.record(z.string(), z.unknown()).optional()
  })).min(1).max(100),
  depth: z.number().int().min(1).max(10).default(3),
  includeTests: z.boolean().default(true)
});
```

### Path Traversal Prevention (HIGH)

```typescript
// CRITICAL: Validate all file paths to prevent directory traversal
function validateCodePath(userPath: string, allowedRoot: string): string {
  // Normalize and resolve the path
  const normalized = path.normalize(userPath);
  const resolved = path.resolve(allowedRoot, normalized);

  // Ensure resolved path is within allowed root
  if (!resolved.startsWith(path.resolve(allowedRoot))) {
    throw new SecurityError('PATH_TRAVERSAL', 'Path traversal attempt detected');
  }

  // Block access to sensitive files
  const BLOCKED_PATTERNS = [
    /\.env$/i,
    /\.git\/config$/i,
    /credentials/i,
    /secrets?\./i,
    /\.pem$/i,
    /\.key$/i,
    /id_rsa/i
  ];

  if (BLOCKED_PATTERNS.some(pattern => pattern.test(resolved))) {
    throw new SecurityError('SENSITIVE_FILE', 'Access to sensitive file blocked');
  }

  return resolved;
}
```

### WASM Security Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Memory Limit | 1GB max | Handle large codebases |
| CPU Time Limit | 300 seconds for analysis | Allow full repo analysis |
| No Network Access | Enforced by WASM sandbox | Prevent code exfiltration |
| No Shell Execution | No child_process in WASM | Prevent command injection |
| Read-Only Mode | Index building only, no writes | Prevent code modification |

### Code Injection Prevention

```typescript
// NEVER execute analyzed code
// NEVER use eval() on code patterns
// NEVER pass user input to shell

// BAD - vulnerable to injection
const result = eval(userCodeSnippet);
exec(`git log ${userInput}`);

// GOOD - safe analysis
const ast = parser.parse(userCodeSnippet); // Parse only, no execution
const gitLog = await git.log({ maxCount: 100 }); // Use library, not shell
```

### Identified Security Risks

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| CODE-SEC-001 | **HIGH** | Path traversal accessing sensitive files | Path validation, allowlist approach |
| CODE-SEC-002 | **HIGH** | Secrets exposed in code search results | Secret pattern detection and masking |
| CODE-SEC-003 | **MEDIUM** | DoS via pathological code patterns | Timeout limits, parser safeguards |
| CODE-SEC-004 | **MEDIUM** | IP theft via code similarity search | Access controls, audit logging |
| CODE-SEC-005 | **LOW** | Cache poisoning | Cache integrity verification |

### Secret Detection and Masking

```typescript
// Automatically detect and mask secrets in search results
const SECRET_PATTERNS = [
  /(['"])(?:api[_-]?key|apikey|secret|password|token|auth)['"]\s*[:=]\s*['"][^'"]+['"]/gi,
  /(?:sk|pk)[-_](?:live|test)[-_][a-zA-Z0-9]{24,}/g, // Stripe keys
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub PAT
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g
];

function maskSecrets(codeSnippet: string): string {
  let masked = codeSnippet;
  for (const pattern of SECRET_PATTERNS) {
    masked = masked.replace(pattern, '[REDACTED]');
  }
  return masked;
}
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| False positive suggestions | Medium | Low | Confidence thresholds, human approval |
| Language parser gaps | Medium | Medium | Tier-based support, graceful degradation |
| Large repo indexing time | Medium | Low | Incremental indexing, background processing |
| Outdated patterns | Low | Low | Continuous learning from recent commits |

## IDE Integration

- **VS Code Extension**: Real-time analysis and suggestions
- **JetBrains Plugin**: IntelliJ, WebStorm, PyCharm support
- **CLI**: CI/CD pipeline integration
- **MCP**: Direct Claude Code integration

## Implementation Notes

### Phase 1: Core Analysis
- Multi-language AST parsing
- Dependency graph construction
- Basic code embedding

### Phase 2: Graph Intelligence
- GNN-based impact prediction
- MinCut module splitting
- Circular dependency detection

### Phase 3: Learning
- SONA pattern recognition
- Historical pattern extraction
- Personalized suggestions

## Dependencies

```json
{
  "dependencies": {
    "micro-hnsw-wasm": "^0.2.0",
    "ruvector-gnn-wasm": "^0.1.0",
    "ruvector-mincut-wasm": "^0.1.0",
    "ruvector-dag-wasm": "^0.1.0",
    "sona": "^0.1.0",
    "@babel/parser": "^7.23.0",
    "typescript": "^5.3.0"
  }
}
```

## Consequences

### Positive
- Dramatically faster code understanding for large codebases
- Proactive architectural governance
- Data-driven refactoring decisions

### Negative
- Initial indexing requires significant compute
- Language-specific parsers need maintenance
- May produce false positives in dynamic languages

### Neutral
- Can operate incrementally after initial index

## Related ADRs

| ADR | Relationship |
|-----|--------------|
| ADR-004: Plugin Architecture | Foundation - Defines plugin structure |
| ADR-017: RuVector Integration | Dependency - Provides WASM packages |
| ADR-036: Test Intelligence | Related - Code-test mapping |
| ADR-037: Performance Optimizer | Related - Code profiling integration |
| ADR-041: Hyperbolic Reasoning | Related - Code hierarchy embeddings |

## References

- Tree-sitter: https://tree-sitter.github.io/tree-sitter/
- LSP Specification: https://microsoft.github.io/language-server-protocol/
- ADR-017: RuVector Integration
- ADR-004: Plugin Architecture

---

**Last Updated:** 2026-01-24
