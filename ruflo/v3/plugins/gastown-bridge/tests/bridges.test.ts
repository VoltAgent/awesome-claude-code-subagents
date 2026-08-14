/**
 * Gas Town Bridge CLI Tests
 *
 * Tests for the CLI bridges that wrap `gt` and `bd` commands.
 * Uses London School TDD approach with mock-first design.
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';

// ============================================================================
// Mock child_process
// ============================================================================

interface ExecResult {
  stdout: string;
  stderr: string;
}

type ExecCallback = (error: Error | null, result: ExecResult) => void;

const mockExec = vi.fn<[string, Record<string, unknown>, ExecCallback], void>();

vi.mock('child_process', () => ({
  exec: mockExec,
}));

// ============================================================================
// Mock Types
// ============================================================================

interface Bead {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'closed';
  priority: number;
  labels: string[];
  parent_id?: string;
  created_at: string;
  updated_at: string;
  assignee?: string;
  rig?: string;
}

interface CreateBeadOptions {
  title: string;
  description?: string;
  priority?: number;
  labels?: string[];
  parent?: string;
}

interface GasTownBridgeConfig {
  townRoot: string;
  timeout?: number;
  sanitize?: boolean;
}

// ============================================================================
// Mock Implementation - GasTownBridge
// ============================================================================

class GasTownBridge {
  private townRoot: string;
  private timeout: number;
  private sanitize: boolean;

  constructor(config: GasTownBridgeConfig) {
    this.townRoot = config.townRoot;
    this.timeout = config.timeout ?? 30000;
    this.sanitize = config.sanitize ?? true;
  }

  /**
   * Sanitize input to prevent command injection
   */
  private sanitizeInput(input: string): string {
    if (!this.sanitize) return input;

    // Block dangerous characters and patterns
    const dangerousPatterns = [
      /[;&|`$(){}[\]<>]/g,  // Shell metacharacters
      /\.\.\//g,            // Path traversal
      /\n|\r/g,             // Newlines
      /\\x[0-9a-fA-F]{2}/g, // Hex escape sequences
    ];

    let sanitized = input;
    for (const pattern of dangerousPatterns) {
      if (pattern.test(input)) {
        throw new Error(`Invalid input: contains dangerous characters`);
      }
    }

    // Additional validation for bead IDs
    return sanitized;
  }

  /**
   * Validate bead ID format
   */
  private validateBeadId(id: string): void {
    // Bead IDs should match pattern like "gt-abc12" or numeric
    const validPattern = /^(gt-[a-z0-9]+|\d+)$/i;
    if (!validPattern.test(id)) {
      throw new Error(`Invalid bead ID format: ${id}`);
    }
  }

  /**
   * Execute gt command
   */
  async gt(args: string[]): Promise<string> {
    const sanitizedArgs = args.map(arg => this.sanitizeInput(arg));
    const command = `gt ${sanitizedArgs.join(' ')}`;

    return new Promise((resolve, reject) => {
      mockExec(command, { cwd: this.townRoot, timeout: this.timeout }, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.stdout);
        }
      });
    });
  }

  /**
   * Execute bd command with JSONL output
   */
  async bd(args: string[]): Promise<string> {
    const sanitizedArgs = args.map(arg => this.sanitizeInput(arg));
    const command = `bd ${sanitizedArgs.join(' ')} --json`;

    return new Promise((resolve, reject) => {
      mockExec(command, { cwd: this.townRoot, timeout: this.timeout }, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.stdout);
        }
      });
    });
  }

  /**
   * Create a bead
   */
  async createBead(opts: CreateBeadOptions): Promise<Bead> {
    const sanitizedTitle = this.sanitizeInput(opts.title);
    const args = ['create', `"${sanitizedTitle}"`];

    if (opts.priority !== undefined) {
      args.push('-p', opts.priority.toString());
    }
    if (opts.labels?.length) {
      const sanitizedLabels = opts.labels.map(l => this.sanitizeInput(l));
      args.push('-l', sanitizedLabels.join(','));
    }
    if (opts.parent) {
      this.validateBeadId(opts.parent);
      args.push('--parent', opts.parent);
    }

    const result = await this.bd(args);
    return JSON.parse(result);
  }

  /**
   * Get ready beads (no blockers)
   */
  async getReady(limit = 10, rig?: string): Promise<Bead[]> {
    const args = ['ready', '--limit', limit.toString()];
    if (rig) {
      const sanitizedRig = this.sanitizeInput(rig);
      args.push('--rig', sanitizedRig);
    }

    const result = await this.bd(args);
    return this.parseJsonLines(result);
  }

  /**
   * Show bead details
   */
  async showBead(beadId: string): Promise<Bead> {
    this.validateBeadId(beadId);
    const result = await this.bd(['show', beadId]);
    return JSON.parse(result);
  }

  /**
   * List all beads
   */
  async listBeads(rig?: string): Promise<Bead[]> {
    const args = ['list'];
    if (rig) {
      const sanitizedRig = this.sanitizeInput(rig);
      args.push(`--rig=${sanitizedRig}`);
    }

    const result = await this.bd(args);
    return this.parseJsonLines(result);
  }

  /**
   * Sling work to an agent
   */
  async sling(beadId: string, target: string, formula?: string): Promise<void> {
    this.validateBeadId(beadId);
    const sanitizedTarget = this.sanitizeInput(target);
    const args = ['sling', beadId, sanitizedTarget];

    if (formula) {
      const sanitizedFormula = this.sanitizeInput(formula);
      args.push('--formula', sanitizedFormula);
    }

    await this.gt(args);
  }

  /**
   * Parse JSONL (newline-delimited JSON)
   */
  private parseJsonLines(content: string): Bead[] {
    if (!content.trim()) return [];

    return content
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }
}

// ============================================================================
// Mock Implementation - BdBridge (Beads-specific)
// ============================================================================

class BdBridge {
  private bridge: GasTownBridge;

  constructor(bridge: GasTownBridge) {
    this.bridge = bridge;
  }

  /**
   * Add dependency between beads
   */
  async addDependency(child: string, parent: string): Promise<void> {
    await this.bridge.bd(['dep', 'add', child, parent]);
  }

  /**
   * Remove dependency between beads
   */
  async removeDependency(child: string, parent: string): Promise<void> {
    await this.bridge.bd(['dep', 'remove', child, parent]);
  }

  /**
   * Get bead dependencies
   */
  async getDependencies(beadId: string): Promise<string[]> {
    const result = await this.bridge.bd(['dep', 'list', beadId]);
    return JSON.parse(result);
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

function mockExecSuccess(stdout: string, stderr = ''): void {
  mockExec.mockImplementation((cmd, opts, callback) => {
    callback(null, { stdout, stderr });
  });
}

function mockExecFailure(error: Error): void {
  mockExec.mockImplementation((cmd, opts, callback) => {
    callback(error, { stdout: '', stderr: error.message });
  });
}

function createSampleBead(overrides: Partial<Bead> = {}): Bead {
  return {
    id: 'gt-abc12',
    title: 'Sample Bead',
    description: 'A sample bead for testing',
    status: 'open',
    priority: 2,
    labels: ['test'],
    created_at: '2026-01-24T10:00:00Z',
    updated_at: '2026-01-24T10:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// Tests - GasTownBridge
// ============================================================================

describe('GasTownBridge', () => {
  let bridge: GasTownBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new GasTownBridge({ townRoot: '~/gt' });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('gt command execution', () => {
    it('should execute gt command with arguments', async () => {
      mockExecSuccess('command executed\n');

      const result = await bridge.gt(['status']);

      expect(mockExec).toHaveBeenCalledWith(
        'gt status',
        expect.objectContaining({ cwd: '~/gt' }),
        expect.any(Function)
      );
      expect(result).toBe('command executed\n');
    });

    it('should join multiple arguments with spaces', async () => {
      mockExecSuccess('slung\n');

      await bridge.gt(['sling', 'gt-abc12', 'polecat']);

      expect(mockExec).toHaveBeenCalledWith(
        'gt sling gt-abc12 polecat',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should reject on command error', async () => {
      const error = new Error('gt: command not found');
      mockExecFailure(error);

      await expect(bridge.gt(['status'])).rejects.toThrow('gt: command not found');
    });

    it('should use configured timeout', async () => {
      const customBridge = new GasTownBridge({ townRoot: '~/gt', timeout: 5000 });
      mockExecSuccess('ok\n');

      await customBridge.gt(['status']);

      expect(mockExec).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 5000 }),
        expect.any(Function)
      );
    });
  });

  describe('bd command execution', () => {
    it('should execute bd command with --json flag', async () => {
      mockExecSuccess('{"id":"gt-abc12"}\n');

      await bridge.bd(['list']);

      expect(mockExec).toHaveBeenCalledWith(
        'bd list --json',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should parse JSONL output from bd', async () => {
      const bead = createSampleBead();
      mockExecSuccess(JSON.stringify(bead) + '\n');

      const result = await bridge.bd(['show', 'gt-abc12']);

      expect(result).toContain('gt-abc12');
    });
  });

  describe('createBead', () => {
    it('should create a bead with title', async () => {
      const bead = createSampleBead();
      mockExecSuccess(JSON.stringify(bead));

      const result = await bridge.createBead({ title: 'New Task' });

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('bd create "New Task"'),
        expect.any(Object),
        expect.any(Function)
      );
      expect(result.id).toBe('gt-abc12');
    });

    it('should include priority flag', async () => {
      const bead = createSampleBead({ priority: 1 });
      mockExecSuccess(JSON.stringify(bead));

      await bridge.createBead({ title: 'Urgent', priority: 1 });

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('-p 1'),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should include labels', async () => {
      const bead = createSampleBead({ labels: ['bug', 'urgent'] });
      mockExecSuccess(JSON.stringify(bead));

      await bridge.createBead({ title: 'Bug Fix', labels: ['bug', 'urgent'] });

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('-l bug,urgent'),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should include parent for epics', async () => {
      const bead = createSampleBead({ parent_id: 'gt-parent1' });
      mockExecSuccess(JSON.stringify(bead));

      await bridge.createBead({ title: 'Sub Task', parent: 'gt-parent1' });

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('--parent gt-parent1'),
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('getReady', () => {
    it('should list ready beads with limit', async () => {
      const beads = [createSampleBead(), createSampleBead({ id: 'gt-def34' })];
      mockExecSuccess(beads.map(b => JSON.stringify(b)).join('\n'));

      const result = await bridge.getReady(10);

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('bd ready --limit 10'),
        expect.any(Object),
        expect.any(Function)
      );
      expect(result).toHaveLength(2);
    });

    it('should filter by rig', async () => {
      mockExecSuccess('');

      await bridge.getReady(5, 'town');

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('--rig town'),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle empty result', async () => {
      mockExecSuccess('');

      const result = await bridge.getReady();

      expect(result).toHaveLength(0);
    });
  });

  describe('showBead', () => {
    it('should show bead details', async () => {
      const bead = createSampleBead();
      mockExecSuccess(JSON.stringify(bead));

      const result = await bridge.showBead('gt-abc12');

      expect(result.id).toBe('gt-abc12');
      expect(result.title).toBe('Sample Bead');
    });

    it('should validate bead ID format', async () => {
      await expect(bridge.showBead('invalid id!')).rejects.toThrow('Invalid bead ID');
    });
  });

  describe('listBeads', () => {
    it('should list all beads', async () => {
      const beads = [createSampleBead(), createSampleBead({ id: 'gt-xyz99' })];
      mockExecSuccess(beads.map(b => JSON.stringify(b)).join('\n'));

      const result = await bridge.listBeads();

      expect(result).toHaveLength(2);
    });

    it('should filter by rig', async () => {
      mockExecSuccess('');

      await bridge.listBeads('refinery');

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('--rig=refinery'),
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('sling', () => {
    it('should sling work to target agent', async () => {
      mockExecSuccess('');

      await bridge.sling('gt-abc12', 'polecat');

      expect(mockExec).toHaveBeenCalledWith(
        'gt sling gt-abc12 polecat',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should include formula when provided', async () => {
      mockExecSuccess('');

      await bridge.sling('gt-abc12', 'crew', 'feature-workflow');

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('--formula feature-workflow'),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should validate bead ID', async () => {
      await expect(bridge.sling('bad;id', 'polecat')).rejects.toThrow();
    });
  });
});

// ============================================================================
// Tests - Input Sanitization
// ============================================================================

describe('GasTownBridge Input Sanitization', () => {
  let bridge: GasTownBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new GasTownBridge({ townRoot: '~/gt' });
  });

  describe('command injection prevention', () => {
    it('should block semicolon injection', async () => {
      await expect(bridge.gt(['status; rm -rf /'])).rejects.toThrow('dangerous characters');
    });

    it('should block pipe injection', async () => {
      await expect(bridge.gt(['status | cat /etc/passwd'])).rejects.toThrow('dangerous characters');
    });

    it('should block ampersand injection', async () => {
      await expect(bridge.gt(['status & malicious'])).rejects.toThrow('dangerous characters');
    });

    it('should block backtick injection', async () => {
      await expect(bridge.gt(['`whoami`'])).rejects.toThrow('dangerous characters');
    });

    it('should block $() command substitution', async () => {
      await expect(bridge.gt(['$(cat /etc/passwd)'])).rejects.toThrow('dangerous characters');
    });

    it('should block curly brace expansion', async () => {
      await expect(bridge.gt(['{a,b}'])).rejects.toThrow('dangerous characters');
    });

    it('should block redirection operators', async () => {
      await expect(bridge.gt(['status > /tmp/out'])).rejects.toThrow('dangerous characters');
      await expect(bridge.gt(['status < /etc/passwd'])).rejects.toThrow('dangerous characters');
    });
  });

  describe('path traversal prevention', () => {
    it('should block ../ path traversal', async () => {
      await expect(bridge.gt(['../../../etc/passwd'])).rejects.toThrow('dangerous characters');
    });

    it('should block encoded path traversal', async () => {
      await expect(bridge.gt(['..\\x2f..\\x2f'])).rejects.toThrow('dangerous characters');
    });
  });

  describe('newline injection prevention', () => {
    it('should block newline characters', async () => {
      await expect(bridge.gt(['status\nrm -rf /'])).rejects.toThrow('dangerous characters');
    });

    it('should block carriage return', async () => {
      await expect(bridge.gt(['status\rmalicious'])).rejects.toThrow('dangerous characters');
    });
  });

  describe('sanitization can be disabled', () => {
    it('should allow dangerous characters when sanitize is false', async () => {
      const unsafeBridge = new GasTownBridge({ townRoot: '~/gt', sanitize: false });
      mockExecSuccess('ok\n');

      // This would normally be blocked, but sanitization is disabled
      await unsafeBridge.gt(['status; echo test']);

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('status; echo test'),
        expect.any(Object),
        expect.any(Function)
      );
    });
  });
});

// ============================================================================
// Tests - BdBridge (Beads CLI)
// ============================================================================

describe('BdBridge', () => {
  let gasBridge: GasTownBridge;
  let bdBridge: BdBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    gasBridge = new GasTownBridge({ townRoot: '~/gt' });
    bdBridge = new BdBridge(gasBridge);
  });

  describe('addDependency', () => {
    it('should add dependency between beads', async () => {
      mockExecSuccess('');

      await bdBridge.addDependency('gt-child1', 'gt-parent1');

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('bd dep add gt-child1 gt-parent1'),
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('removeDependency', () => {
    it('should remove dependency between beads', async () => {
      mockExecSuccess('');

      await bdBridge.removeDependency('gt-child1', 'gt-parent1');

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('bd dep remove gt-child1 gt-parent1'),
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('getDependencies', () => {
    it('should list bead dependencies', async () => {
      mockExecSuccess('["gt-dep1", "gt-dep2"]');

      const result = await bdBridge.getDependencies('gt-child1');

      expect(result).toContain('gt-dep1');
      expect(result).toContain('gt-dep2');
    });
  });
});

// ============================================================================
// Tests - JSONL Parsing
// ============================================================================

describe('JSONL Parsing', () => {
  let bridge: GasTownBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new GasTownBridge({ townRoot: '~/gt' });
  });

  it('should parse multiple JSONL lines', async () => {
    const beads = [
      createSampleBead({ id: 'gt-1' }),
      createSampleBead({ id: 'gt-2' }),
      createSampleBead({ id: 'gt-3' }),
    ];
    mockExecSuccess(beads.map(b => JSON.stringify(b)).join('\n'));

    const result = await bridge.getReady();

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('gt-1');
    expect(result[1].id).toBe('gt-2');
    expect(result[2].id).toBe('gt-3');
  });

  it('should handle trailing newline', async () => {
    const bead = createSampleBead();
    mockExecSuccess(JSON.stringify(bead) + '\n');

    const result = await bridge.getReady();

    expect(result).toHaveLength(1);
  });

  it('should handle empty lines', async () => {
    const beads = [createSampleBead({ id: 'gt-1' }), createSampleBead({ id: 'gt-2' })];
    mockExecSuccess(JSON.stringify(beads[0]) + '\n\n' + JSON.stringify(beads[1]) + '\n');

    const result = await bridge.getReady();

    expect(result).toHaveLength(2);
  });

  it('should throw on malformed JSON', async () => {
    mockExecSuccess('not valid json\n');

    await expect(bridge.getReady()).rejects.toThrow();
  });
});

// ============================================================================
// Tests - Error Handling
// ============================================================================

describe('Error Handling', () => {
  let bridge: GasTownBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new GasTownBridge({ townRoot: '~/gt' });
  });

  describe('CLI not found', () => {
    it('should handle gt command not found', async () => {
      const error = new Error('gt: command not found');
      mockExecFailure(error);

      await expect(bridge.gt(['status'])).rejects.toThrow('command not found');
    });

    it('should handle bd command not found', async () => {
      const error = new Error('bd: command not found');
      mockExecFailure(error);

      await expect(bridge.bd(['list'])).rejects.toThrow('command not found');
    });
  });

  describe('timeout handling', () => {
    it('should handle command timeout', async () => {
      const error = new Error('Command timed out');
      mockExecFailure(error);

      await expect(bridge.gt(['long-running-command'])).rejects.toThrow('timed out');
    });
  });

  describe('permission errors', () => {
    it('should handle permission denied', async () => {
      const error = new Error('Permission denied');
      mockExecFailure(error);

      await expect(bridge.gt(['protected-command'])).rejects.toThrow('Permission denied');
    });
  });
});
