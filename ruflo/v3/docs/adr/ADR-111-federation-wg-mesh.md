# ADR-111 — Federation network mesh via WireGuard, governed by ruflo trust + breaker

- Status: **Accepted** (Phases 1-3 Implemented; Phases 4-7 Proposed)
- Date: 2026-05-09 (Proposed) → 2026-05-10 (Phases 1-3 Implemented)
- Authors: claude (drafted with rUv)
- Related: [ADR-097](./ADR-097-federation-budget-circuit-breaker.md), [ADR-104](./ADR-104-federation-wire-transport.md), [ADR-105](./ADR-105-federation-v1-state-snapshot.md), [ADR-106](./ADR-106-peer-discovery.md), [ADR-107](./ADR-107-federation-tls.md)
- Supersedes parts of: ADR-104's "tailnet provides TLS" assumption (this ADR makes ruflo own the network layer optionally)

## Context

Federation today (post-alpha.13) assumes peers reach each other through some pre-existing network — Tailscale, a private LAN, or the open internet with `wss://` + cert pinning (ADR-107). The federation plugin owns the **application protocol** (signed envelopes, breaker, audit trail) but treats network connectivity as the integrator's problem.

This works but creates two real frictions:

1. **Operational coupling to Tailscale Inc.** Most operators in our session validation used Tailscale as the connectivity layer. Tailscale is excellent but introduces an external trust/billing/availability dependency that's outside ruflo's control. Headscale (self-hosted Tailscale-compatible coord server) reduces the trust dependency but still requires a dedicated control-plane service.

2. **Trust + connectivity managed in two places.** Federation's trust ladder (UNTRUSTED → PRIVILEGED) governs MCP-tool access. Tailscale ACLs govern packet-layer reachability. They can drift — a peer that gets EVICTED in federation-trust-land remains in the tailnet until an admin manually removes it. **Compromised peer detection in federation does not propagate to the network layer.**

## Decision

**Add an optional in-tree WireGuard mesh layer to the federation plugin** that:

- Generates and exchanges WG public keys via the existing federation manifest (same Ed25519 trust chain)
- Auto-builds `wg-quick` configuration from the federation peer registry
- Maps ruflo trust levels to packet-layer `AllowedIPs` slices (see "Trust-graded access" below)
- Hooks into the breaker so SUSPEND/EVICT removes the peer from the WG mesh instantly
- Witness-attests every coordination change (add/remove/key-rotate) as an Ed25519-signed manifest entry

**This is an OPT-IN feature** (`config.wgMesh: true`). The existing flat-tailscale-ws path remains the default and unchanged.

### Why not just use Tailscale / Headscale

Both remain valid choices and the plugin will continue to work over them. ADR-111 adds an additional path — useful when:

- The operator wants zero external dependencies (no Tailscale Inc., no Headscale instance)
- The operator wants packet-layer access to follow ruflo trust changes (no two-system drift)
- The federation peer count is small (~2-50 nodes, no meaningful NAT traversal need)
- The peers are reachable on a known transport (direct UDP, OR a relay configured separately)

ADR-111 is **NOT a Tailscale clone**. It deliberately omits NAT traversal, DERP relays, MagicDNS, and SSO — those are Tailscale's value-adds and the right answer when you need them is "use Tailscale." ADR-111 provides the minimum control plane to coordinate a WG mesh among federation peers that can already reach each other on UDP.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Federation Plugin (extended for ADR-111)                     │
│                                                               │
│  Existing:                                                    │
│    ┌──────────────────┐  ┌──────────────────┐                │
│    │ Discovery service│  │ Breaker service  │                │
│    │ (manifests, sig) │  │ (suspend/evict)  │                │
│    └────────┬─────────┘  └────────┬─────────┘                │
│             │                     │                          │
│             v                     v                          │
│    ┌────────────────────────────────────────┐                │
│    │  NEW: WG Mesh Service                  │                │
│    │  - generateLocalWgKey()                │                │
│    │  - publishWgPubkeyInManifest()         │                │
│    │  - buildPeerConfigFromRegistry()       │                │
│    │  - applyTrustLevelToAllowedIPs(peer)   │                │
│    │  - removePeerOnBreakerSuspend(peer)    │                │
│    │  - witnessSignChange(change)           │                │
│    └────────────────────┬───────────────────┘                │
└─────────────────────────┼────────────────────────────────────┘
                          v
                ┌──────────────────────┐
                │  wg-quick / wg setup │  ← OS-level WireGuard
                │  /etc/wireguard/wg0  │     (kernel module on linux,
                │                      │      wireguard-go on macOS)
                └──────────────────────┘
                          │
                          v UDP/51820
        ┌──────────────────────────────────────────┐
        │  Federation peer mesh (10.50.0.0/16)     │
        │  • peer A: 10.50.0.1                     │
        │  • peer B: 10.50.0.2                     │
        │  • peer C: 10.50.0.3 (SUSPENDED → drop)  │
        └──────────────────────────────────────────┘
