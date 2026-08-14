/**
 * Healthcare Clinical Plugin - Bridges Barrel Export
 *
 * @module @claude-flow/plugin-healthcare-clinical/bridges
 */

export {
  HealthcareHNSWBridge,
  createHNSWBridge,
  PatientEmbeddingGenerator,
} from './hnsw-bridge.js';

export {
  HealthcareGNNBridge,
  createGNNBridge,
} from './gnn-bridge.js';
