/**
 * Memory Monitoring for Gas Town Bridge Plugin
 *
 * Provides comprehensive memory monitoring, limits, and pressure callbacks.
 * Integrates with object pools and arena allocators to track memory usage.
 *
 * Target: <10MB heap for 10k beads
 *
 * Features:
 * - Real-time memory usage tracking
 * - Configurable memory limits
 * - Memory pressure callbacks
 * - Automatic cleanup triggers
 * - Integration with V8 GC hooks (when available)
 *
 * @module gastown-bridge/memory/monitor
 */

import { EventEmitter } from 'events';
import {
  getAllPoolStats,
  getPoolEfficiencySummary,
  clearAllPools,
  type PoolStats,
} from './pool.js';
import { arenaManager } from './arena.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Memory statistics snapshot
 */
export interface MemoryStats {
  /** Heap memory used (bytes) */
  heapUsed: number;
  /** Heap memory total (bytes) */
  heapTotal: number;
  /** External memory (bytes) */
  external: number;
  /** Array buffers memory (bytes) */
  arrayBuffers: number;
  /** RSS (Resident Set Size) in bytes */
  rss: number;
  /** Pool memory stats */
  pools: {
    totalMemorySaved: number;
    hitRate: number;
    objectsInUse: number;
    objectsAvailable: number;
  };
  /** Arena memory stats */
  arenas: {
    activeArenas: number;
    totalMemoryUsed: number;
    totalMemorySaved: number;
  };
  /** Timestamp of snapshot */
  timestamp: Date;
  /** Whether under memory pressure */
  underPressure: boolean;
}

/**
 * Memory pressure levels
 */
export type MemoryPressureLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Memory pressure callback
 */
export type MemoryPressureCallback = (
  level: MemoryPressureLevel,
  stats: MemoryStats
) => void;

/**
 * Memory monitor configuration
 */
export interface MemoryMonitorConfig {
  /** Memory limit in bytes (0 = no limit) */
  memoryLimit?: number;
  /** Low pressure threshold (0-1 of limit) */
  lowPressureThreshold?: number;
  /** Medium pressure threshold (0-1 of limit) */
  mediumPressureThreshold?: number;
  /** High pressure threshold (0-1 of limit) */
  highPressureThreshold?: number;
  /** Critical pressure threshold (0-1 of limit) */
  criticalPressureThreshold?: number;
  /** Polling interval in ms (0 = manual only) */
  pollInterval?: number;
  /** Enable automatic cleanup on pressure */
  autoCleanup?: boolean;
  /** Enable GC hints when available */
  gcHints?: boolean;
}

/**
 * Memory monitor events
 */
export interface MemoryMonitorEvents {
  'pressure:none': (stats: MemoryStats) => void;
  'pressure:low': (stats: MemoryStats) => void;
  'pressure:medium': (stats: MemoryStats) => void;
  'pressure:high': (stats: MemoryStats) => void;
  'pressure:critical': (stats: MemoryStats) => void;
  'limit:exceeded': (stats: MemoryStats) => void;
  'cleanup:triggered': (beforeStats: MemoryStats, afterStats: MemoryStats) => void;
  'snapshot': (stats: MemoryStats) => void;
}

// ============================================================================
// Memory Monitor Implementation
// ============================================================================

/**
 * Memory Monitor
 *
 * Tracks memory usage and triggers pressure callbacks when thresholds
 * are exceeded. Integrates with object pools and arenas.
 *
 * @example
 * ```typescript
 * const monitor = new MemoryMonitor({
 *   memoryLimit: 10 * 1024 * 1024, // 10MB
 *   pollInterval: 1000,
 *   autoCleanup: true,
 * });
 *
 * monitor.onMemoryPressure((level, stats) => {
 *   console.log(`Memory pressure: ${level}`, stats);
 * });
 *
 * monitor.start();
 * ```
 */
export class MemoryMonitor extends EventEmitter {
  private config: Required<MemoryMonitorConfig>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private pressureCallbacks: MemoryPressureCallback[] = [];
  private lastPressureLevel: MemoryPressureLevel = 'none';
  private running = false;

  // Historical stats for trend analysis
  private statsHistory: MemoryStats[] = [];
  private maxHistorySize = 60; // 1 minute at 1s intervals

