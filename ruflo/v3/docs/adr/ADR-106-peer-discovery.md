# ADR-106 — Peer discovery: staticPeers v1, mDNS v2

- Status: **Proposed — staticPeers shipped, mDNS planned**
- Date: 2026-05-09
- Authors: claude (drafted with rUv)
- Related: [ADR-097](./ADR-097-federation-budget-circuit-breaker.md), [ADR-104](./ADR-104-federation-wire-transport.md), [ADR-105](./ADR-105-federation-v1-state-snapshot.md)

## Context

Federation peers need to know each other's endpoints to talk. Today (`alpha.9`) the only way to discover a peer is to put their endpoint in `config.staticPeers` at plugin init time. This works for the common case ("I have 3 known machines on a tailnet, I want them to peer") but is friction for ad-hoc + dynamic deployments.

## Decision

**v1 (shipped):** explicit `staticPeers` config — no auto-discovery on the wire. Peers are added via `discovery.addStaticPeer(endpoint)` either at init time or at runtime. Each newly added peer's manifest is fetched + Ed25519-verified before they join the registry.

```typescript
await plugin.initialize({
  config: {
    nodeId: 'laptop',
    endpoint: 'ws://laptop.local:9100',
    staticPeers: [
      'ws://server.local:9100',
      'ws://homelab.tail-net.ts.net:9100',
    ],
    // ...
  },
});
```

**v2 (planned, this ADR's payload):** opt-in mDNS/Bonjour discovery via `bonjour-service` (npm) or `multicast-dns`. New config knob `discoveryModes: ('static' | 'mdns')[]` (default: `['static']` for backward compat; users opt into `['static', 'mdns']`).

### Why `bonjour-service` over `multicast-dns`

| Library | Pros | Cons |
|---|---|---|
| `bonjour-service` (~5k weekly DLs, TS-typed) | High-level service browse/publish API; auto-handles instance naming + TXT records | Slightly heavier than raw mDNS |
| `multicast-dns` (~2M weekly DLs) | Minimal, low-level | Caller writes record-type handling + service-instance matching from scratch |

**Choose `bonjour-service`** — federation needs the service-instance pattern (one node may publish multiple service types), not raw record manipulation.

### Service record shape

```
_ruflo-federation._tcp.local.
  TXT records:
    nodeId       = <peer node id>
    publicKey    = <hex-encoded Ed25519 public key>
    capabilities = <comma-separated list>
    version      = <plugin semver>
```

Receiving side queries `_ruflo-federation._tcp.local.` periodically (default 30s), enumerates instances, fetches each one's signed manifest at `ws://<host>:<port>/.well-known/federation-manifest`, verifies the Ed25519 sig, and adds to discovery if new.

### Security model — why mDNS doesn't change the trust assumptions

- mDNS announces existence on the LAN multicast group, but **anyone can publish** an `_ruflo-federation._tcp.local.` record. We treat mDNS as a HINT, not a trust signal.
- The actual trust gate is the post-discovery handshake: Ed25519 manifest signature → trust evaluator → trust level → capability check. A malicious mDNS record at best gets the peer added to discovery as `UNTRUSTED` (no send/receive capability per the trust gates).
- mDNS scope is the local broadcast domain. **Tailscale does not bridge mDNS** across the tailnet by default. Cross-host mDNS over tailnet requires either:
  - The user enables MagicDNS + `tailscale set --advertise-tags`
  - OR they use `staticPeers` for cross-host (which is the current default)
- Document explicitly: **enabling `mdns` discovery only finds peers on the local broadcast domain**. Don't promise tailnet-wide auto-discovery.

## Implementation plan

### Phase 1 — Discovery service

```typescript
// New file: domain/services/mdns-discovery-service.ts
import bonjour from 'bonjour-service';

export class MdnsDiscoveryService {
  constructor(
    private readonly nodeId: string,
    private readonly publicKeyHex: string,
    private readonly endpoint: string,
    private readonly capabilities: readonly string[],
    private readonly onPeer: (host: string, port: number, txt: Record<string,string>) => void,
  ) {}

  async start(): Promise<void> { /* publish + browse */ }
  async stop(): Promise<void> { /* unpublish + stop browser */ }
}
```

### Phase 2 — Plugin wiring

```typescript
// In plugin.ts initialize():
const discoveryModes = (config['discoveryModes'] as string[]) ?? ['static'];
if (discoveryModes.includes('mdns')) {
  const mdns = new MdnsDiscoveryService(nodeId, publicKeyHex, endpoint, capabilities, async (host, port, txt) => {
    const url = `ws://${host}:${port}`;
    try {
      await discovery.addStaticPeer(url);  // re-uses existing manifest verify path
      context.logger.info(`mDNS: added peer ${txt.nodeId} at ${url}`);
    } catch (err) {
      context.logger.warn(`mDNS: rejected peer ${url}: ${err.message}`);
    }
  });
  await mdns.start();
}
```

### Phase 3 — Tests

- Unit: MdnsDiscoveryService — start publishes + browse fires onPeer with TXT decoded
- Integration: stand up two plugin instances on `127.0.0.1` with different ports + `discoveryModes: ['mdns']`, assert each discovers the other within 5s

## Anti-goals (deliberately excluded)

- **DHT / Kademlia / IPFS-style discovery.** mDNS is enough for the local-network case; static config covers the cross-network case. We won't import a DHT library.
- **Centralized discovery server.** No "registry node" pattern — that creates a single point of failure and a target for trust escalation.
- **Discovery as a trust signal.** A peer being discovered MUST NOT bypass the trust evaluator — it just shortcuts the address-book entry, not the verification.

## Consequences

### Positive
- Common ad-hoc case (two laptops on the same office wifi) works with zero config
- Static-peer code path remains primary + tested — mDNS is opt-in additive
- mDNS discovery is auditable: every added peer goes through the same Ed25519 + trust check

### Negative
- New runtime dep on `bonjour-service` (~50KB minified)
- Multicast traffic on enabled networks (negligible: 1 announce per 30s by default)
- Doesn't help cross-tailnet — that's still `staticPeers` until ADR-107 ships TLS pinning for public peers

## Implementation status

| Step | Status |
|---|---|
| `staticPeers` config | Implemented (alpha.9) |
| `MdnsDiscoveryService` class | Deferred — this ADR's payload |
| Plugin `discoveryModes` config | Deferred |
| Tests | Deferred |

## Decision review trigger

Re-open when:
- A user reports needing dynamic discovery on a single LAN segment
- We add a new transport (e.g. WebRTC datachannel) that has its own discovery semantics
- Tailscale ships native mDNS bridging (changes the cross-tailnet picture)
