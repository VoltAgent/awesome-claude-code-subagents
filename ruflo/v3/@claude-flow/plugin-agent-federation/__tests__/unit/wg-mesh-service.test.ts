/**
 * ADR-111 Phase 2 — unit tests for WgMeshService.
 *
 * Covers config generation, trust-graded reachability, breaker hooks
 * (suspend/restore/evict), and shell-injection defense in formatCmd.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WgMeshService, WG_NETWORK_GATES, WG_MIN_MESH_TRUST } from '../../src/domain/services/wg-mesh-service.js';
import { FederationNode } from '../../src/domain/entities/federation-node.js';
import { TrustLevel } from '../../src/domain/entities/trust-level.js';
import { generateWgKeyPair, deriveMeshIP } from '../../src/domain/value-objects/wg-config.js';

function makePeer(nodeId: string, trustLevel: TrustLevel, withWg = true): FederationNode {
  return FederationNode.create({
    nodeId,
    publicKey: 'ed25519-pubkey-' + nodeId,
    endpoint: `ws://${nodeId}:9100`,
    trustLevel,
    capabilities: {
      agentTypes: [],
      maxConcurrentSessions: 1,
      supportedProtocols: ['websocket'],
      complianceModes: [],
    },
    metadata: withWg
      ? {
          wgPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' + nodeId.padEnd(2, 'X').slice(0, 2) + '=',
          wgMeshIP: deriveMeshIP(nodeId),
          wgEndpoint: `${nodeId}.example:51820`,
        }
      : {},
  });
}

describe('ADR-111 Phase 2 — WG_NETWORK_GATES', () => {
  it('UNTRUSTED gets no port rules (drop bucket)', () => {
    expect(WG_NETWORK_GATES[TrustLevel.UNTRUSTED]).toEqual([]);
  });

  it('PRIVILEGED gets all-proto rule', () => {
    expect(WG_NETWORK_GATES[TrustLevel.PRIVILEGED]).toEqual([{ proto: 'all' }]);
  });

  it('trust levels are monotone — more trusted gets at-least same access', () => {
    const counts = [
      TrustLevel.UNTRUSTED,
      TrustLevel.VERIFIED,
      TrustLevel.ATTESTED,
      TrustLevel.TRUSTED,
      TrustLevel.PRIVILEGED,
    ].map(l => WG_NETWORK_GATES[l].length);
    for (let i = 1; i < counts.length - 1; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });
});

describe('ADR-111 Phase 2 — WgMeshService.buildInterfaceConfig', () => {
  let svc: WgMeshService;

  beforeEach(() => {
    svc = new WgMeshService();
    const key = generateWgKeyPair();
    svc.setLocalIdentity(key, '10.50.0.1/32');
  });

  it('throws if local identity is not set', () => {
    const fresh = new WgMeshService();
    expect(() => fresh.buildInterfaceConfig([])).toThrow(/local identity not set/);
  });

  it('emits [Interface] section with local key + mesh IP + listen port', () => {
    const cfg = svc.buildInterfaceConfig([]);
    expect(cfg).toContain('[Interface]');
    expect(cfg).toContain('PrivateKey =');
    expect(cfg).toContain('Address = 10.50.0.1/32');
    expect(cfg).toContain('ListenPort = 51820');
  });

  it('includes ATTESTED+ peers in the config', () => {
    const peers = [
      makePeer('peer-attested', TrustLevel.ATTESTED),
      makePeer('peer-trusted', TrustLevel.TRUSTED),
    ];
    const cfg = svc.buildInterfaceConfig(peers);
    expect(cfg).toContain('peer-attested');
    expect(cfg).toContain('peer-trusted');
  });

  it('excludes UNTRUSTED peers', () => {
    const peers = [makePeer('peer-untrusted', TrustLevel.UNTRUSTED)];
    const cfg = svc.buildInterfaceConfig(peers);
    expect(cfg).not.toContain('peer-untrusted');
  });

  it('skips peers without wg metadata', () => {
    const peers = [makePeer('peer-no-wg', TrustLevel.ATTESTED, false)];
    const cfg = svc.buildInterfaceConfig(peers);
    expect(cfg).not.toContain('peer-no-wg');
  });

  it('clears AllowedIPs for SUSPENDED peers (soft-block)', () => {
    const peer = makePeer('peer-x', TrustLevel.ATTESTED);
    const pubkey = peer.metadata.wgPublicKey as string;
    svc.removeAllowedIPs(peer, pubkey, 'test');
    const cfg = svc.buildInterfaceConfig([peer]);
    expect(cfg).toContain('peer-x');
    expect(cfg).toContain('(SUSPENDED)');
    // Empty AllowedIPs line — peer present but blocked from routing.
    expect(cfg).toContain('AllowedIPs = \n');
  });

  it('drops EVICTED peers entirely', () => {
    const peer = makePeer('peer-y', TrustLevel.ATTESTED);
    const pubkey = peer.metadata.wgPublicKey as string;
    svc.removePeer(peer, pubkey, 'test');
    const cfg = svc.buildInterfaceConfig([peer]);
    expect(cfg).not.toContain('peer-y');
  });
});

describe('ADR-111 Phase 2 — WgMeshService breaker hooks', () => {
  let svc: WgMeshService;
  beforeEach(() => {
    svc = new WgMeshService();
    svc.setLocalIdentity(generateWgKeyPair(), '10.50.0.1/32');
  });

  it('removeAllowedIPs emits wg set ... allowed-ips ""', () => {
    const peer = makePeer('peer-a', TrustLevel.ATTESTED);
    const pubkey = peer.metadata.wgPublicKey as string;
    const cmd = svc.removeAllowedIPs(peer, pubkey, 'FAILURE_RATIO_EXCEEDED');
    expect(cmd.verb).toBe('remove-allowed-ips');
    expect(cmd.cmd).toMatch(/^wg set ruflo-fed peer .* allowed-ips ""$/);
    expect(cmd.rationale).toContain('SUSPEND');
    expect(cmd.rationale).toContain('FAILURE_RATIO_EXCEEDED');
  });

  it('removePeer emits wg set ... peer <pk> remove', () => {
    const peer = makePeer('peer-b', TrustLevel.ATTESTED);
    const pubkey = peer.metadata.wgPublicKey as string;
    const cmd = svc.removePeer(peer, pubkey, 'MANUAL_EVICT');
    expect(cmd.verb).toBe('remove-peer');
    expect(cmd.cmd).toMatch(/^wg set ruflo-fed peer .* remove$/);
    expect(cmd.rationale).toContain('EVICT');
  });

  it('restoreAllowedIPs is null if the peer was never suspended (idempotent)', () => {
    const peer = makePeer('peer-c', TrustLevel.ATTESTED);
    const pubkey = peer.metadata.wgPublicKey as string;
    const meshIP = peer.metadata.wgMeshIP as string;
    expect(svc.restoreAllowedIPs(peer, meshIP, pubkey)).toBeNull();
  });

  it('restoreAllowedIPs after suspend returns wg command with previous IPs', () => {
    const peer = makePeer('peer-d', TrustLevel.ATTESTED);
    const pubkey = peer.metadata.wgPublicKey as string;
    const meshIP = peer.metadata.wgMeshIP as string;

    // Establish baseline AllowedIPs
    svc.applyTrustLevelToAllowedIPs(peer, meshIP, pubkey);
    svc.removeAllowedIPs(peer, pubkey, 'test');
    const restore = svc.restoreAllowedIPs(peer, meshIP, pubkey);
    expect(restore).not.toBeNull();
    expect(restore!.verb).toBe('set-allowed-ips');
    expect(restore!.cmd).toContain(meshIP);
    expect(restore!.rationale).toContain('REACTIVATE');
  });
});

describe('ADR-111 Phase 2 — readSafePeerWgFields (compromised-peer defense)', () => {
  function evilPeer(overrides: { wgPublicKey?: string; wgMeshIP?: string; wgEndpoint?: string }) {
    return FederationNode.create({
      nodeId: 'evil',
      publicKey: 'ed25519-evil',
      endpoint: 'ws://evil:9100',
      trustLevel: TrustLevel.ATTESTED,
      capabilities: {
        agentTypes: [],
        maxConcurrentSessions: 1,
        supportedProtocols: ['websocket'],
        complianceModes: [],
      },
      metadata: {
        wgPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        wgMeshIP: '10.50.1.2/32',
        wgEndpoint: 'evil.example:51820',
        ...overrides,
      },
    });
  }

  let svc: WgMeshService;
  beforeEach(() => {
    svc = new WgMeshService();
    svc.setLocalIdentity(generateWgKeyPair(), '10.50.0.1/32');
  });

  it('rejects [Peer] injection via wgEndpoint newline', () => {
    const evil = evilPeer({ wgEndpoint: 'host:51820\n[Peer]\nPublicKey = attacker' });
    const cfg = svc.buildInterfaceConfig([evil]);
    // The malicious endpoint must not appear, nor must the injected [Peer] block
    expect(cfg).not.toContain('attacker');
    expect(cfg).not.toContain('host:51820\n[Peer]');
    // Peer should be skipped entirely — no nodeId comment for it either
    expect(cfg).not.toContain('Peer evil');
  });

  it('rejects unsafe wgPublicKey (wrong length / non-base64)', () => {
    const cfg1 = svc.buildInterfaceConfig([evilPeer({ wgPublicKey: 'short' })]);
    const cfg2 = svc.buildInterfaceConfig([evilPeer({ wgPublicKey: '\\n; rm -rf /;\\n' })]);
    expect(cfg1).not.toContain('Peer evil');
    expect(cfg2).not.toContain('Peer evil');
  });

  it('rejects unsafe wgMeshIP (out-of-range octet)', () => {
    const cfg = svc.buildInterfaceConfig([evilPeer({ wgMeshIP: '999.999.999.999/32' })]);
    expect(cfg).not.toContain('Peer evil');
  });

  it('rejects unsafe wgMeshIP (missing /32 cidr)', () => {
    const cfg = svc.buildInterfaceConfig([evilPeer({ wgMeshIP: '10.50.1.2' })]);
    expect(cfg).not.toContain('Peer evil');
  });

  it('rejects port out of range in wgEndpoint', () => {
    const cfg = svc.buildInterfaceConfig([evilPeer({ wgEndpoint: 'host:99999' })]);
    expect(cfg).not.toContain('Peer evil');
  });

  it('accepts IPv6-bracketed endpoint', () => {
    const cfg = svc.buildInterfaceConfig([evilPeer({ wgEndpoint: '[::1]:51820' })]);
    expect(cfg).toContain('Peer evil');
    expect(cfg).toContain('[::1]:51820');
  });

  it('summarize() also excludes unsafe peers (empty pubkey/IP/endpoint)', () => {
    const evil = evilPeer({ wgEndpoint: 'host:51820\nmalicious' });
    const summary = svc.summarize([evil]);
    expect(summary).toHaveLength(1);
    expect(summary[0].endpoint).toBe('');
    expect(summary[0].publicKey).toBe('');
    expect(summary[0].meshIP).toBe('');
  });
});

describe('ADR-111 Phase 2 — WgMeshService defense-in-depth', () => {
  it('refuses cmd args with shell metacharacters', () => {
    const svc = new WgMeshService();
    svc.setLocalIdentity(generateWgKeyPair(), '10.50.0.1/32');
    const peer = makePeer('peer-bad', TrustLevel.ATTESTED);
    // Force unsafe content via the public key
    const evilPubkey = 'abc; rm -rf /';
    expect(() => svc.removeAllowedIPs(peer, evilPubkey, 'test')).toThrow(/unsafe chars/);
  });

  it('summarize reports trust + state per peer', () => {
    const svc = new WgMeshService();
    svc.setLocalIdentity(generateWgKeyPair(), '10.50.0.1/32');
    const a = makePeer('a', TrustLevel.ATTESTED);
    const b = makePeer('b', TrustLevel.TRUSTED);
    const aPk = a.metadata.wgPublicKey as string;
    svc.removeAllowedIPs(a, aPk, 'test');
    const summary = svc.summarize([a, b]);
    expect(summary).toHaveLength(2);
    expect(summary.find(s => s.nodeId === 'a')!.state).toBe('suspended');
    expect(summary.find(s => s.nodeId === 'b')!.state).toBe('active');
  });
});
