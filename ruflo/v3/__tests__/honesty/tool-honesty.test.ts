/**
 * Tool Honesty Integration Tests (v3.5.56-57)
 *
 * These tests verify that MCP tool handlers do not fabricate data.
 * They primarily do source-level checks (reading .ts files and asserting
 * dishonest patterns are absent) plus lightweight runtime checks where feasible.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Paths relative to this test file
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

// Helper: extract the body of a tool block starting at `name: '<toolName>'`.
// Walks backward to the outer `{` that opens the tool object, then forward
// counting braces until that outer object closes. Returns the full tool
// block regardless of how long the handler body has grown.
function extractToolBlock(source: string, toolName: string, maxChars = 100_000): string {
  const namePos = source.indexOf(`name: '${toolName}'`);
  if (namePos < 0) return '';

  // Walk backward to find the `{` that opens the tool object. Skip over
  // earlier inner braces (e.g. block comments don't matter; inputSchema/
  // handler bodies appear AFTER name, not before).
  let openBrace = namePos;
  while (openBrace > 0 && source[openBrace] !== '{') openBrace--;
  if (source[openBrace] !== '{') return source.slice(namePos, namePos + maxChars);

  // Walk forward from openBrace counting depth. Brace at openBrace = depth 1.
  // Bound the scan by maxChars so a malformed file can't hang the test.
  const end = Math.min(source.length, openBrace + maxChars);
  let depth = 0;
  for (let i = openBrace; i < end; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(openBrace, i + 1);
    }
  }
  return source.slice(openBrace, end);
}

// Helper: find all Math.random() usages and classify them
function findMathRandomUsages(source: string): { line: number; text: string; isIdGeneration: boolean }[] {
  const lines = source.split('\n');
  const usages: { line: number; text: string; isIdGeneration: boolean }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('Math.random()')) {
      // ID generation patterns use .toString(36) to create random IDs
      const isIdGeneration = line.includes('.toString(36)');
      usages.push({ line: i + 1, text: line.trim(), isIdGeneration });
    }
  }

  return usages;
}

describe('Tool Honesty (v3.5.56-57)', () => {
  // =========================================================================
  // 1. No Math.random() in metrics/confidence/accuracy contexts
  // =========================================================================
  describe('No Math.random() in metrics', () => {
    const filesToCheck = [
      'performance-tools.ts',
      'system-tools.ts',
      'hooks-tools.ts',
      'daa-tools.ts',
      'neural-tools.ts',
      'embeddings-tools.ts',
    ];

    it.each(filesToCheck)('should not use Math.random() for metrics in %s', (fileName) => {
      const source = readSource(fileName);
      const usages = findMathRandomUsages(source);
      const metricUsages = usages.filter(u => !u.isIdGeneration);

      // Filter out legitimate uses: performance benchmark array generation
      // (used to actually benchmark sorting/matrix ops, not to fabricate metrics)
      const fabricatedUsages = metricUsages.filter(u => {
        // Real benchmark computation: filling arrays for sorting or matrix multiplication
        if (u.text.includes('new Array') && u.text.includes('.fill(0).map')) return false;
        if (u.text.includes('Array.from') && u.text.includes('Math.random()')) return false;
        return true;
      });

      expect(fabricatedUsages).toEqual([]);
    });

    it('should not use Math.random() for confidence scores anywhere in mcp-tools', () => {
      const allFiles = [
        'performance-tools.ts', 'system-tools.ts', 'hooks-tools.ts',
        'daa-tools.ts', 'neural-tools.ts', 'embeddings-tools.ts',
        'agent-tools.ts', 'coordination-tools.ts', 'memory-tools.ts',
      ];

      for (const fileName of allFiles) {
        const source = readSource(fileName);
        // Check that Math.random() never appears near confidence/accuracy/score assignment
        const lines = source.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('Math.random()') && !line.includes('.toString(36)')) {
            // This line uses Math.random() for something other than ID generation.
            // Verify it is NOT assigning to a confidence/accuracy/score field.
            const contextWindow = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
            const isFabricatingMetric =
              /(?:confidence|accuracy|score|successRate|similarity)\s*[:=].*Math\.random/.test(contextWindow) ||
              /Math\.random.*(?:confidence|accuracy|score|successRate|similarity)/.test(contextWindow);

            expect(isFabricatingMetric).toBe(false);
          }
        }
      }
    });
  });

  // =========================================================================
  // 2. daa_agent_adapt has no setTimeout (no fake delays)
  // =========================================================================
  describe('No fake delays in daa_agent_adapt', () => {
    it('should not contain setTimeout in daa-tools.ts', () => {
      const source = readSource('daa-tools.ts');
      expect(source).not.toContain('setTimeout');
    });

    it('should handle daa_agent_adapt synchronously (< 50ms conceptual)', () => {
      const source = readSource('daa-tools.ts');
      // Verify the handler does NOT contain any sleep/delay pattern
      expect(source).not.toMatch(/new Promise.*setTimeout/);
      expect(source).not.toMatch(/await.*delay/);
      expect(source).not.toMatch(/await.*sleep/);
    });
  });

  // =========================================================================
  // 3. daa_workflow_execute does not auto-complete steps
  // =========================================================================
  describe('daa_workflow_execute does not auto-complete', () => {
    it('should not set step status to completed in the execute handler', () => {
      const source = readSource('daa-tools.ts');

      // Find the daa_workflow_execute handler section
      const executeStart = source.indexOf("name: 'daa_workflow_execute'");
      expect(executeStart).toBeGreaterThan(-1);

      // Find the next tool definition to bound the handler
      const nextToolStart = source.indexOf("name: 'daa_knowledge_share'");
      expect(nextToolStart).toBeGreaterThan(executeStart);

      const handlerSource = source.slice(executeStart, nextToolStart);

      // The handler should NOT mark steps as 'completed'
      expect(handlerSource).not.toContain("status: 'completed'");
      expect(handlerSource).not.toContain('status: "completed"');

      // The handler should set the workflow status to 'running' (not 'completed')
      expect(handlerSource).toContain("'running'");

      // The handler should include the _note about steps not being auto-executed
      expect(handlerSource).toContain('Steps are tracked but not auto-executed');
    });

    it('should preserve step status as pending after execute', () => {
      const source = readSource('daa-tools.ts');

      // Verify the workflow_create handler sets steps to 'pending'
      const createStart = source.indexOf("name: 'daa_workflow_create'");
      const executeStart = source.indexOf("name: 'daa_workflow_execute'");
      const createSource = source.slice(createStart, executeStart);

      expect(createSource).toContain("status: 'pending'");
    });
  });

  // =========================================================================
  // 4. system_reset uses real OS values
  // =========================================================================
  describe('system_reset uses real OS values', () => {
    it('should use os.loadavg() for cpu in the reset handler', () => {
      const source = readSource('system-tools.ts');

      // Find the system_reset handler section
      const resetStart = source.indexOf("name: 'system_reset'");
      expect(resetStart).toBeGreaterThan(-1);

      const handlerSection = extractToolBlock(source, 'system_reset');

      // Should use real os functions, not hardcoded values
      expect(handlerSection).toContain('os.loadavg()');
      expect(handlerSection).toContain('os.totalmem()');
      expect(handlerSection).toContain('os.freemem()');

      // Should NOT contain hardcoded fake values
      expect(handlerSection).not.toMatch(/cpu:\s*25\b/);
      expect(handlerSection).not.toMatch(/total:\s*1024\b/);
    });

    it('should use os.totalmem() and os.freemem() for memory values', () => {
      const source = readSource('system-tools.ts');
      const resetStart = source.indexOf("name: 'system_reset'");
      const handlerSection = extractToolBlock(source, 'system_reset');

      // Verify memory is computed from os module
      expect(handlerSection).toContain('os.totalmem()');
      expect(handlerSection).toContain('os.freemem()');
      expect(handlerSection).toContain('Math.round');
    });

    it('should import the os module', () => {
      const source = readSource('system-tools.ts');
      expect(source).toMatch(/import.*os.*from.*['"]node:os['"]/);
    });
  });

  // =========================================================================
  // 5. hooks_intelligence_attention fallback returns empty results
  // =========================================================================
  describe('hooks_intelligence_attention fallback', () => {
    it('should return empty results array when no backend is available', () => {
      const source = readSource('hooks-tools.ts');

      // Find the hooks_intelligence_attention handler
      const attentionStart = source.indexOf("name: 'hooks_intelligence_attention'");
      expect(attentionStart).toBeGreaterThan(-1);

      // Get the handler section (up to the next major section marker)
      const handlerSection = extractToolBlock(source, 'hooks_intelligence_attention');

      // When no real implementation worked, results should be empty
      expect(handlerSection).toContain("implementation = 'none'");

      // Should NOT fabricate fake weights with Math.exp
      expect(handlerSection).not.toContain('Math.exp');

      // Should NOT generate fake results when implementation is none
      // Verify the fallback logic: "If no real implementation worked, return empty"
      expect(handlerSection).toContain('results.length === 0');
    });

    it('should mark _stub as true when no backend is available', () => {
      const source = readSource('hooks-tools.ts');
      const attentionStart = source.indexOf("name: 'hooks_intelligence_attention'");
      const handlerSection = extractToolBlock(source, 'hooks_intelligence_attention');

      // The stats object should indicate stub status when implementation is 'none'
      expect(handlerSection).toContain("_stub: implementation === 'none'");
    });

    it('should not generate fake speedup claims when no backend is available', () => {
      const source = readSource('hooks-tools.ts');
      const handlerSection = extractToolBlock(source, 'hooks_intelligence_attention');

      // Honesty principle: don't fabricate a speedup claim. The handler can
      // satisfy this two ways:
      //   (a) Have no speedup field at all (current implementation — no
      //       claim is made when there's no real backend).
      //   (b) Have a speedup field gated by implementation.startsWith('real-')
      //       so it only emits a value when real work happened.
      // Both pass; only an UNCONDITIONAL speedup claim should fail.
      const speedupRegex = /\bspeedup\s*:/m;
      const hasSpeedupField = speedupRegex.test(handlerSection);
      if (hasSpeedupField) {
        expect(handlerSection).toMatch(/speedup\s*:[^,}]*implementation\.startsWith\('real-'\)/);
      }
      // Always verify no fabricated number literal is unconditionally returned.
      expect(handlerSection).not.toMatch(/speedup\s*:\s*[\d.]+/m);
    });
  });

  // =========================================================================
  // 6. No "Simulated" text in embeddings
  // =========================================================================
  describe('No "Simulated" text in embeddings', () => {
    it('should not contain "Simulated" in embeddings-tools.ts', () => {
      const source = readSource('embeddings-tools.ts');
      expect(source).not.toContain('Simulated');
    });

    it('should not contain "simulated" (case-insensitive) in embeddings-tools.ts', () => {
      const source = readSource('embeddings-tools.ts');
      // Allow "Simulated" only in comments explaining what was removed
      const lines = source.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/simulated/i.test(line)) {
          // It is acceptable in a comment explaining the fix
          const isComment = line.trim().startsWith('//') || line.trim().startsWith('*');
          if (!isComment) {
            expect(line).not.toMatch(/simulated/i);
          }
        }
      }
    });

    it('should return honest empty results when no embeddings are indexed', () => {
      const source = readSource('embeddings-tools.ts');
      // Check that the fallback message is honest
      expect(source).toContain('No embeddings indexed yet');
    });
  });

  // =========================================================================
  // 7. Benchmark fallback returns 0 not 0.5 for searchTime
  // =========================================================================
  describe('Benchmark fallback returns 0 for searchTimeMs', () => {
    it('should return searchTimeMs: 0 in pattern-search fallback', () => {
      const source = readSource('hooks-tools.ts');

      // Find the hooks_intelligence_pattern-search handler
      const patternSearchStart = source.indexOf("name: 'hooks_intelligence_pattern-search'");
      expect(patternSearchStart).toBeGreaterThan(-1);

      // Get the handler up to the next tool definition
      const remaining = source.slice(patternSearchStart);
      const nextToolMatch = remaining.indexOf("\nname: '", 10);
      const endIdx = nextToolMatch > 0 ? nextToolMatch : remaining.indexOf('\n};', 100);
      const handlerSection = remaining.slice(0, endIdx > 0 ? endIdx : 2000);

      // The fallback searchTimeMs should be 0, never 0.5
      expect(handlerSection).not.toContain('searchTimeMs: 0.5');

      // All fallback paths should use 0
      const searchTimeMatches = handlerSection.match(/searchTimeMs:\s*[\d.]+/g) || [];
      for (const match of searchTimeMatches) {
        const value = parseFloat(match.replace('searchTimeMs:', '').trim());
        // Values of 0 are honest fallbacks; real values from searchResult.searchTime are fine too
        // But fabricated values like 0.5 are not acceptable
        if (!match.includes('searchResult.searchTime')) {
          expect(value).toBe(0);
        }
      }
    });

    it('should return searchTimeMs: 0 in error and unavailable paths', () => {
      const source = readSource('hooks-tools.ts');

      // Check that error/unavailable fallback paths use searchTimeMs: 0
      const errorFallbacks = source.match(/backend:\s*'(?:error|unavailable)'[\s\S]*?searchTimeMs:\s*([\d.]+)/g) || [];
      // Also check the reverse: searchTimeMs before backend
      const fallbackBlocks = source.match(/searchTimeMs:\s*([\d.]+)[\s\S]*?backend:\s*'(?:error|unavailable)'/g) || [];

      // Combine and verify all use 0
      const all = [...errorFallbacks, ...fallbackBlocks];
      for (const block of all) {
        const timeMatch = block.match(/searchTimeMs:\s*([\d.]+)/);
        if (timeMatch) {
          expect(parseFloat(timeMatch[1])).toBe(0);
        }
      }
    });
  });

  // =========================================================================
  // Bonus: Verify performance_report uses real OS values (not fabricated)
  // =========================================================================
  describe('performance_report uses real OS values', () => {
    it('should use process.memoryUsage() and os module for real metrics', () => {
      const source = readSource('performance-tools.ts');

      const reportStart = source.indexOf("name: 'performance_report'");
      expect(reportStart).toBeGreaterThan(-1);

      const handlerSection = extractToolBlock(source, 'performance_report');

      expect(handlerSection).toContain('process.memoryUsage()');
      expect(handlerSection).toContain('process.cpuUsage()');
      expect(handlerSection).toContain('os.loadavg()');
      expect(handlerSection).toContain('os.cpus()');
      expect(handlerSection).toContain('os.totalmem()');
      expect(handlerSection).toContain('os.freemem()');
    });

    it('should mark report output with _real: true', () => {
      const source = readSource('performance-tools.ts');
      expect(source).toContain('_real: true');
    });

    it('should use real timing in performance_benchmark', () => {
      const source = readSource('performance-tools.ts');

      const benchmarkStart = source.indexOf("name: 'performance_benchmark'");
      expect(benchmarkStart).toBeGreaterThan(-1);

      const handlerSection = extractToolBlock(source, 'performance_benchmark');

      // Should use performance.now() for real timing
      expect(handlerSection).toContain('performance.now()');
      // Should have a warmup phase
      expect(handlerSection).toMatch(/[Ww]armup/);
    });
  });

  // =========================================================================
  // Bonus: Stubs are marked honestly with _stub: true
  // =========================================================================
  describe('Performance tools are real implementations', () => {
    it('should have real performance_profile (not _stub)', () => {
      const source = readSource('performance-tools.ts');
      const profileStart = source.indexOf("name: 'performance_profile'");
      expect(profileStart).toBeGreaterThan(-1);

      const handlerSection = extractToolBlock(source, 'performance_profile');
      expect(handlerSection).not.toContain('_stub: true');
      expect(handlerSection).toContain('_real: true');
    });

    it('should have real performance_optimize (not _stub)', () => {
      const source = readSource('performance-tools.ts');
      const optimizeStart = source.indexOf("name: 'performance_optimize'");
      expect(optimizeStart).toBeGreaterThan(-1);

      const handlerSection = extractToolBlock(source, 'performance_optimize');
      expect(handlerSection).not.toContain('_stub: true');
      expect(handlerSection).toContain('_real: true');
    });

    it('should have real performance_bottleneck (not _stub)', () => {
      const source = readSource('performance-tools.ts');
      const bottleneckStart = source.indexOf("name: 'performance_bottleneck'");
      expect(bottleneckStart).toBeGreaterThan(-1);

      const handlerSection = extractToolBlock(source, 'performance_bottleneck');
      expect(handlerSection).not.toContain('_stub: true');
      expect(handlerSection).toContain('_real: true');
    });
  });
});
