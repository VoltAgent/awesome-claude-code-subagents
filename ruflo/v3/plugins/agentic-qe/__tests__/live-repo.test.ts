/**
 * Live Repo Integration Tests
 *
 * Tests the agentic-qe tool handlers against real files in the ruflo repository.
 * Each test imports the actual handler, calls it with real paths, and validates
 * the response structure and content.
 */

import { describe, it, expect } from 'vitest';
import { handler as securityScanHandler } from '../src/tools/security-compliance/security-scan';
import { handler as analyzeCoverageHandler } from '../src/tools/coverage-analysis/analyze-coverage';
import { handler as generateTestsHandler } from '../src/tools/test-generation/generate-tests';
import { handler as chaosInjectHandler } from '../src/tools/chaos-resilience/chaos-inject';

// Minimal tool context that returns undefined for all lookups
// (matches the ToolContext interface: { get<T>(key: string): T | undefined })
const emptyContext = { get: () => undefined };

describe('Live Repo: security-scan', () => {
  it('should scan github-tools.ts and return findings with expected structure', async () => {
    const response = await securityScanHandler(
      {
        targetPath: 'v3/@claude-flow/cli/src/mcp-tools/github-tools.ts',
        scanType: 'sast',
        compliance: ['owasp-top-10'],
        severity: 'all',
        includeRemediation: true,
        scanDepth: 'standard',
        excludePatterns: ['node_modules', 'dist'],
      },
      emptyContext,
    );

    // Response envelope: content array with text entries
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0]).toHaveProperty('type', 'text');
    expect(response.content[0]).toHaveProperty('text');

    // Parse the JSON payload
    const text = response.content[0].text;
    expect(text.length).toBeGreaterThan(0);
    const result = JSON.parse(text);

    // Top-level fields
    expect(result.success).toBe(true);
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('complianceResults');
    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('recommendations');
    expect(result).toHaveProperty('metadata');

    // Summary fields
    expect(typeof result.summary.totalFindings).toBe('number');
    expect(result.summary.totalFindings).toBeGreaterThan(0);
    expect(typeof result.summary.riskScore).toBe('number');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.summary.grade);

    // At least one finding should exist (SAST on a file with execSync)
    expect(result.findings.length).toBeGreaterThan(0);
    const finding = result.findings[0];
    expect(finding).toHaveProperty('id');
    expect(finding).toHaveProperty('title');
    expect(finding).toHaveProperty('severity');
    expect(finding).toHaveProperty('category');
    expect(finding).toHaveProperty('location');
    expect(finding.location).toHaveProperty('file');
    expect(finding.location).toHaveProperty('startLine');

    // Remediation should be present since we requested it
    const findingsWithRemediation = result.findings.filter(
      (f: { remediation?: unknown }) => f.remediation,
    );
    expect(findingsWithRemediation.length).toBeGreaterThan(0);

    // Compliance results
    expect(result.complianceResults.length).toBeGreaterThan(0);
    expect(result.complianceResults[0]).toHaveProperty('framework', 'owasp-top-10');
    expect(result.complianceResults[0]).toHaveProperty('score');
    expect(result.complianceResults[0]).toHaveProperty('status');

    // Metadata
    expect(result.metadata).toHaveProperty('scanType', 'sast');
    expect(result.metadata).toHaveProperty('durationMs');
    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata).toHaveProperty('engineVersion');
  });

  it('should filter by severity when set to critical', async () => {
    const response = await securityScanHandler(
      {
        targetPath: 'v3/@claude-flow/cli/src/mcp-tools/github-tools.ts',
        scanType: 'sast',
        compliance: ['owasp-top-10'],
        severity: 'critical',
        includeRemediation: false,
        scanDepth: 'quick',
        excludePatterns: ['node_modules'],
      },
      emptyContext,
    );

    const result = JSON.parse(response.content[0].text);
    expect(result.success).toBe(true);

    // All findings should be critical severity
    for (const finding of result.findings) {
      expect(finding.severity).toBe('critical');
    }
  });
});

