<div align="center">

# Awesome Subagents (ZCode & OpenCode)

**The awesome collection of 158+ subagents across 10 categories for ZCode and OpenCode.**

[![Awesome](https://awesome.re/badge.svg)](https://awesome.re)
![Subagent Count](https://img.shields.io/badge/subagents-158-blue?style=classic)
![Platform](https://img.shields.io/badge/platform-ZCode%20%7C%20OpenCode-blueviolet?style=classic)

</div>

This repository serves as the definitive collection of subagents for **ZCode** and **OpenCode**, specialized AI assistants designed for specific development tasks.

> **Credits:** This collection is an adaptation of [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) supporting both **ZCode** and **OpenCode** — agent definitions feature dual compatibility (`mode: subagent`, inherit-by-default models, and platform-specific tool/permission mapping), and plugin manifests in `.zcode-plugin/`. All credit for the original 158 agent definitions goes to the VoltAgent community.

## Installation

### Option 1: NPX Zero-Install (Recommended for Windows, macOS, Linux)

No git clone, curl, or bash required — run directly via `npx` in any terminal (**PowerShell**, **Command Prompt**, **Windows Terminal**, **macOS Terminal**, or **Linux**):

```bash
# Launch interactive installer menu (supports ZCode & OpenCode)
npx github:a2mus/awesome-zcode-subagents
```

#### OpenCode Commands:
```bash
# Install recommended Starter Pack for OpenCode (global: ~/.config/opencode/agents/)
npx github:a2mus/awesome-zcode-subagents --opencode --starter

# Install into current project for OpenCode (.opencode/agents/)
npx github:a2mus/awesome-zcode-subagents --opencode --project --starter
npx github:a2mus/awesome-zcode-subagents --opencode --project --all

# Install specific agent(s) for OpenCode
npx github:a2mus/awesome-zcode-subagents --opencode --agent code-reviewer,debugger

# List installed OpenCode subagents
npx github:a2mus/awesome-zcode-subagents --opencode --installed
```

#### ZCode Commands:
```bash
# Install recommended Starter Pack for ZCode (default: ~/.zcode/agents/)
npx github:a2mus/awesome-zcode-subagents --starter

# Install a specific category for ZCode
npx github:a2mus/awesome-zcode-subagents -c 01-core-development
npx github:a2mus/awesome-zcode-subagents -c 02-language-specialists

# Install all 158+ agents for ZCode
npx github:a2mus/awesome-zcode-subagents --all

# List installed agents in your ZCode directory
npx github:a2mus/awesome-zcode-subagents --installed
```

#### Both Assistants Simultaneously:
```bash
# Install starter pack into BOTH ZCode and OpenCode
npx github:a2mus/awesome-zcode-subagents --both --starter

# Install all 158+ agents into BOTH ZCode and OpenCode
npx github:a2mus/awesome-zcode-subagents --both --all
```

---

### Option 2: As a ZCode Plugin (In-App Marketplace)

ZCode can install these agents as plugins from its marketplace:

1. Open ZCode **Settings → Plugin Management → Discover**
2. Click **`+`** to add a marketplace and point it at this repository (`https://github.com/a2mus/awesome-zcode-subagents`)
3. Install the category plugins you want, e.g. `zcode-lang` (language specialists) or `zcode-infra` (infrastructure & DevOps)

See [Categories](#-categories) below for all available plugins.

---

### Option 3: Manual Installation (Windows, macOS, Linux)

#### For OpenCode:
```bash
# Global scope (all projects):
mkdir -p ~/.config/opencode/agents
cp categories/02-language-specialists/python-pro.md ~/.config/opencode/agents/

# Local scope (current project):
mkdir -p .opencode/agents
cp categories/02-language-specialists/python-pro.md .opencode/agents/
```

#### For ZCode:
- **Windows (PowerShell):**
  ```powershell
  New-Item -ItemType Directory -Force -Path "$HOME\.zcode\agents"
  Copy-Item -Path "categories\02-language-specialists\python-pro.md" -Destination "$HOME\.zcode\agents\"
  ```
- **macOS / Linux:**
  ```bash
  mkdir -p ~/.zcode/agents
  cp categories/02-language-specialists/python-pro.md ~/.zcode/agents/
  ```

---

### Option 4: Interactive Bash Script
```bash
git clone https://github.com/a2mus/awesome-zcode-subagents.git
cd awesome-zcode-subagents

# Interactive menu (choose ZCode or OpenCode)
./install-agents.sh

# Target OpenCode directly
./install-agents.sh --opencode
```

---

### Option 5: Standalone Curl Installer (no clone required)
```bash
curl -sO https://raw.githubusercontent.com/a2mus/awesome-zcode-subagents/main/install-agents.sh
chmod +x install-agents.sh
./install-agents.sh --opencode
```

---

### Option 6: Agent Installer (in-agent installation)
Install the `agent-installer` subagent directly into your assistant:
- For OpenCode: save to `~/.config/opencode/agents/agent-installer.md`
- For ZCode: save to `~/.zcode/agents/agent-installer.md`

Then ask: *"Use the agent-installer to find out which Python agents are available"* or *"Install code-reviewer"*.

## 📚 Categories

### [01. Core Development](categories/01-core-development/)
**Plugin:** `zcode-core-dev`

Essential development subagents for everyday coding tasks.

- [**api-designer**](categories/01-core-development/api-designer.md) - REST and GraphQL API architect
- [**backend-developer**](categories/01-core-development/backend-developer.md) - Server-side expert for scalable APIs
- [**design-bridge**](categories/01-core-development/design-bridge.md) - Design-to-agent translator
- [**electron-pro**](categories/01-core-development/electron-pro.md) - Desktop application expert
- [**frontend-developer**](categories/01-core-development/frontend-developer.md) - UI/UX specialist for React, Vue, and Angular
- [**fullstack-developer**](categories/01-core-development/fullstack-developer.md) - End-to-end feature development
- [**graphql-architect**](categories/01-core-development/graphql-architect.md) - GraphQL schema and federation expert
- [**microservices-architect**](categories/01-core-development/microservices-architect.md) - Distributed systems designer
- [**mobile-developer**](categories/01-core-development/mobile-developer.md) - Cross-platform mobile specialist
- [**ui-designer**](categories/01-core-development/ui-designer.md) - Visual design and interaction specialist
- [**websocket-engineer**](categories/01-core-development/websocket-engineer.md) - Real-time communication specialist


<br/>

### [02. Language Specialists](categories/02-language-specialists/)
**Plugin:** `zcode-lang`

Language-specific experts with deep framework knowledge.
- [**typescript-pro**](categories/02-language-specialists/typescript-pro.md) - TypeScript specialist
- [**sql-pro**](categories/02-language-specialists/sql-pro.md) - Database query expert
- [**swift-expert**](categories/02-language-specialists/swift-expert.md) - iOS and macOS specialist
- [**vue-expert**](categories/02-language-specialists/vue-expert.md) - Vue 3 Composition API expert
- [**angular-architect**](categories/02-language-specialists/angular-architect.md) - Angular 15+ enterprise patterns expert
- [**cpp-pro**](categories/02-language-specialists/cpp-pro.md) - C++ performance expert
- [**csharp-developer**](categories/02-language-specialists/csharp-developer.md) - .NET ecosystem specialist
- [**django-developer**](categories/02-language-specialists/django-developer.md) - Django 4+ web development expert
- [**dotnet-core-expert**](categories/02-language-specialists/dotnet-core-expert.md) - .NET 8 cross-platform specialist
- [**dotnet-framework-4.8-expert**](categories/02-language-specialists/dotnet-framework-4.8-expert.md) - .NET Framework legacy enterprise specialist
- [**elixir-expert**](categories/02-language-specialists/elixir-expert.md) - Elixir and OTP fault-tolerant systems expert
- [**expo-react-native-expert**](categories/02-language-specialists/expo-react-native-expert.md) - Expo and React Native mobile development expert
- [**fastapi-developer**](categories/02-language-specialists/fastapi-developer.md) - Modern async Python API framework expert
- [**flutter-expert**](categories/02-language-specialists/flutter-expert.md) - Flutter 3+ cross-platform mobile expert
- [**golang-pro**](categories/02-language-specialists/golang-pro.md) - Go concurrency specialist
- [**java-architect**](categories/02-language-specialists/java-architect.md) - Enterprise Java expert
- [**javascript-pro**](categories/02-language-specialists/javascript-pro.md) - JavaScript development expert
- [**powershell-5.1-expert**](categories/02-language-specialists/powershell-5.1-expert.md) - Windows PowerShell 5.1 and full .NET Framework automation specialist
- [**powershell-7-expert**](categories/02-language-specialists/powershell-7-expert.md) - Cross-platform PowerShell 7+ automation and modern .NET specialist
- [**kotlin-specialist**](categories/02-language-specialists/kotlin-specialist.md) - Modern JVM language expert
- [**laravel-specialist**](categories/02-language-specialists/laravel-specialist.md) - Laravel 10+ PHP framework expert
- [**nextjs-developer**](categories/02-language-specialists/nextjs-developer.md) - Next.js 14+ full-stack specialist
- [**node-specialist**](categories/02-language-specialists/node-specialist.md) - Node.js specialist
- [**php-pro**](categories/02-language-specialists/php-pro.md) - PHP web development expert
- [**python-pro**](categories/02-language-specialists/python-pro.md) - Python ecosystem master
- [**rails-expert**](categories/02-language-specialists/rails-expert.md) - Rails 8.1 rapid development expert
- [**react-specialist**](categories/02-language-specialists/react-specialist.md) - React 18+ modern patterns expert
- [**rust-engineer**](categories/02-language-specialists/rust-engineer.md) - Systems programming expert
- [**spring-boot-engineer**](categories/02-language-specialists/spring-boot-engineer.md) - Spring Boot 3+ microservices expert
- [**symfony-specialist**](categories/02-language-specialists/symfony-specialist.md) - Symfony 6+/7+/8+ PHP framework and Doctrine ORM expert


### [03. Infrastructure](categories/03-infrastructure/)
**Plugin:** `zcode-infra`

DevOps, cloud, and deployment specialists.

- [**azure-infra-engineer**](categories/03-infrastructure/azure-infra-engineer.md) - Azure infrastructure and Az PowerShell automation expert
- [**cloud-architect**](categories/03-infrastructure/cloud-architect.md) - AWS/GCP/Azure specialist
- [**database-administrator**](categories/03-infrastructure/database-administrator.md) - Database management expert
- [**docker-expert**](categories/03-infrastructure/docker-expert.md) - Docker containerization and optimization expert
- [**deployment-engineer**](categories/03-infrastructure/deployment-engineer.md) - Deployment automation specialist
- [**devops-engineer**](categories/03-infrastructure/devops-engineer.md) - CI/CD and automation expert
- [**devops-incident-responder**](categories/03-infrastructure/devops-incident-responder.md) - DevOps incident management
- [**incident-responder**](categories/03-infrastructure/incident-responder.md) - System incident response expert
- [**kubernetes-specialist**](categories/03-infrastructure/kubernetes-specialist.md) - Container orchestration master
- [**network-engineer**](categories/03-infrastructure/network-engineer.md) - Network infrastructure specialist
- [**platform-engineer**](categories/03-infrastructure/platform-engineer.md) - Platform architecture expert
- [**security-engineer**](categories/03-infrastructure/security-engineer.md) - Infrastructure security specialist
- [**sre-engineer**](categories/03-infrastructure/sre-engineer.md) - Site reliability engineering expert
- [**terraform-engineer**](categories/03-infrastructure/terraform-engineer.md) - Infrastructure as Code expert
- [**terragrunt-expert**](categories/03-infrastructure/terragrunt-expert.md) - Terragrunt orchestration and DRY IaC specialist
- [**windows-infra-admin**](categories/03-infrastructure/windows-infra-admin.md) - Active Directory, DNS, DHCP, and GPO automation specialist

### [04. Quality & Security](categories/04-quality-security/)
**Plugin:** `zcode-qa-sec`

Testing, security, and code quality experts.

- [**accessibility-tester**](categories/04-quality-security/accessibility-tester.md) - A11y compliance expert
- [**ad-security-reviewer**](categories/04-quality-security/ad-security-reviewer.md) - Active Directory security and GPO audit specialist
- [**ai-writing-auditor**](categories/04-quality-security/ai-writing-auditor.md) - AI writing pattern detector and rewriter
- [**architect-reviewer**](categories/04-quality-security/architect-reviewer.md) - Architecture review specialist
- [**chaos-engineer**](categories/04-quality-security/chaos-engineer.md) - System resilience testing expert
- [**code-reviewer**](categories/04-quality-security/code-reviewer.md) - Code quality guardian
- [**compliance-auditor**](categories/04-quality-security/compliance-auditor.md) - Regulatory compliance expert
- [**debugger**](categories/04-quality-security/debugger.md) - Advanced debugging specialist
- [**gdpr-ccpa-compliance**](categories/04-quality-security/gdpr-ccpa-compliance.md) - GDPR and CCPA privacy compliance specialist
- [**error-detective**](categories/04-quality-security/error-detective.md) - Error analysis and resolution expert
- [**penetration-tester**](categories/04-quality-security/penetration-tester.md) - Ethical hacking specialist
- [**performance-engineer**](categories/04-quality-security/performance-engineer.md) - Performance optimization expert
- [**powershell-security-hardening**](categories/04-quality-security/powershell-security-hardening.md) - PowerShell security hardening and compliance specialist
- [**qa-expert**](categories/04-quality-security/qa-expert.md) - Test automation specialist
- [**security-auditor**](categories/04-quality-security/security-auditor.md) - Security vulnerability expert
- [**test-automator**](categories/04-quality-security/test-automator.md) - Test automation framework expert
- [**ui-ux-tester**](categories/04-quality-security/ui-ux-tester.md) - Exhaustive documented-flow UI tester

### [05. Data & AI](categories/05-data-ai/)
**Plugin:** `zcode-data-ai`

Data engineering, ML, and AI specialists.

- [**ai-engineer**](categories/05-data-ai/ai-engineer.md) - AI system design and deployment expert
- [**data-analyst**](categories/05-data-ai/data-analyst.md) - Data insights and visualization specialist
- [**data-engineer**](categories/05-data-ai/data-engineer.md) - Data pipeline architect
- [**data-scientist**](categories/05-data-ai/data-scientist.md) - Analytics and insights expert
- [**database-optimizer**](categories/05-data-ai/database-optimizer.md) - Database performance specialist
- [**llm-architect**](categories/05-data-ai/llm-architect.md) - Large language model architect
- [**machine-learning-engineer**](categories/05-data-ai/machine-learning-engineer.md) - Machine learning systems expert
- [**ml-engineer**](categories/05-data-ai/ml-engineer.md) - Machine learning specialist
- [**mlops-engineer**](categories/05-data-ai/mlops-engineer.md) - MLOps and model deployment expert
- [**nlp-engineer**](categories/05-data-ai/nlp-engineer.md) - Natural language processing expert
- [**postgres-pro**](categories/05-data-ai/postgres-pro.md) - PostgreSQL database expert
- [**prompt-engineer**](categories/05-data-ai/prompt-engineer.md) - Prompt optimization specialist
- [**reinforcement-learning-engineer**](categories/05-data-ai/reinforcement-learning-engineer.md) - Reinforcement learning and agent training expert

### [06. Developer Experience](categories/06-developer-experience/)
**Plugin:** `zcode-dev-exp`

Tooling and developer productivity experts.

- [**build-engineer**](categories/06-developer-experience/build-engineer.md) - Build system specialist
- [**cli-developer**](categories/06-developer-experience/cli-developer.md) - Command-line tool creator
- [**dependency-manager**](categories/06-developer-experience/dependency-manager.md) - Package and dependency specialist
- [**docs-drift-editor**](categories/06-developer-experience/docs-drift-editor.md) - Documentation-drift editor for isolated-worktree fixes
- [**documentation-engineer**](categories/06-developer-experience/documentation-engineer.md) - Technical documentation expert
- [**dx-optimizer**](categories/06-developer-experience/dx-optimizer.md) - Developer experience optimization specialist
- [**git-workflow-manager**](categories/06-developer-experience/git-workflow-manager.md) - Git workflow and branching expert
- [**legacy-modernizer**](categories/06-developer-experience/legacy-modernizer.md) - Legacy code modernization specialist
- [**mcp-developer**](categories/06-developer-experience/mcp-developer.md) - Model Context Protocol specialist
- [**powershell-ui-architect**](categories/06-developer-experience/powershell-ui-architect.md) - PowerShell UI/UX specialist for WinForms, WPF, Metro frameworks, and TUIs
- [**powershell-module-architect**](categories/06-developer-experience/powershell-module-architect.md) - PowerShell module and profile architecture specialist
- [**readme-generator**](categories/06-developer-experience/readme-generator.md) - Repository README generation specialist
- [**refactoring-specialist**](categories/06-developer-experience/refactoring-specialist.md) - Code refactoring expert
- [**slack-expert**](categories/06-developer-experience/slack-expert.md) - Slack platform and @slack/bolt specialist
- [**tooling-engineer**](categories/06-developer-experience/tooling-engineer.md) - Developer tooling specialist
- [**visual-asset-generator**](categories/06-developer-experience/visual-asset-generator.md) - Visual asset generation specialist using prompt-to-asset MCP across 30+ image models

### [07. Specialized Domains](categories/07-specialized-domains/)
**Plugin:** `zcode-domains`

Domain-specific technology experts.

- [**api-documenter**](categories/07-specialized-domains/api-documenter.md) - API documentation specialist
- [**blockchain-developer**](categories/07-specialized-domains/blockchain-developer.md) - Web3 and crypto specialist
- [**email-deliverability-engineer**](categories/07-specialized-domains/email-deliverability-engineer.md) - Email deliverability specialist
- [**embedded-systems**](categories/07-specialized-domains/embedded-systems.md) - Embedded and real-time systems expert
- [**fintech-engineer**](categories/07-specialized-domains/fintech-engineer.md) - Financial technology specialist
- [**game-developer**](categories/07-specialized-domains/game-developer.md) - Game development expert
- [**healthcare-admin**](categories/07-specialized-domains/healthcare-admin.md) - Healthcare administration specialist with 51 sub-agents covering revenue cycle, compliance, quality, clinical ops, health IT, and payer relations
- [**hipaa-compliance**](categories/07-specialized-domains/hipaa-compliance.md) - HIPAA compliance specialist for healthcare SaaS vendors
- [**iot-engineer**](categories/07-specialized-domains/iot-engineer.md) - IoT systems developer
- [**m365-admin**](categories/07-specialized-domains/m365-admin.md) - Microsoft 365, Exchange Online, Teams, and SharePoint administration specialist
- [**mobile-app-developer**](categories/07-specialized-domains/mobile-app-developer.md) - Mobile application specialist
- [**payment-integration**](categories/07-specialized-domains/payment-integration.md) - Payment systems expert
- [**quant-analyst**](categories/07-specialized-domains/quant-analyst.md) - Quantitative analysis specialist
- [**risk-manager**](categories/07-specialized-domains/risk-manager.md) - Risk assessment and management expert
- [**seo-specialist**](categories/07-specialized-domains/seo-specialist.md) - Search engine optimization expert
- [**x-api-integration**](categories/07-specialized-domains/x-api-integration.md) - X/Twitter API integration specialist

### [08. Business & Product](categories/08-business-product/)
**Plugin:** `zcode-biz`

Product management and business analysis.

- [**assumption-mapping**](categories/08-business-product/assumption-mapping.md) - Product assumption risk and validation specialist
- [**backlog-grooming**](categories/08-business-product/backlog-grooming.md) - Agile backlog refinement specialist
- [**business-analyst**](categories/08-business-product/business-analyst.md) - Requirements specialist
- [**content-marketer**](categories/08-business-product/content-marketer.md) - Content marketing specialist
- [**customer-success-manager**](categories/08-business-product/customer-success-manager.md) - Customer success expert
- [**growth-loops**](categories/08-business-product/growth-loops.md) - Growth loop and PLG mechanics specialist
- [**landing-page-copywriter**](categories/08-business-product/landing-page-copywriter.md) - Conversion copywriting specialist
- [**legal-advisor**](categories/08-business-product/legal-advisor.md) - Legal and compliance specialist
- [**license-engineer**](categories/08-business-product/license-engineer.md) - Software licensing and compliance systems specialist
- [**product-manager**](categories/08-business-product/product-manager.md) - Product strategy expert
- [**project-manager**](categories/08-business-product/project-manager.md) - Project management specialist
- [**sales-engineer**](categories/08-business-product/sales-engineer.md) - Technical sales expert
- [**scrum-master**](categories/08-business-product/scrum-master.md) - Agile methodology expert
- [**technical-writer**](categories/08-business-product/technical-writer.md) - Technical documentation specialist
- [**ux-researcher**](categories/08-business-product/ux-researcher.md) - User research expert
- [**wordpress-master**](categories/08-business-product/wordpress-master.md) - WordPress development and optimization expert
- [**content-quality-editor**](categories/08-business-product/content-quality-editor.md) - AI content quality specialist using unslop to strip AI writing patterns before publishing

### [09. Meta & Orchestration](categories/09-meta-orchestration/)
**Plugin:** `zcode-meta`

Agent coordination and meta-programming.

- [**airis-mcp-gateway**](https://github.com/agiletec-inc/airis-mcp-gateway) - Docker-based MCP multiplexer that aggregates 60+ tools behind 7 meta-tools, reducing context token usage by 97%. One command to start, auto-enables servers on demand
- [**moai-adk**](https://github.com/modu-ai/moai-adk) - SPEC-first Agentic Development Kit orchestrating 24 specialized agents with enforced Plan→Run→Sync workflow, TRUST 5 quality gates, 52 domain-specific skills, and 16-language project support
- [**agent-installer**](categories/09-meta-orchestration/agent-installer.md) - Browse and install agents from this repository via GitHub
- [**agent-organizer**](categories/09-meta-orchestration/agent-organizer.md) - Multi-agent coordinator
- [**codebase-orchestrator**](categories/09-meta-orchestration/codebase-orchestrator.md) - Safe refactor governance orchestrator
- [**context-manager**](categories/09-meta-orchestration/context-manager.md) - Context optimization expert
- [**error-coordinator**](categories/09-meta-orchestration/error-coordinator.md) - Error handling and recovery specialist
- [**it-ops-orchestrator**](categories/09-meta-orchestration/it-ops-orchestrator.md) - IT operations workflow orchestration specialist
- [**knowledge-synthesizer**](categories/09-meta-orchestration/knowledge-synthesizer.md) - Knowledge aggregation expert
- [**multi-agent-coordinator**](categories/09-meta-orchestration/multi-agent-coordinator.md) - Advanced multi-agent orchestration
- [**performance-monitor**](categories/09-meta-orchestration/performance-monitor.md) - Agent performance optimization
- [**pied-piper**](https://github.com/sathish316/pied-piper/) - Orchestrate Team of AI Subagents for repetitive SDLC workflows
- [**task-distributor**](categories/09-meta-orchestration/task-distributor.md) - Task allocation specialist
- [**taskade**](https://github.com/taskade/mcp) - AI-powered workspace with autonomous agents, real-time collaboration, and workflow automation with MCP integration
- [**workflow-orchestrator**](categories/09-meta-orchestration/workflow-orchestrator.md) - Complex workflow automation

### [10. Research & Analysis](categories/10-research-analysis/)
**Plugin:** `zcode-research`

Research, search, and analysis specialists.

- [**ab-test-analysis**](categories/10-research-analysis/ab-test-analysis.md) - A/B test analysis and ship/no-ship decision specialist
- [**cohort-analysis**](categories/10-research-analysis/cohort-analysis.md) - User cohort retention and behavioral analysis specialist
- [**first-principles-thinking**](categories/10-research-analysis/first-principles-thinking.md) - First principles problem-solving specialist
- [**research-analyst**](categories/10-research-analysis/research-analyst.md) - Comprehensive research specialist
- [**search-specialist**](categories/10-research-analysis/search-specialist.md) - Advanced information retrieval expert
- [**trend-analyst**](categories/10-research-analysis/trend-analyst.md) - Emerging trends and forecasting expert
- [**competitive-analyst**](categories/10-research-analysis/competitive-analyst.md) - Competitive intelligence specialist
- [**market-researcher**](categories/10-research-analysis/market-researcher.md) - Market analysis and consumer insights
- [**project-idea-validator**](categories/10-research-analysis/project-idea-validator.md) - Brutal go/no-go product idea validator
- [**data-researcher**](categories/10-research-analysis/data-researcher.md) - Data discovery and analysis expert
- [**scientific-literature-researcher**](categories/10-research-analysis/scientific-literature-researcher.md) - Scientific paper search and evidence synthesis via [BGPT MCP](https://github.com/connerlambden/bgpt-mcp)

## 🤖 Understanding Subagents

Subagents are specialized AI assistants that enhance ZCode's capabilities by providing task-specific expertise. They act as dedicated helpers that ZCode can call upon when encountering particular types of work.

### What Makes Subagents Special?

**Independent Context Windows**  
Every subagent operates within its own isolated context space, preventing cross-contamination between different tasks and maintaining clarity in the primary conversation thread.

**Domain-Specific Intelligence**  
Subagents come equipped with carefully crafted instructions tailored to their area of expertise, resulting in superior performance on specialized tasks.

**Shared Across Projects**  
After creating a subagent, you can utilize it throughout various projects and distribute it among team members to ensure consistent development practices.

**Granular Tool Permissions**  
You can configure each subagent with specific tool access rights, enabling fine-grained control over which capabilities are available for different task types.

### Core Advantages

- **Memory Efficiency**: Isolated contexts prevent the main conversation from becoming cluttered with task-specific details
- **Enhanced Accuracy**: Specialized prompts and configurations lead to better results in specific domains
- **Workflow Consistency**: Team-wide subagent sharing ensures uniform approaches to common tasks
- **Security Control**: Tool access can be restricted based on subagent type and purpose

### Getting Started with Subagents

#### In ZCode:
1. Drop agent `.md` files into `~/.zcode/agents/` (or use `npx github:a2mus/awesome-zcode-subagents --starter`).
2. Restart your ZCode session.
3. Subagents trigger automatically based on task descriptions, or invoke directly with `@<agent-name>`:
   ```
   > Have @code-reviewer analyze my latest commits
   ```

#### In OpenCode:
1. Install agents to `~/.config/opencode/agents/` (global) or `.opencode/agents/` (current project) using:
   ```bash
   npx github:a2mus/awesome-zcode-subagents --opencode --starter
   ```
2. Start OpenCode in your project terminal: `opencode`.
3. OpenCode automatically discovers custom subagents with `mode: subagent`.
4. Invoke any subagent using `@` mention:
   ```
   > @python-pro refactor the data pipeline to use async iterators
   ```
5. Primary agents (`build`, `plan`) can also autonomously delegate subtasks to these agents!

### Subagent Storage Locations

| Assistant | Scope | Path | Availability |
|-----------|-------|------|--------------|
| **OpenCode** | User (global) | `~/.config/opencode/agents/` | Available across all projects |
| **OpenCode** | Project (local)| `.opencode/agents/` | Current repository only |
| **ZCode** | User (global) | `~/.zcode/agents/` | Available across all projects |
| **ZCode** | Project (local)| `.zcode/agents/` | Current repository only |

## 📖 Subagent Structure

Each subagent follows a dual-compatible template:

```yaml
---
name: subagent-name
description: When this agent should be invoked
mode: subagent
tools: Read, Write, Edit, Bash, Glob, Grep
---

You are a [role description and expertise areas]...

[Agent-specific checklists, patterns, and guidelines]...

## Communication Protocol
Inter-agent communication specifications...

## Development Workflow
Structured implementation phases...
```

### Model Selection

By default, subagents omit the `model` field and inherit whatever model your primary ZCode agent is currently using. You can pin a specific model id or tune reasoning per agent by editing its frontmatter:

| Frontmatter field | Effect | Good for |
|-------------------|--------|----------|
| *(omitted)* / `model: inherit` | Follows the primary agent's current model | Most agents — one model switch updates everything |
| `model: <model-id>` | Pins the subagent to a specific model | Cost-sensitive or heavyweight agents |
| `thoughtLevel: high` | Deeper reasoning (only with a pinned model) | Architecture reviews, security audits |

### Tool Assignment Philosophy

Each subagent's `tools` field specifies ZCode built-in tools, optimized for their role:
- **Read-only agents** (reviewers, auditors): `Read, Grep, Glob` - analyze without modifying
- **Research agents** (analysts, researchers): `Read, Grep, Glob, WebFetch, WebSearch` - gather information
- **Code writers** (developers, engineers): `Read, Write, Edit, Bash, Glob, Grep` - create and execute
- **Documentation agents** (writers, documenters): `Read, Write, Edit, Glob, Grep, WebFetch, WebSearch` - document with research

Each agent has minimal necessary permissions. You can extend agents by adding MCP servers or external tools to the `tools` field.

## 🧰 Tools

### [subagent-catalog](tools/subagent-catalog/)
ZCode skill for browsing and fetching subagents from this catalog.

| Command | Description |
|---------|-------------|
| `/subagent-catalog:search <query>` | Find agents by name, description, or category |
| `/subagent-catalog:fetch <name>` | Get full agent definition |
| `/subagent-catalog:list` | Browse all categories |
| `/subagent-catalog:invalidate` | Refresh cache |

**Installation:**
```bash
cp -r tools/subagent-catalog ~/.zcode/commands/
```



## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Submit new subagents via PR
- Improve existing definitions
- Report issues and bugs

## Contributor ♥️ Thanks

Thanks to everyone who has contributed subagents — originally the [VoltAgent community](https://github.com/VoltAgent/awesome-claude-code-subagents), and now ZCode users improving the definitions further.


## 📄 License

MIT License - see [LICENSE](LICENSE)

This repository is a curated collection of subagent definitions contributed by both the maintainers and the community. All subagents are provided "as is" without warranty. We do not audit or guarantee the security or correctness of any subagent. Review before use, the maintainers accept no liability for any issues arising from their use.

If you find an issue with a listed subagent or want your contribution removed, please [open an issue](https://github.com/a2mus/awesome-zcode-subagents/issues) and we'll address it promptly.


