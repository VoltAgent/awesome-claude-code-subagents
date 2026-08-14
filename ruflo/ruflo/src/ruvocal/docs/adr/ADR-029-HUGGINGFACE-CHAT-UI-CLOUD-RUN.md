# ADR-029: HuggingFace Chat UI on Cloud Run — chat.conveyorclaims.ai

## Status
Implemented (2026-02-26), Updated (2026-03-04)

## Date
2026-02-26

## Deployed Services

| Service | URL | Status |
|---------|-----|--------|
| **HF Chat UI** | https://hf-chat-ui-245235083640.us-central1.run.app | Live |
| **Custom Domain** | https://chat.conveyorclaims.ai | Live (SSL: Google Trust Services) |
| **MCP Bridge** | https://mcp-bridge-hwqrrwrlna-uc.a.run.app | Live (5 tools) |

## Context

The current chat system (`extensions-cloudrun/apps/chat-system`) is a custom React + Vite SPA backed by Gemini. While it serves internal workflow needs well (ADR-014, ADR-024, ADR-027), we need a **production-grade, multi-model chat interface** at `chat.conveyorclaims.ai` that:

1. Exposes **GPT-5 family models** (gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, gpt-5.1, gpt-5.2) plus multi-provider models (Google Gemini, Anthropic Claude) using **existing Google Secret Manager keys**
2. Integrates with **existing Cloud Functions** (airtable-agent, db-query-agent, simulation-agent, case-manager, workflow-search) via MCP tool calling
3. Connects to **ruvector-postgres** (10.128.0.2) for vector search over workflow documents (384d all-MiniLM-L6-v2 embeddings, 311 chunks) — all tool/data operations go through PostgreSQL, NOT MongoDB
4. Provides conversation persistence, authentication, and a polished UI out of the box
5. Deploys as a new Cloud Run service alongside the existing chat-system — no disruption

### Database Strategy: Hybrid PostgreSQL + MongoDB

HuggingFace Chat UI **requires MongoDB** for its internal persistence layer (conversations, users, sessions, assistants). This cannot be swapped for PostgreSQL without forking the project. However, **all business data and tool operations** route through ruvector-postgres via the MCP Bridge:

| Layer | Database | Purpose |
|-------|----------|---------|
| **Chat UI internals** | MongoDB (lightweight sidecar or Atlas free tier) | Conversations, user sessions, assistant configs |
| **Business data & tools** | ruvector-postgres (10.128.0.2) | Workflow search, case data, analytics, embeddings |
| **AI provider keys** | Google Secret Manager | `openai-api-key`, `anthropic-api-key`, `google-api-key` |

MongoDB handles only what Chat UI needs internally. All the **real work** — workflow search, case management, analytics, simulations — flows through the existing ruvector-postgres via MCP tools. The MongoDB instance can run as a sidecar container on the same Cloud Run service using the bundled `chat-ui-db` image, requiring **zero additional infrastructure**.

### Multi-Provider Strategy via Google Secret Manager

All AI provider API keys already exist in Google Secret Manager (ADR-004). Chat UI will pull these at runtime:

| Secret ID | Provider | Models |
|-----------|----------|--------|
| `openai-api-key` | OpenAI | GPT-5.2, GPT-5, GPT-5-mini, GPT-5-nano, GPT-4o, o3 |
| `anthropic-api-key` | Anthropic | Claude (when credits refilled) |
| `google-api-key` | Google | Gemini 2.5 Pro/Flash (when key renewed) |

### Why HuggingFace Chat UI

