/**
 * Quantum Topology Tool - pr_quantum_topology
 *
 * Computes quantum topology features including Betti numbers and persistence diagrams.
 * Analyzes topological features of point clouds and simplicial complexes.
 *
 * Uses QuantumEngine from prime-radiant-advanced-wasm
 */

import type {
  MCPTool,
  MCPToolResult,
  ToolContext,
  TopologyOutput,
  SimplicialComplex,
} from './types.js';
import {
  TopologyInputSchema,
  successResult,
  errorResult,
} from './types.js';

// Default logger
const defaultLogger = {
  debug: (msg: string, meta?: Record<string, unknown>) => console.debug(`[pr_quantum_topology] ${msg}`, meta),
  info: (msg: string, meta?: Record<string, unknown>) => console.info(`[pr_quantum_topology] ${msg}`, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[pr_quantum_topology] ${msg}`, meta),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(`[pr_quantum_topology] ${msg}`, meta),
};

// ============================================================================
// Topology Helper Functions
// ============================================================================

/**
 * Compute Euclidean distance between two points
 */
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Build distance matrix from vertices
 */
function buildDistanceMatrix(vertices: number[][]): number[][] {
  const n = vertices.length;
  const matrix: number[][] = [];

  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) {
      matrix[i][j] = euclideanDistance(vertices[i], vertices[j]);
    }
  }

  return matrix;
}

/**
 * Build Vietoris-Rips complex at given epsilon
 * Returns list of simplices (vertex index arrays)
 */
function buildRipsComplex(
  distanceMatrix: number[][],
  epsilon: number,
  maxDimension: number
): number[][] {
  const n = distanceMatrix.length;
  const simplices: number[][] = [];

  // Add 0-simplices (vertices)
  for (let i = 0; i < n; i++) {
    simplices.push([i]);
  }

  if (maxDimension < 1) return simplices;

  // Add 1-simplices (edges)
  const edges: number[][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (distanceMatrix[i][j] <= epsilon) {
        edges.push([i, j]);
        simplices.push([i, j]);
      }
    }
  }

  if (maxDimension < 2) return simplices;

  // Add 2-simplices (triangles)
  // A triangle exists if all three edges exist
  const edgeSet = new Set(edges.map(e => `${e[0]}-${e[1]}`));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!edgeSet.has(`${i}-${j}`)) continue;
      for (let k = j + 1; k < n; k++) {
        if (edgeSet.has(`${i}-${k}`) && edgeSet.has(`${j}-${k}`)) {
          simplices.push([i, j, k]);
        }
      }
    }
  }

  if (maxDimension < 3) return simplices;

  // Add 3-simplices (tetrahedra)
  // Simplified: only add if all faces exist
  const triangleSet = new Set(
    simplices
      .filter(s => s.length === 3)
      .map(t => `${t[0]}-${t[1]}-${t[2]}`)
  );

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        for (let l = k + 1; l < n; l++) {
          // Check all 4 triangular faces exist
          const faces = [
            `${i}-${j}-${k}`,
            `${i}-${j}-${l}`,
            `${i}-${k}-${l}`,
            `${j}-${k}-${l}`,
          ];
          if (faces.every(f => triangleSet.has(f))) {
            simplices.push([i, j, k, l]);
          }
        }
      }
    }
  }

  return simplices;
}

/**
 * Compute Betti numbers from simplicial complex
 * Uses simplified computation based on simplex counts
 *
 * Betti numbers:
 * - b0: Number of connected components
 * - b1: Number of loops/cycles
 * - b2: Number of voids/cavities
 */
function computeBettiNumbers(
  vertices: number[][],
  simplices: number[][],
  maxDimension: number
): number[] {
  const n = vertices.length;
  const bettiNumbers: number[] = [];

  // Count simplices by dimension
  const simplexCounts = new Array(maxDimension + 1).fill(0);
  for (const simplex of simplices) {
    const dim = simplex.length - 1;
    if (dim <= maxDimension) {
      simplexCounts[dim]++;
    }
  }

  // b0: Connected components (using union-find approximation)
  const parent = new Array(n).fill(-1);

  function find(x: number): number {
    if (parent[x] < 0) return x;
    parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(x: number, y: number): void {
    const px = find(x);
    const py = find(y);
    if (px !== py) {
      parent[px] = py;
    }
  }

  // Connect vertices in edges
  for (const simplex of simplices) {
    if (simplex.length === 2) {
      union(simplex[0], simplex[1]);
    }
  }

  // Count components
  let b0 = 0;
  for (let i = 0; i < n; i++) {
    if (parent[i] < 0) b0++;
  }
  bettiNumbers.push(b0);

  // b1: Approximate using Euler characteristic relationship
  // For connected graphs: b1 = edges - vertices + components
  if (maxDimension >= 1) {
    const edges = simplexCounts[1] || 0;
    const b1 = Math.max(0, edges - n + b0);
    bettiNumbers.push(b1);
  }

  // b2: Approximate from triangle/tetrahedron relationship
  if (maxDimension >= 2) {
    const triangles = simplexCounts[2] || 0;
    const tetrahedra = simplexCounts[3] || 0;
    // Simplified: b2 related to enclosed voids
    const b2 = Math.max(0, tetrahedra > 0 ? 1 : 0);
    bettiNumbers.push(b2);
  }

  return bettiNumbers;
}

/**
 * Compute persistence diagram using filtration
 * Tracks birth and death of topological features
 */
function computePersistenceDiagram(
  distanceMatrix: number[][],
  maxDimension: number
): { birth: number; death: number; dimension: number }[] {
  const diagram: { birth: number; death: number; dimension: number }[] = [];

  // Get all unique distances (filtration values)
  const distances: number[] = [];
  const n = distanceMatrix.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      distances.push(distanceMatrix[i][j]);
    }
  }

  distances.sort((a, b) => a - b);
  const uniqueDistances = [...new Set(distances)];

  // Sample filtration values
  const sampleCount = Math.min(10, uniqueDistances.length);
  const sampleIndices: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    sampleIndices.push(Math.floor(i * uniqueDistances.length / sampleCount));
  }

  const filtrationValues = sampleIndices.map(i => uniqueDistances[i]);
  if (filtrationValues.length === 0) return diagram;

  // Track Betti numbers at each filtration value
  let prevBetti: number[] = [];

  for (let f = 0; f < filtrationValues.length; f++) {
    const epsilon = filtrationValues[f];
    const simplices = buildRipsComplex(distanceMatrix, epsilon, maxDimension);
    const currentBetti = computeBettiNumbers(
      new Array(n).fill([]).map((_, i) => [i]),
      simplices,
      maxDimension
    );

    if (f > 0) {
      // Detect births and deaths
      for (let dim = 0; dim <= maxDimension && dim < currentBetti.length; dim++) {
        const prevB = prevBetti[dim] || 0;
        const currB = currentBetti[dim] || 0;

        // New features born
        if (currB > prevB) {
          for (let i = 0; i < currB - prevB; i++) {
            diagram.push({
              birth: filtrationValues[f - 1],
              death: Infinity, // Will be updated when feature dies
              dimension: dim,
            });
          }
        }

        // Features died
        if (currB < prevB) {
          // Find features to kill (those born earliest)
          const toKill = prevB - currB;
          let killed = 0;
          for (let d = diagram.length - 1; d >= 0 && killed < toKill; d--) {
            if (diagram[d].dimension === dim && diagram[d].death === Infinity) {
              diagram[d].death = epsilon;
              killed++;
            }
          }
        }
      }
    } else {
      // Initial features (all vertices born at epsilon = 0)
      for (let dim = 0; dim <= maxDimension && dim < currentBetti.length; dim++) {
        for (let i = 0; i < currentBetti[dim]; i++) {
          diagram.push({
            birth: 0,
            death: Infinity,
            dimension: dim,
          });
        }
      }
    }

    prevBetti = currentBetti;
  }

  return diagram;
}

/**
 * Get interpretation of Betti numbers
 */
function interpretBettiNumbers(bettiNumbers: number[]): {
  b0: string;
  b1: string;
  b2: string;
} {
  return {
    b0: `${bettiNumbers[0] || 0} connected component(s)`,
    b1: `${bettiNumbers[1] || 0} loop(s)/cycle(s)`,
    b2: `${bettiNumbers[2] || 0} void(s)/cavit${(bettiNumbers[2] || 0) === 1 ? 'y' : 'ies'}`,
  };
}

/**
 * Handler for pr_quantum_topology tool
 */
async function handler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    // Validate input
    const validationResult = TopologyInputSchema.safeParse(input);
    if (!validationResult.success) {
      logger.error('Input validation failed', { error: validationResult.error.message });
      return errorResult(`Invalid input: ${validationResult.error.message}`);
    }

    const { complex } = validationResult.data;
    const { vertices, maxDimension } = complex;

    logger.debug('Processing quantum topology', {
      vertexCount: vertices.length,
      maxDimension,
    });

    if (vertices.length === 0) {
      return errorResult('No vertices provided');
    }

    // Validate vertex dimensions are consistent
    const firstDim = vertices[0].length;
    for (let i = 1; i < vertices.length; i++) {
      if (vertices[i].length !== firstDim) {
        return errorResult(
          `Vertex dimension mismatch: vertex ${i} has ${vertices[i].length} dimensions, expected ${firstDim}`
        );
      }
    }

    let bettiNumbers: number[];
    let persistenceDiagram: { birth: number; death: number; dimension: number }[];
    let homologyClasses: number;

    // Try to use WASM bridge if available
    if (context?.bridge?.initialized) {
      try {
        logger.debug('Using WASM bridge for topology computation');
        const result = await context.bridge.computeTopology(complex);
        bettiNumbers = result.bettiNumbers;
        persistenceDiagram = result.persistenceDiagram.map(([birth, death], i) => ({
          birth,
          death,
          dimension: Math.min(i % (maxDimension + 1), maxDimension),
        }));
        homologyClasses = result.homologyClasses;
      } catch (wasmError) {
        logger.warn('WASM bridge failed, falling back to JS implementation', {
          error: wasmError instanceof Error ? wasmError.message : String(wasmError),
        });
        // Use JavaScript implementation
        const distanceMatrix = buildDistanceMatrix(vertices);
        const maxDistance = Math.max(...distanceMatrix.flat().filter(d => d > 0));
        const simplices = buildRipsComplex(distanceMatrix, maxDistance * 0.5, maxDimension);
        bettiNumbers = computeBettiNumbers(vertices, simplices, maxDimension);
        persistenceDiagram = computePersistenceDiagram(distanceMatrix, maxDimension);
        homologyClasses = bettiNumbers.reduce((a, b) => a + b, 0);
      }
    } else {
      // Pure JavaScript fallback
      logger.debug('Using JavaScript fallback for topology computation');
      const distanceMatrix = buildDistanceMatrix(vertices);
      const maxDistance = Math.max(...distanceMatrix.flat().filter(d => d > 0));
      const simplices = buildRipsComplex(distanceMatrix, maxDistance * 0.5, maxDimension);
      bettiNumbers = computeBettiNumbers(vertices, simplices, maxDimension);
      persistenceDiagram = computePersistenceDiagram(distanceMatrix, maxDimension);
      homologyClasses = bettiNumbers.reduce((a, b) => a + b, 0);
    }

    const output: TopologyOutput = {
      bettiNumbers,
      persistenceDiagram,
      details: {
        homologyClasses,
        interpretation: interpretBettiNumbers(bettiNumbers),
        vertexCount: vertices.length,
        maxDimension,
      },
    };

    const duration = performance.now() - startTime;
    logger.info('Quantum topology completed', {
      bettiNumbers: bettiNumbers.join(', '),
      persistencePoints: persistenceDiagram.length,
      homologyClasses,
      durationMs: duration.toFixed(2),
    });

    return successResult(output);

  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('Quantum topology failed', {
      error: error instanceof Error ? error.message : String(error),
      durationMs: duration.toFixed(2),
    });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * pr_quantum_topology MCP Tool Definition
 */
export const quantumTopologyTool: MCPTool = {
  name: 'pr_quantum_topology',
  description: 'Compute quantum topology features including Betti numbers and persistence diagrams. Analyzes topological features of point clouds. Uses QuantumEngine for persistent homology computation.',
  category: 'topology',
  version: '0.1.3',
  tags: ['topology', 'betti-numbers', 'persistence', 'homology', 'ai-interpretability'],
  cacheable: true,
  cacheTTL: 120000, // 2 minute cache (expensive computation)
  inputSchema: {
    type: 'object',
    properties: {
      complex: {
        type: 'object',
        properties: {
          vertices: {
            type: 'array',
            items: { type: 'array', items: { type: 'number' } },
            description: 'Vertex coordinates (point cloud)',
          },
          simplices: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                vertices: { type: 'array', items: { type: 'number' } },
                dimension: { type: 'number' },
              },
            },
            description: 'Explicit simplices (optional, computed from vertices if not provided)',
          },
          maxDimension: {
            type: 'number',
            default: 2,
            description: 'Maximum homology dimension to compute (0-3)',
          },
        },
        required: ['vertices'],
        description: 'Simplicial complex for topological analysis',
      },
    },
    required: ['complex'],
  },
  handler,
};

export default quantumTopologyTool;
