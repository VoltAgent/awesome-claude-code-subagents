# ADR-107 — Federation TLS: tailnet trust v1, wss/cert pinning v2

- Status: **Accepted — Implemented (alpha.12 + agentic-flow@fix.6)**
- Date: 2026-05-09
- Authors: claude (drafted with rUv)
- Related: [ADR-097](./ADR-097-federation-budget-circuit-breaker.md), [ADR-104](./ADR-104-federation-wire-transport.md), [ADR-105](./ADR-105-federation-v1-state-snapshot.md)

## Context

Federation v1 (`alpha.9`) uses `ws://` (plain WebSocket) over TCP. Encryption + identity is delegated to the network layer:

- **Intra-tailnet**: Tailscale (WireGuard) provides TLS-equivalent confidentiality + per-node identity via WireGuard public keys. The federation Ed25519 keypair is layered ON TOP of WireGuard's identity for application-level message signing.
- **Localhost / LAN**: no encryption, but no exposure either (loopback or behind a firewall).

This is sufficient TODAY because the dogfood configuration is mac↔ruvultra over tailscale. **It does not work for cross-tailnet federation over the open internet.**

## Decision

**v1 (shipped):** plugin defaults to `ws://` and assumes the integrator has set up a tailnet (or equivalent — VPN, private network) for transport-layer protection. Document this assumption in the operator runbook.

**v2 (this ADR's payload):** add `wss://` (TLS-secured WebSocket) with cert pinning for federation peers crossing trust domains. Three sub-decisions:

### Sub-decision 1: cert acquisition — caller's problem, not the plugin's

The plugin will accept TLS materials in config; it will NOT generate or rotate them. Reasons:
- Cert lifecycle is operator policy (Let's Encrypt? internal CA? mTLS w/ pinned self-signed? all valid choices)
- Mixing cert acquisition into the plugin couples it to a specific issuer
- The plugin's job is the application protocol, not the PKI

Config shape:
```typescript
{
  // ...
  endpoint: 'wss://federation.example.com:9100',
  tls: {
    // server side — bind certs for the listener
    certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
    keyPath:  '/etc/letsencrypt/live/example.com/privkey.pem',
    // client side — pin which certs are acceptable for outbound
    pinnedFingerprints: [
      'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',  // peer-A
      'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',  // peer-B
    ],
    // optional CA bundle for non-pinned mode (e.g. private CA)
    caPath: '/etc/ssl/internal-ca.pem',
  },
}
```

### Sub-decision 2: pinning over CA-trust by default

When `pinnedFingerprints` is set, **only those exact certs are accepted** — no CA path validation. If the peer's cert rotates and the fingerprint changes, the connection fails closed (operator must update config + restart). This prevents:
- Compromised public CAs issuing rogue certs for `federation.example.com`
- TLS-MITM attacks where an attacker holds a valid cert chain to your TLD

When `caPath` is set without `pinnedFingerprints`, falls back to standard CA-validated TLS. Document the trade-off explicitly.

### Sub-decision 3: WireGuard remains the recommended path

Even with wss+pinning, the plugin documents tailnet-WG as the **preferred** path. Reasons:
- WG keypairs rotate transparently per-session; cert pinning needs manual rotation
- WG mutual auth is built-in; client-cert auth (mTLS) is bolt-on for ws
- WG egress filtering (which peers can reach which) is configurable in the tailnet ACL; for wss it's app-layer only

So the implementation order is:
1. Document tailnet path clearly in operator runbook (ALREADY in ADR-104)
2. Add `wss://` support to the loader (small change in agentic-flow's `WebSocketFallbackTransport`)
3. Add fingerprint-pinning helper in the federation plugin
4. Update doctor surface to report which TLS mode is active

## Implementation plan

### Phase 1 — wss support in loader

In `agentic-flow/src/transport/quic-loader.ts` (companion PR upstream):

```typescript
// In WebSocketFallbackTransport.getOrCreateConnection:
const isWss = url.startsWith('wss://');
const tlsOpts = isWss && this.config.pinnedFingerprints?.length
  ? {
      checkServerIdentity: (host, cert) => {
        const fp = `sha256/${createHash('sha256').update(cert.raw).digest('base64')}`;
        if (!this.config.pinnedFingerprints!.includes(fp)) {
          return new Error(`Cert fingerprint ${fp} not in pinned set`);
        }
        return undefined;  // accept
      },
    }
  : {};
const ws = new WebSocket(url, tlsOpts);
```

### Phase 2 — federation plugin reads tls.* config

```typescript
// In plugin.ts initialize():
const tlsConfig = config['tls'] as {
  certPath?: string;
  keyPath?: string;
  pinnedFingerprints?: string[];
  caPath?: string;
} | undefined;

const transport = await loadQuicTransport({
  serverName: nodeId,
  // ...
  tls: tlsConfig,  // pass through
});
```

### Phase 3 — listener TLS

In `WebSocketFallbackTransport.listen()`:
```typescript
async listen(port: number, host: string, opts?: { cert: Buffer; key: Buffer }) {
  const httpServer = opts
    ? https.createServer({ cert: opts.cert, key: opts.key })
    : http.createServer();
  const wss = new WebSocketServer({ server: httpServer });
  await new Promise<void>((r) => httpServer.listen(port, host, r));
  // ...
}
```

### Phase 4 — doctor surface

```bash
$ npx ruflo doctor --component federation
✓ Federation Breaker: ADR-097 breaker loadable
✓ Federation Transport: selectedBackend=websocket
ℹ Federation TLS: wss + 2 pinned fingerprints
```

## Anti-goals

- **No automatic cert generation.** The plugin won't run an ACME client or generate self-signed certs. Operator's responsibility.
- **No automatic cert rotation.** The plugin won't re-read TLS materials from disk on a SIGHUP — restart the process to pick up new certs (matches typical operator expectations for service-level TLS).
- **No client-side CA trust override.** The plugin won't ignore CA validation when pinning is off — that would be silently insecure.

## Security invariants (test-pinned in v2)

1. With pinned fingerprints set, a connection to a peer presenting a different cert MUST fail closed
2. Without pinned fingerprints AND without `caPath`, `wss://` connections fall back to system CA validation (NOT skip-validation)
3. `ws://` connections in production environments emit a warn-level log entry (operator awareness)
4. Cert hot-reload is explicitly NOT supported (process restart required) — documented

## Implementation status

| Step | Status |
|---|---|
| Tailnet-as-TLS documented (ADR-104) | Implemented |
| `wss://` support in loader | **Implemented** — `agentic-flow@2.0.12-fix.6` |
| `WebSocketFallbackTransport` accepts `tls.{certPath,keyPath}` and binds via `https.createServer` | **Implemented** |
| Client-side `tls.pinnedFingerprints` with fail-closed `checkServerIdentity` | **Implemented** — sha256/<base64> per cert.raw, rejectUnauthorized=false (pinning IS the trust) |
| Client-side `tls.caPath` for non-pinned CA validation | **Implemented** — rejectUnauthorized=true |
| Plugin passes `tls` config through to transport | **Implemented** — `loadQuicTransport({ tls })` accepted in `plugin.ts initialize()` |
| 4 new tests pin TLS config + ws-fallback compat | **Implemented** |
| Doctor surface enhancement | Deferred — surface to add when first TLS-pinned deployment lands |

## Decision review trigger

Re-open when:
- A user reports federating peers across separate tailnets (immediate need for wss+pinning)
- We add a new wire transport (QUIC) — its TLS story is different (TLS 1.3 baked in)
- A CA breach in the wild changes the threat model
