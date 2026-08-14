/**
 * RuVector PostgreSQL Bridge - Attention Executor and Factory
 *
 * Provides execution layer and factory for attention mechanisms.
 *
 * @module @claude-flow/plugins/integrations/ruvector/attention-executor
 */

import type {
  AttentionMechanism,
  AttentionConfig,
  AttentionInput,
  AttentionOutput,
  AttentionStats,
} from './types.js';

import {
  AttentionRegistry,
  type IAttentionMechanism,
  type AttentionOptions,
  type AttentionCategory,
  MultiHeadAttention,
  SelfAttention,
  CrossAttention,
  CausalAttention,
  BidirectionalAttention,
  LocalAttention,
  GlobalAttention,
  FlashAttention,
  FlashAttentionV2,
  MemoryEfficientAttention,
  ChunkAttention,
  SlidingWindowAttention,
  DilatedAttention,
} from './attention.js';

import {
  SparseAttention,
  BlockSparseAttention,
  LinearAttention,
  PerformerAttention,
  LinformerAttention,
  ReformerAttention,
  RelativePositionAttention,
  RotaryPositionAttention,
  ALiBiAttention,
  AxialAttention,
} from './attention-mechanisms.js';

import {
  GraphAttention,
  HyperbolicAttention,
  SphericalAttention,
  ToroidalAttention,
  TemporalAttention,
  RecurrentAttention,
  StateSpaceAttention,
  CrossModalAttention,
  PerceiverAttention,
  FlamingoAttention,
  RetrievalAttention,
  KNNAttention,
  MemoryAugmentedAttention,
  SynthesizerAttention,
  RoutingAttention,
  MixtureOfExpertsAttention,
} from './attention-advanced.js';

// ============================================================================
// Attention Executor
// ============================================================================

/**
 * Options for attention execution.
 */
export interface ExecutionOptions {
  /** Whether to generate SQL only (dry run) */
  dryRun?: boolean;
  /** Whether to collect statistics */
  collectStats?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to cache results */
  cacheResults?: boolean;
  /** Cache key prefix */
  cacheKeyPrefix?: string;
}

/**
 * Result from attention execution.
 */
export interface ExecutionResult {
  /** Output vectors */
  output: number[][];
  /** Attention weights (if requested) */
  attentionWeights?: number[][][][];
  /** Generated SQL query */
  sql?: string;
  /** Execution statistics */
  stats?: AttentionStats;
}

/**
 * Executes attention operations via PostgreSQL RuVector functions.
 */
export class AttentionExecutor {
  private registry: AttentionRegistry;
  private defaultOptions: ExecutionOptions;
  private queryExecutor: ((sql: string) => Promise<unknown>) | null = null;

  constructor(registry?: AttentionRegistry, options?: ExecutionOptions) {
    this.registry = registry ?? createDefaultRegistry();
    this.defaultOptions = {
      dryRun: false,
      collectStats: true,
      timeoutMs: 30000,
      cacheResults: false,
      ...options,
    };
  }

  /**
   * Set the query executor for database operations.
   */
  setQueryExecutor(executor: (sql: string) => Promise<unknown>): void {
    this.queryExecutor = executor;
  }

  /**
   * Execute attention operation.
   */
  async execute(
    mechanism: AttentionMechanism,
    input: AttentionInput,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const opts = { ...this.defaultOptions, ...options };
    const impl = this.registry.get(mechanism);
    const startTime = Date.now();

    // Generate SQL
    const sql = impl.toSQL(input);

    if (opts.dryRun) {
      return {
        output: [],
        sql,
        stats: this.createStats(startTime, input, true),
      };
    }

    // Execute via database or local computation
    let output: number[][];

    if (this.queryExecutor) {
      // Execute via PostgreSQL
      const result = await this.executeSQL(sql, opts.timeoutMs);
      output = this.parseResult(result);
    } else {
      // Local computation fallback
      output = await impl.computeBatch(
        input.query as number[][],
        input.key as number[][],
        input.value as number[][]
      );
    }

    return {
      output,
      sql,
      stats: opts.collectStats ? this.createStats(startTime, input, false) : undefined,
    };
  }

