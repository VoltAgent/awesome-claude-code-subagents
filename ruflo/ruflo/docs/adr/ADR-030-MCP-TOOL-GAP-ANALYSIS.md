# ADR-030: MCP Tool Gap Analysis — Old Chat System vs HF Chat UI

## Status
Implemented — Phase 1+2 Complete (2026-03-04)

## Date
2026-03-04

## Context

The custom chat system (`extensions-cloudrun/apps/chat-system`) has 24+ Cloud Function integrations, 40+ natural language intent patterns, document parsing, semantic search, and rich case context awareness. The HF Chat UI (`chat.conveyorclaims.ai`) currently exposes only **5 MCP tools with ~15% of available Cloud Function actions**. This ADR documents what's missing and prioritizes what to add.

## Current State: 5 MCP Tools

| Tool | Routes To | Actions Exposed |
|------|-----------|----------------|
| `search_workflows` | workflow-search | search (query + limit only) |
| `query_database` | db-query-agent | nl_query only |
| `manage_case` | airtable-agent / case-manager | status, list, next_steps, update |
| `run_simulation` | simulation-agent | run_qlearning only |
| `airtable_query` | airtable-agent | search, list, get, create, update |

## Gap Analysis

### 1. Completely Missing Cloud Functions (6 services, 0% exposed)

| Cloud Function | Actions Available | Use Case | Priority |
|----------------|-------------------|----------|----------|
| **embeddings-agent** | embed, batch, search, store, trajectory, drift, consolidate (14 actions) | Semantic search across all data, vector similarity | HIGH |
| **research-agent** | search, research, compare, fact_check (4 actions) | External knowledge, web search, fact verification | HIGH |
| **suggestion-agent** | generate, quick, data_driven (3 actions) | AI-powered settlement suggestions, next-step recommendations | MEDIUM |
| **chat-history** | create, get, list, add_message, search, patterns, drift (15 actions) | Persistent conversation learning, cross-session context | MEDIUM |
| **gdrive-workflow-sync** | sync (scheduled) | Manual workflow document sync triggering | LOW |
| **pandadoc-webhook** | event handler | Document lifecycle events | LOW |

### 2. Partially Exposed Functions (actions hidden)

#### airtable-agent: 3/11 actions exposed (73% hidden)

| Action | Exposed? | What It Does |
|--------|----------|-------------|
| query | Yes | Search/filter records |
| get_case_status | Yes | Case metadata lookup |
| upsert | Yes | Create/update records |
| **summarize** | **NO** | AI-powered case summary via Gemini (overview, financials, risk assessment, recommendations) |
| **parse_document** | **NO** | Parse single PDF/image attachment via Gemini Vision API |
| **parse_documents** | **NO** | Parse ALL attachments from a record (75+ document fields searched) |
| **parse_by_case** | **NO** | Find case by number/name then parse all documents |
| **analyze** | **NO** | Statistical analysis of table data (numeric stats, categorical distributions) |
| **learn** | **NO** | Pattern detection across records |
| **sync** | **NO** | Sync Airtable data to PostgreSQL |
| **health** | N/A | Health check |

**Impact**: The user asking "pull the client insurance policy for C-01748" CANNOT work because `parse_by_case` and `parse_documents` are not exposed. The old chat system would find the case, locate the "IC Policy PDF" attachment field, download and parse it via Gemini Vision, and return extracted data (dates, amounts, parties, claims).

#### db-query-agent: 1/6 actions exposed (83% hidden)

| Action | Exposed? | What It Does |
|--------|----------|-------------|
| nl_query | Yes | Natural language → SQL via Gemini |
| **query** | **NO** | Execute raw SQL queries |
| **schema** | **NO** | Get database table structure |
| **columns** | **NO** | List columns for a table |
| **analytics** | **NO** | 6 predefined reports: case_summary, episode_performance, strategy_performance, daily_activity, carrier_analysis, revenue_forecast |

#### simulation-agent: 1/6 actions exposed (83% hidden)

| Action | Exposed? | What It Does |
|--------|----------|-------------|
| run_qlearning | Yes | Run Q-learning simulation |
| **get_optimal** | **NO** | Get pre-trained best strategy for case type |
| **stats** | **NO** | Aggregate simulation statistics |
| **record_episode** | **NO** | Record learning episode |
| **find_similar** | **NO** | Find similar past scenarios |

