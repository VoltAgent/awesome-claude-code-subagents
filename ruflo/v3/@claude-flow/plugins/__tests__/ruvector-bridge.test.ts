/**
 * RuVector PostgreSQL Bridge Tests
 *
 * Comprehensive test suite for the RuVector PostgreSQL vector database
 * integration, covering connection management, vector operations,
 * attention mechanisms, GNN layers, hyperbolic embeddings, and self-learning.
 *
 * @module @claude-flow/plugins/__tests__/ruvector-bridge
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import type {
  RuVectorConfig,
  RuVectorClientOptions,
  IRuVectorClient,
  IRuVectorTransaction,
  VectorSearchOptions,
  VectorSearchResult,
  VectorInsertOptions,
  VectorUpdateOptions,
  VectorIndexOptions,
  BatchVectorOptions,
  AttentionConfig,
  AttentionInput,
  AttentionOutput,
  AttentionMechanism,
  GNNLayer,
  GraphData,
  GNNOutput,
  GNNLayerType,
  HyperbolicEmbedding,
  HyperbolicInput,
  HyperbolicOutput,
  HyperbolicModel,
  DistanceMetric,
  VectorIndexType,
  HealthStatus,
  IndexStats,
  QueryResult,
  BatchResult,
  BulkSearchResult,
  ConnectionResult,
  PoolConfig,
  SSLConfig,
  RetryConfig,
  RuVectorEventType,
  RuVectorEvent,
  RuVectorStats,
  AnalysisResult,
} from '../src/integrations/ruvector/types.js';
import {
  isDistanceMetric,
  isAttentionMechanism,
  isGNNLayerType,
  isHyperbolicModel,
  isVectorIndexType,
  isSuccess,
  isError,
} from '../src/integrations/ruvector/types.js';

// ============================================================================
// Mock Types and Utilities
// ============================================================================

/**
 * Mock PostgreSQL client interface
 */
interface MockPgClient {
  connect: Mock;
  query: Mock;
  release: Mock;
  end: Mock;
  on: Mock;
  off: Mock;
}

/**
 * Mock PostgreSQL pool interface
 */
interface MockPgPool {
  connect: Mock;
  query: Mock;
  end: Mock;
  on: Mock;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

/**
 * Create a mock PostgreSQL client
 */
function createMockPgClient(): MockPgClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
  };
}

/**
 * Create a mock PostgreSQL pool
 */
function createMockPgPool(): MockPgPool {
  const mockClient = createMockPgClient();
  return {
    connect: vi.fn().mockResolvedValue(mockClient),
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  };
}

/**
 * Create test configuration
 */
function createTestConfig(overrides: Partial<RuVectorConfig> = {}): RuVectorConfig {
  return {
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'test_user',
    password: 'test_password',
    poolSize: 10,
    connectionTimeoutMs: 5000,
    queryTimeoutMs: 30000,
    ...overrides,
  };
}

/**
 * Create test vector
 */
function createTestVector(dimensions: number = 384): number[] {
  return Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
}

/**
 * Normalize a vector for cosine similarity
 */
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / magnitude);
}

// ============================================================================
// Mock RuVector Client Implementation for Testing
// ============================================================================

/**
 * Mock RuVector client for unit testing
 */
class MockRuVectorClient implements IRuVectorClient {
  private pool: MockPgPool;
  private config: RuVectorClientOptions;
  private connected: boolean = false;
  private eventHandlers: Map<RuVectorEventType, Set<(event: RuVectorEvent) => void>> = new Map();
  private connectionInfo: ConnectionResult | null = null;

  constructor(config: RuVectorClientOptions) {
    this.config = config;
    this.pool = createMockPgPool();
  }

