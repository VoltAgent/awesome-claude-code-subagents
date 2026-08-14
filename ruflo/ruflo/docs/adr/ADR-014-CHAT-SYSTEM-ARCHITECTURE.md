# ADR-014: Conveyor AI Chat System Architecture

**Status:** Implemented
**Date:** 2026-01-19
**Verified:** All Cloud Functions operational including suggestion-agent (see ADR-015)
**Author:** Conveyor AI Team
**Deciders:** Engineering, Product, DevOps, Security
**Related:** ADR-001-EXTENSION-ARCHITECTURE, ADR-004-RUVECTOR-POSTGRES-GCP-DEPLOYMENT, ADR-011-cloud-run-extension-architecture, ADR-012-vitejs-heroui-frontend-stack, ADR-013-hybrid-data-layer-architecture, ADR-015-CLOUD-FUNCTIONS-ARCHITECTURE

---

## Context

Conveyor AI requires a unified chat-based interface to interact with the entire platform ecosystem. Users need to:

1. **Query multiple systems** - Access case data, run simulations, query databases, and sync Airtable records through natural language
2. **Execute complex workflows** - Chain operations across Cloud Functions (case-manager, simulation-agent, db-query-agent, airtable-agent)
3. **Leverage AI capabilities** - Use Gemini 2.5 Pro for intent classification, response generation, and context management
4. **Perform client-side ML** - Run RL algorithms locally via WASM modules for low-latency predictions
5. **Integrate with Claude** - Expose MCP Server for Claude Code integration and agent orchestration
6. **Real-time collaboration** - Support WebSocket connections for live updates and multi-user sessions

The current architecture has isolated Cloud Functions without a unified conversational layer, requiring users to know specific API endpoints and request formats.

---

## Decision

Implement a **Chat System Architecture** deployed on Google Cloud Run with the following components:

### High-Level Architecture

```
+-----------------------------------------------------------------------------------+
|                           CONVEYOR AI CHAT SYSTEM                                  |
+-----------------------------------------------------------------------------------+
|                                                                                    |
|  +------------------------------------------+  +--------------------------------+  |
|  |           CHAT INTERFACE                 |  |        MCP SERVER              |  |
|  |  (ViteJS + HeroUI + WebSocket Client)   |  |    (Cloud Run Service)         |  |
|  |                                          |  |                                |  |
|  |  +------------------------------------+  |  |  - Claude Code Integration    |  |
|  |  | Chat Input / Message History       |  |  |  - Tool Registry              |  |
|  |  | Command Palette / Quick Actions    |  |  |  - Session Management         |  |
|  |  | WASM Module Runner (shared-ai)     |  |  |  - OAuth 2.0 Token Exchange   |  |
|  |  +------------------------------------+  |  +--------------------------------+  |
|  +------------------------------------------+                                      |
|                         |                                                          |
|                         v                                                          |
|  +-----------------------------------------------------------------------------------+
|  |                          CHAT ORCHESTRATOR (Cloud Run)                            |
|  |  +-------------+  +-----------------+  +----------------+  +----------------+    |
|  |  | Intent      |  | Command         |  | Context        |  | Response       |    |
|  |  | Classifier  |  | Parser          |  | Manager        |  | Generator      |    |
|  |  | (Gemini)    |  | (Regex + NLP)   |  | (Redis/PG)     |  | (Gemini 2.5)   |    |
|  |  +-------------+  +-----------------+  +----------------+  +----------------+    |
|  +-----------------------------------------------------------------------------------+
|                         |                                                          |
|                         v                                                          |
|  +-----------------------------------------------------------------------------------+
|  |                           FUNCTION DISPATCHER                                     |
|  |                                                                                   |
|  |     +----------------+  +----------------+  +----------------+  +-------------+   |
|  |     | case-manager   |  | simulation-    |  | db-query-      |  | airtable-   |   |
|  |     | Cloud Function |  | agent          |  | agent          |  | agent       |   |
|  |     |                |  | Cloud Function |  | Cloud Function |  | Cloud Func  |   |
|  |     +----------------+  +----------------+  +----------------+  +-------------+   |
|  |                                                                                   |
|  +-----------------------------------------------------------------------------------+
|                         |                                                          |
|                         v                                                          |
|  +-----------------------------------------------------------------------------------+
|  |                           DATA LAYER                                              |
|  |  +-------------------+  +-------------------+  +--------------------+             |
|  |  | Cloud SQL         |  | Airtable          |  | Secret Manager     |             |
|  |  | PostgreSQL        |  | (Cases, Clients)  |  | (API Keys, OAuth)  |             |
|  |  | (RuVector + RL)   |  |                   |  |                    |             |
|  |  +-------------------+  +-------------------+  +--------------------+             |
|  +-----------------------------------------------------------------------------------+
|                                                                                    |
+-----------------------------------------------------------------------------------+
```

