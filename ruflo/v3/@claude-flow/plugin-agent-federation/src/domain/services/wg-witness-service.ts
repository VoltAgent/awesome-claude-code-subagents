/**
 * ADR-111 Phase 5 — Witness attestation chain for WG mesh mutations.
 *
 * Every coordination change (peer added/suspended/evicted/reactivated,
 * keypair rotated) appends a signed entry to an append-only log
 * `.claude-flow/federation/wg-changes.log`. The signature is over a
 * canonical JSON encoding of the entry's content fields, using the
 * operator's federation Ed25519 key — the same identity that signs
 * federation manifests, so anyone who already trusts the manifest chain
 * automatically trusts the WG change chain.
 *
 * Append-only via O_APPEND open + entries chained by prevHash (sha256 of
 * the previous entry's canonical bytes). Tampering with history requires
 * forging a chain of signatures with the operator's key.
 *
 * The periodic ruflo witness regen (plugins/ruflo-core/scripts/witness/)
 * includes wg-changes.log as one of its watched artifacts (operator wires
 * this via witness-fixes.json).
 *
 * Pure service: emits the canonical bytes and the signature to write.
 * Caller does the I/O so this stays unit-testable without fs mocks.
 */

import { createHash } from 'node:crypto';
import type { WgCommand } from './wg-mesh-service.js';

export type WgWitnessEventType =
  | 'peer-added'
  | 'peer-removed-suspended'
  | 'peer-restored'
  | 'peer-evicted'
  | 'key-rotated'
  | 'interface-config-applied';

/**
 * Canonical fields of a witness entry. The hash + signature are computed
 * over these in a stable JSON encoding (sorted keys, no whitespace).
 */
export interface WgWitnessContent {
  readonly version: '1';
  readonly type: WgWitnessEventType;
  readonly timestamp: string;
  readonly nodeId: string;
  /** Public key of the affected peer, if any. */
  readonly peerPublicKey?: string;
  /** Mesh IP affected, if any. */
  readonly meshIP?: string;
  /** wg command that was emitted, if any. */
  readonly wgCommand?: string;
  /** Human-readable rationale for the audit log. */
  readonly rationale: string;
  /** Hash of the previous entry in the chain (sha256 hex), or empty for the genesis entry. */
  readonly prevHash: string;
}

/**
 * Full witness entry as it appears on disk — content + the operator's
 * Ed25519 signature over the canonical encoding of content.
 */
export interface WgWitnessEntry {
  readonly content: WgWitnessContent;
  readonly hash: string;       // sha256 of canonicalize(content)
  readonly signature: string;  // operator Ed25519 sig over canonicalize(content), base64
}

export interface WgWitnessSigner {
  /** Returns an Ed25519 signature (base64) over the given canonical bytes. */
  sign(bytes: Buffer): Promise<string>;
}

/**
 * Stable JSON serialization for hashing/signing. Keys are sorted; no
 * whitespace; undefined fields omitted. Same shape on every host so
 * cross-host verifiers produce identical hashes.
 */
export function canonicalizeContent(content: WgWitnessContent): Buffer {
  const keys = Object.keys(content).sort() as Array<keyof WgWitnessContent>;
  const ordered: Record<string, unknown> = {};
  for (const k of keys) {
    if (content[k] !== undefined) ordered[k] = content[k];
  }
  return Buffer.from(JSON.stringify(ordered), 'utf-8');
}

export function hashContent(content: WgWitnessContent): string {
  return createHash('sha256').update(canonicalizeContent(content)).digest('hex');
}

export class WgWitnessService {
  private readonly nodeId: string;
  private readonly signer: WgWitnessSigner;
  private lastHash: string = '';

  constructor(nodeId: string, signer: WgWitnessSigner) {
    this.nodeId = nodeId;
    this.signer = signer;
  }

  /**
   * Override the previous-hash pointer (used when resuming from an existing
   * log on disk). Caller reads the last entry from `wg-changes.log` and
   * passes its `hash` here before appending more.
   */
  setLastHash(hash: string): void {
    this.lastHash = hash;
  }

  /** Build + sign an entry. Caller is responsible for the actual append-write. */
  async build(
    type: WgWitnessEventType,
    fields: Omit<WgWitnessContent, 'version' | 'type' | 'timestamp' | 'nodeId' | 'prevHash'>,
  ): Promise<WgWitnessEntry> {
    const content: WgWitnessContent = {
      version: '1',
      type,
      timestamp: new Date().toISOString(),
      nodeId: this.nodeId,
      prevHash: this.lastHash,
      ...fields,
    };
    const canonical = canonicalizeContent(content);
    const hash = createHash('sha256').update(canonical).digest('hex');
    const signature = await this.signer.sign(canonical);
    this.lastHash = hash;
    return { content, hash, signature };
  }

  /**
   * Convenience: take a WgCommand emitted by WgMeshService Phase 2/3 and
   * produce a witness entry of the right type. Maps verb → eventType.
   */
  async attestWgCommand(cmd: WgCommand, meshIP?: string): Promise<WgWitnessEntry> {
    const typeMap: Record<WgCommand['verb'], WgWitnessEventType> = {
      'add-peer': 'peer-added',
      'set-allowed-ips': 'peer-restored',
      'remove-allowed-ips': 'peer-removed-suspended',
      'remove-peer': 'peer-evicted',
    };
    return this.build(typeMap[cmd.verb], {
      peerPublicKey: cmd.peerPublicKey,
      meshIP,
      wgCommand: cmd.cmd,
      rationale: cmd.rationale,
    });
  }
}

/**
 * Verify a single entry's signature + hash. Caller verifies the chain by
 * iterating entries and confirming each entry's `prevHash` equals the
 * preceding entry's `hash`.
 */
export async function verifyWitnessEntry(
  entry: WgWitnessEntry,
  verify: (bytes: Buffer, signature: string) => Promise<boolean>,
): Promise<boolean> {
  const canonical = canonicalizeContent(entry.content);
  const expectedHash = createHash('sha256').update(canonical).digest('hex');
  if (entry.hash !== expectedHash) return false;
  return verify(canonical, entry.signature);
}

/**
 * Verify a full chain — every entry valid + chain link unbroken.
 */
export async function verifyWitnessChain(
  entries: readonly WgWitnessEntry[],
  verify: (bytes: Buffer, signature: string) => Promise<boolean>,
): Promise<{ ok: boolean; failedAt?: number; reason?: string }> {
  let prevHash = '';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.content.prevHash !== prevHash) {
      return { ok: false, failedAt: i, reason: 'broken-chain-link' };
    }
    const validEntry = await verifyWitnessEntry(e, verify);
    if (!validEntry) {
      return { ok: false, failedAt: i, reason: 'invalid-signature-or-hash' };
    }
    prevHash = e.hash;
  }
  return { ok: true };
}
