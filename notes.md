# Notes: Repository Restructure

## Agent Migration Map (Old → New)

### Agents that MOVE categories and/or RENAME

| Current File | Current Path | New Name | New Category |
|---|---|---|---|
| `api-designer` | 00-architecture-design | `api-designer` | 02-architecture-and-design |
| `graphql-architect` | 00-architecture-design | `graphql-architect` | 02-architecture-and-design |
| `architect-reviewer` | 00-architecture-design | `architect-reviewer` | 02-architecture-and-design |
| `ui-designer` | 00-architecture-design | `ui-designer` | 08-general-development |
| `microservices-architect` | 01-general-development | `microservices-architect` | 02-architecture-and-design |
| `backend-developer` | 01-general-development | `backend-developer` | 08-general-development |
| `frontend-developer` | 01-general-development | `frontend-developer` | 08-general-development |
| `fullstack-developer` | 01-general-development | `fullstack-developer` | 08-general-development |
| `mobile-developer` | 01-general-development | `mobile-developer` | 08-general-development |
| `websocket-engineer` | 01-general-development | `websocket-engineer` | 08-general-development |
| `angular-specialist` | 02-language-specialists | `angular-architect` | 07-language-and-framework-specialists |
| `cpp-specialist` | 02-language-specialists | `cpp-pro` | 07-language-and-framework-specialists |
| `csharp-specialist` | 02-language-specialists | `csharp-developer` | 07-language-and-framework-specialists |
| `django-specialist` | 02-language-specialists | `django-developer` | 07-language-and-framework-specialists |
| `dotnet-core-specialist` | 02-language-specialists | `dotnet-core-expert` | 07-language-and-framework-specialists |
| `dotnet-framework-specialist` | 02-language-specialists | `dotnet-framework-4.8-expert` | 07-language-and-framework-specialists |
| `electron-specialist` | 02-language-specialists | `electron-pro` | 08-general-development |
| `elixir-specialist` | 02-language-specialists | `elixir-expert` | 07-language-and-framework-specialists |
| `flutter-specialist` | 02-language-specialists | `flutter-expert` | 07-language-and-framework-specialists |
| `golang-specialist` | 02-language-specialists | `golang-pro` | 07-language-and-framework-specialists |
| `javascript-specialist` | 02-language-specialists | `javascript-pro` | 07-language-and-framework-specialists |
| `java-specialist` | 02-language-specialists | `java-architect` | 07-language-and-framework-specialists |
| `kotlin-specialist` | 02-language-specialists | `kotlin-specialist` | 07-language-and-framework-specialists |
| `laravel-specialist` | 02-language-specialists | `laravel-specialist` | 07-language-and-framework-specialists |
| `nextjs-specialist` | 02-language-specialists | `nextjs-developer` | 07-language-and-framework-specialists |
| `php-specialist` | 02-language-specialists | `php-pro` | 07-language-and-framework-specialists |
| `powershell-5.1-specialist` | 02-language-specialists | `powershell-5.1-expert` | 07-language-and-framework-specialists |
| `powershell-7-specialist` | 02-language-specialists | `powershell-7-expert` | 07-language-and-framework-specialists |
| `powershell-module-specialist` | 02-language-specialists | `powershell-module-architect` | 07-language-and-framework-specialists |
| `powershell-ui-specialist` | 02-language-specialists | `powershell-ui-architect` | 07-language-and-framework-specialists |
| `python-specialist` | 02-language-specialists | `python-pro` | 07-language-and-framework-specialists |
| `rails-specialist` | 02-language-specialists | `rails-expert` | 07-language-and-framework-specialists |
| `react-specialist` | 02-language-specialists | `react-specialist` | 07-language-and-framework-specialists |
| `rust-specialist` | 02-language-specialists | `rust-engineer` | 07-language-and-framework-specialists |
| `spring-boot-specialist` | 02-language-specialists | `spring-boot-engineer` | 07-language-and-framework-specialists |
| `sql-specialist` | 02-language-specialists | `sql-pro` | 07-language-and-framework-specialists |
| `swift-specialist` | 02-language-specialists | `swift-expert` | 07-language-and-framework-specialists |
| `typescript-specialist` | 02-language-specialists | `typescript-pro` | 07-language-and-framework-specialists |
| `vue-specialist` | 02-language-specialists | `vue-expert` | 07-language-and-framework-specialists |
| `wordpress-specialist` | 02-language-specialists | `wordpress-master` | 07-language-and-framework-specialists |
| `azure-infra-engineer` | 03-infrastructure | `azure-infra-engineer` | 19-infrastructure-as-code |
| `cloud-architect` | 03-infrastructure | `cloud-architect` | 19-infrastructure-as-code |
| `database-admin` | 03-infrastructure | `database-administrator` | 23-production-ops-and-observability |
| `database-performance-engineer` | 03-infrastructure | `database-optimizer` | 14-data-and-database |
| `deployment-engineer` | 03-infrastructure | `deployment-engineer` | 22-deployment-and-release |
| `devops-engineer` | 03-infrastructure | `devops-engineer` | 19-infrastructure-as-code |
| `incident-responder` | 03-infrastructure | `incident-responder` | 23-production-ops-and-observability |
| `kubernetes-engineer` | 03-infrastructure | `kubernetes-specialist` | 19-infrastructure-as-code |
| `m365-admin` | 03-infrastructure | `m365-admin` | 21-specialized-domains |
| `network-engineer` | 03-infrastructure | `network-engineer` | 19-infrastructure-as-code |
| `platform-engineer` | 03-infrastructure | `platform-engineer` | 19-infrastructure-as-code |
| `postgresql-admin` | 03-infrastructure | `postgres-pro` | 14-data-and-database |
| `security-engineer` | 03-infrastructure | `security-engineer` | 20-security-and-secrets |
| `sre-engineer` | 03-infrastructure | `sre-engineer` | 23-production-ops-and-observability |
| `terraform-engineer` | 03-infrastructure | `terraform-engineer` | 19-infrastructure-as-code |
| `windows-infra-admin` | 03-infrastructure | `windows-infra-admin` | 19-infrastructure-as-code |
| `accessibility-tester` | 04-quality-security | `accessibility-tester` | 03-analysis-and-review |
| `ad-security-reviewer` | 04-quality-security | `ad-security-reviewer` | 20-security-and-secrets |
| `chaos-engineer` | 04-quality-security | `chaos-engineer` | 09-testing-and-qa |
| `code-reviewer` | 04-quality-security | `code-reviewer` | 03-analysis-and-review |
| `compliance-auditor` | 04-quality-security | `compliance-auditor` | 03-analysis-and-review |
| `debugger` | 04-quality-security | `debugger` | 11-bug-fixing-and-debugging |
| `error-diagnostics-engineer` | 04-quality-security | `error-detective` | 11-bug-fixing-and-debugging |
| `penetration-tester` | 04-quality-security | `penetration-tester` | 20-security-and-secrets |
| `performance-engineer` | 04-quality-security | `performance-engineer` | 03-analysis-and-review |
| `powershell-security-reviewer` | 04-quality-security | `powershell-security-hardening` | 20-security-and-secrets |
| `qa-expert` | 04-quality-security | `qa-expert` | 03-analysis-and-review |
| `security-auditor` | 04-quality-security | `security-auditor` | 03-analysis-and-review |
| `test-automator` | 04-quality-security | `test-automator` | 09-testing-and-qa |
| `ai-engineer` | 05-data-ai | `ai-engineer` | 15-data-science-and-ai |
| `data-analyst` | 05-data-ai | `data-analyst` | 15-data-science-and-ai |
| `data-engineer` | 05-data-ai | `data-engineer` | 14-data-and-database |
| `data-scientist` | 05-data-ai | `data-scientist` | 15-data-science-and-ai |
| `llm-architect` | 05-data-ai | `llm-architect` | 15-data-science-and-ai |
| `ml-engineer` | 05-data-ai | `ml-engineer` | 15-data-science-and-ai |
| `mlops-engineer` | 05-data-ai | `mlops-engineer` | 15-data-science-and-ai |
| `nlp-engineer` | 05-data-ai | `nlp-engineer` | 15-data-science-and-ai |
| `prompt-engineer` | 05-data-ai | `prompt-engineer` | 13-developer-experience-and-tooling |
| `api-documenter` | 06-developer-experience | `api-documenter` | 04-documentation |
| `build-engineer` | 06-developer-experience | `build-engineer` | 13-developer-experience-and-tooling |
| `cli-developer` | 06-developer-experience | `cli-developer` | 08-general-development |
| `dependency-manager` | 06-developer-experience | `dependency-manager` | 16-dependency-and-package-management |
| `documentation-engineer` | 06-developer-experience | `documentation-engineer` | 04-documentation |
| `dx-optimizer` | 06-developer-experience | `dx-optimizer` | 13-developer-experience-and-tooling |
| `git-workflow-manager` | 06-developer-experience | `git-workflow-manager` | 13-developer-experience-and-tooling |
| `legacy-modernizer` | 06-developer-experience | `legacy-modernizer` | 10-refactoring-and-modernization |
| `mcp-developer` | 06-developer-experience | `mcp-developer` | 08-general-development |
| `refactoring-specialist` | 06-developer-experience | `refactoring-specialist` | 10-refactoring-and-modernization |
| `tooling-engineer` | 06-developer-experience | `tooling-engineer` | 13-developer-experience-and-tooling |
| `blockchain-developer` | 07-specialized-domains | `blockchain-developer` | 21-specialized-domains |
| `embedded-systems-engineer` | 07-specialized-domains | `embedded-systems` | 21-specialized-domains |
| `fintech-engineer` | 07-specialized-domains | `fintech-engineer` | 21-specialized-domains |
| `game-developer` | 07-specialized-domains | `game-developer` | 08-general-development |
| `iot-engineer` | 07-specialized-domains | `iot-engineer` | 21-specialized-domains |
| `payment-integration-specialist` | 07-specialized-domains | `payment-integration` | 21-specialized-domains |
| `quant-analyst` | 07-specialized-domains | `quant-analyst` | 06-business-and-product |
| `risk-manager` | 07-specialized-domains | `risk-manager` | 06-business-and-product |
| `slack-specialist` | 07-specialized-domains | `slack-expert` | 13-developer-experience-and-tooling |
| `unreal-specialist` | 07-specialized-domains | DROPPED (merge into game-developer) | N/A |
| `business-analyst` | 08-business-product | `business-analyst` | 06-business-and-product |
| `content-marketer` | 08-business-product | `content-marketer` | 06-business-and-product |
| `customer-success-manager` | 08-business-product | `customer-success-manager` | 06-business-and-product |
| `legal-advisor` | 08-business-product | `legal-advisor` | 06-business-and-product |
| `product-manager` | 08-business-product | `product-manager` | 05-planning-and-estimation |
| `project-manager` | 08-business-product | `project-manager` | 05-planning-and-estimation |
| `sales-engineer` | 08-business-product | `sales-engineer` | 06-business-and-product |
| `scrum-master` | 08-business-product | `scrum-master` | 05-planning-and-estimation |
| `seo-specialist` | 08-business-product | `seo-specialist` | 06-business-and-product |
| `technical-writer` | 08-business-product | `technical-writer` | 04-documentation |
| `ux-researcher` | 08-business-product | `ux-researcher` | 06-business-and-product |
| All 09-meta-orchestration agents | 09-meta-orchestration | same names | 00-meta-and-orchestration |
| All 10-research-analysis agents | 10-research-analysis | same names | 01-research-and-discovery |

