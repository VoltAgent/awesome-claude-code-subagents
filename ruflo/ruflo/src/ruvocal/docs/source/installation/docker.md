# Running on Docker

Pre-built Docker images are available:

- **`ghcr.io/huggingface/chat-ui-db`** - Includes MongoDB (recommended for quick setup)
- **`ghcr.io/huggingface/chat-ui`** - Requires external MongoDB

## Quick Start (with bundled MongoDB)

```bash
docker run -p 3000:3000 \
  -e OPENAI_BASE_URL=https://router.huggingface.co/v1 \
  -e OPENAI_API_KEY=hf_*** \
  -v chat-ui-data:/data \
  ghcr.io/huggingface/chat-ui-db
```

## With External MongoDB

If you have an existing MongoDB instance:

```bash
docker run -p 3000:3000 \
  -e OPENAI_BASE_URL=https://router.huggingface.co/v1 \
  -e OPENAI_API_KEY=hf_*** \
  -e MONGODB_URL=mongodb://host.docker.internal:27017 \
  ghcr.io/huggingface/chat-ui
```

Use `host.docker.internal` to reach MongoDB running on your host machine, or provide your MongoDB Atlas connection string.

## Using an Environment File

For more configuration options, use `--env-file` to avoid leaking secrets in shell history:

```bash
docker run -p 3000:3000 \
  --env-file .env.local \
  -v chat-ui-data:/data \
  ghcr.io/huggingface/chat-ui-db
```

See the [configuration overview](../configuration/overview) for all available environment variables.