  constructor(config?: MemoryMonitorConfig) {
    super();
    this.config = {
      memoryLimit: config?.memoryLimit ?? 0,
      lowPressureThreshold: config?.lowPressureThreshold ?? 0.5,
      mediumPressureThreshold: config?.mediumPressureThreshold ?? 0.7,
      highPressureThreshold: config?.highPressureThreshold ?? 0.85,
      criticalPressureThreshold: config?.criticalPressureThreshold ?? 0.95,
      pollInterval: config?.pollInterval ?? 0,
      autoCleanup: config?.autoCleanup ?? false,
      gcHints: config?.gcHints ?? true,
    };
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryUsage(): MemoryStats {
    const memUsage = process.memoryUsage();
    const poolSummary = getPoolEfficiencySummary();
    const arenaStats = arenaManager.getStats();

    // Calculate arena memory
    let arenaMemory = 0;
    for (const stats of Object.values(arenaStats.arenaStats)) {
      arenaMemory += stats.memoryUsed;
    }

    const stats: MemoryStats = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rss: memUsage.rss,
      pools: {
        totalMemorySaved: poolSummary.totalMemorySavedKB * 1024,
        hitRate: poolSummary.totalHitRate,
        objectsInUse: poolSummary.totalObjectsInUse,
        objectsAvailable: poolSummary.totalObjectsAvailable,
      },
      arenas: {
        activeArenas: arenaStats.activeArenas,
        totalMemoryUsed: arenaMemory,
        totalMemorySaved: arenaStats.totalMemorySaved,
      },
      timestamp: new Date(),
      underPressure: this.lastPressureLevel !== 'none',
    };

    return stats;
  }

  /**
   * Set memory limit
   */
  setMemoryLimit(bytes: number): void {
    this.config.memoryLimit = bytes;
  }

  /**
   * Get current memory limit
   */
  getMemoryLimit(): number {
    return this.config.memoryLimit;
  }