### Component Architecture

```
                                    USER
                                      |
                    +----------------+------------------+
                    |                                   |
                    v                                   v
            +---------------+                  +-----------------+
            | Web Interface |                  | Claude Code     |
            | (chat-ui)     |                  | (MCP Protocol)  |
            +-------+-------+                  +--------+--------+
                    |                                   |
                    |     WebSocket (wss://)            |
                    |                                   |
                    v                                   v
            +----------------------------------------------+
            |           chat-orchestrator                   |
            |              (Cloud Run)                      |
            |                                               |
            |  +------------------------------------------+ |
            |  |              MESSAGE ROUTER              | |
            |  |                                          | |
            |  |   /chat  --> Intent Classifier           | |
            |  |   /cmd   --> Command Parser              | |
            |  |   /mcp   --> MCP Protocol Handler        | |
            |  |   /ws    --> WebSocket Manager           | |
            |  +------------------------------------------+ |
            |                                               |
            |  +------------------------------------------+ |
            |  |            GEMINI INTEGRATION            | |
            |  |                                          | |
            |  |   Model: gemini-2.5-pro                  | |
            |  |   Context Window: 1M tokens             | |
            |  |   Function Calling: Enabled             | |
            |  +------------------------------------------+ |
            +----------------------------------------------+
                    |
                    | HTTPS (Internal)
                    |
    +---------------+---------------+---------------+
    |               |               |               |
    v               v               v               v
+--------+   +-----------+   +----------+   +---------+
| case-  |   | simulation|   | db-query |   | airtable|
| manager|   | -agent    |   | -agent   |   | -agent  |
+--------+   +-----------+   +----------+   +---------+
```

---

## Command Syntax Specification

### Command Structure

```
/<command> [subcommand] [--flag=value] [positional args]
```

### Available Commands

| Command | Subcommand | Description | Example |
|---------|------------|-------------|---------|
| `/case` | `list` | List cases with filters | `/case list --status=active --limit=10` |
| `/case` | `get` | Get case details | `/case get CASE-12345` |
| `/case` | `create` | Create new case | `/case create --type=water_damage --value=75000` |
| `/case` | `update` | Update case | `/case update CASE-12345 --status=settled` |
| `/case` | `search` | Semantic search | `/case search "large commercial fire damage"` |
| `/sim` | `run` | Run Q-Learning | `/sim run --case-type=water_damage --strategy=aggressive` |
| `/sim` | `optimal` | Get optimal strategy | `/sim optimal --case-type=fire_damage` |
| `/sim` | `stats` | Simulation statistics | `/sim stats --period=30d` |
| `/db` | `query` | Execute SQL query | `/db query "SELECT * FROM cases LIMIT 10"` |
| `/db` | `report` | Generate report | `/db report --type=case_summary --period=monthly` |
| `/db` | `schema` | Show table schema | `/db schema cases` |
| `/airtable` | `sync` | Sync Airtable data | `/airtable sync --table=Cases --direction=bidirectional` |
| `/airtable` | `query` | Query Airtable | `/airtable query --table=Clients --filter="Status=Active"` |
| `/airtable` | `upsert` | Upsert records | `/airtable upsert --table=Cases --data={...}` |
| `/help` | - | Show command help | `/help case` |
| `/status` | - | System health check | `/status` |

### Natural Language Processing

**Updated 2026-01-19:** Enhanced with `FunctionExecutor` service for direct intent-to-function routing.

Users can interact using either explicit `/commands` OR natural language. The system uses a three-tier processing model:

1. **Explicit Commands** (`/case list`) → Routed directly via `CommandRouter`
2. **Natural Language Intent** ("show me case 123") → Detected via `FunctionExecutor.detectIntent()` → Executed directly
3. **Complex Queries** ("explain the performance trends") → Processed by Gemini AI with function calling

#### Natural Language Intent Patterns

