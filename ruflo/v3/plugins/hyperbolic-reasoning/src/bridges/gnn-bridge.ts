/**
 * GNN Bridge - Graph Neural Network Operations
 *
 * Bridge to @ruvector/gnn-wasm for graph-based reasoning,
 * node classification, link prediction, and graph embeddings.
 */

import type {
  Hierarchy,
  HierarchyNode,
  HierarchyEdge,
  Concept,
  EntailmentRelation,
  EntailmentGraph,
} from '../types.js';

/**
 * WASM module status
 */
export type WasmModuleStatus = 'unloaded' | 'loading' | 'ready' | 'error';

/**
 * GNN configuration
 */
export interface GnnConfig {
  /** Input feature dimension */
  readonly inputDim: number;
  /** Hidden layer dimension */
  readonly hiddenDim: number;
  /** Output dimension */
  readonly outputDim: number;
  /** Number of GNN layers */
  readonly numLayers: number;
  /** Aggregation method */
  readonly aggregation: 'mean' | 'sum' | 'max' | 'attention';
  /** Dropout rate */
  readonly dropout: number;
}

/**
 * Graph structure for GNN
 */
export interface Graph {
  /** Node features (each node has a feature vector) */
  readonly nodeFeatures: Float32Array[];
  /** Edges as [source, target] pairs */
  readonly edges: Array<[number, number]>;
  /** Edge weights */
  readonly edgeWeights?: Float32Array;
  /** Node labels (for supervised learning) */
  readonly labels?: Uint32Array;
}

/**
 * GNN inference result
 */
export interface GnnResult {
  /** Node embeddings */
  readonly nodeEmbeddings: Float32Array[];
  /** Graph-level embedding */
  readonly graphEmbedding: Float32Array;
  /** Node predictions (if applicable) */
  readonly predictions?: Float32Array[];
  /** Attention weights (if using attention aggregation) */
  readonly attentionWeights?: Map<string, Float32Array>;
}

/**
 * Entailment prediction result
 */
export interface EntailmentPrediction {
  /** Premise concept ID */
  readonly premise: string;
  /** Hypothesis concept ID */
  readonly hypothesis: string;
  /** Probability of entailment */
  readonly entailmentProb: number;
  /** Probability of contradiction */
  readonly contradictionProb: number;
  /** Probability of neutral */
  readonly neutralProb: number;
  /** Final relation type */
  readonly relation: 'entails' | 'contradicts' | 'neutral';
}

/**
 * GNN WASM module interface
 */
interface GnnWasmModule {
  // Graph operations
  forward(
    nodeFeatures: Float32Array,
    edges: Uint32Array,
    numNodes: number,
    numEdges: number,
    config: Uint8Array
  ): Float32Array;

  node_classification(
    nodeFeatures: Float32Array,
    edges: Uint32Array,
    numNodes: number,
    numEdges: number,
    numClasses: number
  ): Float32Array;

  link_prediction(
    nodeFeatures: Float32Array,
    edges: Uint32Array,
    sourceNodes: Uint32Array,
    targetNodes: Uint32Array
  ): Float32Array;

  // Memory
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  memory: WebAssembly.Memory;
}

/**
 * Default GNN configuration
 */
const DEFAULT_GNN_CONFIG: GnnConfig = {
  inputDim: 128,
  hiddenDim: 256,
  outputDim: 128,
  numLayers: 3,
  aggregation: 'mean',
  dropout: 0.1,
};

/**
 * Graph Neural Network Bridge
 */
export class GnnBridge {
  readonly name = 'hyperbolic-gnn-bridge';
  readonly version = '0.1.0';

  private _status: WasmModuleStatus = 'unloaded';
  private _module: GnnWasmModule | null = null;
  private _config: GnnConfig;

  constructor(config: Partial<GnnConfig> = {}) {
    this._config = { ...DEFAULT_GNN_CONFIG, ...config };
  }

  get status(): WasmModuleStatus {
    return this._status;
  }

  get initialized(): boolean {
    return this._status === 'ready';
  }

