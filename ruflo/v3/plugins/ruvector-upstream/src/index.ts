/**
 * @claude-flow/ruvector-upstream
 *
 * RuVector WASM package bridges for Claude Flow plugins.
 * Provides unified access to 15+ WASM packages from ruvnet/ruvector.
 */

// Bridge exports
export * from './bridges/hnsw.js';
export * from './bridges/attention.js';
export * from './bridges/gnn.js';
export * from './bridges/hyperbolic.js';
export * from './bridges/learning.js';
export * from './bridges/exotic.js';
export * from './bridges/cognitive.js';
export * from './bridges/sona.js';

// Types
export * from './types.js';

// Registry
export { WasmRegistry, getWasmRegistry } from './registry.js';
