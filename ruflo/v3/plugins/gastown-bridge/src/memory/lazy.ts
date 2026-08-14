/**
 * Lazy Loading Utilities for Gas Town Bridge Plugin
 *
 * Provides lazy initialization patterns to defer resource loading
 * until first use, reducing initial memory footprint and startup time.
 *
 * Features:
 * - Lazy WASM module loading
 * - Deferred convoy observer initialization
 * - Lazy bridge initialization
 * - Resource cleanup on idle
 *
 * @module gastown-bridge/memory/lazy
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Lazy value state
 */
export type LazyState = 'uninitialized' | 'initializing' | 'initialized' | 'error' | 'disposed';

/**
 * Lazy initialization options
 */
export interface LazyOptions<T> {
  /** Factory function to create the value */
  factory: () => T | Promise<T>;
  /** Optional cleanup function */
  cleanup?: (value: T) => void | Promise<void>;
  /** Auto-dispose after idle time (ms, 0 = never) */
  idleTimeout?: number;
  /** Error handler */
  onError?: (error: Error) => void;
  /** Name for debugging */
  name?: string;
}

/**
 * Lazy loader statistics
 */
export interface LazyStats {
  name: string;
  state: LazyState;
  initCount: number;
  disposeCount: number;
  errorCount: number;
  lastInitTime?: Date;
  lastAccessTime?: Date;
  initDurationMs?: number;
}

// ============================================================================
// Lazy Value Implementation
// ============================================================================

/**
 * Lazy value wrapper with automatic initialization
 *
 * @example
 * ```typescript
 * const lazyWasm = new Lazy({
 *   name: 'wasm-module',
 *   factory: async () => await loadWasmModule(),
 *   cleanup: (wasm) => wasm.dispose(),
 *   idleTimeout: 60000, // Auto-dispose after 1 minute of inactivity
 * });
 *
 * // First access triggers initialization
 * const wasm = await lazyWasm.get();
 *
 * // Check if initialized without triggering
 * if (lazyWasm.isInitialized()) { ... }
 *
 * // Manual disposal
 * await lazyWasm.dispose();
 * ```
 */
export class Lazy<T> {
  private value?: T;
  private state: LazyState = 'uninitialized';
  private initPromise?: Promise<T>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private options: Required<LazyOptions<T>>;
  private stats: LazyStats;

  constructor(options: LazyOptions<T>) {
    this.options = {
      factory: options.factory,
      cleanup: options.cleanup ?? (() => {}),
      idleTimeout: options.idleTimeout ?? 0,
      onError: options.onError ?? console.error,
      name: options.name ?? 'lazy-value',
    };

    this.stats = {
      name: this.options.name,
      state: 'uninitialized',
      initCount: 0,
      disposeCount: 0,
      errorCount: 0,
    };
  }

  /**
   * Get the lazy value, initializing if necessary
   */
  async get(): Promise<T> {
    this.resetIdleTimer();

    if (this.state === 'initialized' && this.value !== undefined) {
      this.stats.lastAccessTime = new Date();
      return this.value;
    }

    if (this.state === 'initializing' && this.initPromise) {
      return this.initPromise;
    }

    if (this.state === 'error') {
      // Retry on error
      this.state = 'uninitialized';
    }

    if (this.state === 'disposed') {
      // Re-initialize after disposal
      this.state = 'uninitialized';
    }

    return this.initialize();
  }

  /**
   * Get synchronously (throws if not initialized)
   */
  getSync(): T {
    if (this.state !== 'initialized' || this.value === undefined) {
      throw new Error(`Lazy value '${this.options.name}' not initialized`);
    }
    this.resetIdleTimer();
    this.stats.lastAccessTime = new Date();
    return this.value;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.state === 'initialized' && this.value !== undefined;
  }

  /**
   * Get current state
   */
  getState(): LazyState {
    return this.state;
  }

