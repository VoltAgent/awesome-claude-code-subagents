# Claude Code Sub-Agent Library — Restructured Taxonomy

A categorised library of Claude Code sub-agent definitions, organised into **6 risk tiers** across **24 categories**.

Agents marked `✦ NEW` are suggested additions. All others exist in the current repo.

---

## Risk Tiers at a Glance

| Tier | Risk Level | What agents do | Blast radius |
|------|-----------|----------------|--------------|
| 0 | ⚪ **Meta** | Orchestrate other agents, manage context | Depends on delegated agents |
| 1 | 🟢 **Low** | Read, analyse, advise, plan, document | No code or infra changes |
| 2 | 🟡 **Medium** | Generate or modify local source code | Changes stay in working tree / PR |
| 3 | 🟠 **Medium-High** | Alter data schemas, dependencies, build pipelines | Can break builds or corrupt data locally |
| 4 | 🔴 **High** | Configure external services, infra, and secrets | Touches cloud resources and credentials |
| 5 | ⛔ **Critical** | Deploy, operate, and mutate production systems | Direct impact on live users and data |

---

## Tier 0 — Meta & Orchestration ⚪

These agents coordinate other agents rather than performing work directly. Their effective risk level equals the highest-risk agent they delegate to.

### 00 · Meta & Orchestration

| Agent | Status | Purpose |
|-------|--------|---------|
| `multi-agent-coordinator` | EXISTING | Coordinate multiple sub-agents across a complex task |
| `workflow-orchestrator` | EXISTING | Orchestrate multi-step workflows with dependencies |
| `task-distributor` | EXISTING | Decompose work and assign to appropriate sub-agents |
| `agent-organizer` | EXISTING | Manage and catalogue available agent definitions |
| `agent-installer` | EXISTING | Install and configure agent definitions into projects |
| `context-manager` | EXISTING | Manage shared context and state across agent invocations |
| `error-coordinator` | EXISTING | Handle errors and retries across multi-agent workflows |
| `knowledge-synthesizer` | EXISTING | Synthesise outputs from multiple agents into coherent results |
| `it-ops-orchestrator` | EXISTING | Orchestrate IT operations workflows across infra agents |
| `performance-monitor` | EXISTING | Monitor and report on agent execution performance |

---

## Tier 1 — Read-Only / Advisory 🟢

These agents produce analysis, designs, plans, and documentation. They never modify code, infrastructure, or external systems.

### 01 · Research & Discovery

Gather information about technologies, codebases, and ecosystems to inform decisions.

| Agent | Status | Purpose |
|-------|--------|---------|
| `research-analyst` | EXISTING | Conduct structured research and produce findings |
| `competitive-analyst` | EXISTING | Research competing products/libraries and summarise trade-offs |
| `market-researcher` | EXISTING | Research market trends, sizing, and opportunities |
| `data-researcher` | EXISTING | Research datasets, data sources, and data quality |
| `search-specialist` | EXISTING | Find and synthesise information from multiple sources |
| `trend-analyst` | EXISTING | Identify and analyse emerging technology and market trends |
| `technology-researcher` | ✦ NEW | Evaluate technologies, frameworks, and tools for a given use case |
| `feasibility-assessor` | ✦ NEW | Assess whether a proposed approach is technically viable |
| `codebase-explorer` | ✦ NEW | Navigate and summarise unfamiliar codebases, surface key patterns |

### 02 · Architecture & Design

Produce designs, diagrams, and structural decisions without writing implementation code.

| Agent | Status | Purpose |
|-------|--------|---------|
| `api-designer` | EXISTING | Design REST/GraphQL/gRPC API contracts and OpenAPI specs |
| `graphql-architect` | EXISTING | Design GraphQL schemas, resolvers, and federation strategies |
| `microservices-architect` | EXISTING | Design distributed service architectures and boundaries |
| `architect-reviewer` | EXISTING | Review and critique architectural decisions and proposals |
| `solution-architect` | ✦ NEW | Design end-to-end system architectures with component diagrams |
| `schema-designer` | ✦ NEW | Design database schemas, ERDs, and data models |
| `system-modeler` | ✦ NEW | Create C4, sequence, or state diagrams for complex systems |
| `data-flow-designer` | ✦ NEW | Map data flows, pipelines, and transformation steps |

### 03 · Analysis & Review

Audit existing code and systems, producing findings and recommendations — no changes made.

| Agent | Status | Purpose |
|-------|--------|---------|
| `code-reviewer` | EXISTING | Review PRs/diffs for correctness, style, and maintainability |
| `security-auditor` | EXISTING | Identify vulnerabilities, insecure patterns, and OWASP issues |
| `performance-engineer` | EXISTING | Profile and identify bottlenecks, suggest optimisations |
| `accessibility-tester` | EXISTING | Audit UI code for WCAG compliance and a11y best practices |
| `compliance-auditor` | EXISTING | Audit code and processes for regulatory compliance |
| `qa-expert` | EXISTING | Assess overall quality, identify test gaps and risk areas |
| `complexity-analyzer` | ✦ NEW | Measure cyclomatic complexity, coupling, and code health metrics |
| `dependency-auditor` | ✦ NEW | Audit dependencies for CVEs, deprecations, and licence compliance |

