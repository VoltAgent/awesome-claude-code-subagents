# ADR-001: Extension Architecture

**Status:** Implemented
**Date:** 2026-01-10
**Updated:** 2026-01-12
**Author:** Conveyor AI Team
**Deciders:** Engineering, Product, DevOps
**Related:** ADR-002-WASM-CORE-PACKAGE, ADR-011-cloud-run-extension-architecture, ADR-012-vitejs-heroui-frontend-stack, ADR-013-hybrid-data-layer-architecture

---

## Context

Conveyor AI requires modular extensions to serve different business domains within the organization. As the platform grows to support multiple operational areas, we need an architecture that:

1. **Separates concerns** for different user personas and business domains
2. **Enables independent deployment** and scaling per extension
3. **Shares common AI/ML infrastructure** across all extensions
4. **Supports both Airtable integration** and standalone web deployment
5. **Maintains high performance** with shared computational resources

The monolithic approach would not scale well as different teams require specialized functionality with varying update cycles and performance requirements.

## Decision

Adopt a **Domain-Driven Design (DDD)** approach with a **constellation of 6 independent extensions**, each deployed as a separate Cloud Run service while sharing common packages.

---

## Extension Constellation

### The 6 Extensions

| Extension | Priority | Domain | Primary Users |
|-----------|----------|--------|---------------|
| **Sales Pipeline** | P0 | Sales Operations | Sales Team, Account Managers |
| **Financial Operations** | P0 | Finance & Accounting | Finance Team, Controllers |
| **HR/Compensation** | P1 | Human Resources | HR Team, Managers |
| **Compliance/Legal** | P1 | Legal & Compliance | Legal Team, Compliance Officers |
| **Customer Success** | P2 | Customer Relationships | CSMs, Support Team |
| **Revenue Operations** | P2 | Revenue Analytics | RevOps, Leadership |

### Architecture Diagram

```
+-------------------------------------------------------------------------+
|                     CONVEYOR AI EXTENSION CONSTELLATION                  |
+-------------------------------------------------------------------------+
|                                                                          |
|   +------------------+  +------------------+  +------------------+       |
|   | Sales Pipeline   |  | Financial Ops    |  | HR/Compensation  |       |
|   | (P0)             |  | (P0)             |  | (P1)             |       |
|   |                  |  |                  |  |                  |       |
|   | - Deal Tracking  |  | - Transactions   |  | - Comp Planning  |       |
|   | - Pipeline Mgmt  |  | - Invoicing      |  | - Commission Calc|       |
|   | - Forecasting    |  | - Budget Control |  | - Quota Tracking |       |
|   | - Lead Scoring   |  | - Cash Flow      |  | - Performance    |       |
|   +--------+---------+  +--------+---------+  +--------+---------+       |
|            |                     |                     |                 |
|   +--------+---------+  +--------+---------+  +--------+---------+       |
|   | Compliance/Legal |  | Customer Success |  | Revenue Ops      |       |
|   | (P1)             |  | (P2)             |  | (P2)             |       |
|   |                  |  |                  |  |                  |       |
|   | - Risk Scoring   |  | - Health Scores  |  | - ARR Analysis   |       |
|   | - Contract Mgmt  |  | - Churn Predict  |  | - Forecasting    |       |
|   | - Audit Trail    |  | - Usage Metrics  |  | - KPI Dashboard  |       |
|   | - Compliance Chk |  | - NPS Tracking   |  | - Cohort Analysis|       |
|   +--------+---------+  +--------+---------+  +--------+---------+       |
|            |                     |                     |                 |
|            +---------------------+---------------------+                 |
|                                  |                                       |
|                                  v                                       |
|   +-------------------------------------------------------------+       |
|   |                    SHARED PACKAGES                           |       |
|   |  +---------------+  +---------------+  +---------------+     |       |
|   |  | shared-ui     |  | shared-ai     |  | shared-api    |     |       |
|   |  | (HeroUI)      |  | (WASM Core)   |  | (Airtable/PG) |     |       |
|   |  +---------------+  +---------------+  +---------------+     |       |
|   +-------------------------------------------------------------+       |
|                                  |                                       |
|                                  v                                       |
|   +-------------------------------------------------------------+       |
|   |                    INFRASTRUCTURE                            |       |
|   |  +---------------+  +---------------+  +---------------+     |       |
|   |  | Cloud Run     |  | Cloud SQL     |  | Secret Mgr    |     |       |
|   |  | (6 services)  |  | (RuVector PG) |  | (Credentials) |     |       |
|   |  +---------------+  +---------------+  +---------------+     |       |
|   +-------------------------------------------------------------+       |
|                                                                          |
+-------------------------------------------------------------------------+
```