  /**
   * Initialize without returning value
   */
  async initialize(): Promise<T> {
    if (this.state === 'initialized' && this.value !== undefined) {
      return this.value;
    }

    this.state = 'initializing';
    this.stats.state = 'initializing';
    const startTime = Date.now();

    this.initPromise = (async () => {
      try {
        const value = await this.options.factory();
        this.value = value;
        this.state = 'initialized';
        this.stats.state = 'initialized';
        this.stats.initCount++;
        this.stats.lastInitTime = new Date();
        this.stats.lastAccessTime = new Date();
        this.stats.initDurationMs = Date.now() - startTime;
        return value;
      } catch (error) {
        this.state = 'error';
        this.stats.state = 'error';
        this.stats.errorCount++;
        this.options.onError(error as Error);
        throw error;
      } finally {
        this.initPromise = undefined;
      }
    })();

    return this.initPromise;
  }

  /**
   * Dispose the lazy value
   */
  async dispose(): Promise<void> {
    this.clearIdleTimer();

    if (this.value !== undefined) {
      try {
        await this.options.cleanup(this.value);
      } catch (error) {
        this.options.onError(error as Error);
      }
    }

    this.value = undefined;
    this.state = 'disposed';
    this.stats.state = 'disposed';
    this.stats.disposeCount++;
  }

  /**
   * Get statistics
   */
  getStats(): Readonly<LazyStats> {
    return { ...this.stats };
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private resetIdleTimer(): void {
    this.clearIdleTimer();

    if (this.options.idleTimeout > 0) {
      this.idleTimer = setTimeout(() => {
        this.dispose().catch(this.options.onError);
      }, this.options.idleTimeout);
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }
}

// ============================================================================
// Lazy Singleton Pattern
// ============================================================================

/**
 * Lazy singleton registry
 */
const lazySingletons = new Map<string, Lazy<unknown>>();

/**
 * Get or create a lazy singleton
 */
export function getLazySingleton<T>(
  key: string,
  options: LazyOptions<T>
): Lazy<T> {
  let lazy = lazySingletons.get(key) as Lazy<T> | undefined;
  if (!lazy) {
    lazy = new Lazy({ ...options, name: options.name ?? key });
    lazySingletons.set(key, lazy as Lazy<unknown>);
  }
  return lazy;
}

/**
 * Dispose a lazy singleton
 */
export async function disposeLazySingleton(key: string): Promise<void> {
  const lazy = lazySingletons.get(key);
  if (lazy) {
    await lazy.dispose();
    lazySingletons.delete(key);
  }
}

/**
 * Dispose all lazy singletons
 */
export async function disposeAllLazySingletons(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const lazy of lazySingletons.values()) {
    promises.push(lazy.dispose());
  }
  await Promise.all(promises);
  lazySingletons.clear();
}

// ============================================================================
// Lazy Module Loader
// ============================================================================

/**
 * Lazy module loader for dynamic imports
 *
 * @example
 * ```typescript
 * const wasmLoader = new LazyModule(() => import('./wasm-loader.js'));
 * const { parseFormula } = await wasmLoader.get();
 * ```
 */
export class LazyModule<T> {
  private lazy: Lazy<T>;

  constructor(
    importer: () => Promise<T>,
    options?: Omit<LazyOptions<T>, 'factory'>
  ) {
    this.lazy = new Lazy({
      ...options,
      factory: importer,
    });
  }

  /**
   * Get the module
   */
  async get(): Promise<T> {
    return this.lazy.get();
  }

  /**
   * Check if loaded
   */
  isLoaded(): boolean {
    return this.lazy.isInitialized();
  }

  /**
   * Dispose module
   */
  async dispose(): Promise<void> {
    return this.lazy.dispose();
  }
}

// ============================================================================
// Lazy Bridge
// ============================================================================

/**
 * Lazy bridge wrapper for Gas Town bridges
 *
 * Defers bridge initialization until first use.
 */
export class LazyBridge<T extends { initialize?: () => Promise<void> }> {
  private lazy: Lazy<T>;

  constructor(
    factory: () => T | Promise<T>,
    options?: Omit<LazyOptions<T>, 'factory'>
  ) {
    this.lazy = new Lazy({
      ...options,
      factory: async () => {
        const bridge = await factory();
        if (bridge.initialize) {
          await bridge.initialize();
        }
        return bridge;
      },
    });
  }

  /**
   * Get the bridge
   */
  async get(): Promise<T> {
    return this.lazy.get();
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.lazy.isInitialized();
  }

