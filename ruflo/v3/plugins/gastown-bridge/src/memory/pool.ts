/**
 * Object Pooling for Gas Town Bridge Plugin
 *
 * Provides high-performance object pooling to minimize GC pressure
 * and reduce memory allocations for frequently created objects.
 *
 * Target: 75% memory reduction, <10MB heap for 10k beads
 *
 * Pooled object types:
 * - Bead: Git-backed issue tracking objects
 * - Formula: TOML-defined workflow definitions
 * - Step: Individual workflow steps
 * - Convoy: Work-order tracking containers
 * - Molecule: Generated work units
 *
 * @module gastown-bridge/memory/pool
 */

import type {
  Bead,
  Formula,
  Step,
  Convoy,
  CookedFormula,
  FormulaType,
  BeadStatus,
  ConvoyStatus,
} from '../types.js';

import type { Molecule } from '../formula/executor.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Poolable object interface - objects that can be reset and reused
 */
export interface Poolable {
  /** Reset object to initial state for reuse */
  reset?(): void;
}

/**
 * Pool statistics for monitoring
 */
export interface PoolStats {
  /** Total objects created (including pooled) */
  created: number;
  /** Objects currently in pool (available) */
  available: number;
  /** Objects currently in use */
  inUse: number;
  /** Number of times pool was empty on acquire */
  misses: number;
  /** Number of successful pool acquisitions */
  hits: number;
  /** Peak pool size reached */
  peakSize: number;
  /** Memory saved (estimated bytes) */
  memorySaved: number;
}

/**
 * Pool configuration
 */
export interface PoolConfig {
  /** Initial pool size */
  initialSize?: number;
  /** Maximum pool size (0 = unlimited) */
  maxSize?: number;
  /** Estimated object size in bytes (for memory tracking) */
  objectSizeBytes?: number;
  /** Whether to pre-warm the pool */
  preWarm?: boolean;
}

// ============================================================================
// Generic Object Pool Implementation
// ============================================================================

/**
 * High-performance generic object pool
 *
 * Uses a simple array-based free list for O(1) acquire/release.
 * Supports both factory functions and prototype-based object creation.
 *
 * @example
 * ```typescript
 * const beadPool = new ObjectPool<PooledBead>({
 *   factory: () => new PooledBead(),
 *   reset: (bead) => bead.reset(),
 *   initialSize: 100,
 *   maxSize: 10000,
 * });
 *
 * const bead = beadPool.acquire();
 * // ... use bead ...
 * beadPool.release(bead);
 * ```
 */
export class ObjectPool<T extends object> {
  private pool: T[] = [];
  private factory: () => T;
  private resetFn?: (obj: T) => void;
  private config: Required<PoolConfig>;
  private stats: PoolStats = {
    created: 0,
    available: 0,
    inUse: 0,
    misses: 0,
    hits: 0,
    peakSize: 0,
    memorySaved: 0,
  };

  constructor(
    factory: () => T,
    options?: PoolConfig & { reset?: (obj: T) => void }
  ) {
    this.factory = factory;
    this.resetFn = options?.reset;
    this.config = {
      initialSize: options?.initialSize ?? 0,
      maxSize: options?.maxSize ?? 0,
      objectSizeBytes: options?.objectSizeBytes ?? 256,
      preWarm: options?.preWarm ?? false,
    };

    if (this.config.preWarm && this.config.initialSize > 0) {
      this.preWarm(this.config.initialSize);
    }
  }

  /**
   * Acquire an object from the pool
   *
   * Returns a pooled object if available, otherwise creates a new one.
   * O(1) operation using array pop.
   */
  acquire(): T {
    let obj: T;

    if (this.pool.length > 0) {
      obj = this.pool.pop()!;
      this.stats.hits++;
      this.stats.available--;
    } else {
      obj = this.factory();
      this.stats.created++;
      this.stats.misses++;
    }

    this.stats.inUse++;
    if (this.stats.inUse > this.stats.peakSize) {
      this.stats.peakSize = this.stats.inUse;
    }

    return obj;
  }

