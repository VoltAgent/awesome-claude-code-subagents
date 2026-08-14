# ADR-108 — Native QUIC binding plan

- Status: **Proposed — gated on upstream agentic-flow Phase-1**
- Date: 2026-05-09
- Authors: claude (drafted with rUv)
- Related: [ADR-104](./ADR-104-federation-wire-transport.md), [ADR-105](./ADR-105-federation-v1-state-snapshot.md), upstream [ruvnet/agentic-flow#15-21](https://github.com/ruvnet/agentic-flow/issues?q=is%3Aissue+is%3Aopen+QUIC)

## Context

Federation transport today (`alpha.9` + `agentic-flow@2.0.12-fix.2`) uses WebSocket. The loader pattern (ADR-104) lets us auto-upgrade to QUIC when a native binding is available — set `AGENTIC_FLOW_QUIC_NATIVE=1` and the same code path picks up the upgrade. But the native binding doesn't ship.

What exists today in upstream `ruvnet/agentic-flow`:
- `crates/agentic-flow-quic/` — Rust crate using `quinn` (the canonical Rust QUIC impl). Full client + server features behind compile-time `client` / `server` features.
- `crates/agentic-flow-quic/src/wasm.rs` — WASM bindings, but **explicitly a stub** ("WASM build is a stub since browsers don't support UDP/QUIC directly. For production QUIC, use native Node.js builds.")
- `crates/agentic-flow-quic/wasm-pack-build.sh` — build script for the WASM stub bundle (already runs)
- 7 open Phase-1 issues: foundation impl (#15), WASM build deps (#16), TS wrapper (#17), integration tests (#18), benchmark (#19), wasm-pack pipeline (#20), validation (#21)

What's missing for a real native build:
1. **No N-API binding crate.** We need a `crates/agentic-flow-quic-node/` or similar that wraps the existing client/server in `napi-rs` for Node.js native modules
2. **No per-platform binary distribution.** Pattern that works for `@ruvector/*` packages: separate `@agentic-flow/quic-native-darwin-arm64`, `@agentic-flow/quic-native-linux-x64-gnu`, etc., resolved at install via `optionalDependencies`
3. **No platform detection in `loadQuicTransport`.** Today the env-var probe is a placeholder; it needs to detect the platform-specific package + try to load it
4. **No CI matrix for cross-compiling Rust → multi-platform binaries.** GitHub Actions Linux/macOS/Windows runners + cross compilation for ARM

## Decision

**Defer the native QUIC binding to a future iteration**, gated on:

1. **Upstream agentic-flow#15-21 progress**. The Phase-1 milestone has the work this ADR depends on. We don't fork that — it's their roadmap.
2. **A concrete federation use case where the WS ceiling matters**. Today's federation traffic is human/agent-rate (≤100 RPS per peer). WebSocket handles that fine. QUIC's wins (0-RTT, multiplexed streams, mobility) only matter under load OR for mobile peers roaming networks.

**When the native binding ships upstream:**

1. Update `agentic-flow` dep range in `@claude-flow/plugin-agent-federation/package.json` to the version that includes native (likely `^2.1` after their Phase-1 closes)
2. Document the `AGENTIC_FLOW_QUIC_NATIVE=1` env var in the federation operator runbook
3. Update doctor surface so `--component federation` reports `selectedBackend=quic` when native is loaded
4. Add a federation-side smoke that asserts `getTransportCapabilities().selectedBackend === 'quic'` when env is set + binding installed
5. Add to the 12h verification routine: probe both backends + confirm the same federation send round-trip works on each

## What this ADR is NOT proposing

- **We won't build the Rust→N-API binding ourselves.** That's upstream work; doing it in our repo creates a fork burden we don't want.
- **We won't switch the default to QUIC** even after native ships. WebSocket is cheaper to debug, has fewer corners, works everywhere. QUIC stays opt-in via env var.
- **We won't drop WebSocket fallback** even after QUIC is solid. The fallback is critical for: browsers, environments where UDP egress is firewall-blocked, debugging cycles where you want a wire-shark-friendly transport.

## Implementation plan (when triggered)

### Phase 1 — Detection

In `agentic-flow/src/transport/quic-loader.ts`:

```typescript
async function isRealQuicAvailable(): Promise<boolean> {
  if (process.env.AGENTIC_FLOW_QUIC_NATIVE !== '1') return false;
  try {
    // Try to load the platform-specific native module
    const platform = `${process.platform}-${process.arch}`;
    const nativeName = `@agentic-flow/quic-native-${platform}`;
    await import(nativeName);
    return true;
  } catch {
    return false;
  }
}
```

### Phase 2 — Federation plugin upgrade

```typescript
// In plugin.ts initialize():
const transport = await loadQuicTransport({
  serverName: nodeId,
  enable0Rtt: true,         // pays off only with native QUIC
  maxConcurrentStreams: 100, // ditto
  // ...
});

// At the doctor surface — capability probe:
const caps = await getTransportCapabilities();
context.logger.info(`Federation transport: ${caps.selectedBackend}` +
  (caps.selectedBackend === 'quic' ? ' (0-RTT, multiplexed streams)' : ' (fallback)'));
```

### Phase 3 — Verification routine update

Add Check 9 to the 12h routine:

```bash
# With native QUIC available:
AGENTIC_FLOW_QUIC_NATIVE=1 node -e '
import("agentic-flow/transport/loader").then(async (m) => {
  const caps = await m.getTransportCapabilities();
  if (caps.selectedBackend !== "quic") {
    console.error("FAIL: native QUIC env set but loader fell back to WS");
    process.exit(1);
  }
  console.log("ok: native QUIC selected");
});
'
```

## Anti-goals

- **No QUIC-or-nothing.** The fallback path stays first-class.
- **No federation-side QUIC implementation.** All transport code lives in `agentic-flow`. The plugin only consumes the loader.
- **No protocol-version pinning.** Whatever QUIC version `quinn` ships, we use. We won't constrain to a specific draft.

## Implementation status

| Step | Status |
|---|---|
| Loader-pattern transport (forward-compat) | Implemented (alpha.9 + ADR-104) |
| `AGENTIC_FLOW_QUIC_NATIVE` env-var probe | Implemented (placeholder returns false today) |
| Native binding (Rust→N-API) | **Deferred — gated on upstream agentic-flow#15-21** |
| Per-platform binary distribution | Deferred |
| Federation-side adoption (env var + doctor surface) | Deferred |
| Verification check | Deferred |

## Decision review trigger

Re-open when:
- Upstream `agentic-flow` ships a native binding (any of #15-21 closing with merged PRs)
- A federation user reports needing >100 RPS to a single peer (WS head-of-line blocking becomes a real problem)
- A federation user reports needing peer mobility (mobile device roaming networks — QUIC's connection ID survives IP changes)
- We add browser peers (rules QUIC out — browsers can't do raw UDP — confirms the WS-default decision)
