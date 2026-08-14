/**
 * Tests for Enforcement Gates
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EnforcementGates } from '../src/gates.js';

describe('EnforcementGates', () => {
  let gates: EnforcementGates;

  beforeEach(() => {
    gates = new EnforcementGates();
  });

  describe('evaluateDestructiveOps', () => {
    it('should block rm -rf commands', () => {
      const result = gates.evaluateDestructiveOps('rm -rf /tmp/data');
      expect(result).not.toBeNull();
      expect(result!.decision).toBe('require-confirmation');
      expect(result!.gateName).toBe('destructive-ops');
    });

    it('should block DROP DATABASE', () => {
      const result = gates.evaluateDestructiveOps('DROP DATABASE production');
      expect(result).not.toBeNull();
      expect(result!.decision).toBe('require-confirmation');
    });

    it('should block git push --force', () => {
      const result = gates.evaluateDestructiveOps('git push origin main --force');
      expect(result).not.toBeNull();
      expect(result!.decision).toBe('require-confirmation');
    });

    it('should block git reset --hard', () => {
      const result = gates.evaluateDestructiveOps('git reset --hard HEAD~3');
      expect(result).not.toBeNull();
      expect(result!.decision).toBe('require-confirmation');
    });

    it('should block TRUNCATE TABLE', () => {
      const result = gates.evaluateDestructiveOps('TRUNCATE TABLE users');
      expect(result).not.toBeNull();
    });

    it('should block kubectl delete namespace', () => {
      const result = gates.evaluateDestructiveOps('kubectl delete namespace production');
      expect(result).not.toBeNull();
    });

    it('should allow safe commands', () => {
      const result = gates.evaluateDestructiveOps('git status');
      expect(result).toBeNull();
    });

    it('should allow git push without force', () => {
      const result = gates.evaluateDestructiveOps('git push origin feature-branch');
      expect(result).toBeNull();
    });

    it('should allow SELECT queries', () => {
      const result = gates.evaluateDestructiveOps('SELECT * FROM users WHERE id = 1');
      expect(result).toBeNull();
    });

    it('should provide remediation advice', () => {
      const result = gates.evaluateDestructiveOps('rm -rf dist/');
      expect(result!.remediation).toBeDefined();
      expect(result!.remediation).toContain('rollback');
    });
  });

  describe('evaluateToolAllowlist', () => {
    it('should block non-allowlisted tools', () => {
      const gatesWithAllowlist = new EnforcementGates({
        toolAllowlist: true,
        allowedTools: ['Read', 'Write', 'Edit'],
      });

      const result = gatesWithAllowlist.evaluateToolAllowlist('Bash');
      expect(result).not.toBeNull();
      expect(result!.decision).toBe('block');
    });

    it('should allow allowlisted tools', () => {
      const gatesWithAllowlist = new EnforcementGates({
        toolAllowlist: true,
        allowedTools: ['Read', 'Write', 'Edit'],
      });

      const result = gatesWithAllowlist.evaluateToolAllowlist('Read');
      expect(result).toBeNull();
    });

    it('should support wildcard allowlist', () => {
      const gatesWithAllowlist = new EnforcementGates({
        toolAllowlist: true,
        allowedTools: ['Read', 'mcp_*'],
      });

      const result = gatesWithAllowlist.evaluateToolAllowlist('mcp_memory');
      expect(result).toBeNull();
    });

    it('should return null when allowlist is disabled', () => {
      const result = gates.evaluateToolAllowlist('AnyTool');
      expect(result).toBeNull();
    });
  });

  describe('evaluateDiffSize', () => {
    it('should warn when diff exceeds threshold', () => {
      const result = gates.evaluateDiffSize('src/main.ts', 500);
      expect(result).not.toBeNull();
      expect(result!.decision).toBe('warn');
      expect(result!.gateName).toBe('diff-size');
    });

    it('should allow small diffs', () => {
      const result = gates.evaluateDiffSize('src/main.ts', 50);
      expect(result).toBeNull();
    });

    it('should respect custom threshold', () => {
      const customGates = new EnforcementGates({ diffSizeThreshold: 100 });
      const result = customGates.evaluateDiffSize('src/main.ts', 150);
      expect(result).not.toBeNull();
    });

    it('should provide staging advice in remediation', () => {
      const result = gates.evaluateDiffSize('src/main.ts', 500);
      expect(result!.remediation).toContain('Stage changes incrementally');
    });
  });

  describe('evaluateSecrets', () => {
    it('should detect API keys', () => {
      const result = gates.evaluateSecrets('const apiKey = "sk-abc123456789012345678901234567890"');
      expect(result).not.toBeNull();
      expect(result!.decision).toBe('block');
      expect(result!.gateName).toBe('secrets');
    });

    it('should detect passwords', () => {
      const result = gates.evaluateSecrets('password = "mySecretPass123"');
      expect(result).not.toBeNull();
      expect(result!.decision).toBe('block');
    });

    it('should detect private keys', () => {
      const result = gates.evaluateSecrets('-----BEGIN RSA PRIVATE KEY-----');
      expect(result).not.toBeNull();
    });

    it('should detect GitHub tokens', () => {
      const result = gates.evaluateSecrets('token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890"');
      expect(result).not.toBeNull();
    });

    it('should detect AWS keys', () => {
      const result = gates.evaluateSecrets('AKIAIOSFODNN7EXAMPLE');
      expect(result).not.toBeNull();
    });

    it('should allow clean content', () => {
      const result = gates.evaluateSecrets('const greeting = "hello world"');
      expect(result).toBeNull();
    });

    it('should allow env var references', () => {
      const result = gates.evaluateSecrets('const key = process.env.API_KEY');
      expect(result).toBeNull();
    });

    it('should provide redacted output in metadata', () => {
      const result = gates.evaluateSecrets('api_key = "sk-verylongsecretkeythatshouldberedacted"');
      if (result) {
        const redacted = result.metadata?.redactedSecrets as string[];
        expect(redacted).toBeDefined();
        // Redacted secrets should not contain the full secret
        for (const r of redacted) {
          expect(r).toContain('*');
        }
      }
    });
  });

  describe('evaluateCommand (aggregate)', () => {
    it('should return multiple gate results for complex commands', () => {
      const results = gates.evaluateCommand('rm -rf / && echo "password=hunter2"');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty for safe commands', () => {
      const results = gates.evaluateCommand('ls -la');
      expect(results.length).toBe(0);
    });
  });

  describe('aggregateDecision', () => {
    it('should return allow for no results', () => {
      expect(gates.aggregateDecision([])).toBe('allow');
    });

    it('should return the most restrictive decision', () => {
      const results = [
        { decision: 'warn' as const, gateName: 'a', reason: '', triggeredRules: [] },
        { decision: 'block' as const, gateName: 'b', reason: '', triggeredRules: [] },
        { decision: 'allow' as const, gateName: 'c', reason: '', triggeredRules: [] },
      ];

      expect(gates.aggregateDecision(results)).toBe('block');
    });
  });

  describe('getActiveGateCount', () => {
    it('should count enabled gates', () => {
      // Default has destructiveOps, diffSize, secrets enabled (not toolAllowlist)
      expect(gates.getActiveGateCount()).toBe(3);
    });

    it('should count all gates when all enabled', () => {
      const allGates = new EnforcementGates({
        destructiveOps: true,
        toolAllowlist: true,
        diffSize: true,
        secrets: true,
        allowedTools: ['Read'],
      });
      expect(allGates.getActiveGateCount()).toBe(4);
    });
  });
});