#### workflow-search: Missing 5 filter parameters

| Parameter | Exposed? | What It Does |
|-----------|----------|-------------|
| query | Yes | Search text |
| limit | Yes | Max results |
| **silo** | **NO** | Filter by workflow silo (1-8) |
| **role** | **NO** | Filter by responsible role |
| **chunkType** | **NO** | Filter by content type (step, faq, table, etc.) |
| **minSimilarity** | **NO** | Minimum similarity threshold |
| **vectorWeight** | **NO** | Weight between vector vs keyword search |

### 3. Old Chat System Features Not Available in HF Chat UI

| Feature | Old Chat System | HF Chat UI | Gap |
|---------|----------------|------------|-----|
| **Document parsing** | `parse_documents`, `parse_by_case`, `query_case_document` — extracts dates, amounts, parties from PDFs/images | Not available | CRITICAL |
| **Case summarization** | AI-generated case overview with financials, risk, recommendations | Only raw field data returned | HIGH |
| **Semantic search** | embeddings-agent with 384d vectors, similarity search | Not available | HIGH |
| **Web search / research** | research-agent with Google Search grounding, fact-checking | Not available | HIGH |
| **Workflow silo filtering** | Filter by silo number, role, chunk type | Only text query | MEDIUM |
| **Analytics reports** | 6 predefined report types (case_summary, revenue_forecast, etc.) | Only nl_query | MEDIUM |
| **Simulation strategies** | get_optimal, stats, find_similar | Only run_qlearning | MEDIUM |
| **Case context detection** | Auto-detects case mentions, maintains context across turns | No context persistence | MEDIUM |
| **Document type queries** | "what is the RP LOR signed date for C-02161?" | Cannot query documents | CRITICAL |
| **AI suggestions** | Proactive next-step suggestions based on case context | Not available | LOW |
| **Conversation persistence** | chat-history with learning patterns | MongoDB only (no learning) | LOW |

### 4. Document Fields the Old System Can Access (75+)

The old chat system searches these Airtable attachment fields when parsing documents:

**Client Documentation**: Client Estimate, Client Proof of Loss, Client Invoices, Client Damage Reports, Client Inspection Reports, Client Photo Documentation, Client Expert Reports, Client Supporting Documentation, Client Strategy Docs, Client Contractor Documentation, Client Roof Report, Client Shingle Report, Client Weather Report, Client Field Adjuster Photos

**Insurance Company Documentation**: IC Policy PDF, IC Estimates, IC Payment Summary (SOL), IC Coverage/Ack. Letters, IC Expert Reports, IC Damage Reports, IC Supporting Documentation, IC Estimate & Docs

**Legal Documentation**: RP LOR, RP Contract, Completed Retainer Agreement, Client Consent Forms, LOR/DL, Demand Letter Draft

**Litigation Documentation**: Summons, Complaint, S/C Served, Answer, Discovery to/from Defendant, Default Docs, Deposition Docs, Subpoena Docs, Motions, Mediation Docs, Appeal, Voluntary Dismissal, Litigation Documents, Litigation Invoices

**Settlement & Appraisal**: Settlement Release, Full and Final Release, Insurance Checks, Appraisal Demand Letter, Appraisal Response(s), Appraisal Documents, Umpire Documents

## Implementation: Phased MCP Tool Expansion

### Phase 1: IMPLEMENTED (2026-03-04) — Document Access + Case Summarization

Added 3 new MCP tools:

| Tool | Routes To | Test Result |
|------|-----------|-------------|
| `summarize_case` | airtable-agent → summarize | OK — returns case summary with status, financials |
| `parse_case_documents` | airtable-agent → parse_by_case | OK — parsed GAF roof report PDF from C-01748 |
| `analyze_table` | airtable-agent → analyze | OK — returned 25 carrier records with field analysis |

**Fixes applied:**
- Changed `summarize_case` default table from "Cases" to "Managed Cases" (has `{Client Name}` field)
- Fixed `parseByCase` in airtable-agent to extract numeric ID from case numbers (e.g., `"01748"` from `"C-01748"`) for flexible Airtable FIND() matching

