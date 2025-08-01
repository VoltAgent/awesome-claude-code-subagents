<img width="1500" height="500" alt="Group 32" src="https://github.com/user-attachments/assets/286b21c6-7dd5-453a-9360-677151939f4a" />

# Awesome Claude Code Subagents 🤖

The most comprehensive reference repository for production-ready Claude Code subagents. This collection features battle-tested subagent definitions following best practices and industry standards, continuously updated and maintained by the [VoltAgent](https://github.com/voltagent/voltagent) open-source AI agent framework maintainers.

## 🎯 What is this?

This repository serves as the definitive collection of Claude Code subagents - specialized AI agents designed for specific development tasks. Each subagent is:

- **Production-ready**: Tested in real-world scenarios
- **Best practices compliant**: Following industry standards and patterns
- **MCP Tool integrated**: Leveraging Model Context Protocol tools
- **Continuously maintained**: Regular updates with new capabilities
- **Community-driven**: Open to contributions and improvements

## 🚀 Quick Start

1. Browse categories to find the subagent you need
2. Copy the subagent definition
3. Use with Claude Code or integrate into your workflow
4. Customize based on your project requirements

## 📚 Categories

### [01. Core Development](categories/01-core-development/)
Essential development subagents for everyday coding tasks.

- [**frontend-developer**](categories/01-core-development/frontend-developer.md) - UI/UX specialist for React, Vue, and Angular
- [**backend-developer**](categories/01-core-development/backend-developer.md) - Server-side expert for scalable APIs
- [**fullstack-developer**](categories/01-core-development/fullstack-developer.md) - End-to-end feature development
- [**mobile-developer**](categories/01-core-development/mobile-developer.md) - Cross-platform mobile specialist
- [**electron-pro**](categories/01-core-development/electron-pro.md) - Desktop application expert
- [**api-designer**](categories/01-core-development/api-designer.md) - REST and GraphQL API architect
- [**graphql-architect**](categories/01-core-development/graphql-architect.md) - GraphQL schema and federation expert
- [**microservices-architect**](categories/01-core-development/microservices-architect.md) - Distributed systems designer
- [**websocket-engineer**](categories/01-core-development/websocket-engineer.md) - Real-time communication specialist

### [02. Language Specialists](categories/02-language-specialists/)
Language-specific experts with deep framework knowledge.

- **python-expert** - Python ecosystem master
- **javascript-ninja** - JavaScript/TypeScript guru
- **rust-specialist** - Systems programming expert
- **go-engineer** - Go concurrency specialist
- **java-architect** - Enterprise Java expert

### [03. Infrastructure](categories/03-infrastructure/)
DevOps, cloud, and deployment specialists.

- **devops-engineer** - CI/CD and automation expert
- **cloud-architect** - AWS/GCP/Azure specialist
- **kubernetes-expert** - Container orchestration master
- **terraform-specialist** - Infrastructure as Code expert
- **monitoring-engineer** - Observability specialist

### [04. Quality & Security](categories/04-quality-security/)
Testing, security, and code quality experts.

- **qa-expert** - Test automation specialist
- **security-auditor** - Security vulnerability expert
- **code-reviewer** - Code quality guardian
- **performance-engineer** - Performance optimization expert
- **accessibility-specialist** - A11y compliance expert

### [05. Data & AI](categories/05-data-ai/)
Data engineering, ML, and AI specialists.

- **data-engineer** - Data pipeline architect
- **ml-engineer** - Machine learning specialist
- **ai-researcher** - AI/LLM integration expert
- **data-scientist** - Analytics and insights expert
- **database-optimizer** - Database performance specialist

### [06. Developer Experience](categories/06-developer-experience/)
Tooling and developer productivity experts.

- **refactoring-expert** - Code modernization specialist
- **documentation-writer** - Technical documentation expert
- **cli-developer** - Command-line tool creator
- **dx-engineer** - Developer experience optimizer
- **build-tool-expert** - Build system specialist

### [07. Specialized Domains](categories/07-specialized-domains/)
Domain-specific technology experts.

- **payment-integration** - Payment systems expert
- **blockchain-developer** - Web3 and crypto specialist
- **iot-engineer** - IoT systems developer
- **game-developer** - Game development expert
- **ar-vr-developer** - AR/VR specialist

### [08. Business & Product](categories/08-business-product/)
Product management and business analysis.

- **product-manager** - Product strategy expert
- **business-analyst** - Requirements specialist
- **ux-researcher** - User research expert
- **growth-engineer** - Growth optimization specialist
- **analytics-engineer** - Business metrics expert

### [09. Meta & Orchestration](categories/09-meta-orchestration/)
Agent coordination and meta-programming.

- **agent-organizer** - Multi-agent coordinator
- **context-manager** - Context optimization expert
- **task-planner** - Complex task orchestrator
- **workflow-designer** - Process automation expert
- **agent-developer** - Subagent creation specialist

### [10. Research & Analysis](categories/10-research-analysis/)
Research, search, and analysis specialists.

- **code-searcher** - Codebase exploration expert
- **bug-hunter** - Bug detection specialist
- **dependency-analyzer** - Dependency management expert
- **tech-researcher** - Technology research specialist
- **legacy-modernizer** - Legacy code expert

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

## ⭐ Featured Subagents

1. [Backend Developer](categories/01-core-development/backend-developer.md) - Scalable API development
2. [Frontend Developer](categories/01-core-development/frontend-developer.md) - Modern UI engineering
3. [Fullstack Developer](categories/01-core-development/fullstack-developer.md) - End-to-end features
4. [GraphQL Architect](categories/01-core-development/graphql-architect.md) - GraphQL federation expert
5. [Microservices Architect](categories/01-core-development/microservices-architect.md) - Distributed systems

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
description: Brief description of capabilities
tools: List of MCP tools used
---

Role definition and expertise...

## MCP Tool Integration
Tool descriptions and usage patterns...

## Communication Protocol
Inter-agent communication specifications...

## Implementation Workflow
Structured development phases...
```

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Submit new subagents via PR
- Improve existing definitions
- Add new MCP tool integrations
- Share usage examples
- Report issues and bugs

## 👥 Maintainers

This repository is maintained by the [VoltAgent](https://github.com/voltagent/voltagent) team:

- Core maintainers of the VoltAgent open-source AI agent framework and community member
- Committed to best practices and production readiness

## 📄 License

MIT License - see [LICENSE](LICENSE)

## 🔗 Related Resources

- [VoltAgent Framework](https://github.com/voltagent/voltagent)
- [Claude Code Documentation](https://docs.anthropic.com/claude-code)
- [MCP Tool Registry](https://github.com/modelcontextprotocol/tools)
- [Community Discord](https://discord.gg/voltagent)

---

<p align="center">
  Made with ❤️ by the VoltAgent Community
</p>
