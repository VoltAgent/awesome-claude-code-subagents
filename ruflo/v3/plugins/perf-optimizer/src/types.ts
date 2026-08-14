/**
 * Performance Optimizer Plugin - Type Definitions
 *
 * Types for bottleneck detection, memory analysis, query optimization,
 * bundle optimization, and configuration tuning.
 */

import { z } from 'zod';

// ============================================================================
// Common Types
// ============================================================================

export interface MCPToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
  category?: string;
  tags?: string[];
  version?: string;
  cacheable?: boolean;
  cacheTTL?: number;
  handler: (input: Record<string, unknown>, context?: ToolContext) => Promise<MCPToolResult>;
}

// ============================================================================
// Tool Context
// ============================================================================

export interface ToolContext {
  sparseBridge?: SparseBridgeInterface;
  fpgaBridge?: FpgaBridgeInterface;
  config?: PerfOptimizerConfig;
  logger?: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Configuration
// ============================================================================

export interface PerfOptimizerConfig {
  bottleneck: {
    latencyThresholdMs: number;
    errorRateThreshold: number;
    cpuThreshold: number;
    memoryThreshold: number;
  };
  memory: {
    leakThresholdMb: number;
    gcPressureThreshold: number;
    maxHeapSize: number;
  };
  query: {
    slowQueryThresholdMs: number;
    maxResultSize: number;
    indexSuggestionEnabled: boolean;
  };
  bundle: {
    maxSizeKb: number;
    treeshakingEnabled: boolean;
    codeSplittingEnabled: boolean;
  };
}

export const DEFAULT_CONFIG: PerfOptimizerConfig = {
  bottleneck: {
    latencyThresholdMs: 100,
    errorRateThreshold: 0.01,
    cpuThreshold: 80,
    memoryThreshold: 85,
  },
  memory: {
    leakThresholdMb: 50,
    gcPressureThreshold: 0.3,
    maxHeapSize: 2048,
  },
  query: {
    slowQueryThresholdMs: 100,
    maxResultSize: 10000,
    indexSuggestionEnabled: true,
  },
  bundle: {
    maxSizeKb: 500,
    treeshakingEnabled: true,
    codeSplittingEnabled: true,
  },
};

// ============================================================================
// Trace Types
// ============================================================================

/**
 * Span from distributed trace
 */
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  duration: number;
  status: 'ok' | 'error' | 'timeout';
  attributes: Record<string, unknown>;
  events?: SpanEvent[];
}

/**
 * Span event
 */
export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

/**
 * Trace data container
 */
export interface TraceData {
  format: 'otlp' | 'chrome_devtools' | 'jaeger' | 'zipkin';
  spans: TraceSpan[];
  metrics?: Record<string, number>;
}

/**
 * Bottleneck detection result
 */
export interface Bottleneck {
  id: string;
  type: BottleneckType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location: string;
  description: string;
  impact: {
    latencyMs: number;
    throughput: number;
    errorRate: number;
  };
  suggestedFix: string;
  relatedSpans: string[];
}

export type BottleneckType =
  | 'cpu'
  | 'memory'
  | 'io'
  | 'network'
  | 'database'
  | 'render'
  | 'lock_contention'
  | 'gc_pressure';

// ============================================================================
// Memory Types
// ============================================================================

/**
 * Heap snapshot summary
 */
export interface HeapSnapshot {
  totalSize: number;
  usedSize: number;
  objects: HeapObject[];
  retainers: RetainerPath[];
}

/**
 * Heap object
 */
export interface HeapObject {
  name: string;
  type: string;
  size: number;
  count: number;
  shallowSize: number;
  retainedSize: number;
}

/**
 * Retainer path for memory leak detection
 */
export interface RetainerPath {
  object: string;
  path: string[];
  retainedSize: number;
  distance: number;
}

/**
 * Memory timeline point
 */