| User Input | Detected Intent | Cloud Function | Example Response |
|------------|-----------------|----------------|------------------|
| "Show me case ABC-123" | `get_case` | case-manager | Case details |
| "List all cases" | `list_cases` | case-manager | Paginated case list |
| "Search for fire damage cases" | `search_cases` | case-manager | Matching cases |
| "What's the case status?" | `get_case_stats` | case-manager | Statistics |
| "Summarize case 12345" | `summarize_case` | airtable-agent | AI-generated summary |
| "Run a simulation for disability" | `run_simulation` | simulation-agent | RL results |
| "What's the optimal strategy?" | `get_optimal_strategy` | simulation-agent | Recommended strategy |
| "Show simulation stats" | `get_simulation_stats` | simulation-agent | Performance metrics |
| "Forecast revenue" | `get_forecast` | db-query-agent | Forecast data |
| "Analyze Airtable data" | `analyze_airtable` | airtable-agent | Table analysis |

#### FunctionExecutor Architecture

```typescript
// services/FunctionExecutor.ts
class FunctionExecutor {
  // Detect intent from natural language
  detectIntent(input: string): FunctionCallResult | null;

  // Execute function call against Cloud Functions
  execute(functionCall: FunctionCallResult): Promise<FunctionExecutionResult>;

  // Process natural language end-to-end
  processNaturalLanguage(input: string): Promise<FunctionExecutionResult | null>;
}
```

#### Gemini Function Calling Flow

When natural language doesn't match known patterns, Gemini AI decides which function to call:

```
User Input → Gemini AI → Function Call Decision → FunctionExecutor → Cloud Function → Result → Gemini → Natural Language Response
```

This allows complex queries like "What happened with the Johnson case last month?" to be intelligently routed.

### Response Format

```typescript
interface ChatResponse {
  id: string;                    // Message UUID
  timestamp: string;             // ISO 8601
  type: 'text' | 'data' | 'chart' | 'error';
  content: string;               // Human-readable response
  data?: Record<string, any>;    // Structured data payload
  source: string;                // Originating function
  metadata: {
    tokens_used: number;
    latency_ms: number;
    function_calls: string[];
  };
}
```

---

## Integration Points

### 1. Cloud Functions Integration

```typescript
// chat-orchestrator/src/dispatcher/FunctionDispatcher.ts
interface CloudFunctionConfig {
  name: string;
  url: string;
  timeout: number;
  retries: number;
}

const CLOUD_FUNCTIONS: Record<string, CloudFunctionConfig> = {
  'case-manager': {
    name: 'case-manager',
    url: 'https://case-manager-hwqrrwrlna-uc.a.run.app',
    timeout: 30000,
    retries: 2,
  },
  'simulation-agent': {
    name: 'simulation-agent',
    url: 'https://simulation-agent-hwqrrwrlna-uc.a.run.app',
    timeout: 60000,
    retries: 1,
  },
  'db-query-agent': {
    name: 'db-query-agent',
    url: 'https://db-query-agent-hwqrrwrlna-uc.a.run.app',
    timeout: 30000,
    retries: 2,
  },
  'airtable-agent': {
    name: 'airtable-agent',
    url: 'https://airtable-agent-hwqrrwrlna-uc.a.run.app',
    timeout: 30000,
    retries: 2,
  },
};
```

### 2. Gemini 2.5 Pro Integration

```typescript
// chat-orchestrator/src/ai/GeminiClient.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

interface GeminiConfig {
  model: 'gemini-2.5-pro';
  maxOutputTokens: 8192;
  temperature: 0.7;
  topP: 0.95;
  tools: GeminiFunctionTool[];
}

const GEMINI_TOOLS: GeminiFunctionTool[] = [
  {
    name: 'query_cases',
    description: 'Query case data from the case management system',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'search', 'stats'] },
        caseId: { type: 'string' },
        filters: { type: 'object' },
      },
    },
  },
  {
    name: 'run_simulation',
    description: 'Run RL simulation for case strategy optimization',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['run_qlearning', 'get_optimal', 'stats'] },
        caseType: { type: 'string' },
        strategy: { type: 'string' },
      },
    },
  },
  {
    name: 'query_database',
    description: 'Execute database queries and generate reports',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['query', 'report', 'schema', 'analytics'] },
        query: { type: 'string' },
        reportType: { type: 'string' },
      },
    },
  },
  {
    name: 'sync_airtable',
    description: 'Synchronize and query Airtable data',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['sync', 'query', 'upsert', 'analyze'] },
        tableName: { type: 'string' },
        data: { type: 'object' },
      },
    },
  },
];
```

### 3. WASM Module Integration (Client-Side)

