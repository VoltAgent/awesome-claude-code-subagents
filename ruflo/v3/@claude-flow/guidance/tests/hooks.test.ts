/**
 * Tests for Guidance Hook Integration Layer
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GuidanceHookProvider, createGuidanceHooks, gateResultsToHookResult } from '../src/hooks.js';
import { EnforcementGates } from '../src/gates.js';
import { ShardRetriever, HashEmbeddingProvider } from '../src/retriever.js';
import { RunLedger } from '../src/ledger.js';
import { HookRegistry } from '@claude-flow/hooks';
import { HookEvent, HookPriority } from '@claude-flow/hooks';
import type { HookContext, HookResult } from '@claude-flow/hooks';
import type { GateResult, RunEvent, PolicyBundle } from '../src/types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeHookContext(overrides: Partial<HookContext> = {}): HookContext {
  return {
    event: HookEvent.PreCommand,
    timestamp: new Date(),
    ...overrides,
  };
}

function makePolicyBundle(): PolicyBundle {
  return {
    constitution: {
      rules: [
        {
          id: 'R001',
          text: 'Never commit secrets',
          riskClass: 'critical',
          toolClasses: ['all'],
          intents: ['security'],
          repoScopes: ['**/*'],
          domains: ['security'],
          priority: 100,
          source: 'root',
          isConstitution: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      text: '# Constitution\n\n- Never commit secrets',
      hash: 'test-hash-001',
    },
    shards: [
      {
        rule: {
          id: 'R002',
          text: 'Always run tests before committing',
          riskClass: 'high',
          toolClasses: ['bash'],
          intents: ['testing', 'feature'],
          repoScopes: ['**/*'],
          domains: ['testing'],
          priority: 80,
          source: 'root',
          isConstitution: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        compactText: 'Run tests before committing code changes.',
      },
      {
        rule: {
          id: 'R003',
          text: 'Use staged commits for large changes',
          riskClass: 'medium',
          toolClasses: ['edit'],
          intents: ['feature', 'refactor'],
          repoScopes: ['**/*'],
          domains: ['architecture'],
          priority: 50,
          source: 'root',
          isConstitution: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        compactText: 'Break large changes into staged commits.',
      },
    ],
    manifest: {
      rules: [],
      compiledAt: Date.now(),
      sourceHashes: {},
      totalRules: 3,
      constitutionRules: 1,
      shardRules: 2,
    },
  };
}

// ============================================================================
// gateResultsToHookResult
// ============================================================================

describe('gateResultsToHookResult', () => {
  it('should return success for empty gate results', () => {
    const result = gateResultsToHookResult([]);
    expect(result.success).toBe(true);
    expect(result.abort).toBeUndefined();
  });

  it('should map block decision to abort', () => {
    const gateResults: GateResult[] = [
      {
        decision: 'block',
        gateName: 'secrets',
        reason: 'Secret detected',
        triggeredRules: ['R001'],
        remediation: 'Remove the secret',
      },
    ];

    const result = gateResultsToHookResult(gateResults);
    expect(result.success).toBe(false);
    expect(result.abort).toBe(true);
    expect(result.error).toContain('Secret detected');
  });

  it('should map require-confirmation to abort', () => {
    const gateResults: GateResult[] = [
      {
        decision: 'require-confirmation',
        gateName: 'destructive-ops',
        reason: 'Destructive op detected',
        triggeredRules: [],
        remediation: 'Confirm the operation',
      },
    ];

    const result = gateResultsToHookResult(gateResults);
    expect(result.success).toBe(false);
    expect(result.abort).toBe(true);
    expect(result.data).toBeDefined();
    expect((result.data as Record<string, unknown>).gateDecision).toBe('require-confirmation');
  });

  it('should map warn to success with warnings', () => {
    const gateResults: GateResult[] = [
      {
        decision: 'warn',
        gateName: 'diff-size',
        reason: 'Large diff detected',
        triggeredRules: [],
        remediation: 'Stage incrementally',
      },
    ];

    const result = gateResultsToHookResult(gateResults);
    expect(result.success).toBe(true);
    expect(result.abort).toBeUndefined();
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
  });

  it('should pick the most restrictive decision among mixed results', () => {
    const gateResults: GateResult[] = [
      { decision: 'warn', gateName: 'diff-size', reason: 'Large', triggeredRules: [] },
      { decision: 'block', gateName: 'secrets', reason: 'Secret', triggeredRules: [] },
    ];

    const result = gateResultsToHookResult(gateResults);
    expect(result.success).toBe(false);
    expect(result.abort).toBe(true);
    expect((result.data as Record<string, unknown>).gateDecision).toBe('block');
  });
});

