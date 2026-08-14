import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'fs-extra';
import path from 'node:path';

export interface LoopRunOptions {
  name?: string;
  projectPath?: string;
  prompt?: string;
  command?: string;
  codexCommand?: string;
  model?: string;
  intervalSeconds?: number;
  maxIterations?: number;
  timeoutMs?: number;
  untilFile?: string;
  stateDir?: string;
  sandbox?: string;
  skipGitRepoCheck?: boolean;
  dryRun?: boolean;
  onEvent?: (event: LoopEvent) => void;
}

export interface LoopState {
  name: string;
  projectPath: string;
  mode: 'codex' | 'command';
  prompt?: string;
  command?: string;
  status: 'idle' | 'running' | 'stopping' | 'completed' | 'failed' | 'stopped';
  iteration: number;
  maxIterations: number;
  intervalSeconds: number;
  startedAt: string;
  updatedAt: string;
  lastExitCode?: number | null;
  lastOutput?: string;
  lastError?: string;
  untilFile: string;
}

export interface LoopEvent {
  type: 'start' | 'iteration-start' | 'iteration-complete' | 'sleep' | 'stop' | 'complete' | 'error' | 'dry-run';
  state: LoopState;
  message?: string;
}

export interface LoopPaths {
  stateDir: string;
  statePath: string;
  stopPath: string;
  completePath: string;
}

export interface LoopCommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export function normalizeLoopName(name = 'default'): string {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'default';
}

export function resolveLoopPaths(projectPath: string, name = 'default', stateDir?: string): LoopPaths {
  const safeName = normalizeLoopName(name);
  const resolvedStateDir = path.resolve(projectPath, stateDir ?? path.join('.codex', 'loop'));
  return {
    stateDir: resolvedStateDir,
    statePath: path.join(resolvedStateDir, `${safeName}.json`),
    stopPath: path.join(resolvedStateDir, `${safeName}.stop`),
    completePath: path.join(resolvedStateDir, `${safeName}.complete`),
  };
}

export async function loadLoopState(projectPath: string, name = 'default', stateDir?: string): Promise<LoopState | null> {
  const paths = resolveLoopPaths(projectPath, name, stateDir);
  if (!await fs.pathExists(paths.statePath)) return null;
  return await fs.readJson(paths.statePath) as LoopState;
}

export async function requestLoopStop(projectPath: string, name = 'default', stateDir?: string): Promise<LoopPaths> {
  const paths = resolveLoopPaths(projectPath, name, stateDir);
  await fs.ensureDir(paths.stateDir);
  await fs.writeFile(paths.stopPath, new Date().toISOString());

  const state = await loadLoopState(projectPath, name, stateDir);
  if (state && state.status === 'running') {
    state.status = 'stopping';
    state.updatedAt = new Date().toISOString();
    await saveLoopState(paths.statePath, state);
  }

  return paths;
}

export function buildCodexLoopPrompt(state: LoopState): string {
  const max = state.maxIterations > 0 ? state.maxIterations : 'unbounded';
  return [
    'You are running inside a Codex /loop-compatible iteration.',
    `Loop: ${state.name}`,
    `Iteration: ${state.iteration}/${max}`,
    `Project: ${state.projectPath}`,
    '',
    'Task:',
    state.prompt ?? '',
    '',
    'Work autonomously for this iteration. Make concrete progress, run relevant checks, and stop before broad unrelated refactors.',
    `If the task is fully complete, create this marker file: ${state.untilFile}`,
    'If more work remains, leave the marker absent so the next loop iteration can continue.',
  ].join('\n');
}

