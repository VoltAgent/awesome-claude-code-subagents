/**
 * Feature Gap Tests (v3.5.58+)
 *
 * These tests verify that newly implemented features are real (not stubs),
 * that integration points exist, and that legacy stub markers have been removed.
 *
 * Source-level checks: reads .ts files and asserts on content.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CLI_SRC = join(__dirname, '../../@claude-flow/cli/src');
const MCP_TOOLS = join(CLI_SRC, 'mcp-tools');

// Helper: read a source file and return its contents
function readSource(relativePath: string): string {
  const fullPath = join(MCP_TOOLS, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Source file not found: ${fullPath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

// Helper: extract a handler section between two tool definitions
function extractHandler(source: string, toolName: string, nextToolName?: string): string {
  const start = source.indexOf(`name: '${toolName}'`);
  if (start === -1) throw new Error(`Tool '${toolName}' not found in source`);
  if (nextToolName) {
    const end = source.indexOf(`name: '${nextToolName}'`, start + 1);
    if (end === -1) return source.slice(start);
    return source.slice(start, end);
  }
  // Return a generous window (8000 chars covers even the longest handlers)
  return source.slice(start, start + 8000);
}

// =========================================================================
// 1. performance_profile is real
// =========================================================================
describe('performance_profile is real', () => {
  it('should NOT contain _stub: true', () => {
    const source = readSource('performance-tools.ts');
    const handler = extractHandler(source, 'performance_profile', 'performance_optimize');
    expect(handler).not.toContain('_stub: true');
  });

  it('should contain real profiling calls (process.cpuUsage, process.memoryUsage, performance.now)', () => {
    const source = readSource('performance-tools.ts');
    const handler = extractHandler(source, 'performance_profile', 'performance_optimize');
    expect(handler).toContain('process.cpuUsage');
    expect(handler).toContain('process.memoryUsage');
    expect(handler).toContain('performance.now()');
  });

  it('should return _real: true', () => {
    const source = readSource('performance-tools.ts');
    const handler = extractHandler(source, 'performance_profile', 'performance_optimize');
    expect(handler).toContain('_real: true');
  });
});

// =========================================================================
// 2. performance_bottleneck is real
// =========================================================================
describe('performance_bottleneck is real', () => {
  it('should NOT contain _stub: true', () => {
    const source = readSource('performance-tools.ts');
    const handler = extractHandler(source, 'performance_bottleneck', 'performance_benchmark');
    expect(handler).not.toContain('_stub: true');
  });

  it('should contain os.loadavg or os.cpus or process.memoryUsage', () => {
    const source = readSource('performance-tools.ts');
    const handler = extractHandler(source, 'performance_bottleneck', 'performance_benchmark');
    const hasRealCalls =
      handler.includes('os.loadavg') ||
      handler.includes('os.cpus') ||
      handler.includes('process.memoryUsage');
    expect(hasRealCalls).toBe(true);
  });

  it('should return _real: true', () => {
    const source = readSource('performance-tools.ts');
    const handler = extractHandler(source, 'performance_bottleneck', 'performance_benchmark');
    expect(handler).toContain('_real: true');
  });
});

// =========================================================================
// 3. performance_optimize is real
// =========================================================================
describe('performance_optimize is real', () => {
  it('should NOT contain _stub: true', () => {
    const source = readSource('performance-tools.ts');
    const handler = extractHandler(source, 'performance_optimize', 'performance_metrics');
    expect(handler).not.toContain('_stub: true');
  });

  it('should contain real system calls (os.loadavg, os.totalmem, process.memoryUsage)', () => {
    const source = readSource('performance-tools.ts');
    const handler = extractHandler(source, 'performance_optimize', 'performance_metrics');
    const hasRealCalls =
      handler.includes('os.loadavg') ||
      handler.includes('os.totalmem') ||
      handler.includes('os.cpus');
    expect(hasRealCalls).toBe(true);
    expect(handler).toContain('process.memoryUsage');
  });

  it('should return _real: true', () => {
    const source = readSource('performance-tools.ts');
    const handler = extractHandler(source, 'performance_optimize', 'performance_metrics');
    expect(handler).toContain('_real: true');
  });
});

// =========================================================================
// 4. neural_compress is real
// =========================================================================
describe('neural_compress is real', () => {
  it('should NOT contain _stub: true', () => {
    const source = readSource('neural-tools.ts');
    const handler = extractHandler(source, 'neural_compress', 'neural_status');
    expect(handler).not.toContain('_stub: true');
  });

  it('should contain quantizeInt8 or cosine or pattern manipulation', () => {
    const source = readSource('neural-tools.ts');
    const handler = extractHandler(source, 'neural_compress', 'neural_status');
    const hasRealOps =
      handler.includes('quantizeInt8') ||
      handler.includes('cosine') ||
      handler.includes('cosineSimilarity');
    expect(hasRealOps).toBe(true);
  });

  it('should return _real: true on success paths', () => {
    const source = readSource('neural-tools.ts');
    const handler = extractHandler(source, 'neural_compress', 'neural_status');
    expect(handler).toContain('_real: true');
  });
});

// =========================================================================
// 5. neural_optimize is real
// =========================================================================
describe('neural_optimize is real', () => {
  it('should NOT contain _stub: true', () => {
    const source = readSource('neural-tools.ts');
    const handler = extractHandler(source, 'neural_optimize');
    expect(handler).not.toContain('_stub: true');
  });

  it('should contain real pattern analysis (cosineSimilarity, quantizeInt8, or embedding manipulation)', () => {
    const source = readSource('neural-tools.ts');
    const handler = extractHandler(source, 'neural_optimize');
    const hasRealAnalysis =
      handler.includes('cosineSimilarity') ||
      handler.includes('quantizeInt8') ||
      handler.includes('embedding');
    expect(hasRealAnalysis).toBe(true);
  });

  it('should return _real: true on success', () => {
    const source = readSource('neural-tools.ts');
    const handler = extractHandler(source, 'neural_optimize');
    expect(handler).toContain('_real: true');
  });
});

// =========================================================================
// 6. request-tracker module exists and exports correctly
// =========================================================================
describe('request-tracker module', () => {
  const trackerPath = join(MCP_TOOLS, 'request-tracker.ts');

  it('should exist', () => {
    expect(existsSync(trackerPath)).toBe(true);
  });

  it('should export trackRequest', () => {
    const source = readFileSync(trackerPath, 'utf-8');
    expect(source).toContain('export function trackRequest');
  });

  it('should export getRequestCounts', () => {
    const source = readFileSync(trackerPath, 'utf-8');
    expect(source).toContain('export function getRequestCounts');
  });

  it('should export resetRequestCounts', () => {
    const source = readFileSync(trackerPath, 'utf-8');
    expect(source).toContain('export function resetRequestCounts');
  });
});

// =========================================================================
// 7. system_metrics uses request tracker
// =========================================================================
describe('system_metrics uses request tracker', () => {
  it('should import or reference request-tracker or getRequestCounts', () => {
    const source = readSource('system-tools.ts');
    const usesTracker =
      source.includes('request-tracker') ||
      source.includes('getRequestCounts');
    expect(usesTracker).toBe(true);
  });

  it('should call getRequestCounts in the system_metrics handler', () => {
    const source = readSource('system-tools.ts');
    const handler = extractHandler(source, 'system_metrics', 'system_health');
    expect(handler).toContain('getRequestCounts');
  });
});

// =========================================================================
// 8. hive-mind has AgentDB integration
// =========================================================================
describe('hive-mind has AgentDB integration', () => {
  it('should contain bridgeStoreEntry or memory-bridge import', () => {
    const source = readSource('hive-mind-tools.ts');
    const hasIntegration =
      source.includes('bridgeStoreEntry') ||
      source.includes('memory-bridge');
    expect(hasIntegration).toBe(true);
  });
});

// =========================================================================
// 9. daa-tools has AgentDB integration in multiple handlers
// =========================================================================
describe('daa-tools has AgentDB integration', () => {
  it('should contain bridgeStoreEntry or memory-bridge', () => {
    const source = readSource('daa-tools.ts');
    const hasIntegration =
      source.includes('bridgeStoreEntry') ||
      source.includes('memory-bridge');
    expect(hasIntegration).toBe(true);
  });

  it('should have AgentDB integration in at least 3 handler sections', () => {
    const source = readSource('daa-tools.ts');
    // Count distinct occurrences of memory-bridge imports
    const bridgeImports = source.match(/import\(['"]\.\.\/memory\/memory-bridge/g) || [];
    expect(bridgeImports.length).toBeGreaterThanOrEqual(3);
  });

  it('should have integration in knowledge_share handler', () => {
    const source = readSource('daa-tools.ts');
    const handler = extractHandler(source, 'daa_knowledge_share', 'daa_learning_status');
    const hasIntegration =
      handler.includes('bridgeStoreEntry') ||
      handler.includes('memory-bridge');
    expect(hasIntegration).toBe(true);
  });

  it('should have integration in agent_adapt handler', () => {
    const source = readSource('daa-tools.ts');
    const handler = extractHandler(source, 'daa_agent_adapt', 'daa_workflow_create');
    const hasIntegration =
      handler.includes('bridgeStoreEntry') ||
      handler.includes('bridgeRecordFeedback') ||
      handler.includes('memory-bridge');
    expect(hasIntegration).toBe(true);
  });

  it('should have integration in agent_create or workflow_execute handler', () => {
    const source = readSource('daa-tools.ts');
    const createHandler = extractHandler(source, 'daa_agent_create', 'daa_agent_adapt');
    const executeHandler = extractHandler(source, 'daa_workflow_execute', 'daa_knowledge_share');
    const hasIntegration =
      createHandler.includes('bridgeStoreEntry') ||
      createHandler.includes('memory-bridge') ||
      executeHandler.includes('bridgeStoreEntry') ||
      executeHandler.includes('memory-bridge');
    expect(hasIntegration).toBe(true);
  });
});

// =========================================================================
// 10. No remaining _stub: true in performance tools
// =========================================================================
describe('No remaining _stub: true in performance tools', () => {
  it('should have zero occurrences of _stub: true in performance-tools.ts', () => {
    const source = readSource('performance-tools.ts');
    const stubMatches = source.match(/_stub:\s*true/g) || [];
    expect(stubMatches.length).toBe(0);
  });
});

// =========================================================================
// 11. No remaining _stub: true in neural compress/optimize handlers
// =========================================================================
describe('No remaining _stub: true in neural compress/optimize', () => {
  it('should have zero _stub: true in neural_compress handler', () => {
    const source = readSource('neural-tools.ts');
    const handler = extractHandler(source, 'neural_compress', 'neural_status');
    const stubMatches = handler.match(/_stub:\s*true/g) || [];
    expect(stubMatches.length).toBe(0);
  });

  it('should have zero _stub: true in neural_optimize handler', () => {
    const source = readSource('neural-tools.ts');
    const handler = extractHandler(source, 'neural_optimize');
    const stubMatches = handler.match(/_stub:\s*true/g) || [];
    expect(stubMatches.length).toBe(0);
  });
});
