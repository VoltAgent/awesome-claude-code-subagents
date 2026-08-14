/**
 * Gas Town Bridge MCP Tools Tests
 *
 * Tests for MCP tool definitions, parameter validation, and response formatting.
 * Uses London School TDD approach with mock-first design.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// Mock Types
// ============================================================================

interface MCPToolInput {
  [key: string]: unknown;
}

interface MCPToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      default?: unknown;
      enum?: string[];
      items?: { type: string };
    }>;
    required?: string[];
  };
  handler: (input: MCPToolInput) => Promise<MCPToolResponse>;
}

// ============================================================================
// Mock CLI Bridge
// ============================================================================

const mockBridge = {
  gt: vi.fn(),
  bd: vi.fn(),
  createBead: vi.fn(),
  getReady: vi.fn(),
  showBead: vi.fn(),
  listBeads: vi.fn(),
  sling: vi.fn(),
};

// ============================================================================
// Mock MCP Tool Implementations
// ============================================================================

function createMCPTools(bridge: typeof mockBridge): MCPToolDefinition[] {
  return [
    // gt_beads_create
    {
      name: 'gt_beads_create',
      description: 'Create a bead/issue in Beads. Beads are Git-backed work units.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Bead title (required)',
          },
          description: {
            type: 'string',
            description: 'Bead description',
          },
          priority: {
            type: 'number',
            description: 'Priority (0=highest, default=2)',
            default: 2,
          },
          labels: {
            type: 'array',
            description: 'Labels to attach',
            items: { type: 'string' },
          },
          parent: {
            type: 'string',
            description: 'Parent bead ID for epic hierarchy',
          },
        },
        required: ['title'],
      },
      handler: async (input) => {
        if (!input.title || typeof input.title !== 'string') {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Title is required' }) }],
            isError: true,
          };
        }

        try {
          const bead = await bridge.createBead({
            title: input.title as string,
            description: input.description as string | undefined,
            priority: input.priority as number | undefined,
            labels: input.labels as string[] | undefined,
            parent: input.parent as string | undefined,
          });

          return {
            content: [{ type: 'text', text: JSON.stringify(bead) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
            isError: true,
          };
        }
      },
    },

    // gt_beads_ready
    {
      name: 'gt_beads_ready',
      description: 'List ready beads (beads with no blocking dependencies)',
      inputSchema: {
        type: 'object',
        properties: {
          rig: {
            type: 'string',
            description: 'Filter by rig name',
          },
          limit: {
            type: 'number',
            description: 'Maximum beads to return',
            default: 10,
          },
          labels: {
            type: 'array',
            description: 'Filter by labels',
            items: { type: 'string' },
          },
        },
      },
      handler: async (input) => {
        try {
          const beads = await bridge.getReady(
            input.limit as number ?? 10,
            input.rig as string | undefined
          );

          return {
            content: [{ type: 'text', text: JSON.stringify(beads) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
            isError: true,
          };
        }
      },
    },

    // gt_beads_show
    {
      name: 'gt_beads_show',
      description: 'Show detailed information about a specific bead',
      inputSchema: {
        type: 'object',
        properties: {
          bead_id: {
            type: 'string',
            description: 'Bead ID to show (required)',
          },
        },
        required: ['bead_id'],
      },
      handler: async (input) => {
        if (!input.bead_id || typeof input.bead_id !== 'string') {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'bead_id is required' }) }],
            isError: true,
          };
        }

        // Validate bead ID format
        const validPattern = /^(gt-[a-z0-9]+|\d+)$/i;
        if (!validPattern.test(input.bead_id)) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid bead ID format' }) }],
            isError: true,
          };
        }

        try {
          const bead = await bridge.showBead(input.bead_id);
          return {
            content: [{ type: 'text', text: JSON.stringify(bead) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
            isError: true,
          };
        }
      },
    },

    // gt_beads_dep
    {
      name: 'gt_beads_dep',
      description: 'Manage dependencies between beads',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action to perform',
            enum: ['add', 'remove', 'list'],
          },
          child: {
            type: 'string',
            description: 'Child bead ID (blocked by parent)',
          },
          parent: {
            type: 'string',
            description: 'Parent bead ID (blocks child)',
          },
        },
        required: ['action'],
      },
      handler: async (input) => {
        const action = input.action as string;

        if (!['add', 'remove', 'list'].includes(action)) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid action' }) }],
            isError: true,
          };
        }

        if (action !== 'list' && (!input.child || !input.parent)) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'child and parent required for add/remove' }) }],
            isError: true,
          };
        }

        try {
          const result = await bridge.bd([
            'dep',
            action,
            ...(input.child ? [input.child as string] : []),
            ...(input.parent ? [input.parent as string] : []),
          ]);

          return {
            content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
            isError: true,
          };
        }
      },
    },

    // gt_convoy_create
    {
      name: 'gt_convoy_create',
      description: 'Create a convoy (work order) to track a set of issues',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Convoy name (required)',
          },
          issues: {
            type: 'array',
            description: 'Initial issues to track',
            items: { type: 'string' },
          },
          description: {
            type: 'string',
            description: 'Convoy description',
          },
        },
        required: ['name'],
      },
      handler: async (input) => {
        if (!input.name || typeof input.name !== 'string') {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'name is required' }) }],
            isError: true,
          };
        }

        try {
          const args = ['convoy', 'create', input.name as string];
          if (input.issues && Array.isArray(input.issues)) {
            args.push('--issues', (input.issues as string[]).join(','));
          }
          if (input.description) {
            args.push('--description', input.description as string);
          }

          const result = await bridge.gt(args);
          return {
            content: [{ type: 'text', text: result }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
            isError: true,
          };
        }
      },
    },

    // gt_convoy_status
    {
      name: 'gt_convoy_status',
      description: 'Check status of convoy(s)',
      inputSchema: {
        type: 'object',
        properties: {
          convoy_id: {
            type: 'string',
            description: 'Specific convoy ID (omit for all)',
          },
        },
      },
      handler: async (input) => {
        try {
          const args = ['convoy', 'status'];
          if (input.convoy_id) {
            args.push(input.convoy_id as string);
          }
          args.push('--json');

          const result = await bridge.gt(args);
          return {
            content: [{ type: 'text', text: result }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
            isError: true,
          };
        }
      },
    },

    // gt_sling
    {
      name: 'gt_sling',
      description: 'Sling (assign) work to a Gas Town agent',
      inputSchema: {
        type: 'object',
        properties: {
          bead_id: {
            type: 'string',
            description: 'Bead ID to sling',
          },
          target: {
            type: 'string',
            description: 'Target agent role',
            enum: ['polecat', 'crew', 'mayor'],
          },
          formula: {
            type: 'string',
            description: 'Formula to use for execution',
          },
        },
        required: ['bead_id', 'target'],
      },
      handler: async (input) => {
        if (!input.bead_id || !input.target) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'bead_id and target are required' }) }],
            isError: true,
          };
        }

        // Validate target
        const validTargets = ['polecat', 'crew', 'mayor'];
        if (!validTargets.includes(input.target as string)) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid target. Must be polecat, crew, or mayor' }) }],
            isError: true,
          };
        }

        try {
          await bridge.sling(
            input.bead_id as string,
            input.target as string,
            input.formula as string | undefined
          );

          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, slung: input.bead_id, to: input.target }) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
            isError: true,
          };
        }
      },
    },

    // gt_formula_list
    {
      name: 'gt_formula_list',
      description: 'List available formulas',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Filter by formula type',
            enum: ['convoy', 'workflow', 'expansion', 'aspect'],
          },
        },
      },
      handler: async (input) => {
        try {
          const args = ['formula', 'list', '--json'];
          if (input.type) {
            args.push('--type', input.type as string);
          }

          const result = await bridge.gt(args);
          return {
            content: [{ type: 'text', text: result }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
            isError: true,
          };
        }
      },
    },

    // gt_agents
    {
      name: 'gt_agents',
      description: 'List Gas Town agents',
      inputSchema: {
        type: 'object',
        properties: {
          rig: {
            type: 'string',
            description: 'Filter by rig',
          },
          role: {
            type: 'string',
            description: 'Filter by role',
            enum: ['mayor', 'polecat', 'refinery', 'witness', 'deacon', 'dog', 'crew'],
          },
        },
      },
      handler: async (input) => {
        try {
          const args = ['agents', '--json'];
          if (input.rig) {
            args.push('--rig', input.rig as string);
          }
          if (input.role) {
            args.push('--role', input.role as string);
          }

          const result = await bridge.gt(args);
          return {
            content: [{ type: 'text', text: result }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
            isError: true,
          };
        }
      },
    },
  ];
}

// ============================================================================
// Test Helpers
// ============================================================================

function createSampleBead(overrides = {}) {
  return {
    id: 'gt-abc12',
    title: 'Sample Bead',
    description: 'A sample bead',
    status: 'open',
    priority: 2,
    labels: ['test'],
    created_at: '2026-01-24T10:00:00Z',
    updated_at: '2026-01-24T10:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// Tests - Tool Definitions
// ============================================================================

describe('MCP Tool Definitions', () => {
  let tools: MCPToolDefinition[];

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createMCPTools(mockBridge);
  });

  describe('tool registration', () => {
    it('should register all beads tools', () => {
      const beadTools = tools.filter(t => t.name.startsWith('gt_beads_'));
      expect(beadTools.length).toBeGreaterThanOrEqual(3);
    });

    it('should register convoy tools', () => {
      const convoyTools = tools.filter(t => t.name.startsWith('gt_convoy_'));
      expect(convoyTools.length).toBeGreaterThanOrEqual(2);
    });

    it('should register orchestration tools', () => {
      expect(tools.find(t => t.name === 'gt_sling')).toBeDefined();
      expect(tools.find(t => t.name === 'gt_agents')).toBeDefined();
    });
  });

  describe('input schema validation', () => {
    it('should have valid input schemas', () => {
      for (const tool of tools) {
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });

    it('should mark required fields', () => {
      const createTool = tools.find(t => t.name === 'gt_beads_create');
      expect(createTool?.inputSchema.required).toContain('title');

      const slingTool = tools.find(t => t.name === 'gt_sling');
      expect(slingTool?.inputSchema.required).toContain('bead_id');
      expect(slingTool?.inputSchema.required).toContain('target');
    });

    it('should specify enum values for constrained fields', () => {
      const slingTool = tools.find(t => t.name === 'gt_sling');
      expect(slingTool?.inputSchema.properties.target.enum).toContain('polecat');
      expect(slingTool?.inputSchema.properties.target.enum).toContain('crew');
    });
  });
});

// ============================================================================
// Tests - gt_beads_create
// ============================================================================

describe('gt_beads_create', () => {
  let tool: MCPToolDefinition;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createMCPTools(mockBridge).find(t => t.name === 'gt_beads_create')!;
  });

  it('should create bead with title', async () => {
    const bead = createSampleBead({ title: 'New Task' });
    mockBridge.createBead.mockResolvedValue(bead);

    const result = await tool.handler({ title: 'New Task' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('gt-abc12');
    expect(mockBridge.createBead).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New Task' })
    );
  });

  it('should pass optional parameters', async () => {
    const bead = createSampleBead();
    mockBridge.createBead.mockResolvedValue(bead);

    await tool.handler({
      title: 'Task',
      description: 'A description',
      priority: 1,
      labels: ['urgent', 'bug'],
      parent: 'gt-parent1',
    });

    expect(mockBridge.createBead).toHaveBeenCalledWith({
      title: 'Task',
      description: 'A description',
      priority: 1,
      labels: ['urgent', 'bug'],
      parent: 'gt-parent1',
    });
  });

  it('should return error if title missing', async () => {
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Title is required');
  });

  it('should return error on bridge failure', async () => {
    mockBridge.createBead.mockRejectedValue(new Error('Connection failed'));

    const result = await tool.handler({ title: 'Task' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Connection failed');
  });
});

// ============================================================================
// Tests - gt_beads_ready
// ============================================================================

describe('gt_beads_ready', () => {
  let tool: MCPToolDefinition;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createMCPTools(mockBridge).find(t => t.name === 'gt_beads_ready')!;
  });

  it('should list ready beads', async () => {
    const beads = [createSampleBead(), createSampleBead({ id: 'gt-def34' })];
    mockBridge.getReady.mockResolvedValue(beads);

    const result = await tool.handler({});

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveLength(2);
  });

  it('should apply limit parameter', async () => {
    mockBridge.getReady.mockResolvedValue([]);

    await tool.handler({ limit: 5 });

    expect(mockBridge.getReady).toHaveBeenCalledWith(5, undefined);
  });

  it('should apply rig filter', async () => {
    mockBridge.getReady.mockResolvedValue([]);

    await tool.handler({ rig: 'town', limit: 10 });

    expect(mockBridge.getReady).toHaveBeenCalledWith(10, 'town');
  });
});

// ============================================================================
// Tests - gt_beads_show
// ============================================================================

describe('gt_beads_show', () => {
  let tool: MCPToolDefinition;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createMCPTools(mockBridge).find(t => t.name === 'gt_beads_show')!;
  });

  it('should show bead details', async () => {
    const bead = createSampleBead();
    mockBridge.showBead.mockResolvedValue(bead);

    const result = await tool.handler({ bead_id: 'gt-abc12' });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.id).toBe('gt-abc12');
  });

  it('should validate bead_id is required', async () => {
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('bead_id is required');
  });

  it('should validate bead_id format', async () => {
    const result = await tool.handler({ bead_id: 'invalid!id' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid bead ID');
  });

  it('should accept numeric bead IDs', async () => {
    mockBridge.showBead.mockResolvedValue(createSampleBead({ id: '12345' }));

    const result = await tool.handler({ bead_id: '12345' });

    expect(result.isError).toBeFalsy();
  });
});

// ============================================================================
// Tests - gt_beads_dep
// ============================================================================

describe('gt_beads_dep', () => {
  let tool: MCPToolDefinition;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createMCPTools(mockBridge).find(t => t.name === 'gt_beads_dep')!;
  });

  it('should add dependency', async () => {
    mockBridge.bd.mockResolvedValue('');

    const result = await tool.handler({
      action: 'add',
      child: 'gt-child1',
      parent: 'gt-parent1',
    });

    expect(result.isError).toBeFalsy();
    expect(mockBridge.bd).toHaveBeenCalledWith(['dep', 'add', 'gt-child1', 'gt-parent1']);
  });

  it('should remove dependency', async () => {
    mockBridge.bd.mockResolvedValue('');

    await tool.handler({
      action: 'remove',
      child: 'gt-child1',
      parent: 'gt-parent1',
    });

    expect(mockBridge.bd).toHaveBeenCalledWith(['dep', 'remove', 'gt-child1', 'gt-parent1']);
  });

  it('should require child and parent for add/remove', async () => {
    const result = await tool.handler({ action: 'add' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('child and parent required');
  });

  it('should validate action enum', async () => {
    const result = await tool.handler({ action: 'invalid' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid action');
  });
});

// ============================================================================
// Tests - gt_sling
// ============================================================================

describe('gt_sling', () => {
  let tool: MCPToolDefinition;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createMCPTools(mockBridge).find(t => t.name === 'gt_sling')!;
  });

  it('should sling bead to target', async () => {
    mockBridge.sling.mockResolvedValue(undefined);

    const result = await tool.handler({
      bead_id: 'gt-abc12',
      target: 'polecat',
    });

    expect(result.isError).toBeFalsy();
    expect(mockBridge.sling).toHaveBeenCalledWith('gt-abc12', 'polecat', undefined);

    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.success).toBe(true);
    expect(parsed.slung).toBe('gt-abc12');
  });

  it('should pass formula when provided', async () => {
    mockBridge.sling.mockResolvedValue(undefined);

    await tool.handler({
      bead_id: 'gt-abc12',
      target: 'crew',
      formula: 'feature-workflow',
    });

    expect(mockBridge.sling).toHaveBeenCalledWith('gt-abc12', 'crew', 'feature-workflow');
  });

  it('should validate required parameters', async () => {
    const result = await tool.handler({ bead_id: 'gt-abc12' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('required');
  });

  it('should validate target enum', async () => {
    const result = await tool.handler({
      bead_id: 'gt-abc12',
      target: 'invalid-target',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid target');
  });
});

// ============================================================================
// Tests - gt_convoy_create
// ============================================================================

describe('gt_convoy_create', () => {
  let tool: MCPToolDefinition;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createMCPTools(mockBridge).find(t => t.name === 'gt_convoy_create')!;
  });

  it('should create convoy with name', async () => {
    mockBridge.gt.mockResolvedValue(JSON.stringify({ id: 'conv-123', name: 'My Convoy' }));

    const result = await tool.handler({ name: 'My Convoy' });

    expect(result.isError).toBeFalsy();
    expect(mockBridge.gt).toHaveBeenCalledWith(['convoy', 'create', 'My Convoy']);
  });

  it('should include issues list', async () => {
    mockBridge.gt.mockResolvedValue('{}');

    await tool.handler({
      name: 'My Convoy',
      issues: ['gt-1', 'gt-2', 'gt-3'],
    });

    expect(mockBridge.gt).toHaveBeenCalledWith(
      expect.arrayContaining(['--issues', 'gt-1,gt-2,gt-3'])
    );
  });

  it('should require name', async () => {
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('name is required');
  });
});

// ============================================================================
// Tests - Response Format
// ============================================================================

describe('Response Format', () => {
  let tools: MCPToolDefinition[];

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createMCPTools(mockBridge);
  });

  it('should return content array with text type', async () => {
    mockBridge.getReady.mockResolvedValue([]);

    const tool = tools.find(t => t.name === 'gt_beads_ready')!;
    const result = await tool.handler({});

    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
  });

  it('should return valid JSON in text content', async () => {
    const bead = createSampleBead();
    mockBridge.createBead.mockResolvedValue(bead);

    const tool = tools.find(t => t.name === 'gt_beads_create')!;
    const result = await tool.handler({ title: 'Test' });

    expect(() => JSON.parse(result.content[0].text!)).not.toThrow();
  });

  it('should set isError flag on errors', async () => {
    const tool = tools.find(t => t.name === 'gt_beads_create')!;
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
  });

  it('should include error message in content on failure', async () => {
    mockBridge.createBead.mockRejectedValue(new Error('Database error'));

    const tool = tools.find(t => t.name === 'gt_beads_create')!;
    const result = await tool.handler({ title: 'Test' });

    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.error).toBe('Database error');
  });
});

// ============================================================================
// Tests - CLI Integration Mocking
// ============================================================================

describe('CLI Integration Mocking', () => {
  let tools: MCPToolDefinition[];

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createMCPTools(mockBridge);
  });

  it('should handle gt command responses', async () => {
    const agentList = JSON.stringify([
      { id: 'mayor-1', role: 'mayor', status: 'active' },
      { id: 'polecat-1', role: 'polecat', status: 'idle' },
    ]);
    mockBridge.gt.mockResolvedValue(agentList);

    const tool = tools.find(t => t.name === 'gt_agents')!;
    const result = await tool.handler({});

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveLength(2);
  });

  it('should handle formula list response', async () => {
    const formulas = JSON.stringify([
      { name: 'feature-workflow', type: 'workflow' },
      { name: 'bug-fix', type: 'convoy' },
    ]);
    mockBridge.gt.mockResolvedValue(formulas);

    const tool = tools.find(t => t.name === 'gt_formula_list')!;
    const result = await tool.handler({});

    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveLength(2);
  });
});
