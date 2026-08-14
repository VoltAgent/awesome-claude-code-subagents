/**
 * Quantum Optimizer MCP Tools
 *
 * MCP tool definitions for quantum-inspired optimization including:
 * - quantum/annealing-solve: Simulated quantum annealing
 * - quantum/qaoa-optimize: QAOA circuit optimization
 * - quantum/grover-search: Grover-inspired search
 * - quantum/dependency-resolve: Package dependency resolution
 * - quantum/schedule-optimize: Task scheduling optimization
 */

import type {
  MCPTool,
  MCPToolResult,
  ToolContext,
  AnnealingSolveInput,
  QAOAOptimizeInput,
  GroverSearchInput,
  DependencyResolveInput,
  ScheduleOptimizeInput,
  QUBOProblem,
  ProblemGraph,
  SearchSpace,
} from './types.js';

import {
  AnnealingSolveInputSchema,
  QAOAOptimizeInputSchema,
  GroverSearchInputSchema,
  DependencyResolveInputSchema,
  ScheduleOptimizeInputSchema,
  successResult,
  errorResult,
  RESOURCE_LIMITS,
} from './types.js';

import { ExoticBridge } from './bridges/exotic-bridge.js';
import { DagBridge } from './bridges/dag-bridge.js';

// Default logger
const defaultLogger = {
  debug: (msg: string, meta?: Record<string, unknown>) => console.debug(`[quantum-optimizer] ${msg}`, meta),
  info: (msg: string, meta?: Record<string, unknown>) => console.info(`[quantum-optimizer] ${msg}`, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[quantum-optimizer] ${msg}`, meta),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(`[quantum-optimizer] ${msg}`, meta),
};

// Shared bridge instances
let exoticBridge: ExoticBridge | null = null;
let dagBridge: DagBridge | null = null;

async function getExoticBridge(): Promise<ExoticBridge> {
  if (!exoticBridge) {
    exoticBridge = new ExoticBridge();
    await exoticBridge.initialize();
  }
  return exoticBridge;
}

async function getDagBridge(): Promise<DagBridge> {
  if (!dagBridge) {
    dagBridge = new DagBridge();
    await dagBridge.initialize();
  }
  return dagBridge;
}

// ============================================================================
// Tool 1: quantum/annealing-solve
// ============================================================================

async function annealingSolveHandler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    const validationResult = AnnealingSolveInputSchema.safeParse(input);
    if (!validationResult.success) {
      return errorResult(`Invalid input: ${validationResult.error.message}`);
    }

    const data = validationResult.data;
    logger.debug('Annealing solve', { variables: data.problem.variables, type: data.problem.type });

    // Validate resource limits
    if (data.problem.variables > RESOURCE_LIMITS.MAX_VARIABLES) {
      return errorResult(`Too many variables: ${data.problem.variables} > ${RESOURCE_LIMITS.MAX_VARIABLES}`);
    }

    // Build QUBO problem
    const linear = new Float32Array(data.problem.variables);
    const quadratic = new Float32Array((data.problem.variables * (data.problem.variables - 1)) / 2);

    // Parse objective into linear/quadratic terms
    if (data.problem.objective) {
      for (const [key, value] of Object.entries(data.problem.objective)) {
        if (key.includes(',')) {
          // Quadratic term
          const [i, j] = key.split(',').map(Number);
          if (i !== undefined && j !== undefined && i < j) {
            const idx = i * data.problem.variables - (i * (i + 1)) / 2 + j - i - 1;
            quadratic[idx] = value;
          }
        } else {
          // Linear term
          const i = parseInt(key, 10);
          if (!isNaN(i) && i < data.problem.variables) {
            linear[i] = value;
          }
        }
      }
    } else if (data.problem.linear) {
      for (let i = 0; i < Math.min(data.problem.linear.length, data.problem.variables); i++) {
        linear[i] = data.problem.linear[i]!;
      }
    }

    const quboProblem: QUBOProblem = {
      type: data.problem.type,
      variables: data.problem.variables,
      linear,
      quadratic,
    };

    const bridge = await getExoticBridge();
    const result = await bridge.solveQubo(quboProblem, {
      numReads: data.parameters?.numReads ?? 1000,
      annealingTime: data.parameters?.annealingTime ?? 20,
      chainStrength: data.parameters?.chainStrength ?? 1.0,
      temperature: data.parameters?.temperature ?? {
        initial: 100,
        final: 0.01,
        type: 'exponential',
      },
      embedding: data.embedding,
    });

    const duration = performance.now() - startTime;
    logger.info('Annealing completed', {
      energy: result.solution.energy,
      samples: result.samples.length,
      durationMs: duration.toFixed(2),
    });

    return successResult({
      solution: {
        assignment: Array.from(result.solution.assignment),
        energy: result.solution.energy,
        optimal: result.solution.optimal,
        iterations: result.solution.iterations,
        confidence: result.solution.confidence,
      },
      samples: result.samples.slice(0, 10).map(s => ({
        assignment: Array.from(s.assignment),
        energy: s.energy,
      })),
      timing: result.timing,
      energyHistogram: Object.fromEntries(result.energyHistogram),
    });
  } catch (error) {
    logger.error('Annealing failed', { error: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export const annealingSolveTool: MCPTool = {
  name: 'quantum_annealing_solve',
  description: 'Solve combinatorial optimization using quantum annealing simulation. Supports QUBO, Ising, SAT, Max-Cut, TSP, and dependency problems.',
  category: 'quantum',
  version: '0.1.0',
  tags: ['quantum', 'annealing', 'optimization', 'qubo', 'combinatorial'],
  cacheable: false,
  inputSchema: {
    type: 'object',
    properties: {
      problem: {
        type: 'object',
        description: 'Optimization problem definition',
        properties: {
          type: { type: 'string', enum: ['qubo', 'ising', 'sat', 'max_cut', 'tsp', 'dependency'] },
          variables: { type: 'number', description: 'Number of binary variables' },
          constraints: { type: 'array', description: 'Problem constraints' },
          objective: { type: 'object', description: 'Objective coefficients as {index: weight} or {i,j: weight}' },
        },
      },
      parameters: {
        type: 'object',
        properties: {
          numReads: { type: 'number', default: 1000 },
          annealingTime: { type: 'number', default: 20 },
          chainStrength: { type: 'number', default: 1.0 },
          temperature: { type: 'object' },
        },
      },
      embedding: { type: 'string', enum: ['auto', 'minor', 'pegasus', 'chimera'] },
    },
    required: ['problem'],
  },
  handler: annealingSolveHandler,
};

// ============================================================================
// Tool 2: quantum/qaoa-optimize
// ============================================================================

async function qaoaOptimizeHandler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    const validationResult = QAOAOptimizeInputSchema.safeParse(input);
    if (!validationResult.success) {
      return errorResult(`Invalid input: ${validationResult.error.message}`);
    }

    const data = validationResult.data;
    logger.debug('QAOA optimize', { nodes: data.problem.graph.nodes, depth: data.circuit?.depth });

    // Validate graph size
    if (data.problem.graph.nodes > 1000) {
      return errorResult(`Too many nodes: ${data.problem.graph.nodes} > 1000`);
    }

    const problemGraph: ProblemGraph = {
      nodes: data.problem.graph.nodes,
      edges: data.problem.graph.edges,
      weights: data.problem.graph.weights ? new Float32Array(data.problem.graph.weights) : undefined,
    };

    const bridge = await getExoticBridge();
    const result = await bridge.runQaoa(problemGraph, {
      depth: data.circuit?.depth ?? 3,
      optimizer: data.circuit?.optimizer ?? 'cobyla',
      initialParams: data.circuit?.initialParams ?? 'heuristic',
      shots: data.shots,
    });

    const duration = performance.now() - startTime;
    logger.info('QAOA completed', {
      energy: result.solution.energy,
      approximationRatio: result.approximationRatio,
      durationMs: duration.toFixed(2),
    });

    return successResult({
      solution: {
        assignment: Array.from(result.solution.assignment),
        energy: result.solution.energy,
        optimal: result.solution.optimal,
        confidence: result.solution.confidence,
      },
      parameters: {
        gamma: Array.from(result.parameters.gamma),
        beta: Array.from(result.parameters.beta),
      },
      approximationRatio: result.approximationRatio,
      convergence: Array.from(result.convergence),
    });
  } catch (error) {
    logger.error('QAOA failed', { error: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export const qaoaOptimizeTool: MCPTool = {
  name: 'quantum_qaoa_optimize',
  description: 'Optimize using Quantum Approximate Optimization Algorithm. Best for Max-Cut, portfolio optimization, scheduling, and routing problems.',
  category: 'quantum',
  version: '0.1.0',
  tags: ['quantum', 'qaoa', 'variational', 'max-cut', 'optimization'],
  cacheable: false,
  inputSchema: {
    type: 'object',
    properties: {
      problem: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['max_cut', 'portfolio', 'scheduling', 'routing'] },
          graph: {
            type: 'object',
            properties: {
              nodes: { type: 'number' },
              edges: { type: 'array', items: { type: 'array' } },
              weights: { type: 'array' },
            },
          },
        },
      },
      circuit: {
        type: 'object',
        properties: {
          depth: { type: 'number', default: 3 },
          optimizer: { type: 'string', enum: ['cobyla', 'bfgs', 'adam', 'nelder-mead'] },
          initialParams: { type: 'string', enum: ['random', 'heuristic', 'transfer', 'fourier'] },
        },
      },
      shots: { type: 'number', default: 1024 },
    },
    required: ['problem'],
  },
  handler: qaoaOptimizeHandler,
};

// ============================================================================
// Tool 3: quantum/grover-search
// ============================================================================

async function groverSearchHandler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    const validationResult = GroverSearchInputSchema.safeParse(input);
    if (!validationResult.success) {
      return errorResult(`Invalid input: ${validationResult.error.message}`);
    }

    const data = validationResult.data;
    logger.debug('Grover search', { size: data.searchSpace.size, structure: data.searchSpace.structure });

    // Validate search space
    if (data.searchSpace.size > RESOURCE_LIMITS.MAX_ITERATIONS) {
      return errorResult(`Search space too large: ${data.searchSpace.size} > ${RESOURCE_LIMITS.MAX_ITERATIONS}`);
    }

    const searchSpace: SearchSpace = {
      size: data.searchSpace.size,
      oracle: data.searchSpace.oracle,
      structure: data.searchSpace.structure,
    };

    const bridge = await getExoticBridge();
    const result = await bridge.groverSearch(searchSpace, {
      method: data.amplification?.method ?? 'standard',
      boostFactor: data.amplification?.boostFactor,
    });

    const duration = performance.now() - startTime;
    logger.info('Grover search completed', {
      found: result.solutions.length,
      queries: result.queries,
      durationMs: duration.toFixed(2),
    });

    return successResult({
      solutions: result.solutions.map(s => Array.from(s)),
      queries: result.queries,
      optimalQueries: result.optimalQueries,
      successProbability: result.successProbability,
      speedup: result.optimalQueries / (result.queries || 1),
    });
  } catch (error) {
    logger.error('Grover search failed', { error: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export const groverSearchTool: MCPTool = {
  name: 'quantum_grover_search',
  description: 'Grover-inspired search with quadratic speedup for unstructured search problems. Provides O(sqrt(N)) query complexity.',
  category: 'quantum',
  version: '0.1.0',
  tags: ['quantum', 'grover', 'search', 'speedup', 'oracle'],
  cacheable: false,
  inputSchema: {
    type: 'object',
    properties: {
      searchSpace: {
        type: 'object',
        properties: {
          size: { type: 'number', description: 'N elements in search space' },
          oracle: { type: 'string', description: 'Predicate function (e.g., "sum == 5")' },
          structure: { type: 'string', enum: ['unstructured', 'database', 'tree', 'graph'] },
        },
      },
      targets: { type: 'number', default: 1 },
      iterations: { type: 'string', enum: ['optimal', 'fixed', 'adaptive'] },
      amplification: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['standard', 'fixed_point', 'robust'] },
          boostFactor: { type: 'number' },
        },
      },
    },
    required: ['searchSpace'],
  },
  handler: groverSearchHandler,
};

// ============================================================================
// Tool 4: quantum/dependency-resolve
// ============================================================================

async function dependencyResolveHandler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    const validationResult = DependencyResolveInputSchema.safeParse(input);
    if (!validationResult.success) {
      return errorResult(`Invalid input: ${validationResult.error.message}`);
    }

    const data = validationResult.data;
    logger.debug('Dependency resolve', { packages: data.packages.length, solver: data.solver });

    const bridge = await getDagBridge();
    const result = await bridge.resolveDependencies(data.packages, {
      minimize: data.constraints?.minimize ?? 'versions',
      lockfile: data.constraints?.lockfile,
      includePeer: data.constraints?.includePeer ?? true,
      timeout: data.constraints?.timeout ?? 30000,
    });

    const duration = performance.now() - startTime;
    logger.info('Dependency resolution completed', {
      resolved: Object.keys(result.resolved).length,
      conflicts: result.resolvedConflicts.length,
      durationMs: duration.toFixed(2),
    });

    return successResult({
      resolved: result.resolved,
      installOrder: result.order,
      resolvedConflicts: result.resolvedConflicts,
      totalSize: result.totalSize,
      vulnerabilities: result.vulnerabilities,
    });
  } catch (error) {
    logger.error('Dependency resolution failed', { error: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export const dependencyResolveTool: MCPTool = {
  name: 'quantum_dependency_resolve',
  description: 'Resolve complex dependency graphs using quantum-inspired optimization. Handles version conflicts, minimizes package size or vulnerabilities.',
  category: 'quantum',
  version: '0.1.0',
  tags: ['quantum', 'dependency', 'package', 'resolution', 'conflict'],
  cacheable: false,
  inputSchema: {
    type: 'object',
    properties: {
      packages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            dependencies: { type: 'object' },
            conflicts: { type: 'array' },
            size: { type: 'number' },
            vulnerabilities: { type: 'array' },
          },
        },
      },
      constraints: {
        type: 'object',
        properties: {
          minimize: { type: 'string', enum: ['versions', 'size', 'vulnerabilities', 'depth'] },
          lockfile: { type: 'object' },
          includePeer: { type: 'boolean' },
          timeout: { type: 'number' },
        },
      },
      solver: { type: 'string', enum: ['quantum_annealing', 'qaoa', 'hybrid'] },
    },
    required: ['packages'],
  },
  handler: dependencyResolveHandler,
};

// ============================================================================
// Tool 5: quantum/schedule-optimize
// ============================================================================

async function scheduleOptimizeHandler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    const validationResult = ScheduleOptimizeInputSchema.safeParse(input);
    if (!validationResult.success) {
      return errorResult(`Invalid input: ${validationResult.error.message}`);
    }

    const data = validationResult.data;
    logger.debug('Schedule optimize', { tasks: data.tasks.length, resources: data.resources.length });

    const bridge = await getDagBridge();
    const result = await bridge.optimizeSchedule(data.tasks, data.resources, data.objective);

    const duration = performance.now() - startTime;
    logger.info('Schedule optimization completed', {
      makespan: result.makespan,
      cost: result.cost,
      score: result.score,
      durationMs: duration.toFixed(2),
    });

    return successResult({
      schedule: result.schedule,
      makespan: result.makespan,
      cost: result.cost,
      utilization: result.utilization,
      criticalPath: result.criticalPath,
      score: result.score,
    });
  } catch (error) {
    logger.error('Schedule optimization failed', { error: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export const scheduleOptimizeTool: MCPTool = {
  name: 'quantum_schedule_optimize',
  description: 'Optimize task scheduling using quantum algorithms. Minimizes makespan, cost, or maximizes resource utilization with dependency constraints.',
  category: 'quantum',
  version: '0.1.0',
  tags: ['quantum', 'scheduling', 'optimization', 'resources', 'critical-path'],
  cacheable: false,
  inputSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            duration: { type: 'number' },
            dependencies: { type: 'array' },
            resources: { type: 'array' },
            deadline: { type: 'number' },
            priority: { type: 'number' },
          },
        },
      },
      resources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            capacity: { type: 'number' },
            cost: { type: 'number' },
          },
        },
      },
      objective: { type: 'string', enum: ['makespan', 'cost', 'utilization', 'weighted'] },
    },
    required: ['tasks', 'resources'],
  },
  handler: scheduleOptimizeHandler,
};

// ============================================================================
// Tool Exports
// ============================================================================

/**
 * All Quantum Optimizer MCP Tools
 */
export const quantumOptimizerTools: MCPTool[] = [
  annealingSolveTool,
  qaoaOptimizeTool,
  groverSearchTool,
  dependencyResolveTool,
  scheduleOptimizeTool,
];

/**
 * Tool name to handler map
 */
export const toolHandlers = new Map<string, MCPTool['handler']>([
  ['quantum_annealing_solve', annealingSolveHandler],
  ['quantum_qaoa_optimize', qaoaOptimizeHandler],
  ['quantum_grover_search', groverSearchHandler],
  ['quantum_dependency_resolve', dependencyResolveHandler],
  ['quantum_schedule_optimize', scheduleOptimizeHandler],
]);

/**
 * Get a tool by name
 */
export function getTool(name: string): MCPTool | undefined {
  return quantumOptimizerTools.find(t => t.name === name);
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
  return quantumOptimizerTools.map(t => t.name);
}

export default quantumOptimizerTools;
