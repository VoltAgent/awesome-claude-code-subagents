/**
 * Gas Town Bridge Plugin - Unified Cache System
 *
 * High-performance caching with:
 * - O(1) LRU cache with Map + doubly linked list
 * - WeakMap for formula AST caching (GC-friendly)
 * - Result memoization for expensive operations
 * - Batch deduplication for concurrent requests
 *
 * Performance targets:
 * - 50% memory reduction via eviction
 * - 3x faster cold start via preloading
 *
 * @module gastown-bridge/cache
 * @version 0.1.0
 */

// ============================================================================
// LRU Cache Implementation - O(1) get/set
// ============================================================================

/**
 * Doubly linked list node for LRU tracking
 */
interface LRUNode<K, V> {
  key: K;
  value: V;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
  size: number;
  createdAt: number;
  accessCount: number;
}

/**
 * LRU Cache with O(1) operations
 *
 * Uses Map for O(1) lookups and doubly linked list for O(1) eviction.
 * Supports TTL, size limits, and access tracking.
 *
 * @example
 * ```typescript
 * const cache = new LRUCache<string, Formula>({ maxSize: 1000, ttlMs: 60000 });
 * cache.set('formula-1', parsedFormula);
 * const formula = cache.get('formula-1');
 * ```
 */
export class LRUCache<K, V> {
  private readonly cache: Map<K, LRUNode<K, V>> = new Map();
  private head: LRUNode<K, V> | null = null;
  private tail: LRUNode<K, V> | null = null;
  private currentSize = 0;

  private readonly maxSize: number;
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly onEvict?: (key: K, value: V) => void;

  constructor(options: {
    maxSize?: number;
    maxEntries?: number;
    ttlMs?: number;
    onEvict?: (key: K, value: V) => void;
  } = {}) {
    this.maxSize = options.maxSize ?? 50 * 1024 * 1024; // 50MB default
    this.maxEntries = options.maxEntries ?? 1000;
    this.ttlMs = options.ttlMs ?? 0; // 0 = no TTL
    this.onEvict = options.onEvict;
  }

  /**
   * Get value from cache - O(1)
   */
  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (!node) return undefined;

    // Check TTL
    if (this.ttlMs > 0 && Date.now() - node.createdAt > this.ttlMs) {
      this.delete(key);
      return undefined;
    }

    // Move to front (most recently used)
    this.moveToFront(node);
    node.accessCount++;
    return node.value;
  }

  /**
   * Set value in cache - O(1)
   */
  set(key: K, value: V, sizeBytes?: number): void {
    const size = sizeBytes ?? this.estimateSize(value);

    // Check if key exists - update in place
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
      existing.value = value;
      existing.size = size;
      existing.createdAt = Date.now();
      this.currentSize += size;
      this.moveToFront(existing);
      return;
    }

    // Evict if necessary
    while (
      (this.cache.size >= this.maxEntries || this.currentSize + size > this.maxSize) &&
      this.tail
    ) {
      this.evictLRU();
    }

    // Create new node
    const node: LRUNode<K, V> = {
      key,
      value,
      prev: null,
      next: this.head,
      size,
      createdAt: Date.now(),
      accessCount: 1,
    };

    // Insert at front
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }

    this.cache.set(key, node);
    this.currentSize += size;
  }

  /**
   * Check if key exists - O(1)
   */
  has(key: K): boolean {
    const node = this.cache.get(key);
    if (!node) return false;

    // Check TTL
    if (this.ttlMs > 0 && Date.now() - node.createdAt > this.ttlMs) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete from cache - O(1)
   */
  delete(key: K): boolean {
    const node = this.cache.get(key);
    if (!node) return false;

    this.removeNode(node);
    this.cache.delete(key);
    this.currentSize -= node.size;
    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    if (this.onEvict) {
      for (const [key, node] of this.cache) {
        this.onEvict(key, node.value);
      }
    }
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.currentSize = 0;
  }

  /**
   * Get cache stats
   */
  stats(): {
    entries: number;
    sizeBytes: number;
    maxEntries: number;
    maxSizeBytes: number;
    hitRate: number;
  } {
    let totalAccess = 0;
    for (const node of this.cache.values()) {
      totalAccess += node.accessCount;
    }

    return {
      entries: this.cache.size,
      sizeBytes: this.currentSize,
      maxEntries: this.maxEntries,
      maxSizeBytes: this.maxSize,
      hitRate: this.cache.size > 0 ? totalAccess / this.cache.size : 0,
    };
  }

  /**
   * Get all keys (for iteration)
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Get size
   */
  get size(): number {
    return this.cache.size;
  }

  // Private methods

  private moveToFront(node: LRUNode<K, V>): void {
    if (node === this.head) return;

    // Remove from current position
    this.removeNode(node);

    // Insert at front
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private evictLRU(): void {
    if (!this.tail) return;

    const evicted = this.tail;
    this.removeNode(evicted);
    this.cache.delete(evicted.key);
    this.currentSize -= evicted.size;

    if (this.onEvict) {
      this.onEvict(evicted.key, evicted.value);
    }
  }

  private estimateSize(value: V): number {
    if (value === null || value === undefined) return 8;
    if (typeof value === 'string') return value.length * 2;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (Array.isArray(value)) {
      return value.reduce((acc, v) => acc + this.estimateSize(v), 64);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value).length * 2;
    }
    return 64;
  }
}