---

## Monorepo Structure

```
/extensions-cloudrun/
+-- turbo.json                    # Turborepo configuration
+-- package.json                  # Root workspace
+-- packages/
|   +-- shared-ui/                # Shared HeroUI components
|   |   +-- components/
|   |   +-- hooks/
|   |   +-- theme/
|   |   +-- utils/
|   +-- shared-ai/                # AI/ML algorithms (Q-Learning, Monte Carlo, etc.)
|   |   +-- ml/
|   |   +-- simulation/
|   |   +-- graph/
|   |   +-- vectors/
|   +-- shared-api/               # API clients (Airtable, PostgreSQL)
|       +-- airtable/
|       +-- postgres/
|       +-- auth/
+-- apps/
|   +-- sales-pipeline/           # P0 Extension
|   +-- financial-ops/            # P0 Extension
|   +-- hr-compensation/          # P1 Extension
|   +-- compliance-legal/         # P1 Extension
|   +-- customer-success/         # P2 Extension
|   +-- revenue-ops/              # P2 Extension
+-- docker/
    +-- Dockerfile.extension      # Shared Dockerfile template
```

---

## Deployment Architecture

### Cloud Run Services

Each extension deploys as an independent Cloud Run service:

| Extension | Service Name | URL Pattern | Resources |
|-----------|--------------|-------------|-----------|
| Sales Pipeline | `ext-sales-pipeline` | `ext-sales-pipeline-*.run.app` | 512Mi, 1 vCPU |
| Financial Ops | `ext-financial-ops` | `ext-financial-ops-*.run.app` | 512Mi, 1 vCPU |
| HR Compensation | `ext-hr-compensation` | `ext-hr-compensation-*.run.app` | 512Mi, 1 vCPU |
| Compliance Legal | `ext-compliance-legal` | `ext-compliance-legal-*.run.app` | 512Mi, 1 vCPU |
| Customer Success | `ext-customer-success` | `ext-customer-success-*.run.app` | 512Mi, 1 vCPU |
| Revenue Ops | `ext-revenue-ops` | `ext-revenue-ops-*.run.app` | 512Mi, 1 vCPU |

### Container Architecture

```
+--------------------------------------------+
|           Cloud Run Container               |
|  +--------------------------------------+  |
|  |     Nginx (Static Assets/Routing)    |  |
|  |         ViteJS Build Output          |  |
|  +--------------------------------------+  |
|  +--------------------------------------+  |
|  |     Node.js API Server (Express)     |  |
|  |         API Routes + Middleware      |  |
|  +--------------------------------------+  |
+--------------------------------------------+
           |              |              |
           v              v              v
    +-----------+  +------------+  +----------+
    | Airtable  |  | Cloud SQL  |  | Cloud    |
    | API       |  | PostgreSQL |  | Functions|
    +-----------+  +------------+  +----------+
```

---

## Shared Infrastructure

### 1. Cloud SQL PostgreSQL with RuVector

