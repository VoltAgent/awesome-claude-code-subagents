/**
 * Code Intelligence Plugin - MCP Tools Tests
 *
 * Tests for MCP tool handlers with mock data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  semanticSearchTool,
  architectureAnalyzeTool,
  refactorImpactTool,
  splitSuggestTool,
  learnPatternsTool,
  codeIntelligenceTools,
  getTool,
  getToolNames,
} from '../src/mcp-tools.js';

// Mock bridges
vi.mock('../src/bridges/hnsw-bridge.js', () => ({
  CodeHNSWBridge: vi.fn().mockImplementation(() => ({
    initialized: false,
    initialize: vi.fn().mockResolvedValue(undefined),
    searchSemantic: vi.fn().mockResolvedValue([
      {
        id: 'result-1',
        path: 'src/auth/login.ts',
        content: 'async function login(username, password) { ... }',
        score: 0.92,
        language: 'typescript',
      },
      {
        id: 'result-2',
        path: 'src/auth/session.ts',
        content: 'function createSession(user) { ... }',
        score: 0.85,
        language: 'typescript',
      },
    ]),
    count: vi.fn().mockResolvedValue(5000),
  })),
}));

vi.mock('../src/bridges/gnn-bridge.js', () => ({
  CodeGNNBridge: vi.fn().mockImplementation(() => ({
    initialized: false,
    initialize: vi.fn().mockResolvedValue(undefined),
    analyzeArchitecture: vi.fn().mockResolvedValue({
      components: [
        { name: 'AuthModule', type: 'module', files: 5, dependencies: 3 },
        { name: 'UserService', type: 'service', files: 3, dependencies: 2 },
      ],
      metrics: {
        modularity: 0.72,
        coupling: 0.35,
        cohesion: 0.68,
      },
      issues: [
        { type: 'circular_dependency', components: ['AuthModule', 'UserService'], severity: 'medium' },
      ],
    }),
    analyzeRefactorImpact: vi.fn().mockResolvedValue({
      directImpact: ['src/user.ts', 'src/auth.ts'],
      indirectImpact: ['src/api/routes.ts', 'tests/user.test.ts'],
      riskLevel: 'medium',
      breakingChanges: ['UserService.getById signature changed'],
    }),
    suggestSplit: vi.fn().mockResolvedValue([
      {
        file: 'src/utils.ts',
        reason: 'File exceeds 500 lines with multiple responsibilities',
        suggestedSplits: [
          { name: 'string-utils.ts', functions: ['capitalize', 'truncate', 'slugify'] },
          { name: 'date-utils.ts', functions: ['formatDate', 'parseDate', 'addDays'] },
        ],
      },
    ]),
    learnPatterns: vi.fn().mockResolvedValue({
      patterns: [
        { name: 'Repository Pattern', occurrences: 12, confidence: 0.88 },
        { name: 'Factory Pattern', occurrences: 5, confidence: 0.75 },
      ],
      antiPatterns: [
        { name: 'God Object', files: ['src/app.ts'], severity: 'high' },
      ],
    }),
  })),
}));

// Mock context for testing
const createMockContext = (overrides = {}) => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  userId: 'test-user',
  ...overrides,
});

describe('Code Intelligence MCP Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Registry', () => {
    it('should export all 5 tools', () => {
      expect(codeIntelligenceTools).toHaveLength(5);
    });

    it('should have correct tool names', () => {
      const toolNames = codeIntelligenceTools.map(t => t.name);
      expect(toolNames).toContain('code/semantic-search');
      expect(toolNames).toContain('code/architecture-analyze');
      expect(toolNames).toContain('code/refactor-impact');
      expect(toolNames).toContain('code/split-suggest');
      expect(toolNames).toContain('code/learn-patterns');
    });

    it('should have category code-intelligence', () => {
      for (const tool of codeIntelligenceTools) {
        expect(tool.category).toBe('code-intelligence');
      }
    });

    it('should have version 0.1.0', () => {
      for (const tool of codeIntelligenceTools) {
        expect(tool.version).toBe('0.1.0');
      }
    });

    it('should get tool by name', () => {
      const tool = getTool('code/semantic-search');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('code/semantic-search');
    });

    it('should return undefined for unknown tool', () => {
      const tool = getTool('code/unknown');
      expect(tool).toBeUndefined();
    });

    it('should get all tool names', () => {
      const names = getToolNames();
      expect(names).toHaveLength(5);
      expect(names).toContain('code/semantic-search');
    });
  });

  describe('code/semantic-search', () => {
    it('should have correct tool definition', () => {
      expect(semanticSearchTool.name).toBe('code/semantic-search');
      expect(semanticSearchTool.inputSchema.required).toContain('query');
      expect(semanticSearchTool.cacheable).toBe(true);
    });

    it('should handle valid input', async () => {
      const input = {
        query: 'authentication login function',
        topK: 10,
      };

      const result = await semanticSearchTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.results).toBeDefined();
      expect(Array.isArray(data.results)).toBe(true);
      expect(data.searchTime).toBeDefined();
    });

    it('should handle language filter', async () => {
      const input = {
        query: 'error handling',
        language: 'typescript',
      };

      const result = await semanticSearchTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
    });

    it('should handle search type filter', async () => {
      const types = ['function', 'class', 'interface', 'type', 'variable', 'comment', 'any'] as const;

      for (const searchType of types) {
        const input = {
          query: 'user data',
          searchType,
        };

        const result = await semanticSearchTool.handler(input, createMockContext());
        expect(result.isError).toBeUndefined();
      }
    });

    it('should handle path filter', async () => {
      const input = {
        query: 'API endpoint',
        pathFilter: 'src/api/',
      };

      const result = await semanticSearchTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
    });

    it('should reject missing query', async () => {
      const input = {
        topK: 10,
      };

      const result = await semanticSearchTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
    });

    it('should reject query exceeding max length', async () => {
      const input = {
        query: 'a'.repeat(1001),
      };

      const result = await semanticSearchTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
    });

    it('should reject topK outside valid range', async () => {
      const input = {
        query: 'test',
        topK: 0, // below min
      };

      const result = await semanticSearchTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
    });
  });

  describe('code/architecture-analyze', () => {
    it('should have correct tool definition', () => {
      expect(architectureAnalyzeTool.name).toBe('code/architecture-analyze');
      expect(architectureAnalyzeTool.inputSchema.required).toContain('targetPath');
      expect(architectureAnalyzeTool.cacheable).toBe(true);
    });

    it('should handle valid input', async () => {
      const input = {
        targetPath: 'src/',
        analysisTypes: ['dependencies', 'modularity'],
      };

      const result = await architectureAnalyzeTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.components).toBeDefined();
      expect(data.metrics).toBeDefined();
      expect(data.analysisTime).toBeDefined();
    });

    it('should handle all analysis types', async () => {
      const types = ['dependencies', 'modularity', 'complexity', 'coupling', 'cohesion', 'layers'] as const;

      const input = {
        targetPath: 'src/',
        analysisTypes: [...types],
      };

      const result = await architectureAnalyzeTool.handler(input, createMockContext());
      expect(result.isError).toBeUndefined();
    });

    it('should handle depth option', async () => {
      const input = {
        targetPath: 'src/',
        depth: 5,
      };

      const result = await architectureAnalyzeTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
    });

    it('should handle exclude patterns', async () => {
      const input = {
        targetPath: 'src/',
        excludePatterns: ['node_modules', '*.test.ts'],
      };

      const result = await architectureAnalyzeTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
    });

    it('should reject missing targetPath', async () => {
      const input = {
        analysisTypes: ['dependencies'],
      };

      const result = await architectureAnalyzeTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
    });

    it('should reject targetPath exceeding max length', async () => {
      const input = {
        targetPath: 'a'.repeat(501),
      };

      const result = await architectureAnalyzeTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
    });
  });

  describe('code/refactor-impact', () => {
    it('should have correct tool definition', () => {
      expect(refactorImpactTool.name).toBe('code/refactor-impact');
      expect(refactorImpactTool.inputSchema.required).toContain('targetPath');
      expect(refactorImpactTool.inputSchema.required).toContain('changeType');
      expect(refactorImpactTool.cacheable).toBe(false);
    });

    it('should handle valid input', async () => {
      const input = {
        targetPath: 'src/services/user.ts',
        changeType: 'rename',
        description: 'Rename UserService to UserRepository',
      };

      const result = await refactorImpactTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.directImpact).toBeDefined();
      expect(data.indirectImpact).toBeDefined();
      expect(data.riskLevel).toBeDefined();
    });

    it('should handle all change types', async () => {
      const types = ['rename', 'move', 'delete', 'signature_change', 'type_change', 'dependency_change'] as const;

      for (const changeType of types) {
        const input = {
          targetPath: 'src/test.ts',
          changeType,
        };

        const result = await refactorImpactTool.handler(input, createMockContext());
        expect(result.isError).toBeUndefined();
      }
    });

    it('should handle include tests option', async () => {
      const input = {
        targetPath: 'src/service.ts',
        changeType: 'delete',
        includeTests: true,
      };

      const result = await refactorImpactTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
    });

    it('should handle depth option', async () => {
      const input = {
        targetPath: 'src/core.ts',
        changeType: 'signature_change',
        depth: 3,
      };

      const result = await refactorImpactTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
    });

    it('should reject missing targetPath', async () => {
      const input = {
        changeType: 'rename',
      };

      const result = await refactorImpactTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
    });

    it('should reject missing changeType', async () => {
      const input = {
        targetPath: 'src/test.ts',
      };

      const result = await refactorImpactTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
    });

    it('should reject invalid changeType', async () => {
      const input = {
        targetPath: 'src/test.ts',
        changeType: 'invalid_change',
      };

      const result = await refactorImpactTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
    });
  });

  describe('code/split-suggest', () => {
    it('should have correct tool definition', () => {
      expect(splitSuggestTool.name).toBe('code/split-suggest');
      expect(splitSuggestTool.inputSchema.required).toContain('targetPath');
      expect(splitSuggestTool.cacheable).toBe(true);
    });

    it('should handle valid input', async () => {
      const input = {
        targetPath: 'src/utils.ts',
        threshold: 300,
      };

      const result = await splitSuggestTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.suggestions).toBeDefined();
      expect(data.analysisTime).toBeDefined();
    });

    it('should handle all split strategies', async () => {
      const strategies = ['responsibility', 'cohesion', 'size', 'complexity'] as const;

      for (const strategy of strategies) {
        const input = {
          targetPath: 'src/',
          strategy,
        };

        const result = await splitSuggestTool.handler(input, createMockContext());
        expect(result.isError).toBeUndefined();
      }
    });

    it('should use default threshold', async () => {
      const input = {
        targetPath: 'src/',
      };

      const result = await splitSuggestTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.threshold).toBe(500); // default
    });

    it('should handle include patterns', async () => {
      const input = {
        targetPath: 'src/',
        includePatterns: ['*.ts', '*.tsx'],
      };

      const result = await splitSuggestTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
    });

    it('should reject missing targetPath', async () => {
      const input = {
        threshold: 300,
      };

      const result = await splitSuggestTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
    });

    it('should reject threshold outside valid range', async () => {
      const tooLow = {
        targetPath: 'src/',
        threshold: 49, // below min of 50
      };

      const result = await splitSuggestTool.handler(tooLow, createMockContext());
      expect(result.isError).toBe(true);
    });
  });

  describe('code/learn-patterns', () => {
    it('should have correct tool definition', () => {
      expect(learnPatternsTool.name).toBe('code/learn-patterns');
      expect(learnPatternsTool.inputSchema.required).toContain('targetPath');
      expect(learnPatternsTool.cacheable).toBe(true);
    });

    it('should handle valid input', async () => {
      const input = {
        targetPath: 'src/',
        patternTypes: ['design_patterns', 'anti_patterns'],
      };

      const result = await learnPatternsTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.patterns).toBeDefined();
      expect(data.antiPatterns).toBeDefined();
      expect(data.analysisTime).toBeDefined();
    });

    it('should handle all pattern types', async () => {
      const types = ['design_patterns', 'anti_patterns', 'idioms', 'conventions', 'architecture'] as const;

      const input = {
        targetPath: 'src/',
        patternTypes: [...types],
      };

      const result = await learnPatternsTool.handler(input, createMockContext());
      expect(result.isError).toBeUndefined();
    });

    it('should handle language filter', async () => {
      const input = {
        targetPath: 'src/',
        language: 'typescript',
      };

      const result = await learnPatternsTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
    });

    it('should handle min confidence threshold', async () => {
      const input = {
        targetPath: 'src/',
        minConfidence: 0.8,
      };

      const result = await learnPatternsTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
    });

    it('should reject missing targetPath', async () => {
      const input = {
        patternTypes: ['design_patterns'],
      };

      const result = await learnPatternsTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
    });

    it('should reject minConfidence outside valid range', async () => {
      const input = {
        targetPath: 'src/',
        minConfidence: 1.5, // above max of 1.0
      };

      const result = await learnPatternsTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
    });
  });

  describe('Security - Secret Masking', () => {
    it('should mask secrets in search results', async () => {
      // This tests that the tool doesn't expose secrets
      const input = {
        query: 'api key configuration',
      };

      const result = await semanticSearchTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);

      // Results should not contain unmasked secrets
      for (const r of data.results) {
        expect(r.content).not.toMatch(/sk-[a-zA-Z0-9]{48}/); // OpenAI key pattern
        expect(r.content).not.toMatch(/AKIA[0-9A-Z]{16}/); // AWS key pattern
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      const input = {
        query: '', // Invalid empty query
      };

      const result = await semanticSearchTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text!);
      expect(data.error).toBe(true);
      expect(data.message).toBeDefined();
    });

    it('should include timestamp in error response', async () => {
      const input = {
        targetPath: '', // Invalid
      };

      const result = await architectureAnalyzeTool.handler(input, createMockContext());

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text!);
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Performance Logging', () => {
    it('should log duration on success', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const input = { query: 'test function' };
      await semanticSearchTool.handler(input, { logger: mockLogger });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('completed'),
        expect.objectContaining({ durationMs: expect.any(String) })
      );
    });

    it('should include analysis time in results', async () => {
      const input = {
        targetPath: 'src/',
      };

      const result = await architectureAnalyzeTool.handler(input, createMockContext());

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text!);
      expect(data.analysisTime).toBeDefined();
      expect(typeof data.analysisTime).toBe('number');
    });
  });

  describe('Output Format', () => {
    it('should support different output formats', async () => {
      const formats = ['json', 'markdown', 'summary'] as const;

      for (const outputFormat of formats) {
        const input = {
          targetPath: 'src/',
          outputFormat,
        };

        const result = await architectureAnalyzeTool.handler(input, createMockContext());
        expect(result.isError).toBeUndefined();
      }
    });
  });
});