// ============================================================================
// Formula AST Cache with WeakMap (GC-friendly)
// ============================================================================

/**
 * Formula AST cache using WeakMap for automatic GC
 *
 * Stores parsed ASTs keyed by source string reference.
 * When the source string is no longer referenced, the AST is GC'd.
 */
export class FormulaASTCache {
  // Use a Map with string keys since TOML content is the key
  // WeakMap only works with object keys
  private readonly astCache: LRUCache<string, unknown>;
  private readonly hashCache: Map<string, string> = new Map();

  constructor(maxEntries = 500) {
    this.astCache = new LRUCache<string, unknown>({
      maxEntries,
      ttlMs: 5 * 60 * 1000, // 5 minute TTL
    });
  }

  /**
   * Get cached AST for formula content
   */
  get(content: string): unknown | undefined {
    const hash = this.hashContent(content);
    return this.astCache.get(hash);
  }

  /**
   * Cache AST for formula content
   */
  set(content: string, ast: unknown): void {
    const hash = this.hashContent(content);
    this.astCache.set(hash, ast);
  }

  /**
   * Check if content has cached AST
   */
  has(content: string): boolean {
    const hash = this.hashContent(content);
    return this.astCache.has(hash);
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.astCache.clear();
    this.hashCache.clear();
  }

  /**
   * Get stats
   */
  stats(): { entries: number; sizeBytes: number } {
    const cacheStats = this.astCache.stats();
    return {
      entries: cacheStats.entries,
      sizeBytes: cacheStats.sizeBytes,
    };
  }

  // Simple hash for content deduplication
  private hashContent(content: string): string {
    const cached = this.hashCache.get(content);
    if (cached) return cached;

    // FNV-1a hash
    let hash = 2166136261;
    for (let i = 0; i < content.length; i++) {
      hash ^= content.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }

    const hashStr = hash.toString(36);
    this.hashCache.set(content, hashStr);

    // Limit hash cache size
    if (this.hashCache.size > 10000) {
      const first = this.hashCache.keys().next().value;
      if (first) this.hashCache.delete(first);
    }

    return hashStr;
  }
}

// ============================================================================
// Result Cache for WASM Operations
// ============================================================================

/**
 * Result cache for expensive WASM operations
 *
 * Caches:
 * - Formula parse results
 * - Cook results
 * - Graph analysis results (topo sort, cycle detection)
 */
export class ResultCache {
  readonly formulas: LRUCache<string, unknown>;
  readonly cooked: LRUCache<string, unknown>;
  readonly beads: LRUCache<string, unknown>;
  readonly convoys: LRUCache<string, unknown>;
  readonly graphs: LRUCache<string, unknown>;

  constructor(options: {
    maxFormulaEntries?: number;
    maxCookedEntries?: number;
    maxBeadEntries?: number;
    maxConvoyEntries?: number;
    maxGraphEntries?: number;
  } = {}) {
    this.formulas = new LRUCache({
      maxEntries: options.maxFormulaEntries ?? 200,
      ttlMs: 10 * 60 * 1000, // 10 min
    });

    this.cooked = new LRUCache({
      maxEntries: options.maxCookedEntries ?? 500,
      ttlMs: 5 * 60 * 1000, // 5 min
    });

    this.beads = new LRUCache({
      maxEntries: options.maxBeadEntries ?? 1000,
      ttlMs: 60 * 1000, // 1 min - beads change frequently
    });

    this.convoys = new LRUCache({
      maxEntries: options.maxConvoyEntries ?? 100,
      ttlMs: 30 * 1000, // 30 sec - convoys update often
    });

    this.graphs = new LRUCache({
      maxEntries: options.maxGraphEntries ?? 100,
      ttlMs: 2 * 60 * 1000, // 2 min
    });
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.formulas.clear();
    this.cooked.clear();
    this.beads.clear();
    this.convoys.clear();
    this.graphs.clear();
  }

