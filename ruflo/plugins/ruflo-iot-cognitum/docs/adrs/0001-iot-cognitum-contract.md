---
id: ADR-0001
title: ruflo-iot-cognitum plugin contract — pinning, namespace coordination (compliant), 5-tier device trust + 6 background workers, smoke as contract
status: Accepted
date: 2026-05-04
updated: 2026-05-09
authors:
  - reviewer (Claude Code)
tags: [plugin, iot, cognitum, telemetry, anomaly-detection, trust, witness-chain, namespace, smoke-test]
---

## Context

`ruflo-iot-cognitum` (v0.1.1) — IoT plugin for Cognitum Seed hardware. Surface:

- 4 agents (`device-coordinator`, `telemetry-analyzer`, `fleet-manager`, `witness-auditor`)
- 5 skills (`iot-register`, `iot-fleet`, `iot-anomalies`, `iot-firmware`, `iot-witness-verify`)
- 1 command (`/iot`) with 25 subcommands
- REFERENCE.md (token-optimized)
- 6 documented background workers (HealthProbe, TelemetryIngest, AnomalyScan, MeshSync, FirmwareWatch, WitnessAudit) with intervals + emitted events
- 5-tier device trust model + Z-score anomaly detection + firmware rollout state machine

### Namespace audit

Five AgentDB namespaces already used, **all compliant** with the kebab-case `<plugin-stem>-<intent>` rule from [ruflo-agentdb ADR-0001](../../ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md):

- `iot-devices` (device trust history)
- `iot-telemetry` (telemetry vectors with HNSW indexing M=16, efConstruction=200)
- `iot-telemetry-anomalies` (detected anomalies tagged by type)
- `iot-anomalies` (alias for above per skill)
- `iot-audit` (witness-chain gap records)

No legacy-vs-canonical issue here.

### Gaps

1. No plugin-level ADR.
2. No smoke test.
3. No Compatibility section (hardware + CLI both need pinning).
4. No `device-coordinator` cross-reference to `ruflo-federation`'s 5-tier trust model — they describe similar concepts but for different surfaces (federation peers vs. IoT devices). Worth cross-linking.

## Decision

1. Add this ADR (Proposed).
2. README augment: Compatibility (pin v3.6 + Cognitum Seed firmware compatibility note), explicit Namespace coordination block (already-compliant, just document the contract claim), Verification + Architecture Decisions sections, brief cross-link to ruflo-federation 5-tier trust pattern (different surface, same shape).
3. Bump `0.1.1 → 0.2.0`. Keywords add `mcp`, `cognitum-seed`, `5-tier-trust`.
4. `scripts/smoke.sh` — 12 structural checks: version + keywords; all 5 skills + 4 agents + 1 command; 25 /iot subcommand topics in command file; 6 background workers documented with intervals + events; 5-tier trust model documented; Z-score anomaly detection rules documented (spike/flatline/drift/oscillation/pattern-break/cluster-outlier); v3.6 pin; namespace coordination; ADR Proposed; REFERENCE.md non-empty; no wildcard tools.

## Consequences

**Positive:** plugin joins the cadence. Shared shape with ruflo-federation's 5-tier trust model is now cross-referenced.

**Negative:** none material.

## Verification

```bash
bash plugins/ruflo-iot-cognitum/scripts/smoke.sh
# Expected: "12 passed, 0 failed"
```

## Related

- `plugins/ruflo-agentdb/docs/adrs/0001-agentdb-optimization.md` — namespace convention
- `plugins/ruflo-federation/docs/adrs/0001-federation-contract.md` — 5-tier trust model parallel
- `plugins/ruflo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md` — SONA neural integration

## Implementation status

Plugin version v0.2.0 shipped and listed in marketplace.json. Source exists at `plugins/ruflo-iot-cognitum/`. Contract elements implemented: 5-tier device trust model; 6 background workers (HealthProbe, TelemetryIngest, AnomalyScan, MeshSync, FirmwareWatch, WitnessAudit); namespace coordination compliant; smoke-as-contract gate defined in `scripts/smoke.sh` (12 checks).
