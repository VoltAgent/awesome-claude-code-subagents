---
name: federation
description: Manage cross-installation agent federation
---
$ARGUMENTS
Manage federation peers, trust, and audit logs. Parse subcommand from $ARGUMENTS.

Usage: /federation <subcommand> [options]

Subcommands:
- `init` -- Generate keypair and initialize federation
- `join <endpoint>` -- Connect to a federation peer
- `leave` -- Leave the federation gracefully
- `peers` -- List known peers with trust levels
- `send <node-id> <message-type> <payload>` -- Send a message to a peer with optional budget controls (ADR-097)
- `status` -- Show federation health, sessions, metrics
- `audit [--compliance hipaa|soc2|gdpr] [--since DATE]` -- Query audit logs
- `trust <node-id> [--review]` -- View trust score breakdown
- `config [--pii-policy PATH]` -- Configure PII policies and compliance mode

Budget options for `send` (all optional, ADR-097 Phase 1; defaults preserve legacy unbounded behavior except `maxHops` floors at 8 to defang recursion):
- `--max-hops N` -- max hop chain length (default `8`, `0` disallows remote delegation)
- `--max-tokens N` -- cumulative token cap across the hop chain (default unbounded)
- `--max-usd N` -- cumulative USD cap across the hop chain (default unbounded)
- `--hop-count N` -- starting hop count (default `0`; pass-through when re-forwarding)
- `--spent-tokens N` / `--spent-usd N` -- caller-reported usage from previous legs

Errors return constant strings (`HOP_LIMIT_EXCEEDED`, `BUDGET_EXCEEDED`, `INVALID_BUDGET`) with no remaining-budget echo.

Steps by subcommand:

**init**: `npx -y -p @claude-flow/plugin-agent-federation@latest ruflo-federation init`
**join**: `npx -y -p @claude-flow/plugin-agent-federation@latest ruflo-federation join ENDPOINT`
**leave**: `npx -y -p @claude-flow/plugin-agent-federation@latest ruflo-federation leave`
**peers**: `npx -y -p @claude-flow/plugin-agent-federation@latest ruflo-federation peers`
**send**: `npx -y -p @claude-flow/plugin-agent-federation@latest ruflo-federation send NODE_ID MSG_TYPE PAYLOAD [--max-hops N] [--max-tokens N] [--max-usd N] [--hop-count N] [--spent-tokens N] [--spent-usd N]`
**status**: `npx -y -p @claude-flow/plugin-agent-federation@latest ruflo-federation status`
**audit**: `npx -y -p @claude-flow/plugin-agent-federation@latest ruflo-federation audit --compliance MODE --since DATE`
**trust**: `npx -y -p @claude-flow/plugin-agent-federation@latest ruflo-federation trust NODE_ID --review`
**config**: `npx -y -p @claude-flow/plugin-agent-federation@latest ruflo-federation config --pii-policy PATH`