// ============================================================================
// GuidanceHookProvider - Registration
// ============================================================================

describe('GuidanceHookProvider', () => {
  let gates: EnforcementGates;
  let retriever: ShardRetriever;
  let ledger: RunLedger;
  let registry: HookRegistry;
  let provider: GuidanceHookProvider;

  beforeEach(async () => {
    gates = new EnforcementGates();
    retriever = new ShardRetriever(new HashEmbeddingProvider());
    ledger = new RunLedger();
    registry = new HookRegistry();
    provider = new GuidanceHookProvider(gates, retriever, ledger);

    // Load a bundle so the retriever is functional
    await retriever.loadBundle(makePolicyBundle());
  });

  describe('registerAll', () => {
    it('should register 5 hooks on the registry', () => {
      const ids = provider.registerAll(registry);
      expect(ids).toHaveLength(5);
      expect(registry.size).toBe(5);
    });

    it('should register a hook for PreCommand', () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreCommand);
      expect(hooks.length).toBeGreaterThanOrEqual(1);
      const guidanceHook = hooks.find(h => h.name === 'guidance-gate-pre-command');
      expect(guidanceHook).toBeDefined();
      expect(guidanceHook!.priority).toBe(HookPriority.Critical);
    });

    it('should register a hook for PreToolUse', () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreToolUse);
      const guidanceHook = hooks.find(h => h.name === 'guidance-gate-pre-tool-use');
      expect(guidanceHook).toBeDefined();
      expect(guidanceHook!.priority).toBe(HookPriority.Critical);
    });

    it('should register a hook for PreEdit at High priority', () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreEdit);
      const guidanceHook = hooks.find(h => h.name === 'guidance-gate-pre-edit');
      expect(guidanceHook).toBeDefined();
      expect(guidanceHook!.priority).toBe(HookPriority.High);
    });

    it('should register a hook for PreTask at Normal priority', () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreTask);
      const guidanceHook = hooks.find(h => h.name === 'guidance-retriever-pre-task');
      expect(guidanceHook).toBeDefined();
      expect(guidanceHook!.priority).toBe(HookPriority.Normal);
    });

    it('should register a hook for PostTask at Normal priority', () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PostTask);
      const guidanceHook = hooks.find(h => h.name === 'guidance-ledger-post-task');
      expect(guidanceHook).toBeDefined();
      expect(guidanceHook!.priority).toBe(HookPriority.Normal);
    });
  });

  describe('unregisterAll', () => {
    it('should remove all registered hooks from the registry', () => {
      provider.registerAll(registry);
      expect(registry.size).toBe(5);

      provider.unregisterAll(registry);
      expect(registry.size).toBe(0);
      expect(provider.getHookIds()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // PreCommand hook
  // ==========================================================================

  describe('PreCommand hook', () => {
    it('should block destructive commands', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreCommand);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-command')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreCommand,
        command: { raw: 'rm -rf /' },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(false);
      expect(result.abort).toBe(true);
      expect(result.message).toContain('Destructive operation');
    });

    it('should block git push --force', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreCommand);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-command')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreCommand,
        command: { raw: 'git push origin main --force' },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(false);
      expect(result.abort).toBe(true);
    });

    it('should detect secrets in commands', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreCommand);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-command')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreCommand,
        command: { raw: 'export API_KEY="sk-abc123456789012345678901234567890"' },
      });

      const result = await handler(ctx);
      // Secrets gate fires with 'block'
      expect(result.success).toBe(false);
      expect(result.abort).toBe(true);
    });

    it('should allow safe commands', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreCommand);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-command')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreCommand,
        command: { raw: 'git status' },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(true);
    });

    it('should succeed when no command is provided', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreCommand);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-command')!.handler;

      const ctx = makeHookContext({ event: HookEvent.PreCommand });
      const result = await handler(ctx);
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // PreToolUse hook
  // ==========================================================================

  describe('PreToolUse hook', () => {
    it('should block non-allowlisted tools when allowlist is enabled', async () => {
      const restrictedGates = new EnforcementGates({
        toolAllowlist: true,
        allowedTools: ['Read', 'Write'],
      });
      const restrictedProvider = new GuidanceHookProvider(restrictedGates, retriever, ledger);
      restrictedProvider.registerAll(registry);

      const hooks = registry.getForEvent(HookEvent.PreToolUse);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-tool-use')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreToolUse,
        tool: { name: 'Bash', parameters: {} },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(false);
      expect(result.abort).toBe(true);
    });

    it('should detect secrets in tool parameters', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreToolUse);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-tool-use')!.handler;

      // Use an sk- prefixed key which is detected even through JSON.stringify
      // (the password pattern requires surrounding quotes which get escaped by
      // JSON.stringify in evaluateToolUse, so we use a pattern without quote delimiters)
      const ctx = makeHookContext({
        event: HookEvent.PreToolUse,
        tool: {
          name: 'Write',
          parameters: {
            content: 'const key = sk-abcdefghij0123456789abcdef',
          },
        },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(false);
      expect(result.abort).toBe(true);
    });

    it('should allow safe tool use', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreToolUse);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-tool-use')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreToolUse,
        tool: { name: 'Read', parameters: { path: '/src/main.ts' } },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(true);
    });

    it('should succeed when no tool info is provided', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreToolUse);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-tool-use')!.handler;

      const ctx = makeHookContext({ event: HookEvent.PreToolUse });
      const result = await handler(ctx);
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // PreEdit hook
  // ==========================================================================

  describe('PreEdit hook', () => {
    it('should detect secrets in edit content', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreEdit);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-edit')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreEdit,
        file: { path: '/src/config.ts', operation: 'modify' },
        metadata: {
          content: 'const token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890"',
          diffLines: 5,
        },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(false);
      expect(result.abort).toBe(true);
    });

    it('should warn on large diffs', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreEdit);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-edit')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreEdit,
        file: { path: '/src/main.ts', operation: 'modify' },
        metadata: {
          content: 'const foo = "bar"',
          diffLines: 500,
        },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });

    it('should allow clean small edits', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreEdit);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-edit')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreEdit,
        file: { path: '/src/utils.ts', operation: 'modify' },
        metadata: {
          content: 'export const VERSION = "1.0.0"',
          diffLines: 1,
        },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(true);
    });

    it('should succeed when no file info is provided', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreEdit);
      const handler = hooks.find(h => h.name === 'guidance-gate-pre-edit')!.handler;

      const ctx = makeHookContext({ event: HookEvent.PreEdit });
      const result = await handler(ctx);
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // PreTask hook
  // ==========================================================================

  describe('PreTask hook', () => {
    it('should retrieve shards and classify intent', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreTask);
      const handler = hooks.find(h => h.name === 'guidance-retriever-pre-task')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreTask,
        task: { id: 'task-001', description: 'Fix the authentication bug in login flow' },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as Record<string, unknown>).intent).toBeDefined();
      expect((result.data as Record<string, unknown>).shardCount).toBeDefined();
    });

    it('should classify intent as bug-fix for bug descriptions', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreTask);
      const handler = hooks.find(h => h.name === 'guidance-retriever-pre-task')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreTask,
        task: { id: 'task-002', description: 'Fix broken error handling' },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).intent).toBe('bug-fix');
    });

    it('should classify intent as security for security descriptions', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreTask);
      const handler = hooks.find(h => h.name === 'guidance-retriever-pre-task')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreTask,
        task: { id: 'task-003', description: 'Fix XSS vulnerability in input sanitization' },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).intent).toBe('security');
    });

    it('should create an active run event for the task', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreTask);
      const handler = hooks.find(h => h.name === 'guidance-retriever-pre-task')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreTask,
        task: { id: 'task-004', description: 'Add new feature for user profiles' },
      });

      await handler(ctx);
      const activeRun = provider.getActiveRun('task-004');
      expect(activeRun).toBeDefined();
      expect(activeRun!.taskId).toBe('task-004');
    });

    it('should succeed when task info is missing', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PreTask);
      const handler = hooks.find(h => h.name === 'guidance-retriever-pre-task')!.handler;

      const ctx = makeHookContext({ event: HookEvent.PreTask });
      const result = await handler(ctx);
      expect(result.success).toBe(true);
    });

    it('should gracefully handle retriever without a loaded bundle', async () => {
      const emptyRetriever = new ShardRetriever(new HashEmbeddingProvider());
      const emptyProvider = new GuidanceHookProvider(gates, emptyRetriever, ledger);
      emptyProvider.registerAll(registry);

      const hooks = registry.getForEvent(HookEvent.PreTask);
      // Get the one from emptyProvider (last registered for this event)
      const handler = hooks.find(h => h.name === 'guidance-retriever-pre-task')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PreTask,
        task: { id: 'task-005', description: 'Implement caching layer' },
      });

      const result = await handler(ctx);
      // Should succeed despite retriever not having a bundle
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // PostTask hook
  // ==========================================================================

  describe('PostTask hook', () => {
    it('should finalize a previously created run event', async () => {
      provider.registerAll(registry);

      // First trigger PreTask to create the run event
      const preTaskHooks = registry.getForEvent(HookEvent.PreTask);
      const preTaskHandler = preTaskHooks.find(h => h.name === 'guidance-retriever-pre-task')!.handler;
      await preTaskHandler(makeHookContext({
        event: HookEvent.PreTask,
        task: { id: 'task-010', description: 'Add user dashboard feature' },
      }));

      // Confirm the run event exists
      expect(provider.getActiveRun('task-010')).toBeDefined();

      // Now trigger PostTask
      const postTaskHooks = registry.getForEvent(HookEvent.PostTask);
      const postTaskHandler = postTaskHooks.find(h => h.name === 'guidance-ledger-post-task')!.handler;
      const result = await postTaskHandler(makeHookContext({
        event: HookEvent.PostTask,
        task: { id: 'task-010', description: 'Add user dashboard feature', status: 'completed' },
      }));

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as Record<string, unknown>).taskId).toBe('task-010');

      // Active run should be cleaned up
      expect(provider.getActiveRun('task-010')).toBeUndefined();
    });

    it('should record the event in the ledger', async () => {
      provider.registerAll(registry);

      const initialCount = ledger.eventCount;

      // Create run via PreTask
      const preTaskHooks = registry.getForEvent(HookEvent.PreTask);
      const preTaskHandler = preTaskHooks.find(h => h.name === 'guidance-retriever-pre-task')!.handler;
      await preTaskHandler(makeHookContext({
        event: HookEvent.PreTask,
        task: { id: 'task-011', description: 'Refactor database module' },
      }));

      // Finalize via PostTask
      const postTaskHooks = registry.getForEvent(HookEvent.PostTask);
      const postTaskHandler = postTaskHooks.find(h => h.name === 'guidance-ledger-post-task')!.handler;
      await postTaskHandler(makeHookContext({
        event: HookEvent.PostTask,
        task: { id: 'task-011', description: 'Refactor database module', status: 'completed' },
      }));

      expect(ledger.eventCount).toBe(initialCount + 1);
    });

    it('should handle PostTask without a matching PreTask gracefully', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PostTask);
      const handler = hooks.find(h => h.name === 'guidance-ledger-post-task')!.handler;

      const ctx = makeHookContext({
        event: HookEvent.PostTask,
        task: { id: 'task-unknown', description: 'Unknown task' },
      });

      const result = await handler(ctx);
      expect(result.success).toBe(true);
      expect(result.message).toContain('No active run event');
    });

    it('should succeed when no task info is provided', async () => {
      provider.registerAll(registry);
      const hooks = registry.getForEvent(HookEvent.PostTask);
      const handler = hooks.find(h => h.name === 'guidance-ledger-post-task')!.handler;

      const ctx = makeHookContext({ event: HookEvent.PostTask });
      const result = await handler(ctx);
      expect(result.success).toBe(true);
    });

    it('should populate metadata from context', async () => {
      provider.registerAll(registry);

      // Create run via PreTask
      const preTaskHooks = registry.getForEvent(HookEvent.PreTask);
      const preTaskHandler = preTaskHooks.find(h => h.name === 'guidance-retriever-pre-task')!.handler;
      await preTaskHandler(makeHookContext({
        event: HookEvent.PreTask,
        task: { id: 'task-012', description: 'Add feature with tools' },
      }));

      // Finalize via PostTask with metadata
      const postTaskHooks = registry.getForEvent(HookEvent.PostTask);
      const postTaskHandler = postTaskHooks.find(h => h.name === 'guidance-ledger-post-task')!.handler;
      await postTaskHandler(makeHookContext({
        event: HookEvent.PostTask,
        task: { id: 'task-012', description: 'Add feature with tools', status: 'completed' },
        metadata: {
          toolsUsed: ['Edit', 'Bash'],
          filesTouched: ['/src/main.ts', '/tests/main.test.ts'],
        },
      }));

      // Verify the event was stored with the metadata
      const events = ledger.getEventsByTask('task-012');
      expect(events.length).toBe(1);
      expect(events[0].toolsUsed).toEqual(['Edit', 'Bash']);
      expect(events[0].filesTouched).toEqual(['/src/main.ts', '/tests/main.test.ts']);
      expect(events[0].outcomeAccepted).toBe(true);
    });
  });

  // ==========================================================================
  // createGuidanceHooks factory
  // ==========================================================================

  describe('createGuidanceHooks', () => {
    it('should create a provider without registering when no registry given', () => {
      const result = createGuidanceHooks(gates, retriever, ledger);
      expect(result.provider).toBeInstanceOf(GuidanceHookProvider);
      expect(result.hookIds).toHaveLength(0);
    });

    it('should create and register when registry is given', () => {
      const result = createGuidanceHooks(gates, retriever, ledger, registry);
      expect(result.provider).toBeInstanceOf(GuidanceHookProvider);
      expect(result.hookIds).toHaveLength(5);
      expect(registry.size).toBe(5);
    });
  });
});
