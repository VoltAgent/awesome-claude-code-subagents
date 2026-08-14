/**
 * Tests for ManifestValidator and ConformanceSuite
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ManifestValidator,
  ConformanceSuite,
  createManifestValidator,
  createConformanceSuite,
} from '../src/manifest-validator.js';
import type {
  AgentCellManifest,
  ValidationResult,
  GoldenTrace,
  GoldenTraceEvent,
} from '../src/manifest-validator.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a fully valid manifest. Tests can override specific fields.
 */
function buildValidManifest(overrides?: Partial<AgentCellManifest>): AgentCellManifest {
  const base: AgentCellManifest = {
    apiVersion: 'agentic_cells.v0_1',
    cell: {
      name: 'test-cell',
      purpose: 'Unit testing',
      ownerTenant: 'test-tenant',
      codeRef: {
        kind: 'wasm',
        digest: 'sha256:' + 'a'.repeat(64),
        entry: 'main.wasm',
      },
    },
    lanePolicy: {
      portabilityRequired: false,
      needsNativeThreads: false,
      preferredLane: 'sandboxed',
      maxRiskScore: 50,
    },
    budgets: {
      maxWallClockSeconds: 3600,
      maxToolCalls: 500,
      maxBytesEgress: 1_000_000,
      maxTokensInMtok: 10,
      maxTokensOutMtok: 10,
      maxMemoryWrites: 1000,
    },
    dataPolicy: {
      dataSensitivity: 'internal',
      piiAllowed: false,
      retentionDays: 30,
      exportControls: {
        allowedRegions: ['us-east-1', 'eu-west-1'],
        blockedRegions: ['cn-north-1'],
      },
    },
    toolPolicy: {
      toolsAllowed: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
      networkAllowlist: ['api.example.com'],
      writeActionsRequireConfirmation: true,
    },
    memoryPolicy: {
      namespace: 'test',
      authorityScope: 'self',
      writeMode: 'append',
      requiresCoherenceGate: true,
      requiresAntiHallucinationGate: true,
    },
    observability: {
      traceLevel: 'decisions',
      emitArtifacts: false,
      artifactBucket: '',
    },
  };

  return { ...base, ...overrides };
}

// ============================================================================
// ManifestValidator Tests
// ============================================================================