```typescript
// chat-ui/src/wasm/WasmRunner.ts
import { QLearning, MonteCarlo, MinCut, VectorOps } from '@conveyor/shared-ai';

interface WasmModules {
  qlearning: typeof QLearning;
  montecarlo: typeof MonteCarlo;
  mincut: typeof MinCut;
  vectors: typeof VectorOps;
}

export class WasmRunner {
  private modules: WasmModules;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    // Load WASM modules from shared-ai package
    this.modules = {
      qlearning: await import('@conveyor/shared-ai/ml/QLearning'),
      montecarlo: await import('@conveyor/shared-ai/simulation/MonteCarlo'),
      mincut: await import('@conveyor/shared-ai/graph/MinCut'),
      vectors: await import('@conveyor/shared-ai/vectors/VectorOps'),
    };
    this.initialized = true;
  }

  async runLocalPrediction(caseData: CaseInput): Promise<StrategyPrediction> {
    // Run Q-Learning locally for instant predictions
    const ql = new this.modules.qlearning.QLearning({
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.1,
    });

    // Load cached Q-table from IndexedDB
    const cachedQTable = await this.loadCachedQTable();
    if (cachedQTable) {
      ql.importQTable(cachedQTable);
    }

    return ql.getOptimalAction(caseData.stateKey);
  }
}
```

### 4. MCP Server Integration

```typescript
// mcp-server/src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';

const server = new Server({
  name: 'conveyor-ai-mcp',
  version: '1.0.0',
});

// Register tools for Claude Code integration
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'conveyor_case_query',
      description: 'Query Conveyor AI case management system',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          caseId: { type: 'string' },
          filters: { type: 'object' },
        },
      },
    },
    {
      name: 'conveyor_simulation',
      description: 'Run RL simulations for case strategy',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          caseType: { type: 'string' },
        },
      },
    },
    {
      name: 'conveyor_analytics',
      description: 'Generate analytics and reports',
      inputSchema: {
        type: 'object',
        properties: {
          reportType: { type: 'string' },
          period: { type: 'string' },
        },
      },
    },
  ],
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  // Route to appropriate Cloud Function
  const response = await functionDispatcher.dispatch(name, args);

  return {
    content: [{ type: 'text', text: JSON.stringify(response) }],
  };
});
```

### 5. AI Suggestions System (Web Worker + Cloud Function)

The AI Suggestions System provides non-blocking, contextual suggestions in the side panel using a Web Worker architecture with Gemini 3 and Google Search grounding.

```
+-----------------------------------------------------------------------------------+
|                         AI SUGGESTIONS ARCHITECTURE                                |
+-----------------------------------------------------------------------------------+
|                                                                                    |
|  +------------------+     +-------------------+     +------------------------+     |
|  | SuggestionsPanel |     | useSuggestions    |     | suggestions.worker.ts  |     |
|  | (React Component)|<--->| (React Hook)      |<--->| (Web Worker Thread)    |     |
|  |                  |     |                   |     |                        |     |
|  | - Clickable cards|     | - State mgmt      |     | - Background processing|     |
|  | - Source links   |     | - Worker comms    |     | - Debounced API calls  |     |
|  | - Priority badges|     | - Context updates |     | - Response caching     |     |
|  +------------------+     +-------------------+     +------------------------+     |
|                                                              |                     |
|                                                              | HTTPS               |
|                                                              v                     |
|                                               +---------------------------+        |
|                                               |   suggestion-agent        |        |
|                                               |   (Cloud Function Gen2)   |        |
|                                               |                           |        |
|                                               |  - Gemini 3 Flash/Pro    |        |
|                                               |  - Google Search Grounding|        |
|                                               |  - Structured JSON Output |        |
|                                               +---------------------------+        |
|                                                                                    |
+-----------------------------------------------------------------------------------+
```

#### Suggestion Types

| Type | Icon | Description | Example |
|------|------|-------------|---------|
| `command` | Command | Prebuilt command to execute | `/db report case_summary` |
| `insight` | Sparkles | Data-driven observation | "Case volume up 15% this week" |
| `task` | Target | Actionable next step | "Review pending water damage cases" |
| `optimization` | TrendingUp | Performance improvement | "Batch similar cases for efficiency" |
| `learning` | BookOpen | Educational content | "RL strategies for fire damage" |

#### Structured Output Schema

