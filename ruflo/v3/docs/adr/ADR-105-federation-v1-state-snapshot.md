# ADR-105 — Federation v1 state snapshot (post-alpha.9)

- Status: **Accepted — Reference document**
- Date: 2026-05-09
- Authors: claude (drafted with rUv)
- Related: [ADR-097](./ADR-097-federation-budget-circuit-breaker.md), [ADR-104](./ADR-104-federation-wire-transport.md), [ADR-106](./ADR-106-peer-discovery.md), [ADR-107](./ADR-107-federation-tls.md), [ADR-108](./ADR-108-native-quic-binding.md), [ADR-109](./ADR-109-receive-side-dispatch.md), [ADR-110](./ADR-110-production-spend-reporter.md)

## Purpose

Single source of truth for "where is federation today, what works, what's deferred, and where to look for each piece." Updated on every plugin alpha bump that changes the answer.

## Snapshot as of 2026-05-09 (post-`@claude-flow/plugin-agent-federation@1.0.0-alpha.9`)

### What works end-to-end

| Capability | ADR | Implementation | Validated |
|---|---|---|---|
| Cryptographic identity (Ed25519, persisted) | (pre-existing G2) | `plugin.ts` keypair persistence, `@noble/ed25519` for sign/verify | Cross-OS install + load |
| PII pipeline | (pre-existing) | `domain/services/pii-pipeline-service.ts` | 44 tests |
| Trust levels (UNTRUSTED → PRIVILEGED) | (pre-existing) | `domain/entities/trust-level.ts` + `application/trust-evaluator.ts` | 31 tests |
| Budget envelope + hop counter | ADR-097 P1 | `domain/value-objects/federation-budget.ts` | 41 tests |
| Peer state machine (ACTIVE/SUSPENDED/EVICTED) | ADR-097 P2.a | `domain/value-objects/federation-node-state.ts` + `domain/entities/federation-node.ts` | 27 tests |
| Breaker service + outbound short-circuit | ADR-097 P2.b | `application/federation-breaker-service.ts` | 25 tests |
| Cost-tracker consumer (ruflo-cost-tracker) | ADR-097 P3 consumer | `plugins/ruflo-cost-tracker/scripts/federation.mjs` | Integration |
| Coordinator `reportSpend()` + `SpendReporter` interface | ADR-097 P3 upstream | `application/spend-reporter.ts` (`InMemorySpendReporter` reference) | 10 tests |
| 3 operator MCP tools (`federation_breaker_status`, `_evict`, `_reactivate`) | ADR-097 P4 | `mcp-tools.ts` | 11 coordinator tests |
| `ruflo doctor --component federation` health-check | ADR-097 P4 | `v3/@claude-flow/cli/src/commands/doctor.ts` | Smoke |
| Wire transport (WebSocket fallback today, QUIC roadmap) | ADR-104 | Plugin imports `agentic-flow/transport/loader` | Live mac↔ruvultra over tailscale, 150ms send |

### What's deferred (each its own ADR)

| Gap | ADR | Status | Why deferred |
|---|---|---|---|
| Auto peer discovery (mDNS/Bonjour) — today only `staticPeers` config | [ADR-106](./ADR-106-peer-discovery.md) | Proposed | mDNS binding choice (`bonjour-service` vs `multicast-dns`) needs a security review for tailnet vs LAN scopes |
| TLS pinning for cross-tailnet federation — today assumes WireGuard | [ADR-107](./ADR-107-federation-tls.md) | Proposed | Cert lifecycle is a real ops concern; not blocking today's intra-tailnet use case |
| Native QUIC binding — today WS fallback, native lives behind `AGENTIC_FLOW_QUIC_NATIVE=1` | [ADR-108](./ADR-108-native-quic-binding.md) | Proposed | Upstream agentic-flow Phase-1 issues #15-21 need to land first; we don't fork that |
| Receive-side dispatch — today inbound bytes accepted but coordinator not woken | [ADR-109](./ADR-109-receive-side-dispatch.md) | In progress this iteration | Smallest, highest-value gap; closing it makes federation truly bidirectional |
| Production `SpendReporter` adapter — today `InMemorySpendReporter` reference impl only | [ADR-110](./ADR-110-production-spend-reporter.md) | In progress this iteration | One-screenful adapter; was deferred only because it touches the cost-tracker plugin's memory-namespace contract |

### Ship-side artifacts (npm)

| Package | Tag | Version |
|---|---|---|
| `@claude-flow/plugin-agent-federation` | `alpha` | `1.0.0-alpha.9` |
| `@claude-flow/cli` | `alpha`/`latest`/`v3alpha` | `3.7.0-alpha.20` |
| `claude-flow` | `alpha`/`latest`/`v3alpha` | `3.7.0-alpha.20` |
| `ruflo` | `alpha`/`latest`/`v3alpha` | `3.7.0-alpha.20` |
| `agentic-flow` (companion fix) | `fix` | `2.0.12-fix.2` (until [ruvnet/agentic-flow#153](https://github.com/ruvnet/agentic-flow/pull/153) merges) |

### Plugin surface (alpha.9)

- **13 MCP tools**: `federation_init`, `federation_join`, `federation_peers`, `federation_send`, `federation_query`, `federation_status`, `federation_trust`, `federation_audit`, `federation_breaker_status`, `federation_evict`, `federation_reactivate`, `federation_report_spend`, `federation_consensus`
- **8 services in container**: `federation:coordinator`, `federation:discovery`, `federation:audit`, `federation:pii`, `federation:trust`, `federation:policy`, `federation:routing`, `federation:transport`
- **Public exports**: `AgentFederationPlugin`, `FederationCoordinator`, `FederationNode`, `FederationNodeState`, `FederationBreakerService`, `InMemorySpendReporter`, `evaluatePolicy`, `DEFAULT_BREAKER_POLICY`, plus types

### Test coverage

- **450 unit tests** across 14 test files in `__tests__/unit/`
- Cross-OS validated on macOS arm64 + Linux x64
- Witness manifest carries 91 signed fixes (Ed25519); CI re-verifies on every push across 3 OSes (linux/macos/windows)
- 12-hour scheduled remote agent runs 8 verification checks against published packages, files GitHub issues on regressions, escalates `@ruvnet` after 3 occurrences

### Operator entry points

```bash
# Install
npm install @claude-flow/plugin-agent-federation@alpha

# Health-check
npx ruflo@latest doctor --component federation

# Inspect breaker (from MCP context)
federation_breaker_status

# Manually evict misbehaving peer
federation_evict { "nodeId": "...", "correlationId": "ops-ticket-N" }

# Reactivate after probe
federation_reactivate { "nodeId": "...", "correlationId": "probe-ok-N" }

# Report actual cost from downstream completion
federation_report_spend { "peerId": "...", "tokensUsed": ..., "usdSpent": ..., "success": true }
```

## Maintenance protocol

This document is updated by the agent that bumps the federation plugin version. Specifically: the commit that bumps `package.json` should include an edit to ADR-105 reflecting the new state. The 12h verification routine flags drift between this document and the published artifacts.

## Decision

This ADR exists as a **navigation document**, not a decision record. Its status is `Accepted — Reference` and it is intentionally lightweight — when the answer to "what's the current state" changes, only this document needs editing. The substantive decisions live in their per-ADR files.