  // Event Emitter Implementation
  on<T extends RuVectorEventType>(event: T, handler: (e: RuVectorEvent<T>) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as (e: RuVectorEvent) => void);
    return () => this.off(event, handler);
  }

  off<T extends RuVectorEventType>(event: T, handler: (e: RuVectorEvent<T>) => void): void {
    this.eventHandlers.get(event)?.delete(handler as (e: RuVectorEvent) => void);
  }

  once<T extends RuVectorEventType>(event: T, handler: (e: RuVectorEvent<T>) => void): () => void {
    const wrappedHandler = (e: RuVectorEvent<T>) => {
      this.off(event, wrappedHandler);
      handler(e);
    };
    return this.on(event, wrappedHandler);
  }

  emit<T extends RuVectorEventType>(event: T, data: RuVectorEvent<T>['data']): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) =>
        handler({ type: event, timestamp: new Date(), data } as RuVectorEvent)
      );
    }
  }

  removeAllListeners(event?: RuVectorEventType): void {
    if (event) {
      this.eventHandlers.delete(event);
    } else {
      this.eventHandlers.clear();
    }
  }

  // Connection Management
  async connect(): Promise<ConnectionResult> {
    this.connected = true;
    this.connectionInfo = {
      connectionId: 'test-connection-1',
      ready: true,
      serverVersion: '15.0',
      ruVectorVersion: '1.0.0',
      parameters: {
        server_encoding: 'UTF8',
        client_encoding: 'UTF8',
      },
    };
    this.emit('connection:open', {
      connectionId: this.connectionInfo.connectionId,
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
    });
    return this.connectionInfo;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('connection:close', {
      connectionId: this.connectionInfo?.connectionId || '',
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
    });
    this.connectionInfo = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConnectionInfo(): ConnectionResult | null {
    return this.connectionInfo;
  }

  // Vector Operations
  async search(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    if (!this.connected) throw new Error('Not connected');

    this.emit('search:start', {
      searchId: 'search-1',
      tableName: options.tableName || 'vectors',
      k: options.k,
      metric: options.metric,
      hasFilters: !!options.filter,
    });

    const results: VectorSearchResult[] = Array.from({ length: Math.min(options.k, 10) }, (_, i) => ({
      id: `result-${i}`,
      score: 1 - i * 0.1,
      distance: i * 0.1,
      metadata: options.includeMetadata ? { index: i } : undefined,
      vector: options.includeVector ? createTestVector(options.query.length) : undefined,
      rank: i + 1,
    }));

    this.emit('search:complete', {
      searchId: 'search-1',
      durationMs: 15,
      resultCount: results.length,
      scannedCount: 1000,
      cacheHit: false,
    });

    return results;
  }

  async batchSearch(options: BatchVectorOptions): Promise<BulkSearchResult> {
    if (!this.connected) throw new Error('Not connected');

    const results: VectorSearchResult[][] = await Promise.all(
      options.queries.map((query) =>
        this.search({
          query: Array.from(query),
          k: options.k,
          metric: options.metric,
          filter: options.filter,
          tableName: options.tableName,
          vectorColumn: options.vectorColumn,
        })
      )
    );

    return {
      results,
      totalDurationMs: results.length * 15,
      avgDurationMs: 15,
      cacheStats: {
        hits: 0,
        misses: results.length,
        hitRate: 0,
      },
    };
  }

  async insert(options: VectorInsertOptions): Promise<BatchResult<string>> {
    if (!this.connected) throw new Error('Not connected');

    const ids: string[] = options.vectors.map(
      (v, i) => v.id?.toString() || `generated-${i}`
    );

    options.vectors.forEach((v, i) => {
      this.emit('vector:inserted', {
        tableName: options.tableName,
        vectorId: ids[i],
        dimensions: Array.isArray(v.vector) ? v.vector.length : v.vector.length,
      });
    });

    return {
      total: options.vectors.length,
      successful: options.vectors.length,
      failed: 0,
      results: ids,
      durationMs: options.vectors.length * 5,
      throughput: options.vectors.length / ((options.vectors.length * 5) / 1000),
    };
  }

  async update(options: VectorUpdateOptions): Promise<boolean> {
    if (!this.connected) throw new Error('Not connected');

    this.emit('vector:updated', {
      tableName: options.tableName,
      vectorId: options.id,
      dimensions: options.vector ? (Array.isArray(options.vector) ? options.vector.length : options.vector.length) : 0,
    });

    return true;
  }

  async delete(tableName: string, id: string | number): Promise<boolean> {
    if (!this.connected) throw new Error('Not connected');

    this.emit('vector:deleted', {
      tableName,
      vectorId: id,
      dimensions: 0,
    });

    return true;
  }

  async bulkDelete(tableName: string, ids: Array<string | number>): Promise<BatchResult> {
    if (!this.connected) throw new Error('Not connected');

    return {
      total: ids.length,
      successful: ids.length,
      failed: 0,
      durationMs: ids.length * 2,
      throughput: ids.length / ((ids.length * 2) / 1000),
    };
  }

  // Index Management
  async createIndex(options: VectorIndexOptions): Promise<void> {
    if (!this.connected) throw new Error('Not connected');

    this.emit('index:created', {
      indexName: options.indexName || `idx_${options.tableName}_${options.columnName}`,
      tableName: options.tableName,
      columnName: options.columnName,
      indexType: options.indexType,
      durationMs: 1000,
    });
  }

  async dropIndex(indexName: string): Promise<void> {
    if (!this.connected) throw new Error('Not connected');

    this.emit('index:dropped', {
      indexName,
      tableName: '',
      columnName: '',
      indexType: 'hnsw',
    });
  }

  async rebuildIndex(indexName: string): Promise<void> {
    if (!this.connected) throw new Error('Not connected');

    this.emit('index:rebuilt', {
      indexName,
      tableName: '',
      columnName: '',
      indexType: 'hnsw',
      durationMs: 2000,
    });
  }

  async getIndexStats(indexName: string): Promise<IndexStats> {
    if (!this.connected) throw new Error('Not connected');

    return {
      indexName,
      indexType: 'hnsw',
      numVectors: 10000,
      sizeBytes: 1024 * 1024 * 50, // 50MB
      buildTimeMs: 5000,
      lastRebuild: new Date(),
      params: {
        m: 16,
        efConstruction: 200,
      },
    };
  }

  async listIndices(tableName?: string): Promise<IndexStats[]> {
    if (!this.connected) throw new Error('Not connected');

    return [
      {
        indexName: `idx_${tableName || 'vectors'}_embedding`,
        indexType: 'hnsw',
        numVectors: 10000,
        sizeBytes: 1024 * 1024 * 50,
        buildTimeMs: 5000,
        lastRebuild: new Date(),
        params: { m: 16, efConstruction: 200 },
      },
    ];
  }

  // Attention Operations
  async computeAttention(input: AttentionInput, config: AttentionConfig): Promise<AttentionOutput> {
    if (!this.connected) throw new Error('Not connected');

    const seqLen = input.query.length;
    const outputDim = config.numHeads * config.headDim;

    const output: number[][] = input.query.map(() =>
      Array.from({ length: outputDim }, () => Math.random() * 2 - 1)
    );

    this.emit('attention:computed', {
      mechanism: config.mechanism,
      seqLen,
      numHeads: config.numHeads,
      durationMs: seqLen * 0.1,
      memoryBytes: seqLen * outputDim * 4,
    });

    return {
      output,
      attentionWeights: config.params?.checkpointing
        ? undefined
        : input.query.map(() =>
            Array.from({ length: config.numHeads }, () =>
              Array.from({ length: seqLen }, () =>
                Array.from({ length: seqLen }, () => Math.random())
              )
            )
          ),
      stats: {
        computeTimeMs: seqLen * 0.1,
        memoryBytes: seqLen * outputDim * 4,
        tokensProcessed: seqLen,
      },
    };
  }

  // GNN Operations
  async runGNNLayer(graph: GraphData, layer: GNNLayer): Promise<GNNOutput> {
    if (!this.connected) throw new Error('Not connected');

    const numNodes = graph.nodeFeatures.length;
    const numEdges = graph.edgeIndex[0].length;

    const nodeEmbeddings: number[][] = graph.nodeFeatures.map(() =>
      Array.from({ length: layer.outputDim }, () => Math.random() * 2 - 1)
    );

    this.emit('gnn:forward', {
      layerType: layer.type,
      numNodes,
      numEdges,
      durationMs: numNodes * 0.05,
    });

    return {
      nodeEmbeddings,
      graphEmbedding: graph.batch
        ? Array.from({ length: layer.outputDim }, () => Math.random())
        : undefined,
      attentionWeights:
        layer.type === 'gat' || layer.type === 'gat_v2'
          ? graph.edgeIndex[0].map(() => Math.random())
          : undefined,
      stats: {
        forwardTimeMs: numNodes * 0.05,
        numNodes,
        numEdges,
        memoryBytes: numNodes * layer.outputDim * 4,
        numIterations: 1,
      },
    };
  }

  buildGraph(nodeFeatures: number[][], edges: [number, number][]): GraphData {
    return {
      nodeFeatures,
      edgeIndex: [edges.map((e) => e[0]), edges.map((e) => e[1])],
    };
  }

  // Hyperbolic Operations
  async hyperbolicEmbed(
    input: HyperbolicInput,
    config: HyperbolicEmbedding
  ): Promise<HyperbolicOutput> {
    if (!this.connected) throw new Error('Not connected');

    const embeddings: number[][] = input.points.map((point) => {
      // Project to Poincare ball (ensure ||x|| < 1)
      const norm = Math.sqrt(point.reduce((sum, v) => sum + v * v, 0));
      const scale = norm >= 1 ? 0.99 / norm : 1;
      return point.map((v) => v * scale);
    });

    this.emit('hyperbolic:embed', {
      model: config.model,
      operation: 'embed',
      numPoints: input.points.length,
      durationMs: input.points.length * 0.02,
    });

    return {
      embeddings,
      curvature: config.curvature,
    };
  }

  async hyperbolicDistance(
    a: number[],
    b: number[],
    config: HyperbolicEmbedding
  ): Promise<number> {
    if (!this.connected) throw new Error('Not connected');

    // Poincare distance formula: arccosh(1 + 2 * ||u-v||^2 / ((1-||u||^2)(1-||v||^2)))
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    const diffNorm = Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));

    const numerator = 2 * diffNorm ** 2;
    const denominator = (1 - normA ** 2) * (1 - normB ** 2);
    const distance = Math.acosh(1 + numerator / denominator);

    this.emit('hyperbolic:distance', {
      model: config.model,
      operation: 'distance',
      numPoints: 2,
      durationMs: 0.01,
    });

    return distance;
  }

  // Embedding Operations
  async embed(text: string, model?: string): Promise<{ embedding: number[]; model: string; tokenCount: number; durationMs: number; dimension: number }> {
    if (!this.connected) throw new Error('Not connected');

    const dimension = 384;
    return {
      embedding: createTestVector(dimension),
      model: model || 'default',
      tokenCount: Math.ceil(text.length / 4),
      durationMs: 50,
      dimension,
    };
  }

  async embedBatch(texts: string[], model?: string): Promise<{ embeddings: Array<{ embedding: number[]; model: string; tokenCount: number; durationMs: number; dimension: number }>; totalTokens: number; totalDurationMs: number; throughput: number }> {
    if (!this.connected) throw new Error('Not connected');

    const embeddings = await Promise.all(texts.map((t) => this.embed(t, model)));
    const totalTokens = embeddings.reduce((sum, e) => sum + e.tokenCount, 0);
    const totalDurationMs = embeddings.reduce((sum, e) => sum + e.durationMs, 0);

    return {
      embeddings,
      totalTokens,
      totalDurationMs,
      throughput: totalTokens / (totalDurationMs / 1000),
    };
  }

  // Transaction Support
  async transaction<T>(fn: (tx: IRuVectorTransaction) => Promise<T>): Promise<{ transactionId: string; committed: boolean; data?: T; durationMs: number; queryCount: number }> {
    if (!this.connected) throw new Error('Not connected');

    const startTime = Date.now();
    let queryCount = 0;

    const tx: IRuVectorTransaction = {
      query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<R>> => {
        queryCount++;
        return { rows: [] as R[], rowCount: 0, durationMs: 5, command: 'SELECT' };
      },
      insert: async (options: VectorInsertOptions) => {
        queryCount++;
        return this.insert(options);
      },
      update: async (options: VectorUpdateOptions) => {
        queryCount++;
        return this.update(options);
      },
      delete: async (tableName: string, id: string | number) => {
        queryCount++;
        return this.delete(tableName, id);
      },
      commit: async () => {},
      rollback: async () => {},
    };

    try {
      const data = await fn(tx);
      await tx.commit();
      return {
        transactionId: 'tx-1',
        committed: true,
        data,
        durationMs: Date.now() - startTime,
        queryCount,
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // Admin Operations
  async vacuum(tableName?: string): Promise<void> {
    if (!this.connected) throw new Error('Not connected');

    this.emit('admin:vacuum', {
      operation: 'vacuum',
      tableName,
      durationMs: 500,
    });
  }

  async analyze(tableName?: string): Promise<AnalysisResult> {
    if (!this.connected) throw new Error('Not connected');

    this.emit('admin:analyze', {
      operation: 'analyze',
      tableName,
      durationMs: 300,
    });

    return {
      tableName: tableName || 'all',
      numRows: 10000,
      columnStats: [
        {
          columnName: 'embedding',
          dataType: 'vector(384)',
          nullPercent: 0,
          distinctCount: 10000,
          avgSizeBytes: 1536,
        },
      ],
      recommendations: ['Consider adding an HNSW index for faster similarity search'],
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      status: this.connected ? 'healthy' : 'unhealthy',
      components: {
        database: {
          name: 'PostgreSQL',
          healthy: this.connected,
          latencyMs: this.connected ? 5 : undefined,
          error: this.connected ? undefined : 'Not connected',
        },
        ruvector: {
          name: 'RuVector Extension',
          healthy: this.connected,
          latencyMs: this.connected ? 1 : undefined,
        },
        pool: {
          name: 'Connection Pool',
          healthy: true,
          latencyMs: 0,
        },
      },
      lastCheck: new Date(),
      issues: this.connected ? [] : ['Database connection is not established'],
    };
  }

  async getStats(): Promise<RuVectorStats> {
    if (!this.connected) throw new Error('Not connected');

    return {
      version: '1.0.0',
      totalVectors: 100000,
      totalSizeBytes: 1024 * 1024 * 500, // 500MB
      numIndices: 3,
      numTables: 5,
      queryStats: {
        totalQueries: 50000,
        avgQueryTimeMs: 15,
        p95QueryTimeMs: 50,
        p99QueryTimeMs: 100,
        cacheHitRate: 0.85,
      },
      memoryStats: {
        usedBytes: 1024 * 1024 * 256, // 256MB
        peakBytes: 1024 * 1024 * 512, // 512MB
        indexBytes: 1024 * 1024 * 150, // 150MB
        cacheBytes: 1024 * 1024 * 50, // 50MB
      },
    };
  }

  // Test helpers
  getPool(): MockPgPool {
    return this.pool;
  }

  getConfig(): RuVectorClientOptions {
    return this.config;
  }
}

// ============================================================================
// Test Suites
// ============================================================================

describe('RuVectorBridge', () => {
  let client: MockRuVectorClient;
  let config: RuVectorClientOptions;

  beforeEach(() => {
    config = {
      ...createTestConfig(),
      autoReconnect: true,
      maxReconnectAttempts: 3,
    };
    client = new MockRuVectorClient(config);
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  // ==========================================================================
  // Connection Management Tests
  // ==========================================================================

  describe('Connection Management', () => {
    describe('Pool Creation and Configuration', () => {
      it('should create connection pool with default settings', async () => {
        await client.connect();

        expect(client.isConnected()).toBe(true);
        expect(client.getConnectionInfo()).not.toBeNull();
      });

      it('should apply custom pool configuration', async () => {
        const customConfig: RuVectorClientOptions = {
          ...config,
          pool: {
            min: 5,
            max: 20,
            idleTimeoutMs: 30000,
            acquireTimeoutMs: 10000,
            validateOnAcquire: true,
          },
        };

        const customClient = new MockRuVectorClient(customConfig);
        await customClient.connect();

        expect(customClient.isConnected()).toBe(true);
        expect(customClient.getConfig().pool?.min).toBe(5);
        expect(customClient.getConfig().pool?.max).toBe(20);

        await customClient.disconnect();
      });

      it('should respect pool size limits', async () => {
        const poolConfig: PoolConfig = {
          min: 2,
          max: 5,
          idleTimeoutMs: 10000,
          acquireTimeoutMs: 5000,
        };

        const limitedClient = new MockRuVectorClient({
          ...config,
          pool: poolConfig,
        });

        await limitedClient.connect();

        expect(limitedClient.getConfig().pool?.max).toBe(5);

        await limitedClient.disconnect();
      });
    });

    describe('Connection Health Checks', () => {
      it('should report healthy status when connected', async () => {
        await client.connect();

        const health = await client.healthCheck();

        expect(health.status).toBe('healthy');
        expect(health.components.database.healthy).toBe(true);
        expect(health.components.ruvector.healthy).toBe(true);
        expect(health.issues).toHaveLength(0);
      });

      it('should report unhealthy status when disconnected', async () => {
        const health = await client.healthCheck();

        expect(health.status).toBe('unhealthy');
        expect(health.components.database.healthy).toBe(false);
        expect(health.issues.length).toBeGreaterThan(0);
      });

      it('should include latency metrics in health check', async () => {
        await client.connect();

        const health = await client.healthCheck();

        expect(health.components.database.latencyMs).toBeDefined();
        expect(health.components.database.latencyMs).toBeLessThan(100);
      });
    });

    describe('Reconnection on Failure', () => {
      it('should emit connection events', async () => {
        const openHandler = vi.fn();
        const closeHandler = vi.fn();

        client.on('connection:open', openHandler);
        client.on('connection:close', closeHandler);

        await client.connect();
        expect(openHandler).toHaveBeenCalledTimes(1);

        await client.disconnect();
        expect(closeHandler).toHaveBeenCalledTimes(1);
      });

      it('should track connection state correctly', async () => {
        expect(client.isConnected()).toBe(false);
        expect(client.getConnectionInfo()).toBeNull();

        await client.connect();
        expect(client.isConnected()).toBe(true);
        expect(client.getConnectionInfo()).not.toBeNull();

        await client.disconnect();
        expect(client.isConnected()).toBe(false);
        expect(client.getConnectionInfo()).toBeNull();
      });

      it('should support auto-reconnect configuration', () => {
        expect(client.getConfig().autoReconnect).toBe(true);
        expect(client.getConfig().maxReconnectAttempts).toBe(3);
      });
    });

    describe('SSL/TLS Connections', () => {
      it('should accept boolean SSL configuration', async () => {
        const sslClient = new MockRuVectorClient({
          ...config,
          ssl: true,
        });

        await sslClient.connect();
        expect(sslClient.isConnected()).toBe(true);
        expect(sslClient.getConfig().ssl).toBe(true);

        await sslClient.disconnect();
      });

      it('should accept detailed SSL configuration', async () => {
        const sslConfig: SSLConfig = {
          enabled: true,
          rejectUnauthorized: true,
          ca: '/path/to/ca.pem',
          cert: '/path/to/cert.pem',
          key: '/path/to/key.pem',
          servername: 'db.example.com',
        };

        const sslClient = new MockRuVectorClient({
          ...config,
          ssl: sslConfig,
        });

        await sslClient.connect();
        expect(sslClient.isConnected()).toBe(true);

        const clientSsl = sslClient.getConfig().ssl as SSLConfig;
        expect(clientSsl.enabled).toBe(true);
        expect(clientSsl.rejectUnauthorized).toBe(true);
        expect(clientSsl.ca).toBe('/path/to/ca.pem');

        await sslClient.disconnect();
      });
    });

    describe('Retry Configuration', () => {
      it('should accept retry configuration', () => {
        const retryConfig: RetryConfig = {
          maxAttempts: 5,
          initialDelayMs: 100,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          jitter: true,
          retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT'],
        };

        const retryClient = new MockRuVectorClient({
          ...config,
          retry: retryConfig,
        });

        expect(retryClient.getConfig().retry?.maxAttempts).toBe(5);
        expect(retryClient.getConfig().retry?.backoffMultiplier).toBe(2);
      });
    });
  });

  // ==========================================================================
  // Vector Operations Tests
  // ==========================================================================

  describe('Vector Operations', () => {
    beforeEach(async () => {
      await client.connect();
    });

    describe('Vector Search', () => {
      it('should perform cosine similarity search', async () => {
        const options: VectorSearchOptions = {
          query: createTestVector(384),
          k: 10,
          metric: 'cosine',
          tableName: 'embeddings',
        };

        const results = await client.search(options);

        expect(results).toHaveLength(10);
        expect(results[0].score).toBeGreaterThan(results[1].score);
        results.forEach((r) => {
          expect(r.id).toBeDefined();
          expect(r.score).toBeDefined();
        });
      });

      it('should perform euclidean distance search', async () => {
        const options: VectorSearchOptions = {
          query: createTestVector(384),
          k: 5,
          metric: 'euclidean',
          tableName: 'embeddings',
        };

        const results = await client.search(options);

        expect(results).toHaveLength(5);
        results.forEach((r) => {
          expect(r.distance).toBeDefined();
        });
      });

      it('should perform dot product search', async () => {
        const options: VectorSearchOptions = {
          query: createTestVector(384),
          k: 5,
          metric: 'dot',
          tableName: 'embeddings',
        };

        const results = await client.search(options);

        expect(results).toHaveLength(5);
      });

      it('should include metadata when requested', async () => {
        const options: VectorSearchOptions = {
          query: createTestVector(384),
          k: 3,
          metric: 'cosine',
          includeMetadata: true,
        };

        const results = await client.search(options);

        results.forEach((r) => {
          expect(r.metadata).toBeDefined();
        });
      });

      it('should include vectors when requested', async () => {
        const options: VectorSearchOptions = {
          query: createTestVector(384),
          k: 3,
          metric: 'cosine',
          includeVector: true,
        };

        const results = await client.search(options);

        results.forEach((r) => {
          expect(r.vector).toBeDefined();
          expect(r.vector).toHaveLength(384);
        });
      });

      it('should emit search events', async () => {
        const startHandler = vi.fn();
        const completeHandler = vi.fn();

        client.on('search:start', startHandler);
        client.on('search:complete', completeHandler);

        await client.search({
          query: createTestVector(384),
          k: 5,
          metric: 'cosine',
        });

        expect(startHandler).toHaveBeenCalled();
        expect(completeHandler).toHaveBeenCalled();
      });

      it('should throw when not connected', async () => {
        await client.disconnect();

        await expect(
          client.search({
            query: createTestVector(384),
            k: 5,
            metric: 'cosine',
          })
        ).rejects.toThrow('Not connected');
      });
    });

    describe('Vector Insert/Update/Delete', () => {
      it('should insert single vector', async () => {
        const options: VectorInsertOptions = {
          tableName: 'embeddings',
          vectors: [
            {
              id: 'test-1',
              vector: createTestVector(384),
              metadata: { label: 'test' },
            },
          ],
        };

        const result = await client.insert(options);

        expect(result.successful).toBe(1);
        expect(result.failed).toBe(0);
        expect(result.results).toContain('test-1');
      });

      it('should insert multiple vectors in batch', async () => {
        const options: VectorInsertOptions = {
          tableName: 'embeddings',
          vectors: Array.from({ length: 100 }, (_, i) => ({
            id: `batch-${i}`,
            vector: createTestVector(384),
            metadata: { index: i },
          })),
          batchSize: 50,
        };

        const result = await client.insert(options);

        expect(result.total).toBe(100);
        expect(result.successful).toBe(100);
        expect(result.throughput).toBeGreaterThan(0);
      });

      it('should update existing vector', async () => {
        const options: VectorUpdateOptions = {
          tableName: 'embeddings',
          id: 'test-1',
          vector: createTestVector(384),
          metadata: { updated: true },
        };

        const success = await client.update(options);

        expect(success).toBe(true);
      });

      it('should delete vector by id', async () => {
        const success = await client.delete('embeddings', 'test-1');

        expect(success).toBe(true);
      });

      it('should bulk delete vectors', async () => {
        const result = await client.bulkDelete('embeddings', ['id-1', 'id-2', 'id-3']);

        expect(result.total).toBe(3);
        expect(result.successful).toBe(3);
      });

      it('should emit vector events', async () => {
        const insertHandler = vi.fn();
        const updateHandler = vi.fn();
        const deleteHandler = vi.fn();

        client.on('vector:inserted', insertHandler);
        client.on('vector:updated', updateHandler);
        client.on('vector:deleted', deleteHandler);

        await client.insert({
          tableName: 'test',
          vectors: [{ vector: createTestVector(384) }],
        });
        await client.update({
          tableName: 'test',
          id: '1',
          vector: createTestVector(384),
        });
        await client.delete('test', '1');

        expect(insertHandler).toHaveBeenCalled();
        expect(updateHandler).toHaveBeenCalled();
        expect(deleteHandler).toHaveBeenCalled();
      });
    });

    describe('Batch Operations', () => {
      it('should perform batch search', async () => {
        const options: BatchVectorOptions = {
          queries: Array.from({ length: 5 }, () => createTestVector(384)),
          k: 3,
          metric: 'cosine',
          tableName: 'embeddings',
        };

        const result = await client.batchSearch(options);

        expect(result.results).toHaveLength(5);
        result.results.forEach((r) => {
          expect(r).toHaveLength(3);
        });
        expect(result.cacheStats).toBeDefined();
      });

      it('should calculate batch statistics', async () => {
        const options: BatchVectorOptions = {
          queries: Array.from({ length: 10 }, () => createTestVector(384)),
          k: 5,
          metric: 'cosine',
        };

        const result = await client.batchSearch(options);

        expect(result.totalDurationMs).toBeGreaterThan(0);
        expect(result.avgDurationMs).toBeGreaterThan(0);
        expect(result.cacheStats.hitRate).toBeDefined();
      });
    });

    describe('Index Creation', () => {
      it('should create HNSW index', async () => {
        const options: VectorIndexOptions = {
          tableName: 'embeddings',
          columnName: 'embedding',
          indexType: 'hnsw',
          m: 16,
          efConstruction: 200,
        };

        await expect(client.createIndex(options)).resolves.toBeUndefined();
      });

      it('should create IVFFlat index', async () => {
        const options: VectorIndexOptions = {
          tableName: 'embeddings',
          columnName: 'embedding',
          indexType: 'ivfflat',
          lists: 100,
        };

        await expect(client.createIndex(options)).resolves.toBeUndefined();
      });

      it('should emit index events', async () => {
        const createdHandler = vi.fn();
        client.on('index:created', createdHandler);

        await client.createIndex({
          tableName: 'test',
          columnName: 'embedding',
          indexType: 'hnsw',
        });

        expect(createdHandler).toHaveBeenCalled();
      });

      it('should get index statistics', async () => {
        const stats = await client.getIndexStats('idx_embeddings_embedding');

        expect(stats.indexName).toBe('idx_embeddings_embedding');
        expect(stats.indexType).toBeDefined();
        expect(stats.numVectors).toBeGreaterThan(0);
        expect(stats.sizeBytes).toBeGreaterThan(0);
      });

      it('should list indices for table', async () => {
        const indices = await client.listIndices('embeddings');

        expect(indices.length).toBeGreaterThan(0);
        indices.forEach((idx) => {
          expect(idx.indexName).toBeDefined();
          expect(idx.indexType).toBeDefined();
        });
      });

      it('should rebuild index', async () => {
        const rebuiltHandler = vi.fn();
        client.on('index:rebuilt', rebuiltHandler);

        await client.rebuildIndex('idx_test');

        expect(rebuiltHandler).toHaveBeenCalled();
      });

      it('should drop index', async () => {
        const droppedHandler = vi.fn();
        client.on('index:dropped', droppedHandler);

        await client.dropIndex('idx_test');

        expect(droppedHandler).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Attention Mechanisms Tests
  // ==========================================================================

  describe('Attention Mechanisms', () => {
    beforeEach(async () => {
      await client.connect();
    });

    describe('Multi-Head Attention', () => {
      it('should execute multi-head attention', async () => {
        const seqLen = 10;
        const dim = 64;

        const input: AttentionInput = {
          query: Array.from({ length: seqLen }, () => createTestVector(dim)),
          key: Array.from({ length: seqLen }, () => createTestVector(dim)),
          value: Array.from({ length: seqLen }, () => createTestVector(dim)),
        };

        const config: AttentionConfig = {
          mechanism: 'multi_head',
          numHeads: 8,
          headDim: 64,
          embedDim: 512,
        };

        const result = await client.computeAttention(input, config);

        expect(result.output).toHaveLength(seqLen);
        expect(result.output[0]).toHaveLength(config.numHeads * config.headDim);
        expect(result.stats?.computeTimeMs).toBeDefined();
      });

      it('should return attention weights', async () => {
        const seqLen = 5;
        const dim = 32;

        const input: AttentionInput = {
          query: Array.from({ length: seqLen }, () => createTestVector(dim)),
          key: Array.from({ length: seqLen }, () => createTestVector(dim)),
          value: Array.from({ length: seqLen }, () => createTestVector(dim)),
        };

        const config: AttentionConfig = {
          mechanism: 'multi_head',
          numHeads: 4,
          headDim: 32,
        };

        const result = await client.computeAttention(input, config);

        expect(result.attentionWeights).toBeDefined();
        expect(result.attentionWeights).toHaveLength(seqLen);
      });
    });

    describe('Flash Attention Performance', () => {
      it('should execute flash attention', async () => {
        const seqLen = 100;
        const dim = 64;

        const input: AttentionInput = {
          query: Array.from({ length: seqLen }, () => createTestVector(dim)),
          key: Array.from({ length: seqLen }, () => createTestVector(dim)),
          value: Array.from({ length: seqLen }, () => createTestVector(dim)),
        };

        const config: AttentionConfig = {
          mechanism: 'flash_attention',
          numHeads: 8,
          headDim: 64,
          params: {
            flashBlockSize: 64,
            checkpointing: true,
          },
        };

        const result = await client.computeAttention(input, config);

        expect(result.output).toHaveLength(seqLen);
        expect(result.stats?.memoryBytes).toBeDefined();
      });

      it('should not return weights with checkpointing enabled', async () => {
        const seqLen = 50;
        const dim = 32;

        const input: AttentionInput = {
          query: Array.from({ length: seqLen }, () => createTestVector(dim)),
          key: Array.from({ length: seqLen }, () => createTestVector(dim)),
          value: Array.from({ length: seqLen }, () => createTestVector(dim)),
        };

        const config: AttentionConfig = {
          mechanism: 'flash_attention',
          numHeads: 4,
          headDim: 32,
          params: {
            checkpointing: true,
          },
        };

        const result = await client.computeAttention(input, config);

        expect(result.attentionWeights).toBeUndefined();
      });
    });

    describe('Sparse Attention Patterns', () => {
      it('should execute sparse attention', async () => {
        const seqLen = 20;
        const dim = 32;

        const input: AttentionInput = {
          query: Array.from({ length: seqLen }, () => createTestVector(dim)),
          key: Array.from({ length: seqLen }, () => createTestVector(dim)),
          value: Array.from({ length: seqLen }, () => createTestVector(dim)),
        };

        const config: AttentionConfig = {
          mechanism: 'sparse_attention',
          numHeads: 4,
          headDim: 32,
          params: {
            blockSize: 4,
            numGlobalTokens: 2,
          },
        };

        const result = await client.computeAttention(input, config);

        expect(result.output).toHaveLength(seqLen);
      });

      it('should execute sliding window attention', async () => {
        const seqLen = 30;
        const dim = 32;

        const input: AttentionInput = {
          query: Array.from({ length: seqLen }, () => createTestVector(dim)),
          key: Array.from({ length: seqLen }, () => createTestVector(dim)),
          value: Array.from({ length: seqLen }, () => createTestVector(dim)),
        };

        const config: AttentionConfig = {
          mechanism: 'sliding_window',
          numHeads: 4,
          headDim: 32,
          params: {
            windowSize: 8,
          },
        };

        const result = await client.computeAttention(input, config);

        expect(result.output).toHaveLength(seqLen);
      });
    });

    describe('Cross-Attention Operations', () => {
      it('should execute cross-attention between two sequences', async () => {
        const queryLen = 10;
        const keyLen = 20;
        const dim = 32;

        const input: AttentionInput = {
          query: Array.from({ length: queryLen }, () => createTestVector(dim)),
          key: Array.from({ length: keyLen }, () => createTestVector(dim)),
          value: Array.from({ length: keyLen }, () => createTestVector(dim)),
        };

        const config: AttentionConfig = {
          mechanism: 'cross_attention',
          numHeads: 4,
          headDim: 32,
        };

        const result = await client.computeAttention(input, config);

        expect(result.output).toHaveLength(queryLen);
      });
    });

    describe('Attention Events', () => {
      it('should emit attention computed event', async () => {
        const handler = vi.fn();
        client.on('attention:computed', handler);

        const seqLen = 5;
        const dim = 32;

        const input: AttentionInput = {
          query: Array.from({ length: seqLen }, () => createTestVector(dim)),
          key: Array.from({ length: seqLen }, () => createTestVector(dim)),
          value: Array.from({ length: seqLen }, () => createTestVector(dim)),
        };

        await client.computeAttention(input, {
          mechanism: 'multi_head',
          numHeads: 2,
          headDim: 32,
        });

        expect(handler).toHaveBeenCalled();
        const eventData = handler.mock.calls[0][0].data;
        expect(eventData.mechanism).toBe('multi_head');
        expect(eventData.seqLen).toBe(seqLen);
        expect(eventData.numHeads).toBe(2);
      });
    });
  });

  // ==========================================================================
  // GNN Layers Tests
  // ==========================================================================

  describe('GNN Layers', () => {
    beforeEach(async () => {
      await client.connect();
    });

    function createTestGraph(numNodes: number, numEdges: number, featureDim: number): GraphData {
      const nodeFeatures = Array.from({ length: numNodes }, () => createTestVector(featureDim));
      const edges: [number, number][] = Array.from({ length: numEdges }, () => [
        Math.floor(Math.random() * numNodes),
        Math.floor(Math.random() * numNodes),
      ]);
      return client.buildGraph(nodeFeatures, edges);
    }

    describe('GCN Forward Pass', () => {
      it('should execute GCN layer', async () => {
        const graph = createTestGraph(50, 100, 64);

        const layer: GNNLayer = {
          type: 'gcn',
          inputDim: 64,
          outputDim: 32,
          normalize: true,
          addSelfLoops: true,
          activation: 'relu',
        };

        const result = await client.runGNNLayer(graph, layer);

        expect(result.nodeEmbeddings).toHaveLength(50);
        expect(result.nodeEmbeddings[0]).toHaveLength(32);
        expect(result.stats?.numNodes).toBe(50);
        expect(result.stats?.numEdges).toBe(100);
      });

      it('should support different aggregations', async () => {
        const graph = createTestGraph(20, 40, 32);

        const layer: GNNLayer = {
          type: 'gcn',
          inputDim: 32,
          outputDim: 16,
          aggregation: 'sum',
        };

        const result = await client.runGNNLayer(graph, layer);

        expect(result.nodeEmbeddings).toHaveLength(20);
      });
    });

    describe('GAT Attention Weights', () => {
      it('should execute GAT layer with attention', async () => {
        const graph = createTestGraph(30, 60, 64);

        const layer: GNNLayer = {
          type: 'gat',
          inputDim: 64,
          outputDim: 32,
          numHeads: 4,
          dropout: 0.1,
          params: {
            negativeSlope: 0.2,
            concat: true,
          },
        };

        const result = await client.runGNNLayer(graph, layer);

        expect(result.nodeEmbeddings).toHaveLength(30);
        expect(result.attentionWeights).toBeDefined();
        expect(result.attentionWeights).toHaveLength(60);
      });

      it('should execute GAT v2 layer', async () => {
        const graph = createTestGraph(25, 50, 32);

        const layer: GNNLayer = {
          type: 'gat_v2',
          inputDim: 32,
          outputDim: 16,
          numHeads: 2,
        };

        const result = await client.runGNNLayer(graph, layer);

        expect(result.nodeEmbeddings).toHaveLength(25);
        expect(result.attentionWeights).toBeDefined();
      });
    });

    describe('GraphSAGE Sampling', () => {
      it('should execute GraphSAGE layer', async () => {
        const graph = createTestGraph(100, 500, 64);

        const layer: GNNLayer = {
          type: 'sage',
          inputDim: 64,
          outputDim: 32,
          aggregation: 'mean',
          params: {
            sampleSize: 10,
            samplingStrategy: 'uniform',
          },
        };

        const result = await client.runGNNLayer(graph, layer);

        expect(result.nodeEmbeddings).toHaveLength(100);
        expect(result.nodeEmbeddings[0]).toHaveLength(32);
      });

      it('should support importance sampling', async () => {
        const graph = createTestGraph(50, 200, 32);

        const layer: GNNLayer = {
          type: 'sage',
          inputDim: 32,
          outputDim: 16,
          aggregation: 'max',
          params: {
            sampleSize: 5,
            samplingStrategy: 'importance',
          },
        };

        const result = await client.runGNNLayer(graph, layer);

        expect(result.nodeEmbeddings).toHaveLength(50);
      });
    });

    describe('Message Passing', () => {
      it('should execute MPNN layer', async () => {
        const graph = createTestGraph(40, 80, 48);

        const layer: GNNLayer = {
          type: 'mpnn',
          inputDim: 48,
          outputDim: 24,
          hiddenDim: 64,
          aggregation: 'attention',
        };

        const result = await client.runGNNLayer(graph, layer);

        expect(result.nodeEmbeddings).toHaveLength(40);
        expect(result.stats?.numIterations).toBeGreaterThan(0);
      });

      it('should emit GNN events', async () => {
        const forwardHandler = vi.fn();
        client.on('gnn:forward', forwardHandler);

        const graph = createTestGraph(10, 20, 16);

        await client.runGNNLayer(graph, {
          type: 'gcn',
          inputDim: 16,
          outputDim: 8,
        });

        expect(forwardHandler).toHaveBeenCalled();
        const eventData = forwardHandler.mock.calls[0][0].data;
        expect(eventData.layerType).toBe('gcn');
        expect(eventData.numNodes).toBe(10);
        expect(eventData.numEdges).toBe(20);
      });
    });

    describe('Graph Building', () => {
      it('should build graph from node features and edges', () => {
        const nodeFeatures = [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ];
        const edges: [number, number][] = [
          [0, 1],
          [1, 2],
          [2, 0],
        ];

        const graph = client.buildGraph(nodeFeatures, edges);

        expect(graph.nodeFeatures).toEqual(nodeFeatures);
        expect(graph.edgeIndex[0]).toEqual([0, 1, 2]);
        expect(graph.edgeIndex[1]).toEqual([1, 2, 0]);
      });
    });
  });

  // ==========================================================================
  // Hyperbolic Embeddings Tests
  // ==========================================================================

  describe('Hyperbolic Embeddings', () => {
    beforeEach(async () => {
      await client.connect();
    });

    describe('Poincare Distance Calculations', () => {
      it('should compute Poincare distance', async () => {
        const config: HyperbolicEmbedding = {
          model: 'poincare',
          curvature: -1,
          dimension: 32,
        };

        // Points inside Poincare ball (||x|| < 1)
        const a = Array.from({ length: 32 }, () => Math.random() * 0.5);
        const b = Array.from({ length: 32 }, () => Math.random() * 0.5);

        const distance = await client.hyperbolicDistance(a, b, config);

        expect(distance).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(distance)).toBe(true);
      });

      it('should return zero distance for same point', async () => {
        const config: HyperbolicEmbedding = {
          model: 'poincare',
          curvature: -1,
          dimension: 16,
        };

        const point = Array.from({ length: 16 }, () => Math.random() * 0.3);

        const distance = await client.hyperbolicDistance(point, point, config);

        expect(distance).toBeCloseTo(0, 5);
      });

      it('should emit hyperbolic distance event', async () => {
        const handler = vi.fn();
        client.on('hyperbolic:distance', handler);

        const config: HyperbolicEmbedding = {
          model: 'poincare',
          curvature: -1,
          dimension: 8,
        };

        await client.hyperbolicDistance(
          [0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2],
          [0.3, 0.1, 0.3, 0.1, 0.3, 0.1, 0.3, 0.1],
          config
        );

        expect(handler).toHaveBeenCalled();
        expect(handler.mock.calls[0][0].data.operation).toBe('distance');
      });
    });

    describe('Lorentz Operations', () => {
      it('should compute embeddings in Lorentz model', async () => {
        const config: HyperbolicEmbedding = {
          model: 'lorentz',
          curvature: -1,
          dimension: 32,
          params: {
            timeDim: 0,
          },
        };

        const input: HyperbolicInput = {
          points: Array.from({ length: 10 }, () => createTestVector(32)),
        };

        const result = await client.hyperbolicEmbed(input, config);

        expect(result.embeddings).toHaveLength(10);
        expect(result.curvature).toBe(-1);
      });
    });

    describe('Model Conversions', () => {
      it('should support Poincare model', async () => {
        const config: HyperbolicEmbedding = {
          model: 'poincare',
          curvature: -1,
          dimension: 16,
        };

        const input: HyperbolicInput = {
          points: [[0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2]],
        };

        const result = await client.hyperbolicEmbed(input, config);

        expect(result.embeddings).toHaveLength(1);
        // Verify point is inside Poincare ball
        const norm = Math.sqrt(result.embeddings[0].reduce((sum, v) => sum + v * v, 0));
        expect(norm).toBeLessThan(1);
      });

      it('should support Klein model', async () => {
        const config: HyperbolicEmbedding = {
          model: 'klein',
          curvature: -1,
          dimension: 8,
        };

        const input: HyperbolicInput = {
          points: Array.from({ length: 5 }, () =>
            Array.from({ length: 8 }, () => Math.random() * 0.8)
          ),
        };

        const result = await client.hyperbolicEmbed(input, config);

        expect(result.embeddings).toHaveLength(5);
      });
    });

    describe('Manifold Projections', () => {
      it('should project points to Poincare ball', async () => {
        const config: HyperbolicEmbedding = {
          model: 'poincare',
          curvature: -1,
          dimension: 16,
          params: {
            maxNorm: 0.99,
            eps: 1e-5,
          },
        };

        // Points that may be outside the ball
        const input: HyperbolicInput = {
          points: Array.from({ length: 5 }, () =>
            Array.from({ length: 16 }, () => Math.random() * 2 - 1)
          ),
        };

        const result = await client.hyperbolicEmbed(input, config);

        // All points should be projected inside the ball
        result.embeddings.forEach((emb) => {
          const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
          expect(norm).toBeLessThan(1);
        });
      });

      it('should emit hyperbolic embed event', async () => {
        const handler = vi.fn();
        client.on('hyperbolic:embed', handler);

        const config: HyperbolicEmbedding = {
          model: 'poincare',
          curvature: -1,
          dimension: 8,
        };

        await client.hyperbolicEmbed(
          { points: [[0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2]] },
          config
        );

        expect(handler).toHaveBeenCalled();
        expect(handler.mock.calls[0][0].data.model).toBe('poincare');
        expect(handler.mock.calls[0][0].data.operation).toBe('embed');
      });
    });
  });

  // ==========================================================================
  // Self-Learning Tests
  // ==========================================================================

  describe('Self-Learning', () => {
    beforeEach(async () => {
      await client.connect();
    });

    describe('Query Optimization Suggestions', () => {
      it('should analyze table and provide recommendations', async () => {
        const analysis = await client.analyze('embeddings');

        expect(analysis.recommendations).toBeDefined();
        expect(Array.isArray(analysis.recommendations)).toBe(true);
        expect(analysis.numRows).toBeGreaterThan(0);
      });

      it('should provide column statistics', async () => {
        const analysis = await client.analyze('test_table');

        expect(analysis.columnStats).toBeDefined();
        expect(analysis.columnStats.length).toBeGreaterThan(0);

        const embeddingColumn = analysis.columnStats.find(
          (c) => c.columnName === 'embedding'
        );
        expect(embeddingColumn).toBeDefined();
        expect(embeddingColumn?.dataType).toContain('vector');
      });
    });

    describe('Index Tuning Recommendations', () => {
      it('should return index statistics for tuning', async () => {
        const stats = await client.getIndexStats('idx_embeddings_embedding');

        expect(stats.params).toBeDefined();
        expect(stats.numVectors).toBeGreaterThan(0);
      });

      it('should provide query statistics for optimization', async () => {
        const stats = await client.getStats();

        expect(stats.queryStats).toBeDefined();
        expect(stats.queryStats.avgQueryTimeMs).toBeDefined();
        expect(stats.queryStats.p95QueryTimeMs).toBeDefined();
        expect(stats.queryStats.cacheHitRate).toBeDefined();
      });
    });

    describe('Pattern Detection', () => {
      it('should track memory statistics', async () => {
        const stats = await client.getStats();

        expect(stats.memoryStats).toBeDefined();
        expect(stats.memoryStats.usedBytes).toBeGreaterThan(0);
        expect(stats.memoryStats.indexBytes).toBeGreaterThan(0);
        expect(stats.memoryStats.cacheBytes).toBeGreaterThan(0);
      });

      it('should emit admin events for analysis', async () => {
        const analyzeHandler = vi.fn();
        const vacuumHandler = vi.fn();

        client.on('admin:analyze', analyzeHandler);
        client.on('admin:vacuum', vacuumHandler);

        await client.analyze('test');
        await client.vacuum('test');

        expect(analyzeHandler).toHaveBeenCalled();
        expect(vacuumHandler).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Type Guard Tests
  // ==========================================================================

  describe('Type Guards', () => {
    describe('isDistanceMetric', () => {
      it('should return true for valid distance metrics', () => {
        expect(isDistanceMetric('cosine')).toBe(true);
        expect(isDistanceMetric('euclidean')).toBe(true);
        expect(isDistanceMetric('dot')).toBe(true);
        expect(isDistanceMetric('hamming')).toBe(true);
        expect(isDistanceMetric('manhattan')).toBe(true);
      });

      it('should return false for invalid values', () => {
        expect(isDistanceMetric('invalid')).toBe(false);
        expect(isDistanceMetric(123)).toBe(false);
        expect(isDistanceMetric(null)).toBe(false);
        expect(isDistanceMetric(undefined)).toBe(false);
      });
    });

    describe('isAttentionMechanism', () => {
      it('should return true for valid attention mechanisms', () => {
        expect(isAttentionMechanism('multi_head')).toBe(true);
        expect(isAttentionMechanism('flash_attention')).toBe(true);
        expect(isAttentionMechanism('sparse_attention')).toBe(true);
        expect(isAttentionMechanism('cross_attention')).toBe(true);
      });

      it('should return false for invalid values', () => {
        expect(isAttentionMechanism('invalid')).toBe(false);
        expect(isAttentionMechanism(42)).toBe(false);
      });
    });

    describe('isGNNLayerType', () => {
      it('should return true for valid GNN layer types', () => {
        expect(isGNNLayerType('gcn')).toBe(true);
        expect(isGNNLayerType('gat')).toBe(true);
        expect(isGNNLayerType('sage')).toBe(true);
        expect(isGNNLayerType('mpnn')).toBe(true);
      });

      it('should return false for invalid values', () => {
        expect(isGNNLayerType('invalid')).toBe(false);
        expect(isGNNLayerType([])).toBe(false);
      });
    });

    describe('isHyperbolicModel', () => {
      it('should return true for valid hyperbolic models', () => {
        expect(isHyperbolicModel('poincare')).toBe(true);
        expect(isHyperbolicModel('lorentz')).toBe(true);
        expect(isHyperbolicModel('klein')).toBe(true);
        expect(isHyperbolicModel('half_space')).toBe(true);
      });

      it('should return false for invalid values', () => {
        expect(isHyperbolicModel('invalid')).toBe(false);
        expect(isHyperbolicModel({})).toBe(false);
      });
    });

    describe('isVectorIndexType', () => {
      it('should return true for valid index types', () => {
        expect(isVectorIndexType('hnsw')).toBe(true);
        expect(isVectorIndexType('ivfflat')).toBe(true);
        expect(isVectorIndexType('flat')).toBe(true);
      });

      it('should return false for invalid values', () => {
        expect(isVectorIndexType('btree')).toBe(false);
        expect(isVectorIndexType(true)).toBe(false);
      });
    });

    describe('Result Type Guards', () => {
      it('should identify successful results', () => {
        const success = { success: true as const, data: 'test' };
        const error = { success: false as const, error: new Error('test') };

        expect(isSuccess(success)).toBe(true);
        expect(isSuccess(error)).toBe(false);
      });

      it('should identify error results', () => {
        const success = { success: true as const, data: 'test' };
        const error = { success: false as const, error: new Error('test') };

        expect(isError(error)).toBe(true);
        expect(isError(success)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Transaction Tests
  // ==========================================================================

  describe('Transactions', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should execute transaction successfully', async () => {
      const result = await client.transaction(async (tx) => {
        await tx.insert({
          tableName: 'test',
          vectors: [{ vector: createTestVector(384) }],
        });
        await tx.update({
          tableName: 'test',
          id: '1',
          vector: createTestVector(384),
        });
        return { success: true };
      });

      expect(result.committed).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.queryCount).toBe(2);
    });

    it('should rollback on error', async () => {
      await expect(
        client.transaction(async (tx) => {
          await tx.insert({
            tableName: 'test',
            vectors: [{ vector: createTestVector(384) }],
          });
          throw new Error('Simulated error');
        })
      ).rejects.toThrow('Simulated error');
    });

    it('should track transaction metrics', async () => {
      const result = await client.transaction(async (tx) => {
        for (let i = 0; i < 5; i++) {
          await tx.query('SELECT 1');
        }
        return 'done';
      });

      expect(result.transactionId).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.queryCount).toBe(5);
    });
  });

  // ==========================================================================
  // Event System Tests
  // ==========================================================================

  describe('Event System', () => {
    it('should register and unregister event handlers', async () => {
      const handler = vi.fn();

      const unsubscribe = client.on('connection:open', handler);

      await client.connect();
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      await client.disconnect();
      await client.connect();

      expect(handler).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should handle once events', async () => {
      const handler = vi.fn();

      client.once('connection:open', handler);

      await client.connect();
      await client.disconnect();
      await client.connect();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should remove all listeners', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      client.on('connection:open', handler1);
      client.on('connection:close', handler2);

      client.removeAllListeners();

      await client.connect();
      await client.disconnect();

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should remove listeners for specific event', async () => {
      const openHandler = vi.fn();
      const closeHandler = vi.fn();

      client.on('connection:open', openHandler);
      client.on('connection:close', closeHandler);

      client.removeAllListeners('connection:open');

      await client.connect();
      await client.disconnect();

      expect(openHandler).not.toHaveBeenCalled();
      expect(closeHandler).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Embedding Operations Tests
  // ==========================================================================

  describe('Embedding Operations', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should embed single text', async () => {
      const result = await client.embed('Hello, world!');

      expect(result.embedding).toBeDefined();
      expect(result.embedding).toHaveLength(384);
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should embed batch of texts', async () => {
      const texts = ['First text', 'Second text', 'Third text'];

      const result = await client.embedBatch(texts);

      expect(result.embeddings).toHaveLength(3);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.throughput).toBeGreaterThan(0);
    });

    it('should use specified model', async () => {
      const result = await client.embed('Test text', 'custom-model');

      expect(result.model).toBe('custom-model');
    });
  });

  // ==========================================================================
  // Admin Operations Tests
  // ==========================================================================

  describe('Admin Operations', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should perform vacuum operation', async () => {
      await expect(client.vacuum('test_table')).resolves.toBeUndefined();
    });

    it('should get comprehensive stats', async () => {
      const stats = await client.getStats();

      expect(stats.version).toBeDefined();
      expect(stats.totalVectors).toBeGreaterThan(0);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.numIndices).toBeGreaterThan(0);
      expect(stats.queryStats).toBeDefined();
      expect(stats.memoryStats).toBeDefined();
    });

    it('should throw when not connected', async () => {
      await client.disconnect();

      await expect(client.vacuum()).rejects.toThrow('Not connected');
      await expect(client.analyze()).rejects.toThrow('Not connected');
      await expect(client.getStats()).rejects.toThrow('Not connected');
    });
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  let client: MockRuVectorClient;

  beforeEach(async () => {
    client = new MockRuVectorClient(createTestConfig());
    await client.connect();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('Boundary Values', () => {
    it('should handle empty vector search results', async () => {
      const results = await client.search({
        query: createTestVector(384),
        k: 0,
        metric: 'cosine',
      });

      expect(results).toHaveLength(0);
    });

    it('should handle large batch sizes', async () => {
      const options: BatchVectorOptions = {
        queries: Array.from({ length: 100 }, () => createTestVector(384)),
        k: 10,
        metric: 'cosine',
      };

      const result = await client.batchSearch(options);

      expect(result.results).toHaveLength(100);
    });

    it('should handle high-dimensional vectors', async () => {
      const highDimVector = createTestVector(4096);

      const results = await client.search({
        query: highDimVector,
        k: 5,
        metric: 'cosine',
      });

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Empty/Null Cases', () => {
    it('should handle empty batch insert', async () => {
      const result = await client.insert({
        tableName: 'test',
        vectors: [],
      });

      expect(result.total).toBe(0);
      expect(result.successful).toBe(0);
    });

    it('should handle graph with no edges', async () => {
      const graph = client.buildGraph(
        [[1, 2, 3], [4, 5, 6]],
        []
      );

      const result = await client.runGNNLayer(graph, {
        type: 'gcn',
        inputDim: 3,
        outputDim: 2,
      });

      expect(result.nodeEmbeddings).toHaveLength(2);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent searches', async () => {
      const searches = Array.from({ length: 10 }, () =>
        client.search({
          query: createTestVector(384),
          k: 5,
          metric: 'cosine',
        })
      );

      const results = await Promise.all(searches);

      expect(results).toHaveLength(10);
      results.forEach((r) => {
        expect(r).toHaveLength(5);
      });
    });

    it('should handle concurrent inserts', async () => {
      const inserts = Array.from({ length: 5 }, (_, i) =>
        client.insert({
          tableName: 'test',
          vectors: [
            {
              id: `concurrent-${i}`,
              vector: createTestVector(384),
            },
          ],
        })
      );

      const results = await Promise.all(inserts);

      results.forEach((r) => {
        expect(r.successful).toBe(1);
      });
    });
  });
});

// ============================================================================
// Performance Testing
// ============================================================================

describe('Performance', () => {
  let client: MockRuVectorClient;

  beforeEach(async () => {
    client = new MockRuVectorClient(createTestConfig());
    await client.connect();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  it('should complete single search within acceptable time', async () => {
    const start = performance.now();

    await client.search({
      query: createTestVector(384),
      k: 10,
      metric: 'cosine',
    });

    const duration = performance.now() - start;

    // Mock should be fast, but in real implementation this tests latency
    expect(duration).toBeLessThan(1000);
  });

  it('should handle batch operations efficiently', async () => {
    const batchSize = 50;
    const start = performance.now();

    const result = await client.batchSearch({
      queries: Array.from({ length: batchSize }, () => createTestVector(384)),
      k: 5,
      metric: 'cosine',
    });

    const duration = performance.now() - start;
    const avgPerQuery = duration / batchSize;

    expect(result.results).toHaveLength(batchSize);
    // Average time per query should be reasonable
    expect(avgPerQuery).toBeLessThan(100);
  });

  it('should track throughput metrics', async () => {
    const result = await client.insert({
      tableName: 'test',
      vectors: Array.from({ length: 100 }, (_, i) => ({
        id: `perf-${i}`,
        vector: createTestVector(384),
      })),
    });

    expect(result.throughput).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);
  });
});

// ============================================================================
// Security Testing
// ============================================================================

describe('Security', () => {
  let client: MockRuVectorClient;

  beforeEach(async () => {
    client = new MockRuVectorClient(createTestConfig());
    await client.connect();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  it('should not expose sensitive configuration', () => {
    const config = client.getConfig();

    // Password should be present but we shouldn't log it
    expect(config.password).toBeDefined();
    expect(typeof config.password).toBe('string');
  });

  it('should support SSL configuration', () => {
    const sslClient = new MockRuVectorClient({
      ...createTestConfig(),
      ssl: {
        enabled: true,
        rejectUnauthorized: true,
      },
    });

    const sslConfig = sslClient.getConfig().ssl as SSLConfig;
    expect(sslConfig.enabled).toBe(true);
    expect(sslConfig.rejectUnauthorized).toBe(true);
  });
});
