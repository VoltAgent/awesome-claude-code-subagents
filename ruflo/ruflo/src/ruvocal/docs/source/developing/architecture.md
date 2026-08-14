# Architecture

This document provides a high-level overview of the Chat UI codebase. If you're looking to contribute or understand how the codebase works, this is the place for you!

## Overview

Chat UI provides a simple interface connecting LLMs to external tools via MCP. The project uses [MongoDB](https://www.mongodb.com/) and [SvelteKit](https://kit.svelte.dev/) with [Tailwind](https://tailwindcss.com/).

Key architectural decisions:

- **OpenAI-compatible only**: All model interactions use the OpenAI API format
- **MCP for tools**: Tool calling is handled via Model Context Protocol servers
- **Auto-discovery**: Models are discovered from the `/models` endpoint

## Code Map

### `routes`

All routes rendered with SSR via SvelteKit. The majority of backend and frontend logic lives here, with shared modules in `lib` (client) and `lib/server` (server).

### `textGeneration`

Provides a standard interface for chat features including model output, tool calls, and streaming. Outputs `MessageUpdate`s for fine-grained status updates (new tokens, tool results, etc.).

### `endpoints`

Provides the streaming interface for OpenAI-compatible endpoints. Models are fetched and cached from `${OPENAI_BASE_URL}/models`.

### `mcp`

Implements MCP client functionality for tool discovery and execution. See [MCP Tools](../configuration/mcp-tools) for configuration.

### `llmRouter`

Intelligent routing logic that selects the best model for each request. Uses the Arch router model for classification. See [LLM Router](../configuration/llm-router) for details.

### `migrations`

MongoDB migrations for maintaining backwards compatibility across schema changes. Any schema changes must include a migration.

## Development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173` with hot reloading.
