# ADR-028: OpenAI GPT-5 Integration + Copy Message Button

## Status
Proposed

## Date
2026-02-26

## Context

The chat system currently only supports Google Gemini models. Users want the ability to switch to OpenAI GPT-5 as an alternative reasoning model. Additionally, users cannot copy full message content from assistant responses -- only code blocks have a copy button.

### Problems

1. **Single provider lock-in**: The codebase is tightly coupled to `GeminiService` -- `useChat.ts` references it directly via `geminiServiceRef`, making it impossible to swap providers without rewriting the hook.
2. **No model choice UI**: Users have no way to select which AI model powers their session.
3. **Can't copy message text**: Only `CodeBlock` components have a copy button. Full assistant message content (workflow steps, FAQ answers, etc.) cannot be copied without manual text selection, which is often blocked by CSS or touch event handling.

### Why GPT-5

- OpenAI's GPT-5 (`gpt-5`) is the latest flagship reasoning model, offering strong instruction following and function calling.
- `gpt-5-mini` provides a cost-effective alternative with comparable quality for most workflow/FAQ queries.
- Having multiple providers improves resilience -- if one provider is rate-limited or down, users can switch.

## Decision

### Part A: Provider Abstraction + OpenAI Integration

#### A1. `IAIProvider` Interface

Create `src/services/AIProvider.ts` with a provider-agnostic interface:

```typescript
export type AIProviderType = 'gemini' | 'openai';

export interface IAIProvider {
  initialize(apiKey?: string): Promise<boolean>;
  isInitialized(): boolean;
  generate(request: GenerationRequest): Promise<GenerationResponse>;
  generateStream(request: GenerationRequest, options?: StreamOptions): AsyncGenerator<StreamChunk>;
  generateWithWorkflowContext(request: GenerationRequest, context: WorkflowContext | null): Promise<GenerationResponse>;
  generateStreamWithWorkflowContext(request: GenerationRequest, context: WorkflowContext | null, options?: StreamOptions): AsyncGenerator<StreamChunk>;
  getAvailableFunctions(): FunctionDeclaration[];
  getModelInfo(): { name: string; provider: AIProviderType; maxTokens: number };
  updateConfig(config: Record<string, unknown>): void;
}
```

Both `GeminiService` and a new `OpenAIService` will implement this interface. No behavior changes to existing Gemini code paths.

#### A2. Shared Functions Extraction

Extract from `GeminiService.ts` into `src/services/sharedFunctions.ts`:

- `getAvailableFunctions()` (5 function declarations: `run_simulation`, `get_forecast`, `query_database`, `manage_case`, `search_workflow`) -- used identically by both providers.
- `buildWorkflowEnhancedPrompt()` -- workflow context injection logic (ADR-024) reused by both providers.

This avoids duplicating ~180 lines of function declarations and prompt building across two service files.

#### A3. `OpenAIService` Implementation

Create `src/services/OpenAIService.ts` using the `openai` npm package (v4+):

