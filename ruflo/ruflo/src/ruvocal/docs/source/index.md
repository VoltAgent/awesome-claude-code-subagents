# Chat UI

Open source chat interface with support for tools, multimodal inputs, and intelligent routing across models. The app uses MongoDB and SvelteKit behind the scenes. Try the live version called [HuggingChat on hf.co/chat](https://huggingface.co/chat) or [setup your own instance](./installation/local).

Chat UI connects to any OpenAI-compatible API endpoint, making it work with:

- [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers)
- [Ollama](https://ollama.ai)
- [llama.cpp](https://github.com/ggerganov/llama.cpp)
- [OpenRouter](https://openrouter.ai)
- Any other OpenAI-compatible service

**[MCP Tools](./configuration/mcp-tools)**: Function calling via Model Context Protocol (MCP) servers

**[LLM Router](./configuration/llm-router)**: Intelligent routing to select the best model for each request

**[Multimodal](./configuration/overview)**: Image uploads on models that support vision

**[OpenID](./configuration/open-id)**: Optional user authentication via OpenID Connect

## Quickstart

**Step 1 - Create `.env.local`:**

```ini
OPENAI_BASE_URL=https://router.huggingface.co/v1
OPENAI_API_KEY=hf_************************
```

You can use any OpenAI-compatible endpoint:

| Provider     | `OPENAI_BASE_URL`                  | `OPENAI_API_KEY` |
| ------------ | ---------------------------------- | ---------------- |
| Hugging Face | `https://router.huggingface.co/v1` | `hf_xxx`         |
| Ollama       | `http://127.0.0.1:11434/v1`        | `ollama`         |
| llama.cpp    | `http://127.0.0.1:8080/v1`         | `sk-local`       |
| OpenRouter   | `https://openrouter.ai/api/v1`     | `sk-or-v1-xxx`   |

**Step 2 - Install and run:**

```bash
git clone https://github.com/huggingface/chat-ui
cd chat-ui
npm install
npm run dev -- --open
```

That's it! Chat UI will automatically discover available models from your endpoint.

> [!TIP]
> MongoDB is optional for development. When `MONGODB_URL` is not set, Chat UI uses an embedded database that persists to `./db`.

For production deployments, see the [installation guides](./installation/local).