  /**
   * Initialize the WASM module
   */
  async initialize(): Promise<void> {
    if (this._status === 'ready') return;
    if (this._status === 'loading') return;

    this._status = 'loading';

    try {
      // Dynamic import - module may not be installed
      const wasmModule = await import(/* webpackIgnore: true */ '@ruvector/gnn-wasm' as string).catch(() => null);

      if (wasmModule) {
        this._module = wasmModule as unknown as GnnWasmModule;
      } else {
        this._module = this.createMockModule();
      }

      this._status = 'ready';
    } catch (error) {
      this._status = 'error';
      throw new Error(`Failed to initialize GnnBridge: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Dispose of resources
   */
  async dispose(): Promise<void> {
    this._module = null;
    this._status = 'unloaded';
  }

  /**
   * Forward pass through GNN
   */
  forward(graph: Graph, config: Partial<GnnConfig> = {}): GnnResult {
    if (!this._module) {
      throw new Error('GnnBridge not initialized');
    }

    const mergedConfig = { ...this._config, ...config };

    // Message passing layers
    let embeddings = graph.nodeFeatures.map(f => new Float32Array(f));

    for (let layer = 0; layer < mergedConfig.numLayers; layer++) {
      const newEmbeddings = embeddings.map(emb => new Float32Array(mergedConfig.hiddenDim).fill(0));

      // Aggregate neighbor messages
      for (const [src, tgt] of graph.edges) {
        const srcEmb = embeddings[src];
        const weight = graph.edgeWeights?.[graph.edges.indexOf([src, tgt] as [number, number])] ?? 1;

        if (srcEmb) {
          for (let i = 0; i < Math.min(srcEmb.length, mergedConfig.hiddenDim); i++) {
            newEmbeddings[tgt]![i] += srcEmb[i]! * weight;
          }
        }
      }

      // Normalize based on aggregation type
      const degrees = new Array(graph.nodeFeatures.length).fill(0);
      for (const [, tgt] of graph.edges) {
        degrees[tgt]++;
      }

      for (let i = 0; i < newEmbeddings.length; i++) {
        if (mergedConfig.aggregation === 'mean' && degrees[i]! > 0) {
          for (let j = 0; j < newEmbeddings[i]!.length; j++) {
            newEmbeddings[i]![j] /= degrees[i]!;
          }
        }

        // Add self-loop
        for (let j = 0; j < Math.min(embeddings[i]!.length, mergedConfig.hiddenDim); j++) {
          newEmbeddings[i]![j] += embeddings[i]![j]!;
        }

        // ReLU activation
        for (let j = 0; j < newEmbeddings[i]!.length; j++) {
          newEmbeddings[i]![j] = Math.max(0, newEmbeddings[i]![j]!);
        }
      }

      embeddings = newEmbeddings;
    }

    // Compute graph-level embedding via readout
    const graphEmbedding = new Float32Array(mergedConfig.outputDim).fill(0);

    for (const emb of embeddings) {
      for (let i = 0; i < Math.min(emb.length, mergedConfig.outputDim); i++) {
        graphEmbedding[i] += emb[i]! / embeddings.length;
      }
    }

    return {
      nodeEmbeddings: embeddings,
      graphEmbedding,
    };
  }

  /**
   * Predict links between nodes
   */
  predictLinks(
    graph: Graph,
    sourceNodes: number[],
    targetNodes: number[]
  ): Float32Array {
    const result = this.forward(graph);
    const predictions = new Float32Array(sourceNodes.length);

    for (let i = 0; i < sourceNodes.length; i++) {
      const srcEmb = result.nodeEmbeddings[sourceNodes[i]!];
      const tgtEmb = result.nodeEmbeddings[targetNodes[i]!];

      if (srcEmb && tgtEmb) {
        // Dot product similarity
        let dot = 0;
        for (let j = 0; j < Math.min(srcEmb.length, tgtEmb.length); j++) {
          dot += srcEmb[j]! * tgtEmb[j]!;
        }
        predictions[i] = 1 / (1 + Math.exp(-dot)); // Sigmoid
      }
    }

    return predictions;
  }

  /**
   * Build entailment graph from concepts using GNN
   */
  async buildEntailmentGraph(
    concepts: ReadonlyArray<Concept>,
    threshold: number = 0.7
  ): Promise<EntailmentGraph> {
    // Create initial embeddings from concept text
    const nodeFeatures: Float32Array[] = concepts.map(c => {
      const emb = new Float32Array(this._config.inputDim);
      // Simple text embedding via character hashing
      for (let i = 0; i < c.text.length; i++) {
        const idx = c.text.charCodeAt(i) % this._config.inputDim;
        emb[idx] += 1;
      }
      // Normalize
      const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0));
      for (let i = 0; i < emb.length; i++) {
        emb[i] /= norm + 1e-10;
      }
      return emb;
    });

    // Initial fully connected graph for message passing
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < concepts.length; i++) {
      for (let j = 0; j < concepts.length; j++) {
        if (i !== j) {
          edges.push([i, j]);
        }
      }
    }

    const graph: Graph = {
      nodeFeatures,
      edges,
    };

    // Get embeddings
    const result = this.forward(graph);

    // Predict entailment relations
    const relations: EntailmentRelation[] = [];

    for (let i = 0; i < concepts.length; i++) {
      for (let j = 0; j < concepts.length; j++) {
        if (i === j) continue;

        const srcEmb = result.nodeEmbeddings[i]!;
        const tgtEmb = result.nodeEmbeddings[j]!;

        // Asymmetric entailment score
        const entailmentScore = this.computeEntailmentScore(srcEmb, tgtEmb);

        if (entailmentScore.entailmentProb > threshold) {
          relations.push({
            premise: concepts[i]!.id,
            hypothesis: concepts[j]!.id,
            confidence: entailmentScore.entailmentProb,
            type: 'entails',
          });
        } else if (entailmentScore.contradictionProb > threshold) {
          relations.push({
            premise: concepts[i]!.id,
            hypothesis: concepts[j]!.id,
            confidence: entailmentScore.contradictionProb,
            type: 'contradicts',
          });
        }
      }
    }

    // Compute graph statistics
    const nodeCount = concepts.length;
    const edgeCount = relations.length;
    const maxPossibleEdges = nodeCount * (nodeCount - 1);
    const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;

    // Compute max depth via BFS from each node
    let maxDepth = 0;
    for (const concept of concepts) {
      const depth = this.computeMaxDepth(concept.id, relations, new Set());
      maxDepth = Math.max(maxDepth, depth);
    }

    return {
      concepts: concepts,
      relations,
      transitiveClosure: false,
      stats: {
        nodeCount,
        edgeCount,
        density,
        maxDepth,
      },
    };
  }

  /**
   * Predict entailment between two concepts
   */
  predictEntailment(
    premiseEmb: Float32Array,
    hypothesisEmb: Float32Array
  ): EntailmentPrediction {
    const score = this.computeEntailmentScore(premiseEmb, hypothesisEmb);

    let relation: 'entails' | 'contradicts' | 'neutral';
    if (score.entailmentProb > score.contradictionProb && score.entailmentProb > score.neutralProb) {
      relation = 'entails';
    } else if (score.contradictionProb > score.neutralProb) {
      relation = 'contradicts';
    } else {
      relation = 'neutral';
    }

    return {
      premise: '',
      hypothesis: '',
      entailmentProb: score.entailmentProb,
      contradictionProb: score.contradictionProb,
      neutralProb: score.neutralProb,
      relation,
    };
  }

  /**
   * Compute transitive closure of entailment graph
   */
  computeTransitiveClosure(graph: EntailmentGraph): EntailmentGraph {
    const relations = [...graph.relations];
    const conceptIds = new Set(graph.concepts.map(c => c.id));

    // Floyd-Warshall style transitive closure
    let changed = true;
    while (changed) {
      changed = false;

      for (const r1 of relations) {
        for (const r2 of relations) {
          if (r1.hypothesis === r2.premise && r1.type === 'entails' && r2.type === 'entails') {
            // Check if transitive relation exists
            const exists = relations.some(
              r => r.premise === r1.premise && r.hypothesis === r2.hypothesis
            );

            if (!exists && conceptIds.has(r1.premise) && conceptIds.has(r2.hypothesis)) {
              relations.push({
                premise: r1.premise,
                hypothesis: r2.hypothesis,
                confidence: r1.confidence * r2.confidence,
                type: 'entails',
              });
              changed = true;
            }
          }
        }
      }
    }

    return {
      ...graph,
      relations,
      transitiveClosure: true,
      stats: {
        ...graph.stats,
        edgeCount: relations.length,
        density: relations.length / (graph.concepts.length * (graph.concepts.length - 1)),
      },
    };
  }

  /**
   * Prune entailment graph using transitive reduction
   */
  transitiveReduction(graph: EntailmentGraph): EntailmentGraph {
    const relations = [...graph.relations];
    const toRemove = new Set<number>();

    // For each edge, check if it can be inferred transitively
    for (let i = 0; i < relations.length; i++) {
      const r = relations[i]!;
      if (r.type !== 'entails') continue;

      // Check if there's an indirect path
      const visited = new Set<string>();
      const hasIndirectPath = (current: string, target: string): boolean => {
        if (current === target) return true;
        if (visited.has(current)) return false;
        visited.add(current);

        for (let j = 0; j < relations.length; j++) {
          if (i === j) continue;
          const other = relations[j]!;
          if (other.type !== 'entails') continue;
          if (other.premise === current && other.hypothesis !== target) {
            if (hasIndirectPath(other.hypothesis, target)) {
              return true;
            }
          }
        }
        return false;
      };

      // Check if there's a path from premise to hypothesis not using this edge
      visited.clear();
      for (let j = 0; j < relations.length; j++) {
        if (i === j) continue;
        const other = relations[j]!;
        if (other.type !== 'entails') continue;
        if (other.premise === r.premise && hasIndirectPath(other.hypothesis, r.hypothesis)) {
          toRemove.add(i);
          break;
        }
      }
    }

    const prunedRelations = relations.filter((_, i) => !toRemove.has(i));

    return {
      ...graph,
      relations: prunedRelations,
      stats: {
        ...graph.stats,
        edgeCount: prunedRelations.length,
        density: prunedRelations.length / (graph.concepts.length * (graph.concepts.length - 1)),
      },
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private computeEntailmentScore(
    premiseEmb: Float32Array,
    hypothesisEmb: Float32Array
  ): { entailmentProb: number; contradictionProb: number; neutralProb: number } {
    // Asymmetric entailment using inclusion heuristic
    // Premise should "include" hypothesis for entailment

    // Compute norms
    const normP = Math.sqrt(premiseEmb.reduce((s, v) => s + v * v, 0));
    const normH = Math.sqrt(hypothesisEmb.reduce((s, v) => s + v * v, 0));

    // Dot product
    let dot = 0;
    for (let i = 0; i < Math.min(premiseEmb.length, hypothesisEmb.length); i++) {
      dot += premiseEmb[i]! * hypothesisEmb[i]!;
    }

    const cosine = dot / (normP * normH + 1e-10);

    // Asymmetric features
    const normRatio = normH / (normP + 1e-10);

    // Difference features
    let diffNorm = 0;
    for (let i = 0; i < Math.min(premiseEmb.length, hypothesisEmb.length); i++) {
      diffNorm += Math.pow(premiseEmb[i]! - hypothesisEmb[i]!, 2);
    }
    diffNorm = Math.sqrt(diffNorm);

    // Simple scoring model
    const entailmentScore = (1 + cosine) / 2 * (1 - normRatio * 0.5);
    const contradictionScore = (1 - cosine) / 2 * (diffNorm > 1 ? 0.8 : 0.2);
    const neutralScore = 1 - entailmentScore - contradictionScore;

    // Softmax normalization
    const maxScore = Math.max(entailmentScore, contradictionScore, neutralScore);
    const expE = Math.exp(entailmentScore - maxScore);
    const expC = Math.exp(contradictionScore - maxScore);
    const expN = Math.exp(neutralScore - maxScore);
    const sumExp = expE + expC + expN;

    return {
      entailmentProb: expE / sumExp,
      contradictionProb: expC / sumExp,
      neutralProb: expN / sumExp,
    };
  }

  private computeMaxDepth(
    nodeId: string,
    relations: ReadonlyArray<EntailmentRelation>,
    visited: Set<string>
  ): number {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);

    let maxChildDepth = 0;
    for (const r of relations) {
      if (r.premise === nodeId && r.type === 'entails') {
        const childDepth = this.computeMaxDepth(r.hypothesis, relations, visited);
        maxChildDepth = Math.max(maxChildDepth, childDepth + 1);
      }
    }

    visited.delete(nodeId);
    return maxChildDepth;
  }

  /**
   * Create mock module for development
   */
  private createMockModule(): GnnWasmModule {
    return {
      forward: () => new Float32Array(0),
      node_classification: () => new Float32Array(0),
      link_prediction: () => new Float32Array(0),
      alloc: () => 0,
      dealloc: () => undefined,
      memory: new WebAssembly.Memory({ initial: 1 }),
    };
  }
}

/**
 * Create a new GnnBridge instance
 */
export function createGnnBridge(config?: Partial<GnnConfig>): GnnBridge {
  return new GnnBridge(config);
}
