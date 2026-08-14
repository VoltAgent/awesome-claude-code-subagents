/**
 * Test Intelligence Plugin - Type Definitions
 *
 * Types for predictive test selection, flaky detection, coverage analysis,
 * mutation testing optimization, and test generation.
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
  learningBridge?: LearningBridgeInterface;
  sonaBridge?: SonaBridgeInterface;
  config?: TestIntelligenceConfig;
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

export interface TestIntelligenceConfig {
  selection: {
    defaultStrategy: 'fast_feedback' | 'high_coverage' | 'risk_based' | 'balanced';
    defaultConfidence: number;
    maxTests: number;
  };
  flaky: {
    historyDepth: number;
    threshold: number;
    quarantineEnabled: boolean;
  };
  coverage: {
    minCoverage: number;
    prioritization: 'risk' | 'complexity' | 'churn' | 'recency';
  };
  mutation: {
    defaultBudget: number;
    strategy: 'random' | 'coverage_guided' | 'ml_guided' | 'historical';
  };
}

export const DEFAULT_CONFIG: TestIntelligenceConfig = {
  selection: {
    defaultStrategy: 'balanced',
    defaultConfidence: 0.95,
    maxTests: 10000,
  },
  flaky: {
    historyDepth: 100,
    threshold: 0.1,
    quarantineEnabled: true,
  },
  coverage: {
    minCoverage: 80,
    prioritization: 'risk',
  },
  mutation: {
    defaultBudget: 1000,
    strategy: 'ml_guided',
  },
};

// ============================================================================
// Test Execution Types
// ============================================================================

/**
 * Test result from a single test execution
 */
export interface TestResult {
  testId: string;
  testName: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  duration: number;
  timestamp: number;
  error?: string;
  stackTrace?: string;
  retries?: number;
}

/**
 * Test history entry for learning
 */
export interface TestHistoryEntry {
  testId: string;
  results: TestResult[];
  failureRate: number;
  avgDuration: number;
  lastModified: number;
  affectedFiles: string[];
}

/**
 * Test execution pattern for RL
 */
export interface TestExecutionPattern {
  embedding: Float32Array;
  successRate: number;
  avgDuration: number;
  codeChanges: string[];
  selectedTests: string[];
  actualFailures: string[];
}

// ============================================================================
// Code Change Types
// ============================================================================

/**
 * Code change information
 */
export interface CodeChange {
  file: string;
  type: 'added' | 'modified' | 'deleted';
  linesAdded: number;
  linesRemoved: number;
  hunks?: CodeHunk[];
}

/**
 * Code hunk from diff
 */
export interface CodeHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

// ============================================================================
// Test Selection Types
// ============================================================================

export const SelectPredictiveInputSchema = z.object({
  changes: z.object({
    files: z.array(z.string().max(500)).max(1000).optional(),
    gitDiff: z.string().max(1_000_000).optional(),
    gitRef: z.string().max(100).optional(),
  }),
  strategy: z.enum(['fast_feedback', 'high_coverage', 'risk_based', 'balanced']).default('balanced'),
  budget: z.object({
    maxTests: z.number().int().min(1).max(100000).optional(),
    maxDuration: z.number().min(1).max(86400).optional(),
    confidence: z.number().min(0.5).max(1.0).default(0.95),
  }).optional(),
});

export type SelectPredictiveInput = z.infer<typeof SelectPredictiveInputSchema>;

export interface SelectPredictiveOutput {
  selectedTests: SelectedTest[];
  totalTests: number;
  estimatedDuration: number;
  confidence: number;
  strategy: string;
  details: {
    filesAnalyzed: number;
    testsSkipped: number;
    coverageEstimate: number;
    riskScore: number;
    interpretation: string;
  };
}

export interface SelectedTest {
  testId: string;
  testName: string;
  suite: string;
  priority: number;
  reason: string;
  estimatedDuration: number;
  failureProbability: number;
}

// ============================================================================
// Flaky Detection Types
// ============================================================================

export const FlakyDetectInputSchema = z.object({
  scope: z.object({
    testSuite: z.string().max(500).optional(),
    historyDepth: z.number().int().min(10).max(10000).default(100),
  }).optional(),
  analysis: z.array(z.enum([
    'intermittent_failures',
    'timing_sensitive',
    'order_dependent',
    'resource_contention',
    'environment_sensitive',
  ])).optional(),
  threshold: z.number().min(0.01).max(0.5).default(0.1),
});

export type FlakyDetectInput = z.infer<typeof FlakyDetectInputSchema>;

export interface FlakyDetectOutput {
  flakyTests: FlakyTest[];
  totalAnalyzed: number;
  flakinessScore: number;
  details: {
    intermittentCount: number;
    timingSensitiveCount: number;
    orderDependentCount: number;
    resourceContentionCount: number;
    environmentSensitiveCount: number;
    recommendations: string[];
  };
}

export interface FlakyTest {
  testId: string;
  testName: string;
  suite: string;
  flakinessScore: number;
  flakinessType: FlakinessType[];
  failurePattern: string;
  lastFlaky: number;
  suggestedFix: string;
}

export type FlakinessType =
  | 'intermittent_failures'
  | 'timing_sensitive'
  | 'order_dependent'
  | 'resource_contention'
  | 'environment_sensitive';

// ============================================================================
// Coverage Gap Types
// ============================================================================

export const CoverageGapsInputSchema = z.object({
  targetPaths: z.array(z.string().max(500)).max(100).optional(),
  coverageType: z.enum(['line', 'branch', 'function', 'semantic']).default('semantic'),
  prioritization: z.enum(['risk', 'complexity', 'churn', 'recency']).default('risk'),
  minCoverage: z.number().min(0).max(100).default(80),
});