  /**
   * Execute batch of attention operations.
   */
  async executeBatch(
    mechanism: AttentionMechanism,
    inputs: AttentionInput[],
    options?: ExecutionOptions
  ): Promise<ExecutionResult[]> {
    return Promise.all(inputs.map(input => this.execute(mechanism, input, options)));
  }

  /**
   * Execute with multiple mechanisms and combine results.
   */
  async executeMultiple(
    mechanisms: AttentionMechanism[],
    input: AttentionInput,
    combineMethod: 'average' | 'concat' | 'weighted' = 'average',
    weights?: number[],
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const results = await Promise.all(
      mechanisms.map(m => this.execute(m, input, options))
    );

    const outputs = results.map(r => r.output);

    let combinedOutput: number[][];
    switch (combineMethod) {
      case 'concat':
        combinedOutput = outputs[0].map((_, i) =>
          outputs.flatMap(o => o[i])
        );
        break;
      case 'weighted':
        const w = weights ?? mechanisms.map(() => 1 / mechanisms.length);
        combinedOutput = outputs[0].map((_, i) =>
          outputs[0][i].map((_, j) =>
            outputs.reduce((sum, o, k) => sum + w[k] * o[i][j], 0)
          )
        );
        break;
      case 'average':
      default:
        combinedOutput = outputs[0].map((_, i) =>
          outputs[0][i].map((_, j) =>
            outputs.reduce((sum, o) => sum + o[i][j], 0) / outputs.length
          )
        );
    }

    return {
      output: combinedOutput,
      sql: results.map(r => r.sql).join(';\n'),
      stats: results[0].stats,
    };
  }

  /**
   * Generate SQL without execution.
   */
  generateSQL(mechanism: AttentionMechanism, input: AttentionInput): string {
    return this.registry.get(mechanism).toSQL(input);
  }

  /**
   * Generate batch SQL.
   */
  generateBatchSQL(mechanism: AttentionMechanism, inputs: AttentionInput[]): string {
    const sqls = inputs.map(input => this.generateSQL(mechanism, input));
    return `WITH batch_attention AS (\n  ${sqls.join(',\n  ')}\n)\nSELECT * FROM batch_attention;`;
  }

  private async executeSQL(sql: string, timeoutMs?: number): Promise<unknown> {
    if (!this.queryExecutor) {
      throw new Error('No query executor configured');
    }

    if (timeoutMs) {
      return Promise.race([
        this.queryExecutor(sql),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
        ),
      ]);
    }

    return this.queryExecutor(sql);
  }

  private parseResult(result: unknown): number[][] {
    if (Array.isArray(result)) {
      return result.map(row => {
        if (Array.isArray(row)) return row;
        if (typeof row === 'object' && row !== null) {
          const values = Object.values(row);
          if (values.length === 1 && Array.isArray(values[0])) {
            return values[0] as number[];
          }
        }
        return [];
      });
    }
    return [];
  }

  private createStats(startTime: number, input: AttentionInput, dryRun: boolean): AttentionStats {
    const seqLen = input.query.length;
    const dim = (input.query[0] as number[]).length;

    return {
      computeTimeMs: dryRun ? 0 : Date.now() - startTime,
      memoryBytes: seqLen * dim * 4 * 3, // Approximate: Q, K, V as float32
      tokensProcessed: seqLen,
      flops: seqLen * seqLen * dim * 2, // Approximate FLOPs for attention
    };
  }
}

// ============================================================================
// Attention Factory
// ============================================================================

/**
 * Factory for creating configured attention instances.
 */
export class AttentionFactory {
  private registry: AttentionRegistry;
  private defaults: Partial<AttentionConfig>;

  constructor(registry?: AttentionRegistry, defaults?: Partial<AttentionConfig>) {
    this.registry = registry ?? createDefaultRegistry();
    this.defaults = {
      numHeads: 8,
      headDim: 64,
      embedDim: 512,
      dropout: 0.0,
      useBias: true,
      causal: false,
      maxSeqLen: 2048,
      ...defaults,
    };
  }

  /**
   * Create an attention mechanism instance.
   */
  create(type: AttentionMechanism, config?: Partial<AttentionConfig>): IAttentionMechanism {
    const mechanism = this.registry.get(type);
    mechanism.configure({
      ...this.defaults,
      ...config,
    } as AttentionOptions);
    return mechanism;
  }

