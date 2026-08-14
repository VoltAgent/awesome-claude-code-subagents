/**
 * Cognitive Kernel Bridges Index
 *
 * Exports all WASM bridges for cognitive augmentation.
 */

export {
  CognitiveBridge,
  createCognitiveBridge,
  type WasmModuleStatus,
  type CognitiveConfig,
  type AttentionState,
} from './cognitive-bridge.js';

export {
  SonaBridge,
  createSonaBridge,
  type SonaConfig,
  type SonaTrajectory,
  type SonaStep,
  type LoRAWeights,
  type EWCState,
  type SonaPrediction,
} from './sona-bridge.js';
