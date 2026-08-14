/**
 * ADR-111 Phase 4 — Trust-graded firewall projection.
 *
 * Projects the WG_NETWORK_GATES table (defined in wg-mesh-service.ts) into
 * concrete kernel-firewall rules. Two backends:
 *
 *   - `nftables` for Linux — atomic `nft -f <file>` loader, family `inet`,
 *     hook `input` (interface-scoped to the WG iface).
 *   - `pf` for macOS — `pfctl -a ruflo-fed -f <file>`, anchor-scoped so
 *     ruflo's rules don't collide with the operator's main pf ruleset.
 *
 * Like Phase 2's WgMeshService this is a **pure-projection** service: it
 * returns rule strings + the shell command the operator runs. It never
 * shells out or modifies kernel state itself. Operator review is mandatory
 * because `pf` / `nft` reloads atomically replace the active ruleset for
 * the targeted scope — a typo here can drop ssh.
 *
 * v1 scope: the four trust levels VERIFIED/ATTESTED/TRUSTED/PRIVILEGED.
 * UNTRUSTED peers are never in the mesh (excluded by WgMeshService) so
 * they don't need a firewall rule either — implicit drop policy.
 */

import { FederationNode } from '../entities/federation-node.js';
import { TrustLevel } from '../entities/trust-level.js';
import { WG_NETWORK_GATES, WG_MIN_MESH_TRUST, type WgPortRule } from './wg-mesh-service.js';

export type WgFirewallPlatform = 'linux-nftables' | 'darwin-pf';

export interface WgFirewallServiceConfig {
  /** Target platform. Default: auto-detect from process.platform. */
  readonly platform?: WgFirewallPlatform;
  /** WG interface name to scope rules to. Defaults to `ruflo-fed`. */
  readonly interfaceName?: string;
  /** Where the operator should write the rule file. Used for the load-command string. */
  readonly rulePath?: string;
  /** pf anchor (macOS only). Defaults to `ruflo-fed`. */
  readonly pfAnchor?: string;
}

export interface WgFirewallRuleSet {
  /** The full rule-file content the operator writes to disk. */
  readonly content: string;
  /** The shell command the operator runs to load it. */
  readonly loadCmd: string;
  /** Recommended file path (informational — the operator decides). */
  readonly rulePath: string;
  /** Per-peer rule projections for audit/inspection. */
  readonly peerProjections: ReadonlyArray<{
    readonly nodeId: string;
    readonly trustLabel: string;
    readonly meshIP: string;
    readonly rules: readonly string[];
  }>;
}

const DEFAULT_INTERFACE = 'ruflo-fed';
const DEFAULT_PF_ANCHOR = 'ruflo-fed';

function autoDetectPlatform(): WgFirewallPlatform {
  switch (process.platform) {
    case 'linux': return 'linux-nftables';
    case 'darwin': return 'darwin-pf';
    default:
      // Other platforms (win32/freebsd) — fall back to linux-nftables since
      // most production federation hosts are linux. The operator can
      // override via config.platform.
      return 'linux-nftables';
  }
}

/**
 * Defense-in-depth: every value spliced into a rule line goes through this
 * filter. Allows the chars `nft`/`pf` syntax actually needs and refuses
 * anything else — a poisoned manifest can't escape the rule string.
 */
function assertSafeRuleArg(s: string, label: string): void {
  if (!/^[A-Za-z0-9_./:-]+$/.test(s)) {
    throw new Error(`WgFirewallService: refusing unsafe ${label}: ${JSON.stringify(s)}`);
  }
}

function projectRuleNftables(rule: WgPortRule, srcIP: string): string {
  if (rule.proto === 'all') {
    return `        ip saddr ${srcIP} accept`;
  }
  if (rule.port !== undefined) {
    return `        ip saddr ${srcIP} ${rule.proto} dport ${rule.port} accept`;
  }
  if (rule.portRange) {
    const [lo, hi] = rule.portRange;
    return `        ip saddr ${srcIP} ${rule.proto} dport ${lo}-${hi} accept`;
  }
  throw new Error(`projectRuleNftables: rule missing port/portRange/all: ${JSON.stringify(rule)}`);
}

function projectRulePf(rule: WgPortRule, iface: string, srcIP: string): string {
  if (rule.proto === 'all') {
    return `pass in on ${iface} from ${srcIP} to any keep state`;
  }
  if (rule.port !== undefined) {
    return `pass in on ${iface} proto ${rule.proto} from ${srcIP} to any port ${rule.port} keep state`;
  }
  if (rule.portRange) {
    const [lo, hi] = rule.portRange;
    return `pass in on ${iface} proto ${rule.proto} from ${srcIP} to any port ${lo}:${hi} keep state`;
  }
  throw new Error(`projectRulePf: rule missing port/portRange/all: ${JSON.stringify(rule)}`);
}

export class WgFirewallService {
  private readonly platform: WgFirewallPlatform;
  private readonly interfaceName: string;
  private readonly rulePath: string;
  private readonly pfAnchor: string;

  constructor(config: WgFirewallServiceConfig = {}) {
    this.platform = config.platform ?? autoDetectPlatform();
    this.interfaceName = config.interfaceName ?? DEFAULT_INTERFACE;
    assertSafeRuleArg(this.interfaceName, 'interfaceName');
    this.pfAnchor = config.pfAnchor ?? DEFAULT_PF_ANCHOR;
    assertSafeRuleArg(this.pfAnchor, 'pfAnchor');
    this.rulePath = config.rulePath ?? this.defaultRulePath();
  }

