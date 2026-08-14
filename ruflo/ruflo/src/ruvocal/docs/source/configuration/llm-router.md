# LLM Router

Chat UI includes an intelligent routing system that automatically selects the best model for each request. When enabled, users see a virtual "Omni" model that routes to specialized models based on the conversation context.

The router uses [katanemo/Arch-Router-1.5B](https://huggingface.co/katanemo/Arch-Router-1.5B) for route selection.

## Configuration

### Basic Setup

```ini
# Arch router endpoint (OpenAI-compatible)
LLM_ROUTER_ARCH_BASE_URL=https://router.huggingface.co/v1
LLM_ROUTER_ARCH_MODEL=katanemo/Arch-Router-1.5B

# Path to your routes policy JSON
LLM_ROUTER_ROUTES_PATH=./config/routes.json
```

### Routes Policy

Create a JSON file defining your routes. Each route specifies:

```json
[
	{
		"name": "coding",
		"description": "Programming, debugging, code review",
		"primary_model": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
		"fallback_models": ["meta-llama/Llama-3.3-70B-Instruct"]
	},
	{
		"name": "casual_conversation",
		"description": "General chat, questions, explanations",
		"primary_model": "meta-llama/Llama-3.3-70B-Instruct"
	}
]
```

### Fallback Behavior

```ini
# Route to use when Arch returns "other"
LLM_ROUTER_OTHER_ROUTE=casual_conversation

# Model to use if Arch selection fails entirely
LLM_ROUTER_FALLBACK_MODEL=meta-llama/Llama-3.3-70B-Instruct

# Selection timeout (milliseconds)
LLM_ROUTER_ARCH_TIMEOUT_MS=10000
```

## Multimodal Routing

When a user sends an image, the router can bypass Arch and route directly to a vision model:

```ini
LLM_ROUTER_ENABLE_MULTIMODAL=true
LLM_ROUTER_MULTIMODAL_MODEL=meta-llama/Llama-3.2-90B-Vision-Instruct
```

## Tools Routing

When a user has MCP servers enabled, the router can automatically select a tools-capable model:

```ini
LLM_ROUTER_ENABLE_TOOLS=true
LLM_ROUTER_TOOLS_MODEL=meta-llama/Llama-3.3-70B-Instruct
```

## UI Customization

Customize how the router appears in the model selector:

```ini
PUBLIC_LLM_ROUTER_ALIAS_ID=omni
PUBLIC_LLM_ROUTER_DISPLAY_NAME=Omni
PUBLIC_LLM_ROUTER_LOGO_URL=https://example.com/logo.png
```

## How It Works

When a user selects Omni:

1. Chat UI sends the conversation context to the Arch router
2. Arch analyzes the content and returns a route name
3. Chat UI maps the route to the corresponding model
4. The request streams from the selected model
5. On errors, fallback models are tried in order

The route selection is displayed in the UI so users can see which model was chosen.

## Message Length Limits

To optimize router performance, message content is trimmed before sending to Arch:

```ini
# Max characters for assistant messages (default: 500)
LLM_ROUTER_MAX_ASSISTANT_LENGTH=500

# Max characters for previous user messages (default: 400)
LLM_ROUTER_MAX_PREV_USER_LENGTH=400
```

The latest user message is never trimmed.
