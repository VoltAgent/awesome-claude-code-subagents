/**
 * ADR-111 Phase 2 — WgMeshService.
 *
 * Pure-projection service: takes the federation peer registry + local
 * WG identity and produces (a) a `wg-quick`-compatible config string,
 * (b) per-peer `wg set` commands the operator runs to converge an
 * already-running interface, and (c) the AllowedIPs slice that maps to
 * each peer's trust level.
 *
 * Deliberately does NOT shell out. Bringing up a network interface
 * requires root and modifies system state — per CLAUDE.md's
 * destructive-actions guidance the service emits the commands; the
 * operator (or a thin shell wrapper they audit) runs them.
 *
 * Phase 3 (breaker integration) consumes this service: peer state
 * transitions invoke removeAllowedIPs/removePeer/restoreAllowedIPs,
 * which produce commands without side effects.
 */

import { TrustLevel, getTrustLevelLabel } from '../entities/trust-level.js';
import { FederationNode } from '../entities/federation-node.js';
import type { WgManifestSection, WgLocalKey } from '../value-objects/wg-config.js';
import { DEFAULT_MESH_SUBNET } from '../value-objects/wg-config.js';

export interface WgPortRule {
  readonly proto: 'tcp' | 'udp' | 'all';
  readonly port?: number;
  readonly portRange?: readonly [number, number];
}

/**
 * Trust-level → reachability. ADR-111's `WG_NETWORK_GATES`.
 *
 * Note: WireGuard's `AllowedIPs` is L3 routing, not L4 ACL — these port
 * rules describe what the L4 firewall (Phase 4: nftables/pf) should
 * enforce. v1 (this phase) only produces the rules; Phase 4 projects
 * them into kernel firewall syntax. Until then, callers using v1
 * fall back to the simpler "AllowedIPs = peer's mesh IP" model (option
 * (b) in the ADR — app-layer auth carries the access decision).
 */
export const WG_NETWORK_GATES: Record<TrustLevel, readonly WgPortRule[]> = {
  [TrustLevel.UNTRUSTED]: [],
  [TrustLevel.VERIFIED]: [
    { proto: 'tcp', port: 9100 },
  ],
  [TrustLevel.ATTESTED]: [
    { proto: 'tcp', port: 9100 },
    { proto: 'tcp', portRange: [9101, 9199] },
  ],
  [TrustLevel.TRUSTED]: [
    { proto: 'tcp', port: 9100 },
    { proto: 'tcp', portRange: [9101, 9199] },
    { proto: 'tcp', port: 22 },
    { proto: 'tcp', portRange: [80, 443] },
  ],
  [TrustLevel.PRIVILEGED]: [
    { proto: 'all' },
  ],
};

/**
 * Minimum trust level whose peers get a `[Peer]` block in the WG config.
 * UNTRUSTED stays out of the mesh entirely — it's the explicit drop bucket.
 */
export const WG_MIN_MESH_TRUST: TrustLevel = TrustLevel.VERIFIED;

/**
 * Security: validate every field we splice into a wg-quick config string
 * or shell command. The ADR's threat model explicitly includes "compromised
 * federation peer with valid WG key" — that peer signs their own manifest,
 * so the Ed25519 signature only proves origin, not content safety. A
 * compromised peer could publish e.g. wgEndpoint = "host:51820\n[Peer]\n..."
 * to inject extra peers into the config the operator runs via wg-quick.
 *
 * These regexes are intentionally narrow:
 *   - publicKey: base64 X25519, exactly 43 chars + '=' padding
 *   - meshIP:    a.b.c.d/32, octets 0-255, no whitespace
 *   - endpoint:  hostname-or-ipv4-or-bracketed-ipv6 + :port, no newlines/specials
 */
const WG_PUBKEY_REGEX = /^[A-Za-z0-9+/]{43}=$/;
const WG_MESH_IP_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/32$/;
const WG_ENDPOINT_REGEX = /^(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9][a-zA-Z0-9.-]*):\d{1,5}$/;

export interface WgPeerFields {
  readonly wgPublicKey: string;
  readonly wgMeshIP: string;
  readonly wgEndpoint: string;
}