  /**
   * Dispose bridge
   */
  async dispose(): Promise<void> {
    return this.lazy.dispose();
  }

  /**
   * Get stats
   */
  getStats(): LazyStats {
    return this.lazy.getStats();
  }
}

// ============================================================================
// Lazy WASM Loader
// ============================================================================

/**
 * Lazy WASM module loader with caching
 */
export class LazyWasm<T> {
  private lazy: Lazy<T>;
  private cached: T | null = null;

  constructor(
    loader: () => Promise<T>,
    options?: {
      name?: string;
      idleTimeout?: number;
      onError?: (error: Error) => void;
    }
  ) {
    this.lazy = new Lazy({
      factory: async () => {
        // Check cache first
        if (this.cached) {
          return this.cached;
        }
        const module = await loader();
        this.cached = module;
        return module;
      },
      cleanup: () => {
        // WASM modules are typically not disposable
        // but we can clear the cache reference
        this.cached = null;
      },
      name: options?.name ?? 'lazy-wasm',
      idleTimeout: options?.idleTimeout ?? 0,
      onError: options?.onError ?? console.error,
    });
  }

  /**
   * Get the WASM module
   */
  async get(): Promise<T> {
    return this.lazy.get();
  }

  /**
   * Check if loaded
   */
  isLoaded(): boolean {
    return this.lazy.isInitialized();
  }

  /**
   * Clear cache (module will be reloaded on next access)
   */
  clearCache(): void {
    this.cached = null;
  }

  /**
   * Get stats
   */
  getStats(): LazyStats {
    return this.lazy.getStats();
  }
}

// ============================================================================
// Lazy Observer
// ============================================================================

/**
 * Lazy observer pattern for convoy watching
 *
 * Defers observer creation until first watch request.
 */
export class LazyObserver<T> {
  private lazy: Lazy<T>;
  private watchCount = 0;

  constructor(
    factory: () => T | Promise<T>,
    options?: Omit<LazyOptions<T>, 'factory'>
  ) {
    this.lazy = new Lazy({
      ...options,
      factory,
    });
  }

  /**
   * Start watching (initializes observer if needed)
   */
  async watch(): Promise<T> {
    this.watchCount++;
    return this.lazy.get();
  }

  /**
   * Stop watching (disposes observer if no more watchers)
   */
  async unwatch(): Promise<void> {
    this.watchCount--;
    if (this.watchCount <= 0) {
      this.watchCount = 0;
      await this.lazy.dispose();
    }
  }

  /**
   * Get current watch count
   */
  getWatchCount(): number {
    return this.watchCount;
  }

  /**
   * Check if active
   */
  isActive(): boolean {
    return this.lazy.isInitialized() && this.watchCount > 0;
  }

  /**
   * Force dispose
   */
  async dispose(): Promise<void> {
    this.watchCount = 0;
    return this.lazy.dispose();
  }
}

// ============================================================================
// Lazy Initialization Decorators (for future use)
// ============================================================================

/**
 * Decorator metadata storage
 */
const lazyMetadata = new WeakMap<object, Map<string | symbol, Lazy<unknown>>>();

/**
 * Get or create lazy value for a property
 */
function getOrCreateLazy<T>(
  target: object,
  propertyKey: string | symbol,
  factory: () => T | Promise<T>
): Lazy<T> {
  let map = lazyMetadata.get(target);
  if (!map) {
    map = new Map();
    lazyMetadata.set(target, map);
  }

  let lazy = map.get(propertyKey) as Lazy<T> | undefined;
  if (!lazy) {
    lazy = new Lazy({ factory, name: String(propertyKey) });
    map.set(propertyKey, lazy as Lazy<unknown>);
  }

  return lazy;
}

/**
 * Create a lazy property getter
 */
export function createLazyProperty<T>(
  factory: () => T | Promise<T>,
  options?: Omit<LazyOptions<T>, 'factory'>
): { get: () => Promise<T>; isInitialized: () => boolean } {
  const lazy = new Lazy({ ...options, factory });
  return {
    get: () => lazy.get(),
    isInitialized: () => lazy.isInitialized(),
  };
}

export default Lazy;