### Phase 2: IMPLEMENTED (2026-03-04) — Research + Analytics + Enhanced Tools

Added 3 new tools and enhanced 2 existing tools:

| Tool | Routes To | Test Result |
|------|-----------|-------------|
| `search_knowledge` | embeddings-agent → search | OK — 5 semantic results for "settlement strategy" |
| `web_research` | research-agent → search/research/compare/fact_check | OK — detailed Florida bad faith law analysis with Google Search grounding |
| `analytics_report` | db-query-agent → analytics | OK — case_summary with 3 case types, revenue_forecast |

**Enhanced tools:**

| Tool | Enhancement | Test Result |
|------|-------------|-------------|
| `search_workflows` | Added silo, role, chunkType, minSimilarity filters | OK — filters pass through to workflow-search |
| `run_simulation` | Added get_optimal, find_similar, stats actions | OK — get_optimal returns "conservative" for fire_damage |

**Fixes applied:**
- Normalize case type spaces to underscores (`"fire damage"` → `"fire_damage"`) for DB matching

### Phase 3: Remaining (Future)

- `get_suggestions` — AI settlement/next-step suggestions (suggestion-agent)
- `conversation_memory` — Cross-session learning patterns (chat-history)
- Enhanced `manage_case` — create, stats actions
- `get_schema` — Database introspection (db-query-agent → schema/columns)

## Current State: 11 MCP Tools (2026-03-04)

| # | Tool | Cloud Function | Actions | Status |
|---|------|---------------|---------|--------|
| 1 | `search_workflows` | workflow-search | search (with silo/role/chunkType/minSimilarity) | Live |
| 2 | `query_database` | db-query-agent | nl_query | Live |
| 3 | `manage_case` | airtable-agent / case-manager | status, list, next_steps, update | Live |
| 4 | `run_simulation` | simulation-agent | simulate, get_optimal, find_similar, stats | Live |
| 5 | `airtable_query` | airtable-agent | search, list, get, create, update | Live |
| 6 | `summarize_case` | airtable-agent | summarize | Live |
| 7 | `parse_case_documents` | airtable-agent | parse_by_case, parse_document | Live |
| 8 | `analyze_table` | airtable-agent | analyze | Live |
| 9 | `search_knowledge` | embeddings-agent | search | Live |
| 10 | `web_research` | research-agent | search, research, compare, fact_check | Live |
| 11 | `analytics_report` | db-query-agent | analytics (6 report types) | Live |

## Summary Statistics

| Metric | Original (5 tools) | After Phase 1+2 (11 tools) | Full Parity |
|--------|-------------------|---------------------------|-------------|
| MCP Tools | 5 | 11 | 14+ |
| Actions Exposed | 11 (~15%) | 30+ (~42%) | 50+ (~70%) |
| Cloud Functions Used | 5/11 | 7/11 | 10/11 |
| Document Parsing | No | Yes | Yes |
| Case Summarization | No | Yes | Yes |
| Semantic Search | No | Yes | Yes |
| Web Research | No | Yes | Yes |
| Analytics Reports | No | Yes | Yes |
| Simulation Strategies | Partial | Full | Full |
| Workflow Filtering | No | Yes | Yes |

## Test Results (2026-03-04)

All 11 tools verified via API:

```
1. search_workflows     — OK (silo/role/chunkType filters work)
2. query_database       — OK (NL→SQL via Gemini)
3. manage_case          — OK (C-01748 → "C - 01748 - Sonya Spalding")
4. run_simulation       — OK (get_optimal: conservative for fire_damage, find_similar: episodes found)
5. airtable_query       — OK (case search, table browse)
6. summarize_case       — OK (case summary with status)
7. parse_case_documents — OK (1 doc parsed, GAF roof report PDF)
8. analyze_table        — OK (25 carrier records)
9. search_knowledge     — OK (5 semantic results)
10. web_research        — OK (Google Search grounded answers with citations)
11. analytics_report    — OK (case_summary: 3 case types with stats)
```

## Related ADRs

| ADR | Relationship |
|-----|-------------|
| ADR-014 | Old chat system architecture (feature source) |
| ADR-024 | Workflow context injection (partially implemented) |
| ADR-029 | HF Chat UI deployment (current state) |
| ADR-031 | Chat history persistence (MongoDB Atlas) |
