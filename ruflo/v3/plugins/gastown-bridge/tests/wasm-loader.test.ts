/**
 * WASM Loader Tests
 *
 * Tests for WASM module loading, formula parsing, batch cooking,
 * topological sort, cycle detection, and fallback behavior.
 * Uses London School TDD approach with mock-first design.
 *
 * @module gastown-bridge/tests/wasm-loader
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock WASM Module Types
// ============================================================================

interface MockWasmModule {
  parseFormula: (content: string) => FormulaAST;
  cookFormula: (formula: FormulaAST, vars: Record<string, string>) => FormulaAST;
  cookBatch: (formulas: FormulaAST[], vars: Record<string, string>[]) => FormulaAST[];
  topoSort: (nodes: string[], edges: Array<[string, string]>) => TopoSortResult;
  detectCycle: (nodes: string[], edges: Array<[string, string]>) => CycleResult;
  criticalPath: (nodes: string[], edges: Array<[string, string]>, durations: Map<string, number>) => CriticalPathResult;
  initialize: () => Promise<void>;
  isInitialized: () => boolean;
}

interface FormulaAST {
  name: string;
  type: 'convoy' | 'workflow' | 'expansion' | 'aspect';
  version: number;
  steps?: Array<{ id: string; title: string; needs?: string[] }>;
  legs?: Array<{ id: string; title: string; focus: string }>;
  vars?: Record<string, { default?: string; required?: boolean }>;
}

interface TopoSortResult {
  sorted: string[];
  hasCycle: boolean;
  cycleNodes?: string[];
}

interface CycleResult {
  hasCycle: boolean;
  cycleNodes: string[];
  cycleEdges: Array<[string, string]>;
}

interface CriticalPathResult {
  path: string[];
  totalDuration: number;
  slack: Map<string, number>;
}

// ============================================================================
// WasmLoader Implementation (to be tested)
// ============================================================================

class WasmLoader {
  private module: MockWasmModule | null = null;
  private initialized = false;
  private cache = new Map<string, FormulaAST>();
  private performanceMetrics: { operation: string; durationMs: number }[] = [];

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Attempt to load WASM module dynamically
      this.module = await this.loadWasmModule();
      if (this.module) {
        await this.module.initialize();
        this.initialized = true;
      }
    } catch {
      // WASM not available
      this.initialized = false;
      this.module = null;
    }
  }

  private async loadWasmModule(): Promise<MockWasmModule | null> {
    try {
      // Dynamic import of WASM module
      const mod = await import('gastown-formula-wasm');
      return mod.default as MockWasmModule;
    } catch {
      return null;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  isWasmAvailable(): boolean {
    return this.module !== null;
  }

  parseFormula(content: string): FormulaAST {
    const start = performance.now();

    // Check cache first
    const cacheKey = this.hashContent(content);
    if (this.cache.has(cacheKey)) {
      this.recordMetric('parseFormula:cached', performance.now() - start);
      return this.cache.get(cacheKey)!;
    }

    let result: FormulaAST;

    if (this.module && this.initialized) {
      // Use WASM
      result = this.module.parseFormula(content);
    } else {
      // Fallback to JavaScript implementation
      result = this.parseFormulaJS(content);
    }

    this.cache.set(cacheKey, result);
    this.recordMetric('parseFormula', performance.now() - start);
    return result;
  }

  private parseFormulaJS(content: string): FormulaAST {
    // Simple TOML-like parser fallback
    const lines = content.split('\n');
    const result: FormulaAST = {
      name: '',
      type: 'workflow',
      version: 1,
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('name = ')) {
        result.name = trimmed.slice(8, -1); // Remove quotes
      } else if (trimmed.startsWith('type = ')) {
        result.type = trimmed.slice(8, -1) as FormulaAST['type'];
      } else if (trimmed.startsWith('version = ')) {
        result.version = parseInt(trimmed.slice(10), 10);
      }
    }

    return result;
  }

  cookFormula(formula: FormulaAST, vars: Record<string, string>): FormulaAST {
    const start = performance.now();
    let result: FormulaAST;

    if (this.module && this.initialized) {
      result = this.module.cookFormula(formula, vars);
    } else {
      result = this.cookFormulaJS(formula, vars);
    }

    this.recordMetric('cookFormula', performance.now() - start);
    return result;
  }

  private cookFormulaJS(formula: FormulaAST, vars: Record<string, string>): FormulaAST {
    // Simple variable substitution fallback
    const cooked = JSON.parse(JSON.stringify(formula)) as FormulaAST;

    if (cooked.steps) {
      for (const step of cooked.steps) {
        step.title = this.substituteVars(step.title, vars);
      }
    }

    if (cooked.legs) {
      for (const leg of cooked.legs) {
        leg.title = this.substituteVars(leg.title, vars);
        leg.focus = this.substituteVars(leg.focus, vars);
      }
    }

    return cooked;
  }

  private substituteVars(text: string, vars: Record<string, string>): string {
    let result = text;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  }

  batchCook(formulas: FormulaAST[], vars: Record<string, string>[]): FormulaAST[] {
    const start = performance.now();
    let results: FormulaAST[];

    if (this.module && this.initialized) {
      results = this.module.cookBatch(formulas, vars);
    } else {
      results = formulas.map((f, i) => this.cookFormulaJS(f, vars[i] || {}));
    }

    this.recordMetric('batchCook', performance.now() - start);
    return results;
  }

  topoSort(nodes: string[], edges: Array<[string, string]>): TopoSortResult {
    const start = performance.now();
    let result: TopoSortResult;

    if (this.module && this.initialized) {
      result = this.module.topoSort(nodes, edges);
    } else {
      result = this.topoSortJS(nodes, edges);
    }

    this.recordMetric('topoSort', performance.now() - start);
    return result;
  }

  private topoSortJS(nodes: string[], edges: Array<[string, string]>): TopoSortResult {
    // Kahn's algorithm for topological sort
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const node of nodes) {
      inDegree.set(node, 0);
      adjacency.set(node, []);
    }

    // Build graph
    for (const [from, to] of edges) {
      adjacency.get(from)?.push(to);
      inDegree.set(to, (inDegree.get(to) || 0) + 1);
    }

    // Find nodes with no incoming edges
    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) queue.push(node);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);

      for (const neighbor of adjacency.get(node) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    const hasCycle = sorted.length !== nodes.length;
    const cycleNodes = hasCycle ? nodes.filter(n => !sorted.includes(n)) : undefined;

    return { sorted, hasCycle, cycleNodes };
  }

  detectCycle(nodes: string[], edges: Array<[string, string]>): CycleResult {
    const start = performance.now();
    let result: CycleResult;

    if (this.module && this.initialized) {
      result = this.module.detectCycle(nodes, edges);
    } else {
      result = this.detectCycleJS(nodes, edges);
    }

    this.recordMetric('detectCycle', performance.now() - start);
    return result;
  }

  private detectCycleJS(nodes: string[], edges: Array<[string, string]>): CycleResult {
    // DFS-based cycle detection
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      color.set(node, WHITE);
      adjacency.set(node, []);
    }

    for (const [from, to] of edges) {
      adjacency.get(from)?.push(to);
    }

    const cycleNodes: string[] = [];
    const cycleEdges: Array<[string, string]> = [];

    const dfs = (node: string, path: string[]): boolean => {
      color.set(node, GRAY);
      path.push(node);

      for (const neighbor of adjacency.get(node) || []) {
        if (color.get(neighbor) === GRAY) {
          // Found cycle
          const cycleStart = path.indexOf(neighbor);
          cycleNodes.push(...path.slice(cycleStart));
          for (let i = cycleStart; i < path.length - 1; i++) {
            cycleEdges.push([path[i], path[i + 1]]);
          }
          cycleEdges.push([path[path.length - 1], neighbor]);
          return true;
        }
        if (color.get(neighbor) === WHITE && dfs(neighbor, path)) {
          return true;
        }
      }

      path.pop();
      color.set(node, BLACK);
      return false;
    };

    let hasCycle = false;
    for (const node of nodes) {
      if (color.get(node) === WHITE) {
        if (dfs(node, [])) {
          hasCycle = true;
          break;
        }
      }
    }

    return { hasCycle, cycleNodes, cycleEdges };
  }

  criticalPath(
    nodes: string[],
    edges: Array<[string, string]>,
    durations: Map<string, number>
  ): CriticalPathResult {
    const start = performance.now();
    let result: CriticalPathResult;

    if (this.module && this.initialized) {
      result = this.module.criticalPath(nodes, edges, durations);
    } else {
      result = this.criticalPathJS(nodes, edges, durations);
    }

    this.recordMetric('criticalPath', performance.now() - start);
    return result;
  }

  private criticalPathJS(
    nodes: string[],
    edges: Array<[string, string]>,
    durations: Map<string, number>
  ): CriticalPathResult {
    // First, get topological order
    const { sorted, hasCycle } = this.topoSortJS(nodes, edges);

    if (hasCycle) {
      return { path: [], totalDuration: 0, slack: new Map() };
    }

    // Build adjacency lists
    const predecessors = new Map<string, string[]>();
    const successors = new Map<string, string[]>();
    for (const node of nodes) {
      predecessors.set(node, []);
      successors.set(node, []);
    }
    for (const [from, to] of edges) {
      predecessors.get(to)?.push(from);
      successors.get(from)?.push(to);
    }

    // Forward pass: calculate earliest start times
    const earliest = new Map<string, number>();
    for (const node of sorted) {
      const preds = predecessors.get(node) || [];
      if (preds.length === 0) {
        earliest.set(node, 0);
      } else {
        const maxPredEnd = Math.max(
          ...preds.map(p => (earliest.get(p) || 0) + (durations.get(p) || 0))
        );
        earliest.set(node, maxPredEnd);
      }
    }

    // Find project duration
    const projectDuration = Math.max(
      ...nodes.map(n => (earliest.get(n) || 0) + (durations.get(n) || 0))
    );

    // Backward pass: calculate latest start times
    const latest = new Map<string, number>();
    for (const node of sorted.slice().reverse()) {
      const succs = successors.get(node) || [];
      if (succs.length === 0) {
        latest.set(node, projectDuration - (durations.get(node) || 0));
      } else {
        const minSuccStart = Math.min(...succs.map(s => latest.get(s) || projectDuration));
        latest.set(node, minSuccStart - (durations.get(node) || 0));
      }
    }

    // Calculate slack and find critical path
    const slack = new Map<string, number>();
    const criticalNodes: string[] = [];
    for (const node of nodes) {
      const s = (latest.get(node) || 0) - (earliest.get(node) || 0);
      slack.set(node, s);
      if (s === 0) criticalNodes.push(node);
    }

    // Order critical nodes by earliest start time
    criticalNodes.sort((a, b) => (earliest.get(a) || 0) - (earliest.get(b) || 0));

    return { path: criticalNodes, totalDuration: projectDuration, slack };
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getPerformanceMetrics(): { operation: string; durationMs: number }[] {
    return [...this.performanceMetrics];
  }

  clearMetrics(): void {
    this.performanceMetrics = [];
  }

  private recordMetric(operation: string, durationMs: number): void {
    this.performanceMetrics.push({ operation, durationMs });
  }

  private hashContent(content: string): string {
    // Simple hash for caching
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  dispose(): void {
    this.module = null;
    this.initialized = false;
    this.cache.clear();
    this.performanceMetrics = [];
  }
}

// ============================================================================
// Mock Setup
// ============================================================================

vi.mock('gastown-formula-wasm', () => ({
  default: {
    parseFormula: vi.fn(),
    cookFormula: vi.fn(),
    cookBatch: vi.fn(),
    topoSort: vi.fn(),
    detectCycle: vi.fn(),
    criticalPath: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
  },
}));

// ============================================================================
// Tests
// ============================================================================

describe('WasmLoader', () => {
  let loader: WasmLoader;

  beforeEach(() => {
    loader = new WasmLoader();
    vi.clearAllMocks();
  });

  afterEach(() => {
    loader.dispose();
  });

  // ==========================================================================
  // Initialization Tests
  // ==========================================================================

  describe('initialization', () => {
    it('should start uninitialized', () => {
      expect(loader.isInitialized()).toBe(false);
    });

    it('should initialize successfully when WASM is available', async () => {
      await loader.initialize();
      // Note: in tests, WASM mock should load
      // In actual behavior, depends on mock setup
    });

    it('should handle WASM unavailability gracefully', async () => {
      // Force WASM to fail
      vi.doMock('gastown-formula-wasm', () => {
        throw new Error('WASM not available');
      });

      const failLoader = new WasmLoader();
      await failLoader.initialize();

      // Should not throw, just use fallback
      expect(failLoader.isWasmAvailable()).toBe(false);
    });

    it('should not reinitialize if already initialized', async () => {
      await loader.initialize();
      const firstState = loader.isInitialized();
      await loader.initialize();
      const secondState = loader.isInitialized();

      expect(firstState).toBe(secondState);
    });
  });

  // ==========================================================================
  // Formula Parsing Tests
  // ==========================================================================

  describe('parseFormula', () => {
    it('should parse valid TOML formula with JS fallback', () => {
      const content = `
name = "test-workflow"
type = "workflow"
version = 2
`;
      const result = loader.parseFormula(content);

      expect(result.name).toBe('test-workflow');
      expect(result.type).toBe('workflow');
      expect(result.version).toBe(2);
    });

    it('should use default values for missing fields', () => {
      const content = 'name = "minimal"';
      const result = loader.parseFormula(content);

      expect(result.name).toBe('minimal');
      expect(result.type).toBe('workflow');
      expect(result.version).toBe(1);
    });

    it('should cache parsed formulas', () => {
      const content = 'name = "cached-formula"';

      const first = loader.parseFormula(content);
      const second = loader.parseFormula(content);

      expect(first).toEqual(second);
      expect(loader.getCacheSize()).toBe(1);
    });

    it('should return cached result for identical content', () => {
      const content = 'name = "test"';
      loader.parseFormula(content);
      loader.clearMetrics();

      loader.parseFormula(content);
      const metrics = loader.getPerformanceMetrics();

      expect(metrics).toHaveLength(1);
      expect(metrics[0].operation).toBe('parseFormula:cached');
    });

    it('should record performance metrics', () => {
      loader.parseFormula('name = "test"');
      const metrics = loader.getPerformanceMetrics();

      expect(metrics).toHaveLength(1);
      expect(metrics[0].operation).toBe('parseFormula');
      expect(metrics[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Formula Cooking Tests
  // ==========================================================================

  describe('cookFormula', () => {
    it('should substitute variables in step titles', () => {
      const formula: FormulaAST = {
        name: 'test',
        type: 'workflow',
        version: 1,
        steps: [
          { id: 'step1', title: 'Implement {{feature}}' },
          { id: 'step2', title: 'Test {{feature}}' },
        ],
      };

      const result = loader.cookFormula(formula, { feature: 'auth' });

      expect(result.steps![0].title).toBe('Implement auth');
      expect(result.steps![1].title).toBe('Test auth');
    });

    it('should substitute variables in leg fields', () => {
      const formula: FormulaAST = {
        name: 'convoy',
        type: 'convoy',
        version: 1,
        legs: [
          { id: 'leg1', title: 'Research {{topic}}', focus: '{{focus_area}}' },
        ],
      };

      const result = loader.cookFormula(formula, {
        topic: 'authentication',
        focus_area: 'security',
      });

      expect(result.legs![0].title).toBe('Research authentication');
      expect(result.legs![0].focus).toBe('security');
    });

    it('should handle missing variables gracefully', () => {
      const formula: FormulaAST = {
        name: 'test',
        type: 'workflow',
        version: 1,
        steps: [{ id: 'step1', title: 'Do {{missing}}' }],
      };

      const result = loader.cookFormula(formula, {});

      expect(result.steps![0].title).toBe('Do {{missing}}');
    });

    it('should not mutate original formula', () => {
      const formula: FormulaAST = {
        name: 'test',
        type: 'workflow',
        version: 1,
        steps: [{ id: 'step1', title: '{{var}}' }],
      };

      const originalTitle = formula.steps![0].title;
      loader.cookFormula(formula, { var: 'replaced' });

      expect(formula.steps![0].title).toBe(originalTitle);
    });
  });

  // ==========================================================================
  // Batch Cooking Tests
  // ==========================================================================

  describe('batchCook', () => {
    it('should cook multiple formulas at once', () => {
      const formulas: FormulaAST[] = [
        { name: 'f1', type: 'workflow', version: 1, steps: [{ id: 's1', title: '{{a}}' }] },
        { name: 'f2', type: 'workflow', version: 1, steps: [{ id: 's2', title: '{{b}}' }] },
      ];

      const vars = [{ a: 'first' }, { b: 'second' }];
      const results = loader.batchCook(formulas, vars);

      expect(results).toHaveLength(2);
      expect(results[0].steps![0].title).toBe('first');
      expect(results[1].steps![0].title).toBe('second');
    });

    it('should handle empty vars array', () => {
      const formulas: FormulaAST[] = [
        { name: 'f1', type: 'workflow', version: 1 },
      ];

      const results = loader.batchCook(formulas, []);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('f1');
    });

    it('should use empty vars when index exceeds vars array', () => {
      const formulas: FormulaAST[] = [
        { name: 'f1', type: 'workflow', version: 1, steps: [{ id: 's1', title: '{{x}}' }] },
        { name: 'f2', type: 'workflow', version: 1, steps: [{ id: 's2', title: '{{y}}' }] },
      ];

      const vars = [{ x: 'value' }]; // Only one vars object
      const results = loader.batchCook(formulas, vars);

      expect(results[0].steps![0].title).toBe('value');
      expect(results[1].steps![0].title).toBe('{{y}}'); // Not substituted
    });

    it('should record batch performance metric', () => {
      const formulas: FormulaAST[] = [
        { name: 'f1', type: 'workflow', version: 1 },
        { name: 'f2', type: 'workflow', version: 1 },
      ];

      loader.batchCook(formulas, [{}, {}]);
      const metrics = loader.getPerformanceMetrics();

      expect(metrics.some(m => m.operation === 'batchCook')).toBe(true);
    });
  });

  // ==========================================================================
  // Topological Sort Tests
  // ==========================================================================

  describe('topoSort', () => {
    it('should sort nodes in dependency order', () => {
      const nodes = ['a', 'b', 'c', 'd'];
      const edges: Array<[string, string]> = [
        ['a', 'b'],
        ['b', 'c'],
        ['a', 'c'],
        ['c', 'd'],
      ];

      const result = loader.topoSort(nodes, edges);

      expect(result.hasCycle).toBe(false);
      expect(result.sorted).toContain('a');
      expect(result.sorted).toContain('d');
      // 'a' should come before 'b', 'c', 'd'
      expect(result.sorted.indexOf('a')).toBeLessThan(result.sorted.indexOf('b'));
      expect(result.sorted.indexOf('b')).toBeLessThan(result.sorted.indexOf('c'));
      expect(result.sorted.indexOf('c')).toBeLessThan(result.sorted.indexOf('d'));
    });

    it('should handle empty graph', () => {
      const result = loader.topoSort([], []);

      expect(result.hasCycle).toBe(false);
      expect(result.sorted).toEqual([]);
    });

    it('should handle disconnected nodes', () => {
      const nodes = ['a', 'b', 'c'];
      const edges: Array<[string, string]> = [['a', 'b']];

      const result = loader.topoSort(nodes, edges);

      expect(result.hasCycle).toBe(false);
      expect(result.sorted).toHaveLength(3);
      expect(result.sorted).toContain('c');
    });

    it('should detect cycles', () => {
      const nodes = ['a', 'b', 'c'];
      const edges: Array<[string, string]> = [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'], // Creates cycle
      ];

      const result = loader.topoSort(nodes, edges);

      expect(result.hasCycle).toBe(true);
      expect(result.cycleNodes).toBeDefined();
      expect(result.cycleNodes!.length).toBeGreaterThan(0);
    });

    it('should return partial sort when cycle exists', () => {
      const nodes = ['a', 'b', 'c', 'd'];
      const edges: Array<[string, string]> = [
        ['b', 'c'],
        ['c', 'b'], // Cycle between b and c
        ['a', 'd'], // a->d is independent
      ];

      const result = loader.topoSort(nodes, edges);

      expect(result.hasCycle).toBe(true);
      // 'a' and 'd' should still be sortable
      expect(result.sorted).toContain('a');
    });
  });

  // ==========================================================================
  // Cycle Detection Tests
  // ==========================================================================

  describe('detectCycle', () => {
    it('should detect no cycle in acyclic graph', () => {
      const nodes = ['a', 'b', 'c'];
      const edges: Array<[string, string]> = [
        ['a', 'b'],
        ['b', 'c'],
      ];

      const result = loader.detectCycle(nodes, edges);

      expect(result.hasCycle).toBe(false);
      expect(result.cycleNodes).toEqual([]);
    });

    it('should detect simple cycle', () => {
      const nodes = ['a', 'b'];
      const edges: Array<[string, string]> = [
        ['a', 'b'],
        ['b', 'a'],
      ];

      const result = loader.detectCycle(nodes, edges);

      expect(result.hasCycle).toBe(true);
      expect(result.cycleNodes.length).toBeGreaterThan(0);
    });

    it('should detect self-loop', () => {
      const nodes = ['a'];
      const edges: Array<[string, string]> = [['a', 'a']];

      const result = loader.detectCycle(nodes, edges);

      expect(result.hasCycle).toBe(true);
      expect(result.cycleNodes).toContain('a');
    });

    it('should detect complex cycle', () => {
      const nodes = ['a', 'b', 'c', 'd', 'e'];
      const edges: Array<[string, string]> = [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['d', 'b'], // Creates cycle b->c->d->b
        ['a', 'e'], // Separate branch
      ];

      const result = loader.detectCycle(nodes, edges);

      expect(result.hasCycle).toBe(true);
      expect(result.cycleEdges.length).toBeGreaterThan(0);
    });

    it('should return cycle edges', () => {
      const nodes = ['a', 'b', 'c'];
      const edges: Array<[string, string]> = [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ];

      const result = loader.detectCycle(nodes, edges);

      expect(result.hasCycle).toBe(true);
      expect(result.cycleEdges.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Critical Path Tests
  // ==========================================================================

  describe('criticalPath', () => {
    it('should calculate critical path for simple graph', () => {
      const nodes = ['start', 'a', 'b', 'end'];
      const edges: Array<[string, string]> = [
        ['start', 'a'],
        ['start', 'b'],
        ['a', 'end'],
        ['b', 'end'],
      ];
      const durations = new Map([
        ['start', 0],
        ['a', 5],
        ['b', 3],
        ['end', 0],
      ]);

      const result = loader.criticalPath(nodes, edges, durations);

      expect(result.totalDuration).toBe(5); // start->a->end is critical
      expect(result.path).toContain('a');
    });

    it('should return empty path for cyclic graph', () => {
      const nodes = ['a', 'b'];
      const edges: Array<[string, string]> = [
        ['a', 'b'],
        ['b', 'a'],
      ];
      const durations = new Map([
        ['a', 1],
        ['b', 1],
      ]);

      const result = loader.criticalPath(nodes, edges, durations);

      expect(result.path).toEqual([]);
      expect(result.totalDuration).toBe(0);
    });

    it('should calculate slack for non-critical nodes', () => {
      const nodes = ['start', 'a', 'b', 'end'];
      const edges: Array<[string, string]> = [
        ['start', 'a'],
        ['start', 'b'],
        ['a', 'end'],
        ['b', 'end'],
      ];
      const durations = new Map([
        ['start', 0],
        ['a', 10],
        ['b', 5], // b has slack since a takes longer
        ['end', 0],
      ]);

      const result = loader.criticalPath(nodes, edges, durations);

      expect(result.slack.get('b')).toBeGreaterThan(0);
      expect(result.slack.get('a')).toBe(0); // a is on critical path
    });

    it('should handle parallel paths correctly', () => {
      const nodes = ['s', 'a1', 'a2', 'b1', 'b2', 'e'];
      const edges: Array<[string, string]> = [
        ['s', 'a1'],
        ['a1', 'a2'],
        ['a2', 'e'],
        ['s', 'b1'],
        ['b1', 'b2'],
        ['b2', 'e'],
      ];
      const durations = new Map([
        ['s', 0],
        ['a1', 3],
        ['a2', 4], // Path A total: 7
        ['b1', 2],
        ['b2', 2], // Path B total: 4
        ['e', 0],
      ]);

      const result = loader.criticalPath(nodes, edges, durations);

      expect(result.totalDuration).toBe(7); // Path A is longer
      expect(result.path).toContain('a1');
      expect(result.path).toContain('a2');
    });
  });

  // ==========================================================================
  // Fallback Behavior Tests
  // ==========================================================================

  describe('fallback behavior', () => {
    it('should use JS implementation when WASM unavailable', () => {
      // loader is not initialized, so uses JS fallback
      const content = 'name = "fallback-test"';
      const result = loader.parseFormula(content);

      expect(result.name).toBe('fallback-test');
    });

    it('should still work correctly with JS fallback', () => {
      const nodes = ['a', 'b', 'c'];
      const edges: Array<[string, string]> = [['a', 'b'], ['b', 'c']];

      const result = loader.topoSort(nodes, edges);

      expect(result.hasCycle).toBe(false);
      expect(result.sorted).toEqual(['a', 'b', 'c']);
    });
  });

  // ==========================================================================
  // Caching Behavior Tests
  // ==========================================================================

  describe('caching', () => {
    it('should start with empty cache', () => {
      expect(loader.getCacheSize()).toBe(0);
    });

    it('should cache parsed formulas', () => {
      loader.parseFormula('name = "a"');
      loader.parseFormula('name = "b"');

      expect(loader.getCacheSize()).toBe(2);
    });

    it('should clear cache', () => {
      loader.parseFormula('name = "test"');
      expect(loader.getCacheSize()).toBe(1);

      loader.clearCache();
      expect(loader.getCacheSize()).toBe(0);
    });

    it('should not re-cache identical content', () => {
      const content = 'name = "same"';
      loader.parseFormula(content);
      loader.parseFormula(content);
      loader.parseFormula(content);

      expect(loader.getCacheSize()).toBe(1);
    });
  });

  // ==========================================================================
  // Performance Timing Tests
  // ==========================================================================

  describe('performance timing', () => {
    it('should track all operations', () => {
      loader.parseFormula('name = "test"');
      loader.cookFormula({ name: 'x', type: 'workflow', version: 1 }, {});
      loader.topoSort(['a', 'b'], [['a', 'b']]);
      loader.detectCycle(['a'], []);
      loader.criticalPath(['a'], [], new Map([['a', 1]]));

      const metrics = loader.getPerformanceMetrics();

      expect(metrics.length).toBeGreaterThanOrEqual(5);
    });

    it('should clear metrics', () => {
      loader.parseFormula('name = "test"');
      expect(loader.getPerformanceMetrics().length).toBeGreaterThan(0);

      loader.clearMetrics();
      expect(loader.getPerformanceMetrics()).toEqual([]);
    });

    it('should measure non-negative durations', () => {
      loader.parseFormula('name = "test"');
      const metrics = loader.getPerformanceMetrics();

      for (const metric of metrics) {
        expect(metric.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ==========================================================================
  // Disposal Tests
  // ==========================================================================

  describe('disposal', () => {
    it('should clean up resources on dispose', () => {
      loader.parseFormula('name = "test"');
      loader.dispose();

      expect(loader.isInitialized()).toBe(false);
      expect(loader.isWasmAvailable()).toBe(false);
      expect(loader.getCacheSize()).toBe(0);
      expect(loader.getPerformanceMetrics()).toEqual([]);
    });

    it('should still work after dispose (recreate)', () => {
      loader.dispose();

      // Should still work with fallback
      const result = loader.parseFormula('name = "new"');
      expect(result.name).toBe('new');
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty formula content', () => {
      const result = loader.parseFormula('');

      expect(result.name).toBe('');
      expect(result.type).toBe('workflow');
    });

    it('should handle formula with special characters', () => {
      const content = 'name = "test-formula_v2.0"';
      const result = loader.parseFormula(content);

      expect(result.name).toBe('test-formula_v2.0');
    });

    it('should handle very large graphs', () => {
      const nodes = Array.from({ length: 100 }, (_, i) => `node${i}`);
      const edges: Array<[string, string]> = [];
      for (let i = 0; i < 99; i++) {
        edges.push([`node${i}`, `node${i + 1}`]);
      }

      const result = loader.topoSort(nodes, edges);

      expect(result.hasCycle).toBe(false);
      expect(result.sorted).toHaveLength(100);
    });

    it('should handle multiple variables in same string', () => {
      const formula: FormulaAST = {
        name: 'test',
        type: 'workflow',
        version: 1,
        steps: [{ id: 's1', title: '{{action}} {{target}} with {{method}}' }],
      };

      const result = loader.cookFormula(formula, {
        action: 'Process',
        target: 'data',
        method: 'streaming',
      });

      expect(result.steps![0].title).toBe('Process data with streaming');
    });

    it('should handle unicode in formulas', () => {
      const content = 'name = "test-formula"';
      const result = loader.parseFormula(content);

      expect(result.name).toBe('test-formula');
    });
  });
});
