/**
 * Cognitive Kernel Plugin - Type Definitions
 *
 * Types for cognitive augmentation including working memory, attention control,
 * meta-cognition, scaffolding, and cognitive load management.
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
  cognitiveBridge?: CognitiveBridgeInterface;
  sonaBridge?: SonaBridgeInterface;
  config?: CognitiveKernelConfig;
  logger?: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Working Memory Types
// ============================================================================

export const WorkingMemoryActionSchema = z.enum([
  'allocate',
  'update',
  'retrieve',
  'clear',
  'consolidate',
]);

export type WorkingMemoryAction = z.infer<typeof WorkingMemoryActionSchema>;

export const ConsolidationTargetSchema = z.enum([
  'episodic',
  'semantic',
  'procedural',
]);

export type ConsolidationTarget = z.infer<typeof ConsolidationTargetSchema>;

export const MemorySlotSchema = z.object({
  id: z.string().max(100).optional(),
  content: z.unknown().optional(),
  priority: z.number().min(0).max(1).default(0.5),
  decay: z.number().min(0).max(1).default(0.1),
});

export type MemorySlot = z.infer<typeof MemorySlotSchema>;

export const WorkingMemoryInputSchema = z.object({
  action: WorkingMemoryActionSchema.describe('Memory action to perform'),
  slot: MemorySlotSchema.optional().describe('Memory slot data'),
  capacity: z.number().int().min(1).max(20).default(7)
    .describe('Working memory capacity (Miller number)'),
  consolidationTarget: ConsolidationTargetSchema.optional()
    .describe('Target memory system for consolidation'),
});

export type WorkingMemoryInput = z.infer<typeof WorkingMemoryInputSchema>;

export interface WorkingMemorySlot {
  id: string;
  content: unknown;
  priority: number;
  decay: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

export interface WorkingMemoryState {
  slots: WorkingMemorySlot[];
  capacity: number;
  utilization: number;
  avgPriority: number;
}

export interface WorkingMemoryOutput {
  action: WorkingMemoryAction;
  success: boolean;
  state: {
    slotsUsed: number;
    capacity: number;
    utilization: number;
  };
  details: {
    slotId?: string;
    content?: unknown;
    avgPriority: number;
    interpretation: string;
  };
}

// ============================================================================
// Attention Control Types
// ============================================================================

export const AttentionModeSchema = z.enum([
  'focus',
  'diffuse',
  'selective',
  'divided',
  'sustained',
]);

export type AttentionMode = z.infer<typeof AttentionModeSchema>;

export const AttentionTargetSchema = z.object({
  entity: z.string().max(500),
  weight: z.number().min(0).max(1),
  duration: z.number().min(0).max(3600),
});

export type AttentionTarget = z.infer<typeof AttentionTargetSchema>;

export const AttentionFiltersSchema = z.object({
  includePatterns: z.array(z.string().max(200)).max(50).optional(),
  excludePatterns: z.array(z.string().max(200)).max(50).optional(),
  noveltyBias: z.number().min(0).max(1).default(0.5),
});

export type AttentionFilters = z.infer<typeof AttentionFiltersSchema>;

export const AttentionControlInputSchema = z.object({
  mode: AttentionModeSchema.describe('Attention mode'),
  targets: z.array(AttentionTargetSchema).max(50).optional()
    .describe('Attention targets with weights'),
  filters: AttentionFiltersSchema.optional()
    .describe('Attention filters'),
});

export type AttentionControlInput = z.infer<typeof AttentionControlInputSchema>;

export interface AttentionState {
  mode: AttentionMode;
  focus: string[];
  breadth: number;
  intensity: number;
  filters: AttentionFilters;
  distractors: string[];
}

export interface AttentionControlOutput {
  mode: AttentionMode;
  state: {
    focus: string[];
    breadth: number;
    intensity: number;
  };
  details: {
    targetsActive: number;
    filterPatterns: number;
    interpretation: string;
  };
}

// ============================================================================
// Meta-Cognition Types
// ============================================================================

export const MonitoringTypeSchema = z.enum([
  'confidence_calibration',
  'reasoning_coherence',
  'goal_tracking',
  'cognitive_load',
  'error_detection',
  'uncertainty_estimation',
]);

export type MonitoringType = z.infer<typeof MonitoringTypeSchema>;

export const ReflectionTriggerSchema = z.enum([
  'periodic',
  'on_error',
  'on_uncertainty',
]);

export type ReflectionTrigger = z.infer<typeof ReflectionTriggerSchema>;

export const ReflectionDepthSchema = z.enum([
  'shallow',
  'medium',
  'deep',
]);

export type ReflectionDepth = z.infer<typeof ReflectionDepthSchema>;

export const ReflectionSchema = z.object({
  trigger: ReflectionTriggerSchema.optional(),
  depth: ReflectionDepthSchema.optional(),
});

export type Reflection = z.infer<typeof ReflectionSchema>;

export const MetaMonitorInputSchema = z.object({
  monitoring: z.array(MonitoringTypeSchema).optional()
    .describe('Types of monitoring to perform'),
  reflection: ReflectionSchema.optional()
    .describe('Reflection configuration'),
  interventions: z.boolean().default(true)
    .describe('Allow automatic corrective interventions'),
});

export type MetaMonitorInput = z.infer<typeof MetaMonitorInputSchema>;

export interface MetaCognitiveAssessment {
  confidence: number;
  uncertainty: number;
  coherence: number;
  cognitiveLoad: number;
  errorsDetected: number;
  knowledgeGaps: string[];
  suggestedStrategies: string[];
}

export interface MetaMonitorOutput {
  assessment: {
    confidence: number;
    uncertainty: number;
    coherence: number;
    cognitiveLoad: number;
  };
  interventions: string[];
  details: {
    monitoringTypes: MonitoringType[];
    reflectionDepth: ReflectionDepth | null;
    errorsDetected: number;
    interpretation: string;
  };
}

// ============================================================================
// Scaffolding Types
// ============================================================================

export const TaskComplexitySchema = z.enum([
  'simple',
  'moderate',
  'complex',
  'expert',
]);

export type TaskComplexity = z.infer<typeof TaskComplexitySchema>;

export const ScaffoldTypeSchema = z.enum([
  'decomposition',
  'analogy',
  'worked_example',
  'socratic',
  'metacognitive_prompting',
  'chain_of_thought',
]);

export type ScaffoldType = z.infer<typeof ScaffoldTypeSchema>;

export const TaskSchema = z.object({
  description: z.string().max(5000),
  complexity: TaskComplexitySchema,
  domain: z.string().max(200).optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const AdaptivitySchema = z.object({
  fading: z.boolean().default(true),
  monitoring: z.boolean().default(true),
});

export type Adaptivity = z.infer<typeof AdaptivitySchema>;

export const ScaffoldInputSchema = z.object({
  task: TaskSchema.describe('Task to scaffold'),
  scaffoldType: ScaffoldTypeSchema.describe('Type of scaffolding'),
  adaptivity: AdaptivitySchema.optional()
    .describe('Adaptivity settings'),
});

export type ScaffoldInput = z.infer<typeof ScaffoldInputSchema>;

export interface ScaffoldStep {
  step: number;
  instruction: string;
  hints: string[];
  checkpoints: string[];
}

export interface ScaffoldOutput {
  scaffoldType: ScaffoldType;
  steps: ScaffoldStep[];
  details: {
    taskComplexity: TaskComplexity;
    stepCount: number;
    fadingEnabled: boolean;
    interpretation: string;
  };
}

// ============================================================================
// Cognitive Load Types
// ============================================================================

export const LoadOptimizationSchema = z.enum([
  'reduce_extraneous',
  'chunk_intrinsic',
  'maximize_germane',
  'balanced',
]);

export type LoadOptimization = z.infer<typeof LoadOptimizationSchema>;

export const LoadAssessmentSchema = z.object({
  intrinsic: z.number().min(0).max(1).optional()
    .describe('Task complexity load'),
  extraneous: z.number().min(0).max(1).optional()
    .describe('Presentation complexity load'),
  germane: z.number().min(0).max(1).optional()
    .describe('Learning investment load'),
});

export type LoadAssessment = z.infer<typeof LoadAssessmentSchema>;

export const CognitiveLoadInputSchema = z.object({
  assessment: LoadAssessmentSchema.optional()
    .describe('Current load assessment'),
  optimization: LoadOptimizationSchema.default('balanced')
    .describe('Optimization strategy'),
  threshold: z.number().min(0).max(1).default(0.8)
    .describe('Maximum total load threshold'),
});

export type CognitiveLoadInput = z.infer<typeof CognitiveLoadInputSchema>;

export interface CognitiveLoadState {
  intrinsic: number;
  extraneous: number;
  germane: number;
  total: number;
  overloaded: boolean;
}

export interface CognitiveLoadOutput {
  currentLoad: {
    intrinsic: number;
    extraneous: number;
    germane: number;
    total: number;
  };
  overloaded: boolean;
  recommendations: string[];
  details: {
    optimization: LoadOptimization;
    threshold: number;
    interpretation: string;
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface CognitiveKernelConfig {
  workingMemory: {
    defaultCapacity: number;
    decayRate: number;
    consolidationInterval: number;
  };
  attention: {
    defaultMode: AttentionMode;
    sustainedDuration: number;
    noveltyBias: number;
  };
  metaCognition: {
    reflectionInterval: number;
    confidenceThreshold: number;
    interventionEnabled: boolean;
  };
  scaffolding: {
    fadingRate: number;
    adaptationEnabled: boolean;
  };
  cognitiveLoad: {
    maxLoad: number;
    warningThreshold: number;
  };
}

export const DEFAULT_CONFIG: CognitiveKernelConfig = {
  workingMemory: {
    defaultCapacity: 7,
    decayRate: 0.1,
    consolidationInterval: 60000,
  },
  attention: {
    defaultMode: 'focus',
    sustainedDuration: 300,
    noveltyBias: 0.5,
  },
  metaCognition: {
    reflectionInterval: 30000,
    confidenceThreshold: 0.7,
    interventionEnabled: true,
  },
  scaffolding: {
    fadingRate: 0.1,
    adaptationEnabled: true,
  },
  cognitiveLoad: {
    maxLoad: 0.8,
    warningThreshold: 0.6,
  },
};

// ============================================================================
// Bridge Interfaces
// ============================================================================

export interface CognitiveItem {
  id: string;
  content: Float32Array;
  salience: number;
  decay: number;
  associations: string[];
  metadata?: Record<string, unknown>;
}

export interface CognitiveBridgeInterface {
  initialized: boolean;
  store(item: CognitiveItem): boolean;
  retrieve(id: string): CognitiveItem | null;
  search(query: Float32Array, k: number): CognitiveItem[];
  decay(deltaTime: number): void;
  consolidate(): void;
  focus(ids: string[]): { focus: string[]; breadth: number; intensity: number };
  assess(): MetaCognitiveAssessment;
  scaffold(task: string, difficulty: number): string[];
}

export interface SonaPattern {
  id: string;
  embedding: Float32Array;
  successRate: number;
  usageCount: number;
  domain: string;
}

export interface SonaBridgeInterface {
  initialized: boolean;
  learn(trajectories: unknown[], config: unknown): number;
  predict(state: Float32Array): { action: string; confidence: number };
  storePattern(pattern: SonaPattern): void;
  findPatterns(query: Float32Array, k: number): SonaPattern[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a successful MCP tool result
 */
export function successResult(data: unknown): MCPToolResult {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(data, null, 2),
    }],
  };
}

/**
 * Create an error MCP tool result
 */
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

/**
 * Calculate cognitive load from components
 */
export function calculateTotalLoad(
  intrinsic: number,
  extraneous: number,
  germane: number
): number {
  // Cognitive load theory: total = intrinsic + extraneous + germane
  // But they compete for limited resources
  return Math.min(1, (intrinsic + extraneous + germane) / 2);
}

/**
 * Generate scaffolding steps based on complexity
 */
export function generateScaffoldSteps(
  complexity: TaskComplexity,
  scaffoldType: ScaffoldType
): number {
  const complexityMultiplier: Record<TaskComplexity, number> = {
    simple: 2,
    moderate: 4,
    complex: 6,
    expert: 8,
  };

  return complexityMultiplier[complexity];
}