/**
 * Return the validated peer wg fields, or null if any is malformed or
 * out-of-range. Callers treat null as "peer not eligible for mesh" — the
 * peer stays in the federation discovery registry but is excluded from
 * the wg config and any wg commands.
 */
export function readSafePeerWgFields(peer: FederationNode): WgPeerFields | null {
  const pk = peer.metadata.wgPublicKey;
  const ip = peer.metadata.wgMeshIP;
  const ep = peer.metadata.wgEndpoint;
  if (typeof pk !== 'string' || !WG_PUBKEY_REGEX.test(pk)) return null;
  if (typeof ip !== 'string' || !WG_MESH_IP_REGEX.test(ip)) return null;
  const ipMatch = ip.match(WG_MESH_IP_REGEX);
  if (!ipMatch || [ipMatch[1], ipMatch[2], ipMatch[3], ipMatch[4]].some(o => Number(o) > 255)) return null;
  if (typeof ep !== 'string' || !WG_ENDPOINT_REGEX.test(ep)) return null;
  const port = Number(ep.split(':').pop());
  if (port < 1 || port > 65535) return null;
  return { wgPublicKey: pk, wgMeshIP: ip, wgEndpoint: ep };
}

export interface WgMeshServiceConfig {
  /** Local interface name. Defaults to `ruflo-fed`. */
  readonly interfaceName?: string;
  /** Local UDP listen port. WireGuard's standard is 51820. */
  readonly listenPort?: number;
  /** Mesh subnet for AllowedIPs filtering. Defaults to DEFAULT_MESH_SUBNET. */
  readonly meshSubnet?: string;
}

const DEFAULT_INTERFACE = 'ruflo-fed';
const DEFAULT_LISTEN_PORT = 51820;

export interface WgPeerSummary {
  readonly nodeId: string;
  readonly trustLevel: TrustLevel;
  readonly trustLabel: string;
  readonly meshIP: string;
  readonly endpoint: string;
  readonly publicKey: string;
  readonly state: 'active' | 'suspended' | 'evicted';
  readonly allowedIPs: readonly string[];
}

/**
 * A planned `wg(8)` mutation. Service consumers either execute these or
 * surface them to the operator. Strings are validated for shell metachars
 * before being formatted into a command — callers should still review.
 */
export interface WgCommand {
  readonly verb: 'set-allowed-ips' | 'remove-allowed-ips' | 'remove-peer' | 'add-peer';
  /** Public key of the peer this command targets. */
  readonly peerPublicKey: string;
  /** Render to a `wg set <iface> peer <pk> ...` shell-ready string. */
  readonly cmd: string;
  /** Human-readable rationale for audit logs. */
  readonly rationale: string;
}

export class WgMeshService {
  private readonly interfaceName: string;
  private readonly listenPort: number;
  private readonly meshSubnet: string;
  private localKey: WgLocalKey | null = null;
  private localMeshIP: string | null = null;
  /** Per-peer AllowedIPs after the last applyTrustLevelToAllowedIPs() call. Drives restore from breaker. */
  private readonly lastAppliedAllowedIPs = new Map<string, readonly string[]>();
  /** Peer-pubkey → suspended flag for breaker integration. */
  private readonly suspended = new Set<string>();
  /** Peer-pubkey → evicted flag. */
  private readonly evicted = new Set<string>();

  constructor(config: WgMeshServiceConfig = {}) {
    this.interfaceName = config.interfaceName ?? DEFAULT_INTERFACE;
    this.listenPort = config.listenPort ?? DEFAULT_LISTEN_PORT;
    this.meshSubnet = config.meshSubnet ?? DEFAULT_MESH_SUBNET;
  }

  /** Bind the local WG identity. Required before buildInterfaceConfig(). */
  setLocalIdentity(key: WgLocalKey, meshIP: string): void {
    this.localKey = key;
    this.localMeshIP = meshIP;
  }

  getInterfaceName(): string {
    return this.interfaceName;
  }

  getMeshSubnet(): string {
    return this.meshSubnet;
  }

