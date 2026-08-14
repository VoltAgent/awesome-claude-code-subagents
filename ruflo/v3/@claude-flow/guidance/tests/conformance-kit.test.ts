/**
 * Tests for the Agent Cell Conformance Kit
 *
 * Validates the MemoryClerkCell, SimulatedRuntime, and ConformanceRunner
 * against the canonical acceptance criteria for the guidance control plane.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryClerkCell,
  SimulatedRuntime,
  ConformanceRunner,
  createMemoryClerkCell,
  createConformanceRunner,
} from '../src/conformance-kit.js';
import type {
  TraceEvent,
  CellRunResult,
  CellRuntime,
  AgentCell,
  ConformanceTestResult,
  ReplayTestResult,
  SimulatedRuntimeConfig,
} from '../src/conformance-kit.js';
import { createMemoryWriteGate } from '../src/memory-gate.js';
import type { MemoryAuthority } from '../src/memory-gate.js';
import { createProofChain } from '../src/proof.js';
import { createLedger } from '../src/ledger.js';
import {
  createCoherenceScheduler,
  createEconomicGovernor,
} from '../src/coherence.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeAuthority(
  overrides: Partial<MemoryAuthority> = {},
): MemoryAuthority {
  return {
    agentId: 'test-clerk',
    role: 'worker',
    namespaces: ['clerk-workspace'],
    maxWritesPerMinute: 100,
    canDelete: false,
    canOverwrite: true,
    trustLevel: 0.8,
    ...overrides,
  };
}

function makeRuntimeConfig(
  overrides: Partial<SimulatedRuntimeConfig> = {},
): SimulatedRuntimeConfig {
  const authority = overrides.authority ?? makeAuthority();
  return {
    memoryGate: createMemoryWriteGate({
      authorities: [authority],
      enableContradictionTracking: false,
    }),
    proofChain: createProofChain({ signingKey: 'conformance-test-key' }),
    ledger: createLedger(),
    coherenceScheduler: createCoherenceScheduler(),
    economicGovernor: createEconomicGovernor({
      tokenLimit: 100_000,
      toolCallLimit: 1_000,
    }),
    authority,
    initialCoherenceScore: 0.9,
    ...overrides,
  };
}

function runDefaultCell(): {
  result: CellRunResult;
  runtime: SimulatedRuntime;
} {
  const config = makeRuntimeConfig();
  const runtime = new SimulatedRuntime(config);
  const cell = new MemoryClerkCell();
  const result = cell.run(runtime);
  return { result, runtime };
}

// ============================================================================
// MemoryClerkCell - Trace Structure
// ============================================================================

describe('MemoryClerkCell', () => {
  let result: CellRunResult;
  let runtime: SimulatedRuntime;

  beforeEach(() => {
    const out = runDefaultCell();
    result = out.result;
    runtime = out.runtime;
  });

  it('should complete with correct trace structure', () => {
    expect(result.cellId).toBeTruthy();
    expect(result.runId).toMatch(/^run-/);
    expect(result.traceEvents).toBeInstanceOf(Array);
    expect(result.traceEvents.length).toBeGreaterThan(0);

    // Every trace event must have required fields
    for (const event of result.traceEvents) {
      expect(typeof event.seq).toBe('number');
      expect(typeof event.ts).toBe('number');
      expect(typeof event.type).toBe('string');
      expect(typeof event.decision).toBe('string');
      expect(event.payload).toBeDefined();
      expect(event.budgetSnapshot).toBeDefined();
    }
  });

  it('should perform 20 reads, 1 inference, and 5 write attempts', () => {
    expect(result.memoryReads).toBe(20);
    expect(result.memoryWritesAttempted).toBe(5);

    // Count model_infer events in trace
    const inferenceEvents = result.traceEvents.filter(
      (e) => e.type === 'model_infer',
    );
    expect(inferenceEvents).toHaveLength(1);

    // Count memory_read events in trace
    const readEvents = result.traceEvents.filter(
      (e) => e.type === 'memory_read',
    );
    expect(readEvents).toHaveLength(20);

    // Count memory_write_proposed events in trace
    const writeProposals = result.traceEvents.filter(
      (e) => e.type === 'memory_write_proposed',
    );
    expect(writeProposals).toHaveLength(5);
  });

  it('should commit first 2 writes and block last 3 after coherence drop', () => {
    expect(result.memoryWritesCommitted).toBe(2);
    expect(result.memoryWritesBlocked).toBe(3);

    // Verify committed events in trace
    const committedEvents = result.traceEvents.filter(
      (e) => e.type === 'memory_write_committed',
    );
    expect(committedEvents).toHaveLength(2);

    // Verify blocked events in trace
    const blockedEvents = result.traceEvents.filter(
      (e) => e.type === 'memory_write_blocked',
    );
    expect(blockedEvents).toHaveLength(3);

    // All blocked events should cite coherence as the reason
    for (const event of blockedEvents) {
      expect(event.decision).toBe('blocked_coherence');
    }
  });

  it('should emit a proof envelope with a valid hash', () => {
    expect(result.proofEnvelopeHash).toBeDefined();
    expect(typeof result.proofEnvelopeHash).toBe('string');
    expect(result.proofEnvelopeHash).toHaveLength(64);
    expect(result.proofEnvelopeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should have sequential seq numbers in all trace events', () => {
    for (let i = 0; i < result.traceEvents.length; i++) {
      expect(result.traceEvents[i].seq).toBe(i);
    }
  });

  it('should have monotonically non-decreasing timestamps', () => {
    for (let i = 1; i < result.traceEvents.length; i++) {
      expect(result.traceEvents[i].ts).toBeGreaterThanOrEqual(
        result.traceEvents[i - 1].ts,
      );
    }
  });

  it('should track budget usage consistently', () => {
    expect(result.budgetUsage.tokens).toBeGreaterThan(0);
    expect(result.budgetUsage.toolCalls).toBeGreaterThan(0);

    // Each trace event budget snapshot should have non-negative values
    for (const event of result.traceEvents) {
      expect(event.budgetSnapshot.tokens).toBeGreaterThanOrEqual(0);
      expect(event.budgetSnapshot.toolCalls).toBeGreaterThanOrEqual(0);
      expect(event.budgetSnapshot.storageBytes).toBeGreaterThanOrEqual(0);
    }

    // Budget should be non-decreasing across events
    for (let i = 1; i < result.traceEvents.length; i++) {
      expect(
        result.traceEvents[i].budgetSnapshot.tokens,
      ).toBeGreaterThanOrEqual(
        result.traceEvents[i - 1].budgetSnapshot.tokens,
      );
      expect(
        result.traceEvents[i].budgetSnapshot.toolCalls,
      ).toBeGreaterThanOrEqual(
        result.traceEvents[i - 1].budgetSnapshot.toolCalls,
      );
    }
  });

  it('should record coherence history including the drop', () => {
    expect(result.coherenceHistory.length).toBeGreaterThan(0);

    // Should start healthy
    expect(result.coherenceHistory[0]).toBeGreaterThanOrEqual(0.7);

    // Should contain a drop below 0.3
    const minCoherence = Math.min(...result.coherenceHistory);
    expect(minCoherence).toBeLessThan(0.3);
  });

  it('should produce "restricted" outcome', () => {
    expect(result.outcome).toBe('restricted');
  });

  it('should have run_start as first event and run_end as last event', () => {
    expect(result.traceEvents[0].type).toBe('run_start');
    expect(
      result.traceEvents[result.traceEvents.length - 1].type,
    ).toBe('run_end');
  });

  it('should include a privilege_change event when coherence drops', () => {
    const privilegeChanges = result.traceEvents.filter(
      (e) => e.type === 'privilege_change',
    );
    expect(privilegeChanges.length).toBeGreaterThanOrEqual(1);

    // The privilege change should go from 'full' to 'suspended'
    const change = privilegeChanges[0];
    expect(change.payload.previousLevel).toBe('full');
    expect(change.payload.newLevel).toBe('suspended');
    expect(change.decision).toBe('full->suspended');
  });
});

// ============================================================================
// SimulatedRuntime - Isolation Tests
// ============================================================================

describe('SimulatedRuntime', () => {
  let runtime: SimulatedRuntime;

  beforeEach(() => {
    runtime = new SimulatedRuntime(makeRuntimeConfig());
  });

  it('should allow reads regardless of coherence level', () => {
    runtime.setCoherenceScore(0.1); // suspended
    const value = runtime.readMemory('any-key', 'clerk-workspace');
    expect(value).toBeNull(); // key does not exist, returns null
    expect(runtime.getMemoryReads()).toBe(1);
  });

  it('should block writes when coherence is below read-only threshold', () => {
    runtime.setCoherenceScore(0.2); // below 0.3 -> suspended
    const result = runtime.writeMemory('key', 'clerk-workspace', 'value');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('suspended');
    expect(runtime.getMemoryWritesBlocked()).toBe(1);
    expect(runtime.getMemoryWritesCommitted()).toBe(0);
  });

  it('should allow writes when coherence is healthy', () => {
    const result = runtime.writeMemory('key', 'clerk-workspace', 'value');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('Write committed');
    expect(runtime.getMemoryWritesCommitted()).toBe(1);
    expect(runtime.getMemoryWritesBlocked()).toBe(0);
  });

  it('should return simulated model response', () => {
    const response = runtime.invokeModel('test prompt');
    expect(response).toContain('[Simulated inference');
    expect(response).toContain('test prompt');
  });

  it('should emit privilege_change when score crosses threshold', () => {
    runtime.setCoherenceScore(0.2);

    const events = runtime.getTraceEvents();
    const changes = events.filter((e) => e.type === 'privilege_change');
    expect(changes).toHaveLength(1);
    expect(changes[0].payload.previousLevel).toBe('full');
    expect(changes[0].payload.newLevel).toBe('suspended');
  });

  it('should not emit privilege_change when score stays in same band', () => {
    runtime.setCoherenceScore(0.85); // still 'full'

    const events = runtime.getTraceEvents();
    const changes = events.filter((e) => e.type === 'privilege_change');
    expect(changes).toHaveLength(0);
  });

  it('should accumulate budget usage from reads and writes', () => {
    runtime.readMemory('k1', 'clerk-workspace');
    runtime.readMemory('k2', 'clerk-workspace');
    runtime.writeMemory('k3', 'clerk-workspace', { data: true });

    const usage = runtime.getBudgetUsage();
    expect(usage.toolCalls).toBeGreaterThan(0);
  });

  it('should emit custom trace events', () => {
    runtime.emitCustomTrace(
      'run_start',
      { cellId: 'test' },
      'started',
    );

    const events = runtime.getTraceEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('run_start');
    expect(events[0].decision).toBe('started');
    expect(events[0].seq).toBe(0);
  });

  it('should track memory operations for proof chain', () => {
    runtime.readMemory('k1', 'clerk-workspace');
    runtime.writeMemory('k2', 'clerk-workspace', 'value');

    const ops = runtime.getMemoryOps();
    expect(ops).toHaveLength(2);
    expect(ops[0].operation).toBe('read');
    expect(ops[1].operation).toBe('write');
  });
});

// ============================================================================
// Proof Envelope Validation
// ============================================================================

describe('Proof envelope', () => {
  it('should be emitted and verifiable', () => {
    const config = makeRuntimeConfig();
    const runtime = new SimulatedRuntime(config);
    const cell = new MemoryClerkCell();
    cell.run(runtime);

    // Proof chain should contain exactly one envelope
    expect(config.proofChain.getChainLength()).toBe(1);

    // Verify the chain is intact
    expect(config.proofChain.verifyChain()).toBe(true);

    // The tip envelope should be verifiable individually
    const tip = config.proofChain.getChainTip();
    expect(tip).toBeDefined();
    expect(config.proofChain.verify(tip!)).toBe(true);
  });

  it('should reference the correct agent and session', () => {
    const config = makeRuntimeConfig();
    const runtime = new SimulatedRuntime(config);
    const cell = new MemoryClerkCell('test-cell-id');
    const result = cell.run(runtime);

    const tip = config.proofChain.getChainTip()!;
    expect(tip.metadata.agentId).toBe('test-cell-id');
    expect(tip.metadata.sessionId).toBe(result.runId);
  });

  it('should include memory lineage entries', () => {
    const config = makeRuntimeConfig();
    const runtime = new SimulatedRuntime(config);
    const cell = new MemoryClerkCell();
    cell.run(runtime);

    const tip = config.proofChain.getChainTip()!;
    // Should have 20 reads + 2 committed writes = 22 memory operations
    expect(tip.memoryLineage.length).toBe(22);

    const reads = tip.memoryLineage.filter((l) => l.operation === 'read');
    const writes = tip.memoryLineage.filter(
      (l) => l.operation === 'write',
    );
    expect(reads).toHaveLength(20);
    expect(writes).toHaveLength(2);
  });
});

// ============================================================================
// Replay Test
// ============================================================================

describe('Replay test', () => {
  it('should produce identical decisions for the same trace', () => {
    const { result } = runDefaultCell();
    const runner = createConformanceRunner();
    const replay = runner.runReplayTest(result.traceEvents);

    expect(replay.identical).toBe(true);
    expect(replay.totalEvents).toBe(result.traceEvents.length);
    expect(replay.divergences).toHaveLength(0);
  });

  it('should detect divergences when trace decisions are altered', () => {
    const { result } = runDefaultCell();

    // Tamper with a coherence_check decision
    const tampered = result.traceEvents.map((e) => ({ ...e }));
    const coherenceEvent = tampered.find(
      (e) => e.type === 'coherence_check',
    );
    if (coherenceEvent) {
      coherenceEvent.decision = 'tampered_value';
    }

    const runner = createConformanceRunner();
    const replay = runner.runReplayTest(tampered);

    expect(replay.identical).toBe(false);
    expect(replay.divergences.length).toBeGreaterThan(0);
    expect(replay.divergences[0].originalDecision).toBe(
      'tampered_value',
    );
  });

  it('should handle empty trace gracefully', () => {
    const runner = createConformanceRunner();
    const replay = runner.runReplayTest([]);

    expect(replay.identical).toBe(true);
    expect(replay.totalEvents).toBe(0);
    expect(replay.divergences).toHaveLength(0);
  });
});

// ============================================================================
// ConformanceRunner - Full Suite
// ============================================================================

describe('ConformanceRunner.runConformanceTest', () => {
  it('should pass all conformance checks', () => {
    const runner = createConformanceRunner();
    const testResult = runner.runConformanceTest();

    // Overall pass
    expect(testResult.passed).toBe(true);

    // Every individual check should pass
    for (const check of testResult.checks) {
      expect(check.passed).toBe(true);
    }
  });

  it('should have all expected check names', () => {
    const runner = createConformanceRunner();
    const testResult = runner.runConformanceTest();

    const checkNames = testResult.checks.map((c) => c.name);

    expect(checkNames).toContain('memory_reads_count');
    expect(checkNames).toContain('memory_writes_attempted');
    expect(checkNames).toContain('memory_writes_committed');
    expect(checkNames).toContain('memory_writes_blocked');
    expect(checkNames).toContain('proof_envelope_hash');
    expect(checkNames).toContain('sequential_seq_numbers');
    expect(checkNames).toContain('budget_tracking_consistent');
    expect(checkNames).toContain('outcome_restricted');
    expect(checkNames).toContain('proof_chain_valid');
    expect(checkNames).toContain('trace_bookends');
    expect(checkNames).toContain('coherence_drop_recorded');
  });

  it('should return a valid proof hash', () => {
    const runner = createConformanceRunner();
    const testResult = runner.runConformanceTest();

    expect(testResult.proofHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should complete within a reasonable duration', () => {
    const runner = createConformanceRunner();
    const testResult = runner.runConformanceTest();

    // Should complete in under 5 seconds even on slow CI
    expect(testResult.duration).toBeLessThan(5_000);
  });

  it('should produce a non-empty trace', () => {
    const runner = createConformanceRunner();
    const testResult = runner.runConformanceTest();

    expect(testResult.trace.length).toBeGreaterThan(0);
    expect(testResult.trace[0].type).toBe('run_start');
    expect(testResult.trace[testResult.trace.length - 1].type).toBe(
      'run_end',
    );
  });
});

// ============================================================================
// Factory Functions
// ============================================================================

describe('Factory functions', () => {
  it('createMemoryClerkCell should return a valid cell', () => {
    const cell = createMemoryClerkCell('custom-id');
    expect(cell.cellId).toBe('custom-id');
    expect(cell.name).toBe('MemoryClerk');
  });

  it('createMemoryClerkCell without id should generate one', () => {
    const cell = createMemoryClerkCell();
    expect(cell.cellId).toMatch(/^cell-/);
  });

  it('createConformanceRunner should return a runner', () => {
    const runner = createConformanceRunner();
    expect(runner).toBeInstanceOf(ConformanceRunner);
  });

  it('createConformanceRunner with custom authority', () => {
    const authority = makeAuthority({ agentId: 'custom-agent' });
    const runner = createConformanceRunner(authority);
    const testResult = runner.runConformanceTest();
    expect(testResult.passed).toBe(true);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
  it('should handle cell with all writes blocked (no coherent period)', () => {
    const config = makeRuntimeConfig({ initialCoherenceScore: 0.1 });
    const runtime = new SimulatedRuntime(config);
    const cell = new MemoryClerkCell(undefined, {
      readCount: 2,
      writeCount: 3,
      coherenceDropAtWrite: 999, // never triggers; already suspended
    });
    const result = cell.run(runtime);

    expect(result.memoryReads).toBe(2);
    expect(result.memoryWritesAttempted).toBe(3);
    expect(result.memoryWritesCommitted).toBe(0);
    expect(result.memoryWritesBlocked).toBe(3);
    expect(result.outcome).toBe('suspended');
  });

  it('should handle cell with all writes committed (no drop)', () => {
    const config = makeRuntimeConfig({ initialCoherenceScore: 0.95 });
    const runtime = new SimulatedRuntime(config);
    const cell = new MemoryClerkCell(undefined, {
      readCount: 2,
      writeCount: 3,
      coherenceDropAtWrite: 999, // never triggers
    });
    const result = cell.run(runtime);

    expect(result.memoryWritesCommitted).toBe(3);
    expect(result.memoryWritesBlocked).toBe(0);
    expect(result.outcome).toBe('completed');
  });

  it('should handle zero reads and zero writes', () => {
    const config = makeRuntimeConfig();
    const runtime = new SimulatedRuntime(config);
    const cell = new MemoryClerkCell(undefined, {
      readCount: 0,
      inferenceCount: 0,
      writeCount: 0,
    });
    const result = cell.run(runtime);

    expect(result.memoryReads).toBe(0);
    expect(result.memoryWritesAttempted).toBe(0);
    expect(result.outcome).toBe('completed');
    // Still has run_start and run_end
    expect(result.traceEvents.length).toBe(2);
    expect(result.traceEvents[0].type).toBe('run_start');
    expect(result.traceEvents[1].type).toBe('run_end');
  });

  it('should handle coherence drop at write #1 (all blocked)', () => {
    const config = makeRuntimeConfig();
    const runtime = new SimulatedRuntime(config);
    const cell = new MemoryClerkCell(undefined, {
      readCount: 1,
      writeCount: 3,
      coherenceDropAtWrite: 1,
      droppedCoherenceScore: 0.1,
    });
    const result = cell.run(runtime);

    expect(result.memoryWritesCommitted).toBe(0);
    expect(result.memoryWritesBlocked).toBe(3);
    expect(result.outcome).toBe('suspended');
  });

  it('should handle coherence drop at last write', () => {
    const config = makeRuntimeConfig();
    const runtime = new SimulatedRuntime(config);
    const cell = new MemoryClerkCell(undefined, {
      readCount: 1,
      writeCount: 3,
      coherenceDropAtWrite: 3,
      droppedCoherenceScore: 0.1,
    });
    const result = cell.run(runtime);

    expect(result.memoryWritesCommitted).toBe(2);
    expect(result.memoryWritesBlocked).toBe(1);
    expect(result.outcome).toBe('restricted');
  });
});

// ============================================================================
// Interface Conformance
// ============================================================================

describe('Interface conformance', () => {
  it('MemoryClerkCell should satisfy AgentCell interface', () => {
    const cell: AgentCell = createMemoryClerkCell();
    expect(typeof cell.cellId).toBe('string');
    expect(typeof cell.name).toBe('string');
    expect(typeof cell.run).toBe('function');
  });

  it('SimulatedRuntime should satisfy CellRuntime interface', () => {
    const rt: CellRuntime = new SimulatedRuntime(makeRuntimeConfig());
    expect(typeof rt.readMemory).toBe('function');
    expect(typeof rt.writeMemory).toBe('function');
    expect(typeof rt.invokeModel).toBe('function');
    expect(typeof rt.invokeTool).toBe('function');
    expect(typeof rt.getCoherenceScore).toBe('function');
    expect(typeof rt.setCoherenceScore).toBe('function');
    expect(typeof rt.getProofChain).toBe('function');
    expect(typeof rt.getLedger).toBe('function');
  });
});
