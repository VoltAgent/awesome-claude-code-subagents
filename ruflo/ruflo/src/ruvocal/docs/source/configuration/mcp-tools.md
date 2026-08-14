# MCP Tools

Chat UI supports tool calling via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). MCP servers expose tools that models can invoke during conversations.

## Server Types

Chat UI supports two types of MCP servers:

### Base Servers (Admin-configured)

Base servers are configured by the administrator via environment variables. They appear for all users and can be enabled/disabled per-user but not removed.

```ini
MCP_SERVERS=[
  {"name": "Web Search (Exa)", "url": "https://mcp.exa.ai/mcp"},
  {"name": "Hugging Face", "url": "https://hf.co/mcp"}
]
```

Each server entry requires:

- `name` - Display name shown in the UI
- `url` - MCP server endpoint URL
- `headers` (optional) - Custom headers for authentication

### User Servers (Added from UI)

Users can add their own MCP servers directly from the UI:

1. Open the chat input and click the **+** button (or go to Settings)
2. Select **MCP Servers**
3. Click **Add Server**
4. Enter the server name and URL
5. Run **Health Check** to verify connectivity

User-added servers are stored in the browser and can be removed at any time. They work alongside base servers.

## User Token Forwarding

When users are logged in via Hugging Face, you can forward their access token to MCP servers:

```ini
MCP_FORWARD_HF_USER_TOKEN=true
```

This allows MCP servers to access user-specific resources on their behalf.

## Using Tools

1. Enable the servers you want to use from the MCP Servers panel
2. Start chatting - models will automatically use tools when appropriate

### Model Requirements

Not all models support tool calling. To enable tools for a specific model, add it to your `MODELS` override:

```ini
MODELS=`[
  {
    "id": "meta-llama/Llama-3.3-70B-Instruct",
    "supportsTools": true
  }
]`
```

## Tool Execution Flow

When a model decides to use a tool:

1. The model generates a tool call with parameters
2. Chat UI executes the call against the MCP server
3. Results are displayed in the chat as a collapsible "tool" block
4. Results are fed back to the model for follow-up responses

## Integration with LLM Router

When using the [LLM Router](./llm-router), you can configure automatic routing to a tools-capable model:

```ini
LLM_ROUTER_ENABLE_TOOLS=true
LLM_ROUTER_TOOLS_MODEL=meta-llama/Llama-3.3-70B-Instruct
```

When a user has MCP servers enabled and selects the Omni model, the router will automatically use the specified tools model.
