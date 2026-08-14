---
name: watch
description: Live-stream swarm events and agent activity in real time
---
$ARGUMENTS

Start a live event stream for the active swarm. Use the Monitor tool to run:

`npx @claude-flow/cli@latest swarm watch --stream`

Each line is an NDJSON event (agent spawn, task update, memory write, health ping). Notifications arrive as events occur -- no polling needed.

For one-shot status checks, use `/status` or `npx @claude-flow/cli@latest swarm status` instead.
