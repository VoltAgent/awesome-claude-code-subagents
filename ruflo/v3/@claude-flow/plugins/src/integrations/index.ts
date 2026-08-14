/**
 * Integrations Module
 *
 * Provides integration bridges for external systems:
 * - agentic-flow@alpha for swarm coordination
 * - AgentDB for vector storage and similarity search
 * - RuVector PostgreSQL Bridge for advanced vector operations
 */

export {
  // Agentic Flow
  AgenticFlowBridge,
  getAgenticFlowBridge,
  AGENTIC_FLOW_EVENTS,
  type AgenticFlowConfig,
  type SwarmTopology,
  type AgentSpawnOptions,
  type SpawnedAgent,
  type TaskOrchestrationOptions,
  type OrchestrationResult,
  type AgenticFlowEvent,

  // AgentDB
  AgentDBBridge,
  getAgentDBBridge,
  resetBridges,
  type AgentDBConfig,
  type VectorEntry,
  type VectorSearchOptions,
  type VectorSearchResult,
} from './agentic-flow.js';

// RuVector PostgreSQL Bridge
export * as RuVectorTypes from './ruvector/index.js';
export {
  // Main Bridge Plugin
  RuVectorBridge,
  createRuVectorBridge,

  // Type Guards
  isDistanceMetric,
  isAttentionMechanism,
  isGNNLayerType,
  isHyperbolicModel,
  isVectorIndexType,
  isSuccess,
  isError,

  // Namespace
  RuVector,

  // Attention Mechanisms
  AttentionRegistry,
  AttentionFactory,
  AttentionExecutor,
  createDefaultRegistry,

  // GNN Layers
  GNNLayerRegistry,
  GraphOperations,
  createGNNLayer,
  createGNNLayerRegistry,
  createGraphOperations,

  // Hyperbolic Embeddings
  HyperbolicSpace,
  HyperbolicSQL,
  HyperbolicBatchProcessor,
  createHyperbolicSpace,

  // Self-Learning
  QueryOptimizer,
  IndexTuner,
  PatternRecognizer,
  LearningLoop,
  createSelfLearningSystem,
} from './ruvector/index.js';

// Re-export common RuVector types for convenience
export type {
  RuVectorConfig,
  VectorSearchOptions as RuVectorSearchOptions,
  VectorSearchResult as RuVectorSearchResult,
  AttentionMechanism,
  GNNLayerType,
  HyperbolicModel,
  IRuVectorClient,
} from './ruvector/index.js';