  /**
   * Create multiple attention mechanisms.
   */
  createMultiple(
    types: AttentionMechanism[],
    configs?: Partial<AttentionConfig>[]
  ): Map<AttentionMechanism, IAttentionMechanism> {
    const result = new Map<AttentionMechanism, IAttentionMechanism>();
    types.forEach((type, i) => {
      result.set(type, this.create(type, configs?.[i]));
    });
    return result;
  }

  /**
   * Create attention mechanisms by category.
   */
  createByCategory(
    category: AttentionCategory,
    config?: Partial<AttentionConfig>
  ): Map<AttentionMechanism, IAttentionMechanism> {
    const types = this.registry.listByCategory(category);
    return this.createMultiple(types, types.map(() => config ?? {}));
  }

  /**
   * Create an attention stack (multiple mechanisms in sequence).
   */
  createStack(
    types: AttentionMechanism[],
    config?: Partial<AttentionConfig>
  ): AttentionStack {
    const mechanisms = types.map(t => this.create(t, config));
    return new AttentionStack(mechanisms);
  }

  /**
   * Create optimal attention for given constraints.
   */
  createOptimal(constraints: {
    maxSeqLen: number;
    maxMemoryMB?: number;
    preferSpeed?: boolean;
    preferAccuracy?: boolean;
  }): IAttentionMechanism {
    const { maxSeqLen, maxMemoryMB, preferSpeed, preferAccuracy } = constraints;

    // Decision logic for optimal attention selection
    if (maxSeqLen > 8192) {
      // Very long sequences
      if (preferSpeed) {
        return this.create('linformer');
      } else if (preferAccuracy) {
        return this.create('sparse_attention');
      }
      return this.create('flash_attention_v2');
    } else if (maxSeqLen > 2048) {
      // Long sequences
      if (maxMemoryMB && maxMemoryMB < 1024) {
        return this.create('flash_attention');
      }
      return this.create('sliding_window');
    } else if (maxSeqLen > 512) {
      // Medium sequences
      if (preferSpeed) {
        return this.create('linear_attention');
      }
      return this.create('multi_head');
    } else {
      // Short sequences
      return this.create('multi_head');
    }
  }

  /**
   * Get available mechanisms.
   */
  getAvailable(): AttentionMechanism[] {
    return this.registry.listAvailable();
  }

  /**
   * Get mechanism metadata.
   */
  getMechanismInfo(type: AttentionMechanism): {
    name: string;
    description: string;
    category: AttentionCategory;
  } {
    const impl = this.registry.get(type);
    return {
      name: impl.name,
      description: impl.description,
      category: impl.category,
    };
  }

  /**
   * Set default configuration.
   */
  setDefaults(config: Partial<AttentionConfig>): void {
    this.defaults = { ...this.defaults, ...config };
  }
}

// ============================================================================
// Attention Stack
// ============================================================================

/**
 * Stack of attention mechanisms applied in sequence.
 */
export class AttentionStack {
  private mechanisms: IAttentionMechanism[];

  constructor(mechanisms: IAttentionMechanism[]) {
    this.mechanisms = mechanisms;
  }

  /**
   * Compute attention through the stack.
   */
  async compute(
    query: number[],
    keys: number[][],
    values: number[][]
  ): Promise<number[]> {
    let current = query;
    for (const mechanism of this.mechanisms) {
      current = await mechanism.compute(current, keys, values);
    }
    return current;
  }

  /**
   * Compute batch through the stack.
   */
  async computeBatch(
    queries: number[][],
    keys: number[][],
    values: number[][]
  ): Promise<number[][]> {
    let current = queries;
    for (const mechanism of this.mechanisms) {
      current = await mechanism.computeBatch(current, keys, values);
    }
    return current;
  }

  /**
   * Get the mechanisms in the stack.
   */
  getMechanisms(): IAttentionMechanism[] {
    return [...this.mechanisms];
  }

  /**
   * Add a mechanism to the stack.
   */
  push(mechanism: IAttentionMechanism): void {
    this.mechanisms.push(mechanism);
  }

