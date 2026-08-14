# ADR-041: Hyperbolic Reasoning Plugin

**Status:** Proposed
**Date:** 2026-01-24
**Category:** Exotic SOTA
**Author:** Plugin Architecture Team
**Version:** 1.0.0
**Deciders:** Plugin Architecture Team, Geometric ML Research Team
**Supersedes:** None

## Context

Many real-world data structures exhibit hierarchical properties: file systems, organizational charts, taxonomies, dependency trees, and concept hierarchies. Traditional Euclidean embeddings struggle to represent these structures efficiently, requiring exponentially more dimensions. Hyperbolic geometry, with its natural tree-like structure, can represent hierarchies with logarithmic distortion using far fewer dimensions.

## Decision

Create a **Hyperbolic Reasoning Plugin** that leverages RuVector's hyperbolic WASM packages to provide superior hierarchical reasoning, taxonomy navigation, and semantic relationship modeling through Poincare ball and Lorentz model embeddings.

## Plugin Name

`@claude-flow/plugin-hyperbolic-reasoning`

## Description

An exotic reasoning plugin implementing hyperbolic neural networks for superior hierarchical understanding. The plugin enables efficient representation of tree structures, taxonomic reasoning, and hierarchical entailment using Poincare ball embeddings with Mobius operations. Applications include improved ontology navigation, hierarchical code understanding, and organizational relationship modeling.

## Key WASM Packages

| Package | Purpose |
|---------|---------|
| `ruvector-hyperbolic-hnsw-wasm` | Hyperbolic nearest neighbor search |
| `ruvector-attention-wasm` | Hyperbolic attention mechanisms |
| `ruvector-gnn-wasm` | Hyperbolic graph neural networks |
| `micro-hnsw-wasm` | Tangent space approximation search |
| `sona` | Adaptive curvature learning |

## MCP Tools

### 1. `hyperbolic/embed-hierarchy`

Embed hierarchical data in hyperbolic space.

```typescript
{
  name: 'hyperbolic/embed-hierarchy',
  description: 'Embed hierarchical structure in Poincare ball',
  inputSchema: {
    type: 'object',
    properties: {
      hierarchy: {
        type: 'object',
        description: 'Tree structure to embed',
        properties: {
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                parent: { type: 'string' },
                features: { type: 'object' }
              }
            }
          },
          edges: { type: 'array', items: { type: 'object' } }
        }
      },
      model: {
        type: 'string',
        enum: ['poincare_ball', 'lorentz', 'klein', 'half_plane'],
        default: 'poincare_ball'
      },
      parameters: {
        type: 'object',
        properties: {
          dimensions: { type: 'number', default: 32 },
          curvature: { type: 'number', default: -1.0 },
          learnCurvature: { type: 'boolean', default: true }
        }
      }
    },
    required: ['hierarchy']
  }
}
```

### 2. `hyperbolic/taxonomic-reason`

Perform taxonomic reasoning in hyperbolic space.

```typescript
{
  name: 'hyperbolic/taxonomic-reason',
  description: 'Taxonomic reasoning using hyperbolic entailment',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['is_a', 'subsumption', 'lowest_common_ancestor', 'path', 'similarity']
          },
          subject: { type: 'string' },
          object: { type: 'string' }
        }
      },
      taxonomy: { type: 'string', description: 'Taxonomy identifier' },
      inference: {
        type: 'object',
        properties: {
          transitive: { type: 'boolean', default: true },
          fuzzy: { type: 'boolean', default: false },
          confidence: { type: 'number', default: 0.8 }
        }
      }
    },
    required: ['query']
  }
}
```

### 3. `hyperbolic/semantic-search`

Hierarchically-aware semantic search.

```typescript
{
  name: 'hyperbolic/semantic-search',
  description: 'Semantic search with hierarchical awareness',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      index: { type: 'string', description: 'Hyperbolic index identifier' },
      searchMode: {
        type: 'string',
        enum: ['nearest', 'subtree', 'ancestors', 'siblings', 'cone'],
        default: 'nearest'
      },
      constraints: {
        type: 'object',
        properties: {
          maxDepth: { type: 'number' },
          minDepth: { type: 'number' },
          subtreeRoot: { type: 'string' }
        }
      },
      topK: { type: 'number', default: 10 }
    },
    required: ['query', 'index']
  }
}
```

### 4. `hyperbolic/hierarchy-compare`

Compare hierarchical structures using hyperbolic alignment.