  /**
   * Release an object back to the pool
   *
   * Resets the object and returns it to the pool for reuse.
   * O(1) operation using array push.
   *
   * @param obj - Object to release
   */
  release(obj: T): void {
    // Reset the object
    if (this.resetFn) {
      this.resetFn(obj);
    } else if ('reset' in obj && typeof (obj as Poolable).reset === 'function') {
      (obj as Poolable).reset!();
    }

    // Check if pool is at max capacity
    if (this.config.maxSize > 0 && this.pool.length >= this.config.maxSize) {
      // Let GC handle it - pool is full
      this.stats.inUse--;
      return;
    }

    this.pool.push(obj);
    this.stats.available++;
    this.stats.inUse--;
    this.stats.memorySaved += this.config.objectSizeBytes;
  }

  /**
   * Release multiple objects at once (batch operation)
   */
  releaseAll(objects: T[]): void {
    for (const obj of objects) {
      this.release(obj);
    }
  }

  /**
   * Pre-warm the pool with objects
   */
  preWarm(count: number): void {
    const toCreate = Math.min(
      count,
      this.config.maxSize > 0 ? this.config.maxSize - this.pool.length : count
    );

    for (let i = 0; i < toCreate; i++) {
      const obj = this.factory();
      this.stats.created++;
      this.pool.push(obj);
      this.stats.available++;
    }
  }

  /**
   * Clear the pool and release all objects
   */
  clear(): void {
    this.pool.length = 0;
    this.stats.available = 0;
  }

  /**
   * Get pool statistics
   */
  getStats(): Readonly<PoolStats> {
    return { ...this.stats };
  }

  /**
   * Get current pool size
   */
  get size(): number {
    return this.pool.length;
  }

  /**
   * Get hit rate (percentage of successful pool acquisitions)
   */
  get hitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? (this.stats.hits / total) * 100 : 0;
  }
}

// ============================================================================
// Pooled Object Classes
// ============================================================================

/**
 * Pooled Bead object with reset capability
 */
export class PooledBead implements Bead, Poolable {
  id = '';
  title = '';
  description = '';
  status: BeadStatus = 'open';
  priority = 0;
  labels: string[] = [];
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
  parentId?: string;
  assignee?: string;
  rig?: string;
  blockedBy?: string[];
  blocks?: string[];

  reset(): void {
    this.id = '';
    this.title = '';
    this.description = '';
    this.status = 'open';
    this.priority = 0;
    this.labels.length = 0;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.parentId = undefined;
    this.assignee = undefined;
    this.rig = undefined;
    this.blockedBy = undefined;
    this.blocks = undefined;
  }

  /**
   * Initialize from a Bead-like object
   */
  initFrom(source: Partial<Bead>): this {
    this.id = source.id ?? '';
    this.title = source.title ?? '';
    this.description = source.description ?? '';
    this.status = source.status ?? 'open';
    this.priority = source.priority ?? 0;
    this.labels = source.labels ? [...source.labels] : [];
    this.createdAt = source.createdAt ?? new Date();
    this.updatedAt = source.updatedAt ?? new Date();
    this.parentId = source.parentId;
    this.assignee = source.assignee;
    this.rig = source.rig;
    this.blockedBy = source.blockedBy ? [...source.blockedBy] : undefined;
    this.blocks = source.blocks ? [...source.blocks] : undefined;
    return this;
  }
}

/**
 * Pooled Step object with reset capability
 */
export class PooledStep implements Step, Poolable {
  id = '';
  title = '';
  description = '';
  needs?: string[];
  duration?: number;
  requires?: string[];
  metadata?: Record<string, unknown>;

  reset(): void {
    this.id = '';
    this.title = '';
    this.description = '';
    this.needs = undefined;
    this.duration = undefined;
    this.requires = undefined;
    this.metadata = undefined;
  }

  initFrom(source: Partial<Step>): this {
    this.id = source.id ?? '';
    this.title = source.title ?? '';
    this.description = source.description ?? '';
    this.needs = source.needs ? [...source.needs] : undefined;
    this.duration = source.duration;
    this.requires = source.requires ? [...source.requires] : undefined;
    this.metadata = source.metadata ? { ...source.metadata } : undefined;
    return this;
  }
}