describe('ManifestValidator', () => {
  let validator: ManifestValidator;

  beforeEach(() => {
    validator = new ManifestValidator();
  });

  // --------------------------------------------------------------------------
  // Valid manifest
  // --------------------------------------------------------------------------

  describe('valid manifest', () => {
    it('should pass validation for a well-formed manifest', () => {
      const manifest = buildValidManifest();
      const result = validator.validate(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.admissionDecision).not.toBe('reject');
      expect(result.laneSelection).not.toBeNull();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should admit a low-risk manifest', () => {
      const manifest = buildValidManifest({
        toolPolicy: {
          toolsAllowed: ['Read', 'Glob'],
          networkAllowlist: [],
          writeActionsRequireConfirmation: true,
        },
        dataPolicy: {
          dataSensitivity: 'public',
          piiAllowed: false,
          retentionDays: 7,
          exportControls: { allowedRegions: ['us-east-1'], blockedRegions: [] },
        },
        memoryPolicy: {
          namespace: 'test',
          authorityScope: 'self',
          writeMode: 'append',
          requiresCoherenceGate: true,
          requiresAntiHallucinationGate: true,
        },
      });

      const result = validator.validate(manifest);

      expect(result.valid).toBe(true);
      expect(result.admissionDecision).toBe('admit');
    });
  });

  // --------------------------------------------------------------------------
  // Missing required fields
  // --------------------------------------------------------------------------

  describe('missing required fields', () => {
    it('should reject when apiVersion is missing', () => {
      const manifest = buildValidManifest();
      (manifest as Record<string, unknown>).apiVersion = undefined;
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.admissionDecision).toBe('reject');
      expect(result.errors.some(e => e.field === 'apiVersion')).toBe(true);
    });

    it('should reject when cell is missing', () => {
      const manifest = buildValidManifest();
      (manifest as Record<string, unknown>).cell = undefined;
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.admissionDecision).toBe('reject');
    });

    it('should reject when cell.name is missing', () => {
      const manifest = buildValidManifest();
      (manifest.cell as Record<string, unknown>).name = '';
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.admissionDecision).toBe('reject');
      expect(result.errors.some(e => e.field === 'cell.name')).toBe(true);
    });

    it('should reject when cell.codeRef is missing', () => {
      const manifest = buildValidManifest();
      (manifest.cell as Record<string, unknown>).codeRef = undefined;
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'cell.codeRef')).toBe(true);
    });

    it('should reject when budgets is missing', () => {
      const manifest = buildValidManifest();
      (manifest as Record<string, unknown>).budgets = undefined;
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.admissionDecision).toBe('reject');
    });

    it('should reject when memoryPolicy.namespace is missing', () => {
      const manifest = buildValidManifest();
      (manifest.memoryPolicy as Record<string, unknown>).namespace = '';
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'memoryPolicy.namespace')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Invalid digest format
  // --------------------------------------------------------------------------

  describe('invalid digest format', () => {
    it('should reject a digest without sha256: prefix', () => {
      const manifest = buildValidManifest();
      manifest.cell.codeRef.digest = 'md5:' + 'a'.repeat(64);
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.admissionDecision).toBe('reject');
      expect(result.errors.some(e => e.code === 'INVALID_DIGEST')).toBe(true);
    });

    it('should reject a digest with wrong length', () => {
      const manifest = buildValidManifest();
      manifest.cell.codeRef.digest = 'sha256:abc123';
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_DIGEST')).toBe(true);
    });

    it('should reject a digest with invalid hex chars', () => {
      const manifest = buildValidManifest();
      manifest.cell.codeRef.digest = 'sha256:' + 'g'.repeat(64);
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_DIGEST')).toBe(true);
    });

    it('should accept a valid sha256 digest', () => {
      const manifest = buildValidManifest();
      manifest.cell.codeRef.digest = 'sha256:' + 'abcdef0123456789'.repeat(4);
      const result = validator.validate(manifest);

      // Digest is valid; other fields too
      const digestErrors = result.errors.filter(e => e.code === 'INVALID_DIGEST');
      expect(digestErrors).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Wildcard in network allowlist
  // --------------------------------------------------------------------------

  describe('wildcard in network allowlist', () => {
    it('should reject wildcard in network allowlist for unprivileged cell', () => {
      const manifest = buildValidManifest({
        toolPolicy: {
          toolsAllowed: ['Read', 'Write'],
          networkAllowlist: ['*'],
          writeActionsRequireConfirmation: true,
        },
      });

      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.admissionDecision).toBe('reject');
      expect(result.errors.some(e => e.code === 'WILDCARD_NETWORK')).toBe(true);
    });

    it('should reject subdomain wildcard for unprivileged cell', () => {
      const manifest = buildValidManifest({
        toolPolicy: {
          toolsAllowed: ['Read'],
          networkAllowlist: ['*.example.com'],
          writeActionsRequireConfirmation: true,
        },
      });

      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'WILDCARD_NETWORK')).toBe(true);
    });

    it('should allow wildcard in network allowlist for privileged cell (has Bash)', () => {
      const manifest = buildValidManifest({
        toolPolicy: {
          toolsAllowed: ['Read', 'Bash'],
          networkAllowlist: ['*'],
          writeActionsRequireConfirmation: true,
        },
      });

      const result = validator.validate(manifest);

      const wildcardErrors = result.errors.filter(e => e.code === 'WILDCARD_NETWORK');
      expect(wildcardErrors).toHaveLength(0);
    });

    it('should allow specific hostnames for any cell', () => {
      const manifest = buildValidManifest({
        toolPolicy: {
          toolsAllowed: ['Read'],
          networkAllowlist: ['api.example.com', 'cdn.example.com'],
          writeActionsRequireConfirmation: true,
        },
      });

      const result = validator.validate(manifest);

      const networkErrors = result.errors.filter(e => e.code === 'WILDCARD_NETWORK');
      expect(networkErrors).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Negative budgets
  // --------------------------------------------------------------------------

  describe('negative budgets', () => {
    it('should reject negative maxWallClockSeconds', () => {
      const manifest = buildValidManifest();
      manifest.budgets.maxWallClockSeconds = -1;
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.admissionDecision).toBe('reject');
      expect(result.errors.some(e => e.code === 'BUDGET_NEGATIVE')).toBe(true);
    });

    it('should reject negative maxToolCalls', () => {
      const manifest = buildValidManifest();
      manifest.budgets.maxToolCalls = -100;
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.code === 'BUDGET_NEGATIVE' && e.field === 'budgets.maxToolCalls'
      )).toBe(true);
    });

    it('should reject negative maxBytesEgress', () => {
      const manifest = buildValidManifest();
      manifest.budgets.maxBytesEgress = -5;
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BUDGET_NEGATIVE')).toBe(true);
    });

    it('should reject budget exceeding maximum limit', () => {
      const manifest = buildValidManifest();
      manifest.budgets.maxWallClockSeconds = 100_000; // exceeds 86400
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BUDGET_EXCEED')).toBe(true);
    });

    it('should accept zero budgets', () => {
      const manifest = buildValidManifest();
      manifest.budgets.maxToolCalls = 0;
      const result = validator.validate(manifest);

      const negativeErrors = result.errors.filter(
        e => e.code === 'BUDGET_NEGATIVE' && e.field === 'budgets.maxToolCalls'
      );
      expect(negativeErrors).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Risk score computation
  // --------------------------------------------------------------------------

  describe('risk score computation', () => {
    it('should compute low risk for read-only, public data cell', () => {
      const manifest = buildValidManifest({
        toolPolicy: {
          toolsAllowed: ['Read', 'Glob'],
          networkAllowlist: [],
          writeActionsRequireConfirmation: true,
        },
        dataPolicy: {
          dataSensitivity: 'public',
          piiAllowed: false,
          retentionDays: 7,
          exportControls: { allowedRegions: ['us-east-1'], blockedRegions: [] },
        },
        memoryPolicy: {
          namespace: 'test',
          authorityScope: 'self',
          writeMode: 'append',
          requiresCoherenceGate: true,
          requiresAntiHallucinationGate: true,
        },
        lanePolicy: {
          portabilityRequired: false,
          needsNativeThreads: false,
          preferredLane: 'wasm',
          maxRiskScore: 50,
        },
      });

      const score = validator.computeRiskScore(manifest);
      expect(score).toBeLessThanOrEqual(15);
    });

    it('should compute high risk for Bash + restricted data + global scope', () => {
      const manifest = buildValidManifest({
        toolPolicy: {
          toolsAllowed: ['Bash', 'Task', 'Write', 'mcp_memory'],
          networkAllowlist: ['*'],
          writeActionsRequireConfirmation: false,
        },
        dataPolicy: {
          dataSensitivity: 'restricted',
          piiAllowed: true,
          retentionDays: 365,
          exportControls: { allowedRegions: [], blockedRegions: [] },
        },
        memoryPolicy: {
          namespace: 'global',
          authorityScope: 'global',
          writeMode: 'overwrite',
          requiresCoherenceGate: false,
          requiresAntiHallucinationGate: false,
        },
        lanePolicy: {
          portabilityRequired: false,
          needsNativeThreads: true,
          preferredLane: 'native',
          maxRiskScore: 100,
        },
      });

      const score = validator.computeRiskScore(manifest);
      expect(score).toBeGreaterThanOrEqual(60);
    });

    it('should cap risk score at 100', () => {
      const manifest = buildValidManifest({
        toolPolicy: {
          toolsAllowed: ['Bash', 'Task', 'Write', 'Edit', 'MultiEdit', 'mcp_memory'],
          networkAllowlist: ['*'],
          writeActionsRequireConfirmation: false,
        },
        dataPolicy: {
          dataSensitivity: 'restricted',
          piiAllowed: true,
          retentionDays: 999,
          exportControls: { allowedRegions: [], blockedRegions: [] },
        },
        memoryPolicy: {
          namespace: 'global',
          authorityScope: 'global',
          writeMode: 'overwrite',
          requiresCoherenceGate: false,
          requiresAntiHallucinationGate: false,
        },
        lanePolicy: {
          portabilityRequired: false,
          needsNativeThreads: true,
          preferredLane: 'native',
          maxRiskScore: 100,
        },
      });

      const score = validator.computeRiskScore(manifest);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should increase risk when write confirmation is disabled', () => {
      const base = buildValidManifest();
      const withConfirm = buildValidManifest({
        toolPolicy: { ...base.toolPolicy, writeActionsRequireConfirmation: true },
      });
      const withoutConfirm = buildValidManifest({
        toolPolicy: { ...base.toolPolicy, writeActionsRequireConfirmation: false },
      });

      const scoreWith = validator.computeRiskScore(withConfirm);
      const scoreWithout = validator.computeRiskScore(withoutConfirm);
      expect(scoreWithout).toBeGreaterThan(scoreWith);
    });
  });

  // --------------------------------------------------------------------------
  // Lane selection
  // --------------------------------------------------------------------------

  describe('lane selection', () => {
    it('should select wasm when portabilityRequired is true', () => {
      const manifest = buildValidManifest({
        lanePolicy: {
          portabilityRequired: true,
          needsNativeThreads: false,
          preferredLane: 'native',
          maxRiskScore: 100,
        },
      });

      const lane = validator.selectLane(manifest, 10);
      expect(lane).toBe('wasm');
    });

    it('should select native when needsNativeThreads and low risk', () => {
      const manifest = buildValidManifest({
        lanePolicy: {
          portabilityRequired: false,
          needsNativeThreads: true,
          preferredLane: 'native',
          maxRiskScore: 100,
        },
      });

      const lane = validator.selectLane(manifest, 20);
      expect(lane).toBe('native');
    });

    it('should downgrade native to sandboxed when risk is high', () => {
      const manifest = buildValidManifest({
        lanePolicy: {
          portabilityRequired: false,
          needsNativeThreads: true,
          preferredLane: 'native',
          maxRiskScore: 100,
        },
      });

      const lane = validator.selectLane(manifest, 60);
      expect(lane).toBe('sandboxed');
    });

    it('should force wasm when risk exceeds maxRiskScore', () => {
      const manifest = buildValidManifest({
        lanePolicy: {
          portabilityRequired: false,
          needsNativeThreads: false,
          preferredLane: 'native',
          maxRiskScore: 40,
        },
      });

      const lane = validator.selectLane(manifest, 50);
      expect(lane).toBe('wasm');
    });

    it('should respect preferredLane at low risk', () => {
      const manifest = buildValidManifest({
        lanePolicy: {
          portabilityRequired: false,
          needsNativeThreads: false,
          preferredLane: 'sandboxed',
          maxRiskScore: 100,
        },
      });

      const lane = validator.selectLane(manifest, 15);
      expect(lane).toBe('sandboxed');
    });

    it('should force wasm at very high risk regardless of preference', () => {
      const manifest = buildValidManifest({
        lanePolicy: {
          portabilityRequired: false,
          needsNativeThreads: false,
          preferredLane: 'native',
          maxRiskScore: 100,
        },
      });

      const lane = validator.selectLane(manifest, 75);
      expect(lane).toBe('wasm');
    });
  });

  // --------------------------------------------------------------------------
  // Data policy validation
  // --------------------------------------------------------------------------

  describe('data policy validation', () => {
    it('should reject invalid dataSensitivity value', () => {
      const manifest = buildValidManifest();
      (manifest.dataPolicy as Record<string, unknown>).dataSensitivity = 'top-secret';
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ENUM')).toBe(true);
    });

    it('should reject negative retentionDays', () => {
      const manifest = buildValidManifest();
      manifest.dataPolicy.retentionDays = -1;
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'dataPolicy.retentionDays')).toBe(true);
    });

    it('should reject when allowed and blocked regions overlap', () => {
      const manifest = buildValidManifest({
        dataPolicy: {
          dataSensitivity: 'internal',
          piiAllowed: false,
          retentionDays: 30,
          exportControls: {
            allowedRegions: ['us-east-1', 'eu-west-1'],
            blockedRegions: ['eu-west-1'],
          },
        },
      });

      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'REGION_CONFLICT')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // API version validation
  // --------------------------------------------------------------------------

  describe('API version validation', () => {
    it('should reject unsupported API version', () => {
      const manifest = buildValidManifest();
      manifest.apiVersion = 'agentic_cells.v2_0';
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'UNSUPPORTED_API_VERSION')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Warnings (non-blocking)
  // --------------------------------------------------------------------------

  describe('warnings', () => {
    it('should warn about unknown tools', () => {
      const manifest = buildValidManifest({
        toolPolicy: {
          toolsAllowed: ['Read', 'CustomTool'],
          networkAllowlist: [],
          writeActionsRequireConfirmation: true,
        },
      });

      const result = validator.validate(manifest);

      expect(result.warnings.some(w => w.code === 'UNKNOWN_TOOL')).toBe(true);
      // Warnings do not cause rejection
      expect(result.valid).toBe(true);
    });

    it('should warn when both memory gates are disabled', () => {
      const manifest = buildValidManifest({
        memoryPolicy: {
          namespace: 'test',
          authorityScope: 'self',
          writeMode: 'append',
          requiresCoherenceGate: false,
          requiresAntiHallucinationGate: false,
        },
      });

      const result = validator.validate(manifest);

      expect(result.warnings.some(w => w.code === 'NO_MEMORY_GATES')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Fail-closed behavior
  // --------------------------------------------------------------------------

  describe('fail-closed behavior', () => {
    it('should reject on any single validation error', () => {
      const manifest = buildValidManifest();
      manifest.budgets.maxToolCalls = -1;
      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.admissionDecision).toBe('reject');
      expect(result.laneSelection).toBeNull();
    });

    it('should still compute risk score even when rejecting', () => {
      const manifest = buildValidManifest();
      manifest.budgets.maxToolCalls = -1;
      const result = validator.validate(manifest);

      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // Factory functions
  // --------------------------------------------------------------------------

  describe('factory functions', () => {
    it('createManifestValidator should return a working instance', () => {
      const v = createManifestValidator();
      const manifest = buildValidManifest();
      const result = v.validate(manifest);
      expect(result.valid).toBe(true);
    });

    it('createManifestValidator should accept custom thresholds', () => {
      const v = createManifestValidator({ admitThreshold: 10, rejectThreshold: 20 });
      const manifest = buildValidManifest();
      const result = v.validate(manifest);
      // With very tight thresholds, a non-trivial manifest may be in review
      expect(['admit', 'review', 'reject']).toContain(result.admissionDecision);
    });
  });
});

// ============================================================================
// ConformanceSuite Tests
// ============================================================================

describe('ConformanceSuite', () => {
  let suite: ConformanceSuite;

  beforeEach(() => {
    suite = new ConformanceSuite();
  });

  // --------------------------------------------------------------------------
  // Trace management
  // --------------------------------------------------------------------------

  describe('trace management', () => {
    it('should start with no traces', () => {
      expect(suite.getTraces()).toHaveLength(0);
    });

    it('should add traces', () => {
      const trace: GoldenTrace = {
        traceId: 'test-1',
        name: 'Test Trace',
        description: 'A test trace',
        events: [
          { seq: 1, eventType: 'command', payload: { command: 'ls' }, expectedOutcome: 'allow' },
        ],
        expectedDecisions: { '1': 'allow' },
        expectedMemoryLineage: {},
      };

      suite.addTrace(trace);
      expect(suite.getTraces()).toHaveLength(1);
      expect(suite.getTraces()[0].traceId).toBe('test-1');
    });

    it('should return copies from getTraces', () => {
      suite.addTrace({
        traceId: 'test-1',
        name: 'Test',
        description: 'Test',
        events: [],
        expectedDecisions: {},
        expectedMemoryLineage: {},
      });

      const traces = suite.getTraces();
      traces.pop();
      expect(suite.getTraces()).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Conformance with matching golden traces
  // --------------------------------------------------------------------------

  describe('conformance with matching traces', () => {
    it('should pass when all decisions match expectations', () => {
      suite.addTrace({
        traceId: 'pass-trace',
        name: 'All pass',
        description: 'Every event matches',
        events: [
          { seq: 1, eventType: 'command', payload: { command: 'ls' }, expectedOutcome: 'allow' },
          { seq: 2, eventType: 'command', payload: { command: 'rm -rf /' }, expectedOutcome: 'deny' },
          { seq: 3, eventType: 'tool-use', payload: { tool: 'Read' }, expectedOutcome: 'allow' },
        ],
        expectedDecisions: { '1': 'allow', '2': 'deny', '3': 'allow' },
        expectedMemoryLineage: {},
      });

      const evaluator = (event: GoldenTraceEvent) => {
        if (event.payload.command === 'rm -rf /') {
          return { decision: 'deny', details: { reason: 'destructive' } };
        }
        return { decision: 'allow', details: null };
      };

      const result = suite.run(evaluator);

      expect(result.passed).toBe(true);
      expect(result.totalEvents).toBe(3);
      expect(result.matchedEvents).toBe(3);
      expect(result.mismatches).toHaveLength(0);
    });

    it('should pass with zero events', () => {
      suite.addTrace({
        traceId: 'empty',
        name: 'Empty trace',
        description: 'No events',
        events: [],
        expectedDecisions: {},
        expectedMemoryLineage: {},
      });

      const result = suite.run(() => ({ decision: 'allow', details: null }));

      expect(result.passed).toBe(true);
      expect(result.totalEvents).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Conformance detects mismatches
  // --------------------------------------------------------------------------

  describe('conformance detects mismatches', () => {
    it('should report mismatches when decisions differ from expectations', () => {
      suite.addTrace({
        traceId: 'mismatch-trace',
        name: 'Mismatch test',
        description: 'Second event should fail',
        events: [
          { seq: 1, eventType: 'command', payload: { command: 'ls' }, expectedOutcome: 'allow' },
          { seq: 2, eventType: 'command', payload: { command: 'rm -rf /' }, expectedOutcome: 'deny' },
        ],
        expectedDecisions: { '1': 'allow', '2': 'deny' },
        expectedMemoryLineage: {},
      });

      // Evaluator incorrectly allows everything
      const evaluator = () => ({ decision: 'allow', details: null });

      const result = suite.run(evaluator);

      expect(result.passed).toBe(false);
      expect(result.totalEvents).toBe(2);
      expect(result.matchedEvents).toBe(1);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].traceId).toBe('mismatch-trace');
      expect(result.mismatches[0].seq).toBe(2);
      expect(result.mismatches[0].expected).toBe('deny');
      expect(result.mismatches[0].actual).toBe('allow');
    });

    it('should report multiple mismatches across traces', () => {
      suite.addTrace({
        traceId: 'trace-a',
        name: 'Trace A',
        description: 'First trace',
        events: [
          { seq: 1, eventType: 'command', payload: {}, expectedOutcome: 'deny' },
        ],
        expectedDecisions: { '1': 'deny' },
        expectedMemoryLineage: {},
      });

      suite.addTrace({
        traceId: 'trace-b',
        name: 'Trace B',
        description: 'Second trace',
        events: [
          { seq: 1, eventType: 'command', payload: {}, expectedOutcome: 'deny' },
        ],
        expectedDecisions: { '1': 'deny' },
        expectedMemoryLineage: {},
      });

      const result = suite.run(() => ({ decision: 'allow', details: null }));

      expect(result.passed).toBe(false);
      expect(result.mismatches).toHaveLength(2);
      expect(result.mismatches[0].traceId).toBe('trace-a');
      expect(result.mismatches[1].traceId).toBe('trace-b');
    });

    it('should use expectedDecisions over expectedOutcome when both present', () => {
      suite.addTrace({
        traceId: 'override',
        name: 'Override test',
        description: 'expectedDecisions takes precedence',
        events: [
          { seq: 1, eventType: 'command', payload: {}, expectedOutcome: 'allow' },
        ],
        expectedDecisions: { '1': 'deny' }, // overrides expectedOutcome
        expectedMemoryLineage: {},
      });

      const result = suite.run(() => ({ decision: 'allow', details: null }));

      expect(result.passed).toBe(false);
      expect(result.mismatches[0].expected).toBe('deny');
    });
  });

  // --------------------------------------------------------------------------
  // Default traces
  // --------------------------------------------------------------------------

  describe('default traces', () => {
    it('should create 5 default traces', () => {
      const defaults = suite.createDefaultTraces();
      expect(defaults).toHaveLength(5);
    });

    it('should have unique trace IDs', () => {
      const defaults = suite.createDefaultTraces();
      const ids = defaults.map(t => t.traceId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should include destructive command trace', () => {
      const defaults = suite.createDefaultTraces();
      const destructive = defaults.find(t => t.traceId === 'default-destructive-blocked');
      expect(destructive).toBeDefined();
      expect(destructive!.events.length).toBeGreaterThan(0);
      for (const event of destructive!.events) {
        expect(event.expectedOutcome).toBe('deny');
      }
    });

    it('should include secret blocked trace', () => {
      const defaults = suite.createDefaultTraces();
      const secret = defaults.find(t => t.traceId === 'default-secret-blocked');
      expect(secret).toBeDefined();
      expect(secret!.events.every(e => e.expectedOutcome === 'deny')).toBe(true);
    });

    it('should include budget exceeded trace', () => {
      const defaults = suite.createDefaultTraces();
      const budget = defaults.find(t => t.traceId === 'default-budget-exceeded');
      expect(budget).toBeDefined();
      expect(budget!.events.every(e => e.expectedOutcome === 'deny')).toBe(true);
    });

    it('should include memory no-evidence trace', () => {
      const defaults = suite.createDefaultTraces();
      const memory = defaults.find(t => t.traceId === 'default-memory-no-evidence');
      expect(memory).toBeDefined();
      expect(memory!.events.every(e => e.expectedOutcome === 'deny')).toBe(true);
      expect(Object.keys(memory!.expectedMemoryLineage).length).toBeGreaterThan(0);
    });

    it('should include valid-allowed trace', () => {
      const defaults = suite.createDefaultTraces();
      const valid = defaults.find(t => t.traceId === 'default-valid-allowed');
      expect(valid).toBeDefined();
      expect(valid!.events.every(e => e.expectedOutcome === 'allow')).toBe(true);
    });

    it('should pass when evaluator returns correct decisions for default traces', () => {
      const defaults = suite.createDefaultTraces();
      for (const trace of defaults) {
        suite.addTrace(trace);
      }

      // Build an evaluator that returns what the traces expect
      const evaluator = (event: GoldenTraceEvent) => {
        return { decision: event.expectedOutcome, details: null };
      };

      const result = suite.run(evaluator);

      expect(result.passed).toBe(true);
      expect(result.totalEvents).toBeGreaterThan(0);
      expect(result.mismatches).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Factory function
  // --------------------------------------------------------------------------

  describe('createConformanceSuite factory', () => {
    it('should create empty suite by default', () => {
      const s = createConformanceSuite();
      expect(s.getTraces()).toHaveLength(0);
    });

    it('should create suite with default traces when option is set', () => {
      const s = createConformanceSuite({ includeDefaults: true });
      expect(s.getTraces()).toHaveLength(5);
    });
  });
});
