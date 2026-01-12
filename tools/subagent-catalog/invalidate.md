---
name: invalidate
description: "Invalidate the subagent-catalog cache. Use when results seem stale or user explicitly asks to refresh or clear cache."
---

# Subagent Catalog - Invalidate

Force-refresh the cached catalog by deleting the local cache file. The next `search` or `fetch` call will pull fresh data from the repository.

## Input: $ARGUMENTS

No arguments required. Optional: pass `--fetch` to immediately refresh after invalidation.

## Instructions

### Step 1: Source config

```bash
source ~/.claude/commands/subagent-catalog/config.sh
```

### Step 2: Invalidate (and optionally refresh)

**Invalidate only** (default):

```bash
subagent_catalog_invalidate_cache
```

**Invalidate and refresh** (if `$ARGUMENTS` contains `--fetch` or user explicitly asks to refresh):

```bash
subagent_catalog_invalidate_cache
subagent_catalog_refresh_cache
```

### Step 3: Confirm

Report the result:
- If invalidated only: "cache invalidated. next search/fetch will pull fresh data."
- If refreshed: "cache invalidated and refreshed with latest catalog."

### When to use

- After the upstream repo has been updated with new subagents
- If you suspect the cache is corrupted
- To troubleshoot stale results