```

### Federation manifest extension

```typescript
// ALREADY in v1 manifest:
{
  nodeId: 'ruvultra',
  publicKey: '<ed25519 hex>',
  endpoint: 'ws://ruvultra:9100',
  capabilities: { agentTypes: [...], ... },
  signature: '<ed25519 sig>',
}

// NEW optional ADR-111 section:
+ wg: {
+   publicKey: '<curve25519 base64>',  // WG public key
+   endpoint: 'ruvultra.example:51820', // host:port reachable on UDP
+   meshIP: '10.50.0.2/32',             // assigned mesh IP
+ }
```

The Ed25519 manifest signature covers the new `wg` block — peers verifying the manifest also verify the WG key binding.

### Trust-graded `AllowedIPs`

Federation already has `TrustLevel` (5 levels) + `CAPABILITY_GATES` (per-level allowed ops). ADR-111 extends this with `WG_NETWORK_GATES`:

```typescript
export const WG_NETWORK_GATES: Record<TrustLevel, WgNetworkRule[]> = {
  [TrustLevel.UNTRUSTED]: [
    // Drop everything — peer is in registry but not in mesh
  ],
  [TrustLevel.VERIFIED]: [
    { proto: 'tcp', port: 9100 },          // discovery only
  ],
  [TrustLevel.ATTESTED]: [
    { proto: 'tcp', port: 9100 },
    { proto: 'tcp', portRange: [9101, 9199] },  // federation messaging
  ],
  [TrustLevel.TRUSTED]: [
    { proto: 'tcp', port: 9100 },
    { proto: 'tcp', portRange: [9101, 9199] },
    { proto: 'tcp', port: 22 },                  // ssh (operator)
    { proto: 'tcp', portRange: [80, 443] },     // services
  ],
  [TrustLevel.PRIVILEGED]: [
    { proto: 'all' },                            // full network
  ],
};
```

Implementation note: WG itself doesn't natively port-filter beyond `AllowedIPs` (which is L3 routing, not L4 ACL). To enforce port-level rules we either:
- (a) Use OS firewall (`nftables` on linux, `pf` on macOS) keyed off the WG interface — most flexible
- (b) Expose only the mesh IP and rely on app-layer auth — simpler, less defense-in-depth

ADR-111 v1 ships **(b)** for portability; **(a)** is a Phase 4 add for high-security deployments (see Implementation plan below).

### Breaker integration

The existing ADR-097 Phase 2.b breaker fires `node.suspend()` / `node.evict()`. ADR-111 hooks the state-machine transitions:

```typescript
// In federation-coordinator.ts:
peer.on('stateChange', (newState) => {
  if (newState === SUSPENDED || newState === EVICTED) {
    wgMesh.removeAllowedIPs(peer);  // peer immediately can't reach anyone
  }
  if (newState === ACTIVE && previousState === SUSPENDED) {
    wgMesh.restoreAllowedIPs(peer); // breaker reactivate restores mesh
  }
});
```

Removed peers stay in the WG configuration (key remains) but with `AllowedIPs` empty — equivalent to a soft-block. EVICTED peers get the entire `[Peer]` section removed and key revoked.

### Witness-attested coordination

Every WG mesh change becomes a witness manifest entry, signed by the operator's Ed25519 key:

```json
{
  "id": "wg-mesh-change-2026-05-09T22:00:00Z-add-peer-ruvultra",
  "desc": "Added ruvultra to WG mesh, AllowedIPs 10.50.0.2/32, TrustLevel=ATTESTED",
  "file": ".claude-flow/federation/wg-changes.log",
  "marker": "PublicKey = <wg-pk-base64>",
  "ts": "2026-05-09T22:00:00Z",
  "operator": "<ed25519 sig of the change>"
}
```

Anyone running `node plugins/ruflo-core/scripts/witness/verify.mjs --manifest .claude-flow/federation/wg-witness.md.json` can prove the mesh's history end-to-end. **This is something Tailscale fundamentally can't offer** because their coordination is server-mediated.

## Implementation plan

### Phase 1 — Manifest extension + key generation (1-2 days)

- Extend `FederationManifest` type with optional `wg: { publicKey, endpoint, meshIP }`
- On plugin init: if `config.wgMesh === true`, generate a WG keypair and persist to `.claude-flow/federation/wg-key-<nodeId>.json` (mode 0600, alongside existing Ed25519 key)
- Assign mesh IP via deterministic hash of nodeId into 10.50.0.0/16 — no central allocator needed. The 10.50.0.0/16 range is RFC1918 private space outside any common LAN allocation (10.0.0.0/24 — home routers, 10.10.0.0/16 — common k8s); it also avoids 100.64.0.0/10 which Tailscale claims, so dual-stack ADR-111+tailnet deployments don't collide. Birthday-collision probability stays under 1% up to ~36 peers and under 50% at ~302 peers — well outside the ≤50-peer v1 target. **Collision handling:** if `deriveMeshIP(nodeId)` resolves to an IP already published by another peer's manifest, the WgMeshService rotates one bit of the hash input (`nodeId + '\x00'`, `nodeId + '\x01'`, …) until a free slot is found. Larger deployments should jump to `10.50.0.0/12` (~1M slots).
- Manifest publishes the WG section + signature covers it

### Phase 2 — `WgMeshService` + config generation (3-4 days)

- New `domain/services/wg-mesh-service.ts`
- `buildPeerConfigFromRegistry()` → builds `wg-quick`-compatible config from `discovery.listPeers()` filtering ATTESTED+
- Writes to `/etc/wireguard/ruflo-fed.conf` (linux) or equivalent path on macOS
- `wg-quick up ruflo-fed` invocation (with operator confirmation per CLAUDE.md "destructive actions" guidance — bringing up a network interface qualifies)
- Hook into discovery's `onPeerDiscovered` to regenerate config on new peers

### Phase 3 — Breaker integration (2 days)

- Subscribe to FederationNode state transitions
- On SUSPENDED: `wg set ruflo-fed peer <pubkey> remove-allowed-ips`
- On EVICTED: `wg set ruflo-fed peer <pubkey> remove`
- On reactivate: restore from manifest

### Phase 4 — Trust-graded firewall rules (3 days)

- Implement `WG_NETWORK_GATES` table
- Project trust level to `nftables` rules (linux) — Phase 4a
- macOS `pf` rules — Phase 4b
- For platforms without programmatic firewall, fall back to mesh-IP isolation only with a doctor warning

### Phase 5 — Witness attestation (2 days)

- Every WgMeshService mutation appends to `.claude-flow/federation/wg-changes.log`
- Periodic regen-witness includes the change log
- New `federation_wg_status` MCP tool exposes the chain

### Phase 6 — Operator MCP tools (1-2 days)

- `federation_wg_status` — peer mesh state with trust + AllowedIPs
- `federation_wg_attest` — operator-signs a coordination change
- `federation_wg_keyrotate` — rotate the local WG key + republish manifest

### Phase 7 — Cross-OS validation + ADR-111 → Implemented (2 days)

- Mac (darwin/arm64) ↔ ruvultra (linux/x64) WG mesh established via federation manifests
- Send federation envelopes over the WG mesh IPs (10.50.0.x:9101)
- SUSPEND a peer, confirm peer can't reach mesh, reactivate restores
- Witness-verify the change log
- Bump federation alpha + publish

**Total estimated effort: ~14-18 days for one engineer for v1 (Phases 1-7), ~30 days with platform-specific firewall hardening (Phase 4 a+b done thoroughly).**

## Security model

### What this protects against

| Threat | Mitigation |
|---|---|
| Compromised federation peer with valid WG key | Breaker auto-removes from mesh on SUSPEND/EVICT (vs Tailscale: stays in tailnet until manual admin action) |
| Operator compromises adding rogue peers silently | Every change witness-signed; chain verifiable by anyone (vs Tailscale: trust the admin panel logs) |
| Drift between federation trust + network access | They're the same data — no drift possible |
| Tailscale Inc. compromise / outage | Zero dependency |

### What this DOESN'T protect against

| Threat | Why not / what to use instead |
|---|---|
| Peers behind NAT without UDP punching | No DERP relay. Use Tailscale OR a manually-configured WG relay (operator concern) |
| Eavesdropping on UDP/51820 | WG provides this — same crypto Tailscale uses |
| Malicious operator pushing bad witness entries | Witness chain is append-only; can't hide a bad entry. But CAN add bad entries if you control the operator key. Mitigation: multi-sig witness in Phase 8+ |
| Side-channel info leak via traffic timing | WG doesn't pad — same as Tailscale. Out of scope |

### Key rotation

Local WG key rotation:
1. Generate new keypair
2. Publish updated federation manifest (signature still by the unchanged Ed25519 identity)
3. Peers fetch updated manifest, regenerate their wg config with the new pubkey
4. Old key destroyed after grace period (default 1h)

## Anti-goals (intentionally NOT in this ADR)

- **NAT traversal / hole punching.** Use Tailscale or a relay. ADR-111 assumes peers are direct-UDP-reachable.
- **DERP-equivalent relay servers.** Same reason.
- **MagicDNS.** Federation already has `nodeId` as identity; mesh IPs are derived. No DNS layer needed.
- **SSO integration.** Federation Ed25519 keys ARE the identity. No Google/Okta wiring.
- **Mobile/Windows clients.** v1 targets Linux + macOS. Windows requires WireGuard for Windows + different config-gen path.
- **Replacing the existing `agentic-flow/transport/loader` WS path.** ADR-111 is OPT-IN; the existing path remains default + tested.

## Decision criteria — when to use ADR-111 vs alternatives

```
Q: Do you need NAT traversal between peers behind tricky NATs?
   YES → Tailscale or Headscale
   NO  → continue
