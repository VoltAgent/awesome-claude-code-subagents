/**
 * Config MCP Tools for CLI
 *
 * Tool definitions for configuration management with file persistence.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type MCPTool, getProjectCwd } from './types.js';
import { validateIdentifier, validateText } from './validate-input.js';

// Storage paths
const STORAGE_DIR = '.claude-flow';
const CONFIG_FILE = 'config.json';

interface ConfigStore {
  values: Record<string, unknown>;
  scopes: Record<string, Record<string, unknown>>;
  version: string;
  updatedAt: string;
}

const DEFAULT_CONFIG: Record<string, unknown> = {
  'swarm.topology': 'mesh',
  'swarm.maxAgents': 10,
  'swarm.autoScale': true,
  'memory.persistInterval': 60000,
  'memory.maxEntries': 10000,
  'session.autoSave': true,
  'session.saveInterval': 300000,
  'logging.level': 'info',
  'logging.format': 'json',
  'security.sandboxEnabled': true,
  'security.pathValidation': true,
};

function getConfigDir(): string {
  return join(getProjectCwd(), STORAGE_DIR);
}

function getConfigPath(): string {
  return join(getConfigDir(), CONFIG_FILE);
}

function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function loadConfigStore(): ConfigStore {
  try {
    const path = getConfigPath();
    if (existsSync(path)) {
      const data = readFileSync(path, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Return default store on error
  }
  return {
    values: { ...DEFAULT_CONFIG },
    scopes: {},
    version: '3.0.0',
    updatedAt: new Date().toISOString(),
  };
}

function saveConfigStore(store: ConfigStore): void {
  ensureConfigDir();
  store.updatedAt = new Date().toISOString();
  writeFileSync(getConfigPath(), JSON.stringify(store, null, 2), 'utf-8');
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function filterDangerousKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!DANGEROUS_KEYS.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

function setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  const MAX_NESTING_DEPTH = 10;
  const parts = key.split('.');
  if (parts.length > MAX_NESTING_DEPTH) {
    throw new Error(`Key exceeds maximum nesting depth of ${MAX_NESTING_DEPTH}`);
  }
  for (const part of parts) {
    if (DANGEROUS_KEYS.has(part)) {
      throw new Error(`Dangerous key segment rejected: ${part}`);
    }
  }
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

export const configTools: MCPTool[] = [
  {
    name: 'config_get',
    description: 'Get configuration value Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon, MCP server, neural router) — those load via the config_* path, not by re-reading settings.json. For .gitignore / .editorconfig style files, native Edit is fine.',
    category: 'config',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Configuration key (dot notation supported)' },
        scope: { type: 'string', description: 'Configuration scope (project, user, system)' },
      },
      required: ['key'],
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      const vKey = validateText(input.key, 'key', 256);
      if (!vKey.valid) return { success: false, error: vKey.error };
      if (input.scope) {
        const v = validateIdentifier(input.scope, 'scope');
        if (!v.valid) return { success: false, error: v.error };
      }

      const store = loadConfigStore();
      const key = input.key as string;
      const scope = (input.scope as string) || 'default';

      let value: unknown;

      // Check scope first, then default values
      if (scope !== 'default' && store.scopes[scope]) {
        value = store.scopes[scope][key];
      }
      if (value === undefined) {
        value = store.values[key];
      }
      if (value === undefined) {
        value = DEFAULT_CONFIG[key];
      }

      return {
        key,
        value,
        scope,
        exists: value !== undefined,
        source: value !== undefined ? (store.values[key] !== undefined ? 'stored' : 'default') : 'none',
      };
    },
  },
  {
    name: 'config_set',
    description: 'Set configuration value Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon, MCP server, neural router) — those load via the config_* path, not by re-reading settings.json. For .gitignore / .editorconfig style files, native Edit is fine.',
    category: 'config',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Configuration key (dot notation supported)' },
        value: { description: 'Configuration value' },
        scope: { type: 'string', description: 'Configuration scope (project, user, system)' },
      },
      required: ['key', 'value'],
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      const vKey = validateText(input.key, 'key', 256);
      if (!vKey.valid) return { success: false, error: vKey.error };
      if (input.scope) {
        const v = validateIdentifier(input.scope, 'scope');
        if (!v.valid) return { success: false, error: v.error };
      }

      const store = loadConfigStore();
      const key = input.key as string;
      const value = input.value;
      const scope = (input.scope as string) || 'default';

      const previousValue = store.values[key];

      if (scope === 'default') {
        store.values[key] = value;
      } else {
        if (!store.scopes[scope]) {
          store.scopes[scope] = {};
        }
        store.scopes[scope][key] = value;
      }

      saveConfigStore(store);

      return {
        success: true,
        key,
        value,
        previousValue,
        scope,
        path: getConfigPath(),
      };
    },
  },
  {
    name: 'config_list',
    description: 'List configuration values Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon, MCP server, neural router) — those load via the config_* path, not by re-reading settings.json. For .gitignore / .editorconfig style files, native Edit is fine.',
    category: 'config',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Configuration scope' },
        prefix: { type: 'string', description: 'Key prefix filter' },
        includeDefaults: { type: 'boolean', description: 'Include default values' },
      },
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      if (input.scope) {
        const v = validateIdentifier(input.scope, 'scope');
        if (!v.valid) return { success: false, error: v.error };
      }
      if (input.prefix) {
        const v = validateText(input.prefix, 'prefix', 256);
        if (!v.valid) return { success: false, error: v.error };
      }

      const store = loadConfigStore();
      const scope = (input.scope as string) || 'default';
      const prefix = input.prefix as string;
      const includeDefaults = input.includeDefaults !== false;

      // ADR-093 F12: enumerate the full configuration union (defaults +
      // stored values + scope-specific) so config_list matches config_export.
      // The previous implementation built a flat record where stored values
      // shadowed defaults silently, and scope keys only appeared when the
      // caller passed a non-default scope — which made config_list
      // systematically incomplete.

      // Track the precedence so we can label sources accurately.
      type Source = 'default' | 'stored' | `scope:${string}`;
      const merged = new Map<string, { value: unknown; source: Source }>();

      if (includeDefaults) {
        for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
          merged.set(key, { value, source: 'default' });
        }
      }
      for (const [key, value] of Object.entries(store.values)) {
        merged.set(key, { value, source: 'stored' });
      }
      // Always include keys from every scope so they're discoverable; the
      // scope filter only narrows which set is used as the *winner*.
      for (const [scopeName, scopeValues] of Object.entries(store.scopes)) {
        for (const [key, value] of Object.entries(scopeValues)) {
          if (scope === scopeName || scope === 'default') {
            merged.set(key, { value, source: `scope:${scopeName}` });
          } else if (!merged.has(key)) {
            // Surface scoped keys that aren't shadowed when listing default scope
            merged.set(key, { value, source: `scope:${scopeName}` });
          }
        }
      }

      let entries = Array.from(merged.entries());
      if (prefix) {
        entries = entries.filter(([key]) => key.startsWith(prefix));
      }
      entries.sort(([a], [b]) => a.localeCompare(b));

      return {
        configs: entries.map(([key, { value, source }]) => ({ key, value, source })),
        total: entries.length,
        scope,
        updatedAt: store.updatedAt,
      };
    },
  },
  {
    name: 'config_reset',
    description: 'Reset configuration to defaults Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon, MCP server, neural router) — those load via the config_* path, not by re-reading settings.json. For .gitignore / .editorconfig style files, native Edit is fine.',
    category: 'config',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Configuration scope' },
        key: { type: 'string', description: 'Specific key to reset (omit to reset all)' },
      },
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      if (input.scope) {
        const v = validateIdentifier(input.scope, 'scope');
        if (!v.valid) return { success: false, error: v.error };
      }
      if (input.key) {
        const v = validateText(input.key, 'key', 256);
        if (!v.valid) return { success: false, error: v.error };
      }

      const store = loadConfigStore();
      const scope = (input.scope as string) || 'default';
      const key = input.key as string;

      let resetKeys: string[] = [];

      if (key) {
        // Reset specific key
        if (scope === 'default') {
          if (key in store.values) {
            delete store.values[key];
            resetKeys.push(key);
          }
        } else if (store.scopes[scope] && key in store.scopes[scope]) {
          delete store.scopes[scope][key];
          resetKeys.push(key);
        }
      } else {
        // Reset all keys in scope
        if (scope === 'default') {
          resetKeys = Object.keys(store.values);
          store.values = { ...DEFAULT_CONFIG };
        } else if (store.scopes[scope]) {
          resetKeys = Object.keys(store.scopes[scope]);
          delete store.scopes[scope];
        }
      }

      saveConfigStore(store);

      return {
        success: true,
        scope,
        reset: key || 'all',
        resetKeys,
        count: resetKeys.length,
      };
    },
  },
  {
    name: 'config_export',
    description: 'Export configuration to JSON Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon, MCP server, neural router) — those load via the config_* path, not by re-reading settings.json. For .gitignore / .editorconfig style files, native Edit is fine.',
    category: 'config',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Configuration scope' },
        includeDefaults: { type: 'boolean', description: 'Include default values' },
      },
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      if (input.scope) {
        const v = validateIdentifier(input.scope, 'scope');
        if (!v.valid) return { success: false, error: v.error };
      }

      const store = loadConfigStore();
      const scope = (input.scope as string) || 'default';
      const includeDefaults = input.includeDefaults !== false;

      let exportData: Record<string, unknown> = {};

      if (includeDefaults) {
        exportData = { ...DEFAULT_CONFIG };
      }

      Object.assign(exportData, store.values);

      if (scope !== 'default' && store.scopes[scope]) {
        Object.assign(exportData, store.scopes[scope]);
      }

      return {
        config: exportData,
        scope,
        version: store.version,
        exportedAt: new Date().toISOString(),
        count: Object.keys(exportData).length,
      };
    },
  },
  {
    name: 'config_import',
    description: 'Import configuration from JSON Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon, MCP server, neural router) — those load via the config_* path, not by re-reading settings.json. For .gitignore / .editorconfig style files, native Edit is fine.',
    category: 'config',
    inputSchema: {
      type: 'object',
      properties: {
        config: { type: 'object', description: 'Configuration object to import' },
        scope: { type: 'string', description: 'Configuration scope' },
        merge: { type: 'boolean', description: 'Merge with existing (true) or replace (false)' },
      },
      required: ['config'],
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      if (input.scope) {
        const v = validateIdentifier(input.scope, 'scope');
        if (!v.valid) return { success: false, error: v.error };
      }

      const store = loadConfigStore();
      const config = filterDangerousKeys(input.config as Record<string, unknown>);
      const scope = (input.scope as string) || 'default';
      const merge = input.merge !== false;

      const importedKeys: string[] = Object.keys(config);

      if (scope === 'default') {
        if (merge) {
          Object.assign(store.values, config);
        } else {
          store.values = { ...DEFAULT_CONFIG, ...config };
        }
      } else {
        if (!store.scopes[scope] || !merge) {
          store.scopes[scope] = {};
        }
        Object.assign(store.scopes[scope], config);
      }

      saveConfigStore(store);

      return {
        success: true,
        scope,
        imported: importedKeys.length,
        keys: importedKeys,
        merge,
      };
    },
  },
];
