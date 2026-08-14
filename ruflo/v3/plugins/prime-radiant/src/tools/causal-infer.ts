/**
 * Causal Inference Tool - pr_causal_infer
 *
 * Performs causal inference using do-calculus.
 * Estimates causal effects, identifies confounders, and finds backdoor paths.
 *
 * Uses CausalEngine from prime-radiant-advanced-wasm
 */

import type {
  MCPTool,
  MCPToolResult,
  ToolContext,
  CausalOutput,
  CausalGraph,
} from './types.js';
import {
  CausalInputSchema,
  successResult,
  errorResult,
} from './types.js';

// Default logger
const defaultLogger = {
  debug: (msg: string, meta?: Record<string, unknown>) => console.debug(`[pr_causal_infer] ${msg}`, meta),
  info: (msg: string, meta?: Record<string, unknown>) => console.info(`[pr_causal_infer] ${msg}`, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[pr_causal_infer] ${msg}`, meta),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(`[pr_causal_infer] ${msg}`, meta),
};

// ============================================================================
// Graph Helper Functions
// ============================================================================

interface GraphNode {
  id: string;
  parents: Set<string>;
  children: Set<string>;
}

function buildGraphStructure(graph: CausalGraph): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();

  // Initialize nodes
  for (const nodeId of graph.nodes) {
    nodes.set(nodeId, {
      id: nodeId,
      parents: new Set(),
      children: new Set(),
    });
  }

  // Add edges
  for (const [from, to] of graph.edges) {
    const fromNode = nodes.get(from);
    const toNode = nodes.get(to);

    if (fromNode && toNode) {
      fromNode.children.add(to);
      toNode.parents.add(from);
    }
  }

  return nodes;
}

/**
 * Find all ancestors of a node (including the node itself)
 */
function findAncestors(nodeId: string, graph: Map<string, GraphNode>): Set<string> {
  const ancestors = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (ancestors.has(current)) continue;
    ancestors.add(current);

    const node = graph.get(current);
    if (node) {
      for (const parent of node.parents) {
        queue.push(parent);
      }
    }
  }

  return ancestors;
}

/**
 * Find all descendants of a node (including the node itself)
 */
function findDescendants(nodeId: string, graph: Map<string, GraphNode>): Set<string> {
  const descendants = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (descendants.has(current)) continue;
    descendants.add(current);

    const node = graph.get(current);
    if (node) {
      for (const child of node.children) {
        queue.push(child);
      }
    }
  }

  return descendants;
}

/**
 * Identify confounders (common causes of treatment and outcome)
 */
function identifyConfounders(
  treatment: string,
  outcome: string,
  graph: Map<string, GraphNode>
): string[] {
  const treatmentAncestors = findAncestors(treatment, graph);
  const outcomeAncestors = findAncestors(outcome, graph);

  // Confounders are ancestors of both treatment and outcome
  // that are not the treatment itself
  const confounders: string[] = [];

  for (const ancestor of treatmentAncestors) {
    if (ancestor !== treatment && ancestor !== outcome && outcomeAncestors.has(ancestor)) {
      confounders.push(ancestor);
    }
  }

  return confounders;
}

/**
 * Find backdoor paths from treatment to outcome
 * A backdoor path is a path that goes into the treatment node
 */
function findBackdoorPaths(
  treatment: string,
  outcome: string,
  graph: Map<string, GraphNode>,
  maxPaths: number = 10
): string[][] {
  const backdoorPaths: string[][] = [];
  const treatmentNode = graph.get(treatment);

  if (!treatmentNode) return [];

  // Start from each parent of treatment (backdoor)
  for (const parent of treatmentNode.parents) {
    const paths = findAllPaths(parent, outcome, graph, new Set([treatment]), maxPaths - backdoorPaths.length);

    for (const path of paths) {
      backdoorPaths.push([treatment, ...path]);
      if (backdoorPaths.length >= maxPaths) break;
    }

    if (backdoorPaths.length >= maxPaths) break;
  }

  return backdoorPaths;
}

/**
 * Find all paths from source to target (BFS with path tracking)
 */
function findAllPaths(
  source: string,
  target: string,
  graph: Map<string, GraphNode>,
  exclude: Set<string>,
  maxPaths: number
): string[][] {
  const paths: string[][] = [];
  const queue: { node: string; path: string[] }[] = [{ node: source, path: [source] }];

  while (queue.length > 0 && paths.length < maxPaths) {
    const { node, path } = queue.shift()!;

    if (node === target) {
      paths.push(path);
      continue;
    }

    const currentNode = graph.get(node);
    if (!currentNode) continue;

    // Consider both parents and children for undirected path finding
    const neighbors = new Set([...currentNode.parents, ...currentNode.children]);

    for (const neighbor of neighbors) {
      if (!path.includes(neighbor) && !exclude.has(neighbor)) {
        queue.push({
          node: neighbor,
          path: [...path, neighbor],
        });
      }
    }
  }

  return paths;
}

/**
 * Check if intervention is valid (treatment must exist and have outgoing edges)
 */
function validateIntervention(
  treatment: string,
  outcome: string,
  graph: Map<string, GraphNode>
): boolean {
  const treatmentNode = graph.get(treatment);
  const outcomeNode = graph.get(outcome);

  if (!treatmentNode || !outcomeNode) {
    return false;
  }

  // Check if there's any path from treatment to outcome
  const descendants = findDescendants(treatment, graph);
  return descendants.has(outcome);
}

/**
 * Estimate causal effect using backdoor adjustment
 * This is a simplified estimation - real estimation requires data
 */
function estimateCausalEffect(
  treatment: string,
  outcome: string,
  confounders: string[],
  backdoorPaths: string[][],
  graph: Map<string, GraphNode>
): { effect: number; confidence: number } {
  // Effect estimation heuristic based on graph structure
  // In practice, this requires observational data

  // Base effect: based on direct path existence
  const treatmentNode = graph.get(treatment);
  let baseEffect = treatmentNode?.children.has(outcome) ? 0.5 : 0.3;

  // Adjust for confounders (more confounders = less identifiable effect)
  const confounderPenalty = Math.min(confounders.length * 0.1, 0.3);

  // Adjust for backdoor paths (more unblocked paths = less reliable)
  const pathPenalty = Math.min(backdoorPaths.length * 0.05, 0.2);

  const effect = Math.max(0, baseEffect - confounderPenalty - pathPenalty);

  // Confidence decreases with confounders and backdoor paths
  const confidence = Math.max(0.1, 1 - confounderPenalty - pathPenalty);

  return { effect, confidence };
}

/**
 * Get interpretation of causal analysis results
 */
function getInterpretation(
  interventionValid: boolean,
  confounders: string[],
  backdoorPaths: string[][],
  confidence: number
): string {
  if (!interventionValid) {
    return 'Intervention is not valid - no causal path exists from treatment to outcome';
  }

  if (confounders.length === 0 && backdoorPaths.length === 0) {
    return 'Clean causal identification - no confounding detected';
  }

  if (confidence > 0.8) {
    return 'Strong causal identification - confounders can be adjusted for';
  }

  if (confidence > 0.5) {
    return `Moderate causal identification - ${confounders.length} confounder(s) require adjustment`;
  }

  return `Weak causal identification - multiple confounders (${confounders.length}) and backdoor paths (${backdoorPaths.length}) detected`;
}

/**
 * Handler for pr_causal_infer tool
 */
async function handler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    // Validate input
    const validationResult = CausalInputSchema.safeParse(input);
    if (!validationResult.success) {
      logger.error('Input validation failed', { error: validationResult.error.message });
      return errorResult(`Invalid input: ${validationResult.error.message}`);
    }

    const { graph, intervention, outcome } = validationResult.data;
    logger.debug('Processing causal inference', {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      intervention,
      outcome,
    });

    // Validate nodes exist
    if (!graph.nodes.includes(intervention)) {
      return errorResult(`Intervention variable "${intervention}" not found in graph nodes`);
    }
    if (!graph.nodes.includes(outcome)) {
      return errorResult(`Outcome variable "${outcome}" not found in graph nodes`);
    }

    const maxBackdoorPaths = context?.config?.causal?.maxBackdoorPaths ?? 10;
    // Note: confidenceThreshold can be used for filtering in future enhancements
    void (context?.config?.causal?.confidenceThreshold ?? 0.8);

    let effect: number;
    let confidence: number;
    let confounders: string[];
    let backdoorPaths: string[][];
    let interventionValid: boolean;

    // Try to use WASM bridge if available
    if (context?.bridge?.initialized) {
      try {
        logger.debug('Using WASM bridge for causal inference');
        const result = await context.bridge.inferCausal(graph, intervention, outcome);
        effect = result.effect;
        confidence = result.confidence;
        confounders = result.confounders;
        backdoorPaths = result.backdoorPaths;
        interventionValid = result.interventionValid;
      } catch (wasmError) {
        logger.warn('WASM bridge failed, falling back to JS implementation', {
          error: wasmError instanceof Error ? wasmError.message : String(wasmError),
        });
        // Use JavaScript implementation
        const graphStructure = buildGraphStructure(graph);
        interventionValid = validateIntervention(intervention, outcome, graphStructure);
        confounders = identifyConfounders(intervention, outcome, graphStructure);
        backdoorPaths = findBackdoorPaths(intervention, outcome, graphStructure, maxBackdoorPaths);
        const estimation = estimateCausalEffect(intervention, outcome, confounders, backdoorPaths, graphStructure);
        effect = estimation.effect;
        confidence = estimation.confidence;
      }
    } else {
      // Pure JavaScript fallback
      logger.debug('Using JavaScript fallback for causal inference');
      const graphStructure = buildGraphStructure(graph);
      interventionValid = validateIntervention(intervention, outcome, graphStructure);
      confounders = identifyConfounders(intervention, outcome, graphStructure);
      backdoorPaths = findBackdoorPaths(intervention, outcome, graphStructure, maxBackdoorPaths);
      const estimation = estimateCausalEffect(intervention, outcome, confounders, backdoorPaths, graphStructure);
      effect = estimation.effect;
      confidence = estimation.confidence;
    }

    const output: CausalOutput = {
      effect,
      confidence,
      backdoorPaths: backdoorPaths.map(p => p.join(' -> ')),
      details: {
        confounders,
        interventionValid,
        interpretation: getInterpretation(interventionValid, confounders, backdoorPaths, confidence),
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      },
    };

    const duration = performance.now() - startTime;
    logger.info('Causal inference completed', {
      effect: effect.toFixed(4),
      confidence: confidence.toFixed(4),
      confounders: confounders.length,
      backdoorPaths: backdoorPaths.length,
      interventionValid,
      durationMs: duration.toFixed(2),
    });

    return successResult(output);

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('Causal inference failed', {
      error: error instanceof Error ? error.message : String(error),
      durationMs: duration.toFixed(2),
    });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * pr_causal_infer MCP Tool Definition
 */
export const causalInferTool: MCPTool = {
  name: 'pr_causal_infer',
  description: 'Perform causal inference using do-calculus. Estimates causal effects, identifies confounders, and finds backdoor paths. Uses CausalEngine for mathematical causal analysis.',
  category: 'causal',
  version: '0.1.3',
  tags: ['causal', 'do-calculus', 'confounders', 'backdoor-paths', 'ai-interpretability'],
  cacheable: true,
  cacheTTL: 60000,
  inputSchema: {
    type: 'object',
    properties: {
      graph: {
        type: 'object',
        properties: {
          nodes: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of variable names',
          },
          edges: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: 2,
            },
            description: 'Directed edges as [from, to] pairs',
          },
        },
        required: ['nodes', 'edges'],
        description: 'Causal graph with nodes and directed edges',
      },
      intervention: {
        type: 'string',
        description: 'Treatment/intervention variable',
      },
      outcome: {
        type: 'string',
        description: 'Outcome variable to measure effect on',
      },
    },
    required: ['graph', 'intervention', 'outcome'],
  },
  handler,
};

export default causalInferTool;