/**
 * Pooled Formula object with reset capability
 */
export class PooledFormula implements Formula, Poolable {
  name = '';
  description = '';
  type: FormulaType = 'workflow';
  version = 1;
  steps?: Step[];
  legs?: Formula['legs'];
  vars?: Formula['vars'];
  metadata?: Formula['metadata'];

  reset(): void {
    this.name = '';
    this.description = '';
    this.type = 'workflow';
    this.version = 1;
    this.steps = undefined;
    this.legs = undefined;
    this.vars = undefined;
    this.metadata = undefined;
  }

  initFrom(source: Partial<Formula>): this {
    this.name = source.name ?? '';
    this.description = source.description ?? '';
    this.type = source.type ?? 'workflow';
    this.version = source.version ?? 1;
    this.steps = source.steps ? [...source.steps] : undefined;
    this.legs = source.legs ? [...source.legs] : undefined;
    this.vars = source.vars ? { ...source.vars } : undefined;
    this.metadata = source.metadata ? { ...source.metadata } : undefined;
    return this;
  }
}

/**
 * Pooled Convoy object with reset capability
 */
export class PooledConvoy implements Convoy, Poolable {
  id = '';
  name = '';
  trackedIssues: string[] = [];
  status: ConvoyStatus = 'active';
  startedAt: Date = new Date();
  completedAt?: Date;
  progress = { total: 0, closed: 0, inProgress: 0, blocked: 0 };
  formula?: string;
  description?: string;

  reset(): void {
    this.id = '';
    this.name = '';
    this.trackedIssues.length = 0;
    this.status = 'active';
    this.startedAt = new Date();
    this.completedAt = undefined;
    this.progress = { total: 0, closed: 0, inProgress: 0, blocked: 0 };
    this.formula = undefined;
    this.description = undefined;
  }

  initFrom(source: Partial<Convoy>): this {
    this.id = source.id ?? '';
    this.name = source.name ?? '';
    this.trackedIssues = source.trackedIssues ? [...source.trackedIssues] : [];
    this.status = source.status ?? 'active';
    this.startedAt = source.startedAt ?? new Date();
    this.completedAt = source.completedAt;
    this.progress = source.progress ? { ...source.progress } : { total: 0, closed: 0, inProgress: 0, blocked: 0 };
    this.formula = source.formula;
    this.description = source.description;
    return this;
  }
}

/**
 * Pooled Molecule object with reset capability
 */
export class PooledMolecule implements Molecule, Poolable {
  id = '';
  formulaName = '';
  title = '';
  description = '';
  type: FormulaType = 'workflow';
  sourceId = '';
  agent?: string;
  dependencies: string[] = [];
  order = 0;
  metadata: Record<string, unknown> = {};
  createdAt: Date = new Date();

  reset(): void {
    this.id = '';
    this.formulaName = '';
    this.title = '';
    this.description = '';
    this.type = 'workflow';
    this.sourceId = '';
    this.agent = undefined;
    this.dependencies.length = 0;
    this.order = 0;
    // Clear metadata object by resetting to empty object
    for (const key of Object.keys(this.metadata)) {
      delete this.metadata[key];
    }
    this.createdAt = new Date();
  }

  initFrom(source: Partial<Molecule>): this {
    this.id = source.id ?? '';
    this.formulaName = source.formulaName ?? '';
    this.title = source.title ?? '';
    this.description = source.description ?? '';
    this.type = source.type ?? 'workflow';
    this.sourceId = source.sourceId ?? '';
    this.agent = source.agent;
    this.dependencies = source.dependencies ? [...source.dependencies] : [];
    this.order = source.order ?? 0;
    this.metadata = source.metadata ? { ...source.metadata } : {};
    this.createdAt = source.createdAt ?? new Date();
    return this;
  }
}

// ============================================================================
// Pre-configured Pool Instances
// ============================================================================

