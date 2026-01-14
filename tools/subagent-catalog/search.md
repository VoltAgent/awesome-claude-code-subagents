---
name: search
description: "Search the awesome-claude-code-subagents catalog. Use when user wants to find, discover, or browse available subagents by name, category, or capability."
---

# Subagent Catalog - Search

Find agents by name, description, or category.

## Input: $ARGUMENTS

## Example output

```
## Results for "kubernetes"

| Agent | Description |
|-------|-------------|
| [kubernetes-specialist](https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/03-infrastructure/kubernetes-specialist.md) | Container orchestration master |
| [devops-engineer](https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/03-infrastructure/devops-engineer.md) | CI/CD and automation expert |

→ use `/subagent-catalog:fetch <name>` to get full definition
```

## Instructions

### Step 1: Get catalog

```bash
source ~/.claude/commands/subagent-catalog/config.sh
subagent_catalog_ensure_cache
cat "$SUBAGENT_CATALOG_CACHE_FILE"
```

### Step 2: Match and return

Search the catalog content for matches (case-insensitive substring):
- agent names
- descriptions
- category names

Format each match as a table row with GitHub link.

### Step 3: Handle edge cases

- **no results**: suggest related terms or `/subagent-catalog:list`
- **too many results**: ask user to narrow the query
- **category match**: show all agents in that category

## Query examples

| query | matches |
|-------|---------|
| `kubernetes` | kubernetes-specialist, devops-engineer |
| `security` | security-engineer, security-auditor, penetration-tester |
| `python` | python-pro, django-developer |
| `review` | code-reviewer, architect-reviewer |
| `infrastructure` | entire category 03 |
