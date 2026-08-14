# ADR-111 Phase 7 — Cross-OS WG mesh bringup

Step-by-step procedure for activating the opt-in WireGuard mesh between two federation peers. This is the **operator-mediated** step that follows Phases 1-6 (which ship as code in `@claude-flow/plugin-agent-federation`).

> **⚠️ Phase 7 is destructive.** It modifies host networking and requires root. A typo in the firewall projection can drop ssh. Operator review of the staged configs is **mandatory** before activation.

## Prerequisites

- WireGuard installed on both hosts (`brew install wireguard-tools` on mac, `apt install wireguard` on linux).
- Both hosts reachable on a common UDP port (default `51820`). Tailscale, a LAN, or a VPN concentrator works. ADR-111 does NOT do NAT traversal.
- Federation plugin built on both hosts (`pnpm install && pnpm run build` in `v3/@claude-flow/plugin-agent-federation`).
- Federation Ed25519 identity already initialized — Phase 7 reuses it for manifest signing.

## Step 1 — Stage configs on each host

On **host A** (mac mini in this example):

```bash
cd v3/@claude-flow/plugin-agent-federation
node scripts/phase7-stage.mjs \
  ruv-mac-mini \
  ruvultra \
  '<placeholder-pubkey>' \
  '10.50.0.0/32' \
  'ruvultra-tailnet-name:51820'
```

The script will print host A's freshly-generated pubkey, e.g.:

```
publicKey:   61005ZbEMJq0tTIYwSHINdmJEsBM39sM5TIV6p4UfHA=
meshIP:      10.50.119.95/32
```

On **host B** (ruvultra):

```bash
node scripts/phase7-stage.mjs \
  ruvultra \
  ruv-mac-mini \
  '<placeholder-pubkey>' \
  '10.50.0.0/32' \
  'mac-mini-tailnet-name:51820'
```

Note host B's pubkey, e.g.:

```
publicKey:   v+cwXZ3BoYZZAodDI38RYf9UO5c9xz+TkjaAZg8mzhs=
meshIP:      10.50.242.138/32
```

## Step 2 — Re-stage with REAL peer values

Now that both hosts have generated keys, re-run staging with the actual peer pubkey + meshIP. The script reuses each host's own key from `/tmp/adr-111-stage/wg-key-<nodeId>.json` (idempotent).

On host A:

```bash
node scripts/phase7-stage.mjs \
  ruv-mac-mini \
  ruvultra \
  'v+cwXZ3BoYZZAodDI38RYf9UO5c9xz+TkjaAZg8mzhs=' \
  '10.50.242.138/32' \
  'ruvultra-tailnet:51820'
```

On host B:

```bash
node scripts/phase7-stage.mjs \
  ruvultra \
  ruv-mac-mini \
  '61005ZbEMJq0tTIYwSHINdmJEsBM39sM5TIV6p4UfHA=' \
  '10.50.119.95/32' \
  'mac-mini-tailnet:51820'
```

Each host now has cross-coherent staged configs in `/tmp/adr-111-stage/`.

## Step 3 — Operator review checklist

Before activating, inspect each staged file:

```bash
cat /tmp/adr-111-stage/ruflo-fed.conf
cat /tmp/adr-111-stage/ruflo-fed.nft     # linux only
cat /tmp/adr-111-stage/ruflo-fed.pf      # macos only
```

Checklist:
- [ ] `ruflo-fed.conf` has exactly one `[Peer]` block (per peer expected)
- [ ] The `[Peer]` block's `PublicKey` matches the OTHER host's emitted pubkey
- [ ] `AllowedIPs` lists ONLY the peer's mesh IP — no broader CIDR
- [ ] `ListenPort` is what you expect (default `51820`)
- [ ] Firewall projection contains only ATTESTED+ peers
- [ ] Default policy is `drop` (nftables) / not affecting main pf ruleset (pf anchor-scoped)
- [ ] No mention of UNTRUSTED peers anywhere

