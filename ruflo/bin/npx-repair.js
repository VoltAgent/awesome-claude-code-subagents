#!/usr/bin/env node
// NPX cache repair — no-op (removed in 3.1.0-alpha.53)
// Kept as empty module for backwards compatibility with older bin/cli.js imports.
export function repairNpxCache() { return 0; }
export function repairCacheIntegrity() { return 0; }
export function removeNpxCacheEntry() { return false; }
export function nukeNpxCache() { return false; }