### 04 · Documentation & Technical Writing

Write and maintain all forms of project documentation.

| Agent | Status | Purpose |
|-------|--------|---------|
| `documentation-engineer` | EXISTING | Write or update long-form technical documentation |
| `api-documenter` | EXISTING | Generate API reference docs from code or OpenAPI specs |
| `technical-writer` | EXISTING | Write clear, structured technical content for varied audiences |
| `adr-author` | ✦ NEW | Write Architecture Decision Records with context and consequences |
| `changelog-generator` | ✦ NEW | Generate changelogs from commits, PRs, or conventional commits |
| `runbook-writer` | ✦ NEW | Write operational runbooks for incident response and procedures |
| `readme-generator` | ✦ NEW | Generate or refresh project READMEs with setup, usage, and examples |

### 05 · Planning & Estimation

Produce plans, estimates, and risk assessments to guide implementation.

| Agent | Status | Purpose |
|-------|--------|---------|
| `project-manager` | EXISTING | Plan projects, track progress, manage scope and timelines |
| `scrum-master` | EXISTING | Facilitate agile ceremonies, manage sprints and backlogs |
| `product-manager` | EXISTING | Define product requirements, priorities, and roadmaps |
| `task-planner` | ✦ NEW | Break features/epics into implementable tasks with ordering |
| `effort-estimator` | ✦ NEW | Estimate implementation effort with confidence ranges |
| `migration-planner` | ✦ NEW | Plan phased migrations between frameworks, versions, or platforms |
| `release-planner` | ✦ NEW | Plan release scope, sequencing, and rollout strategy |
| `risk-assessor` | ✦ NEW | Identify technical risks and propose mitigations |

### 06 · Business & Product

Business-facing advisory roles that inform product and strategy decisions.

| Agent | Status | Purpose |
|-------|--------|---------|
| `business-analyst` | EXISTING | Analyse business requirements and translate to technical specs |
| `ux-researcher` | EXISTING | Conduct user research and translate findings into design insights |
| `content-marketer` | EXISTING | Create marketing content, messaging, and content strategy |
| `customer-success-manager` | EXISTING | Manage customer relationships and success metrics |
| `legal-advisor` | EXISTING | Advise on legal, licensing, and compliance considerations |
| `sales-engineer` | EXISTING | Support technical sales with demos, RFP responses, and POCs |
| `quant-analyst` | EXISTING | Quantitative analysis, financial modelling, and risk analytics |
| `risk-manager` | EXISTING | Identify, assess, and plan mitigations for business risks |
| `seo-specialist` | EXISTING | Optimise content and structure for search engine visibility |

---

## Tier 2 — Local Code Generation / Modification 🟡

These agents create or modify source code in the working directory. Changes are contained to the local file system (reviewable via git diff before merging).

### 07 · Language & Framework Specialists

Deep expertise in a specific language or framework. Write idiomatic, production-quality code following ecosystem best practices.

| Agent | Status | Purpose |
|-------|--------|---------|
| `angular-architect` | EXISTING | Angular applications with RxJS, NgModules, and CLI |
| `cpp-pro` | EXISTING | C++ systems with modern standards (C++17/20/23) |
| `csharp-developer` | EXISTING | C# applications with .NET ecosystem |
| `django-developer` | EXISTING | Django web applications and REST APIs |
| `dotnet-core-expert` | EXISTING | .NET Core / .NET 6+ cross-platform applications |
| `dotnet-framework-4.8-expert` | EXISTING | Legacy .NET Framework 4.8 applications |
| `elixir-expert` | EXISTING | Elixir/OTP applications with Phoenix and LiveView |
| `flutter-expert` | EXISTING | Flutter cross-platform mobile and desktop apps |
| `fsharp-specialist` | EXISTING | F# functional programming on .NET |
| `golang-pro` | EXISTING | Go services, CLIs, and concurrent systems |
| `haskell-expert` | EXISTING | Haskell applications with strong type systems |
| `java-architect` | EXISTING | Java enterprise applications and design patterns |
| `javascript-pro` | EXISTING | Modern JavaScript across Node.js and browser |
| `kotlin-specialist` | EXISTING | Kotlin for Android, server-side, and multiplatform |
| `laravel-specialist` | EXISTING | Laravel PHP framework applications |
| `lua-specialist` | EXISTING | Lua scripting and embedded applications |
| `nextjs-developer` | EXISTING | Next.js applications with SSR, SSG, and App Router |
| `ocaml-specialist` | EXISTING | OCaml functional programming and tooling |
| `php-pro` | EXISTING | Modern PHP applications and frameworks |
| `powershell-5.1-expert` | EXISTING | Windows PowerShell 5.1 scripts and modules |
| `powershell-7-expert` | EXISTING | PowerShell 7+ cross-platform automation |
| `powershell-module-architect` | EXISTING | Design and build PowerShell modules |
| `powershell-ui-architect` | EXISTING | PowerShell-based UI and interactive tooling |
| `python-pro` | EXISTING | Python applications, libraries, and tooling |
| `r-specialist` | EXISTING | R statistical computing and data visualisation |
| `rails-expert` | EXISTING | Ruby on Rails web applications |
| `react-specialist` | EXISTING | React applications with hooks, state, and ecosystem |
| `rust-engineer` | EXISTING | Rust systems programming with safety guarantees |
| `spring-boot-engineer` | EXISTING | Spring Boot microservices and enterprise Java |
| `sql-pro` | EXISTING | SQL query writing, optimisation, and schema design |
| `swift-expert` | EXISTING | Swift for iOS, macOS, and server-side applications |
| `typescript-pro` | EXISTING | TypeScript applications with strong typing patterns |
| `vue-expert` | EXISTING | Vue.js applications with Composition API and ecosystem |
| `wordpress-master` | EXISTING | WordPress themes, plugins, and site development |