```typescript
{
  name: 'hyperbolic/hierarchy-compare',
  description: 'Compare hierarchies using hyperbolic alignment',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'object', description: 'First hierarchy' },
      target: { type: 'object', description: 'Second hierarchy' },
      alignment: {
        type: 'string',
        enum: ['wasserstein', 'gromov_wasserstein', 'tree_edit', 'subtree_isomorphism'],
        default: 'gromov_wasserstein'
      },
      metrics: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['structural_similarity', 'semantic_similarity', 'coverage', 'precision']
        }
      }
    },
    required: ['source', 'target']
  }
}
```

### 5. `hyperbolic/entailment-graph`

Build and query entailment graphs.

```typescript
{
  name: 'hyperbolic/entailment-graph',
  description: 'Build entailment graph using hyperbolic embeddings',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['build', 'query', 'expand', 'prune']
      },
      concepts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            text: { type: 'string' },
            type: { type: 'string' }
          }
        }
      },
      entailmentThreshold: { type: 'number', default: 0.7 },
      transitiveClosure: { type: 'boolean', default: true },
      pruneStrategy: {
        type: 'string',
        enum: ['none', 'transitive_reduction', 'confidence_threshold']
      }
    },
    required: ['action']
  }
}
```

## Use Cases

1. **Ontology Navigation**: Efficiently traverse and query large knowledge graphs
2. **Code Hierarchy Understanding**: Model inheritance, module structure, and dependencies
3. **Organizational Analysis**: Understand reporting structures and influence networks
4. **Taxonomic Classification**: Improved classification with hierarchical awareness
5. **Concept Entailment**: Determine semantic relationships between concepts

## Architecture

```
+------------------+     +----------------------+     +------------------+
| Hierarchical     |---->| Hyperbolic Engine    |---->| Reasoning        |
| Data Input       |     | (Poincare Ball)      |     | Results          |
+------------------+     +----------------------+     +------------------+
                                   |
              +--------------------+--------------------+
              |                    |                    |
       +------+------+     +-------+-------+    +------+------+
       | Poincare    |     | Hyperbolic    |    | Hyperbolic  |
       | Embeddings  |     | Attention     |    | GNN         |
       +-------------+     +---------------+    +-------------+
                                   |
                           +-------+-------+
                           | HNSW Index    |
                           | (Hyperbolic)  |
                           +---------------+
```

## Hyperbolic Geometry Primer

```
Euclidean Space               Hyperbolic Space (Poincare Ball)

    *--*--*--*                         * (root at center)
    |  |  |  |                        /|\
    *--*--*--*           vs          * * * (children near edge)
    |  |  |  |                      /|\ |\
    *--*--*--*                     ****  **

Uniform density              Exponential capacity toward boundary
```

### Key Properties

| Property | Euclidean | Hyperbolic |
|----------|-----------|------------|
| Tree capacity | O(n^d) | O(exp(d)) |
| Hierarchy distortion | High | Low |
| Dimensions needed | Many | Few |
| Parent-child | No natural | Radial distance |
| Sibling | No natural | Angular distance |

## Performance Targets

| Metric | Target | Baseline (Euclidean) | Improvement |
|--------|--------|----------------------|-------------|
| Embedding (10K nodes) | <10s | ~30s (high-dim Euclidean) | 3x |
| Hyperbolic search | <5ms for 1M embeddings | ~50ms (Euclidean HNSW) | 10x |
| Taxonomic query | <10ms per inference | ~100ms (graph traversal) | 10x |
| Hierarchy comparison | <1s for 10K nodes | ~30s (tree edit distance) | 30x |
| Entailment graph build | <30s for 100K concepts | ~10min (pairwise comparison) | 20x |
| Dimension efficiency | 32-dim hyperbolic | 512-dim Euclidean equivalent | 16x memory |

## Security Considerations

### Input Validation (CRITICAL)

All MCP tool inputs MUST be validated using Zod schemas:

```typescript
// hyperbolic/embed-hierarchy input validation
const EmbedHierarchySchema = z.object({
  hierarchy: z.object({
    nodes: z.array(z.object({
      id: z.string().max(200),
      parent: z.string().max(200).nullable(),
      features: z.record(z.string(), z.unknown()).optional()
    })).min(1).max(1_000_000), // Max 1M nodes
    edges: z.array(z.object({
      source: z.string().max(200),
      target: z.string().max(200),
      weight: z.number().finite().optional()
    })).max(10_000_000).optional()
  }),
  model: z.enum(['poincare_ball', 'lorentz', 'klein', 'half_plane']).default('poincare_ball'),
  parameters: z.object({
    dimensions: z.number().int().min(2).max(512).default(32),
    curvature: z.number().min(-10).max(-0.01).default(-1.0),
    learnCurvature: z.boolean().default(true)
  }).optional()
});

// hyperbolic/taxonomic-reason input validation
const TaxonomicReasonSchema = z.object({
  query: z.object({
    type: z.enum(['is_a', 'subsumption', 'lowest_common_ancestor', 'path', 'similarity']),
    subject: z.string().max(500),
    object: z.string().max(500).optional()
  }),
  taxonomy: z.string().max(200),
  inference: z.object({
    transitive: z.boolean().default(true),
    fuzzy: z.boolean().default(false),
    confidence: z.number().min(0).max(1).default(0.8)
  }).optional()
});

// hyperbolic/semantic-search input validation
const SemanticSearchSchema = z.object({
  query: z.string().max(5000),
  index: z.string().max(200),
  searchMode: z.enum(['nearest', 'subtree', 'ancestors', 'siblings', 'cone']).default('nearest'),
  constraints: z.object({
    maxDepth: z.number().int().min(0).max(100).optional(),
    minDepth: z.number().int().min(0).max(100).optional(),
    subtreeRoot: z.string().max(200).optional()
  }).optional(),
  topK: z.number().int().min(1).max(10000).default(10)
});

// hyperbolic/entailment-graph input validation
const EntailmentGraphSchema = z.object({
  action: z.enum(['build', 'query', 'expand', 'prune']),
  concepts: z.array(z.object({
    id: z.string().max(200),
    text: z.string().max(5000),
    type: z.string().max(100).optional()
  })).max(100000).optional(),
  entailmentThreshold: z.number().min(0).max(1).default(0.7),
  transitiveClosure: z.boolean().default(true),
  pruneStrategy: z.enum(['none', 'transitive_reduction', 'confidence_threshold']).optional()
});
```

### WASM Security Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Memory Limit | 2GB max | Handle large hierarchies |
| CPU Time Limit | 300 seconds for embedding | Large graph embedding takes time |
| Node Limit | 1M nodes max | Bound computational complexity |
| Edge Limit | 10M edges max | Prevent memory exhaustion |
| Dimension Limit | 512 max | Reasonable embedding size |

### Numerical Security (CRITICAL for Hyperbolic)

```typescript
// Hyperbolic operations have numerical instabilities near boundary
// MUST implement defensive numerical handling

const POINCARE_BALL_EPS = 1e-10;  // Minimum distance from boundary
const MAX_NORM = 1 - POINCARE_BALL_EPS;  // Maximum vector norm

// Clip vectors to stay within Poincare ball
function clipToBall(vector: number[], curvature: number): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  const maxNorm = MAX_NORM / Math.sqrt(-curvature);

  if (norm > maxNorm) {
    const scale = maxNorm / norm;
    return vector.map(v => v * scale);
  }

  return vector;
}

// Safe Mobius addition (handles edge cases)
function safeMobiusAdd(x: number[], y: number[], c: number): number[] {
  // Check inputs are finite
  if (!x.every(Number.isFinite) || !y.every(Number.isFinite)) {
    throw new NumericalError('Non-finite input to Mobius addition');
  }

  // Clip to ball before operation
  x = clipToBall(x, c);
  y = clipToBall(y, c);

  // Perform operation with numerical guards
  // ... implementation with overflow checking
}
```

### Output Validation

```typescript
// Validate all hyperbolic outputs for numerical sanity
function validateHyperbolicOutput(result: HyperbolicResult): ValidationResult {
  // Check embeddings are within Poincare ball
  for (const embedding of result.embeddings) {
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm >= 1.0) {
      return { valid: false, error: 'Embedding outside Poincare ball' };
    }
    if (!embedding.every(Number.isFinite)) {
      return { valid: false, error: 'Non-finite embedding values' };
    }
  }

  // Check distances are non-negative
  for (const distance of result.distances || []) {
    if (distance < 0 || !Number.isFinite(distance)) {
      return { valid: false, error: 'Invalid distance value' };
    }
  }

  return { valid: true };
}
```

### Identified Security Risks

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| HYPER-SEC-001 | **HIGH** | DoS via deeply nested hierarchies | Depth limits, progressive processing |
| HYPER-SEC-002 | **HIGH** | Numerical overflow near boundary | Boundary clipping, epsilon guards |
| HYPER-SEC-003 | **MEDIUM** | NaN/Infinity propagation | Input/output validation |
| HYPER-SEC-004 | **MEDIUM** | Memory exhaustion via large graphs | Node/edge limits |
| HYPER-SEC-005 | **LOW** | Curvature manipulation attacks | Curvature bounds (-10 to -0.01) |

### Denial of Service Prevention

