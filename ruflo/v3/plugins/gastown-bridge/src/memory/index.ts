/**
 * Memory Management Module for Gas Town Bridge Plugin
 *
 * Provides comprehensive memory optimization through:
 * - Object pooling for frequently allocated objects (Bead, Formula, Step, Convoy, Molecule)
 * - Arena allocators for batch operations with O(1) reset
 * - Memory monitoring with pressure callbacks
 * - Lazy loading for deferred resource initialization
 *
 * Target: 75% memory reduction, <10MB heap for 10k beads
 *
 * @module gastown-bridge/memory
 */

// ============================================================================
// Object Pooling
// ============================================================================

export {
  // Core pool class
  ObjectPool,
  type Poolable,
  type PoolStats,
  type PoolConfig,

  // Pooled object classes
  PooledBead,
  PooledStep,
  PooledFormula,
  PooledConvoy,
  PooledMolecule,

  // Pre-configured pool instances
  beadPool,
  formulaPool,
  stepPool,
  convoyPool,
  moleculePool,

  // Pool management utilities
  type PoolType,
  getAllPoolStats,
  getTotalMemorySaved,
  clearAllPools,
  preWarmAllPools,
  getPoolEfficiencySummary,
} from './pool.js';

// ============================================================================
// Arena Allocator
// ============================================================================

export {
  // Core arena class
  Arena,
  type ArenaStats,
  type ArenaConfig,
  type AllocatableType,
  type TypeMap,

  // Scoped arena utilities
  scopedArena,
  withArena,
  withArenaSync,

  // Arena management
  ArenaManager,
  arenaManager,
} from './arena.js';

// ============================================================================
// Memory Monitoring
// ============================================================================

export {
  // Core monitor class
  MemoryMonitor,
  type MemoryStats,
  type MemoryPressureLevel,
  type MemoryPressureCallback,
  type MemoryMonitorConfig,
  type MemoryMonitorEvents,

  // Convenience functions
  getMemoryUsage,
  setMemoryLimit,
  onMemoryPressure,
  getDefaultMonitor,
  disposeDefaultMonitor,

  // Memory budget management
  MemoryBudgetManager,
  type MemoryBudget,
  memoryBudget,
} from './monitor.js';

// ============================================================================
// Lazy Loading
// ============================================================================

export {
  // Core lazy class
  Lazy,
  type LazyState,
  type LazyOptions,
  type LazyStats,

  // Singleton management
  getLazySingleton,
  disposeLazySingleton,
  disposeAllLazySingletons,

  // Specialized lazy loaders
  LazyModule,
  LazyBridge,
  LazyWasm,
  LazyObserver,

  // Utilities
  createLazyProperty,
} from './lazy.js';

// ============================================================================
// Integrated Memory Management
// ============================================================================

import {
  clearAllPools,
  preWarmAllPools,
  getAllPoolStats,
  getPoolEfficiencySummary,
} from './pool.js';
import { arenaManager } from './arena.js';
import { MemoryMonitor, type MemoryStats } from './monitor.js';
import { disposeAllLazySingletons } from './lazy.js';

/**
 * Memory system configuration
 */
export interface MemorySystemConfig {
  /** Memory limit in bytes (default: 10MB) */
  memoryLimit?: number;
  /** Enable auto-cleanup on pressure */
  autoCleanup?: boolean;
  /** Pre-warm pools on init */
  preWarmPools?: boolean;
  /** Polling interval for monitor (ms) */
  pollInterval?: number;
}

/**
 * Memory system state
 */
export interface MemorySystemState {
  initialized: boolean;
  monitor: MemoryMonitor | null;
  config: MemorySystemConfig;
}

const state: MemorySystemState = {
  initialized: false,
  monitor: null,
  config: {},
};

/**
 * Initialize the memory management system
 *
 * @example
 * ```typescript
 * import { initializeMemorySystem, getSystemMemoryStats } from './memory/index.js';
 *
 * await initializeMemorySystem({
 *   memoryLimit: 10 * 1024 * 1024, // 10MB
 *   autoCleanup: true,
 *   preWarmPools: true,
 * });
 *
 * // Monitor memory usage
 * const stats = getSystemMemoryStats();
 * console.log('Heap used:', stats.heapUsed);
 * ```
 */