  /**
   * Build a `wg-quick`-compatible config string from current peers.
   *
   * Peers below WG_MIN_MESH_TRUST (UNTRUSTED) are excluded entirely.
   * Suspended peers stay in the config but with `AllowedIPs =` empty
   * (soft-block). Evicted peers are dropped completely.
   *
   * Operator writes this to `/etc/wireguard/<interface>.conf` and runs
   * `wg-quick up <interface>`.
   */
  buildInterfaceConfig(peers: readonly FederationNode[]): string {
    if (!this.localKey || !this.localMeshIP) {
      throw new Error('WgMeshService.buildInterfaceConfig: local identity not set; call setLocalIdentity() first');
    }
    const lines: string[] = [];
    lines.push('# Generated by ruflo federation plugin — ADR-111 Phase 2.');
    lines.push('# Operator MUST review before `wg-quick up`. Trust-graded port');
    lines.push('# rules (WG_NETWORK_GATES) are not enforced here — Phase 4 will');
    lines.push('# project them into nftables/pf. v1 uses mesh-IP isolation only.');
    lines.push('[Interface]');
    lines.push(`PrivateKey = ${this.localKey.privateKey}`);
    lines.push(`Address = ${this.localMeshIP}`);
    lines.push(`ListenPort = ${this.listenPort}`);
    lines.push('');
    for (const peer of peers) {
      if (peer.trustLevel < WG_MIN_MESH_TRUST) continue;
      // Security: validate every spliced field. A compromised but-signed
      // peer can otherwise inject extra [Peer] blocks via newline-laden
      // wgEndpoint. readSafePeerWgFields enforces base64/CIDR/host:port
      // regexes; mismatches skip the peer entirely (safer than partial-write).
      const safe = readSafePeerWgFields(peer);
      if (!safe) continue;
      if (this.evicted.has(safe.wgPublicKey)) continue;
      const allowed = this.suspended.has(safe.wgPublicKey)
        ? ''
        : this.computeAllowedIPs(peer, safe.wgMeshIP).join(', ');
      lines.push(`# Peer ${peer.nodeId} — trust=${getTrustLevelLabel(peer.trustLevel)}${this.suspended.has(safe.wgPublicKey) ? ' (SUSPENDED)' : ''}`);
      lines.push('[Peer]');
      lines.push(`PublicKey = ${safe.wgPublicKey}`);
      lines.push(`Endpoint = ${safe.wgEndpoint}`);
      lines.push(`AllowedIPs = ${allowed}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  /**
   * Compute the AllowedIPs slice for a peer at its current trust level.
   * v1: each peer gets its own /32 mesh IP. Phase 4 will narrow this
   * further via firewall rules; v1 keeps L3 broad and relies on the app
   * layer + trust gates for access decisions.
   */
  computeAllowedIPs(peer: FederationNode, meshIP: string): readonly string[] {
    if (peer.trustLevel === TrustLevel.UNTRUSTED) return [];
    const ips = [meshIP];
    this.lastAppliedAllowedIPs.set(peer.nodeId, ips);
    return ips;
  }

  /**
   * Apply trust level → AllowedIPs as a `wg set` command for an
   * already-running interface. Used when a peer joins or its trust level
   * changes without needing a full config rewrite.
   */
  applyTrustLevelToAllowedIPs(peer: FederationNode, meshIP: string, pubkey: string): WgCommand {
    const ips = this.computeAllowedIPs(peer, meshIP);
    return {
      verb: 'set-allowed-ips',
      peerPublicKey: pubkey,
      cmd: this.formatCmd(`peer ${pubkey} allowed-ips ${ips.join(',')}`),
      rationale: `apply AllowedIPs for ${peer.nodeId} at trust=${getTrustLevelLabel(peer.trustLevel)}`,
    };
  }

  /**
   * Phase 3 hook — peer SUSPENDED. Clear AllowedIPs (soft-block: keeps
   * the peer's public key registered with the interface but blocks all
   * routing to/from it).
   */
  removeAllowedIPs(peer: FederationNode, pubkey: string, reason?: string): WgCommand {
    this.suspended.add(pubkey);
    return {
      verb: 'remove-allowed-ips',
      peerPublicKey: pubkey,
      cmd: this.formatCmd(`peer ${pubkey} allowed-ips ""`),
      rationale: `SUSPEND ${peer.nodeId}${reason ? ` (${reason})` : ''} — clear AllowedIPs (soft-block)`,
    };
  }

  /**
   * Phase 3 hook — peer reactivated. Restore the AllowedIPs slice that
   * was active before suspension. Returns null if the peer was never
   * suspended (idempotent).
   */
  restoreAllowedIPs(peer: FederationNode, meshIP: string, pubkey: string): WgCommand | null {
    if (!this.suspended.has(pubkey)) return null;
    this.suspended.delete(pubkey);
    const previous = this.lastAppliedAllowedIPs.get(peer.nodeId);
    const ips = previous && previous.length > 0 ? previous : this.computeAllowedIPs(peer, meshIP);
    return {
      verb: 'set-allowed-ips',
      peerPublicKey: pubkey,
      cmd: this.formatCmd(`peer ${pubkey} allowed-ips ${ips.join(',')}`),
      rationale: `REACTIVATE ${peer.nodeId} — restore AllowedIPs ${ips.join(',')}`,
    };
  }

  /**
   * Phase 3 hook — peer EVICTED. Terminal removal from the mesh; the
   * peer's `[Peer]` block is dropped on next config rebuild and an
   * immediate `wg set <iface> peer <pk> remove` is emitted to flush
   * runtime state without a config reload.
   */
  removePeer(peer: FederationNode, pubkey: string, reason?: string): WgCommand {
    this.evicted.add(pubkey);
    this.suspended.delete(pubkey);
    this.lastAppliedAllowedIPs.delete(peer.nodeId);
    return {
      verb: 'remove-peer',
      peerPublicKey: pubkey,
      cmd: this.formatCmd(`peer ${pubkey} remove`),
      rationale: `EVICT ${peer.nodeId}${reason ? ` (${reason})` : ''} — drop from mesh`,
    };
  }

  /** Summarize the mesh state for `federation_wg_status` (Phase 6) and audit. */
  summarize(peers: readonly FederationNode[]): readonly WgPeerSummary[] {
    return peers
      .filter(p => p.trustLevel >= WG_MIN_MESH_TRUST)
      .map(peer => {
        // Security: same validation as buildInterfaceConfig. If a peer
        // published unsafe wg fields they get reported with empty strings —
        // visible in operator status without becoming an injection vector.
        const safe = readSafePeerWgFields(peer);
        const meshIP = safe?.wgMeshIP ?? '';
        const pubkey = safe?.wgPublicKey ?? '';
        const endpoint = safe?.wgEndpoint ?? '';
        let state: 'active' | 'suspended' | 'evicted' = 'active';
        if (pubkey && this.evicted.has(pubkey)) state = 'evicted';
        else if (pubkey && this.suspended.has(pubkey)) state = 'suspended';
        return {
          nodeId: peer.nodeId,
          trustLevel: peer.trustLevel,
          trustLabel: getTrustLevelLabel(peer.trustLevel),
          meshIP,
          endpoint,
          publicKey: pubkey,
          state,
          allowedIPs: safe && state === 'active' ? this.computeAllowedIPs(peer, safe.wgMeshIP) : [],
        };
      });
  }

  /**
   * Defense-in-depth: validate that all bits we splice into a shell
   * command are alphanumeric / base64 / WG-allowed chars. Refuses the
   * command rather than ship a substring that might escape its slot.
   */
  private formatCmd(args: string): string {
    // Allow: base64 pubkey chars [A-Za-z0-9+/=], IPv4 mesh chars
    // [0-9./], plus a handful of fixed verbs. Reject everything else.
    if (!/^[A-Za-z0-9+/=., "/-]*$/.test(args)) {
      throw new Error(`WgMeshService.formatCmd: refusing arg with unsafe chars: ${JSON.stringify(args)}`);
    }
    return `wg set ${this.interfaceName} ${args}`;
  }
}
