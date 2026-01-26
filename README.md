<a href="https://github.com/VoltAgent/voltagent">
<img width="1500" height="500" alt="Group 32" src="https://github.com/user-attachments/assets/55b97c47-8506-4be0-b18f-f5384d063cbb" />
</a>

<br />
<br/>

<div align="center">
    <strong>The awesome collection of Claude Code subagents.</strong>
    <br />
    <br />
</div>

<div align="center">
    
[![Awesome](https://awesome.re/badge.svg)](https://awesome.re)
<a href="https://github.com/VoltAgent/voltagent">
  <img alt="VoltAgent" src="https://cdn.voltagent.dev/website/logo/logo-2-svg.svg" height="20" />
</a> 

![Subagent Count](https://img.shields.io/badge/subagents-126+-blue?style=flat-square)
[![Last Update](https://img.shields.io/github/last-commit/VoltAgent/awesome-claude-code-subagents?label=Last%20update&style=flat-square)](https://github.com/VoltAgent/awesome-claude-code-subagents)
[![Discord](https://img.shields.io/discord/1361559153780195478.svg?label=&logo=discord&logoColor=ffffff&color=7389D8&labelColor=6A7EC2)](https://s.voltagent.dev/discord)
[![GitHub forks](https://img.shields.io/github/forks/VoltAgent/awesome-claude-code-subagents?style=social)](https://github.com/VoltAgent/awesome-claude-code-subagents/network/members)
    
</div>


# Awesome Claude Code Subagents 

## What is this?

This repository serves as the definitive collection of Claude Code subagents - specialized AI assitants designed for specific development tasks. 

## Installation

### As Claude Code Plugin (Recommended)

```bash
claude plugin marketplace add VoltAgent/awesome-claude-code-subagents
claude plugin install <plugin-name>
```

Examples:
```bash
claude plugin install voltagent-lang    # Language specialists
claude plugin install voltagent-infra   # Infrastructure & DevOps
```

See [Categories](#-categories) below for all available plugins.

> **Note**: The `voltagent-meta` orchestration agents work best when other categories installed.

### Option 1: Manual Installation

1. Clone this repository
2. Copy desired agent files to:
   - `~/.claude/agents/` for global access
   - `.claude/agents/` for project-specific use
3. Customize based on your project requirements

### Option 2: Interactive Installer
```bash
git clone https://github.com/VoltAgent/awesome-claude-code-subagents.git
cd awesome-claude-code-subagents
./install-agents.sh
```
This interactive script lets you browse categories, select agents, and install/uninstall them with a single command.

### Option 3: Standalone Installer (no clone required)
```bash
curl -sO https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/install-agents.sh
chmod +x install-agents.sh
./install-agents.sh
```
Downloads agents directly from GitHub without cloning the repository. Requires `curl`.

### Option 4: Agent Installer (use Claude Code to install agents)
```bash
curl -s https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/categories/09-meta-orchestration/agent-installer.md -o ~/.claude/agents/agent-installer.md
```
Then in Claude Code: "Use the agent-installer to show me available categories" or "Find PHP agents and install php-pro globally".

<br />

<a href="https://github.com/VoltAgent/voltagent">
<img width="1390" height="296" alt="social" src="https://github.com/user-attachments/assets/4c40affa-8e20-443a-9ec5-1abb6679b170" />
</a>


## 📚 Categories

### [01. Core Development](categories/01-core-development/)
**Plugin:** `voltagent-core-dev`

Essential development subagents for everyday coding tasks.

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
- [**wordpress-master**](categories/08-business-product/wordpress-master.md) - WordPress development and optimization expert

### [02. Language Specialists](categories/02-language-specialists/)
**Plugin:** `voltagent-lang`

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
- [**flutter-expert**](categories/02-language-specialists/flutter-expert.md) - Flutter 3+ cross-platform mobile expert
- [**golang-pro**](categories/02-language-specialists/golang-pro.md) - Go concurrency specialist
- [**java-architect**](categories/02-language-specialists/java-architect.md) - Enterprise Java expert
- [**javascript-pro**](categories/02-language-specialists/javascript-pro.md) - JavaScript development expert
- [**powershell-5.1-expert**](categories/02-language-specialists/powershell-5.1-expert.md) - Windows PowerShell 5.1 and full .NET Framework automation specialist
- [**powershell-7-expert**](categories/02-language-specialists/powershell-7-expert.md) - Cross-platform PowerShell 7+ automation and modern .NET specialist
- [**kotlin-specialist**](categories/02-language-specialists/kotlin-specialist.md) - Modern JVM language expert
- [**laravel-specialist**](categories/02-language-specialists/laravel-specialist.md) - Laravel 10+ PHP framework expert
- [**nextjs-developer**](categories/02-language-specialists/nextjs-developer.md) - Next.js 14+ full-stack specialist
- [**php-pro**](categories/02-language-specialists/php-pro.md) - PHP web development expert
- [**python-pro**](categories/02-language-specialists/python-pro.md) - Python ecosystem master
- [**rails-expert**](categories/02-language-specialists/rails-expert.md) - Rails 8.1 rapid development expert
- [**react-specialist**](categories/02-language-specialists/react-specialist.md) - React 18+ modern patterns expert
- [**rust-engineer**](categories/02-language-specialists/rust-engineer.md) - Systems programming expert
- [**spring-boot-engineer**](categories/02-language-specialists/spring-boot-engineer.md) - Spring Boot 3+ microservices expert


### [03. Infrastructure](categories/03-infrastructure/)
**Plugin:** `voltagent-infra`

DevOps, cloud, and deployment specialists.

- [**azure-infra-engineer**](categories/03-infrastructure/azure-infra-engineer.md) - Azure infrastructure and Az PowerShell automation expert
- [**cloud-architect**](categories/03-infrastructure/cloud-architect.md) - AWS/GCP/Azure specialist
- [**database-administrator**](categories/03-infrastructure/database-administrator.md) - Database management expert
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
- [**windows-infra-admin**](categories/03-infrastructure/windows-infra-admin.md) - Active Directory, DNS, DHCP, and GPO automation specialist

### [04. Quality & Security](categories/04-quality-security/)
**Plugin:** `voltagent-qa-sec`

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
- [**performance-engineer**](categories/04-quality-security/performance-engineer.md) - Performance optimization expert
- [**powershell-security-hardening**](categories/04-quality-security/powershell-security-hardening.md) - PowerShell security hardening and compliance specialist
- [**qa-expert**](categories/04-quality-security/qa-expert.md) - Test automation specialist
- [**security-auditor**](categories/04-quality-security/security-auditor.md) - Security vulnerability expert
- [**test-automator**](categories/04-quality-security/test-automator.md) - Test automation framework expert

### [05. Data & AI](categories/05-data-ai/)
**Plugin:** `voltagent-data-ai`

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

### [06. Developer Experience](categories/06-developer-experience/)
**Plugin:** `voltagent-dev-exp`

Tooling and developer productivity experts.

- [**build-engineer**](categories/06-developer-experience/build-engineer.md) - Build system specialist
- [**cli-developer**](categories/06-developer-experience/cli-developer.md) - Command-line tool creator
- [**dependency-manager**](categories/06-developer-experience/dependency-manager.md) - Package and dependency specialist
- [**documentation-engineer**](categories/06-developer-experience/documentation-engineer.md) - Technical documentation expert
- [**dx-optimizer**](categories/06-developer-experience/dx-optimizer.md) - Developer experience optimization specialist
- [**git-workflow-manager**](categories/06-developer-experience/git-workflow-manager.md) - Git workflow and branching expert
- [**legacy-modernizer**](categories/06-developer-experience/legacy-modernizer.md) - Legacy code modernization specialist
- [**mcp-developer**](categories/06-developer-experience/mcp-developer.md) - Model Context Protocol specialist
- [**powershell-ui-architect**](categories/06-developer-experience/powershell-ui-architect.md) - PowerShell UI/UX specialist for WinForms, WPF, Metro frameworks, and TUIs
- [**powershell-module-architect**](categories/06-developer-experience/powershell-module-architect.md) - PowerShell module and profile architecture specialist
- [**refactoring-specialist**](categories/06-developer-experience/refactoring-specialist.md) - Code refactoring expert
- [**slack-expert**](categories/06-developer-experience/slack-expert.md) - Slack platform and @slack/bolt specialist
- [**tooling-engineer**](categories/06-developer-experience/tooling-engineer.md) - Developer tooling specialist

### [07. Specialized Domains](categories/07-specialized-domains/)
**Plugin:** `voltagent-domains`

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
- [**seo-specialist**](categories/07-specialized-domains/seo-specialist.md) - Search engine optimization expert

### [08. Business & Product](categories/08-business-product/)
**Plugin:** `voltagent-biz`

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

### [09. Meta & Orchestration](categories/09-meta-orchestration/)
**Plugin:** `voltagent-meta`

Agent coordination and meta-programming.

- [**agent-installer**](categories/09-meta-orchestration/agent-installer.md) - Browse and install agents from this repository via GitHub
- [**agent-organizer**](categories/09-meta-orchestration/agent-organizer.md) - Multi-agent coordinator
- [**context-manager**](categories/09-meta-orchestration/context-manager.md) - Context optimization expert
- [**error-coordinator**](categories/09-meta-orchestration/error-coordinator.md) - Error handling and recovery specialist
- [**it-ops-orchestrator**](categories/09-meta-orchestration/it-ops-orchestrator.md) - IT operations workflow orchestration specialist
- [**knowledge-synthesizer**](categories/09-meta-orchestration/knowledge-synthesizer.md) - Knowledge aggregation expert
- [**multi-agent-coordinator**](categories/09-meta-orchestration/multi-agent-coordinator.md) - Advanced multi-agent orchestration
- [**performance-monitor**](categories/09-meta-orchestration/performance-monitor.md) - Agent performance optimization
- [**pied-piper**](https://github.com/sathish316/pied-piper/) - Orchestrate Team of AI Subagents for repetitive SDLC workflows
- [**task-distributor**](categories/09-meta-orchestration/task-distributor.md) - Task allocation specialist
- [**workflow-orchestrator**](categories/09-meta-orchestration/workflow-orchestrator.md) - Complex workflow automation

### [10. Research & Analysis](categories/10-research-analysis/)
**Plugin:** `voltagent-research`

Research, search, and analysis specialists.

- [**research-analyst**](categories/10-research-analysis/research-analyst.md) - Comprehensive research specialist
- [**search-specialist**](categories/10-research-analysis/search-specialist.md) - Advanced information retrieval expert
- [**trend-analyst**](categories/10-research-analysis/trend-analyst.md) - Emerging trends and forecasting expert
- [**competitive-analyst**](categories/10-research-analysis/competitive-analyst.md) - Competitive intelligence specialist
- [**market-researcher**](categories/10-research-analysis/market-researcher.md) - Market analysis and consumer insights
- [**data-researcher**](categories/10-research-analysis/data-researcher.md) - Data discovery and analysis expert

## 🤖 Understanding Subagents

Subagents are specialized AI assistants that enhance Claude Code's capabilities by providing task-specific expertise. They act as dedicated helpers that Claude Code can call upon when encountering particular types of work.

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

**1. Access the Subagent Manager**
```bash
/agents
```

**2. Create Your Subagent**
- Choose between project-specific or global subagents
- Let Claude generate an initial version, then refine it to your needs
- Provide detailed descriptions of the subagent's purpose and activation triggers
- Configure tool access (leave empty to inherit all available tools)
- Customize the system prompt using the built-in editor (press `e`)

**3. Deploy and Utilize**
Your subagent becomes immediately available. Claude Code will automatically engage it when suitable, or you can explicitly request its help:
```
> Have the code-reviewer subagent analyze my latest commits
```

### Subagent Storage Locations

| Type | Path | Availability | Precedence |
|------|------|--------------|------------|
| Project Subagents | `.claude/agents/` | Current project only | Higher |
| Global Subagents | `~/.claude/agents/` | All projects | Lower |

Note: When naming conflicts occur, project-specific subagents override global ones.



## 🛠️ How to Use Subagents

### Setting Up in Claude Code
1. Place subagent files in `.claude/agents/` within your project
2. Claude Code automatically detects and loads the subagents
3. Invoke them naturally in conversation or let Claude decide when to use them

### Creating New Subagents - Step by Step

**Step 1: Launch the Agent Interface**
```bash
/agents
```

**Step 2: Choose "Create New Agent"**
- Decide on project-level (current project) or user-level (all projects) scope

**Step 3: Configure Your Agent**
- **Recommended approach**: Let Claude draft an initial version, then customize
- Write a comprehensive description of the agent's role and activation scenarios  
- Grant specific tool permissions (or leave blank for full access)
- Browse available tools through the interface for easy selection
- Edit the system prompt directly by pressing `e` for advanced customization

**Step 4: Save and Start Using**
- Your agent is instantly ready for use
- Claude automatically delegates appropriate tasks to it
- Or manually invoke it:
```
> Ask the code-reviewer agent to examine my pull request
```

## 📖 Subagent Structure

Each subagent follows a standardized template:

```yaml
---
name: subagent-name
description: When this agent should be invoked
tools: Read, Write, Edit, Bash, Glob, Grep
---

You are a [role description and expertise areas]...

[Agent-specific checklists, patterns, and guidelines]...

## Communication Protocol
Inter-agent communication specifications...

## Development Workflow
Structured implementation phases...
```

### Tool Assignment Philosophy

Each subagent's `tools` field specifies Claude Code built-in tools, optimized for their role:
- **Read-only agents** (reviewers, auditors): `Read, Grep, Glob` - analyze without modifying
- **Research agents** (analysts, researchers): `Read, Grep, Glob, WebFetch, WebSearch` - gather information
- **Code writers** (developers, engineers): `Read, Write, Edit, Bash, Glob, Grep` - create and execute
- **Documentation agents** (writers, documenters): `Read, Write, Edit, Glob, Grep, WebFetch, WebSearch` - document with research

Each agent has minimal necessary permissions. You can extend agents by adding MCP servers or external tools to the `tools` field.

## 🧰 Tools

### [subagent-catalog](tools/subagent-catalog/)
Claude Code skill for browsing and fetching subagents from this catalog.

| Command | Description |
|---------|-------------|
| `/subagent-catalog:search <query>` | Find agents by name, description, or category |
| `/subagent-catalog:fetch <name>` | Get full agent definition |
| `/subagent-catalog:list` | Browse all categories |
| `/subagent-catalog:invalidate` | Refresh cache |

**Installation:**
```bash
cp -r tools/subagent-catalog ~/.claude/commands/
```

## 🔧 MCP Tools & Resources

If you're using MCP servers with these agents, feel free to add them here.

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Submit new subagents via PR
- Improve existing definitions
- Add new MCP tool integrations
- Share usage examples
- Report issues and bugs

## 👥 Maintainers

This repository is maintained by the [VoltAgent](https://github.com/voltagent/voltagent) team and community:

## 📄 License

MIT License - see [LICENSE](LICENSE)

* This repository provides example subagents and guidelines only.
They are not security-audited and should be reviewed before production use.

## 🔗 Related Resources

- [VoltAgent Framework](https://github.com/voltagent/voltagent)
- [Claude Code Documentation](https://docs.anthropic.com/claude-code)
- [Community Discord](https://s.voltagent.dev/discord)

---

<p align="center">
  Made with ❤️ by the VoltAgent Community
</p>
