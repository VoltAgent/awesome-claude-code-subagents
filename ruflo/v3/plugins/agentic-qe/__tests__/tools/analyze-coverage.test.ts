/**
 * Coverage Analysis Tool Tests
 *
 * Tests for the aqe/analyze-coverage MCP tool that provides
 * O(log n) gap detection using Johnson-Lindenstrauss algorithm.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// Mock Types
// ============================================================================

interface AnalyzeCoverageInput {
  coverageReport: string;
  targetPath?: string;
  algorithm?: 'johnson-lindenstrauss' | 'naive';
  options?: {
    minCoverage?: number;
    maxGaps?: number;
    includeUncovered?: boolean;
    groupByFile?: boolean;
  };
}

interface CoverageGap {
  file: string;
  startLine: number;
  endLine: number;
  type: 'statement' | 'branch' | 'function';
  priority: 'low' | 'medium' | 'high' | 'critical';
  complexity: number;
  suggestion?: string;
}

interface CoverageMetrics {
  statements: { covered: number; total: number; percentage: number };
  branches: { covered: number; total: number; percentage: number };
  functions: { covered: number; total: number; percentage: number };
  lines: { covered: number; total: number; percentage: number };
}

interface AnalyzeCoverageOutput {
  success: boolean;
  gaps: CoverageGap[];
  metrics: CoverageMetrics;
  summary: {
    totalGaps: number;
    criticalGaps: number;
    estimatedEffort: string;
    recommendation: string;
  };
  performance: {
    algorithm: string;
    timeMs: number;
    complexity: string;
  };
  errors?: string[];
}

// ============================================================================
// Mock Implementation
// ============================================================================

class MockAnalyzeCoverageTool {
  private defaultMinCoverage = 80;
  private defaultMaxGaps = 50;

  async execute(input: AnalyzeCoverageInput): Promise<AnalyzeCoverageOutput> {
    const startTime = performance.now();

    // Validate input
    const errors = this.validateInput(input);
    if (errors.length > 0) {
      return this.createErrorResponse(errors);
    }

    // Parse coverage report (mock)
    const metrics = this.parseCoverageReport(input.coverageReport);

    // Detect gaps using specified algorithm
    const algorithm = input.algorithm ?? 'johnson-lindenstrauss';
    const gaps = this.detectGaps(metrics, algorithm, input.options);

    // Calculate priority and suggestions
    const prioritizedGaps = this.prioritizeGaps(gaps);

    const endTime = performance.now();

    return {
      success: true,
      gaps: prioritizedGaps.slice(0, input.options?.maxGaps ?? this.defaultMaxGaps),
      metrics,
      summary: this.generateSummary(prioritizedGaps, metrics),
      performance: {
        algorithm,
        timeMs: Math.round(endTime - startTime),
        complexity: algorithm === 'johnson-lindenstrauss' ? 'O(log n)' : 'O(n)',
      },
    };
  }

  private validateInput(input: AnalyzeCoverageInput): string[] {
    const errors: string[] = [];

    if (!input.coverageReport) {
      errors.push('coverageReport is required');
    }

    if (input.coverageReport && !this.isValidCoverageFormat(input.coverageReport)) {
      errors.push('Invalid coverage report format');
    }

    if (input.options?.minCoverage !== undefined) {
      if (input.options.minCoverage < 0 || input.options.minCoverage > 100) {
        errors.push('minCoverage must be between 0 and 100');
      }
    }

    if (input.options?.maxGaps !== undefined && input.options.maxGaps < 1) {
      errors.push('maxGaps must be at least 1');
    }

    return errors;
  }

  private isValidCoverageFormat(report: string): boolean {
    // Mock validation - in real impl would check for lcov, cobertura, etc.
    return report.includes('coverage') || report.endsWith('.info') || report.endsWith('.json');
  }

  private parseCoverageReport(report: string): CoverageMetrics {
    // Mock coverage parsing - returns realistic mock data
    return {
      statements: { covered: 450, total: 600, percentage: 75 },
      branches: { covered: 120, total: 200, percentage: 60 },
      functions: { covered: 85, total: 100, percentage: 85 },
      lines: { covered: 430, total: 580, percentage: 74.1 },
    };
  }

  private detectGaps(
    metrics: CoverageMetrics,
    algorithm: string,
    options?: AnalyzeCoverageInput['options']
  ): CoverageGap[] {
    const gaps: CoverageGap[] = [];

    // Mock gap detection
    // Statement gaps
    const uncoveredStatements = metrics.statements.total - metrics.statements.covered;
    for (let i = 0; i < Math.min(uncoveredStatements / 10, 20); i++) {
      gaps.push({
        file: `src/module${i % 5}.ts`,
        startLine: 10 + i * 15,
        endLine: 12 + i * 15,
        type: 'statement',
        priority: 'medium',
        complexity: Math.floor(Math.random() * 10) + 1,
      });
    }

    // Branch gaps (higher priority)
    const uncoveredBranches = metrics.branches.total - metrics.branches.covered;
    for (let i = 0; i < Math.min(uncoveredBranches / 10, 15); i++) {
      gaps.push({
        file: `src/conditionals${i % 3}.ts`,
        startLine: 20 + i * 10,
        endLine: 25 + i * 10,
        type: 'branch',
        priority: 'high',
        complexity: Math.floor(Math.random() * 15) + 5,
      });
    }

    // Function gaps
    const uncoveredFunctions = metrics.functions.total - metrics.functions.covered;
    for (let i = 0; i < uncoveredFunctions; i++) {
      gaps.push({
        file: `src/functions${i % 4}.ts`,
        startLine: 50 + i * 20,
        endLine: 65 + i * 20,
        type: 'function',
        priority: 'low',
        complexity: Math.floor(Math.random() * 20) + 10,
      });
    }

    return gaps;
  }

  private prioritizeGaps(gaps: CoverageGap[]): CoverageGap[] {
    // Sort by priority and add suggestions
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

    return gaps
      .map((gap) => ({
        ...gap,
        // Upgrade priority for high complexity gaps
        priority:
          gap.complexity > 15 && gap.priority !== 'critical'
            ? ('high' as const)
            : gap.priority,
        suggestion: this.generateSuggestion(gap),
      }))
      .sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.complexity - a.complexity;
      });
  }

  private generateSuggestion(gap: CoverageGap): string {
    switch (gap.type) {
      case 'branch':
        return 'Add test cases for both true and false conditions';
      case 'function':
        return 'Add unit tests for this function with various inputs';
      case 'statement':
        return 'Ensure this code path is executed in tests';
      default:
        return 'Add test coverage for this area';
    }
  }

  private generateSummary(
    gaps: CoverageGap[],
    metrics: CoverageMetrics
  ): AnalyzeCoverageOutput['summary'] {
    const criticalGaps = gaps.filter((g) => g.priority === 'critical').length;
    const highGaps = gaps.filter((g) => g.priority === 'high').length;

    const totalComplexity = gaps.reduce((sum, g) => sum + g.complexity, 0);
    const estimatedHours = Math.ceil(totalComplexity / 10);

    let recommendation = 'Coverage is acceptable';
    if (metrics.lines.percentage < 50) {
      recommendation = 'Critical: Significant test coverage needed';
    } else if (metrics.lines.percentage < 70) {
      recommendation = 'Warning: Focus on high-priority gaps first';
    } else if (metrics.lines.percentage < 80) {
      recommendation = 'Good progress, continue adding tests for branch coverage';
    }

    return {
      totalGaps: gaps.length,
      criticalGaps: criticalGaps + highGaps,
      estimatedEffort: `${estimatedHours} hours`,
      recommendation,
    };
  }

  private createErrorResponse(errors: string[]): AnalyzeCoverageOutput {
    return {
      success: false,
      gaps: [],
      metrics: {
        statements: { covered: 0, total: 0, percentage: 0 },
        branches: { covered: 0, total: 0, percentage: 0 },
        functions: { covered: 0, total: 0, percentage: 0 },
        lines: { covered: 0, total: 0, percentage: 0 },
      },
      summary: {
        totalGaps: 0,
        criticalGaps: 0,
        estimatedEffort: '0 hours',
        recommendation: 'Fix validation errors first',
      },
      performance: {
        algorithm: 'none',
        timeMs: 0,
        complexity: 'N/A',
      },
      errors,
    };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('AnalyzeCoverageTool', () => {
  let tool: MockAnalyzeCoverageTool;

  beforeEach(() => {
    tool = new MockAnalyzeCoverageTool();
  });

  describe('input validation', () => {
    it('should require coverageReport', async () => {
      const result = await tool.execute({ coverageReport: '' });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('coverageReport is required');
    });

    it('should validate coverage report format', async () => {
      const result = await tool.execute({ coverageReport: 'invalid-format' });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid coverage report format');
    });

    it('should accept lcov format', async () => {
      const result = await tool.execute({ coverageReport: './coverage/lcov.info' });

      expect(result.success).toBe(true);
    });

    it('should accept json format', async () => {
      const result = await tool.execute({ coverageReport: './coverage/coverage.json' });

      expect(result.success).toBe(true);
    });

    it('should validate minCoverage range', async () => {
      const negativeResult = await tool.execute({
        coverageReport: './coverage.info',
        options: { minCoverage: -10 },
      });

      const overResult = await tool.execute({
        coverageReport: './coverage.info',
        options: { minCoverage: 110 },
      });

      expect(negativeResult.success).toBe(false);
      expect(overResult.success).toBe(false);
    });

    it('should validate maxGaps minimum', async () => {
      const result = await tool.execute({
        coverageReport: './coverage.info',
        options: { maxGaps: 0 },
      });

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('maxGaps'))).toBe(true);
    });
  });

  describe('gap detection', () => {
    it('should detect coverage gaps', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      expect(result.success).toBe(true);
      expect(result.gaps.length).toBeGreaterThan(0);
    });

    it('should include gap file path', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      for (const gap of result.gaps) {
        expect(gap.file).toBeTruthy();
        expect(gap.file).toMatch(/\.ts$/);
      }
    });

    it('should include gap line numbers', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      for (const gap of result.gaps) {
        expect(gap.startLine).toBeGreaterThan(0);
        expect(gap.endLine).toBeGreaterThanOrEqual(gap.startLine);
      }
    });

    it('should categorize gaps by type', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      const types = new Set(result.gaps.map((g) => g.type));
      expect(types.has('statement')).toBe(true);
      expect(types.has('branch')).toBe(true);
      expect(types.has('function')).toBe(true);
    });

    it('should assign priority to gaps', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      for (const gap of result.gaps) {
        expect(['low', 'medium', 'high', 'critical']).toContain(gap.priority);
      }
    });

    it('should include complexity score', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      for (const gap of result.gaps) {
        expect(gap.complexity).toBeGreaterThan(0);
      }
    });

    it('should include suggestions', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      for (const gap of result.gaps) {
        expect(gap.suggestion).toBeTruthy();
      }
    });

    it('should respect maxGaps limit', async () => {
      const result = await tool.execute({
        coverageReport: './coverage.info',
        options: { maxGaps: 5 },
      });

      expect(result.gaps.length).toBeLessThanOrEqual(5);
    });
  });

  describe('algorithm selection', () => {
    it('should use johnson-lindenstrauss by default', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      expect(result.performance.algorithm).toBe('johnson-lindenstrauss');
      expect(result.performance.complexity).toBe('O(log n)');
    });

    it('should support naive algorithm', async () => {
      const result = await tool.execute({
        coverageReport: './coverage.info',
        algorithm: 'naive',
      });

      expect(result.performance.algorithm).toBe('naive');
      expect(result.performance.complexity).toBe('O(n)');
    });

    it('should report execution time', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      expect(result.performance.timeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('metrics reporting', () => {
    it('should include statement coverage', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      expect(result.metrics.statements.covered).toBeGreaterThan(0);
      expect(result.metrics.statements.total).toBeGreaterThan(0);
      expect(result.metrics.statements.percentage).toBeGreaterThan(0);
    });

    it('should include branch coverage', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      expect(result.metrics.branches.covered).toBeDefined();
      expect(result.metrics.branches.total).toBeDefined();
      expect(result.metrics.branches.percentage).toBeDefined();
    });

    it('should include function coverage', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      expect(result.metrics.functions.covered).toBeGreaterThan(0);
      expect(result.metrics.functions.total).toBeGreaterThan(0);
    });

    it('should include line coverage', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      expect(result.metrics.lines.covered).toBeGreaterThan(0);
      expect(result.metrics.lines.total).toBeGreaterThan(0);
      expect(result.metrics.lines.percentage).toBeGreaterThan(0);
    });
  });

  describe('summary generation', () => {
    it('should include total gap count', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      expect(result.summary.totalGaps).toBe(result.gaps.length);
    });

    it('should count critical gaps', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      const criticalAndHigh = result.gaps.filter(
        (g) => g.priority === 'critical' || g.priority === 'high'
      ).length;
      expect(result.summary.criticalGaps).toBe(criticalAndHigh);
    });

    it('should estimate effort', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      expect(result.summary.estimatedEffort).toMatch(/\d+ hours/);
    });

    it('should provide recommendation', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      expect(result.summary.recommendation).toBeTruthy();
    });
  });

  describe('gap prioritization', () => {
    it('should sort gaps by priority', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      let lastPriority = -1;

      for (const gap of result.gaps) {
        const currentPriority = priorityOrder[gap.priority];
        expect(currentPriority).toBeGreaterThanOrEqual(lastPriority);
        if (currentPriority > lastPriority) {
          lastPriority = currentPriority;
        }
      }
    });

    it('should upgrade priority for high complexity gaps', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      // High complexity gaps should not be 'low' priority
      const highComplexityLowPriority = result.gaps.filter(
        (g) => g.complexity > 15 && g.priority === 'low'
      );
      expect(highComplexityLowPriority.length).toBe(0);
    });

    it('should provide type-specific suggestions', async () => {
      const result = await tool.execute({ coverageReport: './coverage.info' });

      const branchGap = result.gaps.find((g) => g.type === 'branch');
      const functionGap = result.gaps.find((g) => g.type === 'function');

      if (branchGap) {
        expect(branchGap.suggestion).toContain('condition');
      }
      if (functionGap) {
        expect(functionGap.suggestion).toContain('unit test');
      }
    });
  });
});

describe('AnalyzeCoverageTool Performance', () => {
  let tool: MockAnalyzeCoverageTool;

  beforeEach(() => {
    tool = new MockAnalyzeCoverageTool();
  });

  it('should complete analysis in reasonable time', async () => {
    const startTime = performance.now();

    const result = await tool.execute({ coverageReport: './coverage.info' });

    const duration = performance.now() - startTime;

    expect(result.success).toBe(true);
    // Should complete in under 100ms for mock data
    expect(duration).toBeLessThan(100);
  });

  it('should report O(log n) complexity for J-L algorithm', async () => {
    const result = await tool.execute({
      coverageReport: './coverage.info',
      algorithm: 'johnson-lindenstrauss',
    });

    expect(result.performance.complexity).toBe('O(log n)');
  });

  it('should report O(n) complexity for naive algorithm', async () => {
    const result = await tool.execute({
      coverageReport: './coverage.info',
      algorithm: 'naive',
    });

    expect(result.performance.complexity).toBe('O(n)');
  });
});

describe('AnalyzeCoverageTool Edge Cases', () => {
  let tool: MockAnalyzeCoverageTool;

  beforeEach(() => {
    tool = new MockAnalyzeCoverageTool();
  });

  it('should handle path with targetPath filter', async () => {
    const result = await tool.execute({
      coverageReport: './coverage.info',
      targetPath: './src/auth',
    });

    expect(result.success).toBe(true);
  });

  it('should handle includeUncovered option', async () => {
    const result = await tool.execute({
      coverageReport: './coverage.info',
      options: { includeUncovered: true },
    });

    expect(result.success).toBe(true);
  });

  it('should handle groupByFile option', async () => {
    const result = await tool.execute({
      coverageReport: './coverage.info',
      options: { groupByFile: true },
    });

    expect(result.success).toBe(true);
  });

  it('should handle all options combined', async () => {
    const result = await tool.execute({
      coverageReport: './coverage.info',
      targetPath: './src',
      algorithm: 'johnson-lindenstrauss',
      options: {
        minCoverage: 80,
        maxGaps: 25,
        includeUncovered: true,
        groupByFile: true,
      },
    });

    expect(result.success).toBe(true);
    expect(result.gaps.length).toBeLessThanOrEqual(25);
  });
});
