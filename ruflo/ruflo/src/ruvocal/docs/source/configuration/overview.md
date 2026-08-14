# Configuration Overview

Chat UI is configured through environment variables. Default values are in `.env`; override them in `.env.local` or via your environment.

## Required Configuration

Chat UI connects to any OpenAI-compatible API endpoint:

```ini
OPENAI_BASE_URL=https://router.huggingface.co/v1
OPENAI_API_KEY=hf_************************
```

Models are automatically discovered from `${OPENAI_BASE_URL}/models`. No manual model configuration is required.

## Database

```ini
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=chat-ui
```

For development, `MONGODB_URL` is optional - Chat UI falls back to an embedded MongoDB that persists to `./db`.

## Model Overrides

To customize model behavior, use the `MODELS` environment variable (JSON5 format):

```ini
MODELS=`[
  {
    "id": "meta-llama/Llama-3.3-70B-Instruct",
    "name": "Llama 3.3 70B",
    "multimodal": false,
    "supportsTools": true
  }
]`
```

Override properties:

- `id` - Model identifier (must match an ID from the `/models` endpoint)
- `name` - Display name in the UI
- `multimodal` - Enable image uploads
- `supportsTools` - Enable MCP tool calling for models that don’t advertise tool support
- `parameters` - Override default parameters (temperature, max_tokens, etc.)

## Task Model

Set a specific model for internal tasks (title generation, etc.):

```ini
TASK_MODEL=meta-llama/Llama-3.1-8B-Instruct
```

If not set, the current conversation model is used.

## Voice Transcription

Enable voice input with Whisper:

```ini
TRANSCRIPTION_MODEL=openai/whisper-large-v3-turbo
TRANSCRIPTION_BASE_URL=https://router.huggingface.co/hf-inference/models
```

## Feature Flags

```ini
LLM_SUMMARIZATION=true          # Enable automatic conversation title generation
ENABLE_DATA_EXPORT=true         # Allow users to export their data
ALLOW_IFRAME=false              # Disallow embedding in iframes (set to true to allow)
```

## User Authentication

Use OpenID Connect for authentication:

```ini
OPENID_CLIENT_ID=your_client_id
OPENID_CLIENT_SECRET=your_client_secret
OPENID_SCOPES="openid profile"
```

See [OpenID configuration](./open-id) for details.

## Environment Variable Reference

See the [`.env` file](https://github.com/huggingface/chat-ui/blob/main/.env) for the complete list of available options.
