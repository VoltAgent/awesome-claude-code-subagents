# ADR-033: RuVector + Ruflo MCP Tool Integration

**Status:** Accepted
**Date:** 2026-03-04
**Context:** chat-ui-mcp MCP Bridge

## Context

The MCP bridge initially shipped with 3 built-in tools (search, web_research, system_guide). Users want access to the full ruvector (10 tools) and ruflo (205+ tools) ecosystems from within the HF Chat UI without running separate MCP servers.

### Tool Inventory

| Backend | Tools | Categories |
|---------|-------|------------|
| **ruvector** | 10 | Intelligence (hooks_stats, hooks_route, hooks_remember, hooks_recall, hooks_init, hooks_pretrain, hooks_build_agents, hooks_verify, hooks_doctor, hooks_export) |
| **ruflo** | 205+ | Agent (7), Swarm (4), Memory (7), Config (6), Hooks (40+), Task (6), Session (5), Hive-mind (9), Workflow (9), Analyze (4), Progress (4), AIDefence (6), AgentDB (14+) |

## Decision

Integrate ruvector and ruflo as **stdio MCP child processes** spawned by the bridge, with tool calls proxied through the existing `/mcp` HTTP endpoint.

### Architecture

```
┌─────────────────────────────────────────────────┐
│  HF Chat UI (browser)                           │
│  MCP_SERVERS: http://mcp-bridge:3001/mcp        │
└─────────────────┬───────────────────────────────┘
                  │  JSON-RPC 2.0 over HTTP
                  ▼
┌─────────────────────────────────────────────────┐
│  MCP Bridge (Express)                           │
│                                                 │
│  ┌──────────────────┐  ┌─────────────────────┐ │
│  │  Built-in Tools   │  │  StdioMcpClient    │ │
│  │  • search         │  │  ┌───────────────┐ │ │
│  │  • web_research   │  │  │ ruvector (10) │ │ │
│  │  • system_guide   │  │  └───────────────┘ │ │
│  └──────────────────┘  │  ┌───────────────┐ │ │
│                         │  │ ruflo (205+)  │ │ │
│                         │  └───────────────┘ │ │
│                         └─────────────────────┘ │
└─────────────────────────────────────────────────┘
        ▲  stdin/stdout (JSON-RPC)  ▲
        │                           │
   npx ruvector mcp start    npx ruflo mcp start
```

### Key Design Decisions

1. **Namespaced tool names**: External tools are prefixed with `{backend}__` (e.g., `ruvector__hooks_route`, `ruflo__agent_spawn`) to avoid name collisions with built-in tools.

2. **Lazy startup**: Backends initialize after Express starts listening, so the bridge is immediately available for health checks. If a backend fails to start, built-in tools still work.

3. **Environment toggle**: Each backend can be disabled via `ENABLE_RUVECTOR=false` or `ENABLE_RUFLO=false` for deployments that don't need all tools.

4. **Graceful shutdown**: SIGTERM/SIGINT handlers kill child processes cleanly.

5. **Timeout protection**: Each tool call has a 30s timeout. Backend initialization has a 15s timeout.

## Implementation

### StdioMcpClient

A reusable client class that:
- Spawns a child process with the MCP server command
- Sends JSON-RPC messages over stdin, reads responses from stdout
- Manages pending request map with UUID correlation IDs
- Handles newline-delimited JSON protocol
- Auto-discovers tools via `tools/list` on initialization

### Tool Routing

```
tools/call request
  → name starts with "{backend}__"?
    → YES: strip prefix, route to StdioMcpClient.callTool()
    → NO: route to built-in executeTool()
```

### Configuration

```env
# In docker-compose.yml or .env
ENABLE_RUVECTOR=true    # default: true
ENABLE_RUFLO=true       # default: true
```

## Consequences

### Positive
- 215+ tools available from HF Chat UI without separate MCP server management
- Single `/mcp` endpoint — no client-side config changes needed
- Built-in tools work even if backends fail to start
- Namespacing prevents tool name collisions

### Negative
- Additional memory/CPU for child processes (~50MB each)
- First request may be slow while npx resolves packages
- Backend stderr goes to bridge logs (noisy)

### Mitigations
- Backends are optional (env toggle)
- npx caches packages after first run
- Startup is non-blocking

## Related

- [ADR-029: HuggingFace Chat UI Cloud Run](ADR-029-HUGGINGFACE-CHAT-UI-CLOUD-RUN.md)
- [ADR-030: MCP Tool Gap Analysis](ADR-030-MCP-TOOL-GAP-ANALYSIS.md)
- [ADR-032: RVF Private MCP Tunnel](ADR-032-RVF-PRIVATE-MCP-TUNNEL.md)
