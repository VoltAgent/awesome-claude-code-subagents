/**
 * Quantum Optimizer Plugin - MCP Tools Tests
 *
 * Tests for MCP tool handlers with mock data
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  quantumOptimizerTools,
  getTool,
  getToolNames,
} from '../src/mcp-tools.js';

describe('quantumOptimizerTools', () => {
  it('should export 5 MCP tools', () => {
    expect(quantumOptimizerTools).toHaveLength(5);
  });

  it('should have unique tool names', () => {
    const names = quantumOptimizerTools.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('should have required tool properties', () => {
    for (const tool of quantumOptimizerTools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    }
  });
});

describe('getTool', () => {
  it('should return tool by name', () => {
    const tool = getTool('quantum_annealing_solve');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('quantum_annealing_solve');
  });

  it('should return undefined for unknown tool', () => {
    const tool = getTool('unknown_tool');
    expect(tool).toBeUndefined();
  });
});

describe('getToolNames', () => {
  it('should return array of tool names', () => {
    const names = getToolNames();
    expect(names).toContain('quantum_annealing_solve');
    expect(names).toContain('quantum_qaoa_optimize');
    expect(names).toContain('quantum_grover_search');
    expect(names).toContain('quantum_dependency_resolve');
    expect(names).toContain('quantum_schedule_optimize');
  });
});

describe('quantum_annealing_solve handler', () => {
  const tool = getTool('quantum_annealing_solve')!;

  it('should handle valid QUBO input', async () => {
    const input = {
      problem: {
        type: 'qubo',
        variables: 5,
        linear: [1, -1, 2, -2, 1],
      },
      parameters: {
        numReads: 100,
        annealingTime: 20,
        chainStrength: 1.0,
      },
      embedding: 'auto',
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('solution');
    expect(parsed).toHaveProperty('details');
  });

  it('should handle all problem types', async () => {
    const types = ['qubo', 'ising', 'sat', 'max_cut', 'tsp', 'dependency'];

    for (const type of types) {
      const input = {
        problem: { type, variables: 3 },
      };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();
    }
  });

  it('should return error for invalid problem type', async () => {
    const input = {
      problem: {
        type: 'invalid_type',
        variables: 5,
      },
    };

    const result = await tool.handler(input);

    expect(result.isError).toBe(true);
  });

  it('should handle temperature schedules', async () => {
    const input = {
      problem: {
        type: 'qubo',
        variables: 5,
      },
      parameters: {
        temperature: {
          initial: 100,
          final: 0.01,
          type: 'exponential',
        },
      },
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
  });
});

describe('quantum_qaoa_optimize handler', () => {
  const tool = getTool('quantum_qaoa_optimize')!;

  it('should handle valid QAOA input', async () => {
    const input = {
      problem: {
        type: 'max_cut',
        graph: {
          nodes: 4,
          edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
          weights: [1.0, 1.0, 1.0, 1.0],
        },
      },
      circuit: {
        depth: 2,
        optimizer: 'cobyla',
        initialParams: 'heuristic',
      },
      shots: 1024,
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('solution');
    expect(parsed).toHaveProperty('details');
  });

  it('should handle all problem types', async () => {
    const types = ['max_cut', 'portfolio', 'scheduling', 'routing'];

    for (const type of types) {
      const input = {
        problem: {
          type,
          graph: {
            nodes: 3,
            edges: [[0, 1], [1, 2]],
          },
        },
      };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();
    }
  });

  it('should handle all optimizers', async () => {
    const optimizers = ['cobyla', 'bfgs', 'adam', 'nelder-mead'];

    for (const optimizer of optimizers) {
      const input = {
        problem: {
          type: 'max_cut',
          graph: { nodes: 3, edges: [[0, 1]] },
        },
        circuit: { optimizer },
      };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();
    }
  });

  it('should return approximation ratio', async () => {
    const input = {
      problem: {
        type: 'max_cut',
        graph: {
          nodes: 4,
          edges: [[0, 1], [1, 2], [2, 3]],
        },
      },
      circuit: { depth: 3 },
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.details).toHaveProperty('approximationRatio');
    expect(parsed.details.approximationRatio).toBeGreaterThan(0);
    expect(parsed.details.approximationRatio).toBeLessThanOrEqual(1);
  });
});

describe('quantum_grover_search handler', () => {
  const tool = getTool('quantum_grover_search')!;

  it('should handle valid search input', async () => {
    const input = {
      searchSpace: {
        size: 1000,
        oracle: 'x == target',
        structure: 'unstructured',
      },
      targets: 1,
      iterations: 'optimal',
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('solutions');
    expect(parsed).toHaveProperty('details');
  });

  it('should handle all structure types', async () => {
    const structures = ['unstructured', 'database', 'tree', 'graph'];

    for (const structure of structures) {
      const input = {
        searchSpace: {
          size: 100,
          oracle: 'x == 42',
          structure,
        },
      };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();
    }
  });

  it('should handle all amplification methods', async () => {
    const methods = ['standard', 'fixed_point', 'robust'];

    for (const method of methods) {
      const input = {
        searchSpace: {
          size: 100,
          oracle: 'x == 1',
          structure: 'unstructured',
        },
        amplification: { method },
      };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();
    }
  });

  it('should return query count', async () => {
    const input = {
      searchSpace: {
        size: 10000,
        oracle: 'x == target',
        structure: 'unstructured',
      },
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.details).toHaveProperty('queries');
    expect(parsed.details.queries).toBeGreaterThan(0);
    // Grover provides quadratic speedup
    expect(parsed.details.queries).toBeLessThan(10000);
  });
});

describe('quantum_dependency_resolve handler', () => {
  const tool = getTool('quantum_dependency_resolve')!;

  it('should handle valid dependency input', async () => {
    const input = {
      packages: [
        { name: 'lodash', version: '4.17.21', dependencies: {} },
        { name: 'express', version: '4.18.2', dependencies: { 'accepts': '^1.3.8' } },
        { name: 'accepts', version: '1.3.8', dependencies: {} },
      ],
      constraints: {
        minimize: 'versions',
        includePeer: true,
        timeout: 30000,
      },
      solver: 'hybrid',
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('resolved');
    expect(parsed).toHaveProperty('details');
  });

  it('should handle all minimize objectives', async () => {
    const objectives = ['versions', 'size', 'vulnerabilities', 'depth'];

    for (const minimize of objectives) {
      const input = {
        packages: [{ name: 'pkg', version: '1.0.0' }],
        constraints: { minimize },
      };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();
    }
  });

  it('should handle all solver types', async () => {
    const solvers = ['quantum_annealing', 'qaoa', 'hybrid'];

    for (const solver of solvers) {
      const input = {
        packages: [{ name: 'pkg', version: '1.0.0' }],
        solver,
      };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();
    }
  });

  it('should return resolution order', async () => {
    const input = {
      packages: [
        { name: 'a', version: '1.0.0', dependencies: { 'b': '^1.0.0' } },
        { name: 'b', version: '1.0.0', dependencies: { 'c': '^1.0.0' } },
        { name: 'c', version: '1.0.0', dependencies: {} },
      ],
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.details).toHaveProperty('installationOrder');
    expect(Array.isArray(parsed.details.installationOrder)).toBe(true);
  });

  it('should return error for empty packages', async () => {
    const input = {
      packages: [],
    };

    const result = await tool.handler(input);

    expect(result.isError).toBe(true);
  });
});

describe('quantum_schedule_optimize handler', () => {
  const tool = getTool('quantum_schedule_optimize')!;

  it('should handle valid schedule input', async () => {
    const input = {
      tasks: [
        { id: 'task-1', duration: 10, dependencies: [], resources: ['cpu'] },
        { id: 'task-2', duration: 20, dependencies: ['task-1'], resources: ['cpu'] },
        { id: 'task-3', duration: 15, dependencies: ['task-1'], resources: ['memory'] },
      ],
      resources: [
        { id: 'cpu', capacity: 4, cost: 1 },
        { id: 'memory', capacity: 8, cost: 0.5 },
      ],
      objective: 'makespan',
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('schedule');
    expect(parsed).toHaveProperty('details');
  });

  it('should handle all objectives', async () => {
    const objectives = ['makespan', 'cost', 'utilization', 'weighted'];

    for (const objective of objectives) {
      const input = {
        tasks: [{ id: 't1', duration: 10 }],
        resources: [{ id: 'r1', capacity: 1, cost: 1 }],
        objective,
      };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();
    }
  });

  it('should compute schedule metrics', async () => {
    const input = {
      tasks: [
        { id: 't1', duration: 10, dependencies: [] },
        { id: 't2', duration: 20, dependencies: ['t1'] },
      ],
      resources: [{ id: 'r1', capacity: 2, cost: 1 }],
      objective: 'makespan',
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.details).toHaveProperty('makespan');
    expect(parsed.details).toHaveProperty('cost');
    expect(parsed.details).toHaveProperty('utilization');
  });

  it('should identify critical path', async () => {
    const input = {
      tasks: [
        { id: 't1', duration: 10, dependencies: [] },
        { id: 't2', duration: 30, dependencies: ['t1'] },  // Critical
        { id: 't3', duration: 5, dependencies: ['t1'] },   // Not critical
      ],
      resources: [{ id: 'r1', capacity: 2, cost: 1 }],
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.details).toHaveProperty('criticalPath');
    expect(Array.isArray(parsed.details.criticalPath)).toBe(true);
  });

  it('should return error for empty tasks', async () => {
    const input = {
      tasks: [],
      resources: [{ id: 'r1', capacity: 1, cost: 1 }],
    };

    const result = await tool.handler(input);

    expect(result.isError).toBe(true);
  });

  it('should return error for empty resources', async () => {
    const input = {
      tasks: [{ id: 't1', duration: 10 }],
      resources: [],
    };

    const result = await tool.handler(input);

    expect(result.isError).toBe(true);
  });
});

describe('Tool metadata', () => {
  it('should have correct categories', () => {
    for (const tool of quantumOptimizerTools) {
      expect(tool.category).toBe('quantum');
    }
  });

  it('should have version numbers', () => {
    for (const tool of quantumOptimizerTools) {
      expect(tool.version).toBeDefined();
      expect(tool.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('should have tags', () => {
    for (const tool of quantumOptimizerTools) {
      expect(Array.isArray(tool.tags)).toBe(true);
      expect(tool.tags!.length).toBeGreaterThan(0);
    }
  });
});
