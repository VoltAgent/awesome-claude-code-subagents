# Running Locally

## Quick Start

1. Create a `.env.local` file with your API credentials:

```ini
OPENAI_BASE_URL=https://router.huggingface.co/v1
OPENAI_API_KEY=hf_************************
```

2. Install and run:

```bash
npm install
npm run dev -- --open
```

That's it! Chat UI will discover available models automatically from your endpoint.

## Configuration

Chat UI connects to any OpenAI-compatible API. Set `OPENAI_BASE_URL` to your provider:

| Provider     | `OPENAI_BASE_URL`                  |
| ------------ | ---------------------------------- |
| Hugging Face | `https://router.huggingface.co/v1` |
| Ollama       | `http://127.0.0.1:11434/v1`        |
| llama.cpp    | `http://127.0.0.1:8080/v1`         |
| OpenRouter   | `https://openrouter.ai/api/v1`     |

See the [configuration overview](../configuration/overview) for all available options.

## Database

For **development**, MongoDB is optional. When `MONGODB_URL` is not set, Chat UI uses an embedded MongoDB server that persists data to the `./db` folder.

For **production**, you should use a dedicated MongoDB instance:

### Option 1: Local MongoDB (Docker)

```bash
docker run -d -p 27017:27017 -v mongo-chat-ui:/data --name mongo-chat-ui mongo:latest
```

Then set `MONGODB_URL=mongodb://localhost:27017` in `.env.local`.

### Option 2: MongoDB Atlas (Managed)

Use [MongoDB Atlas free tier](https://www.mongodb.com/pricing) for a managed database. Copy the connection string to `MONGODB_URL`.

## Running in Production

For production deployments:

```bash
npm install
npm run build
npm run preview
```

The server listens on `http://localhost:4173` by default.