export function initializeMemorySystem(config?: MemorySystemConfig): void {
  if (state.initialized) {
    console.warn('[memory] Memory system already initialized');
    return;
  }

  state.config = {
    memoryLimit: config?.memoryLimit ?? 10 * 1024 * 1024, // 10MB default
    autoCleanup: config?.autoCleanup ?? true,
    preWarmPools: config?.preWarmPools ?? false,
    pollInterval: config?.pollInterval ?? 5000,
  };

  // Create and start monitor
  state.monitor = new MemoryMonitor({
    memoryLimit: state.config.memoryLimit,
    autoCleanup: state.config.autoCleanup,
    pollInterval: state.config.pollInterval,
  });
  state.monitor.start();

  // Pre-warm pools if requested
  if (state.config.preWarmPools) {
    preWarmAllPools();
  }

  state.initialized = true;
  console.log('[memory] Memory system initialized', {
    limit: `${(state.config.memoryLimit! / (1024 * 1024)).toFixed(2)}MB`,
    autoCleanup: state.config.autoCleanup,
    preWarmed: state.config.preWarmPools,
  });
}

/**
 * Get system memory statistics
 */
export function getSystemMemoryStats(): MemoryStats | null {
  return state.monitor?.getMemoryUsage() ?? null;
}

/**
 * Get comprehensive memory report
 */
export function getMemoryReport(): {
  system: MemoryStats | null;
  pools: ReturnType<typeof getAllPoolStats>;
  poolEfficiency: ReturnType<typeof getPoolEfficiencySummary>;
  arenas: ReturnType<typeof arenaManager.getStats>;
  config: MemorySystemConfig;
} {
  return {
    system: getSystemMemoryStats(),
    pools: getAllPoolStats(),
    poolEfficiency: getPoolEfficiencySummary(),
    arenas: arenaManager.getStats(),
    config: state.config,
  };
}

/**
 * Trigger manual memory cleanup
 */
export function triggerMemoryCleanup(): void {
  // Clear all object pools
  clearAllPools();

  // Reset all arenas
  arenaManager.resetAll();

  // Dispose lazy singletons
  disposeAllLazySingletons().catch(console.error);

  // Trigger monitor cleanup
  state.monitor?.triggerCleanup();

  console.log('[memory] Manual cleanup completed');
}

/**
 * Shutdown the memory system
 */
export async function shutdownMemorySystem(): Promise<void> {
  if (!state.initialized) return;

  // Stop monitor
  state.monitor?.stop();
  state.monitor = null;

  // Clear pools
  clearAllPools();

  // Dispose arenas
  arenaManager.disposeAll();

  // Dispose lazy singletons
  await disposeAllLazySingletons();

  state.initialized = false;
  console.log('[memory] Memory system shut down');
}

/**
 * Check if memory system is initialized
 */
export function isMemorySystemInitialized(): boolean {
  return state.initialized;
}

/**
 * Get memory system monitor
 */
export function getMemoryMonitor(): MemoryMonitor | null {
  return state.monitor;
}

// ============================================================================
// Quick-access utilities for common operations
// ============================================================================

import {
  beadPool,
  stepPool,
  formulaPool,
  convoyPool,
  moleculePool,
  PooledBead,
  PooledStep,
  PooledFormula,
  PooledConvoy,
  PooledMolecule,
} from './pool.js';

/**
 * Acquire a pooled bead
 */
export function acquireBead(): PooledBead {
  return beadPool.acquire();
}

/**
 * Release a pooled bead
 */
export function releaseBead(bead: PooledBead): void {
  beadPool.release(bead);
}

/**
 * Acquire a pooled step
 */
export function acquireStep(): PooledStep {
  return stepPool.acquire();
}

/**
 * Release a pooled step
 */
export function releaseStep(step: PooledStep): void {
  stepPool.release(step);
}

/**
 * Acquire a pooled formula
 */
export function acquireFormula(): PooledFormula {
  return formulaPool.acquire();
}

/**
 * Release a pooled formula
 */
export function releaseFormula(formula: PooledFormula): void {
  formulaPool.release(formula);
}

/**
 * Acquire a pooled convoy
 */
export function acquireConvoy(): PooledConvoy {
  return convoyPool.acquire();
}

/**
 * Release a pooled convoy
 */
export function releaseConvoy(convoy: PooledConvoy): void {
  convoyPool.release(convoy);
}

/**
 * Acquire a pooled molecule
 */
export function acquireMolecule(): PooledMolecule {
  return moleculePool.acquire();
}

/**
 * Release a pooled molecule
 */
export function releaseMolecule(molecule: PooledMolecule): void {
  moleculePool.release(molecule);
}