  /**
   * Remove the last mechanism.
   */
  pop(): IAttentionMechanism | undefined {
    return this.mechanisms.pop();
  }
}

// ============================================================================
// Default Registry Creation
// ============================================================================

/**
 * Create a registry with all 39 attention mechanisms.
 */
export function createDefaultRegistry(): AttentionRegistry {
  const registry = new AttentionRegistry();

  // Core mechanisms
  registry.register(new MultiHeadAttention());
  registry.register(new SelfAttention());
  registry.register(new CrossAttention());
  registry.register(new CausalAttention());
  registry.register(new BidirectionalAttention());
  registry.register(new LocalAttention());
  registry.register(new GlobalAttention());

  // Efficient mechanisms
  registry.register(new FlashAttention());
  registry.register(new FlashAttentionV2());
  registry.register(new MemoryEfficientAttention());
  registry.register(new ChunkAttention());
  registry.register(new SlidingWindowAttention());
  registry.register(new DilatedAttention());

  // Sparse mechanisms
  registry.register(new SparseAttention());
  registry.register(new BlockSparseAttention());

  // Linear mechanisms
  registry.register(new LinearAttention());
  registry.register(new PerformerAttention());
  registry.register(new LinformerAttention());
  registry.register(new ReformerAttention());
  registry.register(new SynthesizerAttention());
  registry.register(new RoutingAttention());
  registry.register(new MixtureOfExpertsAttention());

  // Positional mechanisms
  registry.register(new RelativePositionAttention());
  registry.register(new RotaryPositionAttention());
  registry.register(new ALiBiAttention());
  registry.register(new AxialAttention());

  // Graph mechanisms
  registry.register(new GraphAttention());
  registry.register(new HyperbolicAttention());
  registry.register(new SphericalAttention());
  registry.register(new ToroidalAttention());

  // Temporal mechanisms
  registry.register(new TemporalAttention());
  registry.register(new RecurrentAttention());
  registry.register(new StateSpaceAttention());

  // Multimodal mechanisms
  registry.register(new CrossModalAttention());
  registry.register(new PerceiverAttention());
  registry.register(new FlamingoAttention());

  // Retrieval mechanisms
  registry.register(new RetrievalAttention());
  registry.register(new KNNAttention());
  registry.register(new MemoryAugmentedAttention());

  return registry;
}

// ============================================================================
// SQL Query Builder
// ============================================================================

/**
 * Builds optimized SQL queries for attention operations.
 */
export class AttentionSQLBuilder {
  private schema: string;

  constructor(schema: string = 'ruvector') {
    this.schema = schema;
  }

  /**
   * Build a complete attention query with setup and execution.
   */
  buildComplete(
    mechanism: AttentionMechanism,
    tableName: string,
    queryColumn: string,
    keyColumn: string,
    valueColumn: string,
    options: {
      numHeads?: number;
      scale?: number;
      causal?: boolean;
      limit?: number;
    } = {}
  ): string {
    const { numHeads = 8, scale, causal = false, limit = 100 } = options;
    const computedScale = scale ?? Math.sqrt(64);

    return `
-- Set RuVector parameters
SET ${this.schema}.attention_num_heads = ${numHeads};
SET ${this.schema}.attention_scale = ${computedScale};
SET ${this.schema}.attention_causal = ${causal};

-- Execute attention
SELECT
  id,
  ${this.schema}.${this.mapMechanismToFunction(mechanism)}(
    ${queryColumn},
    ARRAY_AGG(${keyColumn}) OVER (ORDER BY id),
    ARRAY_AGG(${valueColumn}) OVER (ORDER BY id)
  ) AS attention_output
FROM ${tableName}
LIMIT ${limit};
`.trim();
  }

  /**
   * Build batch attention query.
   */
  buildBatch(
    mechanism: AttentionMechanism,
    queries: string,
    keys: string,
    values: string,
    options: {
      numHeads?: number;
      scale?: number;
    } = {}
  ): string {
    const { numHeads = 8, scale } = options;
    const computedScale = scale ?? Math.sqrt(64);

    return `
SELECT ${this.schema}.${this.mapMechanismToFunction(mechanism)}_batch(
  ${queries}::vector[],
  ${keys}::vector[],
  ${values}::vector[],
  ${numHeads},
  ${computedScale}
) AS attention_outputs;
`.trim();
  }