describe('Live Repo: analyze-coverage', () => {
  it('should analyze the mcp-tools directory and return coverage data', async () => {
    const response = await analyzeCoverageHandler(
      {
        targetPath: 'v3/@claude-flow/cli/src/mcp-tools',
        algorithm: 'johnson-lindenstrauss',
        prioritize: true,
        includeFileDetails: true,
        projectionDimension: 32,
      },
      emptyContext,
    );

    // Response envelope
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0]).toHaveProperty('type', 'text');

    // Parse the JSON payload
    const text = response.content[0].text;
    expect(text.length).toBeGreaterThan(0);
    const result = JSON.parse(text);

    // Top-level fields
    expect(result.success).toBe(true);
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('gaps');
    expect(result).toHaveProperty('files');
    expect(result).toHaveProperty('thresholdResults');
    expect(result).toHaveProperty('algorithm');
    expect(result).toHaveProperty('metadata');

    // Summary has coverage metrics
    expect(result.summary).toHaveProperty('lines');
    expect(result.summary.lines).toHaveProperty('covered');
    expect(result.summary.lines).toHaveProperty('total');
    expect(result.summary.lines).toHaveProperty('percentage');
    expect(result.summary).toHaveProperty('branches');
    expect(result.summary).toHaveProperty('functions');
    expect(result.summary).toHaveProperty('overall');
    expect(typeof result.summary.overall).toBe('number');

    // Gaps should exist
    expect(Array.isArray(result.gaps)).toBe(true);
    expect(result.gaps.length).toBeGreaterThan(0);
    const gap = result.gaps[0];
    expect(gap).toHaveProperty('id');
    expect(gap).toHaveProperty('type');
    expect(gap).toHaveProperty('file');
    expect(gap).toHaveProperty('location');
    expect(gap).toHaveProperty('risk');
    expect(gap).toHaveProperty('suggestions');

    // File details should be present since includeFileDetails: true
    expect(result.files.length).toBeGreaterThan(0);
    const file = result.files[0];
    expect(file).toHaveProperty('path');
    expect(file).toHaveProperty('lines');
    expect(file).toHaveProperty('branches');
    expect(file).toHaveProperty('functions');
    expect(file).toHaveProperty('complexity');

    // Algorithm info for JL
    expect(result.algorithm.name).toBe('johnson-lindenstrauss');
    expect(result.algorithm.complexity).toBe('O(log n)');
    expect(result.algorithm.projectionDimension).toBe(32);
    expect(result.algorithm.speedup).toBeGreaterThan(1);

    // Threshold results
    expect(result.thresholdResults.length).toBeGreaterThan(0);
    for (const threshold of result.thresholdResults) {
      expect(threshold).toHaveProperty('metric');
      expect(threshold).toHaveProperty('threshold');
      expect(threshold).toHaveProperty('actual');
      expect(typeof threshold.passed).toBe('boolean');
    }

    // Metadata
    expect(result.metadata).toHaveProperty('durationMs');
    expect(result.metadata).toHaveProperty('filesAnalyzed');
    expect(result.metadata.algorithm).toBe('johnson-lindenstrauss');
  });

  it('should also work with full-scan algorithm', async () => {
    const response = await analyzeCoverageHandler(
      {
        targetPath: 'v3/@claude-flow/cli/src/mcp-tools',
        algorithm: 'full-scan',
        prioritize: false,
        includeFileDetails: false,
        projectionDimension: 32,
      },
      emptyContext,
    );

    const result = JSON.parse(response.content[0].text);
    expect(result.success).toBe(true);
    expect(result.algorithm.name).toBe('full-scan');
    expect(result.algorithm.complexity).toBe('O(n)');
    // Files should be empty since includeFileDetails: false
    expect(result.files).toEqual([]);
  });
});

describe('Live Repo: generate-tests', () => {
  it('should generate tests for request-tracker.ts', async () => {
    const response = await generateTestsHandler(
      {
        targetPath: 'v3/@claude-flow/cli/src/mcp-tools/request-tracker.ts',
        testType: 'unit',
        style: 'tdd-london',
        includeEdgeCases: true,
        includeMocks: true,
        maxTests: 10,
      },
      emptyContext,
    );

    // Response envelope
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0]).toHaveProperty('type', 'text');

    // Parse the JSON payload
    const text = response.content[0].text;
    expect(text.length).toBeGreaterThan(0);
    const result = JSON.parse(text);

    // Top-level fields
    expect(result.success).toBe(true);
    expect(result).toHaveProperty('testFile');
    expect(result).toHaveProperty('tests');
    expect(result).toHaveProperty('coverage');
    expect(result).toHaveProperty('metadata');

    // testFile path should reference request-tracker
    expect(result.testFile).toContain('request-tracker');
    expect(result.testFile).toContain('__tests__');

    // Tests array
    expect(Array.isArray(result.tests)).toBe(true);
    expect(result.tests.length).toBeGreaterThan(0);
    expect(result.tests.length).toBeLessThanOrEqual(10);

    // Each generated test should have required fields
    for (const test of result.tests) {
      expect(test).toHaveProperty('name');
      expect(test.name.length).toBeGreaterThan(0);
      expect(test).toHaveProperty('type');
      expect(test).toHaveProperty('description');
      expect(test).toHaveProperty('code');
      expect(test.code.length).toBeGreaterThan(0);
      expect(test).toHaveProperty('assertions');
      expect(test.assertions).toBeGreaterThan(0);
      expect(typeof test.edgeCase).toBe('boolean');
    }

    // Should include edge case tests since includeEdgeCases: true
    const edgeCases = result.tests.filter((t: { edgeCase: boolean }) => t.edgeCase);
    expect(edgeCases.length).toBeGreaterThan(0);

    // Coverage estimate
    expect(result.coverage).toHaveProperty('lineCoverage');
    expect(result.coverage).toHaveProperty('branchCoverage');
    expect(result.coverage).toHaveProperty('functionCoverage');
    expect(result.coverage.lineCoverage).toBeGreaterThan(0);

    // Metadata
    expect(result.metadata).toHaveProperty('framework');
    expect(result.metadata).toHaveProperty('style', 'tdd-london');
    expect(result.metadata).toHaveProperty('totalTests');
    expect(result.metadata.totalTests).toBe(result.tests.length);
    expect(result.metadata).toHaveProperty('executionTimeMs');
    expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should auto-detect language as typescript for .ts files', async () => {
    const response = await generateTestsHandler(
      {
        targetPath: 'v3/@claude-flow/cli/src/mcp-tools/request-tracker.ts',
        testType: 'unit',
        style: 'tdd-london',
        includeEdgeCases: false,
        includeMocks: false,
        maxTests: 3,
      },
      emptyContext,
    );

    const result = JSON.parse(response.content[0].text);
    expect(result.success).toBe(true);
    // Default framework for typescript is vitest
    expect(result.metadata.framework).toBe('vitest');
    // The test code should contain vitest-style syntax
    expect(result.tests[0].code).toContain('expect');
  });
});