```typescript
// suggestion-agent/index.js - Gemini 3 Structured Output
const SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['command', 'insight', 'task', 'optimization', 'learning'] },
          title: { type: 'string' },
          description: { type: 'string' },
          command: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          relevanceScore: { type: 'number' },
          grounded: { type: 'boolean' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                url: { type: 'string' },
              },
            },
          },
        },
        required: ['id', 'type', 'title', 'description', 'priority', 'relevanceScore'],
      },
    },
    analysis: {
      type: 'object',
      properties: {
        sessionSummary: { type: 'string' },
        topicsDiscussed: { type: 'array', items: { type: 'string' } },
        userIntent: { type: 'string' },
        nextBestAction: { type: 'string' },
      },
    },
    groundingMetadata: {
      type: 'object',
      properties: {
        searchQueries: { type: 'array', items: { type: 'string' } },
        sourcesUsed: { type: 'number' },
      },
    },
  },
  required: ['suggestions', 'analysis'],
};
```

#### Google Search Grounding Configuration

```typescript
// Enable dynamic grounding with Google Search
import { DynamicRetrievalMode } from '@google/generative-ai';

const modelConfig = {
  model: 'gemini-3-flash-preview', // or 'gemini-3-pro-preview'
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: SUGGESTION_SCHEMA,
  },
  tools: [{
    googleSearchRetrieval: {
      dynamicRetrievalConfig: {
        mode: DynamicRetrievalMode.MODE_DYNAMIC,
        dynamicThreshold: 0.3, // Use grounding when confidence < 70%
      },
    },
  }],
};
```

#### Web Worker Communication

```typescript
// useSuggestions.ts - Hook for worker communication
interface WorkerMessage {
  type: 'analyze' | 'quick' | 'data_driven' | 'cancel';
  context: SessionContext;
  options?: { enableGrounding?: boolean; model?: string };
  requestId?: string;
}

interface WorkerResponse {
  type: 'suggestions' | 'error' | 'status';
  data?: SuggestionsResponse;
  error?: string;
  timing?: { startTime: number; endTime: number; duration: number };
}
```

#### Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Worker Init | ~100ms | One-time module load |
| Debounce | 2000ms | Prevents excessive API calls |
| Cache TTL | 60s | Local suggestion caching |
| API Latency | 500-2000ms | Depends on grounding |
| Max Context | 15 messages | Sent to Cloud Function |

### 6. WebSocket Real-Time Updates

```typescript
// chat-orchestrator/src/websocket/WebSocketManager.ts
import { WebSocketServer, WebSocket } from 'ws';

interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'message' | 'status';
  channel?: string;
  payload?: any;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private channels: Map<string, Set<WebSocket>> = new Map();

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.wss.on('connection', (ws, req) => {
      // Authenticate via query param or header
      const token = new URL(req.url, 'http://localhost').searchParams.get('token');
      if (!this.validateToken(token)) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      ws.on('message', (data) => {
        const msg: WebSocketMessage = JSON.parse(data.toString());
        this.handleMessage(ws, msg);
      });
    });
  }

  broadcast(channel: string, payload: any): void {
    const subscribers = this.channels.get(channel);
    if (subscribers) {
      const message = JSON.stringify({ type: 'message', channel, payload });
      subscribers.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  }
}
```

---

## Security Model

### Authentication Flow

```
+--------+     +---------------+     +----------------+     +----------+
|  User  | --> | Google OAuth  | --> | Token Exchange | --> | Chat API |
+--------+     | (Identity     |     | Service        |     |          |
               | Platform)     |     +----------------+     +----------+
               +---------------+           |
                                           v
                               +-----------------------+
                               | Cloud SQL             |
                               | (Session Store)       |
                               +-----------------------+
```

### Security Components

| Component | Implementation | Purpose |
|-----------|---------------|---------|
| **OAuth 2.0** | Google Identity Platform | User authentication |
| **JWT Tokens** | RS256 signed, 1hr expiry | Session management |
| **API Keys** | Secret Manager stored | Service-to-service auth |
| **Rate Limiting** | Cloud Armor + Redis | 100 req/min per user |
| **Input Validation** | Zod schemas | Request sanitization |
| **SQL Injection** | Parameterized queries | Database protection |
| **CORS** | Allowlisted origins | Cross-origin security |
| **TLS 1.3** | Cloud Run managed | Transport encryption |

### Secret Manager Keys

| Secret Name | Purpose |
|-------------|---------|
| `gemini-api-key` | Gemini 2.5 Pro API access |
| `anthropic-api-key` | Claude API (MCP fallback) |
| `oauth-client-secret` | Google OAuth client secret |
| `jwt-signing-key` | JWT token signing |
| `redis-url` | Rate limiting store |
| `ruvector-db-password` | Database access |