  /**
   * Register a memory pressure callback
   */
  onMemoryPressure(callback: MemoryPressureCallback): () => void {
    this.pressureCallbacks.push(callback);
    return () => {
      const index = this.pressureCallbacks.indexOf(callback);
      if (index !== -1) {
        this.pressureCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Check current pressure level
   */
  checkPressure(): MemoryPressureLevel {
    if (this.config.memoryLimit === 0) {
      return 'none';
    }

    const stats = this.getMemoryUsage();
    const usage = stats.heapUsed / this.config.memoryLimit;

    if (usage >= this.config.criticalPressureThreshold) {
      return 'critical';
    }
    if (usage >= this.config.highPressureThreshold) {
      return 'high';
    }
    if (usage >= this.config.mediumPressureThreshold) {
      return 'medium';
    }
    if (usage >= this.config.lowPressureThreshold) {
      return 'low';
    }
    return 'none';
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    if (this.config.pollInterval > 0) {
      this.pollTimer = setInterval(() => {
        this.poll();
      }, this.config.pollInterval);
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /**
   * Manual poll (also called automatically if pollInterval > 0)
   */
  poll(): void {
    const stats = this.getMemoryUsage();
    const level = this.checkPressure();

    // Add to history
    this.statsHistory.push(stats);
    if (this.statsHistory.length > this.maxHistorySize) {
      this.statsHistory.shift();
    }

    // Emit snapshot event
    this.emit('snapshot', stats);

    // Check for pressure level changes
    if (level !== this.lastPressureLevel) {
      this.lastPressureLevel = level;
      stats.underPressure = level !== 'none';

      // Emit pressure event
      this.emit(`pressure:${level}`, stats);

      // Call callbacks
      for (const callback of this.pressureCallbacks) {
        try {
          callback(level, stats);
        } catch (error) {
          console.error('[MemoryMonitor] Pressure callback error:', error);
        }
      }

      // Auto cleanup on high/critical pressure
      if (this.config.autoCleanup && (level === 'high' || level === 'critical')) {
        this.triggerCleanup();
      }
    }

    // Check if limit exceeded
    if (this.config.memoryLimit > 0 && stats.heapUsed > this.config.memoryLimit) {
      this.emit('limit:exceeded', stats);
    }
  }

  /**
   * Trigger memory cleanup
   */
  triggerCleanup(): void {
    const beforeStats = this.getMemoryUsage();

    // Clear object pools
    clearAllPools();

    // Reset all arenas
    arenaManager.resetAll();

    // Request GC if available and hints enabled
    if (this.config.gcHints && typeof global.gc === 'function') {
      global.gc();
    }

    const afterStats = this.getMemoryUsage();
    this.emit('cleanup:triggered', beforeStats, afterStats);
  }

  /**
   * Get memory trend (bytes/second)
   */
  getMemoryTrend(): number {
    if (this.statsHistory.length < 2) {
      return 0;
    }

    const oldest = this.statsHistory[0];
    const newest = this.statsHistory[this.statsHistory.length - 1];
    const timeDiff = newest.timestamp.getTime() - oldest.timestamp.getTime();

    if (timeDiff === 0) return 0;

    const memoryDiff = newest.heapUsed - oldest.heapUsed;
    return (memoryDiff / timeDiff) * 1000; // bytes per second
  }

  /**
   * Estimate time until limit reached (ms)
   */
  estimateTimeToLimit(): number | null {
    if (this.config.memoryLimit === 0) {
      return null;
    }

    const trend = this.getMemoryTrend();
    if (trend <= 0) {
      return null; // Memory is stable or decreasing
    }

    const stats = this.getMemoryUsage();
    const remaining = this.config.memoryLimit - stats.heapUsed;
    return (remaining / trend) * 1000;
  }

  /**
   * Get pool-specific statistics
   */
  getPoolStats(): Record<string, PoolStats> {
    return getAllPoolStats();
  }

  /**
   * Get historical stats
   */
  getHistory(): MemoryStats[] {
    return [...this.statsHistory];
  }

  /**
   * Clear historical stats
   */
  clearHistory(): void {
    this.statsHistory.length = 0;
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<Required<MemoryMonitorConfig>> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MemoryMonitorConfig>): void {
    Object.assign(this.config, config);

    // Restart polling if interval changed
    if (config.pollInterval !== undefined && this.running) {
      this.stop();
      this.start();
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get current memory usage (simple API)
 */
export function getMemoryUsage(): MemoryStats {
  const monitor = new MemoryMonitor();
  return monitor.getMemoryUsage();
}

/**
 * Set a memory limit and callback (simple API)
 */
export function setMemoryLimit(
  bytes: number,
  onPressure?: MemoryPressureCallback
): MemoryMonitor {
  const monitor = new MemoryMonitor({
    memoryLimit: bytes,
    pollInterval: 1000,
    autoCleanup: true,
  });

  if (onPressure) {
    monitor.onMemoryPressure(onPressure);
  }

  monitor.start();
  return monitor;
}

/**
 * Simple pressure callback registration (uses default monitor)
 */
let defaultMonitor: MemoryMonitor | null = null;

export function onMemoryPressure(callback: MemoryPressureCallback): () => void {
  if (!defaultMonitor) {
    defaultMonitor = new MemoryMonitor({
      memoryLimit: 10 * 1024 * 1024, // 10MB default
      pollInterval: 1000,
      autoCleanup: true,
    });
    defaultMonitor.start();
  }

  return defaultMonitor.onMemoryPressure(callback);
}

/**
 * Get the default monitor instance
 */
export function getDefaultMonitor(): MemoryMonitor | null {
  return defaultMonitor;
}

/**
 * Stop and dispose the default monitor
 */
export function disposeDefaultMonitor(): void {
  if (defaultMonitor) {
    defaultMonitor.stop();
    defaultMonitor = null;
  }
}

// ============================================================================
// Memory Budget
// ============================================================================

/**
 * Memory budget for component-level tracking
 */
export interface MemoryBudget {
  name: string;
  allocated: number;
  used: number;
  limit: number;
}

/**
 * Memory budget manager
 */
export class MemoryBudgetManager {
  private budgets: Map<string, MemoryBudget> = new Map();
  private totalLimit: number;

  constructor(totalLimit: number = 10 * 1024 * 1024) {
    this.totalLimit = totalLimit;
  }

  /**
   * Allocate a budget for a component
   */
  allocateBudget(name: string, limit: number): boolean {
    const currentTotal = this.getTotalAllocated();
    if (currentTotal + limit > this.totalLimit) {
      return false;
    }

    this.budgets.set(name, {
      name,
      allocated: limit,
      used: 0,
      limit,
    });
    return true;
  }

  /**
   * Update usage for a budget
   */
  updateUsage(name: string, used: number): void {
    const budget = this.budgets.get(name);
    if (budget) {
      budget.used = used;
    }
  }

  /**
   * Check if a budget is exceeded
   */
  isExceeded(name: string): boolean {
    const budget = this.budgets.get(name);
    return budget ? budget.used > budget.limit : false;
  }

  /**
   * Get budget for a component
   */
  getBudget(name: string): MemoryBudget | undefined {
    return this.budgets.get(name);
  }

  /**
   * Get all budgets
   */
  getAllBudgets(): MemoryBudget[] {
    return Array.from(this.budgets.values());
  }

  /**
   * Get total allocated budget
   */
  getTotalAllocated(): number {
    return Array.from(this.budgets.values()).reduce((sum, b) => sum + b.allocated, 0);
  }

  /**
   * Get total used
   */
  getTotalUsed(): number {
    return Array.from(this.budgets.values()).reduce((sum, b) => sum + b.used, 0);
  }

  /**
   * Free a budget
   */
  freeBudget(name: string): void {
    this.budgets.delete(name);
  }

  /**
   * Get total limit
   */
  getTotalLimit(): number {
    return this.totalLimit;
  }

  /**
   * Set total limit
   */
  setTotalLimit(limit: number): void {
    this.totalLimit = limit;
  }
}

/**
 * Global memory budget manager for 10MB target
 */
export const memoryBudget = new MemoryBudgetManager(10 * 1024 * 1024);

// Pre-allocate budgets for major components
memoryBudget.allocateBudget('beads', 5 * 1024 * 1024);    // 5MB for beads
memoryBudget.allocateBudget('formulas', 1 * 1024 * 1024);  // 1MB for formulas
memoryBudget.allocateBudget('convoys', 1 * 1024 * 1024);   // 1MB for convoys
memoryBudget.allocateBudget('wasm', 2 * 1024 * 1024);      // 2MB for WASM
memoryBudget.allocateBudget('misc', 1 * 1024 * 1024);      // 1MB for misc

export default MemoryMonitor;