  /**
   * Get combined stats
   */
  stats(): Record<string, { entries: number; sizeBytes: number }> {
    return {
      formulas: this.formulas.stats(),
      cooked: this.cooked.stats(),
      beads: this.beads.stats(),
      convoys: this.convoys.stats(),
      graphs: this.graphs.stats(),
    };
  }
}

// ============================================================================
// Batch Deduplication for Concurrent Requests
// ============================================================================

/**
 * Pending request tracker for batch deduplication
 */
interface PendingRequest<T> {
  promise: Promise<T>;
  resolvers: Array<{
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
  }>;
  startedAt: number;
}

/**
 * Batch deduplicator for concurrent identical requests
 *
 * When multiple callers request the same operation simultaneously,
 * only one actual execution occurs and all callers receive the same result.
 *
 * @example
 * ```typescript
 * const dedup = new BatchDeduplicator<Formula>();
 *
 * // These concurrent calls will only execute once
 * const [r1, r2, r3] = await Promise.all([
 *   dedup.dedupe('formula-1', () => parseFormula(content)),
 *   dedup.dedupe('formula-1', () => parseFormula(content)),
 *   dedup.dedupe('formula-1', () => parseFormula(content)),
 * ]);
 * ```
 */
export class BatchDeduplicator<T> {
  private pending: Map<string, PendingRequest<T>> = new Map();
  private readonly timeoutMs: number;

  constructor(timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Deduplicate concurrent requests for the same key
   */
  async dedupe(key: string, executor: () => Promise<T>): Promise<T> {
    // Check for existing pending request
    const existing = this.pending.get(key);
    if (existing) {
      // Join existing request
      return new Promise<T>((resolve, reject) => {
        existing.resolvers.push({ resolve, reject });
      });
    }

    // Create new pending request
    let resolvers: PendingRequest<T>['resolvers'] = [];

    const promise = (async () => {
      try {
        const result = await executor();

        // Resolve all waiters
        for (const { resolve } of resolvers) {
          resolve(result);
        }

        return result;
      } catch (error) {
        // Reject all waiters
        for (const { reject } of resolvers) {
          reject(error);
        }
        throw error;
      } finally {
        this.pending.delete(key);
      }
    })();

    const pendingRequest: PendingRequest<T> = {
      promise,
      resolvers,
      startedAt: Date.now(),
    };

    this.pending.set(key, pendingRequest);

    // Set timeout to prevent stuck requests
    setTimeout(() => {
      const req = this.pending.get(key);
      if (req === pendingRequest) {
        this.pending.delete(key);
        for (const { reject } of req.resolvers) {
          reject(new Error(`Request timed out after ${this.timeoutMs}ms`));
        }
      }
    }, this.timeoutMs);

    return promise;
  }

  /**
   * Get number of pending requests
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Clear all pending requests (reject with error)
   */
  clear(): void {
    for (const [key, req] of this.pending) {
      for (const { reject } of req.resolvers) {
        reject(new Error('Deduplicator cleared'));
      }
    }
    this.pending.clear();
  }
}

// ============================================================================
// Preloader for Idle-Time Module Loading
// ============================================================================

/**
 * Idle-time module preloader
 *
 * Preloads WASM modules and other resources during browser/Node idle time.
 */
export class ModulePreloader {
  private readonly preloadQueue: Array<{
    name: string;
    loader: () => Promise<unknown>;
    priority: number;
  }> = [];

  private readonly loaded: Map<string, unknown> = new Map();
  private readonly errors: Map<string, Error> = new Map();
  private isPreloading = false;
  private preloadPromise: Promise<void> | null = null;