All extensions connect to a shared Cloud SQL instance with the RuVector extension:
- **Instance**: `conveyor-ruvector-db`
- **Database**: `conveyor_ai`
- **Performance**: 150x-12,500x faster vector search via HNSW indexing

### 2. Secret Manager

Centralized credential storage:
- Database credentials
- API keys (Anthropic, OpenAI, Airtable)
- OAuth tokens (RingCentral, PandaDoc)

### 3. Shared Packages

| Package | Purpose | Location |
|---------|---------|----------|
| `shared-ui` | HeroUI components, theme, hooks | `packages/shared-ui/` |
| `shared-ai` | Q-Learning, Monte Carlo, MinCut, Vectors | `packages/shared-ai/` |
| `shared-api` | Airtable client, PostgreSQL client, Auth | `packages/shared-api/` |

---

## Extension Data Flow

```
User Request
     |
     v
+------------------+
| Extension UI     |
| (React + HeroUI) |
+------------------+
     |
     v
+------------------+
| QueryRouter      |-----> Airtable (CRUD operations)
+------------------+
     |
     v
+------------------+
| Cloud SQL + AI   |-----> Vector Search, Predictions
| (RuVector)       |-----> Q-Learning State
+------------------+
     |
     v
+------------------+
| SyncManager      |-----> Bidirectional Sync
+------------------+
```

---

## Consequences

### Positive

1. **Independent Scaling**: Each extension scales based on its own traffic patterns
2. **Fault Isolation**: One extension's failure does not affect others
3. **Team Autonomy**: Different teams can own and deploy their extensions independently
4. **Cost Efficiency**: Cloud Run scale-to-zero minimizes idle costs
5. **Shared Learning**: AI models and Q-tables benefit all extensions
6. **Hybrid Data**: Airtable for collaboration, PostgreSQL for AI/analytics

### Negative

1. **Operational Complexity**: 6 services to monitor and maintain
2. **Cross-Extension Communication**: Requires careful coordination
3. **Shared Package Versioning**: Breaking changes affect all extensions
4. **Cold Start Latency**: Infrequently used extensions may have slower initial loads

### Risks

1. **Data Consistency**: Sync between Airtable and PostgreSQL may lag
2. **Secret Rotation**: Coordinating credential updates across services
3. **Version Drift**: Extensions may diverge in shared package versions

### Mitigation Strategies

- **Data Consistency**: SyncManager with conflict resolution, monitoring alerts on lag > 5 minutes
- **Secret Rotation**: Automated rotation via Cloud Functions, service restart on secret change
- **Version Drift**: Turborepo workspace constraints, CI checks for package version alignment

---

## Implementation Status

### Phase 1: Foundation - COMPLETE
- [x] Turborepo monorepo structure
- [x] ViteJS + HeroUI base template
- [x] Cloud Run deployment pipeline
- [x] Secret Manager integration

### Phase 2: Core Extensions (P0) - COMPLETE
- [x] Sales Pipeline extension
- [x] Financial Operations extension
- [x] Shared UI components

### Phase 3: Secondary Extensions (P1) - COMPLETE
- [x] HR/Compensation extension
- [x] Compliance/Legal extension
- [x] Shared AI package

### Phase 4: Remaining Extensions (P2) - COMPLETE
- [x] Customer Success extension
- [x] Revenue Operations extension
- [x] Full deployment to Cloud Run

---

## References

- [ADR-002: WASM Core Package](./ADR-002-WASM-CORE-PACKAGE.md)
- [ADR-011: Cloud Run Extension Architecture](./ADR-011-cloud-run-extension-architecture.md)
- [ADR-012: ViteJS + HeroUI Frontend Stack](./ADR-012-vitejs-heroui-frontend-stack.md)
- [ADR-013: Hybrid Data Layer Architecture](./ADR-013-hybrid-data-layer-architecture.md)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Turborepo Documentation](https://turbo.build/repo/docs)

---

*Document Version: 1.0*
*Last Updated: 2026-01-12*
