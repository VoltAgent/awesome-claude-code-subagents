---
name: list
description: "List all categories and agents in the subagent catalog. Use when user wants to see everything available or browse the full catalog."
---

# Subagent Catalog - List

Browse all available categories and agents from the awesome-claude-code-subagents catalog.

## Input: $ARGUMENTS

No arguments required.

## Instructions

### Step 1: Ensure cache is fresh

```bash
source ~/.claude/commands/subagent-catalog/config.sh
subagent_catalog_ensure_cache
```

### Step 2: Extract and display categories

Parse the catalog and display all categories with their agents:

```bash
# extract category headers and agent entries
grep -E "^### \[|^\- \[\*\*" "$SUBAGENT_CATALOG_CACHE_FILE"
```

### Step 3: Format output

Display as a scannable list:

```
## Subagent Catalog

### 01. Core Development
api-designer, backend-developer, frontend-developer, fullstack-developer, ...

### 02. Language Specialists
typescript-pro, python-pro, rust-engineer, golang-pro, ...

### 03. Infrastructure
cloud-architect, devops-engineer, kubernetes-specialist, terraform-engineer, ...

[...continue for all 10 categories...]
```

### Tips

- use `/subagent-catalog:search <query>` to filter by keyword
- use `/subagent-catalog:fetch <name>` to get full definition
