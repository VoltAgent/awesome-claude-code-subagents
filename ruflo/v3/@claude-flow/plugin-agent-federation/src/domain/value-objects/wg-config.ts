/**
 * ADR-111 Phase 1 — WireGuard configuration value objects.
 *
 * Pure types + deterministic helpers. No I/O, no shell calls. Used by
 * WgMeshService (Phase 2) and surfaced in FederationManifest (Phase 1) so
 * peers can publish their WG identity inside the same Ed25519-signed
 * manifest that already carries their federation identity.
 */

import { createHash, generateKeyPairSync } from 'node:crypto';

/**
 * The WG section of a FederationManifest. Optional — present only when
 * the local node has opted in via `config.wgMesh: true`.
 *
 * - publicKey is the X25519 public key in base64 (32-byte raw → 44 chars
 *   including '=' padding), exactly the format `wg-quick`/`wg setconf`
 *   accept. Never include the private key in the manifest.
 * - endpoint is `host:port` reachable on UDP. May be a hostname (resolved
 *   by the consumer) or an IPv4/v6 literal. The port is WireGuard's, not
 *   federation's WS port — usually 51820.
 * - meshIP is the assigned /32 inside the federation mesh subnet
 *   (10.50.0.0/16 by default). Stored as `a.b.c.d/32`.
 */
export interface WgManifestSection {
  readonly publicKey: string;
  readonly endpoint: string;
  readonly meshIP: string;
}

/**
 * A locally-generated WG keypair. Kept entirely off the wire — `publicKey`
 * is what gets published in the manifest; `privateKey` stays on disk
 * (mode 0600) and in this in-memory object.
 */
export interface WgLocalKey {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly createdAt: string;
}

/**
 * Default federation mesh subnet. RFC1918 private space outside the
 * common LAN/k8s ranges and Tailscale's 100.64.0.0/10. Documented in
 * the ADR. Birthday-collision probability stays under 1% up to ~36
 * peers and under 50% at ~302 peers — within the v1 ≤50-peer target.
 */
export const DEFAULT_MESH_SUBNET = '10.50.0.0/16';

/**
 * Generate an X25519 keypair in the format WireGuard accepts.
 *
 * WireGuard keys are 32 raw bytes encoded base64 (44 chars with '='
 * padding). Node's `generateKeyPairSync('x25519')` returns PKCS8/SPKI
 * DER envelopes — we extract the trailing 32 bytes which are the raw
 * key material (the DER prefix is constant for X25519).
 *
 * No new dependencies: Node 18+ has X25519 support in core crypto.
 */
export function generateWgKeyPair(): WgLocalKey {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const privDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const pubDer = publicKey.export({ format: 'der', type: 'spki' });
  // The PKCS8 prefix for X25519 is 16 bytes, leaving 32 raw bytes.
  // The SPKI prefix for X25519 is 12 bytes, leaving 32 raw bytes.
  const privRaw = privDer.subarray(privDer.length - 32);
  const pubRaw = pubDer.subarray(pubDer.length - 32);
  if (privRaw.length !== 32 || pubRaw.length !== 32) {
    throw new Error(`generateWgKeyPair: unexpected DER layout (priv=${privRaw.length}B pub=${pubRaw.length}B)`);
  }
  return {
    publicKey: pubRaw.toString('base64'),
    privateKey: privRaw.toString('base64'),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Parse a `a.b.c.d/M` CIDR into a numeric base + mask-prefix-length.
 * Limited to IPv4 — v1 of ADR-111 is IPv4-only inside the mesh.
 */
function parseCidr(cidr: string): { base: number; prefix: number } {
  const m = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!m) throw new Error(`invalid CIDR: ${cidr}`);
  const [, a, b, c, d, p] = m;
  const octets = [a, b, c, d].map(Number);
  const prefix = Number(p);
  if (octets.some(o => o < 0 || o > 255) || prefix < 0 || prefix > 32) {
    throw new Error(`out-of-range CIDR: ${cidr}`);
  }
  const base = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  return { base, prefix };
}

function ipToString(n: number): string {
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}

/**
 * Derive a deterministic mesh IP for `nodeId` inside `subnet`.
 *
 * Strategy: sha256(nodeId) → top bytes interpreted as host portion of the
 * subnet, clamped to avoid the network address (.0) and broadcast (.255)
 * of any /24 inside the subnet. This is collision-resistant in the
 * birthday-paradox sense — see ADR for thresholds.
 *
 * `usedIPs` (when provided) gives previously-assigned IPs in the mesh.
 * If the derived IP is already taken, the function probes `nodeId + '\x00'`,
 * `nodeId + '\x01'`, … until a free slot is found. Bounded to 1024 probes;
 * exceeding that means the subnet is functionally exhausted and the caller
 * should jump to a larger range (see ADR `10.50.0.0/12` recommendation).
 */
export function deriveMeshIP(
  nodeId: string,
  subnet: string = DEFAULT_MESH_SUBNET,
  usedIPs: ReadonlySet<string> = new Set(),
): string {
  const { base, prefix } = parseCidr(subnet);
  if (prefix > 30) throw new Error(`subnet ${subnet} too small for mesh IPs`);
  const hostBits = 32 - prefix;
  const hostMask = hostBits >= 32 ? 0xffffffff : ((1 << hostBits) - 1) >>> 0;
  const networkBase = (base & ~hostMask) >>> 0;

  for (let probe = 0; probe < 1024; probe++) {
    const input = probe === 0 ? nodeId : `${nodeId}\x00${probe}`;
    const hash = createHash('sha256').update(input).digest();
    // Use the first 4 bytes as the host portion.
    const hashHost = ((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 0;
    let candidate = (networkBase | (hashHost & hostMask)) >>> 0;
    const lastOctet = candidate & 0xff;
    // Avoid .0 (network) and .255 (broadcast) of each /24 slice. Cheap
    // clamp: bump to .1 if landing on .0, or .254 if landing on .255.
    if (lastOctet === 0) candidate = (candidate | 1) >>> 0;
    else if (lastOctet === 255) candidate = (candidate & ~1) >>> 0;
    const ip = `${ipToString(candidate)}/32`;
    if (!usedIPs.has(ip)) return ip;
  }
  throw new Error(`deriveMeshIP: subnet ${subnet} exhausted after 1024 probes for ${nodeId}; jump to a wider range`);
}
