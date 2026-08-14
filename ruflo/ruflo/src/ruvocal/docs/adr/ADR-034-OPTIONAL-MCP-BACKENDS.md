# ADR-034: Optional MCP Backends — Claude Code, Gemini, Codex

**Status:** Accepted
**Date:** 2026-03-05
**Context:** chat-ui-mcp MCP Bridge

## Context

ADR-033 added ruvector (61 tools) and ruflo (215 tools) as default MCP backends. Users also want access to additional AI agent capabilities:

- **Claude Code** — Anthropic's coding agent with file editing, bash execution, and code analysis tools
- **Gemini MCP** — Google's Gemini model with conversation context management, multimodal capabilities
- **OpenAI Codex** — OpenAI's coding agent for code generation and execution

These require their own API keys and have different resource profiles, so they should be **opt-in** rather than default.

## Decision

Add three optional MCP backends that can be enabled via environment variables. Unlike ruvector/ruflo (enabled by default), these are **disabled by default** and require explicit API keys.

### Backend Configuration

| Backend | Env Toggle | API Key Required | Command | Default |
|---------|-----------|-----------------|---------|---------|
| ruvector | `ENABLE_RUVECTOR` | None | `npx ruvector mcp start` | **enabled** |
| ruflo | `ENABLE_RUFLO` | None | `npx ruflo mcp start` | **enabled** |
| Claude Code | `ENABLE_CLAUDE_CODE` | `ANTHROPIC_API_KEY` | `claude mcp serve` | disabled |
| Gemini MCP | `ENABLE_GEMINI_MCP` | `GOOGLE_API_KEY` | `npx gemini-mcp-server` | disabled |
| Codex | `ENABLE_CODEX` | `OPENAI_API_KEY` | `npx @openai/codex mcp serve` | disabled |

### Architecture

All backends use the same `StdioMcpClient` from ADR-033. Tools are namespaced by backend name:

```
ruvector__hooks_route      → ruvector MCP
ruflo__agent_spawn         → ruflo MCP
claude__Read               → Claude Code MCP
gemini__chat               → Gemini MCP
codex__execute             → Codex MCP
```

```
┌───────────────────────────────────────────────────────┐
│  MCP Bridge (/mcp)                                    │
│                                                       │
│  Built-in:  search, web_research, system_guide        │
│                                                       │
│  Default backends (always-on):                        │
│  ┌─────────────┐  ┌──────────────┐                   │
│  │ ruvector(61)│  │ ruflo (215) │                   │
│  └─────────────┘  └──────────────┘                   │
│                                                       │
│  Optional backends (API key required):                │
│  ┌──────────────┐  ┌───────────┐  ┌───────────────┐ │
│  │ Claude Code  │  │ Gemini    │  │ OpenAI Codex │ │
│  │ (opt-in)     │  │ (opt-in)  │  │ (opt-in)     │ │
│  └──────────────┘  └───────────┘  └───────────────┘ │
└───────────────────────────────────────────────────────┘
```

### Enabling Optional Backends

```env
# .env file
ENABLE_CLAUDE_CODE=true
ANTHROPIC_API_KEY=sk-ant-...

ENABLE_GEMINI_MCP=true
GOOGLE_API_KEY=AIzaSy...   # already set for Gemini models

ENABLE_CODEX=true
OPENAI_API_KEY=sk-...      # already set for OpenAI models
```

### Security Considerations

1. **API keys stay server-side** — keys are only in the bridge container's env vars, never exposed to the browser
2. **Optional by default** — backends that require API keys are disabled unless explicitly enabled
3. **Graceful degradation** — if a backend fails to start (bad key, network error), built-in and other backends continue working
4. **Namespace isolation** — tool name prefixing prevents cross-backend collisions

### Resource Impact

| Backend | Memory | CPU | Startup Time |
|---------|--------|-----|-------------|
| ruvector | ~30MB | Low | ~3s |
| ruflo | ~50MB | Low | ~5s |
| Claude Code | ~100MB | Medium | ~5s |
| Gemini MCP | ~40MB | Low | ~4s |
| Codex | ~80MB | Medium | ~5s |

With all 5 backends enabled, the bridge container needs ~800MB memory.

## Consequences

### Positive
- Users can access Claude, Gemini, and Codex capabilities directly from HF Chat UI
- Single `/mcp` endpoint — no client-side config changes
- Opt-in model keeps default resource usage low
- API keys shared with the chat proxy (no additional secrets needed for Gemini/OpenAI)

### Negative
- Claude Code requires `@anthropic-ai/claude-code` installed (large package)
- Each optional backend adds ~40-100MB memory when enabled
- More child processes to manage in the container

### Mitigations
- Backends pre-installed in Docker image for fast startup
- Disabled by default — only started when explicitly enabled
- Health endpoint reports backend status for debugging

## Related

- [ADR-033: RuVector + Ruflo MCP Integration](ADR-033-RUVECTOR-RUFLO-MCP-INTEGRATION.md)
- [ADR-032: RVF Private MCP Tunnel](ADR-032-RVF-PRIVATE-MCP-TUNNEL.md)
- [ADR-029: HuggingFace Chat UI Cloud Run](ADR-029-HUGGINGFACE-CHAT-UI-CLOUD-RUN.md)