### 08 · General Development

Broad role-based agents that work across technologies to build features end-to-end.

| Agent | Status | Purpose |
|-------|--------|---------|
| `fullstack-developer` | EXISTING | Build features across frontend, backend, and database layers |
| `frontend-developer` | EXISTING | Build user interfaces with modern frontend frameworks |
| `backend-developer` | EXISTING | Build server-side logic, APIs, and data processing |
| `mobile-developer` | EXISTING | Build native and cross-platform mobile applications |
| `mobile-app-developer` | EXISTING | Build mobile apps with platform-specific patterns |
| `ui-designer` | EXISTING | Design and implement user interfaces with design systems |
| `websocket-engineer` | EXISTING | Build real-time communication with WebSocket protocols |
| `electron-pro` | EXISTING | Build cross-platform desktop apps with Electron |
| `cli-developer` | EXISTING | Build command-line interfaces and terminal tools |
| `mcp-developer` | EXISTING | Build Model Context Protocol servers and integrations |
| `game-developer` | EXISTING | Build games with engines and game-specific patterns |

### 09 · Testing & Quality Assurance

Write and maintain automated tests across all testing levels.

| Agent | Status | Purpose |
|-------|--------|---------|
| `test-automator` | EXISTING | Build and maintain automated test suites and frameworks |
| `chaos-engineer` | EXISTING | Design and run chaos experiments to test resilience |
| `unit-test-writer` | ✦ NEW | Write unit tests for existing functions and classes |
| `integration-test-writer` | ✦ NEW | Write integration tests for service boundaries and APIs |
| `e2e-test-writer` | ✦ NEW | Write end-to-end tests with Playwright, Cypress, or Selenium |
| `test-fixture-generator` | ✦ NEW | Generate test data, factories, and fixtures |
| `snapshot-updater` | ✦ NEW | Update snapshot tests after intentional UI/output changes |
| `coverage-gap-filler` | ✦ NEW | Identify untested code paths and write missing tests |

### 10 · Refactoring & Modernisation

Restructure and improve existing code without changing behaviour.

| Agent | Status | Purpose |
|-------|--------|---------|
| `refactoring-specialist` | EXISTING | Apply targeted refactorings (extract method, rename, etc.) |
| `legacy-modernizer` | EXISTING | Modernise legacy codebases incrementally |
| `pattern-migrator` | ✦ NEW | Migrate code from one pattern to another (e.g. callbacks → async/await) |
| `tech-debt-reducer` | ✦ NEW | Identify and resolve tech debt items systematically |
| `framework-upgrader` | ✦ NEW | Upgrade framework versions and adapt breaking changes |
| `language-modernizer` | ✦ NEW | Update code to use modern language features |
| `linter-fixer` | ✦ NEW | Auto-fix linter and formatter violations across the codebase |

### 11 · Bug Fixing & Debugging

Diagnose and fix defects in application code.

| Agent | Status | Purpose |
|-------|--------|---------|
| `debugger` | EXISTING | Systematically diagnose and resolve code defects |
| `error-detective` | EXISTING | Trace errors through complex call chains to root cause |
| `bug-fixer` | ✦ NEW | Diagnose and fix reported bugs with regression tests |
| `log-analyzer` | ✦ NEW | Analyse application logs to identify root causes |
| `regression-hunter` | ✦ NEW | Use git bisect or similar to find the offending commit |
| `stack-trace-interpreter` | ✦ NEW | Parse and explain stack traces, suggest fixes |

