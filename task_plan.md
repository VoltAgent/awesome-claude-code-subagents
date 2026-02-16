# Task Plan: Repository Restructure (agents-restructure.md)

## Goal
Reorganise the repository from 11 categories (00-10) to 25 categories (00-24) with risk-tiered structure, moving/renaming ~117 existing agents, creating ~70 new agents, and updating all READMEs, plugin.json files, marketplace.json, and the root README.

## Reference Files
- **Source of truth**: `agents-restructure.md` (the new taxonomy)
- **Migration map**: `notes.md` (detailed old→new mapping)

## Phases

### Phase 1: Create new directory structure ✅
- [x] 1.1 Create all 25 new category directories (00–24) under `categories/`
- [x] 1.2 Create `.claude-plugin/` subdirectory in each new category
- [x] 1.3 Verify all directories exist

### Phase 2: Move and rename existing agents ✅ (partial — 2.23 pending)
- [x] 2.1 Move 09-meta-orchestration agents → 00-meta-and-orchestration (same names)
- [x] 2.2 Move 10-research-analysis agents → 01-research-and-discovery (same names)
- [x] 2.3 Move agents to 02-architecture-and-design (api-designer, graphql-architect, architect-reviewer, microservices-architect)
- [x] 2.4 Move agents to 03-analysis-and-review (code-reviewer, security-auditor, performance-engineer, accessibility-tester, compliance-auditor, qa-expert)
- [x] 2.5 Move agents to 04-documentation (documentation-engineer, api-documenter, technical-writer)
- [x] 2.6 Move agents to 05-planning-and-estimation (project-manager, scrum-master, product-manager)
- [x] 2.7 Move agents to 06-business-and-product (business-analyst, ux-researcher, content-marketer, customer-success-manager, legal-advisor, sales-engineer, quant-analyst, risk-manager, seo-specialist)
- [x] 2.8 Move + rename language specialists to 07-language-and-framework-specialists (29 agents with renames)
- [x] 2.9 Move agents to 08-general-development (fullstack, frontend, backend, mobile, websocket, ui-designer, electron→electron-pro, cli, mcp, game-developer)
- [x] 2.10 Move agents to 09-testing-and-qa (test-automator, chaos-engineer)
- [x] 2.11 Move agents to 10-refactoring-and-modernization (refactoring-specialist, legacy-modernizer)
- [x] 2.12 Move agents to 11-bug-fixing-and-debugging (debugger, error-diagnostics→error-detective)
- [x] 2.13 Move agents to 13-developer-experience-and-tooling (dx-optimizer, tooling-engineer, git-workflow-manager, slack→slack-expert, build-engineer, prompt-engineer)
- [x] 2.14 Move agents to 14-data-and-database (data-engineer, database-performance→database-optimizer, postgresql→postgres-pro)
- [x] 2.15 Move agents to 15-data-science-and-ai (ai-engineer, data-analyst, data-scientist, llm-architect, ml-engineer, mlops-engineer, nlp-engineer)
- [x] 2.16 Move agents to 16-dependency-and-package-management (dependency-manager)
- [x] 2.17 Move agents to 19-infrastructure-as-code (terraform, kubernetes→kubernetes-specialist, cloud-architect, azure, network, platform, windows-infra, devops)
- [x] 2.18 Move agents to 20-security-and-secrets (security-engineer, penetration-tester, ad-security-reviewer, powershell-security→powershell-security-hardening)
- [x] 2.19 Move agents to 21-specialized-domains (blockchain, embedded→embedded-systems, fintech, iot, m365, payment→payment-integration)
- [x] 2.20 Move agents to 22-deployment-and-release (deployment-engineer)
- [x] 2.21 Move agents to 23-production-ops-and-observability (sre-engineer, incident-responder, database-admin→database-administrator)
- [x] 2.22 Update YAML frontmatter `name:` field in all renamed agents
- [x] 2.23 Delete old empty category directories (00-10) — also removed unreal-specialist.md