export interface MemoryTimelinePoint {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

/**
 * Memory leak detection result
 */
export interface MemoryLeak {
  id: string;
  type: MemoryLeakType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  object: string;
  retainedSize: number;
  growthRate: number;
  retainerPath: string[];
  suggestedFix: string;
}

export type MemoryLeakType =
  | 'detached_dom'
  | 'closure_leak'
  | 'event_listener'
  | 'timer_leak'
  | 'global_variable'
  | 'cache_unbounded';

// ============================================================================
// Query Types
// ============================================================================

/**
 * Database query info
 */
export interface QueryInfo {
  sql: string;
  duration: number;
  stackTrace?: string;
  resultSize?: number;
  explain?: QueryExplainPlan;
}

/**
 * Query explain plan
 */
export interface QueryExplainPlan {
  type: string;
  table: string;
  rows: number;
  filtered: number;
  extra?: string;
  key?: string;
  possibleKeys?: string[];
}

/**
 * Query pattern detection
 */
export interface QueryPattern {
  id: string;
  type: QueryPatternType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  queries: string[];
  count: number;
  totalDuration: number;
  suggestedFix: string;
  suggestedIndex?: IndexSuggestion;
}

export type QueryPatternType =
  | 'n_plus_1'
  | 'missing_index'
  | 'full_scan'
  | 'large_result'
  | 'slow_join'
  | 'duplicate_query';

/**
 * Index suggestion
 */
export interface IndexSuggestion {
  table: string;
  columns: string[];
  type: 'btree' | 'hash' | 'gin' | 'gist';
  estimatedImprovement: number;
  createStatement: string;
}

// ============================================================================
// Bundle Types
// ============================================================================

/**
 * Bundle stats
 */
export interface BundleStats {
  totalSize: number;
  chunks: BundleChunk[];
  modules: BundleModule[];
  assets: BundleAsset[];
}

/**
 * Bundle chunk
 */
export interface BundleChunk {
  name: string;
  size: number;
  modules: string[];
  initial: boolean;
  entry: boolean;
}

/**
 * Bundle module
 */
export interface BundleModule {
  name: string;
  size: number;
  chunks: string[];
  issuers: string[];
  reasons: string[];
  usedExports?: string[];
  providedExports?: string[];
}

/**
 * Bundle asset
 */
export interface BundleAsset {
  name: string;
  size: number;
  chunks: string[];
}

/**
 * Bundle optimization suggestion
 */
export interface BundleOptimization {
  id: string;
  type: BundleOptimizationType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  target: string;
  currentSize: number;
  potentialSavings: number;
  description: string;
  suggestedFix: string;
}

export type BundleOptimizationType =
  | 'tree_shaking'
  | 'code_splitting'
  | 'duplicate_deps'
  | 'large_modules'
  | 'dynamic_import'
  | 'polyfill_reduction';

// ============================================================================
// Configuration Optimization Types
// ============================================================================

/**
 * Workload profile
 */
export interface WorkloadProfile {
  type: 'web' | 'api' | 'batch' | 'stream' | 'hybrid';
  metrics: {
    requestsPerSecond: number;
    avgResponseTime: number;
    errorRate: number;
    concurrency: number;
  };
  constraints: {
    maxLatency?: number;
    maxMemory?: number;
    maxCpu?: number;
    maxCost?: number;
  };
}

/**
 * Configuration parameter
 */
export interface ConfigParameter {
  name: string;
  type: 'number' | 'boolean' | 'string' | 'enum';
  current: unknown;
  suggested: unknown;
  range?: [number, number];
  options?: string[];
  impact: number;
  confidence: number;
}

/**
 * Configuration optimization result
 */
export interface ConfigOptimization {
  parameters: ConfigParameter[];
  objective: 'latency' | 'throughput' | 'cost' | 'balanced';
  predictedImprovement: {
    latency: number;
    throughput: number;
    cost: number;
  };
  confidence: number;
  warnings: string[];
}

// ============================================================================
// Input Schemas
// ============================================================================

export const BottleneckDetectInputSchema = z.object({
  traceData: z.object({
    format: z.enum(['otlp', 'chrome_devtools', 'jaeger', 'zipkin']),
    spans: z.array(z.unknown()).max(1_000_000),
    metrics: z.record(z.string(), z.unknown()).optional(),
  }),
  analysisScope: z.array(z.enum(['cpu', 'memory', 'io', 'network', 'database', 'render', 'all'])).default(['all']),
  threshold: z.object({
    latencyP95: z.number().min(0).max(86400000).optional(),
    throughput: z.number().min(0).optional(),
    errorRate: z.number().min(0).max(1).optional(),
  }).optional(),
});

export type BottleneckDetectInput = z.infer<typeof BottleneckDetectInputSchema>;

export const MemoryAnalyzeInputSchema = z.object({
  heapSnapshot: z.string().max(500).optional(),
  timeline: z.array(z.unknown()).max(100000).optional(),
  analysis: z.array(z.enum([
    'leak_detection',
    'retention_analysis',
    'allocation_hotspots',
    'gc_pressure',
  ])).optional(),
  compareBaseline: z.string().max(500).optional(),
});

export type MemoryAnalyzeInput = z.infer<typeof MemoryAnalyzeInputSchema>;

export const QueryOptimizeInputSchema = z.object({
  queries: z.array(z.object({
    sql: z.string().max(10000),
    duration: z.number().min(0).max(86400000),
    stackTrace: z.string().max(50000).optional(),
    resultSize: z.number().int().min(0).optional(),
  })).min(1).max(10000),
  patterns: z.array(z.enum(['n_plus_1', 'missing_index', 'full_scan', 'large_result', 'slow_join'])).optional(),
  suggestIndexes: z.boolean().default(true),
});

export type QueryOptimizeInput = z.infer<typeof QueryOptimizeInputSchema>;

export const BundleOptimizeInputSchema = z.object({
  bundleStats: z.string().max(500),
  analysis: z.array(z.enum([
    'tree_shaking',
    'code_splitting',
    'duplicate_deps',
    'large_modules',
    'dynamic_import',
  ])).optional(),
  targets: z.object({
    maxSize: z.number().min(0).optional(),
    maxChunks: z.number().int().min(1).optional(),
  }).optional(),
});

export type BundleOptimizeInput = z.infer<typeof BundleOptimizeInputSchema>;

export const ConfigOptimizeInputSchema = z.object({
  workloadProfile: z.object({
    type: z.enum(['web', 'api', 'batch', 'stream', 'hybrid']),
    metrics: z.object({
      requestsPerSecond: z.number().min(0).optional(),
      avgResponseTime: z.number().min(0).optional(),
      errorRate: z.number().min(0).max(1).optional(),
      concurrency: z.number().int().min(1).optional(),
    }).optional(),
    constraints: z.object({
      maxLatency: z.number().min(0).optional(),
      maxMemory: z.number().min(0).optional(),
      maxCpu: z.number().min(0).max(100).optional(),
      maxCost: z.number().min(0).optional(),
    }).optional(),
  }),
  configSpace: z.record(z.string(), z.object({
    type: z.string(),
    range: z.array(z.unknown()).optional(),
    current: z.unknown(),
  })),
  objective: z.enum(['latency', 'throughput', 'cost', 'balanced']),
});

export type ConfigOptimizeInput = z.infer<typeof ConfigOptimizeInputSchema>;

// ============================================================================
// Output Types
// ============================================================================

export interface BottleneckDetectOutput {
  bottlenecks: Bottleneck[];
  criticalPath: string[];
  overallScore: number;
  details: {
    spanCount: number;
    analysisScope: string[];
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    errorRate: number;
    interpretation: string;
  };
}

export interface MemoryAnalyzeOutput {
  leaks: MemoryLeak[];
  hotspots: HeapObject[];
  gcPressure: number;
  details: {
    heapUsed: number;
    heapTotal: number;
    objectCount: number;
    analysisType: string[];
    interpretation: string;
  };
}

export interface QueryOptimizeOutput {
  patterns: QueryPattern[];
  optimizations: IndexSuggestion[];
  totalQueries: number;
  details: {
    slowQueries: number;
    nPlusOneCount: number;
    missingIndexCount: number;
    estimatedImprovement: number;
    interpretation: string;
  };
}

export interface BundleOptimizeOutput {
  optimizations: BundleOptimization[];
  totalSize: number;
  potentialSavings: number;
  details: {
    chunkCount: number;
    moduleCount: number;
    duplicateDeps: string[];
    largestModules: string[];
    interpretation: string;
  };
}

export interface ConfigOptimizeOutput {
  recommendations: ConfigParameter[];
  objective: string;
  predictedImprovement: {
    latency: number;
    throughput: number;
    cost: number;
  };
  details: {
    parametersAnalyzed: number;
    optimizationsFound: number;
    confidence: number;
    warnings: string[];
    interpretation: string;
  };
}

// ============================================================================
// Bridge Interfaces
// ============================================================================

export interface SparseBridgeInterface {
  readonly name: string;
  readonly version: string;
  init(): Promise<void>;
  destroy(): Promise<void>;
  isReady(): boolean;