describe('Live Repo: chaos-inject', () => {
  it('should perform a dryRun latency injection without side effects', async () => {
    const response = await chaosInjectHandler(
      {
        target: 'test-mcp-tools',
        failureType: 'network-latency',
        duration: 10,
        intensity: 0.3,
        dryRun: true,
        rollbackOnFailure: true,
        monitorMetrics: true,
        notifyChannels: [],
      },
      emptyContext,
    );

    // Response envelope
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0]).toHaveProperty('type', 'text');

    // Parse the JSON payload
    const text = response.content[0].text;
    expect(text.length).toBeGreaterThan(0);
    const result = JSON.parse(text);

    // Top-level fields
    expect(result.success).toBe(true);
    expect(result).toHaveProperty('experimentId');
    expect(result.experimentId).toMatch(/^chaos-/);
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('injection');
    expect(result).toHaveProperty('impact');
    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('timeline');
    expect(result).toHaveProperty('recommendations');
    expect(result).toHaveProperty('metadata');

    // Status should indicate dry-run
    expect(result.status.state).toBe('dry-run');
    expect(result.status.progress).toBe(100);
    expect(result.status.startTime).toBeTruthy();
    expect(result.status.endTime).toBeTruthy();

    // Injection details
    expect(result.injection.type).toBe('network-latency');
    expect(result.injection.target).toBe('test-mcp-tools');
    expect(result.injection.intensity).toBe(0.3);
    expect(result.injection.duration).toBe(10);
    expect(result.injection.affectedComponents.length).toBeGreaterThan(0);

    // Impact assessment
    expect(['none', 'low', 'medium', 'high', 'critical']).toContain(result.impact.severity);
    expect(result.impact).toHaveProperty('serviceDisruption');
    expect(result.impact.serviceDisruption).toHaveProperty('errorRate');
    expect(result.impact.serviceDisruption).toHaveProperty('avgLatency');
    expect(result.impact.dataLoss).toBe(false);

    // Metrics: baseline, duringChaos, afterChaos
    expect(result.metrics).toHaveProperty('baseline');
    expect(result.metrics).toHaveProperty('duringChaos');
    expect(result.metrics).toHaveProperty('afterChaos');
    expect(result.metrics.baseline).toHaveProperty('cpu');
    expect(result.metrics.baseline).toHaveProperty('memory');
    expect(result.metrics.duringChaos.networkLatency).toBeGreaterThanOrEqual(
      result.metrics.baseline.networkLatency,
    );
    expect(typeof result.metrics.degradation).toBe('number');
    expect(typeof result.metrics.recoveryTime).toBe('number');

    // Timeline should have events
    expect(result.timeline.length).toBeGreaterThan(0);
    for (const event of result.timeline) {
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('event');
      expect(event).toHaveProperty('type');
      expect(['info', 'warning', 'error', 'recovery']).toContain(event.type);
    }

    // Recommendations
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const rec of result.recommendations) {
      expect(rec).toHaveProperty('category');
      expect(rec).toHaveProperty('priority');
      expect(rec).toHaveProperty('finding');
      expect(rec).toHaveProperty('recommendation');
    }

    // Metadata confirms dry run
    expect(result.metadata.dryRun).toBe(true);
    expect(result.metadata).toHaveProperty('version');
  });

  it('should handle cpu-stress failure type in dryRun mode', async () => {
    const response = await chaosInjectHandler(
      {
        target: 'test-worker',
        failureType: 'cpu-stress',
        duration: 5,
        intensity: 0.7,
        dryRun: true,
        rollbackOnFailure: true,
        monitorMetrics: true,
        notifyChannels: [],
      },
      emptyContext,
    );

    const result = JSON.parse(response.content[0].text);
    expect(result.success).toBe(true);
    expect(result.status.state).toBe('dry-run');
    expect(result.injection.type).toBe('cpu-stress');
    // CPU stress at 0.7 intensity should produce noticeable degradation
    expect(result.metrics.degradation).toBeGreaterThan(0);
  });
});