export type CoverageGapsInput = z.infer<typeof CoverageGapsInputSchema>;

export interface CoverageGapsOutput {
  gaps: CoverageGap[];
  overallCoverage: number;
  targetCoverage: number;
  details: {
    filesAnalyzed: number;
    uncoveredLines: number;
    uncoveredBranches: number;
    uncoveredFunctions: number;
    priorityDistribution: Record<string, number>;
    interpretation: string;
  };
}

export interface CoverageGap {
  file: string;
  uncoveredLines: number[];
  uncoveredBranches: number[];
  uncoveredFunctions: string[];
  coverage: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  riskScore: number;
  complexity: number;
  churnScore: number;
  suggestedTests: string[];
}

// ============================================================================
// Mutation Testing Types
// ============================================================================

export const MutationOptimizeInputSchema = z.object({
  targetPath: z.string().max(500),
  budget: z.number().int().min(1).max(10000).optional(),
  strategy: z.enum(['random', 'coverage_guided', 'ml_guided', 'historical']).default('ml_guided'),
  mutationTypes: z.array(z.enum([
    'arithmetic',
    'logical',
    'boundary',
    'null_check',
    'return_value',
  ])).optional(),
});

export type MutationOptimizeInput = z.infer<typeof MutationOptimizeInputSchema>;

export interface MutationOptimizeOutput {
  mutations: OptimizedMutation[];
  mutationScore: number;
  survivingMutants: number;
  killedMutants: number;
  details: {
    totalMutations: number;
    budgetUsed: number;
    timeEstimate: number;
    coverageImprovement: number;
    weakTests: string[];
    interpretation: string;
  };
}

export interface OptimizedMutation {
  id: string;
  file: string;
  line: number;
  type: MutationType;
  original: string;
  mutated: string;
  status: 'killed' | 'survived' | 'pending' | 'timeout';
  killingTests: string[];
  priority: number;
}

export type MutationType =
  | 'arithmetic'
  | 'logical'
  | 'boundary'
  | 'null_check'
  | 'return_value';

// ============================================================================
// Test Generation Types
// ============================================================================

export const GenerateSuggestInputSchema = z.object({
  targetFunction: z.string().max(500),
  testStyle: z.enum(['unit', 'integration', 'property_based', 'snapshot']).default('unit'),
  framework: z.enum(['jest', 'vitest', 'pytest', 'junit', 'mocha']).default('vitest'),
  edgeCases: z.boolean().default(true),
  mockStrategy: z.enum(['minimal', 'full', 'none']).optional(),
});

export type GenerateSuggestInput = z.infer<typeof GenerateSuggestInputSchema>;

export interface GenerateSuggestOutput {
  suggestions: TestSuggestion[];
  coverage: {
    statements: number;
    branches: number;
    functions: number;
  };
  details: {
    functionComplexity: number;
    parametersAnalyzed: number;
    edgeCasesFound: number;
    mockObjectsNeeded: string[];
    interpretation: string;
  };
}

export interface TestSuggestion {
  name: string;
  description: string;
  category: 'happy_path' | 'edge_case' | 'error_handling' | 'boundary' | 'integration';
  code: string;
  priority: number;
  coverageGain: number;
  dependencies: string[];
}

// ============================================================================
// Bridge Interfaces
// ============================================================================

export interface LearningBridgeInterface {
  readonly name: string;
  readonly version: string;
  init(): Promise<void>;
  destroy(): Promise<void>;
  isReady(): boolean;

  // RL operations for test selection
  trainOnHistory(history: TestHistoryEntry[], config?: LearningConfig): Promise<number>;
  predictFailingTests(changes: CodeChange[], topK: number): Promise<PredictedTest[]>;
  updatePolicyWithFeedback(feedback: TestFeedback): Promise<void>;
}

export interface SonaBridgeInterface {
  readonly name: string;
  readonly version: string;
  init(): Promise<void>;
  destroy(): Promise<void>;
  isReady(): boolean;

  // Pattern learning for test intelligence
  learnPatterns(patterns: TestExecutionPattern[]): Promise<number>;
  findSimilarPatterns(query: Float32Array, k: number): Promise<TestExecutionPattern[]>;
  storePattern(pattern: TestExecutionPattern): Promise<void>;
}

export interface LearningConfig {
  algorithm: 'q-learning' | 'ppo' | 'decision-transformer';
  learningRate: number;
  gamma: number;
  batchSize: number;
}

export interface PredictedTest {
  testId: string;
  failureProbability: number;
  confidence: number;
  reason: string;
}

export interface TestFeedback {
  predictions: PredictedTest[];
  actualResults: TestResult[];
  reward: number;
}

// ============================================================================
// Error Codes
// ============================================================================

export const TestIntelligenceErrorCodes = {
  BRIDGE_NOT_INITIALIZED: 'TI_BRIDGE_NOT_INITIALIZED',
  INVALID_INPUT: 'TI_INVALID_INPUT',
  NO_TEST_HISTORY: 'TI_NO_TEST_HISTORY',
  ANALYSIS_FAILED: 'TI_ANALYSIS_FAILED',
  TIMEOUT: 'TI_TIMEOUT',
  RATE_LIMITED: 'TI_RATE_LIMITED',
} as const;

export type TestIntelligenceErrorCode =
  (typeof TestIntelligenceErrorCodes)[keyof typeof TestIntelligenceErrorCodes];

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
