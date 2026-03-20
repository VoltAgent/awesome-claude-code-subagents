# Awesome Subagents

**A curated collection of AI coding agent definitions for Claude Code, OpenCode, and Cursor.**

[![Awesome](https://awesome.re/badge.svg)](https://awesome.re)
![Agent Count](https://img.shields.io/badge/agents-131+-blue?style=flat-square)
[![Last Update](https://img.shields.io/github/last-commit/ampedweb/awesome-subagents?label=Last%20update&style=flat-square)](https://github.com/ampedweb/awesome-subagents)

> Forked from [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) and extended to support multiple AI coding tools.

---

## Overview

This repository contains 131+ specialised AI agent definitions organised into 10 categories. The definitions in `categories/` use the Claude Code format as the canonical source. The `generate.sh` script produces equivalent definitions for OpenCode and Cursor.

Cursor also reads `.claude/agents/` and `~/.claude/agents/` natively for compatibility, but the generated Cursor definitions in `agent-specific/cursor/` add `readonly: true` support for agents that have no write, edit, or bash tools.

### Agent Storage Locations

| Tool | Global | Project |
|------|--------|---------|
| Claude Code | `~/.claude/agents/` | `.claude/agents/` |
| OpenCode | `~/.config/opencode/agents/` | `.opencode/agents/` |
| Cursor | `~/.cursor/agents/` | `.cursor/agents/` |

---

## Installation

### Claude Code

Claude Code reads the definitions in `categories/` directly. No generation step is needed.

**Option 1 - Symlink via setup.sh (recommended):**

```bash
git clone https://github.com/ampedweb/awesome-subagents.git
cd awesome-subagents
./setup.sh global                        # global access across all projects
./setup.sh project /path/to/your-project # project-level only
```

The script creates a single symlink named `awesome-subagents/` inside each tool's agents directory, so agents appear as `awesome-subagents/01-core-development/backend-developer`, etc.

**Option 2 - Copy manually:**

```bash
git clone https://github.com/ampedweb/awesome-subagents.git
cp -r awesome-subagents/categories ~/.claude/agents/awesome-subagents
```

### OpenCode

OpenCode requires generated definitions. Run `generate.sh` first, then `setup.sh`.

```bash
git clone https://github.com/ampedweb/awesome-subagents.git
cd awesome-subagents
./generate.sh                            # generates agent-specific/opencode/ and agent-specific/cursor/
./setup.sh global                        # symlinks OpenCode into ~/.config/opencode/agents/
./setup.sh project /path/to/your-project # symlinks OpenCode into the project
```

### Cursor

Cursor requires generated definitions for full `readonly` support. Run `generate.sh` first, then `setup.sh`.

```bash
git clone https://github.com/ampedweb/awesome-subagents.git
cd awesome-subagents
./generate.sh                            # generates agent-specific/cursor/ (with readonly: true where applicable)
./setup.sh global                        # symlinks Cursor into ~/.cursor/agents/
./setup.sh project /path/to/your-project # symlinks Cursor into the project
```

Cursor also reads `.claude/agents/` natively, so installing for Claude Code covers basic Cursor support. The generated Cursor definitions additionally apply `readonly: true` to agents that have no write, edit, or bash tools, and map the `model` field to Cursor-native model IDs (`sonnet` -> `claude-4.6-sonnet`, `opus` -> `claude-4.6-opus`, `haiku` -> `claude-4.5-haiku`).

### Scripts Reference

**`generate.sh`** - Translates Claude Code definitions into OpenCode and Cursor formats.

| Command | Description |
|---------|-------------|
| `./generate.sh` | Generate all definitions (default) |
| `./generate.sh clean` | Remove all generated files |
| `./generate.sh list` | List source agents with details |
| `./generate.sh help` | Show help |

**`setup.sh`** - Creates or removes symlinks between agent directories and tool config. All commands present an interactive checkbox selector to choose which tools (Claude Code, OpenCode, Cursor) to link or unlink.

| Command | Description |
|---------|-------------|
| `./setup.sh global` | Symlink into global config |
| `./setup.sh project <path>` | Symlink into a project's local config |
| `./setup.sh unlink global` | Remove global symlinks |
| `./setup.sh unlink project <path>` | Remove project symlinks |

---

## Categories

### [01. Core Development](categories/01-core-development/)

Essential development agents for everyday coding tasks.

- [**api-designer**](categories/01-core-development/api-designer.md) - REST and GraphQL API architect
- [**backend-developer**](categories/01-core-development/backend-developer.md) - Server-side expert for scalable APIs
- [**electron-pro**](categories/01-core-development/electron-pro.md) - Desktop application expert
- [**frontend-developer**](categories/01-core-development/frontend-developer.md) - UI/UX specialist for React, Vue, and Angular
- [**fullstack-developer**](categories/01-core-development/fullstack-developer.md) - End-to-end feature development
- [**graphql-architect**](categories/01-core-development/graphql-architect.md) - GraphQL schema and federation expert
- [**microservices-architect**](categories/01-core-development/microservices-architect.md) - Distributed systems designer
- [**mobile-developer**](categories/01-core-development/mobile-developer.md) - Cross-platform mobile specialist
- [**ui-designer**](categories/01-core-development/ui-designer.md) - Visual design and interaction specialist
- [**websocket-engineer**](categories/01-core-development/websocket-engineer.md) - Real-time communication specialist

### [02. Language Specialists](categories/02-language-specialists/)

Language-specific experts with deep framework knowledge.

- [**angular-architect**](categories/02-language-specialists/angular-architect.md) - Angular 15+ enterprise patterns expert
- [**cpp-pro**](categories/02-language-specialists/cpp-pro.md) - C++ performance expert
- [**csharp-developer**](categories/02-language-specialists/csharp-developer.md) - .NET ecosystem specialist
- [**django-developer**](categories/02-language-specialists/django-developer.md) - Django 4+ web development expert
- [**dotnet-core-expert**](categories/02-language-specialists/dotnet-core-expert.md) - .NET 8 cross-platform specialist
- [**dotnet-framework-4.8-expert**](categories/02-language-specialists/dotnet-framework-4.8-expert.md) - .NET Framework legacy enterprise specialist
- [**elixir-expert**](categories/02-language-specialists/elixir-expert.md) - Elixir and OTP fault-tolerant systems expert
- [**flutter-expert**](categories/02-language-specialists/flutter-expert.md) - Flutter 3+ cross-platform mobile expert
- [**golang-pro**](categories/02-language-specialists/golang-pro.md) - Go concurrency specialist
- [**java-architect**](categories/02-language-specialists/java-architect.md) - Enterprise Java expert
- [**javascript-pro**](categories/02-language-specialists/javascript-pro.md) - JavaScript development expert
- [**kotlin-specialist**](categories/02-language-specialists/kotlin-specialist.md) - Modern JVM language expert
- [**laravel-specialist**](categories/02-language-specialists/laravel-specialist.md) - Laravel 10+ PHP framework expert
- [**nextjs-developer**](categories/02-language-specialists/nextjs-developer.md) - Next.js 14+ full-stack specialist
- [**php-pro**](categories/02-language-specialists/php-pro.md) - PHP web development expert
- [**powershell-5.1-expert**](categories/02-language-specialists/powershell-5.1-expert.md) - Windows PowerShell 5.1 and full .NET Framework automation specialist
- [**powershell-7-expert**](categories/02-language-specialists/powershell-7-expert.md) - Cross-platform PowerShell 7+ automation and modern .NET specialist
- [**python-pro**](categories/02-language-specialists/python-pro.md) - Python ecosystem master
- [**rails-expert**](categories/02-language-specialists/rails-expert.md) - Rails 8.1 rapid development expert
- [**react-specialist**](categories/02-language-specialists/react-specialist.md) - React 18+ modern patterns expert
- [**rust-engineer**](categories/02-language-specialists/rust-engineer.md) - Systems programming expert
- [**spring-boot-engineer**](categories/02-language-specialists/spring-boot-engineer.md) - Spring Boot 3+ microservices expert
- [**sql-pro**](categories/02-language-specialists/sql-pro.md) - Database query expert
- [**swift-expert**](categories/02-language-specialists/swift-expert.md) - iOS and macOS specialist
- [**typescript-pro**](categories/02-language-specialists/typescript-pro.md) - TypeScript specialist
- [**vue-expert**](categories/02-language-specialists/vue-expert.md) - Vue 3 Composition API expert

### [03. Infrastructure](categories/03-infrastructure/)

DevOps, cloud, and deployment specialists.

- [**azure-infra-engineer**](categories/03-infrastructure/azure-infra-engineer.md) - Azure infrastructure and Az PowerShell automation expert
- [**cloud-architect**](categories/03-infrastructure/cloud-architect.md) - AWS/GCP/Azure specialist
- [**database-administrator**](categories/03-infrastructure/database-administrator.md) - Database management expert
- [**deployment-engineer**](categories/03-infrastructure/deployment-engineer.md) - Deployment automation specialist
- [**devops-engineer**](categories/03-infrastructure/devops-engineer.md) - CI/CD and automation expert
- [**devops-incident-responder**](categories/03-infrastructure/devops-incident-responder.md) - DevOps incident management
- [**docker-expert**](categories/03-infrastructure/docker-expert.md) - Docker containerisation and optimisation expert
- [**incident-responder**](categories/03-infrastructure/incident-responder.md) - System incident response expert
- [**kubernetes-specialist**](categories/03-infrastructure/kubernetes-specialist.md) - Container orchestration master
- [**network-engineer**](categories/03-infrastructure/network-engineer.md) - Network infrastructure specialist
- [**platform-engineer**](categories/03-infrastructure/platform-engineer.md) - Platform architecture expert
- [**security-engineer**](categories/03-infrastructure/security-engineer.md) - Infrastructure security specialist
- [**sre-engineer**](categories/03-infrastructure/sre-engineer.md) - Site reliability engineering expert
- [**terraform-engineer**](categories/03-infrastructure/terraform-engineer.md) - Infrastructure as Code expert
- [**terragrunt-expert**](categories/03-infrastructure/terragrunt-expert.md) - Terragrunt orchestration and DRY IaC specialist
- [**windows-infra-admin**](categories/03-infrastructure/windows-infra-admin.md) - Active Directory, DNS, DHCP, and GPO automation specialist

### [04. Quality and Security](categories/04-quality-security/)

Testing, security, and code quality experts.

- [**accessibility-tester**](categories/04-quality-security/accessibility-tester.md) - A11y compliance expert
- [**ad-security-reviewer**](categories/04-quality-security/ad-security-reviewer.md) - Active Directory security and GPO audit specialist
- [**architect-reviewer**](categories/04-quality-security/architect-reviewer.md) - Architecture review specialist
- [**chaos-engineer**](categories/04-quality-security/chaos-engineer.md) - System resilience testing expert
- [**code-reviewer**](categories/04-quality-security/code-reviewer.md) - Code quality guardian
- [**compliance-auditor**](categories/04-quality-security/compliance-auditor.md) - Regulatory compliance expert
- [**debugger**](categories/04-quality-security/debugger.md) - Advanced debugging specialist
- [**error-detective**](categories/04-quality-security/error-detective.md) - Error analysis and resolution expert
- [**penetration-tester**](categories/04-quality-security/penetration-tester.md) - Ethical hacking specialist
- [**performance-engineer**](categories/04-quality-security/performance-engineer.md) - Performance optimisation expert
- [**powershell-security-hardening**](categories/04-quality-security/powershell-security-hardening.md) - PowerShell security hardening and compliance specialist
- [**qa-expert**](categories/04-quality-security/qa-expert.md) - Test automation specialist
- [**security-auditor**](categories/04-quality-security/security-auditor.md) - Security vulnerability expert
- [**test-automator**](categories/04-quality-security/test-automator.md) - Test automation framework expert

### [05. Data and AI](categories/05-data-ai/)

Data engineering, ML, and AI specialists.

- [**ai-engineer**](categories/05-data-ai/ai-engineer.md) - AI system design and deployment expert
- [**data-analyst**](categories/05-data-ai/data-analyst.md) - Data insights and visualisation specialist
- [**data-engineer**](categories/05-data-ai/data-engineer.md) - Data pipeline architect
- [**data-scientist**](categories/05-data-ai/data-scientist.md) - Analytics and insights expert
- [**database-optimizer**](categories/05-data-ai/database-optimizer.md) - Database performance specialist
- [**llm-architect**](categories/05-data-ai/llm-architect.md) - Large language model architect
- [**machine-learning-engineer**](categories/05-data-ai/machine-learning-engineer.md) - Machine learning systems expert
- [**ml-engineer**](categories/05-data-ai/ml-engineer.md) - Machine learning specialist
- [**mlops-engineer**](categories/05-data-ai/mlops-engineer.md) - MLOps and model deployment expert
- [**nlp-engineer**](categories/05-data-ai/nlp-engineer.md) - Natural language processing expert
- [**postgres-pro**](categories/05-data-ai/postgres-pro.md) - PostgreSQL database expert
- [**prompt-engineer**](categories/05-data-ai/prompt-engineer.md) - Prompt optimisation specialist

### [06. Developer Experience](categories/06-developer-experience/)

Tooling and developer productivity experts.

- [**build-engineer**](categories/06-developer-experience/build-engineer.md) - Build system specialist
- [**cli-developer**](categories/06-developer-experience/cli-developer.md) - Command-line tool creator
- [**dependency-manager**](categories/06-developer-experience/dependency-manager.md) - Package and dependency specialist
- [**documentation-engineer**](categories/06-developer-experience/documentation-engineer.md) - Technical documentation expert
- [**dx-optimizer**](categories/06-developer-experience/dx-optimizer.md) - Developer experience optimisation specialist
- [**git-workflow-manager**](categories/06-developer-experience/git-workflow-manager.md) - Git workflow and branching expert
- [**legacy-modernizer**](categories/06-developer-experience/legacy-modernizer.md) - Legacy code modernisation specialist
- [**mcp-developer**](categories/06-developer-experience/mcp-developer.md) - Model Context Protocol specialist
- [**powershell-module-architect**](categories/06-developer-experience/powershell-module-architect.md) - PowerShell module and profile architecture specialist
- [**powershell-ui-architect**](categories/06-developer-experience/powershell-ui-architect.md) - PowerShell UI/UX specialist for WinForms, WPF, Metro frameworks, and TUIs
- [**refactoring-specialist**](categories/06-developer-experience/refactoring-specialist.md) - Code refactoring expert
- [**slack-expert**](categories/06-developer-experience/slack-expert.md) - Slack platform and @slack/bolt specialist
- [**tooling-engineer**](categories/06-developer-experience/tooling-engineer.md) - Developer tooling specialist

### [07. Specialised Domains](categories/07-specialized-domains/)

Domain-specific technology experts.

- [**api-documenter**](categories/07-specialized-domains/api-documenter.md) - API documentation specialist
- [**blockchain-developer**](categories/07-specialized-domains/blockchain-developer.md) - Web3 and crypto specialist
- [**embedded-systems**](categories/07-specialized-domains/embedded-systems.md) - Embedded and real-time systems expert
- [**fintech-engineer**](categories/07-specialized-domains/fintech-engineer.md) - Financial technology specialist
- [**game-developer**](categories/07-specialized-domains/game-developer.md) - Game development expert
- [**iot-engineer**](categories/07-specialized-domains/iot-engineer.md) - IoT systems developer
- [**m365-admin**](categories/07-specialized-domains/m365-admin.md) - Microsoft 365, Exchange Online, Teams, and SharePoint administration specialist
- [**mobile-app-developer**](categories/07-specialized-domains/mobile-app-developer.md) - Mobile application specialist
- [**payment-integration**](categories/07-specialized-domains/payment-integration.md) - Payment systems expert
- [**quant-analyst**](categories/07-specialized-domains/quant-analyst.md) - Quantitative analysis specialist
- [**risk-manager**](categories/07-specialized-domains/risk-manager.md) - Risk assessment and management expert
- [**seo-specialist**](categories/07-specialized-domains/seo-specialist.md) - Search engine optimisation expert

### [08. Business and Product](categories/08-business-product/)

Product management and business analysis.

- [**business-analyst**](categories/08-business-product/business-analyst.md) - Requirements specialist
- [**content-marketer**](categories/08-business-product/content-marketer.md) - Content marketing specialist
- [**customer-success-manager**](categories/08-business-product/customer-success-manager.md) - Customer success expert
- [**legal-advisor**](categories/08-business-product/legal-advisor.md) - Legal and compliance specialist
- [**product-manager**](categories/08-business-product/product-manager.md) - Product strategy expert
- [**project-manager**](categories/08-business-product/project-manager.md) - Project management specialist
- [**sales-engineer**](categories/08-business-product/sales-engineer.md) - Technical sales expert
- [**scrum-master**](categories/08-business-product/scrum-master.md) - Agile methodology expert
- [**technical-writer**](categories/08-business-product/technical-writer.md) - Technical documentation specialist
- [**ux-researcher**](categories/08-business-product/ux-researcher.md) - User research expert
- [**wordpress-master**](categories/08-business-product/wordpress-master.md) - WordPress development and optimisation expert

### [09. Meta and Orchestration](categories/09-meta-orchestration/)

Agent coordination and meta-programming.

- [**agent-installer**](categories/09-meta-orchestration/agent-installer.md) - Browse and install agents from this repository via GitHub
- [**agent-organizer**](categories/09-meta-orchestration/agent-organizer.md) - Multi-agent coordinator
- [**context-manager**](categories/09-meta-orchestration/context-manager.md) - Context optimisation expert
- [**error-coordinator**](categories/09-meta-orchestration/error-coordinator.md) - Error handling and recovery specialist
- [**it-ops-orchestrator**](categories/09-meta-orchestration/it-ops-orchestrator.md) - IT operations workflow orchestration specialist
- [**knowledge-synthesizer**](categories/09-meta-orchestration/knowledge-synthesizer.md) - Knowledge aggregation expert
- [**multi-agent-coordinator**](categories/09-meta-orchestration/multi-agent-coordinator.md) - Advanced multi-agent orchestration
- [**performance-monitor**](categories/09-meta-orchestration/performance-monitor.md) - Agent performance optimisation
- [**pied-piper**](https://github.com/sathish316/pied-piper/) - Orchestrate team of AI subagents for repetitive SDLC workflows
- [**task-distributor**](categories/09-meta-orchestration/task-distributor.md) - Task allocation specialist
- [**taskade**](https://github.com/taskade/mcp) - AI-powered workspace with autonomous agents, real-time collaboration, and workflow automation with MCP integration
- [**workflow-orchestrator**](categories/09-meta-orchestration/workflow-orchestrator.md) - Complex workflow automation

### [10. Research and Analysis](categories/10-research-analysis/)

Research, search, and analysis specialists.

- [**competitive-analyst**](categories/10-research-analysis/competitive-analyst.md) - Competitive intelligence specialist
- [**data-researcher**](categories/10-research-analysis/data-researcher.md) - Data discovery and analysis expert
- [**market-researcher**](categories/10-research-analysis/market-researcher.md) - Market analysis and consumer insights
- [**research-analyst**](categories/10-research-analysis/research-analyst.md) - Comprehensive research specialist
- [**scientific-literature-researcher**](categories/10-research-analysis/scientific-literature-researcher.md) - Scientific paper search and evidence synthesis via [BGPT MCP](https://github.com/connerlambden/bgpt-mcp)
- [**search-specialist**](categories/10-research-analysis/search-specialist.md) - Advanced information retrieval expert
- [**trend-analyst**](categories/10-research-analysis/trend-analyst.md) - Emerging trends and forecasting expert

---

## Understanding Agents

Specialised agents are AI assistants configured with task-specific instructions, tool permissions, and model selections. They act as dedicated helpers for particular types of work.

### Why Use Specialised Agents?

**Independent context windows** - Each agent operates in its own isolated context, keeping the primary conversation uncluttered with task-specific detail.

**Domain-specific intelligence** - Agents carry carefully crafted instructions tuned to their area of expertise, producing better results on specialised tasks than a generic assistant.

**Reusable across projects** - Once installed, agents are available in every project. They can be shared across a team to ensure consistent approaches to common tasks.

**Granular tool permissions** - Each agent is configured with only the tools it needs. Read-only agents cannot modify files; code-writing agents have full access.

### Agent Definition Format

The `categories/` definitions use the Claude Code format as the canonical source:

```yaml
---
name: agent-name
description: When this agent should be invoked
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

You are a [role description and expertise areas]...
```

`generate.sh` translates these into the equivalent OpenCode and Cursor formats automatically.

### Model Routing

Each agent includes a `model` field that routes it to an appropriate model, balancing quality and cost:

| Model | When it is used | Examples |
|-------|-----------------|---------|
| `opus` | Deep reasoning - architecture reviews, security audits, financial logic | `security-auditor`, `architect-reviewer`, `fintech-engineer` |
| `sonnet` | Everyday coding - writing, debugging, refactoring | `python-pro`, `backend-developer`, `devops-engineer` |
| `haiku` | Quick tasks - docs, search, dependency checks | `documentation-engineer`, `seo-specialist`, `build-engineer` |

### Tool Assignment

Each agent's `tools` field specifies the minimum permissions needed for its role:

| Role type | Tools |
|-----------|-------|
| Read-only (reviewers, auditors) | `Read, Grep, Glob` |
| Research (analysts, researchers) | `Read, Grep, Glob, WebFetch, WebSearch` |
| Code writers (developers, engineers) | `Read, Write, Edit, Bash, Glob, Grep` |
| Documentation (writers, documenters) | `Read, Write, Edit, Glob, Grep, WebFetch, WebSearch` |

---

## Related Projects

- [**awesome-agent-skills**](https://github.com/VoltAgent/awesome-agent-skills) - Agent skills collection
- [**awesome-codex-subagents**](https://github.com/VoltAgent/awesome-codex-subagents) - Codex subagent definitions
- [**awesome-openclaw-skills**](https://github.com/VoltAgent/awesome-openclaw-skills) - OpenClaw skills
- [**awesome-ai-agent-papers**](https://github.com/VoltAgent/awesome-ai-agent-papers) - AI agent research papers

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Add new agent definitions via pull request
- Improve existing definitions
- Report issues

---

## Licence

MIT - see [LICENSE](LICENSE)

All agent definitions are provided "as is" without warranty. The maintainers do not audit or guarantee the security or correctness of any definition and accept no liability for issues arising from their use.

If you find an issue with a listed agent or want your contribution removed, please [open an issue](https://github.com/ampedweb/awesome-subagents/issues).
