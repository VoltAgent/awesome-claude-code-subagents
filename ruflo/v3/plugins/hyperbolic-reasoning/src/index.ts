/**
 * @claude-flow/plugin-hyperbolic-reasoning
 *
 * Hyperbolic reasoning plugin for Claude Flow V3.
 *
 * Provides MCP tools for:
 * - Hierarchy embedding in Poincare ball
 * - Taxonomic reasoning (IS-A, subsumption, LCA)
 * - Hierarchically-aware semantic search
 * - Hierarchy comparison and alignment
 * - Entailment graph construction
 *
 * @module @claude-flow/plugin-hyperbolic-reasoning
 * @version 3.0.0-alpha.1
 */

// Types
export type {
  // Hyperbolic Geometry
  HyperbolicPoint,
  HyperbolicModel,
  MobiusTransform,
  // Hierarchy
  HierarchyNode,
  HierarchyEdge,
  Hierarchy,
  EmbeddedHierarchy,
  // Taxonomic Reasoning
  TaxonomicQueryType,
  TaxonomicQuery,
  InferenceConfig,
  TaxonomicResult,
  // Search
  SearchMode,
  SearchConstraints,
  SearchResultItem,
  SearchResult,
  // Comparison
  AlignmentMethod,
  ComparisonMetric,
  NodeAlignment,
  ComparisonResult,
  // Entailment
  Concept,
  EntailmentRelation,
  EntailmentAction,
  PruneStrategy,
  EntailmentGraph,
  EntailmentQueryResult,
  // MCP
  MCPTool,
  MCPToolResult,
  MCPToolInputSchema,
  ToolContext,
  Logger,
  HyperbolicReasoningConfig,
  HyperbolicReasoningBridge,
} from './types.js';

// Zod Schemas
export {
  HierarchyNodeSchema,
  HierarchyEdgeSchema,
  HierarchySchema,
  EmbedHierarchyInputSchema,
  TaxonomicReasonInputSchema,
  SemanticSearchInputSchema,
  HierarchyCompareInputSchema,
  ConceptSchema,
  EntailmentGraphInputSchema,
  successResult,
  errorResult,
  POINCARE_BALL_EPS,
  MAX_NORM,
  RESOURCE_LIMITS,
} from './types.js';

// Hyperbolic Math Utilities
export {
  clipToBall,
  poincareDistance,
  mobiusAdd,
  expMap,
  logMap,
} from './types.js';

// Bridges
export { HyperbolicBridge, createHyperbolicBridge } from './bridges/hyperbolic-bridge.js';
export { GnnBridge, createGnnBridge } from './bridges/gnn-bridge.js';
export type { WasmModuleStatus } from './bridges/hyperbolic-bridge.js';
export type {
  GnnConfig,
  Graph,
  GnnResult,
  EntailmentPrediction,
} from './bridges/gnn-bridge.js';

// MCP Tools
export {
  hyperbolicReasoningTools,
  toolHandlers,
  getTool,
  getToolNames,
  embedHierarchyTool,
  taxonomicReasonTool,
  semanticSearchTool,
  hierarchyCompareTool,
  entailmentGraphTool,
} from './mcp-tools.js';

// Re-export default
export { default } from './mcp-tools.js';

/**
 * Plugin metadata
 */
export const pluginMetadata = {
  name: '@claude-flow/plugin-hyperbolic-reasoning',
  version: '3.0.0-alpha.1',
  description: 'Hyperbolic geometry for hierarchical reasoning',
  category: 'exotic',
  author: 'rUv',
  license: 'MIT',
  repository: 'https://github.com/ruvnet/claude-flow',
  tools: [
    'hyperbolic_embed_hierarchy',
    'hyperbolic_taxonomic_reason',
    'hyperbolic_semantic_search',
    'hyperbolic_hierarchy_compare',
    'hyperbolic_entailment_graph',
  ],
  bridges: ['hyperbolic-bridge', 'gnn-bridge'],
  wasmPackages: [
    '@ruvector/hyperbolic-hnsw-wasm',
    '@ruvector/attention-wasm',
    '@ruvector/gnn-wasm',
    '@ruvector/sona',
  ],
} as const;

/**
 * Initialize the plugin
 */
export async function initializePlugin(): Promise<void> {
  const { createHyperbolicBridge } = await import('./bridges/hyperbolic-bridge.js');
  const { createGnnBridge } = await import('./bridges/gnn-bridge.js');

  const hyperbolicBridge = createHyperbolicBridge();
  const gnnBridge = createGnnBridge();

  await Promise.all([
    hyperbolicBridge.initialize(),
    gnnBridge.initialize(),
  ]);

  console.info('[hyperbolic-reasoning] Plugin initialized');
}

/**
 * Plugin configuration validator
 */
export function validateConfig(config: unknown): config is HyperbolicReasoningConfig {
  if (!config || typeof config !== 'object') return false;

  const c = config as Record<string, unknown>;

  return (
    typeof c['embedding'] === 'object' &&
    typeof c['search'] === 'object' &&
    typeof c['entailment'] === 'object' &&
    typeof c['resourceLimits'] === 'object'
  );
}

/**
 * Default plugin configuration
 */
export const defaultConfig: HyperbolicReasoningConfig = {
  embedding: {
    defaultDimensions: 32,
    defaultCurvature: -1.0,
    maxNodes: 1000000,
  },
  search: {
    maxTopK: 10000,
    defaultTopK: 10,
  },
  entailment: {
    defaultThreshold: 0.7,
    maxConcepts: 100000,
  },
  resourceLimits: {
    maxMemoryBytes: 2147483648,
    maxCpuTimeMs: 300000,
    maxDepth: 100,
  },
};

// Import HyperbolicReasoningConfig type for the validateConfig function
import type { HyperbolicReasoningConfig } from './types.js';
