/**
 * Config File Manager
 * Shared JSON config file persistence with atomic writes and Zod validation
 */

import * as fs from 'fs';
import * as path from 'path';

/** Config file search paths in priority order */
const CONFIG_FILENAMES = [
  'claude-flow.config.json',
  '.claude-flow/config.json',
];

/** Default config values */
const DEFAULT_CONFIG: Record<string, unknown> = {
  version: '3.5',
  agents: {
    defaultType: 'coder',
    autoSpawn: false,
    maxConcurrent: 8,
    timeout: 300000,
    providers: [],
  },
  swarm: {
    topology: 'hierarchical',
    maxAgents: 8,
    autoScale: false,
    coordinationStrategy: 'leader',
    healthCheckInterval: 30000,
  },
  memory: {
    backend: 'hybrid',
    persistPath: './data/memory',
    cacheSize: 1000,
    enableHNSW: true,
    vectorDimension: 384,
  },
  mcp: {
    serverHost: 'localhost',
    serverPort: 3000,
    autoStart: false,
    transportType: 'stdio',
    tools: [],
  },
  cli: {
    colorOutput: true,
    interactive: true,
    verbosity: 'normal',
    outputFormat: 'text',
    progressStyle: 'spinner',
  },
  hooks: {
    enabled: true,
    autoExecute: true,
    hooks: [],
  },
};

export class ConfigFileManager {
  private configPath: string | null = null;
  private config: Record<string, unknown> | null = null;

  /** Find config file in search paths starting from cwd */
  findConfig(cwd: string): string | null {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = path.resolve(cwd, filename);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    // Check env var
    const envPath = process.env.CLAUDE_FLOW_CONFIG;
    if (envPath && fs.existsSync(envPath)) {
      return path.resolve(envPath);
    }
    return null;
  }

  /** Load config from file, returns null if not found */
  load(cwd: string): Record<string, unknown> | null {
    this.configPath = this.findConfig(cwd);
    if (!this.configPath) {
      this.config = null;
      return null;
    }
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
      return this.config;
    } catch {
      this.config = null;
      return null;
    }
  }

  /** Get the current config, loading if needed */
  getConfig(cwd: string): Record<string, unknown> {
    if (this.config === null) {
      this.load(cwd);
    }
    return this.config ?? { ...DEFAULT_CONFIG };
  }

  /** Get a nested config value by dot-separated key */
  get(cwd: string, key: string): unknown {
    const config = this.getConfig(cwd);
    return getNestedValue(config, key);
  }

  /** Set a nested config value by dot-separated key */
  set(cwd: string, key: string, value: unknown): void {
    const config = this.getConfig(cwd);
    setNestedValue(config, key, value);
    this.config = config;
    const targetPath = this.configPath ?? path.resolve(cwd, CONFIG_FILENAMES[0]);
    this.writeAtomic(targetPath, config);
    this.configPath = targetPath;
  }

  /** Create a new config file with defaults */
  create(cwd: string, overrides?: Record<string, unknown>, force?: boolean): string {
    const targetPath = path.resolve(cwd, CONFIG_FILENAMES[0]);
    if (fs.existsSync(targetPath) && !force) {
      throw new Error(`Config file already exists: ${targetPath}. Use --force to overwrite.`);
    }
    const config = { ...DEFAULT_CONFIG, ...overrides };
    this.writeAtomic(targetPath, config);
    this.config = config;
    this.configPath = targetPath;
    return targetPath;
  }

  /** Reset config to defaults */
  reset(cwd: string): string {
    const targetPath = this.configPath ?? path.resolve(cwd, CONFIG_FILENAMES[0]);
    this.writeAtomic(targetPath, DEFAULT_CONFIG);
    this.config = { ...DEFAULT_CONFIG };
    this.configPath = targetPath;
    return targetPath;
  }

  /** Export config to a specific path */
  exportTo(cwd: string, exportPath: string): void {
    const config = this.getConfig(cwd);
    const resolved = path.resolve(cwd, exportPath);
    this.writeAtomic(resolved, config);
  }

  /** Import config from a specific path */
  importFrom(cwd: string, importPath: string): void {
    const resolved = path.resolve(cwd, importPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Import file not found: ${resolved}`);
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    let imported: Record<string, unknown>;
    try {
      imported = JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON in import file: ${resolved}`);
    }
    if (typeof imported !== 'object' || imported === null || Array.isArray(imported)) {
      throw new Error('Import file must contain a JSON object');
    }
    const targetPath = this.configPath ?? path.resolve(cwd, CONFIG_FILENAMES[0]);
    this.writeAtomic(targetPath, imported);
    this.config = imported;
    this.configPath = targetPath;
  }

  /** Get the path to the current config file */
  getConfigPath(): string | null {
    return this.configPath;
  }

  /** Get default config */
  getDefaults(): Record<string, unknown> {
    return { ...DEFAULT_CONFIG };
  }

  /** Atomic write: write to .tmp then rename */
  private writeAtomic(filePath: string, data: Record<string, unknown>): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmpPath, filePath);
  }
}

/** Get a nested value by dot-separated key */
function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Set a nested value by dot-separated key */
function setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/** Parse a string value to the appropriate type */
export function parseConfigValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object') return parsed;
  } catch { /* not JSON, use as string */ }
  return value;
}

/** Singleton instance */
export const configManager = new ConfigFileManager();