### Rate Limiting Strategy

```typescript
// chat-orchestrator/src/middleware/rateLimiter.ts
import { RateLimiterRedis } from 'rate-limiter-flexible';

const rateLimiters = {
  chat: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl:chat',
    points: 100,          // 100 requests
    duration: 60,         // per minute
    blockDuration: 60,    // block for 1 minute if exceeded
  }),

  commands: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl:cmd',
    points: 50,           // 50 commands
    duration: 60,         // per minute
  }),

  mcp: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl:mcp',
    points: 200,          // 200 MCP requests
    duration: 60,         // per minute
  }),
};
```

### Authorization Model

```typescript
// chat-orchestrator/src/auth/permissions.ts
interface Permission {
  action: string;
  resource: string;
  conditions?: Record<string, any>;
}

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    { action: '*', resource: '*' },
  ],
  analyst: [
    { action: 'read', resource: 'cases' },
    { action: 'read', resource: 'simulations' },
    { action: 'execute', resource: 'reports' },
    { action: 'read', resource: 'airtable' },
  ],
  operator: [
    { action: 'read', resource: 'cases' },
    { action: 'create', resource: 'cases' },
    { action: 'update', resource: 'cases', conditions: { ownedBy: '${userId}' } },
    { action: 'execute', resource: 'simulations' },
  ],
  viewer: [
    { action: 'read', resource: 'cases' },
    { action: 'read', resource: 'reports' },
  ],
};
```

---

## Deployment Architecture

### Cloud Run Services

| Service | URL | Memory | CPU | Min/Max Instances |
|---------|-----|--------|-----|-------------------|
| `chat-orchestrator` | `chat-orchestrator-*.run.app` | 1024Mi | 2 | 1/10 |
| `chat-ui` | `chat-ui-*.run.app` | 512Mi | 1 | 0/5 |
| `mcp-server` | `mcp-server-*.run.app` | 512Mi | 1 | 1/3 |

### Infrastructure Diagram

```
+-----------------------------------------------------------------------------------+
|                        GOOGLE CLOUD PLATFORM (new-project-473022)                  |
+-----------------------------------------------------------------------------------+
|                                                                                    |
|  +---------------------------+  +---------------------------+                     |
|  |     Cloud Run Region      |  |     Cloud SQL Region      |                     |
|  |     (us-central1)         |  |     (us-central1)         |                     |
|  |                           |  |                           |                     |
|  |  +---------------------+  |  |  +---------------------+  |                     |
|  |  | chat-orchestrator   |  |  |  | conveyor-ruvector-  |  |                     |
|  |  | (1024Mi, 2 CPU)     |--+--+--| db (PostgreSQL 15)  |  |                     |
|  |  +---------------------+  |  |  +---------------------+  |                     |
|  |                           |  |                           |                     |
|  |  +---------------------+  |  +---------------------------+                     |
|  |  | chat-ui             |  |                                                    |
|  |  | (512Mi, 1 CPU)      |  |  +---------------------------+                     |
|  |  +---------------------+  |  |     Cloud Functions       |                     |
|  |                           |  |     (us-central1)         |                     |
|  |  +---------------------+  |  |                           |                     |
|  |  | mcp-server          |  |  |  +-------------------+    |                     |
|  |  | (512Mi, 1 CPU)      |--+--+--| case-manager      |    |                     |
|  |  +---------------------+  |  |  +-------------------+    |                     |
|  |                           |  |  +-------------------+    |                     |
|  +---------------------------+  |  | simulation-agent  |    |                     |
|                                 |  +-------------------+    |                     |
|  +---------------------------+  |  +-------------------+    |                     |
|  |     Secret Manager        |  |  | db-query-agent    |    |                     |
|  |                           |  |  +-------------------+    |                     |
|  |  gemini-api-key           |  |  +-------------------+    |                     |
|  |  anthropic-api-key        |  |  | airtable-agent    |    |                     |
|  |  oauth-client-secret      |  |  +-------------------+    |                     |
|  |  jwt-signing-key          |  +---------------------------+                     |
|  |  ruvector-db-password     |                                                    |
|  +---------------------------+                                                    |
|                                                                                    |
|  +---------------------------+  +---------------------------+                     |
|  |     Cloud Armor           |  |     Cloud Monitoring      |                     |
|  |     (WAF + DDoS)          |  |     (Metrics + Alerts)    |                     |
|  +---------------------------+  +---------------------------+                     |
|                                                                                    |
+-----------------------------------------------------------------------------------+
```

