import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  buildCodexLoopPrompt,
  loadLoopState,
  normalizeLoopName,
  requestLoopStop,
  resolveLoopPaths,
  runCodexLoop,
} from '../src/loop/index.js';

describe('Codex loop runner', () => {
  it('normalizes loop names for state file paths', () => {
    expect(normalizeLoopName(' Feature Loop! ')).toBe('feature-loop');
    expect(normalizeLoopName('')).toBe('default');
  });

  it('runs a bounded shell-command loop and persists state', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-loop-'));
    const marker = path.join(projectPath, '.codex', 'loop', 'demo.complete');
    const script = `const fs=require('fs');const path=require('path');const marker=${JSON.stringify(marker)};fs.mkdirSync(path.dirname(marker),{recursive:true});fs.writeFileSync(marker,'done');console.log('completed');`;
    const command = `node -e ${JSON.stringify(script)}`;

    const state = await runCodexLoop({
      name: 'demo',
      projectPath,
      command,
      intervalSeconds: 0,
      maxIterations: 3,
      timeoutMs: 10_000,
    });

    expect(state.status).toBe('completed');
    expect(state.iteration).toBe(1);
    expect(state.lastExitCode).toBe(0);
    expect(await fs.pathExists(marker)).toBe(true);

    const persisted = await loadLoopState(projectPath, 'demo');
    expect(persisted?.status).toBe('completed');
    expect(persisted?.iteration).toBe(1);
  });

  it('writes stop requests that running loops can observe', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-loop-stop-'));
    const paths = await requestLoopStop(projectPath, 'demo');
    expect(await fs.pathExists(paths.stopPath)).toBe(true);
  });

  it('builds a prompt with the completion marker contract', () => {
    const projectPath = '/tmp/project';
    const paths = resolveLoopPaths(projectPath, 'demo');
    const prompt = buildCodexLoopPrompt({
      name: 'demo',
      projectPath,
      mode: 'codex',
      prompt: 'Fix the tests',
      status: 'running',
      iteration: 2,
      maxIterations: 5,
      intervalSeconds: 270,
      startedAt: '2026-05-11T00:00:00.000Z',
      updatedAt: '2026-05-11T00:00:00.000Z',
      untilFile: paths.completePath,
    });

    expect(prompt).toContain('Codex /loop-compatible iteration');
    expect(prompt).toContain('Fix the tests');
    expect(prompt).toContain(paths.completePath);
  });
});
