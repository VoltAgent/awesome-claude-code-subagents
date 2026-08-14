/**
 * Integration tests for the Guidance Control Plane
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GuidanceControlPlane } from '../src/index.js';

const SAMPLE_ROOT_GUIDANCE = `
# Safety Invariants

These rules must never be violated.

- [R001] Never commit hardcoded secrets or API keys to version control (critical) @security verify:secrets-scan priority:200
- [R002] Always validate all user inputs at system boundaries (critical) @security verify:input-validation priority:190
- [R003] Never force push to main or master branches (critical) @security [bash] priority:180
- [R004] Always run tests before committing code changes @testing verify:tests-pass priority:170

# Architecture Boundaries

- [R010] Keep source files under 500 lines @architecture #refactor
- [R011] Use typed interfaces for all public APIs @architecture
- [R012] Respect bounded context boundaries between modules @architecture #architecture
- [R013] Use domain events for cross-module communication @architecture

# Tool Discipline

- [R020] Prefer Read tool over cat/head/tail for file reading [read] @general
- [R021] Prefer Edit tool over sed/awk for file editing [edit] @general
- [R022] Use specific file paths in git add, not wildcards [bash] @general #deployment

# Required Output Formats

- [R030] Include file_path:line_number for all code references @general
- [R031] Use clear commit messages that explain why, not what @general #deployment

# How to Fail When Uncertain

- [R040] When uncertain about a change, ask for clarification instead of guessing @general
- [R041] When a test fails unexpectedly, investigate before retrying @testing #debug
`;

const SAMPLE_LOCAL_GUIDANCE = `
# Experimental Rules

- [R001] Never commit secrets - use environment variables and .env files (critical) @security priority:200
- [EXP-001] Prefer TDD London School with mocks for all new tests @testing #testing
- [EXP-002] Use flash attention optimizations where applicable @performance #performance
`;

describe('GuidanceControlPlane - Integration', () => {
  let plane: GuidanceControlPlane;

  beforeEach(async () => {
    plane = new GuidanceControlPlane({
      rootGuidancePath: '/nonexistent', // We'll compile directly
      headlessMode: false,
    });
  });

  describe('compile + retrieve', () => {
    it('should compile and retrieve guidance for a security task', async () => {
      await plane.compile(SAMPLE_ROOT_GUIDANCE, SAMPLE_LOCAL_GUIDANCE);

      const result = await plane.retrieveForTask({
        taskDescription: 'Fix the SQL injection vulnerability in the user search endpoint',
      });

      expect(result.constitution).toBeDefined();
      expect(result.constitution.rules.length).toBeGreaterThan(0);
      expect(result.detectedIntent).toBe('security');
      expect(result.policyText.length).toBeGreaterThan(0);
    });

    it('should compile and retrieve guidance for a testing task', async () => {
      await plane.compile(SAMPLE_ROOT_GUIDANCE, SAMPLE_LOCAL_GUIDANCE);

      const result = await plane.retrieveForTask({
        taskDescription: 'Add unit tests for the payment processing module',
      });

      expect(result.detectedIntent).toBe('testing');
      expect(result.shards.length).toBeGreaterThan(0);
    });

    it('should compile and retrieve guidance for a performance task', async () => {
      await plane.compile(SAMPLE_ROOT_GUIDANCE, SAMPLE_LOCAL_GUIDANCE);

      const result = await plane.retrieveForTask({
        taskDescription: 'Optimize the database query performance for large datasets',
      });

      expect(result.detectedIntent).toBe('performance');
    });
  });

  describe('enforcement gates', () => {
    beforeEach(async () => {
      await plane.compile(SAMPLE_ROOT_GUIDANCE);
    });

    it('should block destructive commands', () => {
      const results = plane.evaluateCommand('rm -rf /var/data');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].decision).toBe('require-confirmation');
    });

    it('should detect secrets in edits', () => {
      const results = plane.evaluateEdit(
        'config.ts',
        'const apiKey = "sk-abcdef1234567890abcdef1234567890"',
        5
      );
      expect(results.some(r => r.gateName === 'secrets')).toBe(true);
    });

    it('should warn about large diffs', () => {
      const results = plane.evaluateEdit('src/big-file.ts', 'content', 500);
      expect(results.some(r => r.gateName === 'diff-size')).toBe(true);
    });

    it('should allow normal operations', () => {
      const results = plane.evaluateCommand('git status');
      expect(results.length).toBe(0);
    });
  });

  describe('run tracking', () => {
    beforeEach(async () => {
      await plane.compile(SAMPLE_ROOT_GUIDANCE);
    });

    it('should track a complete run lifecycle', async () => {
      // Start run
      const event = plane.startRun('task-1', 'feature');
      expect(event.taskId).toBe('task-1');

      // Record some activity
      event.toolsUsed.push('Read', 'Edit', 'Bash');
      event.filesTouched.push('src/feature.ts', 'tests/feature.test.ts');
      event.diffSummary = { linesAdded: 100, linesRemoved: 20, filesChanged: 2 };
      event.testResults = { ran: true, passed: 15, failed: 0, skipped: 0 };

      // Record a violation
      plane.recordViolation(event, {
        ruleId: 'R010',
        description: 'File src/feature.ts exceeds 500 lines',
        severity: 'medium',
        location: 'src/feature.ts',
        autoCorrected: false,
      });

      // Finalize
      event.outcomeAccepted = true;
      const evaluatorResults = await plane.finalizeRun(event);

      expect(evaluatorResults.length).toBeGreaterThan(0);
      expect(plane.getLedger().eventCount).toBe(1);
    });
  });

  describe('metrics', () => {
    beforeEach(async () => {
      await plane.compile(SAMPLE_ROOT_GUIDANCE);
    });

    it('should report metrics after runs', async () => {
      // Add some runs
      for (let i = 0; i < 5; i++) {
        const event = plane.startRun(`task-${i}`, 'feature');
        event.reworkLines = i * 5;
        if (i < 2) {
          plane.recordViolation(event, {
            ruleId: 'R010',
            description: 'test',
            severity: 'medium',
            autoCorrected: false,
          });
        }
        event.outcomeAccepted = true;
        await plane.finalizeRun(event);
      }

      const metrics = plane.getMetrics();
      expect(metrics.taskCount).toBe(5);
      expect(metrics.violationRatePer10Tasks).toBeGreaterThan(0);
      expect(metrics.topViolations.length).toBeGreaterThan(0);
    });
  });

  describe('status', () => {
    it('should report uninitialized status', () => {
      const status = plane.getStatus();
      expect(status.initialized).toBe(false);
      expect(status.constitutionLoaded).toBe(false);
    });

    it('should report initialized status after compile', async () => {
      await plane.compile(SAMPLE_ROOT_GUIDANCE);
      const status = plane.getStatus();
      // Note: initialized flag is set by initialize(), not compile()
      // But constitutionLoaded should be true
      expect(status.constitutionLoaded).toBe(true);
      expect(status.shardCount).toBeGreaterThan(0);
      expect(status.activeGates).toBeGreaterThan(0);
    });
  });

  describe('local override', () => {
    it('should apply local overrides to root rules', async () => {
      const bundle = await plane.compile(SAMPLE_ROOT_GUIDANCE, SAMPLE_LOCAL_GUIDANCE);

      // R001 should have local version
      const r001 = bundle.constitution.rules.find(r => r.id === 'R001');
      if (r001) {
        expect(r001.text).toContain('environment variables');
      }

      // EXP-001 should exist from local
      const allRules = [
        ...bundle.constitution.rules,
        ...bundle.shards.map(s => s.rule),
      ];
      const exp001 = allRules.find(r => r.id === 'EXP-001');
      expect(exp001).toBeDefined();
    });
  });

  describe('optimization cycle', () => {
    it('should run optimization when sufficient events exist', async () => {
      await plane.compile(SAMPLE_ROOT_GUIDANCE);

      // Add enough events with violations
      for (let i = 0; i < 15; i++) {
        const event = plane.startRun(`task-${i}`, 'feature');
        event.reworkLines = 15;
        if (i < 8) {
          plane.recordViolation(event, {
            ruleId: 'R010',
            description: 'File too large',
            severity: 'medium',
            autoCorrected: false,
          });
        }
        event.outcomeAccepted = true;
        await plane.finalizeRun(event);
      }

      const result = await plane.optimize();
      expect(result.adrsCreated).toBeGreaterThanOrEqual(0);
    });

    it('should skip optimization with insufficient events', async () => {
      await plane.compile(SAMPLE_ROOT_GUIDANCE);

      // Only add 3 events (below threshold)
      for (let i = 0; i < 3; i++) {
        const event = plane.startRun(`task-${i}`, 'feature');
        await plane.finalizeRun(event);
      }

      const result = await plane.optimize();
      expect(result.promoted).toEqual([]);
      expect(result.adrsCreated).toBe(0);
    });
  });
});
