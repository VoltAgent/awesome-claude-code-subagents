#!/usr/bin/env bash
# subagent-catalog configuration
# shared between search, fetch, and invalidate skills

set -euo pipefail

# --- CONFIG ---
readonly SUBAGENT_CATALOG_TTL_SECONDS=$((12 * 60 * 60))   # 12 hours
readonly SUBAGENT_CATALOG_CACHE_FILE="$HOME/.claude/cache/subagent-catalog.md"
readonly SUBAGENT_CATALOG_REPO_URL="https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main"

export SUBAGENT_CATALOG_TTL_SECONDS SUBAGENT_CATALOG_CACHE_FILE SUBAGENT_CATALOG_REPO_URL

# --- HELPERS ---

# get file mtime as epoch seconds
subagent_catalog_get_mtime() {
  date -r "$1" +%s
}

# logging helpers
subagent_catalog_log_info() { echo "$1"; }
subagent_catalog_log_error() { echo "ERROR: $1" >&2; }

# format age in human-readable form
subagent_catalog_format_age() {
  local seconds=$1
  if [ $seconds -lt 60 ]; then
    echo "${seconds}s"
  elif [ $seconds -lt 3600 ]; then
    echo "$(( seconds / 60 ))m"
  else
    echo "$(( seconds / 3600 ))h"
  fi
}

# internal: atomic fetch to cache file
_subagent_catalog_fetch() {
  mkdir -p "$(dirname "$SUBAGENT_CATALOG_CACHE_FILE")"
  if curl -sf --connect-timeout 5 --max-time 30 "$SUBAGENT_CATALOG_REPO_URL/README.md" -o "$SUBAGENT_CATALOG_CACHE_FILE.tmp" 2>/dev/null; then
    mv "$SUBAGENT_CATALOG_CACHE_FILE.tmp" "$SUBAGENT_CATALOG_CACHE_FILE"
    return 0
  else
    rm -f "$SUBAGENT_CATALOG_CACHE_FILE.tmp"
    return 1
  fi
}

# ensure cache is fresh, with graceful fallback on failure
subagent_catalog_ensure_cache() {
  local cache_age=0

  if [ -f "$SUBAGENT_CATALOG_CACHE_FILE" ]; then
    cache_age=$(( $(date +%s) - $(subagent_catalog_get_mtime "$SUBAGENT_CATALOG_CACHE_FILE") ))
    if [ $cache_age -lt $SUBAGENT_CATALOG_TTL_SECONDS ]; then
      subagent_catalog_log_info "using cached catalog ($(subagent_catalog_format_age $cache_age) old)"
      return 0
    fi
  fi

  if _subagent_catalog_fetch; then
    subagent_catalog_log_info "catalog refreshed"
  elif [ -f "$SUBAGENT_CATALOG_CACHE_FILE" ]; then
    subagent_catalog_log_error "fetch failed, using stale cache ($(subagent_catalog_format_age $cache_age) old). try /subagent-catalog:invalidate --fetch"
  else
    subagent_catalog_log_error "fetch failed and no cache. check network or try again later"
    return 1
  fi
  return 0
}

# force refresh cache (for invalidate)
subagent_catalog_refresh_cache() {
  if _subagent_catalog_fetch; then
    subagent_catalog_log_info "cache refreshed"
    return 0
  else
    subagent_catalog_log_error "fetch failed. check network and try again"
    return 1
  fi
}

# invalidate cache
subagent_catalog_invalidate_cache() {
  if [ -f "$SUBAGENT_CATALOG_CACHE_FILE" ]; then
    rm -f "$SUBAGENT_CATALOG_CACHE_FILE"
    subagent_catalog_log_info "cache invalidated"
  else
    subagent_catalog_log_info "cache already empty"
  fi
}

# note: functions are available after sourcing, no need to export
# (export -f causes noisy output in some bash versions)
