/**
 * ADR-111 Phase 4 — unit tests for WgFirewallService.
 */
import { describe, it, expect } from 'vitest';
import { WgFirewallService } from '../../src/domain/services/wg-firewall-service.js';
import { FederationNode } from '../../src/domain/entities/federation-node.js';
import { TrustLevel } from '../../src/domain/entities/trust-level.js';

function peer(nodeId: string, trustLevel: TrustLevel, meshIP?: string): FederationNode {
  return FederationNode.create({
    nodeId,
    publicKey: 'pk-' + nodeId,
    endpoint: `ws://${nodeId}:9100`,
    trustLevel,
    capabilities: {
      agentTypes: [],
      maxConcurrentSessions: 1,
      supportedProtocols: ['websocket'],
      complianceModes: [],
    },
    metadata: meshIP ? { wgMeshIP: meshIP } : {},
  });
}

describe('ADR-111 Phase 4 — WgFirewallService nftables projection', () => {
  it('emits a #!/usr/sbin/nft -f shebang and drop-default policy', () => {
    const svc = new WgFirewallService({ platform: 'linux-nftables' });
    const { content } = svc.projectRules([]);
    expect(content).toContain('#!/usr/sbin/nft -f');
    expect(content).toContain('policy drop');
    expect(content).toContain('table inet ruflo_fed');
  });

  it('scopes input chain to the WG interface', () => {
    const svc = new WgFirewallService({ platform: 'linux-nftables', interfaceName: 'wgtest' });
    const { content } = svc.projectRules([]);
    expect(content).toContain('iifname "wgtest"');
  });

  it('projects ATTESTED trust → discovery port + federation range', () => {
    const svc = new WgFirewallService({ platform: 'linux-nftables' });
    const { content, peerProjections } = svc.projectRules([
      peer('attested-peer', TrustLevel.ATTESTED, '10.50.1.2/32'),
    ]);
    expect(content).toContain('# peer attested-peer');
    expect(content).toContain('ip saddr 10.50.1.2 tcp dport 9100 accept');
    expect(content).toContain('ip saddr 10.50.1.2 tcp dport 9101-9199 accept');
    expect(peerProjections).toHaveLength(1);
    expect(peerProjections[0].rules.length).toBe(2);
  });

  it('projects PRIVILEGED → wildcard accept', () => {
    const svc = new WgFirewallService({ platform: 'linux-nftables' });
    const { content } = svc.projectRules([
      peer('full-trust', TrustLevel.PRIVILEGED, '10.50.7.7/32'),
    ]);
    expect(content).toMatch(/ip saddr 10\.50\.7\.7 accept/);
  });

  it('excludes UNTRUSTED peers from rule output', () => {
    const svc = new WgFirewallService({ platform: 'linux-nftables' });
    const { content, peerProjections } = svc.projectRules([
      peer('drop-bucket', TrustLevel.UNTRUSTED, '10.50.9.9/32'),
    ]);
    expect(content).not.toContain('drop-bucket');
    expect(peerProjections).toHaveLength(0);
  });

  it('skips peers without wgMeshIP metadata', () => {
    const svc = new WgFirewallService({ platform: 'linux-nftables' });
    const { peerProjections } = svc.projectRules([
      peer('no-wg', TrustLevel.ATTESTED),
    ]);
    expect(peerProjections).toHaveLength(0);
  });

  it('emits loadCmd = nft -f <rulePath>', () => {
    const svc = new WgFirewallService({ platform: 'linux-nftables', rulePath: '/tmp/ruflo.nft' });
    const { loadCmd } = svc.projectRules([]);
    expect(loadCmd).toBe('nft -f /tmp/ruflo.nft');
  });
});

describe('ADR-111 Phase 4 — WgFirewallService pf projection', () => {
  it('emits header marking the anchor scope', () => {
    const svc = new WgFirewallService({ platform: 'darwin-pf', pfAnchor: 'test-anchor' });
    const { content, loadCmd } = svc.projectRules([]);
    expect(content).toContain('# This anchor is scoped to test-anchor');
    expect(loadCmd).toMatch(/^pfctl -a test-anchor -f .*$/);
  });

  it('projects ATTESTED trust → discovery + federation pass rules', () => {
    const svc = new WgFirewallService({ platform: 'darwin-pf', interfaceName: 'utun9' });
    const { content } = svc.projectRules([
      peer('attested-peer', TrustLevel.ATTESTED, '10.50.1.2/32'),
    ]);
    expect(content).toContain('# peer attested-peer');
    expect(content).toContain('pass in on utun9 proto tcp from 10.50.1.2 to any port 9100 keep state');
    expect(content).toContain('pass in on utun9 proto tcp from 10.50.1.2 to any port 9101:9199 keep state');
  });

  it('projects TRUSTED → adds ssh + 80/443 services', () => {
    const svc = new WgFirewallService({ platform: 'darwin-pf' });
    const { content } = svc.projectRules([
      peer('trusted-peer', TrustLevel.TRUSTED, '10.50.5.5/32'),
    ]);
    expect(content).toContain('to any port 22');
    expect(content).toContain('to any port 80:443');
  });

  it('projects PRIVILEGED → catch-all pass rule', () => {
    const svc = new WgFirewallService({ platform: 'darwin-pf' });
    const { content } = svc.projectRules([
      peer('full-trust', TrustLevel.PRIVILEGED, '10.50.7.7/32'),
    ]);
    expect(content).toMatch(/pass in on ruflo-fed from 10\.50\.7\.7 to any keep state/);
  });
});

describe('ADR-111 Phase 4 — WgFirewallService defense-in-depth', () => {
  it('refuses construction with unsafe interface name', () => {
    expect(() => new WgFirewallService({ interfaceName: 'wg0; rm -rf /' })).toThrow(/unsafe/);
  });

  it('refuses construction with unsafe pf anchor', () => {
    expect(() => new WgFirewallService({ platform: 'darwin-pf', pfAnchor: 'ev`il`' })).toThrow(/unsafe/);
  });

  it('refuses peer with unsafe meshIP', () => {
    const svc = new WgFirewallService({ platform: 'linux-nftables' });
    expect(() => svc.projectRules([
      peer('evil', TrustLevel.ATTESTED, '10.50.1.2; rm -rf /'),
    ])).toThrow(/unsafe/);
  });

  it('platform auto-detects on construction', () => {
    const svc = new WgFirewallService();
    const platform = svc.getPlatform();
    expect(['linux-nftables', 'darwin-pf']).toContain(platform);
  });

  it('produces empty rule body when no eligible peers', () => {
    const svc = new WgFirewallService({ platform: 'linux-nftables' });
    const { content, peerProjections } = svc.projectRules([
      peer('untrusted', TrustLevel.UNTRUSTED, '10.50.9.9/32'),
      peer('no-wg', TrustLevel.ATTESTED),
    ]);
    expect(peerProjections).toHaveLength(0);
    expect(content).toContain('# No ATTESTED+ peers in mesh.');
  });
});