```typescript
// Hierarchies can be crafted to cause exponential blowup
function validateHierarchy(hierarchy: Hierarchy): ValidationResult {
  // Check for cycles (would cause infinite traversal)
  if (hasCycle(hierarchy)) {
    return { valid: false, error: 'Hierarchy contains cycles' };
  }

  // Check depth (very deep hierarchies cause numerical issues)
  const maxDepth = computeMaxDepth(hierarchy);
  if (maxDepth > 100) {
    return { valid: false, error: `Hierarchy too deep: ${maxDepth} > 100` };
  }

  // Check branching factor (wide trees cause memory issues)
  const maxBranching = computeMaxBranching(hierarchy);
  if (maxBranching > 10000) {
    return { valid: false, error: `Branching factor too high: ${maxBranching}` };
  }

  return { valid: true };
}
```

### Rate Limiting

```typescript
const HyperbolicRateLimits = {
  'hyperbolic/embed-hierarchy': { requestsPerMinute: 5, maxConcurrent: 1 },
  'hyperbolic/taxonomic-reason': { requestsPerMinute: 60, maxConcurrent: 5 },
  'hyperbolic/semantic-search': { requestsPerMinute: 60, maxConcurrent: 5 },
  'hyperbolic/hierarchy-compare': { requestsPerMinute: 10, maxConcurrent: 2 },
  'hyperbolic/entailment-graph': { requestsPerMinute: 10, maxConcurrent: 2 }
};
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Numerical instability | Medium | Medium | Boundary clipping, numerical stabilization |
| Non-hierarchical data | Medium | Low | Automatic fallback to Euclidean |
| Curvature tuning | Medium | Low | Adaptive curvature via SONA |
| Training complexity | High | Medium | Pretrained embeddings, transfer learning |

## Mobius Operations

The plugin implements core Mobius operations for the Poincare ball:

```typescript
// Mobius addition: x + y in hyperbolic space
mobius_add(x: Vector, y: Vector, c: number): Vector

// Mobius scalar multiplication
mobius_scalar(r: number, x: Vector, c: number): Vector

// Exponential map: tangent space -> hyperbolic
exp_map(v: Vector, c: number): Vector

// Logarithmic map: hyperbolic -> tangent space
log_map(x: Vector, c: number): Vector

// Hyperbolic distance
hyperbolic_distance(x: Vector, y: Vector, c: number): number
```

## Implementation Notes

### Phase 1: Core Embeddings
- Poincare ball model implementation
- Hyperbolic distance metrics
- Basic HNSW adaptation

### Phase 2: Neural Operations
- Hyperbolic attention mechanisms
- Hyperbolic GNN layers
- Adaptive curvature learning

### Phase 3: Applications
- Taxonomic reasoning engine
- Hierarchy comparison tools
- Entailment graph construction

## Dependencies

```json
{
  "dependencies": {
    "ruvector-hyperbolic-hnsw-wasm": "^0.1.0",
    "ruvector-attention-wasm": "^0.1.0",
    "ruvector-gnn-wasm": "^0.1.0",
    "micro-hnsw-wasm": "^0.2.0",
    "sona": "^0.1.0"
  }
}
```

## Curvature Learning

The plugin supports learning optimal curvature per hierarchy:

```
Flat hierarchy (organization chart)  --> Low curvature (-0.1)
Deep hierarchy (taxonomy)            --> High curvature (-2.0)
Mixed hierarchy                      --> Adaptive curvature via SONA
```

## Consequences

### Positive
- Orders of magnitude better hierarchy representation
- Natural modeling of taxonomic relationships
- Significant dimension reduction for tree-like data

### Negative
- Numerical instability near boundary (mitigated by clipping)
- Not all data is hierarchical
- Learning requires specialized optimization

### Neutral
- Can fallback to Euclidean for non-hierarchical data

## Related ADRs

| ADR | Relationship |
|-----|--------------|
| ADR-004: Plugin Architecture | Foundation - Defines plugin structure |
| ADR-017: RuVector Integration | Dependency - Provides WASM packages |
| ADR-023: ONNX Hyperbolic Embeddings | Dependency - Embedding initialization |
| ADR-032: Healthcare Clinical | Related - Medical ontology hierarchies |
| ADR-034: Legal Contracts | Related - Legal taxonomy navigation |
| ADR-035: Code Intelligence | Related - Code hierarchy analysis |

## References

- Poincare Embeddings: https://arxiv.org/abs/1705.08039
- Hyperbolic Neural Networks: https://arxiv.org/abs/1805.09112
- Hyperbolic Attention: https://arxiv.org/abs/1905.09786
- ADR-017: RuVector Integration
- ADR-023: ONNX Hyperbolic Embeddings Init
- ADR-004: Plugin Architecture

---

**Last Updated:** 2026-01-24
