# ADR-011: Cloud Run Extension Architecture

## Status
**Implemented** - 2026-01-12

## Context

Conveyor AI has 6 Airtable custom extensions in `/conveyor_ai/extensions/`:
- Sales Pipeline (P0)
- Financial Operations (P0)
- HR/Compensation (P1)
- Compliance/Legal (P1)
- Customer Success (P2)
- Revenue Operations (P2)

These extensions are currently deployed as Airtable Blocks with limited distribution. We need to:
1. Make them accessible as standalone web applications
2. Support both desktop and mobile users
3. Maintain Airtable integration while adding PostgreSQL/RuVector capabilities
4. Enable independent scaling and deployment

## Decision

We will port all 6 extensions to **Google Cloud Run** as containerized web applications with the following architecture:

### Container Architecture
```
┌─────────────────────────────────────────────────────────┐
│                    Cloud Run Service                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Nginx + Static Assets               │   │
│  │         (ViteJS Build Output - /dist)            │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Node.js API Server                  │   │
│  │         (Express + API Routes)                   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │ Airtable │        │Cloud SQL │        │ Cloud    │
   │   API    │        │PostgreSQL│        │ Functions│
   └──────────┘        └──────────┘        └──────────┘
```

### Service Decomposition
| Extension | Cloud Run Service | URL | Memory |
|-----------|-------------------|-----|--------|
| Sales Pipeline | `ext-sales-pipeline` | https://ext-sales-pipeline-hwqrrwrlna-uc.a.run.app | 512Mi |
| Financial Ops | `ext-financial-ops` | https://ext-financial-ops-hwqrrwrlna-uc.a.run.app | 512Mi |
| HR Compensation | `ext-hr-compensation` | https://ext-hr-compensation-hwqrrwrlna-uc.a.run.app | 512Mi |
| Compliance Legal | `ext-compliance-legal` | https://ext-compliance-legal-hwqrrwrlna-uc.a.run.app | 512Mi |
| Customer Success | `ext-customer-success` | https://ext-customer-success-hwqrrwrlna-uc.a.run.app | 512Mi |
| Revenue Ops | `ext-revenue-ops` | https://ext-revenue-ops-hwqrrwrlna-uc.a.run.app | 512Mi |

### Shared Infrastructure
- **Shared AI Core**: Deployed as npm package or Cloud Function
- **Authentication**: Google Cloud Identity / OAuth 2.0
- **Secrets**: Google Secret Manager
- **Database**: Cloud SQL PostgreSQL (existing `conveyor-ruvector-db`)

## Consequences

### Positive
- Independent scaling per extension based on usage
- Mobile-responsive web access without Airtable dependency
- Hybrid data layer (Airtable + PostgreSQL) for flexibility
- CI/CD via Cloud Build with automatic deployments
- Cost-effective with Cloud Run's scale-to-zero

### Negative
- Additional infrastructure complexity
- Need to maintain two data sync strategies
- Container build/deploy overhead
- OAuth flow adds authentication complexity

### Risks
- Data consistency between Airtable and PostgreSQL
- Cold start latency for infrequently used extensions
- Secret rotation coordination across services

## Implementation

**Deployed**: 2026-01-12

### Phase 1: Foundation - COMPLETE
- [x] Create base ViteJS + HeroUI template
- [x] Setup Cloud Run deployment pipeline
- [x] Configure Secret Manager integration
- [x] Create Turborepo monorepo structure

### Phase 2: Core Extensions - COMPLETE
- [x] Port Sales Pipeline (P0)
- [x] Port Financial Operations (P0)
- [x] Setup shared UI components

### Phase 3: Secondary Extensions - COMPLETE
- [x] Port HR/Compensation (P1)
- [x] Port Compliance/Legal (P1)
- [x] Create shared AI package (Q-Learning, Monte Carlo, MinCut)

### Phase 4: Remaining Extensions - COMPLETE
- [x] Port Customer Success (P2)
- [x] Port Revenue Operations (P2)
- [x] Deploy all 6 extensions to Cloud Run

### Deployment Artifacts
- **Docker Registry**: `us-central1-docker.pkg.dev/new-project-473022/extensions/`
- **Secret Manager**: Extension URLs stored as `ext-*-url` secrets
- **Source Code**: `/workspaces/dev/extensions-cloudrun/`

## References
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [ViteJS Guide](https://vitejs.dev/guide/)
- [HeroUI Components](https://heroui.com/)
- ADR-004: RuVector PostgreSQL Database Deployment
- ADR-012: ViteJS + HeroUI Frontend Stack
- ADR-013: Hybrid Data Layer Architecture
