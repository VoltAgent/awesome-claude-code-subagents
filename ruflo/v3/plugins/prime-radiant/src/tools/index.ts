/**
 * Prime Radiant MCP Tools Index
 *
 * Exports all Prime Radiant mathematical AI interpretability tools.
 *
 * Tools:
 * - pr_coherence_check: Check coherence using Sheaf Laplacian
 * - pr_spectral_analyze: Spectral stability analysis
 * - pr_causal_infer: Do-calculus causal inference
 * - pr_consensus_verify: Multi-agent consensus verification
 * - pr_quantum_topology: Quantum topology (Betti numbers, persistence)
 * - pr_memory_gate: Pre-storage coherence gate
 */

// Export individual tools
export { coherenceCheckTool, default as CoherenceCheck } from './coherence-check.js';
export { spectralAnalyzeTool, default as SpectralAnalyze } from './spectral-analyze.js';
export { causalInferTool, default as CausalInfer } from './causal-infer.js';
export { consensusVerifyTool, default as ConsensusVerify } from './consensus-verify.js';
export { quantumTopologyTool, default as QuantumTopology } from './quantum-topology.js';
export { memoryGateTool, default as MemoryGate } from './memory-gate.js';

// Export types
export * from './types.js';

// Import tools for combined export
import { coherenceCheckTool } from './coherence-check.js';
import { spectralAnalyzeTool } from './spectral-analyze.js';
import { causalInferTool } from './causal-infer.js';
import { consensusVerifyTool } from './consensus-verify.js';
import { quantumTopologyTool } from './quantum-topology.js';
import { memoryGateTool } from './memory-gate.js';

import type { MCPTool } from './types.js';

/**
 * All Prime Radiant MCP Tools
 */
export const primeRadiantTools: MCPTool[] = [
  coherenceCheckTool,
  spectralAnalyzeTool,
  causalInferTool,
  consensusVerifyTool,
  quantumTopologyTool,
  memoryGateTool,
];

/**
 * Tool name to handler map for quick lookup
 */
export const toolHandlers = new Map<string, MCPTool['handler']>([
  ['pr_coherence_check', coherenceCheckTool.handler],
  ['pr_spectral_analyze', spectralAnalyzeTool.handler],
  ['pr_causal_infer', causalInferTool.handler],
  ['pr_consensus_verify', consensusVerifyTool.handler],
  ['pr_quantum_topology', quantumTopologyTool.handler],
  ['pr_memory_gate', memoryGateTool.handler],
]);

/**
 * Get a tool by name
 */
export function getTool(name: string): MCPTool | undefined {
  return primeRadiantTools.find(t => t.name === name);
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
  return primeRadiantTools.map(t => t.name);
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): MCPTool[] {
  return primeRadiantTools.filter(t => t.category === category);
}

/**
 * Tool categories
 */
export const toolCategories = {
  coherence: [coherenceCheckTool, memoryGateTool],
  spectral: [spectralAnalyzeTool],
  causal: [causalInferTool],
  consensus: [consensusVerifyTool],
  topology: [quantumTopologyTool],
  memory: [memoryGateTool],
} as const;

export default primeRadiantTools;