### Agents marked EXISTING in restructure but NOT in repo (need creation)

- `haskell-expert` (07)
- `lua-specialist` (07)
- `ocaml-specialist` (07)
- `r-specialist` (07)
- `fsharp-specialist` (07)
- `machine-learning-engineer` (15) — distinct from `ml-engineer`
- `mobile-app-developer` (08) — distinct from `mobile-developer`
- `devops-incident-responder` (23) — distinct from `incident-responder`

### New agents to create (✦ NEW in restructure) — 62 total

**01** (3): technology-researcher, feasibility-assessor, codebase-explorer
**02** (4): solution-architect, schema-designer, system-modeler, data-flow-designer
**03** (2): complexity-analyzer, dependency-auditor
**04** (4): adr-author, changelog-generator, runbook-writer, readme-generator
**05** (5): task-planner, effort-estimator, migration-planner, release-planner, risk-assessor
**09** (6): unit-test-writer, integration-test-writer, e2e-test-writer, test-fixture-generator, snapshot-updater, coverage-gap-filler
**10** (5): pattern-migrator, tech-debt-reducer, framework-upgrader, language-modernizer, linter-fixer
**11** (4): bug-fixer, log-analyzer, regression-hunter, stack-trace-interpreter
**12** (5): ui-component-builder, style-refactorer, responsive-adapter, theme-generator, i18n-extractor
**14** (4): schema-migrator, seed-data-generator, orm-model-builder, data-validator
**16** (5): dependency-upgrader, vulnerability-patcher, lockfile-resolver, package-publisher, monorepo-manager
**17** (5): pipeline-builder, build-optimizer, workflow-author, artifact-publisher, environment-configurator
**18** (5): api-client-generator, webhook-configurator, third-party-integrator, sdk-wrapper-builder, message-queue-configurator
**19** (3): cloudformation-builder, docker-composer, helm-chart-builder
**20** (5): secret-rotator, iam-policy-author, certificate-manager, vault-configurator, cors-policy-manager
**22** (5): deployer, rollback-manager, feature-flag-manager, canary-release-controller, blue-green-switcher
**23** (5): alert-configurator, dashboard-builder, log-pipeline-manager, sla-monitor, scaling-manager
**24** (5): data-migrator, backup-restore-manager, data-anonymizer, retention-policy-enforcer, replication-configurator