If anything looks off, **stop and re-stage** with corrected inputs — `ruflo-fed.conf` is what `wg-quick up` parses, and a misconfigured rule can drop ssh.

## Step 4 — Activate (per host)

After the checklist passes:

```bash
# Install the wg-quick config
sudo install -m 0600 /tmp/adr-111-stage/ruflo-fed.conf /etc/wireguard/ruflo-fed.conf

# Load the firewall rules (atomic, scoped to the WG interface or pf anchor)
# Linux:
sudo nft -f /tmp/adr-111-stage/ruflo-fed.nft
# macOS:
sudo pfctl -a ruflo-fed -f /tmp/adr-111-stage/ruflo-fed.pf

# Bring up the WG interface
sudo wg-quick up ruflo-fed
```

## Step 5 — Verify reachability

On host A:

```bash
sudo wg show ruflo-fed
# Expected: [Peer] section shows ruvultra's pubkey, last handshake timestamp,
# transfer counters update after activity.

ping 10.50.242.138       # ruvultra's mesh IP — should respond
```

On host B (mirror):

```bash
sudo wg show ruflo-fed
ping 10.50.119.95
```

## Step 6 — Validate breaker → L3 propagation

Trigger an operator-initiated evict on host A and confirm L3 isolation propagates:

```bash
# On host A, evict ruvultra at the federation layer
ruflo federation evict --node-id ruvultra
# Or via MCP: federation_evict

# Confirm WG layer responded
sudo wg show ruflo-fed     # ruvultra peer's [Peer] line should be gone

# From host A:
ping 10.50.242.138         # NOW unreachable — L3 followed L7 trust eviction
```

To restore:

```bash
ruflo federation reactivate --node-id ruvultra
# A wg set ruflo-fed peer ... allowed-ips ... command is emitted via the
# wgCommandSink the operator wired during plugin init.
sudo wg show ruflo-fed     # ruvultra back in [Peer] list
ping 10.50.242.138         # responsive again
```

## Step 7 — Witness verification (optional)

If `WgWitnessService` is wired into your federation plugin lifecycle (Phase 5 integration — operator-supplied):

```bash
cat .claude-flow/federation/wg-changes.log   # append-only chain
node plugins/ruflo-core/scripts/witness/verify.mjs \
  --manifest .claude-flow/federation/wg-witness.md.json
# Expected: Ed25519 signature valid, chain link verified end-to-end
```

## Rollback

```bash
sudo wg-quick down ruflo-fed

# Linux:
sudo nft delete table inet ruflo_fed

# macOS:
sudo pfctl -a ruflo-fed -F all
```

The configs in `/tmp/adr-111-stage/` and `/etc/wireguard/ruflo-fed.conf` stay on disk — re-run `wg-quick up ruflo-fed` to reactivate. To fully tear down also delete `/etc/wireguard/ruflo-fed.conf` (private key inside).

## Known limitations (v1)

- **No NAT traversal** — peers must be direct-UDP reachable. Use Tailscale, a VPN concentrator, or a public IP.
- **No DERP-equivalent relay** — if direct UDP fails, fall back to Tailscale instead.
- **No MagicDNS** — mesh IPs are derived from `nodeId`, not resolved.
- **Trust-graded firewall rules use ports** — but WG itself routes at L3. The firewall projection ships now and enforces these tighter rules once loaded.
- **Mobile / Windows clients** — out of scope for v1. Windows requires WireGuard for Windows + a different config-gen path.

## When NOT to use ADR-111

| If you... | Use this instead |
|---|---|
| Need NAT traversal | Tailscale or Headscale |
| Have >50 peers | Tailscale (their infra handles your scale) |
| Don't need trust↔L3 coupling | Plain tailnet + federation breaker is simpler |
| Don't need cryptographic provenance of mesh changes | Tailscale's audit log suffices |