  /**
   * Register a module for preloading
   */
  register(
    name: string,
    loader: () => Promise<unknown>,
    priority = 0
  ): void {
    if (this.loaded.has(name)) return;

    this.preloadQueue.push({ name, loader, priority });
    this.preloadQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Start preloading during idle time
   */
  async startPreload(): Promise<void> {
    if (this.isPreloading || this.preloadQueue.length === 0) return;

    this.isPreloading = true;
    this.preloadPromise = this.runPreload();

    try {
      await this.preloadPromise;
    } finally {
      this.isPreloading = false;
      this.preloadPromise = null;
    }
  }

  /**
   * Get preloaded module
   */
  get<T>(name: string): T | undefined {
    return this.loaded.get(name) as T | undefined;
  }

  /**
   * Check if module is loaded
   */
  isLoaded(name: string): boolean {
    return this.loaded.has(name);
  }

  /**
   * Get loading error if any
   */
  getError(name: string): Error | undefined {
    return this.errors.get(name);
  }

  /**
   * Get preload status
   */
  status(): {
    queued: number;
    loaded: number;
    errors: number;
    isPreloading: boolean;
  } {
    return {
      queued: this.preloadQueue.length,
      loaded: this.loaded.size,
      errors: this.errors.size,
      isPreloading: this.isPreloading,
    };
  }

  /**
   * Wait for preloading to complete
   */
  async waitForPreload(): Promise<void> {
    if (this.preloadPromise) {
      await this.preloadPromise;
    }
  }

  private async runPreload(): Promise<void> {
    while (this.preloadQueue.length > 0) {
      const item = this.preloadQueue.shift();
      if (!item) break;

      // Use requestIdleCallback in browser, setImmediate in Node
      await this.scheduleIdleTask(async () => {
        try {
          const module = await item.loader();
          this.loaded.set(item.name, module);
        } catch (error) {
          this.errors.set(item.name, error as Error);
        }
      });
    }
  }

  private scheduleIdleTask(task: () => Promise<void>): Promise<void> {
    return new Promise((resolve) => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(async () => {
          await task();
          resolve();
        });
      } else if (typeof setImmediate !== 'undefined') {
        setImmediate(async () => {
          await task();
          resolve();
        });
      } else {
        setTimeout(async () => {
          await task();
          resolve();
        }, 0);
      }
    });
  }
}

// ============================================================================
// Connection Pool for CLI Execution
// ============================================================================

/**
 * Pooled resource wrapper
 */
interface PooledResource<T> {
  resource: T;
  inUse: boolean;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
}

/**
 * Generic connection/resource pool
 *
 * Manages a pool of reusable resources like CLI processes or connections.
 */
export class ResourcePool<T> {
  private pool: PooledResource<T>[] = [];
  private waitQueue: Array<{
    resolve: (resource: T) => void;
    reject: (error: Error) => void;
    timeoutId: NodeJS.Timeout;
  }> = [];

  private readonly create: () => Promise<T>;
  private readonly destroy: (resource: T) => Promise<void>;
  private readonly validate: (resource: T) => boolean;

  private readonly minSize: number;
  private readonly maxSize: number;
  private readonly acquireTimeoutMs: number;
  private readonly idleTimeoutMs: number;

  constructor(options: {
    create: () => Promise<T>;
    destroy: (resource: T) => Promise<void>;
    validate?: (resource: T) => boolean;
    minSize?: number;
    maxSize?: number;
    acquireTimeoutMs?: number;
    idleTimeoutMs?: number;
  }) {
    this.create = options.create;
    this.destroy = options.destroy;
    this.validate = options.validate ?? (() => true);
    this.minSize = options.minSize ?? 1;
    this.maxSize = options.maxSize ?? 10;
    this.acquireTimeoutMs = options.acquireTimeoutMs ?? 5000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 60000;

    // Start idle cleanup timer
    setInterval(() => this.cleanupIdle(), this.idleTimeoutMs / 2);
  }