  /**
   * Build attention with retrieved context.
   */
  buildWithRetrieval(
    mechanism: AttentionMechanism,
    queryVector: string,
    tableName: string,
    vectorColumn: string,
    k: number = 10
  ): string {
    return `
WITH retrieved AS (
  SELECT
    ${vectorColumn} as key_vector,
    ${vectorColumn} as value_vector
  FROM ${tableName}
  ORDER BY ${vectorColumn} <-> ${queryVector}
  LIMIT ${k}
)
SELECT ${this.schema}.${this.mapMechanismToFunction(mechanism)}(
  ${queryVector},
  ARRAY(SELECT key_vector FROM retrieved),
  ARRAY(SELECT value_vector FROM retrieved)
) AS attention_output;
`.trim();
  }

  private mapMechanismToFunction(mechanism: AttentionMechanism): string {
    const mapping: Record<AttentionMechanism, string> = {
      'multi_head': 'multi_head_attention',
      'self_attention': 'self_attention',
      'cross_attention': 'cross_attention',
      'sparse_attention': 'sparse_attention',
      'linear_attention': 'linear_attention',
      'local_attention': 'local_attention',
      'global_attention': 'global_attention',
      'flash_attention': 'flash_attention',
      'flash_attention_v2': 'flash_attention_v2',
      'memory_efficient': 'memory_efficient_attention',
      'chunk_attention': 'chunk_attention',
      'sliding_window': 'sliding_window_attention',
      'dilated_attention': 'dilated_attention',
      'block_sparse': 'block_sparse_attention',
      'relative_position': 'relative_position_attention',
      'rotary_position': 'rotary_position_attention',
      'alibi': 'alibi_attention',
      'causal': 'causal_attention',
      'bidirectional': 'bidirectional_attention',
      'axial': 'axial_attention',
      'performer': 'performer_attention',
      'linformer': 'linformer_attention',
      'reformer': 'reformer_attention',
      'synthesizer': 'synthesizer_attention',
      'routing': 'routing_attention',
      'mixture_of_experts': 'moe_attention',
      'graph_attention': 'graph_attention',
      'hyperbolic_attention': 'hyperbolic_attention',
      'spherical_attention': 'spherical_attention',
      'toroidal_attention': 'toroidal_attention',
      'temporal_attention': 'temporal_attention',
      'recurrent_attention': 'recurrent_attention',
      'state_space': 'state_space_attention',
      'cross_modal': 'cross_modal_attention',
      'perceiver': 'perceiver_attention',
      'flamingo': 'flamingo_attention',
      'retrieval_attention': 'retrieval_attention',
      'knn_attention': 'knn_attention',
      'memory_augmented': 'memory_augmented_attention',
    };
    return mapping[mechanism] ?? 'multi_head_attention';
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  AttentionRegistry,
  type IAttentionMechanism,
  type AttentionOptions,
  type AttentionCategory,
} from './attention.js';

// Re-export all mechanism classes for direct instantiation
export {
  MultiHeadAttention,
  SelfAttention,
  CrossAttention,
  CausalAttention,
  BidirectionalAttention,
  LocalAttention,
  GlobalAttention,
  FlashAttention,
  FlashAttentionV2,
  MemoryEfficientAttention,
  ChunkAttention,
  SlidingWindowAttention,
  DilatedAttention,
} from './attention.js';

export {
  SparseAttention,
  BlockSparseAttention,
  LinearAttention,
  PerformerAttention,
  LinformerAttention,
  ReformerAttention,
  RelativePositionAttention,
  RotaryPositionAttention,
  ALiBiAttention,
  AxialAttention,
} from './attention-mechanisms.js';

export {
  GraphAttention,
  HyperbolicAttention,
  SphericalAttention,
  ToroidalAttention,
  TemporalAttention,
  RecurrentAttention,
  StateSpaceAttention,
  CrossModalAttention,
  PerceiverAttention,
  FlamingoAttention,
  RetrievalAttention,
  KNNAttention,
  MemoryAugmentedAttention,
  SynthesizerAttention,
  RoutingAttention,
  MixtureOfExpertsAttention,
} from './attention-advanced.js';