## Risk Tier Mapping

| Categories | Tier | Risk Level | Icon |
|---|---|---|---|
| 00 | 0 | Meta | ⚪ |
| 01-06 | 1 | Low (Read-Only/Advisory) | 🟢 |
| 07-13 | 2 | Medium (Local Code) | 🟡 |
| 14-17 | 3 | Medium-High (Data/Deps/Build) | 🟠 |
| 18-21 | 4 | High (External Systems) | 🔴 |
| 22-24 | 5 | Critical (Production) | ⛔ |

## Plugin Names

| Cat | Plugin Name | Marketplace Category |
|---|---|---|
| 00 | laywill-meta | orchestration |
| 01 | laywill-research | research |
| 02 | laywill-arch | architecture |
| 03 | laywill-review | quality |
| 04 | laywill-docs | documentation |
| 05 | laywill-planning | planning |
| 06 | laywill-biz | business |
| 07 | laywill-lang | development |
| 08 | laywill-dev | development |
| 09 | laywill-testing | quality |
| 10 | laywill-refactor | development |
| 11 | laywill-debug | quality |
| 12 | laywill-frontend | development |
| 13 | laywill-dx | tooling |
| 14 | laywill-data | data |
| 15 | laywill-ai | data |
| 16 | laywill-deps | tooling |
| 17 | laywill-cicd | infrastructure |
| 18 | laywill-integrations | infrastructure |
| 19 | laywill-infra | infrastructure |
| 20 | laywill-security | security |
| 21 | laywill-domains | specialized |
| 22 | laywill-deploy | infrastructure |
| 23 | laywill-ops | infrastructure |
| 24 | laywill-dataops | data |