### Phase 3: Create new agent definitions
For each new agent, create a .md file following the existing pattern (YAML frontmatter with name, description with examples, tools, model; then body with role description, checklists, workflow).

- [ ] 3.1 Create 8 "missing EXISTING" agents (haskell-expert, lua-specialist, ocaml-specialist, r-specialist, fsharp-specialist, machine-learning-engineer, mobile-app-developer, devops-incident-responder)
- [ ] 3.2 Create 3 new agents for 01-research-and-discovery
- [ ] 3.3 Create 4 new agents for 02-architecture-and-design
- [ ] 3.4 Create 2 new agents for 03-analysis-and-review
- [ ] 3.5 Create 4 new agents for 04-documentation
- [ ] 3.6 Create 5 new agents for 05-planning-and-estimation
- [ ] 3.7 Create 6 new agents for 09-testing-and-qa
- [ ] 3.8 Create 5 new agents for 10-refactoring-and-modernization
- [ ] 3.9 Create 4 new agents for 11-bug-fixing-and-debugging
- [ ] 3.10 Create 5 new agents for 12-frontend-and-ui (ALL new)
- [ ] 3.11 Create 4 new agents for 14-data-and-database
- [ ] 3.12 Create 5 new agents for 16-dependency-and-package-management
- [ ] 3.13 Create 5 new agents for 17-build-and-ci-cd (ALL new)
- [ ] 3.14 Create 5 new agents for 18-api-and-service-integration (ALL new)
- [ ] 3.15 Create 3 new agents for 19-infrastructure-as-code
- [ ] 3.16 Create 5 new agents for 20-security-and-secrets
- [ ] 3.17 Create 5 new agents for 22-deployment-and-release
- [ ] 3.18 Create 5 new agents for 23-production-ops-and-observability
- [ ] 3.19 Create 5 new agents for 24-production-data-ops (ALL new)

### Phase 4: Create category READMEs
- [ ] 4.1 Create README.md for each of the 25 categories, including:
  - Category title and risk tier badge/icon
  - Description of what agents in this category do
  - "Available Subagents" section with description per agent
  - Quick Selection Guide table
  - Common Combinations section
  - Getting Started section

### Phase 5: Create plugin.json files
- [ ] 5.1 Create `.claude-plugin/plugin.json` for each of the 25 categories with:
  - name (laywill-{shortname})
  - version: "3.0.0"
  - description
  - author, repository, license
  - agents array listing all .md files in the category

### Phase 6: Update marketplace.json
- [ ] 6.1 Rewrite `.claude-plugin/marketplace.json` with all 25 plugins, updated source paths, keywords, and categories

### Phase 7: Update root README.md
- [ ] 7.1 Rewrite `README.md` with:
  - Updated subagent count badge (~179)
  - Risk Tiers at a Glance table
  - All 25 categories with agents listed under each
  - Updated plugin names in installation section
  - Updated CLAUDE.md category listing

### Phase 8: Update CLAUDE.md
- [ ] 8.1 Update the "Repository Structure" section in CLAUDE.md to reflect new 00-24 categories

### Phase 9: Cleanup
- [ ] 9.1 Verify no orphaned files in old directories
- [ ] 9.2 Remove old category directories
- [ ] 9.3 Verify all agents are reachable from README links
- [ ] 9.4 Remove `unreal-specialist.md` (merged into game-developer)

## Decisions Made
- `unreal-specialist` will be DROPPED (content merged into game-developer if relevant)
- Agents marked EXISTING but not in repo will be created as new (8 agents)
- Version bumped to 3.0.0 for this restructure
- Risk tier icons used in READMEs: ⚪ 🟢 🟡 🟠 🔴 ⛔

## Errors Encountered
- (none yet)

## Status
**Phase 2 fully complete** — All 25 new dirs exist, 125 agents moved/renamed, YAML names updated, old dirs removed. Ready for Phase 3.