| Concern | Approach |
|---------|----------|
| **Client** | `new OpenAI({ apiKey, dangerouslyAllowBrowser: true })` -- same client-side key pattern as current Gemini setup |
| **Model** | `gpt-5-mini` default (cost-effective), `gpt-5` available |
| **System prompt** | Native `role: 'system'` message (cleaner than Gemini's user-message workaround) |
| **Function calling** | Wrap `FunctionDeclaration[]` into OpenAI `tools` format: `{ type: 'function', function: { name, description, parameters } }` |
| **Streaming** | Standard `stream: true` on chat completions; accumulate `tool_calls` deltas before parsing |
| **Workflow context** | Uses shared `buildWorkflowEnhancedPrompt()` injected as system message |
| **Rate limiting** | Same exponential backoff retry pattern as `GeminiService.withRetry()` |
| **Grounding** | Not supported (Gemini-only feature); falls back to standard generation |

#### A4. `AIProviderManager` Singleton

Create `src/services/AIProviderManager.ts`:

```typescript
class AIProviderManager {
  private providers: Map<AIProviderType, IAIProvider>;
  private activeProvider: AIProviderType;

  getProvider(): IAIProvider;
  switchProvider(type: AIProviderType, model?: string): Promise<void>;
  getActiveProviderType(): AIProviderType;
}
```

Handles lazy initialization -- providers are only created/initialized when first selected.

#### A5. `useChat.ts` Changes

Replace `geminiServiceRef` with `aiProviderRef` pointing to `AIProviderManager.getProvider()`. ~15 call sites change from `geminiServiceRef.current.X()` to `aiProviderRef.current.X()`:

- `isInitialized()`, `generate()`, `generateStream()`, `generateWithWorkflowContext()`, `generateStreamWithWorkflowContext()`, `getAvailableFunctions()`, `getModelInfo()`

New exports: `currentProvider: AIProviderType`, `currentModel: string`, `switchProvider(type, model)`.

#### A6. SideMenu Model Selector

Add an AI Model dropdown to the Settings accordion in `SideMenu.tsx`, after the Dark Mode toggle:

```
AI Model
┌─────────────────────┐
│ Gemini 2.5 Flash  ▼ │  ← HeroUI Select dropdown
├─────────────────────┤
│ Gemini 2.5 Flash    │  Fast, cost-effective (default)
│ Gemini 2.5 Pro      │  Best Gemini reasoning
│ GPT-5 mini          │  OpenAI GPT-5 mini
│ GPT-5               │  OpenAI GPT-5 flagship
└─────────────────────┘
```

Selection persisted to `localStorage('ai-model-preference')` so it survives page refresh. The `SideMenuProps` interface gains:

```typescript
currentModel?: string;
onModelChange?: (providerType: AIProviderType, model: string) => void;
```

#### A7. App.tsx Wiring

Both `ChatDashboard` and `DevChatDashboard` pass `currentProvider`, `currentModel`, and `switchProvider` from `useChat` down to `SideMenu`. The metrics panel model display updates from hardcoded "Gemini 2.5" to `currentModel`.

### Part B: Copy Message Button

Add a copy icon button to every assistant message bubble in `MessageBubble.tsx`:

```
┌──────────────────────────────────┐
│ Great question -- here's...      │
│                                  │
│ 1. First step...                 │
│ 2. Second step...                │
│                                  │  [clipboard icon]
└──────────────────────────────────┘
```

Implementation:

- Lucide `Copy` / `Check` icons (already imported in `MessageBubble.tsx`)
- `navigator.clipboard.writeText(message.content)` -- same pattern as existing `CodeBlock` copy
- Show checkmark for 2 seconds after copying
- Only on assistant messages (user messages are their own text)
- Appears on hover (desktop) / always visible (mobile via `md:opacity-0 md:group-hover:opacity-100`)
- Positioned in the timestamp row, before the time string

### Part C: Deployment (Secret Manager)

The OpenAI API key must NOT be hardcoded in the Dockerfile (unlike the Gemini key which currently is -- a separate concern).

#### C1. Google Secret Manager

```bash
# Create secret
echo -n "sk-..." | gcloud secrets create openai-api-key --data-file=- --project=new-project-473022

# Grant Cloud Build service account access
gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:245235083640@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=new-project-473022
```

#### C2. `cloudbuild.yaml` Changes

```yaml
availableSecrets:
  secretManager:
    - versionName: projects/new-project-473022/secrets/openai-api-key/versions/latest
      env: 'OPENAI_API_KEY'

steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '--build-arg'
      - 'OPENAI_API_KEY=$$OPENAI_API_KEY'
      # ... existing args
    secretEnv: ['OPENAI_API_KEY']
```

#### C3. Dockerfile Changes

```dockerfile
# After existing Gemini env vars
ARG OPENAI_API_KEY
ENV VITE_OPENAI_API_KEY=${OPENAI_API_KEY}
```

#### C4. `package.json` Changes

```json
"dependencies": {
  "openai": "^4.78.0"
}
```

## Files Changed

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `src/services/AIProvider.ts` | `IAIProvider` interface + `AIProviderType` | ~40 |
| `src/services/OpenAIService.ts` | OpenAI GPT-5 implementation | ~450 |
| `src/services/AIProviderManager.ts` | Provider switching singleton | ~70 |
| `src/services/sharedFunctions.ts` | Extracted function declarations + workflow prompt builder | ~180 |

### Modified Files

| File | Change |
|------|--------|
| `src/types/chat.ts` | Add `AIProviderType`, `OpenAIConfig` types |
| `src/services/GeminiService.ts` | `implements IAIProvider`, import shared functions |
| `src/hooks/useChat.ts` | `geminiServiceRef` -> `aiProviderRef`, expose `switchProvider` |
| `src/components/SideMenu.tsx` | Add AI Model selector dropdown, new props |
| `src/components/MessageBubble.tsx` | Add copy button on assistant messages |
| `src/App.tsx` | Wire provider state/switch to SideMenu, update model display |
| `Dockerfile` | Add `ARG OPENAI_API_KEY`, `ENV VITE_OPENAI_API_KEY` |
| `cloudbuild.yaml` | Add `availableSecrets` + `--build-arg` for OpenAI key |
| `package.json` | Add `openai` dependency |

## Consequences

### Positive

- **Model flexibility**: Users can choose the best model for their task (Gemini for grounding/search, GPT-5 for reasoning).
- **Provider resilience**: If one provider is down or rate-limited, users switch instantly.
- **Clean abstraction**: `IAIProvider` makes adding future providers (Claude, etc.) trivial.
- **Copy UX**: Users can finally copy full message content without fighting text selection.
- **No breaking changes**: Default behavior remains Gemini 2.5 Flash -- GPT-5 is opt-in.

### Negative

- **Client-side API key**: OpenAI key is baked into the Vite build (same risk as existing Gemini key). A future ADR should move both keys to a backend proxy.
- **Feature parity gap**: Gemini-only features (Google Search grounding, `generateWithGrounding`) won't work with OpenAI. The UI should indicate this.
- **Bundle size**: `openai` package adds ~50KB gzipped to the client bundle.
- **Two providers to maintain**: Function calling format differences, error handling, and streaming behavior must be tested for both.

### Model Options

| Provider | Model | Use Case | Context Window |
|----------|-------|----------|----------------|
| Google | `gemini-2.5-flash` | Fast, cost-effective (default) | 1M tokens |
| Google | `gemini-2.5-pro` | Best Gemini reasoning | 1M tokens |
| OpenAI | `gpt-5-mini` | GPT-5 mini reasoning | 1M tokens |
| OpenAI | `gpt-5` | GPT-5 flagship | 1M tokens |

## Verification Criteria

1. `npm run build` succeeds with no type errors
2. Default (Gemini 2.5 Flash) works identically to current behavior
3. SideMenu shows model selector with 4 options
4. Switching to GPT-5 mini sends requests to OpenAI API
5. Function calling (workflow search) works with OpenAI provider
6. Streaming works with OpenAI provider
7. Model selection persists across page refresh via localStorage
8. Copy button appears on hover for assistant messages
9. Clicking copy puts full message content in clipboard
10. Checkmark feedback shown for 2 seconds after copy
11. Cloud Build deploys with Secret Manager integration for OpenAI key

## Related ADRs

- **ADR-014**: Chat system architecture (command routing)
- **ADR-024**: Automatic workflow context injection (shared prompt builder)
- **ADR-027**: Conversational response formatting (system prompts used by both providers)
