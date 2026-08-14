/**
 * Quantum Optimizer Plugin - Bridges Barrel Export
 *
 * @module @claude-flow/plugin-quantum-optimizer/bridges
 */

export {
  ExoticBridge,
  createExoticBridge,
} from './exotic-bridge.js';
export type { WasmModuleStatus } from './exotic-bridge.js';

export {
  DagBridge,
  createDagBridge,
} from './dag-bridge.js';
export type {
  Dag,
  DagNode,
  DagEdge,
  TopologicalSortResult,
  CriticalPathResult,
} from './dag-bridge.js';
