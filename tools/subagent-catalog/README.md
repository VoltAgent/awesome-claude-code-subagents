# subagent-catalog

A ZCode skill for browsing and fetching subagents from the awesome-zcode-subagents catalog.

## Installation

Copy the `subagent-catalog/` folder to `~/.zcode/commands/`:

```bash
cp -r tools/subagent-catalog ~/.zcode/commands/
```

## Usage

| Command | Description |
|---------|-------------|
| `/subagent-catalog:search <query>` | Find agents by name, description, or category |
| `/subagent-catalog:fetch <name>` | Get full agent definition |
| `/subagent-catalog:list` | Browse all categories |
| `/subagent-catalog:invalidate` | Clear cache (add `--fetch` to refresh immediately) |

## Examples

**Find security-related agents:**
```
/subagent-catalog:search security
```

**Get the code-reviewer definition:**
```
/subagent-catalog:fetch code-reviewer
```

**Browse all available agents:**
```
/subagent-catalog:list
```

## Features

- **Smart caching**: 12-hour TTL with graceful fallback on network failure
- **Atomic updates**: Uses tmp file + mv pattern to prevent partial writes
- **Cross-platform**: Works on macOS and Linux
- **Best practices**: Follows ZCode command authoring conventions

## Cache

- **Location**: `~/.zcode/cache/subagent-catalog.md`
- **TTL**: 12 hours (configurable in `config.sh`)
- **Behavior**: Auto-refreshes when stale, falls back to old cache on network failure

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Stale results | `/subagent-catalog:invalidate --fetch` |
| Network error | Check connection, retry |
| Agent not found | `/subagent-catalog:search <partial-name>` first |