---

## Data Flow

### Message Processing Pipeline

```
User Input
    |
    v
+------------------+
| Input Validation |  <-- Zod schema validation
+------------------+
    |
    v
+------------------+
| Rate Limiter     |  <-- Redis-backed rate limiting
+------------------+
    |
    v
+------------------+
| Auth Middleware  |  <-- JWT validation
+------------------+
    |
    v
+------------------+     +------------------+
| Command Parser   | OR  | Intent Classifier|
| (if /command)    |     | (Gemini 2.5 Pro) |
+------------------+     +------------------+
    |                           |
    +-------------+-------------+
                  |
                  v
         +------------------+
         | Context Manager  |  <-- Load conversation history
         +------------------+
                  |
                  v
         +------------------+
         | Function         |  <-- Route to Cloud Function
         | Dispatcher       |
         +------------------+
                  |
    +-------------+-------------+-------------+
    |             |             |             |
    v             v             v             v
+--------+  +-----------+  +----------+  +---------+
| case-  |  | simulation|  | db-query |  | airtable|
| manager|  | -agent    |  | -agent   |  | -agent  |
+--------+  +-----------+  +----------+  +---------+
    |             |             |             |
    +-------------+-------------+-------------+
                  |
                  v
         +------------------+
         | Response         |  <-- Format and enrich response
         | Generator        |
         +------------------+
                  |
                  v
         +------------------+
         | WebSocket        |  <-- Broadcast to subscribers
         | Broadcaster      |
         +------------------+
                  |
                  v
            User Response
```

---

## Consequences

### Positive

1. **Unified Interface** - Single chat interface replaces multiple API endpoints and dashboards
2. **Natural Language** - Users interact via natural language without learning API syntax
3. **Real-time Updates** - WebSocket integration enables live collaboration and notifications
4. **Client-Side ML** - WASM modules provide instant predictions without server round-trips
5. **Claude Integration** - MCP Server enables Claude Code to orchestrate Conveyor AI workflows
6. **Context Preservation** - Conversation history enables follow-up queries and context-aware responses
7. **Extensibility** - Command system allows easy addition of new functions

### Negative

1. **Complexity** - Additional orchestration layer increases system complexity
2. **Latency** - AI intent classification adds ~200-500ms to non-command requests
3. **Cost** - Gemini API calls add per-token costs (~$0.0025/1K input tokens)
4. **State Management** - WebSocket connections require careful handling for scale
5. **Cold Starts** - New Cloud Run instances incur ~2-5s startup latency

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Gemini API rate limits | Medium | High | Implement caching, fallback to local inference |
| WebSocket connection drops | Medium | Medium | Automatic reconnection with exponential backoff |
| Token exhaustion | Low | High | Budget alerts, usage monitoring, rate limiting |
| Intent misclassification | Medium | Medium | Command syntax as fallback, confidence thresholds |
| Data inconsistency | Low | Medium | Transaction boundaries, idempotent operations |

### Mitigation Strategies

- **Gemini Caching**: Cache frequent intents and responses in Redis (1hr TTL)
- **Fallback Chain**: Command parser -> Gemini -> Local inference -> Error message
- **Connection Pooling**: Maintain warm connections to Cloud Functions
- **Circuit Breaker**: Trip after 5 consecutive failures, retry after 30s
- **Graceful Degradation**: Serve cached/stale data when functions unavailable

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2) - COMPLETE
- [x] Create `chat-system` Cloud Run service (deployed as chat-system-245235083640.us-central1.run.app)
- [x] Implement command parser with ADR-014 command syntax (/case, /sim, /db, /airtable, /status, /help)
- [x] Configure Secret Manager integration for API keys
- [ ] Set up WebSocket infrastructure (deferred - using HTTP polling)

### Phase 2: AI Integration (Week 3-4) - COMPLETE
- [x] Integrate Gemini 2.5 Pro for AI responses
- [x] Implement conversation history and context management
- [x] Add response generation with streaming support
- [x] Create function dispatcher (CommandRouter.ts) for Cloud Functions

### Phase 3: MCP Server (Week 5) - PLANNED
- [ ] Deploy MCP Server on Cloud Run
- [ ] Register Conveyor AI tools
- [ ] Implement OAuth token exchange
- [ ] Test Claude Code integration

