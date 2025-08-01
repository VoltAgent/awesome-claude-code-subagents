<img width="1500" height="500" alt="Group 32" src="https://github.com/user-attachments/assets/286b21c6-7dd5-453a-9360-677151939f4a" />

# Awesome Claude Code Subagents 🤖

The most comprehensive reference repository for production-ready Claude Code subagents. This collection features battle-tested subagent definitions following best practices and industry standards, continuously updated and maintained by the [VoltAgent](https://github.com/voltagent) open-source AI agent framework maintainers.

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

## ⭐ Featured Subagents

1. [Backend Developer](categories/01-core-development/backend-developer.md) - Scalable API development
2. [Frontend Developer](categories/01-core-development/frontend-developer.md) - Modern UI engineering
3. [Fullstack Developer](categories/01-core-development/fullstack-developer.md) - End-to-end features
4. [GraphQL Architect](categories/01-core-development/graphql-architect.md) - GraphQL federation expert
5. [Microservices Architect](categories/01-core-development/microservices-architect.md) - Distributed systems

## 🛠️ How to Use Subagents

### With Claude Code
1. Create a `.claude/subagents/` directory in your project
2. Copy the subagent definition file
3. Claude Code will automatically recognize and use the subagent

### With VoltAgent Framework
```bash
# Install VoltAgent CLI
npm install -g @voltagent/cli

# Add a subagent
voltagent add backend-developer

# Use in your workflow
voltagent run backend-developer "Create a REST API"
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

This repository is maintained by the [VoltAgent](https://github.com/voltagent) team:

- Core maintainers of the VoltAgent open-source AI agent framework
- Active contributors to the Claude Code ecosystem
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