  getPlatform(): WgFirewallPlatform {
    return this.platform;
  }

  /**
   * Project the current peer set into a complete rule file (nftables or pf)
   * scoped to the WG interface.
   *
   * Peers below WG_MIN_MESH_TRUST (UNTRUSTED) are dropped — they have no
   * mesh IP and shouldn't appear in firewall allow rules anyway. Peers
   * without `metadata.wgMeshIP` are skipped (a stale manifest with no WG
   * block; the mesh layer already excludes them).
   */
  projectRules(peers: readonly FederationNode[]): WgFirewallRuleSet {
    const eligible = peers.filter(p => {
      if (p.trustLevel < WG_MIN_MESH_TRUST) return false;
      const meshIP = p.metadata.wgMeshIP as string | undefined;
      return typeof meshIP === 'string' && meshIP.length > 0;
    });

    const peerProjections = eligible.map(peer => {
      const meshIP = (peer.metadata.wgMeshIP as string).replace(/\/32$/, '');
      assertSafeRuleArg(meshIP, 'meshIP');
      const ruleSpecs = WG_NETWORK_GATES[peer.trustLevel];
      const rules = ruleSpecs.map(r =>
        this.platform === 'linux-nftables'
          ? projectRuleNftables(r, meshIP)
          : projectRulePf(r, this.interfaceName, meshIP),
      );
      return {
        nodeId: peer.nodeId,
        trustLabel: this.trustLabel(peer.trustLevel),
        meshIP: peer.metadata.wgMeshIP as string,
        rules,
      };
    });

    const content = this.platform === 'linux-nftables'
      ? this.renderNftables(peerProjections)
      : this.renderPf(peerProjections);

    return {
      content,
      loadCmd: this.platform === 'linux-nftables'
        ? `nft -f ${this.rulePath}`
        : `pfctl -a ${this.pfAnchor} -f ${this.rulePath}`,
      rulePath: this.rulePath,
      peerProjections,
    };
  }

  private renderNftables(projections: ReadonlyArray<{
    readonly nodeId: string;
    readonly trustLabel: string;
    readonly meshIP: string;
    readonly rules: readonly string[];
  }>): string {
    // Atomic nft script. The `flush` clears existing rules in the table
    // before reload — same atomicity property nft itself guarantees.
    // Default policy DROP so anything not explicitly allowed is rejected.
    const lines: string[] = [];
    lines.push('#!/usr/sbin/nft -f');
    lines.push('# Generated by ruflo federation plugin — ADR-111 Phase 4.');
    lines.push('# Operator MUST review before `nft -f`. A typo here can drop ssh.');
    lines.push('# This file is overwritten on every peer-set change; do not hand-edit.');
    lines.push('');
    lines.push('table inet ruflo_fed {');
    lines.push('    chain wg_input {');
    lines.push(`        type filter hook input priority 0; policy drop;`);
    lines.push(`        iifname "${this.interfaceName}" jump wg_peer_rules`);
    lines.push('    }');
    lines.push('    chain wg_peer_rules {');
    if (projections.length === 0) {
      lines.push('        # No ATTESTED+ peers in mesh.');
    }
    for (const p of projections) {
      lines.push(`        # peer ${p.nodeId} — trust=${p.trustLabel} mesh=${p.meshIP}`);
      for (const rule of p.rules) {
        lines.push(rule);
      }
    }
    lines.push('    }');
    lines.push('}');
    return lines.join('\n');
  }

  private renderPf(projections: ReadonlyArray<{
    readonly nodeId: string;
    readonly trustLabel: string;
    readonly meshIP: string;
    readonly rules: readonly string[];
  }>): string {
    const lines: string[] = [];
    lines.push('# Generated by ruflo federation plugin — ADR-111 Phase 4.');
    lines.push('# Operator MUST review before `pfctl -f`. A typo here can drop ssh.');
    lines.push(`# This anchor is scoped to ${this.pfAnchor}; main pf ruleset stays untouched.`);
    lines.push('');
    // Default within the anchor: pass nothing not explicitly allowed.
    // The main ruleset's policy still applies; the anchor only adds allows.
    if (projections.length === 0) {
      lines.push('# No ATTESTED+ peers in mesh.');
    }
    for (const p of projections) {
      lines.push(`# peer ${p.nodeId} — trust=${p.trustLabel} mesh=${p.meshIP}`);
      for (const rule of p.rules) {
        lines.push(rule);
      }
    }
    return lines.join('\n');
  }

  private defaultRulePath(): string {
    return this.platform === 'linux-nftables'
      ? '/etc/nftables.d/ruflo-fed.nft'
      : `/etc/pf.anchors/${this.pfAnchor}`;
  }

  private trustLabel(level: TrustLevel): string {
    switch (level) {
      case TrustLevel.UNTRUSTED: return 'UNTRUSTED';
      case TrustLevel.VERIFIED: return 'VERIFIED';
      case TrustLevel.ATTESTED: return 'ATTESTED';
      case TrustLevel.TRUSTED: return 'TRUSTED';
      case TrustLevel.PRIVILEGED: return 'PRIVILEGED';
    }
  }
}
