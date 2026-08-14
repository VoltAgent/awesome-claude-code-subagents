/**
 * Tests for DeterministicToolGateway
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DeterministicToolGateway,
  createToolGateway,
} from '../src/gateway.js';
import type {
  ToolSchema,
  Budget,
  GatewayDecision,
} from '../src/gateway.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeSchema(overrides: Partial<ToolSchema> = {}): ToolSchema {
  return {
    toolName: 'TestTool',
    requiredParams: ['input'],
    optionalParams: ['verbose'],
    paramTypes: { input: 'string', verbose: 'boolean' },
    maxParamSize: 1024,
    ...overrides,
  };
}

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    tokenBudget: { used: 0, limit: 1000 },
    toolCallBudget: { used: 0, limit: 50 },
    storageBudget: { usedBytes: 0, limitBytes: 1_000_000 },
    timeBudget: { usedMs: 0, limitMs: 60_000 },
    costBudget: { usedUsd: 0, limitUsd: 1.0 },
    ...overrides,
  };
}

// ============================================================================
// Idempotency Tests
// ============================================================================

describe('DeterministicToolGateway - Idempotency', () => {
  let gateway: DeterministicToolGateway;

  beforeEach(() => {
    gateway = new DeterministicToolGateway({
      idempotencyTtlMs: 5000,
    });
  });

  it('should return cached result for identical tool calls', () => {
    const params = { input: 'hello' };

    // First call: evaluate + record
    const firstDecision = gateway.evaluate('TestTool', params);
    expect(firstDecision.allowed).toBe(true);
    expect(firstDecision.idempotencyHit).toBe(false);

    gateway.recordCall('TestTool', params, { output: 'world' }, 100);

    // Second call: should hit cache
    const secondDecision = gateway.evaluate('TestTool', params);
    expect(secondDecision.allowed).toBe(true);
    expect(secondDecision.idempotencyHit).toBe(true);
    expect(secondDecision.cachedResult).toEqual({ output: 'world' });
  });

  it('should not return cached result for different params', () => {
    gateway.recordCall('TestTool', { input: 'a' }, { result: 1 }, 50);

    const decision = gateway.evaluate('TestTool', { input: 'b' });
    expect(decision.idempotencyHit).toBe(false);
    expect(decision.cachedResult).toBeUndefined();
  });

  it('should not return cached result for different tool names', () => {
    gateway.recordCall('ToolA', { input: 'x' }, { result: 1 }, 50);

    const decision = gateway.evaluate('ToolB', { input: 'x' });
    expect(decision.idempotencyHit).toBe(false);
  });

  it('should expire idempotency records after TTL', () => {
    const gateway = new DeterministicToolGateway({
      idempotencyTtlMs: 100,
    });

    gateway.recordCall('TestTool', { input: 'x' }, { result: 1 }, 10);

    // Manually manipulate timestamp to simulate expiration
    const history = gateway.getCallHistory();
    expect(history.length).toBe(1);

    // Alter timestamp to be in the past
    history[0].timestamp = Date.now() - 200;

    // Evaluate should not return cached (record is expired)
    const decision = gateway.evaluate('TestTool', { input: 'x' });
    expect(decision.idempotencyHit).toBe(false);
  });

  it('should list all call history', () => {
    gateway.recordCall('Tool1', { a: 1 }, 'result1', 10);
    gateway.recordCall('Tool2', { b: 2 }, 'result2', 20);
    gateway.recordCall('Tool3', { c: 3 }, 'result3', 30);

    const history = gateway.getCallHistory();
    expect(history.length).toBe(3);
    expect(history.map(h => h.toolName)).toEqual(['Tool1', 'Tool2', 'Tool3']);
  });
});

// ============================================================================
// Idempotency Key Determinism Tests
// ============================================================================

describe('DeterministicToolGateway - Idempotency Key Determinism', () => {
  let gateway: DeterministicToolGateway;

  beforeEach(() => {
    gateway = new DeterministicToolGateway();
  });

  it('should produce the same key for identical inputs', () => {
    const key1 = gateway.getIdempotencyKey('Tool', { a: 1, b: 2 });
    const key2 = gateway.getIdempotencyKey('Tool', { a: 1, b: 2 });
    expect(key1).toBe(key2);
  });

  it('should produce the same key regardless of param order', () => {
    const key1 = gateway.getIdempotencyKey('Tool', { b: 2, a: 1 });
    const key2 = gateway.getIdempotencyKey('Tool', { a: 1, b: 2 });
    expect(key1).toBe(key2);
  });

  it('should produce different keys for different tool names', () => {
    const key1 = gateway.getIdempotencyKey('ToolA', { x: 1 });
    const key2 = gateway.getIdempotencyKey('ToolB', { x: 1 });
    expect(key1).not.toBe(key2);
  });

  it('should produce different keys for different param values', () => {
    const key1 = gateway.getIdempotencyKey('Tool', { x: 1 });
    const key2 = gateway.getIdempotencyKey('Tool', { x: 2 });
    expect(key1).not.toBe(key2);
  });

  it('should produce a 64-character hex string (SHA-256)', () => {
    const key = gateway.getIdempotencyKey('Tool', { foo: 'bar' });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle nested objects deterministically', () => {
    const key1 = gateway.getIdempotencyKey('Tool', {
      nested: { z: 3, a: 1 },
      top: 'value',
    });
    const key2 = gateway.getIdempotencyKey('Tool', {
      top: 'value',
      nested: { a: 1, z: 3 },
    });
    expect(key1).toBe(key2);
  });
});

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('DeterministicToolGateway - Schema Validation', () => {
  let gateway: DeterministicToolGateway;

  beforeEach(() => {
    gateway = new DeterministicToolGateway({
      schemas: [
        makeSchema(),
        makeSchema({
          toolName: 'TypedTool',
          requiredParams: ['count', 'name', 'enabled'],
          optionalParams: ['tags'],
          paramTypes: {
            count: 'number',
            name: 'string',
            enabled: 'boolean',
            tags: 'array',
          },
          maxParamSize: 512,
          allowedValues: {
            name: ['alice', 'bob', 'charlie'],
          },
        }),
      ],
    });
  });

  it('should accept valid params matching schema', () => {
    const result = gateway.validateSchema('TestTool', {
      input: 'hello',
      verbose: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing required params', () => {
    const result = gateway.validateSchema('TestTool', { verbose: true });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required parameter: "input"');
  });

  it('should reject unknown params', () => {
    const result = gateway.validateSchema('TestTool', {
      input: 'hello',
      unknown: 'bad',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unknown parameter: "unknown"');
  });

  it('should reject wrong param types', () => {
    const result = gateway.validateSchema('TestTool', {
      input: 42, // should be string
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"input"') && e.includes('string'))).toBe(true);
  });

  it('should reject params exceeding max size', () => {
    const result = gateway.validateSchema('TestTool', {
      input: 'x'.repeat(2000),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exceeds limit'))).toBe(true);
  });

  it('should reject values not in allowed list', () => {
    const result = gateway.validateSchema('TypedTool', {
      count: 1,
      name: 'eve', // not in ['alice', 'bob', 'charlie']
      enabled: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"name"') && e.includes('allowed values'))).toBe(true);
  });

  it('should accept values in allowed list', () => {
    const result = gateway.validateSchema('TypedTool', {
      count: 1,
      name: 'alice',
      enabled: true,
    });
    expect(result.valid).toBe(true);
  });

  it('should pass through tools without a registered schema', () => {
    const result = gateway.validateSchema('UnknownTool', { anything: 'goes' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect array type correctly', () => {
    const result = gateway.validateSchema('TypedTool', {
      count: 1,
      name: 'alice',
      enabled: true,
      tags: ['a', 'b'],
    });
    expect(result.valid).toBe(true);
  });

  it('should reject array when string is expected', () => {
    const result = gateway.validateSchema('TestTool', {
      input: ['not', 'a', 'string'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"input"'))).toBe(true);
  });

  it('should block invalid params through evaluate pipeline', () => {
    const decision = gateway.evaluate('TestTool', { verbose: true });
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toBe('schema-validation');
  });
});

// ============================================================================
// Budget Enforcement Tests
// ============================================================================

describe('DeterministicToolGateway - Budget Enforcement', () => {
  it('should allow calls within budget', () => {
    const gateway = new DeterministicToolGateway({
      budget: makeBudget(),
    });

    const decision = gateway.evaluate('TestTool', { input: 'ok' });
    expect(decision.allowed).toBe(true);
    expect(decision.budgetRemaining).toBeDefined();
  });

  it('should block when tool call budget is exceeded', () => {
    const gateway = new DeterministicToolGateway({
      budget: makeBudget({
        toolCallBudget: { used: 51, limit: 50 },
      }),
    });

    const decision = gateway.evaluate('TestTool', { input: 'blocked' });
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toBe('budget');
    expect(decision.reason).toContain('Budget exceeded');
  });

  it('should block when token budget is exceeded', () => {
    const gateway = new DeterministicToolGateway({
      budget: makeBudget({
        tokenBudget: { used: 1001, limit: 1000 },
      }),
    });

    const decision = gateway.evaluate('TestTool', { input: 'blocked' });
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toBe('budget');
  });

  it('should block when time budget is exceeded', () => {
    const gateway = new DeterministicToolGateway({
      budget: makeBudget({
        timeBudget: { usedMs: 61_000, limitMs: 60_000 },
      }),
    });

    const decision = gateway.evaluate('TestTool', { input: 'blocked' });
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toBe('budget');
    expect(decision.reason).toContain('time');
  });

  it('should block when cost budget is exceeded', () => {
    const gateway = new DeterministicToolGateway({
      budget: makeBudget({
        costBudget: { usedUsd: 1.5, limitUsd: 1.0 },
      }),
    });

    const decision = gateway.evaluate('TestTool', { input: 'blocked' });
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toBe('budget');
    expect(decision.reason).toContain('cost');
  });

  it('should block when storage budget is exceeded', () => {
    const gateway = new DeterministicToolGateway({
      budget: makeBudget({
        storageBudget: { usedBytes: 2_000_000, limitBytes: 1_000_000 },
      }),
    });

    const decision = gateway.evaluate('TestTool', { input: 'blocked' });
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toBe('budget');
    expect(decision.reason).toContain('storage');
  });

  it('should use infinite limits when no budget is specified', () => {
    const gateway = new DeterministicToolGateway();

    const { withinBudget } = gateway.checkBudget();
    expect(withinBudget).toBe(true);
  });
});

// ============================================================================
// Budget Metering Tests
// ============================================================================

describe('DeterministicToolGateway - Budget Metering', () => {
  let gateway: DeterministicToolGateway;

  beforeEach(() => {
    gateway = new DeterministicToolGateway({
      budget: makeBudget(),
    });
  });

  it('should increment tool call count on recordCall', () => {
    gateway.recordCall('Tool', { a: 1 }, 'result', 100);
    const budget = gateway.getBudget();
    expect(budget.toolCallBudget.used).toBe(1);
  });

  it('should accumulate time on recordCall', () => {
    gateway.recordCall('Tool', { a: 1 }, 'r1', 100);
    gateway.recordCall('Tool', { a: 2 }, 'r2', 200);
    const budget = gateway.getBudget();
    expect(budget.timeBudget.usedMs).toBe(300);
  });

  it('should accumulate tokens when provided', () => {
    gateway.recordCall('Tool', { a: 1 }, 'r1', 50, 100);
    gateway.recordCall('Tool', { a: 2 }, 'r2', 50, 200);
    const budget = gateway.getBudget();
    expect(budget.tokenBudget.used).toBe(300);
  });

  it('should not alter token budget when tokenCount is omitted', () => {
    gateway.recordCall('Tool', { a: 1 }, 'r1', 50);
    const budget = gateway.getBudget();
    expect(budget.tokenBudget.used).toBe(0);
  });

  it('should accumulate storage from result size', () => {
    gateway.recordCall('Tool', { a: 1 }, { big: 'x'.repeat(500) }, 10);
    const budget = gateway.getBudget();
    expect(budget.storageBudget.usedBytes).toBeGreaterThan(500);
  });

  it('should estimate cost based on tokens', () => {
    gateway.recordCall('Tool', { a: 1 }, 'result', 100, 1000);
    const budget = gateway.getBudget();
    // 1000 tokens * $0.003/1K = $0.003
    expect(budget.costBudget.usedUsd).toBeCloseTo(0.003, 4);
  });

  it('should reset budget to zero', () => {
    gateway.recordCall('Tool', { a: 1 }, 'r', 100, 500);
    gateway.resetBudget();

    const budget = gateway.getBudget();
    expect(budget.tokenBudget.used).toBe(0);
    expect(budget.toolCallBudget.used).toBe(0);
    expect(budget.storageBudget.usedBytes).toBe(0);
    expect(budget.timeBudget.usedMs).toBe(0);
    expect(budget.costBudget.usedUsd).toBe(0);
  });

  it('should preserve limits after reset', () => {
    gateway.recordCall('Tool', { a: 1 }, 'r', 100, 500);
    gateway.resetBudget();

    const budget = gateway.getBudget();
    expect(budget.tokenBudget.limit).toBe(1000);
    expect(budget.toolCallBudget.limit).toBe(50);
  });

  it('should block after budget is exhausted through metering', () => {
    const tightGateway = new DeterministicToolGateway({
      budget: makeBudget({
        toolCallBudget: { used: 0, limit: 2 },
      }),
    });

    tightGateway.recordCall('T', { a: 1 }, 'r1', 10);
    tightGateway.recordCall('T', { a: 2 }, 'r2', 10);
    tightGateway.recordCall('T', { a: 3 }, 'r3', 10);

    const decision = tightGateway.evaluate('T', { a: 4 });
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toBe('budget');
  });
});

// ============================================================================
// EnforcementGates Integration Tests
// ============================================================================

describe('DeterministicToolGateway - EnforcementGates Integration', () => {
  it('should block destructive commands through context', () => {
    const gateway = new DeterministicToolGateway();

    const decision = gateway.evaluate(
      'Bash',
      { command: 'rm -rf /' },
      { command: 'rm -rf /' },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toContain('enforcement');
  });

  it('should block tools not in allowlist', () => {
    const gateway = new DeterministicToolGateway({
      gateConfig: {
        toolAllowlist: true,
        allowedTools: ['Read', 'Write'],
      },
    });

    const decision = gateway.evaluate('Bash', { command: 'ls' });
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toContain('enforcement:tool-allowlist');
  });

  it('should allow tools in the allowlist', () => {
    const gateway = new DeterministicToolGateway({
      gateConfig: {
        toolAllowlist: true,
        allowedTools: ['Read', 'Write'],
      },
    });

    const decision = gateway.evaluate('Read', { path: '/tmp/file.txt' });
    expect(decision.allowed).toBe(true);
  });

  it('should detect secrets in tool params', () => {
    const gateway = new DeterministicToolGateway();

    const decision = gateway.evaluate('Write', {
      content: 'api_key = "sk-supersecretkey1234567890abcdef"',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toContain('enforcement:secrets');
  });

  it('should allow clean tool params', () => {
    const gateway = new DeterministicToolGateway();

    const decision = gateway.evaluate('Write', {
      content: 'const greeting = "hello world"',
    });
    expect(decision.allowed).toBe(true);
  });

  it('should run schema validation before gates', () => {
    const gateway = new DeterministicToolGateway({
      schemas: [makeSchema()],
    });

    // Missing required param should fail at schema, not gates
    const decision = gateway.evaluate('TestTool', {});
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toBe('schema-validation');
  });

  it('should run budget check before gates', () => {
    const gateway = new DeterministicToolGateway({
      budget: makeBudget({
        toolCallBudget: { used: 100, limit: 50 },
      }),
      gateConfig: {
        toolAllowlist: true,
        allowedTools: ['Read'],
      },
    });

    // Budget exceeded should fail before tool allowlist check
    const decision = gateway.evaluate('Bash', { command: 'ls' });
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toBe('budget');
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createToolGateway', () => {
  it('should create a gateway with default config', () => {
    const gateway = createToolGateway();
    expect(gateway).toBeInstanceOf(DeterministicToolGateway);
  });

  it('should create a gateway with custom config', () => {
    const gateway = createToolGateway({
      schemas: [makeSchema()],
      budget: makeBudget(),
      idempotencyTtlMs: 10_000,
    });
    expect(gateway).toBeInstanceOf(DeterministicToolGateway);

    const budget = gateway.getBudget();
    expect(budget.tokenBudget.limit).toBe(1000);
  });

  it('should return a fully functional gateway', () => {
    const gateway = createToolGateway({
      schemas: [makeSchema()],
    });

    const decision = gateway.evaluate('TestTool', { input: 'valid' });
    expect(decision.allowed).toBe(true);
    expect(decision.idempotencyHit).toBe(false);
    expect(decision.gate).toBe('none');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('DeterministicToolGateway - Edge Cases', () => {
  it('should handle empty params', () => {
    const gateway = new DeterministicToolGateway();
    const decision = gateway.evaluate('Tool', {});
    expect(decision.allowed).toBe(true);
  });

  it('should handle null-like param values', () => {
    const gateway = new DeterministicToolGateway();
    const decision = gateway.evaluate('Tool', { a: null, b: undefined });
    expect(decision.allowed).toBe(true);
  });

  it('should produce consistent keys with undefined values', () => {
    const gateway = new DeterministicToolGateway();
    // JSON.stringify drops undefined values, so these should match
    const key1 = gateway.getIdempotencyKey('Tool', { a: 1 });
    const key2 = gateway.getIdempotencyKey('Tool', { a: 1, b: undefined });
    expect(key1).toBe(key2);
  });

  it('should return budget remaining on allow', () => {
    const gateway = new DeterministicToolGateway({
      budget: makeBudget(),
    });

    const decision = gateway.evaluate('Tool', { x: 1 });
    expect(decision.allowed).toBe(true);
    expect(decision.budgetRemaining).toBeDefined();
    expect(decision.budgetRemaining!.tokenBudget.limit).toBe(1000);
  });

  it('should return budget remaining on budget rejection', () => {
    const gateway = new DeterministicToolGateway({
      budget: makeBudget({
        toolCallBudget: { used: 100, limit: 50 },
      }),
    });

    const decision = gateway.evaluate('Tool', { x: 1 });
    expect(decision.allowed).toBe(false);
    expect(decision.budgetRemaining).toBeDefined();
    expect(decision.budgetRemaining!.toolCallBudget.used).toBe(100);
  });

  it('should not mutate the budget through getBudget', () => {
    const gateway = new DeterministicToolGateway({
      budget: makeBudget(),
    });

    const budget1 = gateway.getBudget();
    budget1.tokenBudget.used = 999;

    const budget2 = gateway.getBudget();
    expect(budget2.tokenBudget.used).toBe(0);
  });
});