Q: Do you have ≤50 federation peers that can reach each other on UDP?
   NO  → Tailscale (their NAT traversal handles your scale)
   YES → continue
Q: Do you want federation trust changes to immediately affect packet-layer
    reachability (no two-system drift)?
   YES → ADR-111
   NO  → existing tailnet+ADR-097 setup is simpler
Q: Do you need cryptographic provenance of all coordination changes
    (no central party trust required)?
   YES → ADR-111
   NO  → Tailscale's audit log suffices
```

## Implementation status

| Phase | Status |
|---|---|
| 1 — Manifest extension + key generation | **Implemented** (2026-05-10) |
| 2 — WgMeshService + config generation | **Implemented** (2026-05-10) |
| 3 — Breaker integration | **Implemented** (2026-05-10) |
| 4 — Trust-graded firewall rules | Proposed |
| 5 — Witness attestation | Proposed |
| 6 — Operator MCP tools | Proposed |
| 7 — Cross-OS validation | Proposed |

## Decision review trigger

Re-open this ADR when:

- A federation deployment hits NAT traversal limitations and asks for DERP-equivalent
- A second non-WG transport candidate emerges (e.g. real QUIC mesh per ADR-108) — both should share the trust-→-network-rule plumbing
- Tailscale changes its free-tier or licensing in a way that pushes operators toward self-hosting
- Multi-signature operator witness chain becomes a requirement