export async function runCodexLoop(options: LoopRunOptions = {}): Promise<LoopState> {
  const projectPath = path.resolve(options.projectPath ?? process.cwd());
  const name = normalizeLoopName(options.name);
  const paths = resolveLoopPaths(projectPath, name, options.stateDir);
  const intervalSeconds = clampInteger(options.intervalSeconds ?? 270, 0, 86_400);
  const maxIterations = clampInteger(options.maxIterations ?? 10, 0, 100_000);
  const timeoutMs = clampInteger(options.timeoutMs ?? 30 * 60_000, 1_000, 24 * 60 * 60_000);
  const untilFile = path.resolve(projectPath, options.untilFile ?? paths.completePath);
  const mode: LoopState['mode'] = options.command ? 'command' : 'codex';

  if (mode === 'codex' && !options.prompt?.trim()) {
    throw new Error('loop run requires a prompt unless --command is provided');
  }

  await fs.ensureDir(paths.stateDir);
  await fs.remove(paths.stopPath);

  const startedAt = new Date().toISOString();
  const state: LoopState = {
    name,
    projectPath,
    mode,
    status: 'running',
    iteration: 0,
    maxIterations,
    intervalSeconds,
    startedAt,
    updatedAt: startedAt,
    untilFile,
  };
  if (options.prompt !== undefined) state.prompt = options.prompt;
  if (options.command !== undefined) state.command = options.command;

  await saveLoopState(paths.statePath, state);
  emit(options, 'start', state, `Loop ${name} started`);

  if (options.dryRun) {
    state.status = 'idle';
    state.updatedAt = new Date().toISOString();
    await saveLoopState(paths.statePath, state);
    emit(options, 'dry-run', state, 'Dry run complete');
    return state;
  }

  try {
    while (shouldContinue(state, paths)) {
      state.iteration += 1;
      state.updatedAt = new Date().toISOString();
      await saveLoopState(paths.statePath, state);
      emit(options, 'iteration-start', state, `Iteration ${state.iteration} starting`);

      const result = mode === 'command'
        ? await runShellCommand(options.command!, projectPath, timeoutMs)
        : await runCodexExec(options, state, timeoutMs);

      state.lastExitCode = result.code;
      state.lastOutput = truncate(result.stdout || result.stderr, 8_000);
      if (result.code === 0 || result.code === null) {
        delete state.lastError;
      } else {
        state.lastError = truncate(result.stderr || result.stdout, 8_000);
      }
      state.updatedAt = new Date().toISOString();
      await saveLoopState(paths.statePath, state);
      emit(options, 'iteration-complete', state, `Iteration ${state.iteration} exited with ${result.code ?? result.signal ?? 'unknown'}`);

      if (existsSync(untilFile)) {
        state.status = 'completed';
        state.updatedAt = new Date().toISOString();
        await saveLoopState(paths.statePath, state);
        emit(options, 'complete', state, `Completion marker found: ${untilFile}`);
        return state;
      }

      if (result.code !== 0 && result.code !== null) {
        state.status = 'failed';
        state.updatedAt = new Date().toISOString();
        await saveLoopState(paths.statePath, state);
        emit(options, 'error', state, `Iteration failed with exit code ${result.code}`);
        return state;
      }

      if (!shouldContinue(state, paths)) break;
      emit(options, 'sleep', state, `Sleeping ${intervalSeconds}s`);
      await sleep(intervalSeconds * 1000);
    }

    state.status = existsSync(paths.stopPath) ? 'stopped' : 'completed';
    state.updatedAt = new Date().toISOString();
    await saveLoopState(paths.statePath, state);
    emit(options, state.status === 'stopped' ? 'stop' : 'complete', state);
    return state;
  } catch (error) {
    state.status = 'failed';
    state.lastError = error instanceof Error ? error.message : String(error);
    state.updatedAt = new Date().toISOString();
    await saveLoopState(paths.statePath, state);
    emit(options, 'error', state, state.lastError);
    return state;
  }
}

async function runCodexExec(options: LoopRunOptions, state: LoopState, timeoutMs: number): Promise<LoopCommandResult> {
  const args = ['exec', '--sandbox', options.sandbox ?? 'workspace-write'];
  if (options.skipGitRepoCheck !== false) args.push('--skip-git-repo-check');
  if (options.model) args.push('-m', options.model);
  args.push(buildCodexLoopPrompt(state));
  return runProcess(options.codexCommand ?? 'codex', args, state.projectPath, timeoutMs);
}

async function runShellCommand(command: string, cwd: string, timeoutMs: number): Promise<LoopCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    collectChild(child, timeoutMs, resolve, reject);
  });
}

async function runProcess(command: string, args: string[], cwd: string, timeoutMs: number): Promise<LoopCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    collectChild(child, timeoutMs, resolve, reject);
  });
}

function collectChild(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
  resolve: (result: LoopCommandResult) => void,
  reject: (error: Error) => void
): void {
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, timeoutMs);

  child.stdout?.on('data', data => { stdout += data.toString(); });
  child.stderr?.on('data', data => { stderr += data.toString(); });
  child.on('error', err => {
    clearTimeout(timer);
    reject(err);
  });
  child.on('close', (code, signal) => {
    clearTimeout(timer);
    if (timedOut) {
      resolve({ code: 124, signal, stdout, stderr: stderr || `Timed out after ${timeoutMs}ms` });
      return;
    }
    resolve({ code, signal, stdout, stderr });
  });
}

async function saveLoopState(statePath: string, state: LoopState): Promise<void> {
  await fs.ensureDir(path.dirname(statePath));
  await fs.writeJson(statePath, state, { spaces: 2 });
}

function shouldContinue(state: LoopState, paths: LoopPaths): boolean {
  if (state.status !== 'running') return false;
  if (existsSync(paths.stopPath)) return false;
  if (existsSync(state.untilFile)) return false;
  return state.maxIterations === 0 || state.iteration < state.maxIterations;
}

function emit(options: LoopRunOptions, type: LoopEvent['type'], state: LoopState, message?: string): void {
  const event: LoopEvent = { type, state: { ...state } };
  if (message !== undefined) event.message = message;
  options.onEvent?.(event);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}\n...[truncated]`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
