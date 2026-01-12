---
name: fetch
description: "Fetch full subagent definition from catalog. Use when user wants to get, download, view, or use a specific subagent."
---

# Subagent Catalog - Fetch

Get the full definition of a specific agent.

## Input: $ARGUMENTS

Accepts: agent name, path, or GitHub URL.

## Example

```
/subagent-catalog:fetch code-reviewer

## code-reviewer

**Category**: Quality & Security
**Tools**: Read, Write, Edit, Bash, Glob, Grep

Expert code reviewer specializing in code quality, security vulnerabilities...

[full definition follows]

---
**What now?**
- save to ~/.claude/agents/code-reviewer.md
- customize for this project
- spawn as Task subagent
```

## Instructions

### Progress checklist

Copy and track:
- [ ] Step 1: Resolve agent path from catalog
- [ ] Step 2: Fetch full definition
- [ ] Step 3: Display and offer options

### Step 1: Resolve path

```bash
source ~/.claude/commands/subagent-catalog/config.sh
subagent_catalog_ensure_cache

# find the agent (use -F for literal match)
grep -iF "{{NAME}}" "$SUBAGENT_CATALOG_CACHE_FILE"
```

Extract path from: `[**name**](path)`

### Step 2: Fetch definition

```bash
tmp_file=$(mktemp)
if curl -sf "$SUBAGENT_CATALOG_REPO_URL/{{PATH}}" -o "$tmp_file"; then
  cat "$tmp_file"
  rm -f "$tmp_file"
else
  rm -f "$tmp_file"
  subagent_catalog_log_error "failed to fetch. try /subagent-catalog:search first"
fi
```

### Step 3: Display and offer options

Show the definition with frontmatter parsed, then offer:
1. save locally (`~/.claude/agents/<name>.md`)
2. customize for project
3. spawn as Task

### Error handling

| error | suggestion |
|-------|------------|
| not found | run `/subagent-catalog:search <partial>` |
| multiple matches | list them, ask user to specify |
| network error | check connection, retry |
