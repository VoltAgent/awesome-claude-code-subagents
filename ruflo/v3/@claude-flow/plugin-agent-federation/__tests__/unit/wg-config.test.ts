/**
 * ADR-111 Phase 1 — unit tests for WG keypair generation + mesh-IP derivation.
 */
import { describe, it, expect } from 'vitest';
import {
  generateWgKeyPair,
  deriveMeshIP,
  DEFAULT_MESH_SUBNET,
} from '../../src/domain/value-objects/wg-config.js';

describe('ADR-111 Phase 1 — generateWgKeyPair', () => {
  it('produces 32-byte base64-encoded public + private keys', () => {
    const key = generateWgKeyPair();
    // base64-encoded 32 bytes is 44 chars with '=' padding (or 43 if no padding required, but Node's
    // toString('base64') always includes padding for 32 bytes since 32%3 = 2, requires '=' suffix).
    expect(key.publicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(key.privateKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });

  it('returns different keypairs on successive calls', () => {
    const k1 = generateWgKeyPair();
    const k2 = generateWgKeyPair();
    expect(k1.privateKey).not.toBe(k2.privateKey);
    expect(k1.publicKey).not.toBe(k2.publicKey);
  });

  it('stamps createdAt as an ISO timestamp', () => {
    const before = Date.now();
    const key = generateWgKeyPair();
    const after = Date.now();
    const t = Date.parse(key.createdAt);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it('private/public keys decode to exactly 32 bytes (WG raw key length)', () => {
    const key = generateWgKeyPair();
    expect(Buffer.from(key.privateKey, 'base64').length).toBe(32);
    expect(Buffer.from(key.publicKey, 'base64').length).toBe(32);
  });
});

describe('ADR-111 Phase 1 — deriveMeshIP', () => {
  it('is deterministic for the same nodeId', () => {
    const ip1 = deriveMeshIP('ruvultra');
    const ip2 = deriveMeshIP('ruvultra');
    expect(ip1).toBe(ip2);
  });

  it('produces different IPs for different nodeIds', () => {
    const a = deriveMeshIP('ruvultra');
    const b = deriveMeshIP('macbook-1');
    expect(a).not.toBe(b);
  });

  it('default subnet output is in 10.50.0.0/16', () => {
    for (const nodeId of ['a', 'b', 'c', 'ruvultra', 'macbook', 'edge-1', 'edge-2']) {
      const ip = deriveMeshIP(nodeId);
      expect(ip).toMatch(/^10\.50\.\d{1,3}\.\d{1,3}\/32$/);
    }
  });

  it('clamps .0 and .255 to avoid network/broadcast collisions', () => {
    // Run a batch and check no result ends in .0 or .255
    for (let i = 0; i < 200; i++) {
      const ip = deriveMeshIP(`probe-${i}`);
      const lastOctet = Number(ip.split('.')[3].replace('/32', ''));
      expect(lastOctet).not.toBe(0);
      expect(lastOctet).not.toBe(255);
    }
  });

  it('respects custom subnets', () => {
    const ip = deriveMeshIP('node-x', '10.99.0.0/16');
    expect(ip).toMatch(/^10\.99\.\d{1,3}\.\d{1,3}\/32$/);
  });

  it('probes alternative IPs when first candidate is taken (collision handling)', () => {
    // Find a collision: take node-x's IP, then ask for node-x again with usedIPs=that.
    // The function should rotate the hash input and return a different IP.
    const first = deriveMeshIP('collision-test');
    const second = deriveMeshIP('collision-test', DEFAULT_MESH_SUBNET, new Set([first]));
    expect(second).not.toBe(first);
    expect(second).toMatch(/^10\.50\.\d{1,3}\.\d{1,3}\/32$/);
  });

  it('throws on invalid CIDR', () => {
    expect(() => deriveMeshIP('x', 'not-a-cidr')).toThrow(/invalid CIDR/);
    expect(() => deriveMeshIP('x', '10.50.0.0/33')).toThrow(/CIDR/);
    expect(() => deriveMeshIP('x', '256.1.1.1/16')).toThrow(/CIDR/);
  });

  it('throws when subnet is exhausted (impossibly small range with usedIPs filling everything)', () => {
    // /30 subnet → 4 hosts, after clamping .0/.255 that's 2 valid; fill with many usedIPs.
    // This is contrived but proves the bound is enforced.
    const allTaken = new Set<string>();
    // Pre-fill way more than the subnet can hold to force exhaustion.
    for (let i = 1; i < 255; i++) allTaken.add(`10.50.0.${i}/32`);
    expect(() => deriveMeshIP('y', '10.50.0.0/24', allTaken)).toThrow(/exhausted/);
  });
});