[HuggingFace Chat UI](https://github.com/huggingface/chat-ui) (Apache 2.0, 10,400+ GitHub stars) is the open-source codebase powering HuggingChat. It provides:

- **Native OpenAI-compatible API support** — connects directly to `api.openai.com/v1`, auto-discovers all available models
- **MCP (Model Context Protocol) tool calling** — exposes external APIs as callable tools from within chat
- **Multi-model selector** — users pick from GPT-5, GPT-5-mini, GPT-4o, etc. in a dropdown
- **Smart routing ("Omni")** — auto-selects the best model per query
- **Built-in web search + RAG** — retrieval-augmented generation with search grounding
- **MongoDB-backed persistence** — conversation history, user sessions, assistants (bundled sidecar option eliminates external dependency)
- **OpenID Connect auth** — Google OAuth integration
- **SvelteKit SSR** — fast, server-rendered UI with streaming responses
- **Docker-ready** — pre-built images at `ghcr.io/huggingface/chat-ui`
- **Whisper voice transcription** — speech-to-text input

This eliminates months of custom UI development while providing a superior chat experience.

### Why NOT Modify the Existing Chat System

| Factor | Existing Chat System | HuggingFace Chat UI |
|--------|---------------------|-------------------|
| AI Provider | Gemini-only (tightly coupled) | Any OpenAI-compatible API |
| Model switching | None (ADR-028 proposes abstraction) | Built-in multi-model selector |
| Conversation persistence | LocalStorage only | MongoDB sidecar + ruvector-postgres for tools |
| Tool calling | Custom FunctionExecutor | MCP standard protocol |
| Authentication | Custom Google OAuth | OpenID Connect (standard) |
| Voice input | None | Whisper transcription |
| Web search | None | Built-in RAG |
| Maintenance burden | Custom React/Vite SPA | Community-maintained OSS |

The existing chat system continues serving its current role. This ADR creates a **parallel, GPT-5-powered interface** at a separate domain.

## Decision

Deploy HuggingFace Chat UI as a new Cloud Run service (`hf-chat-ui`) with:
- GPT-5 model family via OpenAI API
- Custom MCP server bridging to existing Cloud Functions
- MongoDB Atlas for conversation persistence
- Google OAuth via OpenID Connect
- Custom domain mapping to `chat.conveyorclaims.ai`
- VPC connector for ruvector-postgres access

---

## Architecture

```
                         ┌─────────────────────────────┐
                         │    chat.conveyorclaims.ai    │
                         │   (Cloud Run Domain Mapping) │
                         └──────────────┬──────────────┘
                                        │ HTTPS
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                    Cloud Run: hf-chat-ui                              │
│                    ghcr.io/huggingface/chat-ui-db                     │
│                    Port 3000, 2Gi RAM, 2 CPU                         │
│                    us-central1, VPC: conveyor-connector               │
│                                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │  SvelteKit  │  │  MCP Client  │  │  Multi-LLM  │  │  MongoDB  │  │
│  │  Frontend   │  │  (Tool Call) │  │  Provider   │  │  Sidecar  │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └───────────┘  │
│         │                │                  │                         │
└─────────┼────────────────┼──────────────────┼─────────────────────────┘
          │                │                  │
          │                │          ┌───────┼───────────────┐
          │                │          │       │               │
          │                ▼          ▼       ▼               ▼
          │       ┌──────────────┐  ┌──────┐ ┌────────┐ ┌─────────┐
          │       │ MCP Bridge   │  │OpenAI│ │ Google │ │Anthropic│
          │       │ (Cloud Run)  │  │ API  │ │Gemini  │ │ Claude  │
          │       │              │  │      │ │ API    │ │ API     │
          │       │ Routes to:   │  │gpt-5 │ │gemini  │ │claude   │
          │       │ Cloud Fns +  │  │gpt-5m│ │2.5-pro │ │sonnet-4 │
          │       │ ruvector-pg  │  │gpt-4o│ │2.5-fl  │ │         │
          │       └──────┬───────┘  │o3    │ │        │ │         │
          │              │          └──────┘ └────────┘ └─────────┘
          │              ▼               Keys from Google Secret Manager
          │  ┌───────────────────────────────────┐
          │  │      Existing Cloud Functions      │
          │  │      (No Changes Required)         │
          │  │                                    │
          │  │  • airtable-agent                  │
          │  │  • db-query-agent                  │
          │  │  • case-manager                    │
          │  │  • simulation-agent                │
          │  │  • workflow-search                 │
          │  └───────────────┬───────────────────┘
          │                  │ VPC (10.128.0.0/20)
          │                  ▼
          │  ┌───────────────────────────────────┐
          │  │     ruvector-postgres VM           │
          └─▶│     10.128.0.2:5432               │
             │     PostgreSQL 17.7 + ruvector    │
             │                                    │
             │  PRIMARY DATA STORE:               │
             │  • workflow_chunks (311 rows)      │
             │  • embeddings (320 vectors, 384d) │
             │  • HNSW index (m=16, ef=64)       │
             │  • Case data, analytics, metrics  │
             └───────────────────────────────────┘
```

---

## Implementation

### Phase 1: MongoDB Sidecar (Bundled with Chat UI)

HuggingFace Chat UI requires MongoDB for internal persistence (conversations, users, sessions). Rather than adding an external MongoDB dependency, we use the **bundled `chat-ui-db` image** which includes MongoDB as a sidecar process. Data is persisted via a Cloud Run volume mount.

**Why sidecar, not Atlas:**
- Zero additional infrastructure or accounts
- No network latency (localhost connection)
- All business data still lives in ruvector-postgres via MCP tools
- MongoDB only stores lightweight chat UI metadata
- If we outgrow this, upgrade to Atlas later (just change `MONGODB_URL`)

**Configuration:**
```ini
# Bundled MongoDB uses local storage — no connection string needed
# The chat-ui-db image starts MongoDB internally on localhost:27017
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=conveyor-chat
```

**Volume mount for persistence** (Cloud Run 2nd gen):
```bash
# Data persists across container restarts via /data volume
# The chat-ui-db image stores MongoDB data at /data/db
```

**Upgrade path:** If conversation volume grows beyond what a sidecar can handle, switch to MongoDB Atlas by updating `MONGODB_URL` in Secret Manager — zero code changes.

### Why MongoDB Cannot Be Avoided

HuggingFace Chat UI is **hardcoded to MongoDB** — its data layer uses MongoDB queries, aggregations, and GridFS throughout the SvelteKit backend. Replacing it with PostgreSQL would require forking the entire project. The sidecar approach (`chat-ui-db` image) bundles MongoDB **inside the same container**, so:

- No external MongoDB service to manage
- No additional infrastructure cost
- No MongoDB Atlas account needed
- Data lives on the container's ephemeral storage (conversations are lightweight and regenerable)
- All **business-critical data** (cases, workflows, embeddings, analytics) stays in ruvector-postgres

Think of MongoDB here as an internal implementation detail of Chat UI — like SQLite in a desktop app. The user never interacts with it directly. Ruvector-postgres remains the **single source of truth** for all Conveyor data.

---

### Phase 2: MCP Bridge Server

The MCP Bridge Server exposes existing Cloud Functions as MCP-compatible tools that Chat UI can call. This is a lightweight Node.js service deployed as a separate Cloud Run service.

**File: `infrastructure/gcp/mcp-bridge/index.js`**

```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

const CLOUD_FUNCTIONS = {
  airtable: "https://airtable-agent-hwqrrwrlna-uc.a.run.app",
  dbQuery:  "https://db-query-agent-hwqrrwrlna-uc.a.run.app",
  caseManager: "https://case-manager-hwqrrwrlna-uc.a.run.app",
  simulation: "https://simulation-agent-hwqrrwrlna-uc.a.run.app",
  workflowSearch: "https://us-central1-new-project-473022.cloudfunctions.net/workflow-search",
};

const server = new McpServer({
  name: "conveyor-tools",
  version: "1.0.0",
});

// Tool: Search workflow documents (vector search via ruvector-postgres)
server.tool(
  "search_workflows",
  "Search CLG workflow procedures, FAQs, and case management steps using semantic search. Returns relevant workflow steps for a given query.",
  {
    query: z.string().describe("Natural language query about workflow procedures"),
    limit: z.number().optional().default(5).describe("Max results to return"),
  },
  async ({ query, limit }) => {
    const resp = await fetch(CLOUD_FUNCTIONS.workflowSearch, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "search", query, limit }),
    });
    const data = await resp.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool: Query database analytics
server.tool(
  "query_database",
  "Run analytics queries against the PostgreSQL database. Supports case metrics, revenue forecasts, and trend analysis.",
  {
    query: z.string().describe("Natural language analytics query"),
    type: z.enum(["metrics", "forecast", "trend", "custom"]).optional().default("metrics"),
  },
  async ({ query, type }) => {
    const resp = await fetch(CLOUD_FUNCTIONS.dbQuery, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, type }),
    });
    const data = await resp.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool: Case management operations
server.tool(
  "manage_case",
  "Look up case status, get next steps, list cases, or perform case management operations via Airtable.",
  {
    action: z.enum(["status", "list", "next_steps", "update"]).describe("Case action"),
    caseId: z.string().optional().describe("Case ID (e.g., C-02420)"),
    filters: z.record(z.string()).optional().describe("Filter criteria for list action"),
  },
  async ({ action, caseId, filters }) => {
    const resp = await fetch(CLOUD_FUNCTIONS.caseManager, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, caseId, filters }),
    });
    const data = await resp.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool: Run RL simulations
server.tool(
  "run_simulation",
  "Run reinforcement learning strategy simulations for case settlement optimization. Uses Q-learning and Monte Carlo methods.",
  {
    scenario: z.string().describe("Simulation scenario description"),
    episodes: z.number().optional().default(1000).describe("Number of simulation episodes"),
    strategy: z.enum(["q_learning", "monte_carlo", "policy_gradient"]).optional().default("q_learning"),
  },
  async ({ scenario, episodes, strategy }) => {
    const resp = await fetch(CLOUD_FUNCTIONS.simulation, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario, episodes, strategy }),
    });
    const data = await resp.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool: Airtable CRUD
server.tool(
  "airtable_query",
  "Query or update Airtable records. Supports listing cases, clients, carriers, and performing CRUD operations.",
  {
    action: z.enum(["list", "get", "create", "update"]).describe("CRUD action"),
    table: z.string().describe("Airtable table name (e.g., Cases, Clients, Carriers)"),
    recordId: z.string().optional().describe("Record ID for get/update"),
    filters: z.record(z.string()).optional().describe("Filter criteria"),
    fields: z.record(z.unknown()).optional().describe("Fields for create/update"),
  },
  async ({ action, table, recordId, filters, fields }) => {
    const resp = await fetch(CLOUD_FUNCTIONS.airtable, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, table, recordId, filters, fields }),
    });
    const data = await resp.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Express HTTP transport
const app = express();

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport("/mcp");
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.listen(3001, () => console.log("MCP Bridge running on :3001"));
```

**Deploy:**
```bash
gcloud run deploy mcp-bridge \
  --source=infrastructure/gcp/mcp-bridge \
  --platform=managed \
  --region=us-central1 \
  --port=3001 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5 \
  --vpc-connector=conveyor-connector \
  --allow-unauthenticated
```

---

### Phase 3: MCP Tool Servers (3 Sources)

Chat UI supports multiple MCP servers simultaneously. We configure **three** to give GPT-5 full access to Conveyor's data ecosystem:

#### MCP Server 1: Conveyor Bridge (Custom — Cloud Functions + ruvector-postgres)

The custom MCP Bridge from Phase 2. Provides 5 tools:

| Tool | Backend | Purpose |
|------|---------|---------|
| `search_workflows` | workflow-search → ruvector-postgres | Semantic search over CLG workflow docs (311 chunks, 384d HNSW) |
| `query_database` | db-query-agent → ruvector-postgres | SQL analytics, revenue forecasts, trend analysis |
| `manage_case` | case-manager → Airtable | Case status lookup, next steps, updates |
| `run_simulation` | simulation-agent | RL strategy simulations (Q-learning, Monte Carlo) |
| `airtable_query` | airtable-agent → Airtable | Generic Airtable CRUD across all tables |

#### MCP Server 2: Official Airtable MCP

[Airtable's official MCP server](https://support.airtable.com/docs/using-the-airtable-mcp-server) provides **direct base access** — no custom bridge needed. This gives GPT-5 full schema awareness and natural language querying.

**Capabilities:**
- List all bases, tables, fields, and views
- Read, create, update, delete records
- Search records with filters
- Schema inspection (field types, options, linked records)
- No additional infrastructure — hosted by Airtable

**Secret:** `airtable-api-key` (already in Google Secret Manager)

```
URL: https://mcp.airtable.com/v0/mcp
Auth: Bearer ${AIRTABLE_API_KEY}
```

> **Why both Airtable MCP AND the Conveyor Bridge airtable tool?** The official Airtable MCP gives raw CRUD access — GPT-5 can browse schemas and build ad-hoc queries. The Conveyor Bridge `manage_case` tool provides **structured, pre-built** case management workflows. Users benefit from both: exploration via Airtable MCP, workflow-guided operations via the bridge.

#### MCP Server 3: Google Drive MCP

[Google's official MCP for Drive](https://cloud.google.com/blog/products/ai-machine-learning/announcing-official-mcp-support-for-google-services) provides access to the CLG Workflow shared drive documents.

**Capabilities:**
- Search files across Drive (including shared drives)
- Read document contents (Docs, Sheets, Slides)
- List files in folders
- Read Google Sheets cells and ranges
- Access the 🔴CLG Workflow shared drive (0AMTB1wrVg9HLUk9PVA)

**Secrets:** `google-client-id`, `google-client-secret` (both in Secret Manager)

```
URL: https://mcp.googleapis.com/v1/drive
Auth: OAuth2 service account or user token
```

> **Why both Google Drive MCP AND the workflow-search tool?** The workflow-search tool provides **vector-indexed semantic search** (HNSW, <50ms) over pre-chunked workflow documents. The Google Drive MCP provides **raw file access** — read any document, list folders, access spreadsheets. Use workflow-search for "what's the process for X?" and Google Drive MCP for "show me the intake form template."

#### Combined Tool Landscape

```
┌─────────────────────────────────────────────────────────────────┐
│                    HF Chat UI — MCP Clients                      │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Conveyor Bridge  │  │ Airtable MCP   │  │ Google Drive MCP│  │
│  │ (Custom)         │  │ (Official)      │  │ (Google)        │  │
│  │                  │  │                 │  │                 │  │
│  │ • search_wf      │  │ • list_bases   │  │ • search_files  │  │
│  │ • query_db       │  │ • list_tables  │  │ • read_doc      │  │
│  │ • manage_case    │  │ • read_records │  │ • list_folder   │  │
│  │ • run_sim        │  │ • create_record│  │ • read_sheets   │  │
│  │ • airtable_query │  │ • update_record│  │ • get_metadata  │  │
│  │                  │  │ • search       │  │                 │  │
│  └────────┬─────────┘  └───────┬────────┘  └───────┬─────────┘  │
│           │                    │                    │             │
└───────────┼────────────────────┼────────────────────┼─────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
   Cloud Functions +      Airtable API        Google Drive API
   ruvector-postgres      (airtable.com)      (googleapis.com)
```

---

### Phase 4: Multi-Provider Model Configuration

All API keys are pulled from **Google Secret Manager** at runtime via Cloud Run `--set-secrets`. The MODELS environment variable configures multi-provider access.

#### Secrets Used (all already exist in Secret Manager)

| Secret ID | Env Var | Provider |
|-----------|---------|----------|
| `openai-api-key` | `OPENAI_API_KEY` | OpenAI (GPT-5 family) |
| `anthropic-api-key` | `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `google-api-key` | `GOOGLE_API_KEY` | Google (Gemini) |

#### Model Lineup

```ini
MODELS=`[
  {
    "name": "gpt-5.2",
    "id": "gpt-5.2",
    "displayName": "GPT-5.2 (Latest)",
    "description": "OpenAI's latest flagship model. Best for complex reasoning and analysis.",
    "supportsTools": true,
    "parameters": {
      "temperature": 0.7,
      "max_new_tokens": 4096
    },
    "endpoints": [{
      "type": "openai",
      "baseURL": "https://api.openai.com/v1"
    }]
  },
  {
    "name": "gpt-5.2-pro",
    "id": "gpt-5.2-pro",
    "displayName": "GPT-5.2 Pro",
    "description": "Pro tier with extended reasoning. Best for complex case analysis.",
    "supportsTools": true,
    "parameters": {
      "temperature": 0.5,
      "max_new_tokens": 8192
    },
    "endpoints": [{
      "type": "openai",
      "baseURL": "https://api.openai.com/v1"
    }]
  },
  {
    "name": "gpt-5",
    "id": "gpt-5",
    "displayName": "GPT-5",
    "description": "Strong general-purpose reasoning. Good balance of speed and quality.",
    "supportsTools": true,
    "parameters": {
      "temperature": 0.7,
      "max_new_tokens": 4096
    },
    "endpoints": [{
      "type": "openai",
      "baseURL": "https://api.openai.com/v1"
    }]
  },
  {
    "name": "gpt-5-mini",
    "id": "gpt-5-mini",
    "displayName": "GPT-5 Mini",
    "description": "Fast and cost-effective. Great for FAQ lookups and simple workflow queries.",
    "supportsTools": true,
    "parameters": {
      "temperature": 0.7,
      "max_new_tokens": 4096
    },
    "endpoints": [{
      "type": "openai",
      "baseURL": "https://api.openai.com/v1"
    }]
  },
  {
    "name": "gpt-5-nano",
    "id": "gpt-5-nano",
    "displayName": "GPT-5 Nano",
    "description": "Ultra-fast for simple queries. Lowest cost per token.",
    "supportsTools": true,
    "parameters": {
      "temperature": 0.7,
      "max_new_tokens": 2048
    },
    "endpoints": [{
      "type": "openai",
      "baseURL": "https://api.openai.com/v1"
    }]
  },
  {
    "name": "gpt-4o",
    "id": "gpt-4o",
    "displayName": "GPT-4o (Multimodal)",
    "description": "Multimodal model. Upload images of documents, forms, or damage photos.",
    "multimodal": true,
    "supportsTools": true,
    "parameters": {
      "temperature": 0.5,
      "max_new_tokens": 4096
    },
    "endpoints": [{
      "type": "openai",
      "baseURL": "https://api.openai.com/v1"
    }]
  },
  {
    "name": "o3",
    "id": "o3",
    "displayName": "o3 (Reasoning)",
    "description": "Advanced reasoning model. Best for complex legal/financial analysis.",
    "supportsTools": false,
    "parameters": {
      "max_new_tokens": 4096
    },
    "endpoints": [{
      "type": "openai",
      "baseURL": "https://api.openai.com/v1"
    }]
  },
  {
    "name": "gemini-2.5-pro",
    "id": "gemini-2.5-pro",
    "displayName": "Gemini 2.5 Pro (Google)",
    "description": "Google's most capable model. Already used in the existing chat system.",
    "supportsTools": true,
    "parameters": {
      "temperature": 0.7,
      "max_new_tokens": 4096
    },
    "endpoints": [{
      "type": "openai",
      "baseURL": "https://generativelanguage.googleapis.com/v1beta/openai",
      "apiKey": "${GOOGLE_API_KEY}"
    }]
  },
  {
    "name": "gemini-2.5-flash",
    "id": "gemini-2.5-flash",
    "displayName": "Gemini 2.5 Flash (Google)",
    "description": "Google's fast model. Good for quick workflow lookups.",
    "supportsTools": true,
    "parameters": {
      "temperature": 0.7,
      "max_new_tokens": 4096
    },
    "endpoints": [{
      "type": "openai",
      "baseURL": "https://generativelanguage.googleapis.com/v1beta/openai",
      "apiKey": "${GOOGLE_API_KEY}"
    }]
  },
  {
    "name": "claude-sonnet-4",
    "id": "claude-sonnet-4",
    "displayName": "Claude Sonnet 4 (Anthropic)",
    "description": "Anthropic's balanced model. Strong instruction following and coding.",
    "supportsTools": true,
    "parameters": {
      "temperature": 0.7,
      "max_new_tokens": 4096
    },
    "endpoints": [{
      "type": "openai",
      "baseURL": "https://api.anthropic.com/v1",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "defaultHeaders": {
        "anthropic-version": "2023-06-01"
      }
    }]
  }
]`
```

> **Note:** Google and Anthropic keys are currently expired/out of credits (tested 2026-02-26). Models will show as unavailable until keys are renewed. OpenAI GPT-5 models are **confirmed working** with $100 balance. Chat UI gracefully handles unavailable providers — users simply see those models greyed out.

---

### Phase 4: Chat UI Cloud Run Deployment

#### 4a. Secrets Setup (All Already Exist)

All required secrets already exist in Google Secret Manager (verified 2026-02-26). Just verify access:

```bash
# All 8 secrets needed for hf-chat-ui
SECRETS=(
  openai-api-key        # GPT-5 models
  anthropic-api-key     # Claude models
  google-api-key        # Gemini models
  airtable-api-key      # Airtable MCP
  airtable-base-id      # Airtable base reference
  google-client-id      # Google OAuth + Drive MCP
  google-client-secret   # Google OAuth + Drive MCP
  gemini-api-key        # Backup Gemini key
)

# Verify all secrets exist
for secret in "${SECRETS[@]}"; do
  echo -n "$secret: "
  gcloud secrets versions access latest --secret="$secret" \
    --project=new-project-473022 2>/dev/null | head -c 12 && echo "... ✓" || echo "MISSING"
done

# Grant access to compute service account
for secret in "${SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --project=new-project-473022 \
    --member="serviceAccount:245235083640-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet 2>/dev/null || true
done
```

**Secrets inventory for this deployment:**

| Secret | Purpose | Status |
|--------|---------|--------|
| `openai-api-key` | GPT-5 model access | Active ($100 balance) |
| `anthropic-api-key` | Claude model access | Needs credits |
| `google-api-key` | Gemini model access | Needs renewal |
| `airtable-api-key` | Airtable MCP direct access | Active |
| `airtable-base-id` | Airtable base reference | Active |
| `google-client-id` | Google OAuth + Drive MCP | Active |
| `google-client-secret` | Google OAuth + Drive MCP | Active |
| `gemini-api-key` | Backup Gemini key | Active |

#### 4b. Environment File

**File: `infrastructure/gcp/hf-chat-ui/.env.production`**

```ini
# ── Model Provider ──────────────────────────────────────
OPENAI_BASE_URL=https://api.openai.com/v1
# OPENAI_API_KEY injected from Secret Manager

# ── Database ────────────────────────────────────────────
# MONGODB_URL injected from Secret Manager
MONGODB_DB_NAME=conveyor-chat

# ── Branding ────────────────────────────────────────────
PUBLIC_APP_NAME=Conveyor AI
PUBLIC_APP_DESCRIPTION=Insurance Case Management & Revenue Operations Assistant powered by GPT-5
PUBLIC_ORIGIN=https://chat.conveyorclaims.ai

# ── Authentication (Google OAuth) ───────────────────────
OPENID_PROVIDER_URL=https://accounts.google.com
OPENID_CLIENT_ID=245235083640-gkbo4otq57lqeisuigcat0bg037f49oc.apps.googleusercontent.com
# OPENID_CLIENT_SECRET injected from Secret Manager
OPENID_SCOPES=openid profile email
OPENID_NAME_CLAIM=name
COOKIE_SECURE=true
COOKIE_SAMESITE=lax

# ── MCP Tools (3 servers: Custom Bridge + Airtable + Google Drive) ──
MCP_SERVERS=`[
  {
    "name": "Conveyor Tools",
    "description": "Workflow search, DB analytics, case management, simulations via ruvector-postgres and Cloud Functions",
    "url": "https://mcp-bridge-hwqrrwrlna-uc.a.run.app/mcp"
  },
  {
    "name": "Airtable",
    "description": "Direct Airtable base access — browse tables, search records, create/update cases, view schemas",
    "url": "https://mcp.airtable.com/v0/mcp",
    "headers": {
      "Authorization": "Bearer ${AIRTABLE_API_KEY}"
    }
  },
  {
    "name": "Google Drive",
    "description": "Search and read CLG Workflow documents, forms, and templates from Google Drive shared folders",
    "url": "https://mcp.googleapis.com/v1/drive",
    "headers": {
      "Authorization": "Bearer ${GOOGLE_DRIVE_TOKEN}"
    }
  }
]`
MCP_TOOL_TIMEOUT_MS=30000

# ── Smart Router ────────────────────────────────────────
LLM_ROUTER_FALLBACK_MODEL=gpt-5
LLM_ROUTER_ENABLE_TOOLS=true
LLM_ROUTER_TOOLS_MODEL=gpt-5.2
PUBLIC_LLM_ROUTER_DISPLAY_NAME=Auto (Omni)
PUBLIC_LLM_ROUTER_ALIAS_ID=omni

# ── Voice ───────────────────────────────────────────────
TRANSCRIPTION_MODEL=openai/whisper-large-v3-turbo

# ── Web Search ──────────────────────────────────────────
USE_LOCAL_WEBSEARCH=true

# ── Features ────────────────────────────────────────────
LLM_SUMMARIZATION=true
ENABLE_DATA_EXPORT=true
ALLOW_IFRAME=false

# ── Rate Limits ─────────────────────────────────────────
USAGE_LIMITS={"messagesPerMinute": 20, "conversations": 100, "tools": 50}

# ── System Prompt (Conveyor Identity) ───────────────────
TASK_MODEL=gpt-5-mini
```

#### 4c. Cloud Build Configuration

**File: `infrastructure/gcp/hf-chat-ui/cloudbuild.yaml`**

```yaml
steps:
  # Step 1: Pull the pre-built HuggingFace Chat UI image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['pull', 'ghcr.io/huggingface/chat-ui:latest']

  # Step 2: Tag for GCR
  - name: 'gcr.io/cloud-builders/docker'
    args: [
      'tag',
      'ghcr.io/huggingface/chat-ui:latest',
      'gcr.io/${PROJECT_ID}/hf-chat-ui:${_VERSION}'
    ]

  # Step 3: Push versioned tag
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/${PROJECT_ID}/hf-chat-ui:${_VERSION}']

  # Step 4: Push latest tag
  - name: 'gcr.io/cloud-builders/docker'
    args: [
      'tag',
      'gcr.io/${PROJECT_ID}/hf-chat-ui:${_VERSION}',
      'gcr.io/${PROJECT_ID}/hf-chat-ui:latest'
    ]
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/${PROJECT_ID}/hf-chat-ui:latest']

  # Step 5: Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args: [
      'run', 'deploy', 'hf-chat-ui',
      '--image', 'gcr.io/${PROJECT_ID}/hf-chat-ui:${_VERSION}',
      '--platform', 'managed',
      '--region', 'us-central1',
      '--port', '3000',
      '--memory', '2Gi',
      '--cpu', '2',
      '--min-instances', '0',
      '--max-instances', '10',
      '--timeout', '300',
      '--vpc-connector', 'conveyor-connector',
      '--allow-unauthenticated',
      '--set-env-vars', 'OPENAI_BASE_URL=https://api.openai.com/v1,MONGODB_DB_NAME=conveyor-chat,PUBLIC_APP_NAME=Conveyor AI,PUBLIC_ORIGIN=https://chat.conveyorclaims.ai,LLM_SUMMARIZATION=true,ENABLE_DATA_EXPORT=true',
      '--set-secrets', 'OPENAI_API_KEY=openai-api-key:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,GOOGLE_API_KEY=google-api-key:latest,AIRTABLE_API_KEY=airtable-api-key:latest,GOOGLE_CLIENT_ID=google-client-id:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest',
    ]

substitutions:
  _VERSION: 'v1'

options:
  logging: CLOUD_LOGGING_ONLY
timeout: 600s
```

---

### Phase 5: Custom Domain Mapping

#### 5a. Map `chat.conveyorclaims.ai` to Cloud Run

```bash
# Verify domain ownership (one-time)
gcloud domains verify conveyorclaims.ai --project=new-project-473022

# Map custom domain to the Cloud Run service
gcloud run domain-mappings create \
  --service=hf-chat-ui \
  --domain=chat.conveyorclaims.ai \
  --region=us-central1 \
  --project=new-project-473022
```

#### 5b. DNS Configuration

Add these DNS records at your domain registrar for `conveyorclaims.ai`:

| Type | Name | Value |
|------|------|-------|
| CNAME | `chat` | `ghs.googlehosted.com.` |

Google manages the SSL certificate automatically. Provisioning takes 15-30 minutes after DNS propagation.

#### 5c. Google OAuth Redirect URI

Add `https://chat.conveyorclaims.ai/login/callback` to the authorized redirect URIs in the Google Cloud Console:

```
Console → APIs & Services → Credentials → OAuth 2.0 Client ID
→ Authorized redirect URIs → Add:
   https://chat.conveyorclaims.ai/login/callback
```

---

### Phase 6: System Prompt Configuration

Create a custom assistant in the Chat UI that embeds Conveyor's identity and formatting rules (from ADR-027):

```json
{
  "name": "Conveyor AI",
  "preprompt": "You are Conveyor AI, an Insurance Case Management & Revenue Operations Assistant for CLG (Claims Litigation Group).\n\n## Your Capabilities\n- Case management: Look up case status, next steps, due dates, assigned roles\n- Workflow guidance: Step-by-step procedures from CLG workflow documents\n- Revenue forecasting: Analytics and trend analysis\n- Strategy optimization: RL-based settlement strategy simulations\n- Airtable operations: Query and update case records\n\n## Response Style\n- Start conversationally: 'Great question —', 'Yes —', 'Got it —'\n- Use emoji markers: ✅ ❌ ⚠️ 🔑 💰 📌 for scannability\n- Bold field names: **Next Steps**, **Case Status**, **RS Due Date**\n- End with a key takeaway: 🔑 or 🧠 summary\n- Offer proactive follow-up: 'If you want, I can also...'\n- NEVER expose: similarity scores, chunk IDs, function names, JSON, silo numbers\n- ALWAYS attribute sources by document name: 'Referrals Workflow', 'FAQ's'\n\n## Available Tools\nYou have access to Conveyor Tools via MCP. Use them to:\n- search_workflows: Search CLG workflow procedures and FAQs\n- query_database: Run analytics against PostgreSQL\n- manage_case: Look up or update case status via Airtable\n- run_simulation: Run RL strategy simulations\n- airtable_query: Direct Airtable CRUD operations",
  "model": "gpt-5.2"
}
```

This can be set as the default assistant via MongoDB or via the `ASSISTANTS` environment variable.

---

## Deployment Runbook

### Quick Deploy (4 commands)

All secrets already exist in Google Secret Manager. No new secrets needed.

```bash
# 1. Deploy Chat UI to Cloud Run (bundled MongoDB sidecar via chat-ui-db image)
gcloud run deploy hf-chat-ui \
  --image=ghcr.io/huggingface/chat-ui-db:latest \
  --platform=managed \
  --region=us-central1 \
  --port=3000 \
  --memory=2Gi \
  --cpu=2 \
  --min-instances=1 \
  --max-instances=10 \
  --timeout=300 \
  --vpc-connector=conveyor-connector \
  --allow-unauthenticated \
  --set-env-vars="OPENAI_BASE_URL=https://api.openai.com/v1,MONGODB_URL=mongodb://localhost:27017,MONGODB_DB_NAME=conveyor-chat,PUBLIC_APP_NAME=Conveyor AI,PUBLIC_ORIGIN=https://chat.conveyorclaims.ai,LLM_SUMMARIZATION=true,ENABLE_DATA_EXPORT=true,ALLOW_IFRAME=false,USE_LOCAL_WEBSEARCH=true" \
  --set-secrets="OPENAI_API_KEY=openai-api-key:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,GOOGLE_API_KEY=google-api-key:latest,AIRTABLE_API_KEY=airtable-api-key:latest,GOOGLE_CLIENT_ID=google-client-id:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest" \
  --project=new-project-473022

# 2. Deploy MCP Bridge (connects Chat UI tools to existing Cloud Functions + ruvector-postgres)
gcloud run deploy mcp-bridge \
  --source=infrastructure/gcp/mcp-bridge \
  --platform=managed \
  --region=us-central1 \
  --port=3001 \
  --memory=512Mi \
  --cpu=1 \
  --vpc-connector=conveyor-connector \
  --allow-unauthenticated \
  --project=new-project-473022

# 3. Map custom domain
gcloud run domain-mappings create \
  --service=hf-chat-ui \
  --domain=chat.conveyorclaims.ai \
  --region=us-central1 \
  --project=new-project-473022

# 4. Add DNS CNAME record at registrar
# chat.conveyorclaims.ai → ghs.googlehosted.com.
```

---

## Cost Estimate

| Component | Monthly Cost |
|-----------|-------------|
| **Cloud Run (hf-chat-ui + MongoDB sidecar)** | ~$8-30 (min-instances=1 for MongoDB persistence) |
| **Cloud Run (mcp-bridge)** | ~$2-10 (lightweight, auto-scales to 0) |
| **MongoDB** | $0 (bundled sidecar, no external service) |
| **ruvector-postgres** | $0 (already running for existing services) |
| **OpenAI API (GPT-5)** | Variable — depends on usage |
| **Google/Anthropic APIs** | Variable — uses existing Secret Manager keys |
| **SSL Certificate** | $0 (Google-managed) |
| **Custom Domain** | $0 (CNAME mapping is free) |
| **Total Infrastructure** | ~$10-40/month + AI provider usage |

---

## Consequences

### Positive
- **Immediate GPT-5 access** — no custom UI development needed
- **Multi-model selection** — users choose GPT-5, GPT-5-mini, GPT-4o, o3, etc.
- **MCP tool integration** — reuses all existing Cloud Functions without modification
- **Production-grade** — conversation history, auth, streaming, voice input out of the box
- **Community maintained** — 10,400+ stars, active development by HuggingFace
- **Zero disruption** — existing chat system continues operating independently
- **Cost effective** — MongoDB sidecar eliminates external DB cost, ruvector-postgres already running
- **Multi-provider resilience** — if one AI provider is down, users switch to another

### Negative
- **SvelteKit, not React** — different tech stack from existing chat system; team needs familiarity
- **MongoDB sidecar** — Chat UI requires MongoDB internally; sidecar approach means min-instances=1 for data persistence (Cloud Run stateless otherwise)
- **Less control** — upstream UI changes may require adaptation; customization is via env vars and assistants, not code
- **MCP bridge overhead** — extra network hop for tool calls (mitigated by Cloud Run co-location)

### Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| MongoDB sidecar data loss on scale-to-zero | Set min-instances=1; conversations are recoverable (AI can regenerate) |
| OpenAI API costs spike | Set `USAGE_LIMITS` to cap messages per minute; use gpt-5-nano for simple queries |
| HuggingFace Chat UI breaking changes | Pin to specific image tag, test before upgrading |
| MCP bridge latency | Co-locate in us-central1, same VPC as Cloud Functions |
| Custom domain SSL delay | Allow 24h for certificate provisioning |
| Provider key expiration | All keys in Secret Manager — rotate without redeployment |

---

## Updated Architecture Diagram (Full System)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                          GOOGLE CLOUD PLATFORM                                    │
│                          Project: new-project-473022                              │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                       VPC Network (conveyor-vpc)                             │  │
│  │                                                                              │  │
│  │  ┌─────────────────────────────────────────────────────────────┐             │  │
│  │  │                    Cloud Run Services                        │             │  │
│  │  │                                                              │             │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │             │  │
│  │  │  │  hf-chat-ui  │  │ chat-system  │  │  mcp-bridge  │      │             │  │
│  │  │  │  (NEW)       │  │ (existing)   │  │  (NEW)       │      │             │  │
│  │  │  │              │  │              │  │              │      │             │  │
│  │  │  │ SvelteKit    │  │ React+Vite   │  │ MCP Server   │      │             │  │
│  │  │  │ GPT-5 models │  │ Gemini       │  │ Tool bridge  │      │             │  │
│  │  │  │ Port 3000    │  │ Port 8080    │  │ Port 3001    │      │             │  │
│  │  │  └──────┬───────┘  └──────────────┘  └──────┬───────┘      │             │  │
│  │  │         │                                     │              │             │  │
│  │  │         │chat.conveyorclaims.ai               │              │             │  │
│  │  └─────────┼─────────────────────────────────────┼──────────────┘             │  │
│  │            │                                     │                            │  │
│  │  ┌────────┼─────────────────────────────────────┼───────────────────┐        │  │
│  │  │        │         Cloud Functions              │                   │        │  │
│  │  │        │                                      │                   │        │  │
│  │  │        │  • airtable-agent  ◄─────────────────┤                   │        │  │
│  │  │        │  • db-query-agent  ◄─────────────────┤                   │        │  │
│  │  │        │  • case-manager    ◄─────────────────┤                   │        │  │
│  │  │        │  • simulation-agent◄─────────────────┤                   │        │  │
│  │  │        │  • workflow-search ◄─────────────────┘                   │        │  │
│  │  │        │                                                          │        │  │
│  │  └────────┼──────────────────────────────────────────────────────────┘        │  │
│  │           │                                                                   │  │
│  │  ┌────────▼─────────┐                                                         │  │
│  │  │  ruvector-postgres│                                                        │  │
│  │  │  10.128.0.2:5432 │                                                        │  │
│  │  │  PostgreSQL 17.7  │                                                        │  │
│  │  │  ruvector 2.0.1   │                                                        │  │
│  │  └──────────────────┘                                                         │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
│  ┌───────────────────────────┐    ┌───────────────────────────────────┐              │
│  │  Secret Manager           │    │  AI Providers (Multi-Provider)    │              │
│  │  • openai-api-key         │    │  • OpenAI    → GPT-5 family      │              │
│  │  • anthropic-api-key      │    │  • Google    → Gemini 2.5        │              │
│  │  • google-api-key         │    │  • Anthropic → Claude Sonnet 4   │              │
│  │  • airtable-api-key       │    └───────────────────────────────────┘              │
│  │  • ruvector-db-password   │                                                       │
│  └───────────────────────────┘                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Service Inventory (Post-Implementation)

| Service | Domain | Purpose | Tools/Models |
|---------|--------|---------|--------------|
| **hf-chat-ui** (NEW) | `chat.conveyorclaims.ai` | Multi-provider chat with 3 MCP tool servers | GPT-5.2, GPT-5, GPT-5-mini, GPT-4o, o3, Gemini 2.5, Claude Sonnet 4 |
| **mcp-bridge** (NEW) | internal | Custom MCP → Cloud Functions + ruvector-postgres | 5 tools (search, query, case, sim, airtable) |
| **Airtable MCP** (external) | `mcp.airtable.com` | Official Airtable direct access | Schema browse, CRUD, search |
| **Google Drive MCP** (external) | `mcp.googleapis.com` | Official Google Drive access | File search, doc read, sheets |
| **chat-system** (existing) | `chat-system-*.run.app` | Gemini-powered workflow chat | gemini-2.5-pro/flash |
| **mcp-server** (existing) | `mcp-server-*.run.app` | General MCP server | N/A |

---

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: MongoDB Atlas | 1 hour | Free cluster + secret in Secret Manager |
| Phase 2: MCP Bridge | 2-3 hours | Cloud Run service with 5 tools |
| Phase 3: Model Config | 30 min | MODELS env var with 7 GPT-5 variants |
| Phase 4: Chat UI Deploy | 1-2 hours | Cloud Run service from pre-built image |
| Phase 5: Domain Mapping | 1-24 hours | `chat.conveyorclaims.ai` live (DNS propagation) |
| Phase 6: System Prompt | 30 min | Default Conveyor AI assistant |
| **Total** | **~1 day** | Full deployment |

---

## Next Steps

1. **Approve this ADR** and proceed to Phase 1 (MongoDB Atlas)
2. Build and deploy the MCP Bridge server (Phase 2)
3. Deploy Chat UI with GPT-5 models (Phases 3-4)
4. Configure DNS and custom domain (Phase 5)
5. Test end-to-end: model selection → tool calling → workflow search → response
6. Configure Conveyor AI assistant with system prompt (Phase 6)
7. Update ADR-028 to reference this parallel deployment

---

## Post-Deployment Updates (2026-03-03)

### Update 1: Google OIDC Authentication

Added Google OAuth login to restrict access to authenticated users only.

**Configuration approach:** HF Chat UI reads OIDC settings from the `DOTENV_LOCAL` environment variable, which acts as an in-memory `.env.local` file. Individual `OPENID_*` env vars are NOT read by Chat UI — they must be inside `DOTENV_LOCAL`.

**OAuth client:** `245235083640-gkbo4otq57lqeisuigcat0bg037f49oc.apps.googleusercontent.com` (Web Application type)

**Secret:** `google-client-secret` in Secret Manager (version 2) — `GOCSPX-QzuZ-...`

**Redirect URI:** `https://chat.conveyorclaims.ai/login/callback` (added manually in Google Cloud Console → APIs & Services → Credentials)

**OIDC env vars added to DOTENV_LOCAL:**
```ini
OPENID_PROVIDER_URL=https://accounts.google.com
OPENID_CLIENT_ID=245235083640-gkbo4otq57lqeisuigcat0bg037f49oc.apps.googleusercontent.com
OPENID_SCOPES=openid profile email
OPENID_NAME_CLAIM=name
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
```

**Key lesson:** IAP OAuth clients (`*-9lt8...`) cannot be used for custom web OIDC flows — they are locked to IAP-specific redirect patterns. Only standard Web Application OAuth clients work.

**Files modified:**
- `infrastructure/gcp/hf-chat-ui/update-preprompt.js` — added OIDC vars to DOTENV_LOCAL output
- `infrastructure/gcp/hf-chat-ui/cloudbuild.yaml` — added OIDC env vars + `OPENID_CLIENT_SECRET` secret binding
- `infrastructure/gcp/hf-chat-ui/deploy.sh` — added OIDC env vars + secret binding

### Update 2: Branded Welcome Animation

Replaced the default HuggingFace `omni-welcome.gif` with a branded "Conveyor AI" animated GIF matching the Three.js `AnimatedBackground.tsx` aesthetic from the existing chat system.

**Design:**
- 480x320px, 90 frames (3s @ 30fps), ~1.75 MB
- Dark background `#0d0d1a`
- Rotating wireframe geometric shapes (icosahedron + octahedron) in cyan/blue/indigo
- Scattered glowing dots matching blue-500/sky-500/indigo-500 palette
- "Conveyor AI" text centered with subtle glow effect

**Implementation:**
- `infrastructure/gcp/hf-chat-ui/generate-welcome.cjs` — Node.js script using `canvas` + `gif-encoder-2` (`.cjs` extension required because root `package.json` has `"type": "module"`)
- `infrastructure/gcp/hf-chat-ui/Dockerfile` — extends `ghcr.io/huggingface/chat-ui-db:latest`, copies branded GIF to `/app/build/client/chatui/omni-welcome.gif` and `/app/static/chatui/omni-welcome.gif`
- `infrastructure/gcp/hf-chat-ui/cloudbuild.yaml` — changed from pull+tag to Docker build with custom Dockerfile

### Update 3: MCP Bridge Tool Mapping Fixes

Fixed all 5 tool-to-Cloud-Function mappings in the MCP Bridge. Every tool was sending incorrect or missing parameters to its backend Cloud Function.

| Tool | Issue | Fix |
|------|-------|-----|
| `search_workflows` | Was working | No change needed |
| `query_database` | Missing `action` field entirely | Added `action: "nl_query"` |
| `manage_case` | Sent `status` as action, backend expects `get` | Map `status` → `get`, `next_steps` → `get` |
| `run_simulation` | Missing `action` field, wrong field names | Added `action: "run_qlearning"`, mapped `scenario` → `caseType`, `episodes` → `iterations` |
| `airtable_query` | Wrong field name `table` (backend expects `tableName`), wrong action names | Map `list` → `query`, `get` → `get_case_status`, `create`/`update` → `upsert` |

**File modified:** `infrastructure/gcp/mcp-bridge/index.js`

### Update 4: Natural Language to SQL (db-query-agent)

Added `nl_query` action to the db-query-agent Cloud Function. This enables natural language questions like "How many cases were opened this month?" to be converted to SQL via Gemini.

**Flow:** Natural language → Gemini generates SQL → validate (no DROP/DELETE) → execute against ruvector-postgres → return results

**File modified:** `infrastructure/gcp/functions/db-query-agent/index.js`

### Update 5: Multi-Provider Chat Completions Proxy

Added an OpenAI-compatible `/chat/completions` proxy to the MCP Bridge that routes requests to the correct AI provider based on model name. This enables HF Chat UI to use `OPENAI_BASE_URL` pointing to the MCP Bridge, which then routes:
- `gpt-*`, `o*-*` models → OpenAI API
- `gemini-*` models → Google Generative Language API

Also added `/models` endpoint returning only the curated model list (7 models) instead of the full OpenAI model catalog (114+ models).

**File modified:** `infrastructure/gcp/mcp-bridge/index.js`

### Deployment Status (2026-03-03)

| Component | Deployed? | Notes |
|-----------|-----------|-------|
| HF Chat UI (with OIDC + branded GIF) | Yes | Custom Docker image with Dockerfile |
| MCP Bridge (with tool fixes + proxy) | Yes | All 5 tools validated working |
| db-query-agent (with nl_query) | Yes | Entry point: `dbQueryAgent` |

---

## Post-Deployment Updates (2026-03-04)

### Update 6: Server-Side API Key Fix

Fixed 401 errors where the MCP Bridge was forwarding the user's Google OAuth token to OpenAI instead of using the server-side API key.

**Root cause:** `getKey: (req) => req.headers.authorization?.replace("Bearer ", "") || process.env.OPENAI_API_KEY` extracted the OIDC session token `ya29.A0A...` and sent it to OpenAI.

**Fix:** Changed to `getKey: () => process.env.OPENAI_API_KEY` — always use server-side key. Added `OPENAI_API_KEY=openai-api-key:latest` to MCP bridge `cloudbuild.yaml` `--set-secrets`.

### Update 7: Airtable Table Name Mapping

Added `TABLE_MAP` to the MCP Bridge to translate friendly table names to actual Airtable table names. The LLM sends `"table": "Cases"` but Airtable expects `"All Cases (dev)"`.

| Friendly Name | Actual Airtable Name |
|---------------|---------------------|
| Cases | All Cases (dev) |
| Managed Cases | Managed Cases (dev) |
| Clients / Contacts | Contacts |
| Carriers / Partners | Co-Counsel & Referral Partners |
| Users | Conveyor Users |
| Invoices | Invoices |
| Payments | Payments |
| Emails | Emails |

### Update 8: Case Search by Number and Client Name

Enhanced `airtable_query` tool to support searching by case number or client name instead of only listing all records.

- Added `search` action and `search` parameter to tool schema
- Case number patterns (e.g., `C-01748`) route to `get_case_status` for precise lookup
- Name searches use `query` with `{search: searchTerm}` for fuzzy matching
- `manage_case` status/next_steps now route to airtable-agent's `get_case_status` for better results

### Update 9: Table-Aware Search Formula

Fixed "Unknown field names" errors when searching non-case tables. The airtable-agent search formula previously hardcoded `{Case Number}` which doesn't exist in tables like `Co-Counsel & Referral Partners`.

**Fix:** Added `TABLE_SEARCH_FIELDS` map in `airtable-agent/index.js`:

| Table | Search Fields |
|-------|--------------|
| All Cases (dev) | Case Number |
| Contacts | Full Name, Email |
| Co-Counsel & Referral Partners | Partner Name |
| Invoices | Invoice Number, Reference Number |
| Conveyor Users | Full Name, Email Address |

### Update 10: Multi-Provider Model Catalog (17 Models)

Expanded from 7 models to 17 models across 6 providers. Gemini 2.5 Pro set as default (first position).

| Provider | Route | Models |
|----------|-------|--------|
| Google (direct) | Gemini API | Gemini 2.5 Pro (Default), Gemini 2.5 Flash |
| OpenAI (direct) | OpenAI API | GPT-5.2 Pro, GPT-5, GPT-5 Mini, GPT-4o, o4-mini |
| Anthropic | OpenRouter | Claude Sonnet 4.6, Claude Opus 4.6 |
| Google next-gen | OpenRouter | Gemini 3 Pro Preview, Gemini 3 Flash Preview |
| DeepSeek | OpenRouter | DeepSeek V3.2 |
| Mistral | OpenRouter | Mistral Large, Devstral |
| xAI | OpenRouter | Grok 4.1 Fast |
| OpenAI latest | OpenRouter | GPT-5.3 Chat, GPT-5.3 Codex |

**MCP Bridge routing logic:** Models with `/` in the name (e.g., `anthropic/claude-sonnet-4.6`) route to OpenRouter. Models starting with `gemini-` route to Google direct. All others route to OpenAI direct.

### Update 11: Docker-Baked Configuration

Moved MODELS config from Cloud Run env vars to Docker image `.env.local` file. The full MODELS JSON with 17 model preprompts exceeds the 32KB Cloud Run env var limit.

**Architecture:** `update-preprompt.js` generates `dotenv-local.txt` → Dockerfile copies to `/app/.env.local` → HF Chat UI reads at startup. Cloud Run env vars provide secrets only (API keys via Secret Manager).

### Update 12: PWA Icon and Session Cookies

- Added 144x144 PNG icon to Dockerfile (fixes `/chat/chatui/icon-144x144.png` 404)
- Added `COOKIE_MAX_AGE=604800` (7-day sessions) to reduce OAuth redirect frequency

### Deployment Status (2026-03-04)

| Component | Version | Status |
|-----------|---------|--------|
| HF Chat UI | hf-chat-ui-00026 | Live — 17 models, OIDC, branded GIF, PWA icon |
| MCP Bridge | v2026030419xx | Live — OpenRouter routing, table mapping, search |
| airtable-agent | Gen2 | Live — table-aware search formula |
| db-query-agent | Gen2 | Live — nl_query action |

---

## Related ADRs

| ADR | Relationship |
|-----|-------------|
| ADR-014 | Existing chat system architecture (continues independently) |
| ADR-015 | Cloud Functions reused via MCP Bridge |
| ADR-022 | Workflow documents in ruvector-postgres searched via tools |
| ADR-024 | Workflow context injection pattern adapted for MCP tools |
| ADR-027 | Response formatting rules carried into system prompt |
| ADR-028 | OpenAI GPT-5 integration in existing chat system (complementary) |
