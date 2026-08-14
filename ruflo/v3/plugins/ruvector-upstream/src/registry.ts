/**
 * WASM Module Registry
 *
 * Centralized registry for all RuVector WASM modules.
 * Handles lazy loading, caching, and lifecycle management.
 */

import type { WasmBridge, WasmModuleStatus } from './types.js';

/**
 * Registry entry for a WASM module
 */
interface RegistryEntry {
  bridge: WasmBridge;
  loadedAt?: Date;
  lastUsed?: Date;
  useCount: number;
}

/**
 * WASM Module Registry
 */
export class WasmRegistry {
  private modules: Map<string, RegistryEntry> = new Map();
  private initPromises: Map<string, Promise<void>> = new Map();

  /**
   * Register a WASM bridge
   */
  register(name: string, bridge: WasmBridge): void {
    if (this.modules.has(name)) {
      console.warn(`WASM module '${name}' already registered, skipping`);
      return;
    }

    this.modules.set(name, {
      bridge,
      useCount: 0,
    });
  }

  /**
   * Get a WASM bridge by name
   */
  async get<T = unknown>(name: string): Promise<WasmBridge<T> | null> {
    const entry = this.modules.get(name);
    if (!entry) {
      return null;
    }

    // Initialize if needed
    if (!entry.bridge.isReady()) {
      await this.ensureInitialized(name);
    }

    // Update usage stats
    entry.lastUsed = new Date();
    entry.useCount++;

    return entry.bridge as WasmBridge<T>;
  }

  /**
   * Ensure a module is initialized (with deduplication)
   */
  private async ensureInitialized(name: string): Promise<void> {
    // Check if already initializing
    const existing = this.initPromises.get(name);
    if (existing) {
      return existing;
    }

    const entry = this.modules.get(name);
    if (!entry) {
      throw new Error(`WASM module '${name}' not registered`);
    }

    // Start initialization
    const promise = entry.bridge.init().then(() => {
      entry.loadedAt = new Date();
      this.initPromises.delete(name);
    }).catch((error) => {
      this.initPromises.delete(name);
      throw error;
    });

    this.initPromises.set(name, promise);
    return promise;
  }

  /**
   * Check if a module is registered
   */
  has(name: string): boolean {
    return this.modules.has(name);
  }

  /**
   * Get module status
   */
  getStatus(name: string): WasmModuleStatus | null {
    const entry = this.modules.get(name);
    return entry?.bridge.status ?? null;
  }

  /**
   * List all registered modules
   */
  list(): Array<{
    name: string;
    status: WasmModuleStatus;
    version: string;
    useCount: number;
  }> {
    return Array.from(this.modules.entries()).map(([name, entry]) => ({
      name,
      status: entry.bridge.status,
      version: entry.bridge.version,
      useCount: entry.useCount,
    }));
  }

  /**
   * Unload a module to free memory
   */
  async unload(name: string): Promise<void> {
    const entry = this.modules.get(name);
    if (!entry) {
      return;
    }

    await entry.bridge.destroy();
  }

  /**
   * Unload all modules
   */
  async unloadAll(): Promise<void> {
    const promises = Array.from(this.modules.keys()).map(name => this.unload(name));
    await Promise.all(promises);
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalModules: number;
    loadedModules: number;
    totalUseCount: number;
    memoryEstimateMb: number;
  } {
    let loadedCount = 0;
    let totalUse = 0;

    for (const entry of this.modules.values()) {
      if (entry.bridge.status === 'ready') {
        loadedCount++;
      }
      totalUse += entry.useCount;
    }

    return {
      totalModules: this.modules.size,
      loadedModules: loadedCount,
      totalUseCount: totalUse,
      memoryEstimateMb: loadedCount * 2, // Rough estimate: 2MB per loaded module
    };
  }
}

// Singleton instance
let registryInstance: WasmRegistry | null = null;

/**
 * Get the global WASM registry instance
 */
export function getWasmRegistry(): WasmRegistry {
  if (!registryInstance) {
    registryInstance = new WasmRegistry();
  }
  return registryInstance;
}