### 12 · Frontend & UI

Specialised agents for building and refining user interface code.

| Agent | Status | Purpose |
|-------|--------|---------|
| `ui-component-builder` | ✦ NEW | Build accessible, responsive UI components |
| `style-refactorer` | ✦ NEW | Refactor CSS/SCSS, migrate to CSS modules or utility classes |
| `responsive-adapter` | ✦ NEW | Adapt layouts for different screen sizes and breakpoints |
| `theme-generator` | ✦ NEW | Generate design system tokens, themes, and colour palettes |
| `i18n-extractor` | ✦ NEW | Extract hardcoded strings into i18n translation files |

### 13 · Developer Experience & Tooling

Improve the inner loop: build tools, workflows, and developer productivity.

| Agent | Status | Purpose |
|-------|--------|---------|
| `dx-optimizer` | EXISTING | Identify and fix developer experience friction points |
| `tooling-engineer` | EXISTING | Build and maintain internal developer tools |
| `git-workflow-manager` | EXISTING | Configure branching strategies, hooks, and git workflows |
| `slack-expert` | EXISTING | Build Slack integrations, bots, and workflow automations |
| `build-engineer` | EXISTING | Configure and optimise build systems and toolchains |
| `prompt-engineer` | EXISTING | Design and optimise prompts for LLM-based systems |

---

## Tier 3 — Data, Dependencies & Build Pipeline 🟠

These agents modify schemas, dependency trees, and build configurations. Mistakes can break builds, corrupt local data, or introduce supply-chain risk.

### 14 · Data & Database

Work with database schemas, queries, and data transformations.

| Agent | Status | Purpose |
|-------|--------|---------|
| `database-optimizer` | EXISTING | Optimise query performance, indexing, and execution plans |
| `postgres-pro` | EXISTING | PostgreSQL-specific administration and optimisation |
| `data-engineer` | EXISTING | Build data pipelines, ETL processes, and warehouses |
| `schema-migrator` | ✦ NEW | Write and validate database migration scripts |
| `seed-data-generator` | ✦ NEW | Generate realistic seed/test data for development |
| `orm-model-builder` | ✦ NEW | Generate ORM models and relationships from schema definitions |
| `data-validator` | ✦ NEW | Write data validation rules, constraints, and sanitisation logic |

### 15 · Data Science & AI/ML

Build and operate machine learning models, data analysis, and AI systems.

| Agent | Status | Purpose |
|-------|--------|---------|
| `ai-engineer` | EXISTING | Build AI-powered features and applications |
| `data-analyst` | EXISTING | Analyse datasets, produce insights and visualisations |
| `data-scientist` | EXISTING | Statistical modelling, experimentation, and hypothesis testing |
| `llm-architect` | EXISTING | Design LLM-based systems, RAG pipelines, and agent architectures |
| `machine-learning-engineer` | EXISTING | Build, train, and deploy ML models |
| `ml-engineer` | EXISTING | End-to-end ML pipeline development |
| `mlops-engineer` | EXISTING | ML model lifecycle, monitoring, and infrastructure |
| `nlp-engineer` | EXISTING | Natural language processing models and pipelines |

### 16 · Dependency & Package Management

Manage project dependencies and package publishing.

| Agent | Status | Purpose |
|-------|--------|---------|
| `dependency-manager` | EXISTING | Manage, update, and resolve project dependencies |
| `dependency-upgrader` | ✦ NEW | Upgrade dependencies with automated compatibility checks |
| `vulnerability-patcher` | ✦ NEW | Patch known CVEs in dependencies with minimal disruption |
| `lockfile-resolver` | ✦ NEW | Resolve lockfile conflicts and dependency version mismatches |
| `package-publisher` | ✦ NEW | Prepare packages for publishing to npm, PyPI, crates.io, etc. |
| `monorepo-manager` | ✦ NEW | Manage workspace configurations, shared deps, and cross-references |

### 17 · Build & CI/CD

Author and maintain build pipelines and CI/CD workflows.

| Agent | Status | Purpose |
|-------|--------|---------|
| `pipeline-builder` | ✦ NEW | Author CI/CD pipeline configs (GitHub Actions, GitLab CI, etc.) |
| `build-optimizer` | ✦ NEW | Optimise build times, caching, and parallelisation |
| `workflow-author` | ✦ NEW | Write reusable workflow templates and composite actions |
| `artifact-publisher` | ✦ NEW | Configure build artifact storage and distribution |
| `environment-configurator` | ✦ NEW | Set up CI/CD environment variables and stage configurations |

---

## Tier 4 — External Systems & Integrations 🔴

These agents configure cloud resources, external services, and security boundaries. Changes affect shared infrastructure and may incur costs.

### 18 · API & Service Integration

Connect systems to external APIs and messaging infrastructure.

