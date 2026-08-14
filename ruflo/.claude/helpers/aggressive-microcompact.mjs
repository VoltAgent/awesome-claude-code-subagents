#!/usr/bin/env node
/**
 * Aggressive Micro-Compaction Preload
 *
 * Claude Code's micro-compaction (Vd function) only prunes old tool results
 * when context is above the warning threshold (~80%) and only if it can save
 * at least 20K tokens. These hardcoded thresholds mean context can grow large
 * before any pruning happens.
 *
 * This script patches the environment to make micro-compaction more aggressive
 * by lowering the threshold at which it activates. It works by setting
 * CLAUDE_AUTOCOMPACT_PCT_OVERRIDE to trigger compaction earlier if micro-compaction
 * isn't enough, but the real win is keeping context lean through early pruning.
 *
 * The micro-compact function Vd() works like this:
 *   1. Collects all tool results from: Read, Bash, Grep, Glob, WebSearch, WebFetch, Edit, Write
 *   2. Keeps the last 3 tool results intact (Ly5=3)
 *   3. If total tool result tokens > 40K (Ny5) AND context is above warning threshold:
 *      - Replaces old results with "[Old tool result content cleared]"
 *      - Only if savings >= 20K tokens (qy5)
 *   4. This runs on EVERY query — it IS automatic pruning
 *
 * The problem: Ny5=40000 and qy5=20000 are hardcoded. We can't change them.
 * The solution: Set CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50 so the warning/error
 * thresholds drop, which makes micro-compaction activate much earlier.
 */

// This file is sourced by settings.json hooks to document the strategy.
// The actual configuration is in settings.json env vars:
//   CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50  → lowers all thresholds
//   autoCompactEnabled=true             → enables the auto-compact fallback

console.log('[AggressiveMicrocompact] Strategy: CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50');
console.log('[AggressiveMicrocompact] Micro-compact activates when tokens > warning threshold');
console.log('[AggressiveMicrocompact] Warning threshold = maxTokens - 20K (relative to override)');
console.log('[AggressiveMicrocompact] Effect: pruning starts at ~45% instead of ~80%');