  // Sparse inference for trace analysis
  encodeTraces(spans: TraceSpan[]): Promise<Float32Array>;
  detectAnomalies(encoded: Float32Array, threshold: number): Promise<number[]>;
  analyzeCriticalPath(encoded: Float32Array): Promise<string[]>;
}

export interface FpgaBridgeInterface {
  readonly name: string;
  readonly version: string;
  init(): Promise<void>;
  destroy(): Promise<void>;
  isReady(): boolean;

  // FPGA transformer for optimization
  optimizeConfig(workload: WorkloadProfile, configSpace: Record<string, unknown>): Promise<ConfigOptimization>;
  predictPerformance(config: Record<string, unknown>, workload: WorkloadProfile): Promise<number>;
  searchOptimalConfig(objective: string, constraints: Record<string, number>): Promise<Record<string, unknown>>;
}

// ============================================================================
// Error Codes
// ============================================================================

export const PerfOptimizerErrorCodes = {
  BRIDGE_NOT_INITIALIZED: 'PO_BRIDGE_NOT_INITIALIZED',
  INVALID_INPUT: 'PO_INVALID_INPUT',
  TRACE_PARSE_ERROR: 'PO_TRACE_PARSE_ERROR',
  ANALYSIS_FAILED: 'PO_ANALYSIS_FAILED',
  TIMEOUT: 'PO_TIMEOUT',
  RATE_LIMITED: 'PO_RATE_LIMITED',
} as const;

export type PerfOptimizerErrorCode =
  (typeof PerfOptimizerErrorCodes)[keyof typeof PerfOptimizerErrorCodes];

// ============================================================================
// Helper Functions
// ============================================================================

export function successResult(data: unknown): MCPToolResult {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(data, null, 2),
    }],
  };
}

export function errorResult(error: Error | string): MCPToolResult {
  const message = error instanceof Error ? error.message : error;
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: true,
        message,
        timestamp: new Date().toISOString(),
      }, null, 2),
    }],
    isError: true,
  };
}