| Agent | Status | Purpose |
|-------|--------|---------|
| `api-client-generator` | ✦ NEW | Generate typed API clients from OpenAPI/Swagger specs |
| `webhook-configurator` | ✦ NEW | Set up and configure webhook endpoints and event routing |
| `third-party-integrator` | ✦ NEW | Integrate with external services (Stripe, SendGrid, Auth0, etc.) |
| `sdk-wrapper-builder` | ✦ NEW | Build wrapper libraries around third-party SDKs |
| `message-queue-configurator` | ✦ NEW | Configure message queues, topics, and dead-letter handling |

### 19 · Infrastructure as Code

Author infrastructure definitions for cloud platforms.

| Agent | Status | Purpose |
|-------|--------|---------|
| `terraform-engineer` | EXISTING | Write Terraform modules, state configs, and provider setups |
| `kubernetes-specialist` | EXISTING | Author and manage Kubernetes manifests and cluster configs |
| `cloud-architect` | EXISTING | Design and implement cloud infrastructure architectures |
| `azure-infra-engineer` | EXISTING | Azure-specific infrastructure and services |
| `network-engineer` | EXISTING | Configure VPCs, subnets, security groups, and load balancers |
| `platform-engineer` | EXISTING | Build and maintain internal developer platforms |
| `windows-infra-admin` | EXISTING | Windows Server infrastructure and Active Directory |
| `devops-engineer` | EXISTING | Build and maintain CI/CD, infra automation, and toolchains |
| `cloudformation-builder` | ✦ NEW | Author CloudFormation/SAM templates |
| `docker-composer` | ✦ NEW | Write Dockerfiles and docker-compose configurations |
| `helm-chart-builder` | ✦ NEW | Create and maintain Helm charts with values and templates |

### 20 · Security & Secrets

Manage credentials, access policies, and security configurations.

| Agent | Status | Purpose |
|-------|--------|---------|
| `security-engineer` | EXISTING | Implement security controls, tooling, and processes |
| `penetration-tester` | EXISTING | Test systems for exploitable vulnerabilities |
| `ad-security-reviewer` | EXISTING | Review Active Directory security configurations |
| `powershell-security-hardening` | EXISTING | Harden Windows/PowerShell environments |
| `secret-rotator` | ✦ NEW | Rotate API keys, tokens, and credentials safely |
| `iam-policy-author` | ✦ NEW | Write least-privilege IAM/RBAC policies |
| `certificate-manager` | ✦ NEW | Manage TLS certificates, renewals, and trust chains |
| `vault-configurator` | ✦ NEW | Configure secrets managers (Vault, AWS SM, etc.) |
| `cors-policy-manager` | ✦ NEW | Configure CORS, CSP, and other security headers |

### 21 · Specialised Domains

Industry-specific and niche technology agents with domain-specific risk profiles.

| Agent | Status | Purpose |
|-------|--------|---------|
| `blockchain-developer` | EXISTING | Smart contracts, DeFi protocols, and Web3 |
| `embedded-systems` | EXISTING | Firmware, RTOS, and hardware-interface programming |
| `fintech-engineer` | EXISTING | Financial systems, payment rails, and regulatory compliance |
| `iot-engineer` | EXISTING | IoT device management, protocols, and edge computing |
| `m365-admin` | EXISTING | Microsoft 365 administration and automation |
| `payment-integration` | EXISTING | Payment gateway integration (Stripe, Adyen, etc.) |

---

## Tier 5 — Production & Live Environment ⛔

These agents interact with production systems. Every action has immediate impact on live users and data. Maximum caution and approval gates required.

### 22 · Deployment & Release

Ship code to production and manage release strategies.

| Agent | Status | Purpose |
|-------|--------|---------|
| `deployment-engineer` | EXISTING | Execute deployments to staging and production environments |
| `deployer` | ✦ NEW | Automated deployment execution with pre/post checks |
| `rollback-manager` | ✦ NEW | Roll back failed deployments to last known good state |
| `feature-flag-manager` | ✦ NEW | Toggle feature flags in LaunchDarkly, Unleash, etc. |
| `canary-release-controller` | ✦ NEW | Manage canary releases with traffic shifting and metrics gates |
| `blue-green-switcher` | ✦ NEW | Switch traffic between blue/green deployment slots |

### 23 · Production Operations & Observability

Monitor, alert, and respond to production issues.

| Agent | Status | Purpose |
|-------|--------|---------|
| `sre-engineer` | EXISTING | Site reliability engineering, SLOs, and error budgets |
| `incident-responder` | EXISTING | Triage and respond to production incidents |
| `devops-incident-responder` | EXISTING | DevOps-focused incident response and remediation |
| `database-administrator` | EXISTING | Manage production databases, replication, and backups |
| `alert-configurator` | ✦ NEW | Configure alerting rules, thresholds, and escalation policies |
| `dashboard-builder` | ✦ NEW | Build observability dashboards in Grafana, Datadog, etc. |
| `log-pipeline-manager` | ✦ NEW | Configure log aggregation, filtering, and retention |
| `sla-monitor` | ✦ NEW | Track SLA/SLO compliance and error budgets |
| `scaling-manager` | ✦ NEW | Configure auto-scaling rules and capacity planning |

