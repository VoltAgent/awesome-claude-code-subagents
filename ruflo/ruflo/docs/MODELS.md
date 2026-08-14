# Model Configuration

## Adding Models

Models are configured in `config/config.json` under the `models` array. Each model needs:

```json
{
  "name": "model-id",
  "displayName": "Friendly Name",
  "description": "Short description shown in model picker",
  "provider": "gemini|openai|openrouter",
  "supportsTools": true,
  "multimodal": false,
  "parameters": { "temperature": 0.7 }
}
```

## Providers

| Provider | Model Name Pattern | API Key Env Var | Secret Name |
|----------|-------------------|-----------------|-------------|
| `gemini` | `gemini-*` | `GOOGLE_API_KEY` | `google-api-key` |
| `openai` | `gpt-*`, `o3-*`, `o4-*` | `OPENAI_API_KEY` | `openai-api-key` |
| `openrouter` | `vendor/model-name` | `OPENROUTER_API_KEY` | `openrouter-api-key` |

The MCP Bridge auto-detects the provider from the model name:
- Starts with `gemini-` → Google Gemini API
- Contains `/` → OpenRouter
- Everything else → OpenAI

## Example Configurations

### Gemini-only (free tier friendly)
```json
"models": [
  { "name": "gemini-2.5-pro", "displayName": "Gemini 2.5 Pro", "provider": "gemini", "supportsTools": true },
  { "name": "gemini-2.5-flash", "displayName": "Gemini 2.5 Flash", "provider": "gemini", "supportsTools": true }
]
```

### Multi-provider
```json
"models": [
  { "name": "gemini-2.5-pro", "displayName": "Gemini 2.5 Pro", "provider": "gemini", "supportsTools": true },
  { "name": "gpt-4o", "displayName": "GPT-4o", "provider": "openai", "multimodal": true, "supportsTools": true },
  { "name": "anthropic/claude-sonnet-4.6", "displayName": "Claude Sonnet", "provider": "openrouter", "supportsTools": true }
]
```
