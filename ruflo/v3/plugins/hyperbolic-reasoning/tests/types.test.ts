/**
 * Hyperbolic Reasoning Plugin - Types Tests
 *
 * Tests for Zod schemas, hyperbolic math utilities, and type validation
 */

import { describe, it, expect } from 'vitest';
import {
  HierarchyNodeSchema,
  HierarchyEdgeSchema,
  HierarchySchema,
  EmbedHierarchyInputSchema,
  TaxonomicReasonInputSchema,
  SemanticSearchInputSchema,
  HierarchyCompareInputSchema,
  EntailmentGraphInputSchema,
  successResult,
  errorResult,
  clipToBall,
  poincareDistance,
  mobiusAdd,
  expMap,
  logMap,
  POINCARE_BALL_EPS,
  MAX_NORM,
  RESOURCE_LIMITS,
} from '../src/types.js';

describe('HierarchyNodeSchema', () => {
  it('should validate valid node', () => {
    const validNode = {
      id: 'node-1',
      parent: 'root',
      features: { type: 'category', weight: 0.5 },
      label: 'Category 1',
      depth: 1,
    };

    const result = HierarchyNodeSchema.safeParse(validNode);
    expect(result.success).toBe(true);
  });

  it('should accept root node with null parent', () => {
    const result = HierarchyNodeSchema.safeParse({
      id: 'root',
      parent: null,
    });
    expect(result.success).toBe(true);
  });

  it('should reject id exceeding max length', () => {
    const result = HierarchyNodeSchema.safeParse({
      id: 'a'.repeat(201),
      parent: null,
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative depth', () => {
    const result = HierarchyNodeSchema.safeParse({
      id: 'node',
      parent: null,
      depth: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('HierarchyEdgeSchema', () => {
  it('should validate valid edge', () => {
    const validEdge = {
      source: 'parent-node',
      target: 'child-node',
      weight: 1.0,
      type: 'is_a',
    };

    const result = HierarchyEdgeSchema.safeParse(validEdge);
    expect(result.success).toBe(true);
  });

  it('should accept edge without optional fields', () => {
    const result = HierarchyEdgeSchema.safeParse({
      source: 'a',
      target: 'b',
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-finite weight', () => {
    const result = HierarchyEdgeSchema.safeParse({
      source: 'a',
      target: 'b',
      weight: Infinity,
    });
    expect(result.success).toBe(false);
  });
});

describe('HierarchySchema', () => {
  it('should validate valid hierarchy', () => {
    const validHierarchy = {
      nodes: [
        { id: 'root', parent: null },
        { id: 'child1', parent: 'root' },
        { id: 'child2', parent: 'root' },
      ],
      edges: [
        { source: 'root', target: 'child1' },
        { source: 'root', target: 'child2' },
      ],
      root: 'root',
    };

    const result = HierarchySchema.safeParse(validHierarchy);
    expect(result.success).toBe(true);
  });

  it('should require at least one node', () => {
    const result = HierarchySchema.safeParse({
      nodes: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('EmbedHierarchyInputSchema', () => {
  it('should validate valid embed input', () => {
    const validInput = {
      hierarchy: {
        nodes: [{ id: 'root', parent: null }],
      },
      model: 'poincare_ball',
      parameters: {
        dimensions: 32,
        curvature: -1.0,
        learnCurvature: true,
        epochs: 100,
        learningRate: 0.01,
      },
    };

    const result = EmbedHierarchyInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept all model types', () => {
    const models = ['poincare_ball', 'lorentz', 'klein', 'half_plane'] as const;

    for (const model of models) {
      const input = {
        hierarchy: { nodes: [{ id: 'root', parent: null }] },
        model,
      };
      const result = EmbedHierarchyInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should use default model', () => {
    const input = {
      hierarchy: { nodes: [{ id: 'root', parent: null }] },
    };

    const result = EmbedHierarchyInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe('poincare_ball');
    }
  });

  it('should reject dimensions exceeding max', () => {
    const result = EmbedHierarchyInputSchema.safeParse({
      hierarchy: { nodes: [{ id: 'root', parent: null }] },
      parameters: { dimensions: 600 },
    });
    expect(result.success).toBe(false);
  });

  it('should reject positive curvature', () => {
    const result = EmbedHierarchyInputSchema.safeParse({
      hierarchy: { nodes: [{ id: 'root', parent: null }] },
      parameters: { curvature: 1.0 },
    });
    expect(result.success).toBe(false);
  });
});

describe('TaxonomicReasonInputSchema', () => {
  it('should validate valid taxonomic reason input', () => {
    const validInput = {
      query: {
        type: 'is_a',
        subject: 'dog',
        object: 'animal',
      },
      taxonomy: 'wordnet',
      inference: {
        transitive: true,
        fuzzy: false,
        confidence: 0.8,
      },
    };

    const result = TaxonomicReasonInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept all query types', () => {
    const types = ['is_a', 'subsumption', 'lowest_common_ancestor', 'path', 'similarity'] as const;

    for (const type of types) {
      const input = {
        query: { type, subject: 'test' },
        taxonomy: 'test-taxonomy',
      };
      const result = TaxonomicReasonInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should use default inference settings', () => {
    const input = {
      query: { type: 'is_a', subject: 'dog', object: 'animal' },
      taxonomy: 'test',
    };

    const result = TaxonomicReasonInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('SemanticSearchInputSchema', () => {
  it('should validate valid semantic search input', () => {
    const validInput = {
      query: 'find similar concepts to machine learning',
      index: 'knowledge-graph',
      searchMode: 'nearest',
      constraints: {
        maxDepth: 5,
        minDepth: 1,
        subtreeRoot: 'science',
      },
      topK: 10,
    };

    const result = SemanticSearchInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept all search modes', () => {
    const modes = ['nearest', 'subtree', 'ancestors', 'siblings', 'cone'] as const;

    for (const searchMode of modes) {
      const input = {
        query: 'test',
        index: 'test-index',
        searchMode,
      };
      const result = SemanticSearchInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should use default topK', () => {
    const input = {
      query: 'test',
      index: 'test-index',
    };

    const result = SemanticSearchInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topK).toBe(10);
    }
  });

  it('should reject topK below 1', () => {
    const result = SemanticSearchInputSchema.safeParse({
      query: 'test',
      index: 'test-index',
      topK: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('HierarchyCompareInputSchema', () => {
  it('should validate valid compare input', () => {
    const validInput = {
      source: {
        nodes: [{ id: 'root', parent: null }],
      },
      target: {
        nodes: [{ id: 'root', parent: null }],
      },
      alignment: 'gromov_wasserstein',
      metrics: ['structural_similarity', 'coverage'],
    };

    const result = HierarchyCompareInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept all alignment methods', () => {
    const methods = ['wasserstein', 'gromov_wasserstein', 'tree_edit', 'subtree_isomorphism'] as const;

    for (const alignment of methods) {
      const input = {
        source: { nodes: [{ id: 'a', parent: null }] },
        target: { nodes: [{ id: 'b', parent: null }] },
        alignment,
      };
      const result = HierarchyCompareInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should accept all metric types', () => {
    const metrics = ['structural_similarity', 'semantic_similarity', 'coverage', 'precision'] as const;

    const input = {
      source: { nodes: [{ id: 'a', parent: null }] },
      target: { nodes: [{ id: 'b', parent: null }] },
      metrics: [...metrics],
    };
    const result = HierarchyCompareInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('EntailmentGraphInputSchema', () => {
  it('should validate valid entailment input', () => {
    const validInput = {
      action: 'build',
      concepts: [
        { id: 'c1', text: 'All dogs are animals' },
        { id: 'c2', text: 'All poodles are dogs' },
      ],
      entailmentThreshold: 0.7,
      transitiveClosure: true,
    };

    const result = EntailmentGraphInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept all actions', () => {
    const actions = ['build', 'query', 'expand', 'prune'] as const;

    for (const action of actions) {
      const input = { action };
      const result = EntailmentGraphInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should accept all prune strategies', () => {
    const strategies = ['none', 'transitive_reduction', 'confidence_threshold'] as const;

    for (const pruneStrategy of strategies) {
      const input = {
        action: 'prune',
        pruneStrategy,
      };
      const result = EntailmentGraphInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should reject entailment threshold outside [0, 1]', () => {
    const result = EntailmentGraphInputSchema.safeParse({
      action: 'build',
      entailmentThreshold: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('Hyperbolic Math Utilities', () => {
  describe('clipToBall', () => {
    it('should not modify vectors within ball', () => {
      const vec = new Float32Array([0.1, 0.2, 0.3]);
      const clipped = clipToBall(vec, -1);
      expect(clipped).toEqual(vec);
    });

    it('should clip vectors outside ball', () => {
      const vec = new Float32Array([0.9, 0.9, 0.9]);
      const clipped = clipToBall(vec, -1);
      const norm = Math.sqrt(clipped.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeLessThan(MAX_NORM);
    });
  });

  describe('poincareDistance', () => {
    it('should return 0 for identical points', () => {
      const vec = new Float32Array([0.1, 0.2, 0.3]);
      const dist = poincareDistance(vec, vec, -1);
      expect(dist).toBeCloseTo(0, 5);
    });

    it('should be symmetric', () => {
      const a = new Float32Array([0.1, 0.2]);
      const b = new Float32Array([0.3, 0.4]);
      const distAB = poincareDistance(a, b, -1);
      const distBA = poincareDistance(b, a, -1);
      expect(distAB).toBeCloseTo(distBA, 5);
    });

    it('should increase with curvature', () => {
      const a = new Float32Array([0.1, 0.2]);
      const b = new Float32Array([0.3, 0.4]);
      const distLowC = poincareDistance(a, b, -0.5);
      const distHighC = poincareDistance(a, b, -2);
      // Higher curvature = more curved space = different distance
      expect(distLowC).not.toEqual(distHighC);
    });
  });

  describe('mobiusAdd', () => {
    it('should return y when x is zero', () => {
      const x = new Float32Array([0, 0]);
      const y = new Float32Array([0.1, 0.2]);
      const result = mobiusAdd(x, y, -1);
      expect(result[0]).toBeCloseTo(y[0], 5);
      expect(result[1]).toBeCloseTo(y[1], 5);
    });

    it('should return x when y is zero', () => {
      const x = new Float32Array([0.1, 0.2]);
      const y = new Float32Array([0, 0]);
      const result = mobiusAdd(x, y, -1);
      expect(result[0]).toBeCloseTo(x[0], 5);
      expect(result[1]).toBeCloseTo(x[1], 5);
    });

    it('should keep result within ball', () => {
      const x = new Float32Array([0.5, 0.5]);
      const y = new Float32Array([0.4, 0.4]);
      const result = mobiusAdd(x, y, -1);
      const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeLessThan(1);
    });
  });

  describe('expMap', () => {
    it('should return origin for zero vector', () => {
      const v = new Float32Array([0, 0, 0]);
      const result = expMap(v, -1);
      expect(result.every(x => Math.abs(x) < 1e-10)).toBe(true);
    });

    it('should map to inside the ball', () => {
      const v = new Float32Array([1, 2, 3]);
      const result = expMap(v, -1);
      const norm = Math.sqrt(result.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeLessThan(1);
    });
  });

  describe('logMap', () => {
    it('should return zero for origin', () => {
      const x = new Float32Array([0, 0, 0]);
      const result = logMap(x, -1);
      expect(result.every(v => Math.abs(v) < 1e-10)).toBe(true);
    });

    it('should be inverse of expMap near origin', () => {
      const v = new Float32Array([0.1, 0.2, 0.3]);
      const expV = expMap(v, -1);
      const logExpV = logMap(expV, -1);
      for (let i = 0; i < v.length; i++) {
        expect(logExpV[i]).toBeCloseTo(v[i], 3);
      }
    });
  });
});

describe('successResult', () => {
  it('should create success result with JSON data', () => {
    const data = { embeddings: 10, distortion: 0.05 };
    const result = successResult(data);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBeUndefined();
  });
});

describe('errorResult', () => {
  it('should create error result', () => {
    const result = errorResult('Embedding failed: curvature too high');

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.message).toBe('Embedding failed: curvature too high');
  });
});

describe('Constants', () => {
  it('should have valid POINCARE_BALL_EPS', () => {
    expect(POINCARE_BALL_EPS).toBeGreaterThan(0);
    expect(POINCARE_BALL_EPS).toBeLessThan(1e-5);
  });

  it('should have valid MAX_NORM', () => {
    expect(MAX_NORM).toBeLessThan(1);
    expect(MAX_NORM).toBeGreaterThan(0.99);
  });

  it('should have valid RESOURCE_LIMITS', () => {
    expect(RESOURCE_LIMITS.MAX_NODES).toBeGreaterThan(0);
    expect(RESOURCE_LIMITS.MAX_EDGES).toBeGreaterThan(RESOURCE_LIMITS.MAX_NODES);
    expect(RESOURCE_LIMITS.MAX_DIMENSIONS).toBeGreaterThan(0);
    expect(RESOURCE_LIMITS.MAX_DEPTH).toBeGreaterThan(0);
  });
});