### 24 · Production Data Operations

Operate on live data with irreversible consequences.

| Agent | Status | Purpose |
|-------|--------|---------|
| `data-migrator` | ✦ NEW | Run data migrations against production databases |
| `backup-restore-manager` | ✦ NEW | Manage backups, verify integrity, and perform restores |
| `data-anonymizer` | ✦ NEW | Anonymise PII in production data for compliance |
| `retention-policy-enforcer` | ✦ NEW | Apply data retention and deletion policies (GDPR, etc.) |
| `replication-configurator` | ✦ NEW | Configure database replication, failover, and consistency |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total categories | 25 (00–24) |
| Total agents | 179 |
| Existing agents (from current repo) | 117 |
| New suggested agents | 62 |

### Agents per tier

| Tier | Categories | Existing | New | Total |
|------|-----------|----------|-----|-------|
| 0 — Meta | 1 | 10 | 0 | 10 |
| 1 — Advisory | 6 | 36 | 16 | 52 |
| 2 — Local code | 7 | 50 | 18 | 68 |
| 3 — Data/deps/build | 4 | 14 | 10 | 24 |
| 4 — External systems | 4 | 17 | 10 | 27 |
| 5 — Production | 3 | 6 | 10 | 16 |

---

## Migration Map: Old → New Categories

Where each existing category's agents moved to in the new structure.

| Old Category | New Home(s) |
|-------------|------------|
| `01-core-development` | Split across `02` Architecture, `07` Language Specialists, `08` General Development, `12` Frontend |
| `02-language-specialists` | → `07` Language & Framework Specialists (intact) |
| `03-infrastructure` | Split across `19` Infrastructure as Code, `22` Deployment, `23` Production Ops |
| `04-quality-security` | Split across `03` Analysis & Review, `09` Testing, `11` Debugging, `20` Security |
| `05-data-ai` | Split across `14` Data & Database, `15` Data Science & AI/ML |
| `06-developer-experience` | Split across `04` Documentation, `10` Refactoring, `13` DX & Tooling, `16` Dependencies |
| `07-specialized-domains` | Split across `04` Documentation, `06` Business, `08` General Dev, `21` Specialised Domains |
| `08-business-product` | Split across `04` Documentation, `05` Planning, `06` Business |
| `09-meta-orchestration` | → `00` Meta & Orchestration (intact) |
| `10-research-analysis` | → `01` Research & Discovery (intact) |

---

## Folder Structure

