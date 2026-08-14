/**
 * ADR-111 Phase 5 — unit tests for WgWitnessService.
 */
import { describe, it, expect } from 'vitest';
import {
  WgWitnessService,
  canonicalizeContent,
  hashContent,
  verifyWitnessEntry,
  verifyWitnessChain,
  type WgWitnessSigner,
  type WgWitnessContent,
} from '../../src/domain/services/wg-witness-service.js';
import type { WgCommand } from '../../src/domain/services/wg-mesh-service.js';

function makeSigner(seed = 'sig'): { signer: WgWitnessSigner; signed: Buffer[] } {
  const signed: Buffer[] = [];
  return {
    signer: {
      sign: async (bytes) => {
        signed.push(bytes);
        // Stable fake sig — same bytes always produce same sig so chain
        // hash + sig are reproducible across test runs.
        return `${seed}:${Buffer.from(bytes).toString('base64').slice(0, 16)}`;
      },
    },
    signed,
  };
}

describe('ADR-111 Phase 5 — canonicalizeContent', () => {
  it('sorts keys for stable encoding', () => {
    const a: WgWitnessContent = {
      version: '1',
      type: 'peer-added',
      timestamp: '2026-05-11T00:00:00Z',
      nodeId: 'a',
      rationale: 'test',
      prevHash: '',
    };
    const b: WgWitnessContent = {
      prevHash: '',
      rationale: 'test',
      nodeId: 'a',
      timestamp: '2026-05-11T00:00:00Z',
      type: 'peer-added',
      version: '1',
    };
    expect(canonicalizeContent(a).toString()).toBe(canonicalizeContent(b).toString());
  });

  it('omits undefined fields', () => {
    const c: WgWitnessContent = {
      version: '1',
      type: 'peer-added',
      timestamp: '2026-05-11T00:00:00Z',
      nodeId: 'a',
      rationale: 'test',
      prevHash: '',
    };
    const out = canonicalizeContent(c).toString();
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('meshIP');
  });

  it('produces deterministic hash for identical content', () => {
    const c: WgWitnessContent = {
      version: '1',
      type: 'peer-added',
      timestamp: '2026-05-11T00:00:00Z',
      nodeId: 'a',
      rationale: 'test',
      prevHash: '',
    };
    expect(hashContent(c)).toBe(hashContent(c));
    expect(hashContent(c)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('ADR-111 Phase 5 — WgWitnessService.build', () => {
  it('produces an entry with hash + signature + correct prevHash', async () => {
    const { signer } = makeSigner();
    const w = new WgWitnessService('local', signer);
    const e1 = await w.build('peer-added', {
      rationale: 'first',
    });
    expect(e1.content.prevHash).toBe('');
    expect(e1.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(e1.signature).toMatch(/^sig:/);
    expect(e1.content.nodeId).toBe('local');
    expect(e1.content.version).toBe('1');

    const e2 = await w.build('peer-removed-suspended', { rationale: 'second' });
    expect(e2.content.prevHash).toBe(e1.hash);
  });

  it('setLastHash lets a resumer continue an existing chain', async () => {
    const { signer } = makeSigner();
    const w = new WgWitnessService('local', signer);
    w.setLastHash('deadbeef');
    const e = await w.build('peer-added', { rationale: 'resume' });
    expect(e.content.prevHash).toBe('deadbeef');
  });
});

describe('ADR-111 Phase 5 — WgWitnessService.attestWgCommand', () => {
  it('maps verbs to event types', async () => {
    const { signer } = makeSigner();
    const w = new WgWitnessService('local', signer);
    const cmds: WgCommand[] = [
      { verb: 'remove-allowed-ips', peerPublicKey: 'pk1', cmd: 'wg set ruflo-fed peer pk1 allowed-ips ""', rationale: 'r' },
      { verb: 'set-allowed-ips', peerPublicKey: 'pk1', cmd: 'wg set ruflo-fed peer pk1 allowed-ips 10.50.1.2/32', rationale: 'r' },
      { verb: 'remove-peer', peerPublicKey: 'pk1', cmd: 'wg set ruflo-fed peer pk1 remove', rationale: 'r' },
    ];
    const expected = ['peer-removed-suspended', 'peer-restored', 'peer-evicted'];
    for (let i = 0; i < cmds.length; i++) {
      const e = await w.attestWgCommand(cmds[i]);
      expect(e.content.type).toBe(expected[i]);
      expect(e.content.wgCommand).toBe(cmds[i].cmd);
    }
  });
});

describe('ADR-111 Phase 5 — chain verification', () => {
  const fakeVerify = async (bytes: Buffer, sig: string) =>
    sig === `sig:${Buffer.from(bytes).toString('base64').slice(0, 16)}`;

  it('verifyWitnessEntry returns true for well-formed entry', async () => {
    const { signer } = makeSigner();
    const w = new WgWitnessService('local', signer);
    const e = await w.build('peer-added', { rationale: 'ok' });
    expect(await verifyWitnessEntry(e, fakeVerify)).toBe(true);
  });

  it('verifyWitnessEntry returns false if hash is mutated', async () => {
    const { signer } = makeSigner();
    const w = new WgWitnessService('local', signer);
    const e = await w.build('peer-added', { rationale: 'ok' });
    const tampered = { ...e, hash: 'a'.repeat(64) };
    expect(await verifyWitnessEntry(tampered, fakeVerify)).toBe(false);
  });

  it('verifyWitnessChain green for an intact chain', async () => {
    const { signer } = makeSigner();
    const w = new WgWitnessService('local', signer);
    const chain = [
      await w.build('peer-added', { rationale: 'a' }),
      await w.build('peer-removed-suspended', { rationale: 'b' }),
      await w.build('peer-restored', { rationale: 'c' }),
    ];
    const result = await verifyWitnessChain(chain, fakeVerify);
    expect(result.ok).toBe(true);
  });

  it('detects broken chain link (entry inserted out of order)', async () => {
    const { signer } = makeSigner();
    const w = new WgWitnessService('local', signer);
    const chain = [
      await w.build('peer-added', { rationale: 'a' }),
      await w.build('peer-removed-suspended', { rationale: 'b' }),
    ];
    // Swap the order — second now claims prevHash=first.hash but appears first
    const broken = [chain[1], chain[0]];
    const result = await verifyWitnessChain(broken, fakeVerify);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('broken-chain-link');
  });

  it('detects invalid signature within a chain', async () => {
    const { signer } = makeSigner();
    const w = new WgWitnessService('local', signer);
    const chain = [await w.build('peer-added', { rationale: 'a' })];
    const tampered = [{ ...chain[0], signature: 'bogus-sig' }];
    const result = await verifyWitnessChain(tampered, fakeVerify);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-signature-or-hash');
  });
});
