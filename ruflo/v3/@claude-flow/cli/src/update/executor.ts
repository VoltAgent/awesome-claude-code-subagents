/**
 * Update executor - performs actual package updates
 * Includes rollback capability
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UpdateCheckResult } from './checker.js';
import { validateUpdate, ValidationResult } from './validator.js';

/**
 * audit_1776853149979: package name and version come from npm-view output and
 * the update-history.json file (writable by anyone with FS access). Both
 * previously interpolated straight into a shell string for `npm install`.
 * These regexes pre-flight values so a hostile package name can't slip
 * shell metacharacters through, even though execFileSync below already
 * eliminates the shell.
 */
// First char of the unscoped name forbids `-` to defang CLI-flag confusion
// when the spec is passed to npm (npm install -evil@1.0.0 looks flag-shaped).
const SAFE_PKG_RE = /^(@[a-zA-Z0-9_\-]+\/)?[a-zA-Z0-9_][a-zA-Z0-9_\-.]{0,213}$/;
// semver / dist-tag / range chars only — no shell metas.
const SAFE_VERSION_RE = /^[a-zA-Z0-9._\-+~^*xX]{1,64}$/;

export function isSafePackageSpec(pkg: string, version: string): boolean {
  return SAFE_PKG_RE.test(pkg) && SAFE_VERSION_RE.test(version);
}

export interface UpdateHistoryEntry {
  timestamp: string;
  package: string;
  fromVersion: string;
  toVersion: string;
  success: boolean;
  error?: string;
  rollbackAvailable: boolean;
}

export interface UpdateExecutionResult {
  success: boolean;
  package: string;
  version: string;
  error?: string;
  validation: ValidationResult;
}

const HISTORY_FILE = path.join(os.homedir(), '.claude-flow', 'update-history.json');
const MAX_HISTORY_ENTRIES = 100;

function ensureDir(): void {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadHistory(): UpdateHistoryEntry[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
      return JSON.parse(content) as UpdateHistoryEntry[];
    }
  } catch {
    // Corrupted file
  }
  return [];
}

function saveHistory(history: UpdateHistoryEntry[]): void {
  ensureDir();
  // Keep only last N entries
  const trimmed = history.slice(-MAX_HISTORY_ENTRIES);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2));
}

function recordUpdate(entry: UpdateHistoryEntry): void {
  const history = loadHistory();
  history.push(entry);
  saveHistory(history);
}

export async function executeUpdate(
  update: UpdateCheckResult,
  installedPackages: Record<string, string>,
  dryRun = false
): Promise<UpdateExecutionResult> {
  // Validate first
  const validation = validateUpdate(
    update.package,
    update.currentVersion,
    update.latestVersion,
    installedPackages
  );

  if (!validation.valid) {
    return {
      success: false,
      package: update.package,
      version: update.latestVersion,
      error: `Validation failed: ${validation.incompatibilities.join(', ')}`,
      validation,
    };
  }

  if (dryRun) {
    return {
      success: true,
      package: update.package,
      version: update.latestVersion,
      validation,
    };
  }

  // audit_1776853149979: validate package + version regex before any exec.
  if (!isSafePackageSpec(update.package, update.latestVersion)) {
    return {
      success: false,
      package: update.package,
      version: update.latestVersion,
      error: `Refusing to install: package or version contains disallowed characters (pkg="${update.package}", version="${update.latestVersion}")`,
      validation,
    };
  }

  try {
    // audit_1776853149979: switched to execFileSync('npm', argv) — no shell,
    // so even if validation regressed, metas in update.package would stay
    // literal in the argv slot.
    execFileSync(
      'npm',
      ['install', `${update.package}@${update.latestVersion}`, '--save-exact'],
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 60000, // 1 minute timeout
        shell: false,
      },
    );

    // Record successful update
    recordUpdate({
      timestamp: new Date().toISOString(),
      package: update.package,
      fromVersion: update.currentVersion,
      toVersion: update.latestVersion,
      success: true,
      rollbackAvailable: true,
    });

    return {
      success: true,
      package: update.package,
      version: update.latestVersion,
      validation,
    };
  } catch (error) {
    const err = error as Error;

    // Record failed update
    recordUpdate({
      timestamp: new Date().toISOString(),
      package: update.package,
      fromVersion: update.currentVersion,
      toVersion: update.latestVersion,
      success: false,
      error: err.message,
      rollbackAvailable: false,
    });

    return {
      success: false,
      package: update.package,
      version: update.latestVersion,
      error: err.message,
      validation,
    };
  }
}

export async function executeMultipleUpdates(
  updates: UpdateCheckResult[],
  installedPackages: Record<string, string>,
  dryRun = false
): Promise<UpdateExecutionResult[]> {
  const results: UpdateExecutionResult[] = [];

  // Execute updates sequentially to avoid conflicts
  for (const update of updates) {
    const result = await executeUpdate(update, installedPackages, dryRun);
    results.push(result);

    // Update installed packages for next validation
    if (result.success) {
      installedPackages[update.package] = update.latestVersion;
    }

    // Stop on critical failures
    if (!result.success && update.priority === 'critical') {
      break;
    }
  }

  return results;
}

export async function rollbackUpdate(
  packageName?: string
): Promise<{ success: boolean; message: string }> {
  const history = loadHistory();

  if (history.length === 0) {
    return { success: false, message: 'No update history available' };
  }

  // Find the last successful update for this package (or any if not specified)
  const lastUpdate = packageName
    ? history
        .reverse()
        .find((h) => h.package === packageName && h.success && h.rollbackAvailable)
    : history.reverse().find((h) => h.success && h.rollbackAvailable);

  if (!lastUpdate) {
    return {
      success: false,
      message: packageName
        ? `No rollback available for ${packageName}`
        : 'No rollback available',
    };
  }

  // audit_1776853149979: history entries can be tampered with by anyone who
  // can write update-history.json — gate before exec.
  if (!isSafePackageSpec(lastUpdate.package, lastUpdate.fromVersion)) {
    return {
      success: false,
      message: `Refusing to rollback: package or version contains disallowed characters (pkg="${lastUpdate.package}", version="${lastUpdate.fromVersion}")`,
    };
  }

  try {
    // execFileSync, no shell.
    execFileSync(
      'npm',
      ['install', `${lastUpdate.package}@${lastUpdate.fromVersion}`, '--save-exact'],
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 60000,
        shell: false,
      },
    );

    // Record the rollback
    recordUpdate({
      timestamp: new Date().toISOString(),
      package: lastUpdate.package,
      fromVersion: lastUpdate.toVersion,
      toVersion: lastUpdate.fromVersion,
      success: true,
      rollbackAvailable: false, // Can't rollback a rollback
    });

    return {
      success: true,
      message: `Rolled back ${lastUpdate.package} from ${lastUpdate.toVersion} to ${lastUpdate.fromVersion}`,
    };
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      message: `Rollback failed: ${err.message}`,
    };
  }
}

export function getUpdateHistory(limit = 20): UpdateHistoryEntry[] {
  const history = loadHistory();
  return history.slice(-limit).reverse();
}

export function clearHistory(): void {
  if (fs.existsSync(HISTORY_FILE)) {
    fs.unlinkSync(HISTORY_FILE);
  }
}