### Phase 4: Chat UI (Week 6-7) - COMPLETE
- [x] Create ViteJS + HeroUI chat interface (HeroUI components, TailwindCSS)
- [x] Collapsible side panel for metrics (Messages, AI Responses, Commands, Learning)
- [x] Fixed command input at bottom
- [x] Chat history modal with search/archive/restore
- [x] Self-learning hooks integration
- [ ] Integrate WASM modules from shared-ai (deferred)
- [ ] Add offline support with IndexedDB (deferred)

### Phase 5: Security & Polish (Week 8) - PARTIAL
- [x] Implement OAuth 2.0 flow (Google Identity Platform via @shared-api/auth)
- [x] VITE_SKIP_AUTH for development/testing mode
- [ ] Configure Cloud Armor WAF
- [ ] Add rate limiting
- [x] Performance optimization (Vite chunking, gzip/brotli compression)

---

## Monorepo Structure (Implemented)

```
/extensions-cloudrun/
+-- packages/
|   +-- shared-ui/              # IMPLEMENTED - Reusable HeroUI components
|   +-- shared-api/             # IMPLEMENTED - API clients, auth, logger
|   +-- shared-config/          # IMPLEMENTED - Vite base config, TailwindCSS
|   +-- shared-wasm/            # IMPLEMENTED - WASM utilities
+-- apps/
|   +-- sales-pipeline/         # IMPLEMENTED - Sales extension
|   +-- financial-ops/          # IMPLEMENTED - Financial extension
|   +-- hr-compensation/        # IMPLEMENTED - HR extension
|   +-- compliance-legal/       # IMPLEMENTED - Compliance extension
|   +-- customer-success/       # IMPLEMENTED - Customer success extension
|   +-- revenue-ops/            # IMPLEMENTED - Revenue ops extension
|   +-- chat-system/            # IMPLEMENTED - Chat web interface + backend
|       +-- src/
|       |   +-- components/     # ChatWindow, CommandInput, CommandPalette, SuggestionsPanel
|       |   +-- hooks/          # useChat, useChatHistory, useSelfLearning, useSuggestions
|       |   +-- workers/        # suggestions.worker.ts (Web Worker for background AI)
|       |   +-- services/       # GeminiService, CommandRouter
|       |   +-- config/         # systemPrompt, constants
|       +-- nginx.conf          # CSP headers, static serving
|       +-- Dockerfile          # Cloud Run deployment
+-- infrastructure/
    +-- gcp/
        +-- functions/          # IMPLEMENTED - 6 Cloud Functions
            +-- airtable-agent/
            +-- case-manager/
            +-- simulation-agent/
            +-- db-query-agent/
            +-- suggestion-agent/  # NEW - AI suggestions with Gemini 3 + Google Search
            +-- pandadoc-webhook/
```

---

## References

- [ADR-001: Extension Architecture](./ADR-001-EXTENSION-ARCHITECTURE.md) - Monorepo structure and deployment patterns
- [ADR-004: RuVector PostgreSQL Database Deployment](./ADR-004-RUVECTOR-POSTGRES-GCP-DEPLOYMENT.md) - Database schema and functions
- [ADR-011: Cloud Run Extension Architecture](./ADR-011-cloud-run-extension-architecture.md) - Cloud Run deployment patterns
- [ADR-012: ViteJS + HeroUI Frontend Stack](./ADR-012-vitejs-heroui-frontend-stack.md) - Frontend technology stack
- [ADR-013: Hybrid Data Layer Architecture](./ADR-013-hybrid-data-layer-architecture.md) - Data routing and sync patterns
- [ADR-015: Cloud Functions Architecture](./ADR-015-CLOUD-FUNCTIONS-ARCHITECTURE.md) - Cloud Function specifications and tests
- [ADR-016: Claims Integration](./ADR-016-CLAIMS-INTEGRATION.md) - Claims-based workflow coordination
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Gemini Google Search Grounding](https://ai.google.dev/gemini-api/docs/grounding)
- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
- [Cloud Run WebSocket Support](https://cloud.google.com/run/docs/triggering/websockets)
- [Google Cloud Identity Platform](https://cloud.google.com/identity-platform)

---

*Document Version: 1.4*
*Last Updated: 2026-01-19*
*Implementation Status: Phases 1, 2, 4 Complete; Phase 3, 5 Partial; AI Suggestions System Deployed (suggestion-agent Cloud Function + Web Worker)*
