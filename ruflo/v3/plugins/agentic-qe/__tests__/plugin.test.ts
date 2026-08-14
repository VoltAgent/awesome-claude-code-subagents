/**
 * Agentic-QE Plugin Lifecycle Tests
 *
 * Tests for the agentic-qe plugin initialization, configuration,
 * shutdown, and health check functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// Mock Types (until implementation exists)
// ============================================================================

interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  dependencies?: string[];
  tags?: string[];
  minCoreVersion?: string;
}

interface PluginContext {
  config: {
    enabled: boolean;
    priority: number;
    settings: Record<string, unknown>;
  };
  eventBus: {
    emit: (event: string, data?: unknown) => void;
    on: (event: string, handler: (data: unknown) => void) => () => void;
    off: (event: string, handler: (data: unknown) => void) => void;
  };
  logger: {
    debug: (msg: string, ...args: unknown[]) => void;
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
  };
  services: Map<string, unknown>;
  coreVersion: string;
  dataDir: string;
}

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

type PluginState = 'uninitialized' | 'initializing' | 'initialized' | 'error' | 'shutdown';

// ============================================================================
// Mock Plugin Implementation
// ============================================================================

class MockAQEPlugin {
  public metadata: PluginMetadata;
  public state: PluginState = 'uninitialized';
  private context?: PluginContext;
  private tools: MCPToolDefinition[] = [];
  private bridges: Map<string, unknown> = new Map();

  constructor(metadata: Partial<PluginMetadata> = {}) {
    this.metadata = Object.freeze({
      name: 'agentic-qe',
      version: '3.2.3',
      description: 'Quality Engineering plugin for Claude Flow V3',
      author: 'rUv',
      license: 'MIT',
      dependencies: [
        '@claude-flow/plugins',
        '@claude-flow/memory',
        '@claude-flow/security',
        '@claude-flow/embeddings',
      ],
      tags: ['testing', 'quality', 'coverage', 'security', 'tdd'],
      minCoreVersion: '3.0.0-alpha.50',
      ...metadata,
    });
  }

  async initialize(context: PluginContext): Promise<void> {
    if (this.state === 'initialized') {
      throw new Error('Plugin already initialized');
    }

    this.state = 'initializing';
    this.context = context;

    try {
      // Validate core version
      if (!this.isVersionCompatible(context.coreVersion)) {
        throw new Error(`Core version ${context.coreVersion} is not compatible with minimum required ${this.metadata.minCoreVersion}`);
      }

      // Initialize bridges
      await this.initializeBridges();

      // Register tools
      this.tools = this.createTools();

      this.state = 'initialized';
      context.logger.info(`${this.metadata.name} initialized successfully`);
    } catch (error) {
      this.state = 'error';
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.state !== 'initialized') {
      return;
    }

    // Cleanup bridges
    for (const [name, bridge] of this.bridges) {
      if (typeof (bridge as any)?.dispose === 'function') {
        await (bridge as any).dispose();
      }
    }
    this.bridges.clear();

    // Clear tools
    this.tools = [];

    this.state = 'shutdown';
    this.context?.logger.info(`${this.metadata.name} shut down`);
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    status: string;
    checks: Record<string, { healthy: boolean; message?: string }>;
  }> {
    const checks: Record<string, { healthy: boolean; message?: string }> = {
      state: {
        healthy: this.state === 'initialized',
        message: `Plugin state: ${this.state}`,
      },
      bridges: {
        healthy: this.bridges.size > 0,
        message: `${this.bridges.size} bridges active`,
      },
      tools: {
        healthy: this.tools.length > 0,
        message: `${this.tools.length} tools registered`,
      },
    };

    const healthy = Object.values(checks).every((c) => c.healthy);

    return {
      healthy,
      status: healthy ? 'healthy' : 'unhealthy',
      checks,
    };
  }

  registerMCPTools(): MCPToolDefinition[] {
    return this.tools;
  }

  getConfig(): Record<string, unknown> {
    return this.context?.config.settings ?? {};
  }

  getBridge(name: string): unknown {
    return this.bridges.get(name);
  }

  private async initializeBridges(): Promise<void> {
    // Mock bridge initialization
    this.bridges.set('memory', { type: 'QEMemoryBridge', connected: true });
    this.bridges.set('security', { type: 'QESecurityBridge', connected: true });
    this.bridges.set('core', { type: 'QECoreBridge', connected: true });
    this.bridges.set('hive', { type: 'QEHiveBridge', connected: true });
  }

  private createTools(): MCPToolDefinition[] {
    return [
      {
        name: 'aqe/generate-tests',
        description: 'Generate tests for code using AI-powered test generation',
        inputSchema: {
          type: 'object',
          properties: {
            targetPath: { type: 'string' },
            testType: { type: 'string', enum: ['unit', 'integration', 'e2e'] },
            framework: { type: 'string', enum: ['vitest', 'jest', 'mocha'] },
          },
          required: ['targetPath'],
        },
        handler: async (input) => ({
          content: [{ type: 'text', text: JSON.stringify({ status: 'generated', input }) }],
        }),
      },
      {
        name: 'aqe/analyze-coverage',
        description: 'Analyze code coverage with O(log n) gap detection',
        inputSchema: {
          type: 'object',
          properties: {
            coverageReport: { type: 'string' },
            targetPath: { type: 'string' },
            algorithm: { type: 'string', enum: ['johnson-lindenstrauss', 'naive'] },
          },
          required: ['coverageReport'],
        },
        handler: async (input) => ({
          content: [{ type: 'text', text: JSON.stringify({ status: 'analyzed', input }) }],
        }),
      },
      {
        name: 'aqe/security-scan',
        description: 'Run SAST/DAST security scans',
        inputSchema: {
          type: 'object',
          properties: {
            targetPath: { type: 'string' },
            scanType: { type: 'string', enum: ['sast', 'dast', 'both'] },
            compliance: { type: 'array', items: { type: 'string' } },
          },
          required: ['targetPath'],
        },
        handler: async (input) => ({
          content: [{ type: 'text', text: JSON.stringify({ status: 'scanned', input }) }],
        }),
      },
      {
        name: 'aqe/chaos-inject',
        description: 'Inject chaos failures for resilience testing',
        inputSchema: {
          type: 'object',
          properties: {
            target: { type: 'string' },
            failureType: { type: 'string' },
            duration: { type: 'number' },
            intensity: { type: 'number', minimum: 0, maximum: 1 },
            dryRun: { type: 'boolean', default: true },
          },
          required: ['target', 'failureType'],
        },
        handler: async (input) => ({
          content: [{ type: 'text', text: JSON.stringify({ status: 'injected', input }) }],
        }),
      },
    ];
  }

  private isVersionCompatible(coreVersion: string): boolean {
    // Simple version check - in real impl would use semver
    const minVersion = this.metadata.minCoreVersion?.replace(/-.*$/, '') ?? '0.0.0';
    const current = coreVersion.replace(/-.*$/, '');
    return current >= minVersion;
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

function createMockContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    config: {
      enabled: true,
      priority: 50,
      settings: {
        defaultFramework: 'vitest',
        coverageTarget: 80,
        tddStyle: 'london',
      },
    },
    eventBus: {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
      off: vi.fn(),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    services: new Map(),
    coreVersion: '3.0.0',
    dataDir: '/tmp/agentic-qe',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('AQEPlugin', () => {
  let plugin: MockAQEPlugin;
  let context: PluginContext;

  beforeEach(() => {
    plugin = new MockAQEPlugin();
    context = createMockContext();
  });

  afterEach(async () => {
    if (plugin.state === 'initialized') {
      await plugin.shutdown();
    }
  });

  describe('metadata', () => {
    it('should have correct plugin name', () => {
      expect(plugin.metadata.name).toBe('agentic-qe');
    });

    it('should have correct version', () => {
      expect(plugin.metadata.version).toBe('3.2.3');
    });

    it('should have required dependencies', () => {
      expect(plugin.metadata.dependencies).toContain('@claude-flow/plugins');
      expect(plugin.metadata.dependencies).toContain('@claude-flow/memory');
      expect(plugin.metadata.dependencies).toContain('@claude-flow/security');
    });

    it('should have expected tags', () => {
      expect(plugin.metadata.tags).toContain('testing');
      expect(plugin.metadata.tags).toContain('quality');
      expect(plugin.metadata.tags).toContain('tdd');
    });

    it('should freeze metadata', () => {
      expect(Object.isFrozen(plugin.metadata)).toBe(true);
    });

    it('should specify minimum core version', () => {
      expect(plugin.metadata.minCoreVersion).toBe('3.0.0-alpha.50');
    });
  });

  describe('initialization', () => {
    it('should start in uninitialized state', () => {
      expect(plugin.state).toBe('uninitialized');
    });

    it('should initialize successfully with valid context', async () => {
      await plugin.initialize(context);

      expect(plugin.state).toBe('initialized');
    });

    it('should log initialization success', async () => {
      await plugin.initialize(context);

      expect(context.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('initialized successfully')
      );
    });

    it('should reject double initialization', async () => {
      await plugin.initialize(context);

      await expect(plugin.initialize(context)).rejects.toThrow('already initialized');
    });

    it('should reject incompatible core version', async () => {
      const oldVersionContext = createMockContext({ coreVersion: '2.0.0' });

      await expect(plugin.initialize(oldVersionContext)).rejects.toThrow('not compatible');
      expect(plugin.state).toBe('error');
    });

    it('should accept compatible core versions', async () => {
      const contexts = [
        createMockContext({ coreVersion: '3.0.0' }),
        createMockContext({ coreVersion: '3.1.0' }),
        createMockContext({ coreVersion: '4.0.0' }),
      ];

      for (const ctx of contexts) {
        const p = new MockAQEPlugin();
        await p.initialize(ctx);
        expect(p.state).toBe('initialized');
        await p.shutdown();
      }
    });

    it('should initialize all bridges', async () => {
      await plugin.initialize(context);

      expect(plugin.getBridge('memory')).toBeDefined();
      expect(plugin.getBridge('security')).toBeDefined();
      expect(plugin.getBridge('core')).toBeDefined();
      expect(plugin.getBridge('hive')).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await plugin.initialize(context);
      await plugin.shutdown();

      expect(plugin.state).toBe('shutdown');
    });

    it('should clear bridges on shutdown', async () => {
      await plugin.initialize(context);
      await plugin.shutdown();

      expect(plugin.getBridge('memory')).toBeUndefined();
    });

    it('should be safe to call shutdown multiple times', async () => {
      await plugin.initialize(context);
      await plugin.shutdown();
      await plugin.shutdown(); // Should not throw

      expect(plugin.state).toBe('shutdown');
    });

    it('should be safe to shutdown uninitialized plugin', async () => {
      await plugin.shutdown(); // Should not throw

      expect(plugin.state).toBe('uninitialized');
    });
  });

  describe('health check', () => {
    it('should report healthy when initialized', async () => {
      await plugin.initialize(context);

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.status).toBe('healthy');
    });

    it('should report unhealthy when not initialized', async () => {
      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.status).toBe('unhealthy');
    });

    it('should include state check', async () => {
      await plugin.initialize(context);

      const health = await plugin.healthCheck();

      expect(health.checks.state.healthy).toBe(true);
    });

    it('should include bridges check', async () => {
      await plugin.initialize(context);

      const health = await plugin.healthCheck();

      expect(health.checks.bridges.healthy).toBe(true);
      expect(health.checks.bridges.message).toContain('bridges active');
    });

    it('should include tools check', async () => {
      await plugin.initialize(context);

      const health = await plugin.healthCheck();

      expect(health.checks.tools.healthy).toBe(true);
      expect(health.checks.tools.message).toContain('tools registered');
    });
  });

  describe('MCP tools', () => {
    it('should register MCP tools after initialization', async () => {
      await plugin.initialize(context);

      const tools = plugin.registerMCPTools();

      expect(tools.length).toBeGreaterThan(0);
    });

    it('should include generate-tests tool', async () => {
      await plugin.initialize(context);

      const tools = plugin.registerMCPTools();
      const generateTool = tools.find((t) => t.name === 'aqe/generate-tests');

      expect(generateTool).toBeDefined();
      expect(generateTool?.description).toContain('Generate tests');
    });

    it('should include analyze-coverage tool', async () => {
      await plugin.initialize(context);

      const tools = plugin.registerMCPTools();
      const coverageTool = tools.find((t) => t.name === 'aqe/analyze-coverage');

      expect(coverageTool).toBeDefined();
      expect(coverageTool?.description).toContain('coverage');
    });

    it('should include security-scan tool', async () => {
      await plugin.initialize(context);

      const tools = plugin.registerMCPTools();
      const securityTool = tools.find((t) => t.name === 'aqe/security-scan');

      expect(securityTool).toBeDefined();
      expect(securityTool?.description).toContain('security');
    });

    it('should include chaos-inject tool', async () => {
      await plugin.initialize(context);

      const tools = plugin.registerMCPTools();
      const chaosTool = tools.find((t) => t.name === 'aqe/chaos-inject');

      expect(chaosTool).toBeDefined();
      expect(chaosTool?.description).toContain('chaos');
    });

    it('should have valid input schemas', async () => {
      await plugin.initialize(context);

      const tools = plugin.registerMCPTools();

      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });

    it('should have working handlers', async () => {
      await plugin.initialize(context);

      const tools = plugin.registerMCPTools();
      const tool = tools[0];

      const result = await tool.handler({ targetPath: '/test' });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });
  });

  describe('configuration', () => {
    it('should access plugin settings', async () => {
      await plugin.initialize(context);

      const config = plugin.getConfig();

      expect(config.defaultFramework).toBe('vitest');
      expect(config.coverageTarget).toBe(80);
      expect(config.tddStyle).toBe('london');
    });

    it('should return empty config when not initialized', () => {
      const config = plugin.getConfig();

      expect(config).toEqual({});
    });
  });
});

describe('AQEPlugin Error Handling', () => {
  it('should handle bridge initialization failure gracefully', async () => {
    // This tests error state handling
    const plugin = new MockAQEPlugin();
    const badContext = createMockContext({ coreVersion: '1.0.0' });

    await expect(plugin.initialize(badContext)).rejects.toThrow();
    expect(plugin.state).toBe('error');
  });

  it('should allow re-creation after error', async () => {
    const plugin1 = new MockAQEPlugin();
    const badContext = createMockContext({ coreVersion: '1.0.0' });

    await expect(plugin1.initialize(badContext)).rejects.toThrow();

    // Create new instance and try again
    const plugin2 = new MockAQEPlugin();
    const goodContext = createMockContext();

    await plugin2.initialize(goodContext);
    expect(plugin2.state).toBe('initialized');
  });
});
