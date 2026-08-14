/**
 * Agentic-QE Bridge Layer Exports
 *
 * Anti-corruption layer (ACL) bridges that translate between agentic-qe
 * and Claude Flow V3 domains. Each bridge isolates a specific integration point.
 *
 * Based on ADR-030: Agentic-QE Plugin Integration
 *
 * @module v3/plugins/agentic-qe/bridges
 */

export { QEMemoryBridge } from './QEMemoryBridge.js';
export { QESecurityBridge } from './QESecurityBridge.js';
export { QECoreBridge } from './QECoreBridge.js';
export { QEHiveBridge } from './QEHiveBridge.js';
export { QEModelRoutingAdapter } from './QEModelRoutingAdapter.js';

// Re-export interfaces
export type {
  IQEMemoryBridge,
  IQESecurityBridge,
  IQECoreBridge,
  IQEHiveBridge,
  IQEModelRoutingAdapter,
  QEPluginContext,
} from '../interfaces.js';