```
categories/
├── 00-meta-and-orchestration/
│   ├── README.md
│   ├── multi-agent-coordinator.md
│   ├── workflow-orchestrator.md
│   ├── task-distributor.md
│   ├── agent-organizer.md
│   ├── agent-installer.md
│   ├── context-manager.md
│   ├── error-coordinator.md
│   ├── knowledge-synthesizer.md
│   ├── it-ops-orchestrator.md
│   └── performance-monitor.md
│
├── 01-research-and-discovery/
│   ├── README.md
│   ├── research-analyst.md
│   ├── competitive-analyst.md
│   ├── market-researcher.md
│   ├── data-researcher.md
│   ├── search-specialist.md
│   ├── trend-analyst.md
│   ├── technology-researcher.md          ✦ NEW
│   ├── feasibility-assessor.md           ✦ NEW
│   └── codebase-explorer.md              ✦ NEW
│
├── 02-architecture-and-design/
│   ├── README.md
│   ├── api-designer.md
│   ├── graphql-architect.md
│   ├── microservices-architect.md
│   ├── architect-reviewer.md
│   ├── solution-architect.md             ✦ NEW
│   ├── schema-designer.md               ✦ NEW
│   ├── system-modeler.md                 ✦ NEW
│   └── data-flow-designer.md            ✦ NEW
│
├── 03-analysis-and-review/
│   ├── README.md
│   ├── code-reviewer.md
│   ├── security-auditor.md
│   ├── performance-engineer.md
│   ├── accessibility-tester.md
│   ├── compliance-auditor.md
│   ├── qa-expert.md
│   ├── complexity-analyzer.md            ✦ NEW
│   └── dependency-auditor.md             ✦ NEW
│
├── 04-documentation/
│   ├── README.md
│   ├── documentation-engineer.md
│   ├── api-documenter.md
│   ├── technical-writer.md
│   ├── adr-author.md                     ✦ NEW
│   ├── changelog-generator.md            ✦ NEW
│   ├── runbook-writer.md                 ✦ NEW
│   └── readme-generator.md              ✦ NEW
│
├── 05-planning-and-estimation/
│   ├── README.md
│   ├── project-manager.md
│   ├── scrum-master.md
│   ├── product-manager.md
│   ├── task-planner.md                   ✦ NEW
│   ├── effort-estimator.md               ✦ NEW
│   ├── migration-planner.md              ✦ NEW
│   ├── release-planner.md               ✦ NEW
│   └── risk-assessor.md                  ✦ NEW
│
├── 06-business-and-product/
│   ├── README.md
│   ├── business-analyst.md
│   ├── ux-researcher.md
│   ├── content-marketer.md
│   ├── customer-success-manager.md
│   ├── legal-advisor.md
│   ├── sales-engineer.md
│   ├── quant-analyst.md
│   ├── risk-manager.md
│   └── seo-specialist.md
│
├── 07-language-and-framework-specialists/
│   ├── README.md
│   ├── angular-architect.md
│   ├── cpp-pro.md
│   ├── csharp-developer.md
│   ├── django-developer.md
│   ├── dotnet-core-expert.md
│   ├── dotnet-framework-4.8-expert.md
│   ├── elixir-expert.md
│   ├── flutter-expert.md
│   ├── fsharp-specialist.md
│   ├── golang-pro.md
│   ├── haskell-expert.md
│   ├── java-architect.md
│   ├── javascript-pro.md
│   ├── kotlin-specialist.md
│   ├── laravel-specialist.md
│   ├── lua-specialist.md
│   ├── nextjs-developer.md
│   ├── ocaml-specialist.md
│   ├── php-pro.md
│   ├── powershell-5.1-expert.md
│   ├── powershell-7-expert.md
│   ├── powershell-module-architect.md
│   ├── powershell-ui-architect.md
│   ├── python-pro.md
│   ├── r-specialist.md
│   ├── rails-expert.md
│   ├── react-specialist.md
│   ├── rust-engineer.md
│   ├── spring-boot-engineer.md
│   ├── sql-pro.md
│   ├── swift-expert.md
│   ├── typescript-pro.md
│   ├── vue-expert.md
│   └── wordpress-master.md
│
├── 08-general-development/
│   ├── README.md
│   ├── fullstack-developer.md
│   ├── frontend-developer.md
│   ├── backend-developer.md
│   ├── mobile-developer.md
│   ├── mobile-app-developer.md
│   ├── ui-designer.md
│   ├── websocket-engineer.md
│   ├── electron-pro.md
│   ├── cli-developer.md
│   ├── mcp-developer.md
│   └── game-developer.md
│
├── 09-testing-and-qa/
│   ├── README.md
│   ├── test-automator.md
│   ├── chaos-engineer.md
│   ├── unit-test-writer.md               ✦ NEW
│   ├── integration-test-writer.md        ✦ NEW
│   ├── e2e-test-writer.md               ✦ NEW
│   ├── test-fixture-generator.md         ✦ NEW
│   ├── snapshot-updater.md               ✦ NEW
│   └── coverage-gap-filler.md            ✦ NEW
│
├── 10-refactoring-and-modernization/
│   ├── README.md
│   ├── refactoring-specialist.md
│   ├── legacy-modernizer.md
│   ├── pattern-migrator.md               ✦ NEW
│   ├── tech-debt-reducer.md              ✦ NEW
│   ├── framework-upgrader.md             ✦ NEW
│   ├── language-modernizer.md            ✦ NEW
│   └── linter-fixer.md                   ✦ NEW
│
├── 11-bug-fixing-and-debugging/
│   ├── README.md
│   ├── debugger.md
│   ├── error-detective.md
│   ├── bug-fixer.md                      ✦ NEW
│   ├── log-analyzer.md                   ✦ NEW
│   ├── regression-hunter.md              ✦ NEW
│   └── stack-trace-interpreter.md        ✦ NEW
│
├── 12-frontend-and-ui/
│   ├── README.md
│   ├── ui-component-builder.md           ✦ NEW
│   ├── style-refactorer.md               ✦ NEW
│   ├── responsive-adapter.md             ✦ NEW
│   ├── theme-generator.md               ✦ NEW
│   └── i18n-extractor.md                ✦ NEW
│
├── 13-developer-experience-and-tooling/
│   ├── README.md
│   ├── dx-optimizer.md
│   ├── tooling-engineer.md
│   ├── git-workflow-manager.md
│   ├── slack-expert.md
│   ├── build-engineer.md
│   └── prompt-engineer.md
│
├── 14-data-and-database/
│   ├── README.md
│   ├── database-optimizer.md
│   ├── postgres-pro.md
│   ├── data-engineer.md
│   ├── schema-migrator.md                ✦ NEW
│   ├── seed-data-generator.md            ✦ NEW
│   ├── orm-model-builder.md              ✦ NEW
│   └── data-validator.md                 ✦ NEW
│
├── 15-data-science-and-ai/
│   ├── README.md
│   ├── ai-engineer.md
│   ├── data-analyst.md
│   ├── data-scientist.md
│   ├── llm-architect.md
│   ├── machine-learning-engineer.md
│   ├── ml-engineer.md
│   ├── mlops-engineer.md
│   └── nlp-engineer.md
│
├── 16-dependency-and-package-management/
│   ├── README.md
│   ├── dependency-manager.md
│   ├── dependency-upgrader.md            ✦ NEW
│   ├── vulnerability-patcher.md          ✦ NEW
│   ├── lockfile-resolver.md              ✦ NEW
│   ├── package-publisher.md              ✦ NEW
│   └── monorepo-manager.md              ✦ NEW
│
├── 17-build-and-ci-cd/
│   ├── README.md
│   ├── pipeline-builder.md               ✦ NEW
│   ├── build-optimizer.md                ✦ NEW
│   ├── workflow-author.md                ✦ NEW
│   ├── artifact-publisher.md             ✦ NEW
│   └── environment-configurator.md       ✦ NEW
│
├── 18-api-and-service-integration/
│   ├── README.md
│   ├── api-client-generator.md           ✦ NEW
│   ├── webhook-configurator.md           ✦ NEW
│   ├── third-party-integrator.md         ✦ NEW
│   ├── sdk-wrapper-builder.md            ✦ NEW
│   └── message-queue-configurator.md     ✦ NEW
│
├── 19-infrastructure-as-code/
│   ├── README.md
│   ├── terraform-engineer.md
│   ├── kubernetes-specialist.md
│   ├── cloud-architect.md
│   ├── azure-infra-engineer.md
│   ├── network-engineer.md
│   ├── platform-engineer.md
│   ├── windows-infra-admin.md
│   ├── devops-engineer.md
│   ├── cloudformation-builder.md         ✦ NEW
│   ├── docker-composer.md                ✦ NEW
│   └── helm-chart-builder.md            ✦ NEW
│
├── 20-security-and-secrets/
│   ├── README.md
│   ├── security-engineer.md
│   ├── penetration-tester.md
│   ├── ad-security-reviewer.md
│   ├── powershell-security-hardening.md
│   ├── secret-rotator.md                 ✦ NEW
│   ├── iam-policy-author.md              ✦ NEW
│   ├── certificate-manager.md            ✦ NEW
│   ├── vault-configurator.md             ✦ NEW
│   └── cors-policy-manager.md            ✦ NEW
│
├── 21-specialized-domains/
│   ├── README.md
│   ├── blockchain-developer.md
│   ├── embedded-systems.md
│   ├── fintech-engineer.md
│   ├── iot-engineer.md
│   ├── m365-admin.md
│   └── payment-integration.md
│
├── 22-deployment-and-release/
│   ├── README.md
│   ├── deployment-engineer.md
│   ├── deployer.md                       ✦ NEW
│   ├── rollback-manager.md               ✦ NEW
│   ├── feature-flag-manager.md           ✦ NEW
│   ├── canary-release-controller.md      ✦ NEW
│   └── blue-green-switcher.md            ✦ NEW
│
├── 23-production-ops-and-observability/
│   ├── README.md
│   ├── sre-engineer.md
│   ├── incident-responder.md
│   ├── devops-incident-responder.md
│   ├── database-administrator.md
│   ├── alert-configurator.md             ✦ NEW
│   ├── dashboard-builder.md              ✦ NEW
│   ├── log-pipeline-manager.md           ✦ NEW
│   ├── sla-monitor.md                    ✦ NEW
│   └── scaling-manager.md               ✦ NEW
│
└── 24-production-data-ops/
    ├── README.md
    ├── data-migrator.md                  ✦ NEW
    ├── backup-restore-manager.md         ✦ NEW
    ├── data-anonymizer.md                ✦ NEW
    ├── retention-policy-enforcer.md      ✦ NEW
    └── replication-configurator.md       ✦ NEW
```

---

## Design Principles

**Risk-tiered categories.** Agents within a category share a similar blast radius. This lets you grant blanket permissions at the tier level: run Tier 1–2 autonomously, require PR review for Tier 3, and mandate manual approval for Tier 4–5.

**Numbered prefixes enforce risk ordering.** The `00–24` numbering ensures categories sort in risk-ascending order in any file browser or CLI listing, making the risk gradient immediately visible.

**One agent per file.** Each `.md` file is a self-contained agent definition. This keeps diffs clean, makes agents individually addressable, and lets you compose subsets via symlinks or configuration.

**Task-based over role-based (mostly).** Categories are organised around *what an agent does* rather than *what job title it holds*, with the deliberate exception of Language & Framework Specialists and General Development — where the technology/role framing is the most natural axis of expertise.
