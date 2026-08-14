import { describe, it, expect, vi } from 'vitest';
import {
  WitnessVerificationService,
  type WitnessVerificationDeps,
} from '../../src/domain/services/witness-verification-service.js';

function makeDeps(overrides: Partial<WitnessVerificationDeps> = {}): WitnessVerificationDeps {
  return {
    getWitnessChain: vi.fn().mockResolvedValue({
      length: 5,
      head: 'abc123',
      entries: [
        { epoch: 1, hash: 'h1' },
        { epoch: 2, hash: 'h2', previous_hash: 'h1' },
        { epoch: 3, hash: 'h3', previous_hash: 'h2' },
        { epoch: 4, hash: 'h4', previous_hash: 'h3' },
        { epoch: 5, hash: 'h5', previous_hash: 'h4' },
      ],
    }),
    ...overrides,
  };
}

describe('WitnessVerificationService', () => {
  it('verifies a contiguous chain with valid hashes', async () => {
    const svc = new WitnessVerificationService(makeDeps());
    const result = await svc.verifyChain('dev-001');

    expect(result.deviceId).toBe('dev-001');
    expect(result.chainLength).toBe(5);
    expect(result.verified).toBe(true);
    expect(result.gaps).toHaveLength(0);
    expect(result.headEpoch).toBe(5);
    expect(result.headHash).toBe('abc123');
    expect(result.integrityScore).toBe(1);
  });

  it('detects epoch gaps', async () => {
    const deps = makeDeps({
      getWitnessChain: vi.fn().mockResolvedValue({
        length: 5,
        head: 'h5',
        entries: [
          { epoch: 1, hash: 'h1' },
          { epoch: 2, hash: 'h2', previous_hash: 'h1' },
          { epoch: 5, hash: 'h5', previous_hash: 'h4' },
        ],
      }),
    });
    const svc = new WitnessVerificationService(deps);
    const result = await svc.verifyChain('dev-002');

    expect(result.verified).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toEqual({
      deviceId: 'dev-002',
      fromEpoch: 2,
      toEpoch: 5,
      missingCount: 2,
    });
    expect(result.integrityScore).toBeLessThan(1);
  });

  it('detects broken hash chain', async () => {
    const deps = makeDeps({
      getWitnessChain: vi.fn().mockResolvedValue({
        length: 3,
        entries: [
          { epoch: 1, hash: 'h1' },
          { epoch: 2, hash: 'h2', previous_hash: 'WRONG' },
          { epoch: 3, hash: 'h3', previous_hash: 'h2' },
        ],
      }),
    });
    const svc = new WitnessVerificationService(deps);
    const result = await svc.verifyChain('dev-003');

    expect(result.verified).toBe(false);
    expect(result.gaps).toHaveLength(0);
    expect(result.integrityScore).toBe(0.5);
  });

  it('handles empty entries with length > 0', async () => {
    const deps = makeDeps({
      getWitnessChain: vi.fn().mockResolvedValue({
        length: 10,
        head: 'abc',
        entries: [],
      }),
    });
    const svc = new WitnessVerificationService(deps);
    const result = await svc.verifyChain('dev-004');

    expect(result.verified).toBe(true);
    expect(result.chainLength).toBe(10);
    expect(result.integrityScore).toBe(0.5);
    expect(result.headHash).toBe('abc');
  });

  it('handles empty chain with length 0', async () => {
    const deps = makeDeps({
      getWitnessChain: vi.fn().mockResolvedValue({
        length: 0,
        entries: [],
      }),
    });
    const svc = new WitnessVerificationService(deps);
    const result = await svc.verifyChain('dev-005');

    expect(result.verified).toBe(true);
    expect(result.integrityScore).toBe(1.0);
  });

  it('handles entries without hash fields (SDK minimal entries)', async () => {
    const deps = makeDeps({
      getWitnessChain: vi.fn().mockResolvedValue({
        length: 3,
        entries: [
          { epoch: 1 },
          { epoch: 2 },
          { epoch: 3 },
        ],
      }),
    });
    const svc = new WitnessVerificationService(deps);
    const result = await svc.verifyChain('dev-006');

    expect(result.verified).toBe(true);
    expect(result.gaps).toHaveLength(0);
    expect(result.integrityScore).toBe(1);
  });

  it('sorts entries by epoch regardless of input order', async () => {
    const deps = makeDeps({
      getWitnessChain: vi.fn().mockResolvedValue({
        length: 4,
        entries: [
          { epoch: 4, hash: 'h4' },
          { epoch: 1, hash: 'h1' },
          { epoch: 3, hash: 'h3' },
          { epoch: 2, hash: 'h2' },
        ],
      }),
    });
    const svc = new WitnessVerificationService(deps);
    const result = await svc.verifyChain('dev-007');

    expect(result.headEpoch).toBe(4);
    expect(result.verified).toBe(true);
  });

  it('detects multiple gaps', async () => {
    const deps = makeDeps({
      getWitnessChain: vi.fn().mockResolvedValue({
        length: 10,
        entries: [
          { epoch: 1 },
          { epoch: 3 },
          { epoch: 7 },
          { epoch: 10 },
        ],
      }),
    });
    const svc = new WitnessVerificationService(deps);
    const result = await svc.verifyChain('dev-008');

    expect(result.gaps).toHaveLength(3);
    expect(result.gaps[0].missingCount).toBe(1);
    expect(result.gaps[1].missingCount).toBe(3);
    expect(result.gaps[2].missingCount).toBe(2);
    expect(result.verified).toBe(false);
  });

  it('uses chain.head as headHash when available', async () => {
    const deps = makeDeps({
      getWitnessChain: vi.fn().mockResolvedValue({
        head: 'chain-head-hash',
        entries: [
          { epoch: 1, hash: 'entry-hash' },
        ],
      }),
    });
    const svc = new WitnessVerificationService(deps);
    const result = await svc.verifyChain('dev-009');

    expect(result.headHash).toBe('chain-head-hash');
  });

  it('falls back to last entry hash when chain.head is missing', async () => {
    const deps = makeDeps({
      getWitnessChain: vi.fn().mockResolvedValue({
        entries: [
          { epoch: 1, hash: 'h1' },
          { epoch: 2, hash: 'h2' },
        ],
      }),
    });
    const svc = new WitnessVerificationService(deps);
    const result = await svc.verifyChain('dev-010');

    expect(result.headHash).toBe('h2');
  });

  it('calculates integrity score with gaps and broken hashes', async () => {
    const deps = makeDeps({
      getWitnessChain: vi.fn().mockResolvedValue({
        length: 10,
        entries: [
          { epoch: 1, hash: 'h1' },
          { epoch: 5, hash: 'h5', previous_hash: 'BROKEN' },
        ],
      }),
    });
    const svc = new WitnessVerificationService(deps);
    const result = await svc.verifyChain('dev-011');

    expect(result.verified).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.integrityScore).toBeLessThan(0.5);
  });
});