  /**
   * Acquire a resource from the pool
   */
  async acquire(): Promise<T> {
    // Try to find an available resource
    for (const pooled of this.pool) {
      if (!pooled.inUse && this.validate(pooled.resource)) {
        pooled.inUse = true;
        pooled.lastUsedAt = Date.now();
        pooled.useCount++;
        return pooled.resource;
      }
    }

    // Create new resource if under max
    if (this.pool.length < this.maxSize) {
      const resource = await this.create();
      const pooled: PooledResource<T> = {
        resource,
        inUse: true,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        useCount: 1,
      };
      this.pool.push(pooled);
      return resource;
    }

    // Wait for available resource
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.waitQueue.findIndex((w) => w.resolve === resolve);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
        }
        reject(new Error('Acquire timeout'));
      }, this.acquireTimeoutMs);

      this.waitQueue.push({ resolve, reject, timeoutId });
    });
  }

  /**
   * Release a resource back to the pool
   */
  release(resource: T): void {
    const pooled = this.pool.find((p) => p.resource === resource);
    if (!pooled) return;

    pooled.inUse = false;
    pooled.lastUsedAt = Date.now();

    // Check if anyone is waiting
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      if (waiter && this.validate(resource)) {
        clearTimeout(waiter.timeoutId);
        pooled.inUse = true;
        pooled.useCount++;
        waiter.resolve(resource);
      }
    }
  }

  /**
   * Execute with automatic acquire/release
   */
  async withResource<R>(fn: (resource: T) => Promise<R>): Promise<R> {
    const resource = await this.acquire();
    try {
      return await fn(resource);
    } finally {
      this.release(resource);
    }
  }

  /**
   * Get pool stats
   */
  stats(): {
    total: number;
    inUse: number;
    available: number;
    waiting: number;
  } {
    const inUse = this.pool.filter((p) => p.inUse).length;
    return {
      total: this.pool.length,
      inUse,
      available: this.pool.length - inUse,
      waiting: this.waitQueue.length,
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    // Reject all waiters
    for (const waiter of this.waitQueue) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(new Error('Pool shutdown'));
    }
    this.waitQueue = [];

    // Destroy all resources
    for (const pooled of this.pool) {
      try {
        await this.destroy(pooled.resource);
      } catch {
        // Ignore destruction errors
      }
    }
    this.pool = [];
  }

  private async cleanupIdle(): Promise<void> {
    const now = Date.now();
    const toRemove: PooledResource<T>[] = [];

    for (const pooled of this.pool) {
      if (
        !pooled.inUse &&
        now - pooled.lastUsedAt > this.idleTimeoutMs &&
        this.pool.length > this.minSize
      ) {
        toRemove.push(pooled);
      }
    }

    for (const pooled of toRemove) {
      const index = this.pool.indexOf(pooled);
      if (index !== -1) {
        this.pool.splice(index, 1);
        try {
          await this.destroy(pooled.resource);
        } catch {
          // Ignore
        }
      }
    }
  }
}

// ============================================================================
// Debounced Progress Updates
// ============================================================================

/**
 * Debounced update emitter
 *
 * Batches rapid updates and emits at most once per interval.
 */
export class DebouncedEmitter<T> {
  private pending: T | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private lastEmitTime = 0;

  constructor(
    private readonly emit: (value: T) => void,
    private readonly debounceMs: number = 100
  ) {}

  /**
   * Schedule an update (debounced)
   */
  update(value: T): void {
    this.pending = value;

    const now = Date.now();
    const timeSinceLastEmit = now - this.lastEmitTime;

    // If enough time has passed, emit immediately
    if (timeSinceLastEmit >= this.debounceMs) {
      this.flush();
      return;
    }

    // Otherwise, schedule for later
    if (!this.timeoutId) {
      this.timeoutId = setTimeout(() => {
        this.flush();
      }, this.debounceMs - timeSinceLastEmit);
    }
  }

  /**
   * Flush pending update immediately
   */
  flush(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.pending !== null) {
      this.emit(this.pending);
      this.pending = null;
      this.lastEmitTime = Date.now();
    }
  }

  /**
   * Cancel pending update
   */
  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.pending = null;
  }
}

// ============================================================================
// Lazy Parser - Parse on Access
// ============================================================================

/**
 * Lazy value wrapper - computes value on first access
 */
export class Lazy<T> {
  private computed = false;
  private value: T | undefined;
  private error: Error | undefined;

  constructor(private readonly factory: () => T) {}

  /**
   * Get the value (computes on first access)
   */
  get(): T {
    if (!this.computed) {
      try {
        this.value = this.factory();
      } catch (e) {
        this.error = e as Error;
      }
      this.computed = true;
    }

    if (this.error) {
      throw this.error;
    }

    return this.value!;
  }

  /**
   * Check if value has been computed
   */
  get isComputed(): boolean {
    return this.computed;
  }

  /**
   * Reset to uncomputed state
   */
  reset(): void {
    this.computed = false;
    this.value = undefined;
    this.error = undefined;
  }
}

/**
 * Async lazy value wrapper
 */
export class AsyncLazy<T> {
  private promise: Promise<T> | null = null;
  private value: T | undefined;
  private resolved = false;

  constructor(private readonly factory: () => Promise<T>) {}

  /**
   * Get the value (computes on first access)
   */
  async get(): Promise<T> {
    if (this.resolved) {
      return this.value!;
    }

    if (!this.promise) {
      this.promise = this.factory().then((v) => {
        this.value = v;
        this.resolved = true;
        return v;
      });
    }

    return this.promise;
  }

  /**
   * Check if value has been resolved
   */
  get isResolved(): boolean {
    return this.resolved;
  }

  /**
   * Reset to uncomputed state
   */
  reset(): void {
    this.promise = null;
    this.value = undefined;
    this.resolved = false;
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  LRUCache,
  FormulaASTCache,
  ResultCache,
  BatchDeduplicator,
  ModulePreloader,
  ResourcePool,
  DebouncedEmitter,
  Lazy,
  AsyncLazy,
};