/**
 * Global Bead pool - optimized for 10k beads target
 * Estimated size per bead: ~512 bytes
 */
export const beadPool = new ObjectPool<PooledBead>(
  () => new PooledBead(),
  {
    initialSize: 100,
    maxSize: 10000,
    objectSizeBytes: 512,
    preWarm: false, // Lazy initialization
  }
);

/**
 * Global Formula pool
 * Estimated size per formula: ~1KB
 */
export const formulaPool = new ObjectPool<PooledFormula>(
  () => new PooledFormula(),
  {
    initialSize: 10,
    maxSize: 500,
    objectSizeBytes: 1024,
    preWarm: false,
  }
);

/**
 * Global Step pool
 * Estimated size per step: ~256 bytes
 */
export const stepPool = new ObjectPool<PooledStep>(
  () => new PooledStep(),
  {
    initialSize: 50,
    maxSize: 5000,
    objectSizeBytes: 256,
    preWarm: false,
  }
);

/**
 * Global Convoy pool
 * Estimated size per convoy: ~768 bytes
 */
export const convoyPool = new ObjectPool<PooledConvoy>(
  () => new PooledConvoy(),
  {
    initialSize: 10,
    maxSize: 200,
    objectSizeBytes: 768,
    preWarm: false,
  }
);

/**
 * Global Molecule pool
 * Estimated size per molecule: ~384 bytes
 */
export const moleculePool = new ObjectPool<PooledMolecule>(
  () => new PooledMolecule(),
  {
    initialSize: 50,
    maxSize: 5000,
    objectSizeBytes: 384,
    preWarm: false,
  }
);

// ============================================================================
// Pool Management
// ============================================================================

/**
 * All managed pools
 */
const allPools = {
  bead: beadPool,
  formula: formulaPool,
  step: stepPool,
  convoy: convoyPool,
  molecule: moleculePool,
} as const;

export type PoolType = keyof typeof allPools;

/**
 * Get statistics for all pools
 */
export function getAllPoolStats(): Record<PoolType, PoolStats> {
  return {
    bead: beadPool.getStats(),
    formula: formulaPool.getStats(),
    step: stepPool.getStats(),
    convoy: convoyPool.getStats(),
    molecule: moleculePool.getStats(),
  };
}

/**
 * Get total memory saved across all pools
 */
export function getTotalMemorySaved(): number {
  return Object.values(allPools).reduce(
    (total, pool) => total + pool.getStats().memorySaved,
    0
  );
}

/**
 * Clear all pools
 */
export function clearAllPools(): void {
  for (const pool of Object.values(allPools)) {
    pool.clear();
  }
}

/**
 * Pre-warm all pools with default sizes
 */
export function preWarmAllPools(): void {
  beadPool.preWarm(100);
  formulaPool.preWarm(10);
  stepPool.preWarm(50);
  convoyPool.preWarm(10);
  moleculePool.preWarm(50);
}

/**
 * Get a summary of pool efficiency
 */
export function getPoolEfficiencySummary(): {
  totalHitRate: number;
  totalMemorySavedKB: number;
  totalObjectsInUse: number;
  totalObjectsAvailable: number;
} {
  const stats = getAllPoolStats();
  const poolEntries = Object.values(stats);

  const totalHits = poolEntries.reduce((sum, s) => sum + s.hits, 0);
  const totalMisses = poolEntries.reduce((sum, s) => sum + s.misses, 0);
  const totalMemory = poolEntries.reduce((sum, s) => sum + s.memorySaved, 0);
  const totalInUse = poolEntries.reduce((sum, s) => sum + s.inUse, 0);
  const totalAvailable = poolEntries.reduce((sum, s) => sum + s.available, 0);

  return {
    totalHitRate: totalHits + totalMisses > 0
      ? (totalHits / (totalHits + totalMisses)) * 100
      : 0,
    totalMemorySavedKB: totalMemory / 1024,
    totalObjectsInUse: totalInUse,
    totalObjectsAvailable: totalAvailable,
  };
}

export default ObjectPool;
