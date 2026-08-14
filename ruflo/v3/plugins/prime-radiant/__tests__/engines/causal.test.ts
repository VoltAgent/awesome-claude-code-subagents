/**
 * Causal Engine Tests
 *
 * Tests for the causal inference engine that implements
 * do-calculus for causal reasoning.
 * Performance target: <10ms per query
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// Mock Types
// ============================================================================

interface CausalGraph {
  nodes: string[];
  edges: [string, string][];
}

interface CausalEffectResult {
  effect: number;
  confidence: number;
  method: 'backdoor' | 'frontdoor' | 'instrumental' | 'direct';
  adjustmentSet?: string[];
  valid: boolean;
  reason?: string;
}

interface BackdoorPathResult {
  paths: string[][];
  blocked: boolean;
  adjustmentSets: string[][];
}

interface ConfounderResult {
  confounders: string[];
  identified: boolean;
  recommendations: string[];
}

// ============================================================================
// Mock Implementation
// ============================================================================

class MockCausalEngine {
  /**
   * Compute causal effect using do-calculus.
   * P(Y | do(X)) vs P(Y | X)
   */
  computeCausalEffect(
    graph: CausalGraph,
    treatment: string,
    outcome: string
  ): CausalEffectResult {
    // Validate inputs
    if (!graph.nodes.includes(treatment)) {
      return {
        effect: 0,
        confidence: 0,
        method: 'direct',
        valid: false,
        reason: `Treatment variable '${treatment}' not in graph`,
      };
    }

    if (!graph.nodes.includes(outcome)) {
      return {
        effect: 0,
        confidence: 0,
        method: 'direct',
        valid: false,
        reason: `Outcome variable '${outcome}' not in graph`,
      };
    }

    // Check for direct causal path
    const hasDirectPath = this.hasPath(graph, treatment, outcome);

    if (!hasDirectPath) {
      return {
        effect: 0,
        confidence: 0.9,
        method: 'direct',
        valid: true,
        reason: 'No causal path from treatment to outcome',
      };
    }

    // Find backdoor paths and confounders
    const backdoorPaths = this.findBackdoorPaths(graph, treatment, outcome);
    const confounders = this.findConfounders(graph, treatment, outcome);

    // Determine method and compute effect
    if (confounders.confounders.length === 0) {
      // No confounders - direct effect identifiable
      return {
        effect: this.estimateDirectEffect(graph, treatment, outcome),
        confidence: 0.95,
        method: 'direct',
        valid: true,
      };
    }

    // Find minimal adjustment set
    const adjustmentSets = backdoorPaths.adjustmentSets;

    if (adjustmentSets.length > 0) {
      return {
        effect: this.estimateBackdoorEffect(graph, treatment, outcome, adjustmentSets[0]),
        confidence: 0.85,
        method: 'backdoor',
        adjustmentSet: adjustmentSets[0],
        valid: true,
      };
    }

    // Try frontdoor criterion
    const frontdoorResult = this.tryFrontdoor(graph, treatment, outcome);

    if (frontdoorResult.valid) {
      return frontdoorResult;
    }

    // Effect not identifiable
    return {
      effect: 0,
      confidence: 0,
      method: 'direct',
      valid: false,
      reason: 'Causal effect not identifiable with available methods',
    };
  }

  /**
   * Find all backdoor paths from treatment to outcome.
   */
  findBackdoorPaths(
    graph: CausalGraph,
    treatment: string,
    outcome: string
  ): BackdoorPathResult {
    const paths: string[][] = [];

    // Get parents of treatment
    const treatmentParents = this.getParents(graph, treatment);

    // Find all paths from parents to outcome that don't go through treatment
    for (const parent of treatmentParents) {
      const pathsFromParent = this.findAllPaths(graph, parent, outcome, [treatment]);
      for (const path of pathsFromParent) {
        paths.push([treatment, parent, ...path]);
      }
    }

    // Find adjustment sets that block all backdoor paths
    const adjustmentSets = this.findAdjustmentSets(graph, treatment, outcome, paths);

    return {
      paths,
      blocked: adjustmentSets.length > 0,
      adjustmentSets,
    };
  }

  /**
   * Identify confounders between treatment and outcome.
   */
  findConfounders(
    graph: CausalGraph,
    treatment: string,
    outcome: string
  ): ConfounderResult {
    const confounders: string[] = [];
    const recommendations: string[] = [];

    for (const node of graph.nodes) {
      if (node === treatment || node === outcome) continue;

      const causeTreatment = this.hasPath(graph, node, treatment);
      const causeOutcome = this.hasPath(graph, node, outcome);

      if (causeTreatment && causeOutcome) {
        confounders.push(node);
        recommendations.push(`Adjust for '${node}' to block confounding path`);
      }
    }

    return {
      confounders,
      identified: true,
      recommendations,
    };
  }

  /**
   * Check if intervention on treatment is valid.
   */
  isInterventionValid(
    graph: CausalGraph,
    treatment: string,
    outcome: string
  ): { valid: boolean; reason: string } {
    if (!graph.nodes.includes(treatment)) {
      return { valid: false, reason: 'Treatment not in graph' };
    }

    if (!graph.nodes.includes(outcome)) {
      return { valid: false, reason: 'Outcome not in graph' };
    }

    if (treatment === outcome) {
      return { valid: false, reason: 'Treatment and outcome must be different' };
    }

    // Check for cycles
    if (this.hasPath(graph, outcome, treatment)) {
      return { valid: false, reason: 'Cyclic dependency between treatment and outcome' };
    }

    return { valid: true, reason: 'Intervention is valid' };
  }

  /**
   * Get all descendants of a node.
   */
  getDescendants(graph: CausalGraph, node: string): string[] {
    const descendants: Set<string> = new Set();
    const queue = this.getChildren(graph, node);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (!descendants.has(current)) {
        descendants.add(current);
        queue.push(...this.getChildren(graph, current));
      }
    }

    return Array.from(descendants);
  }

  /**
   * Get all ancestors of a node.
   */
  getAncestors(graph: CausalGraph, node: string): string[] {
    const ancestors: Set<string> = new Set();
    const queue = this.getParents(graph, node);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (!ancestors.has(current)) {
        ancestors.add(current);
        queue.push(...this.getParents(graph, current));
      }
    }

    return Array.from(ancestors);
  }

  private hasPath(
    graph: CausalGraph,
    from: string,
    to: string,
    visited: Set<string> = new Set()
  ): boolean {
    if (from === to) return true;
    if (visited.has(from)) return false;

    visited.add(from);

    const children = this.getChildren(graph, from);
    for (const child of children) {
      if (this.hasPath(graph, child, to, visited)) {
        return true;
      }
    }

    return false;
  }

  private getChildren(graph: CausalGraph, node: string): string[] {
    return graph.edges
      .filter(([from]) => from === node)
      .map(([, to]) => to);
  }

  private getParents(graph: CausalGraph, node: string): string[] {
    return graph.edges
      .filter(([, to]) => to === node)
      .map(([from]) => from);
  }

  private findAllPaths(
    graph: CausalGraph,
    from: string,
    to: string,
    exclude: string[] = [],
    visited: Set<string> = new Set()
  ): string[][] {
    if (from === to) return [[to]];
    if (visited.has(from) || exclude.includes(from)) return [];

    visited.add(from);

    const paths: string[][] = [];
    const children = this.getChildren(graph, from);

    for (const child of children) {
      const childPaths = this.findAllPaths(graph, child, to, exclude, new Set(visited));
      for (const path of childPaths) {
        paths.push([from, ...path]);
      }
    }

    return paths;
  }

  private findAdjustmentSets(
    graph: CausalGraph,
    treatment: string,
    outcome: string,
    backdoorPaths: string[][]
  ): string[][] {
    if (backdoorPaths.length === 0) return [[]];

    // Find nodes that appear in all backdoor paths
    const candidateNodes = new Set<string>();
    for (const path of backdoorPaths) {
      for (const node of path) {
        if (node !== treatment && node !== outcome) {
          candidateNodes.add(node);
        }
      }
    }

    // Simple: return each confounder as potential adjustment
    const adjustmentSets: string[][] = [];

    // Find minimal sets that block all paths
    for (const node of candidateNodes) {
      const blocksAll = backdoorPaths.every((path) => path.includes(node));
      if (blocksAll) {
        adjustmentSets.push([node]);
      }
    }

    // If no single node blocks all, try combinations
    if (adjustmentSets.length === 0 && candidateNodes.size > 0) {
      adjustmentSets.push(Array.from(candidateNodes));
    }

    return adjustmentSets;
  }

  private estimateDirectEffect(
    graph: CausalGraph,
    treatment: string,
    outcome: string
  ): number {
    // Mock effect estimation
    // In real implementation, would use structural equations or data
    return -0.35;
  }

  private estimateBackdoorEffect(
    graph: CausalGraph,
    treatment: string,
    outcome: string,
    adjustmentSet: string[]
  ): number {
    // Mock effect with adjustment
    return -0.28;
  }

  private tryFrontdoor(
    graph: CausalGraph,
    treatment: string,
    outcome: string
  ): CausalEffectResult {
    // Look for mediator that satisfies frontdoor criterion
    const children = this.getChildren(graph, treatment);

    for (const mediator of children) {
      if (this.hasPath(graph, mediator, outcome)) {
        // Check if mediator satisfies frontdoor criterion
        const treatmentParents = this.getParents(graph, treatment);
        const mediatorAffectedByConfounders = treatmentParents.some((p) =>
          this.hasPath(graph, p, mediator)
        );

        if (!mediatorAffectedByConfounders) {
          return {
            effect: -0.32,
            confidence: 0.75,
            method: 'frontdoor',
            adjustmentSet: [mediator],
            valid: true,
          };
        }
      }
    }

    return {
      effect: 0,
      confidence: 0,
      method: 'frontdoor',
      valid: false,
      reason: 'No valid frontdoor mediator found',
    };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('CausalEngine', () => {
  let engine: MockCausalEngine;

  beforeEach(() => {
    engine = new MockCausalEngine();
  });

  describe('computeCausalEffect', () => {
    it('should detect direct causal effect', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y'],
        edges: [['X', 'Y']],
      };

      const result = engine.computeCausalEffect(graph, 'X', 'Y');

      expect(result.valid).toBe(true);
      expect(result.effect).not.toBe(0);
    });

    it('should return 0 effect when no causal path', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y', 'Z'],
        edges: [['X', 'Z']],
      };

      const result = engine.computeCausalEffect(graph, 'X', 'Y');

      expect(result.valid).toBe(true);
      expect(result.effect).toBe(0);
    });

    it('should validate treatment variable', () => {
      const graph: CausalGraph = {
        nodes: ['A', 'B'],
        edges: [['A', 'B']],
      };

      const result = engine.computeCausalEffect(graph, 'X', 'B');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Treatment');
    });

    it('should validate outcome variable', () => {
      const graph: CausalGraph = {
        nodes: ['A', 'B'],
        edges: [['A', 'B']],
      };

      const result = engine.computeCausalEffect(graph, 'A', 'Y');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Outcome');
    });

    it('should handle confounded relationship', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y', 'Z'],
        edges: [
          ['X', 'Y'],
          ['Z', 'X'],
          ['Z', 'Y'],
        ],
      };

      const result = engine.computeCausalEffect(graph, 'X', 'Y');

      expect(result.valid).toBe(true);
      expect(result.method).toBe('backdoor');
      expect(result.adjustmentSet).toContain('Z');
    });

    it('should include confidence score', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y'],
        edges: [['X', 'Y']],
      };

      const result = engine.computeCausalEffect(graph, 'X', 'Y');

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('findBackdoorPaths', () => {
    it('should find no backdoor paths when none exist', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y'],
        edges: [['X', 'Y']],
      };

      const result = engine.findBackdoorPaths(graph, 'X', 'Y');

      expect(result.paths).toHaveLength(0);
    });

    it('should find backdoor paths through confounders', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y', 'Z'],
        edges: [
          ['X', 'Y'],
          ['Z', 'X'],
          ['Z', 'Y'],
        ],
      };

      const result = engine.findBackdoorPaths(graph, 'X', 'Y');

      expect(result.paths.length).toBeGreaterThan(0);
    });

    it('should identify adjustment sets', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y', 'Z'],
        edges: [
          ['X', 'Y'],
          ['Z', 'X'],
          ['Z', 'Y'],
        ],
      };

      const result = engine.findBackdoorPaths(graph, 'X', 'Y');

      expect(result.adjustmentSets.length).toBeGreaterThan(0);
    });
  });

  describe('findConfounders', () => {
    it('should identify confounders', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y', 'Z'],
        edges: [
          ['X', 'Y'],
          ['Z', 'X'],
          ['Z', 'Y'],
        ],
      };

      const result = engine.findConfounders(graph, 'X', 'Y');

      expect(result.confounders).toContain('Z');
    });

    it('should return empty for no confounders', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y'],
        edges: [['X', 'Y']],
      };

      const result = engine.findConfounders(graph, 'X', 'Y');

      expect(result.confounders).toHaveLength(0);
    });

    it('should provide recommendations', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y', 'Z'],
        edges: [
          ['X', 'Y'],
          ['Z', 'X'],
          ['Z', 'Y'],
        ],
      };

      const result = engine.findConfounders(graph, 'X', 'Y');

      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('isInterventionValid', () => {
    it('should validate correct intervention', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y'],
        edges: [['X', 'Y']],
      };

      const result = engine.isInterventionValid(graph, 'X', 'Y');

      expect(result.valid).toBe(true);
    });

    it('should reject same treatment and outcome', () => {
      const graph: CausalGraph = {
        nodes: ['X'],
        edges: [],
      };

      const result = engine.isInterventionValid(graph, 'X', 'X');

      expect(result.valid).toBe(false);
    });

    it('should reject missing treatment', () => {
      const graph: CausalGraph = {
        nodes: ['Y'],
        edges: [],
      };

      const result = engine.isInterventionValid(graph, 'X', 'Y');

      expect(result.valid).toBe(false);
    });
  });

  describe('getDescendants', () => {
    it('should find all descendants', () => {
      const graph: CausalGraph = {
        nodes: ['A', 'B', 'C', 'D'],
        edges: [
          ['A', 'B'],
          ['B', 'C'],
          ['C', 'D'],
        ],
      };

      const descendants = engine.getDescendants(graph, 'A');

      expect(descendants).toContain('B');
      expect(descendants).toContain('C');
      expect(descendants).toContain('D');
    });

    it('should handle no descendants', () => {
      const graph: CausalGraph = {
        nodes: ['A', 'B'],
        edges: [['B', 'A']],
      };

      const descendants = engine.getDescendants(graph, 'A');

      expect(descendants).toHaveLength(0);
    });
  });

  describe('getAncestors', () => {
    it('should find all ancestors', () => {
      const graph: CausalGraph = {
        nodes: ['A', 'B', 'C', 'D'],
        edges: [
          ['A', 'B'],
          ['B', 'C'],
          ['C', 'D'],
        ],
      };

      const ancestors = engine.getAncestors(graph, 'D');

      expect(ancestors).toContain('A');
      expect(ancestors).toContain('B');
      expect(ancestors).toContain('C');
    });

    it('should handle no ancestors', () => {
      const graph: CausalGraph = {
        nodes: ['A', 'B'],
        edges: [['A', 'B']],
      };

      const ancestors = engine.getAncestors(graph, 'A');

      expect(ancestors).toHaveLength(0);
    });
  });

  describe('performance', () => {
    it('should compute causal effect in <10ms', () => {
      const graph: CausalGraph = {
        nodes: ['X', 'Y', 'Z1', 'Z2', 'Z3'],
        edges: [
          ['X', 'Y'],
          ['Z1', 'X'],
          ['Z1', 'Y'],
          ['Z2', 'X'],
          ['Z3', 'Y'],
        ],
      };

      const startTime = performance.now();
      engine.computeCausalEffect(graph, 'X', 'Y');
      const duration = performance.now() - startTime;

      // Target: <10ms per query
      expect(duration).toBeLessThan(10);
    });

    it('should handle larger graphs efficiently', () => {
      const nodes = Array.from({ length: 20 }, (_, i) => `N${i}`);
      const edges: [string, string][] = [];

      // Create chain plus some confounders
      for (let i = 0; i < 19; i++) {
        edges.push([`N${i}`, `N${i + 1}`]);
      }
      edges.push(['N15', 'N0']); // Confounder

      const graph: CausalGraph = { nodes, edges };

      const startTime = performance.now();
      engine.computeCausalEffect(graph, 'N0', 'N19');
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(50);
    });
  });
});

describe('CausalEngine Complex Graphs', () => {
  let engine: MockCausalEngine;

  beforeEach(() => {
    engine = new MockCausalEngine();
  });

  it('should handle diamond structure', () => {
    // Diamond: X -> M1, X -> M2, M1 -> Y, M2 -> Y
    const graph: CausalGraph = {
      nodes: ['X', 'M1', 'M2', 'Y'],
      edges: [
        ['X', 'M1'],
        ['X', 'M2'],
        ['M1', 'Y'],
        ['M2', 'Y'],
      ],
    };

    const result = engine.computeCausalEffect(graph, 'X', 'Y');

    expect(result.valid).toBe(true);
  });

  it('should handle instrumental variable pattern', () => {
    // Z -> X -> Y, with U -> X, U -> Y (Z is instrument)
    const graph: CausalGraph = {
      nodes: ['Z', 'X', 'Y', 'U'],
      edges: [
        ['Z', 'X'],
        ['X', 'Y'],
        ['U', 'X'],
        ['U', 'Y'],
      ],
    };

    const result = engine.computeCausalEffect(graph, 'X', 'Y');

    expect(result.valid).toBe(true);
  });
});
