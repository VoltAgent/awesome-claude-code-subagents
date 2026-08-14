/**
 * RVFA Runner -- Boot and run self-contained Ruflo appliances.
 *
 * Supports three run modes (cli, mcp, verify) and two isolation
 * strategies (native Node.js, container via Docker).
 *
 * @module @claude-flow/cli/appliance/rvfa-runner
 */

import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { RvfaReader } from './rvfa-format.js';
import type { RvfaHeader, RvfaSection } from './rvfa-format.js';

// ── Options & Result ────────────────────────────────────────

export interface RunOptions {
  mode: 'cli' | 'mcp' | 'verify';
  isolation: 'container' | 'native';
  verbose?: boolean;
  /** Passphrase for decrypting the API-key vault in the models section. */
  passphrase?: string;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Wall-clock duration in milliseconds. */
  duration: number;
}

// ── Internal helpers ────────────────────────────────────────

/** Spawn a child process and capture stdout/stderr. */
function spawnAsync(
  cmd: string, args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; verbose?: boolean },
): Promise<RunResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const child = spawn(cmd, args, {
      cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (c: Buffer) => { out.push(c); if (opts.verbose) process.stdout.write(c); });
    child.stderr.on('data', (c: Buffer) => { err.push(c); if (opts.verbose) process.stderr.write(c); });
    child.on('close', (code) => resolve({
      exitCode: code ?? 1, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString(),
      duration: performance.now() - start,
    }));
    child.on('error', (e) => resolve({
      exitCode: 1, stdout: '', stderr: e.message, duration: performance.now() - start,
    }));
  });
}

const fail = (stderr: string): RunResult => ({ exitCode: 1, stdout: '', stderr, duration: 0 });
const cleanup = (dir: string) => rm(dir, { recursive: true, force: true }).catch(() => {});

/** Check whether the reader has a section with the given id. */
function hasSection(reader: RvfaReader, id: string): boolean {
  return reader.getSections().some((s) => s.id === id);
}

/** Safely extract a section, returning null if absent. */
function tryExtract(reader: RvfaReader, id: string): Buffer | null {
  try {
    return reader.extractSection(id);
  } catch {
    return null;
  }
}

// ── Runner ──────────────────────────────────────────────────

export class RvfaRunner {
  private reader: RvfaReader;
  private header: RvfaHeader;

  private constructor(reader: RvfaReader) {
    this.reader = reader;
    this.header = reader.getHeader();
  }

  /** Read and parse an RVFA file from disk. Throws on invalid input. */
  static async fromFile(rvfaPath: string): Promise<RvfaRunner> {
    const reader = await RvfaReader.fromFile(rvfaPath);
    return new RvfaRunner(reader);
  }

  /** Create a runner from an already-loaded buffer. */
  static fromBuffer(buf: Buffer): RvfaRunner {
    return new RvfaRunner(RvfaReader.fromBuffer(buf));
  }

  /**
   * Boot the appliance: verify integrity, then dispatch to the
   * requested isolation strategy and run mode.
   */
  async boot(options: RunOptions): Promise<RunResult> {
    const { valid, errors } = this.reader.verify();
    if (!valid) {
      return fail(`Integrity check failed:\n${errors.join('\n')}`);
    }

    if (options.mode === 'verify') return this.runVerify(options);
    if (options.isolation === 'container') return this.runContainer(options);
    return this.runNative(options);
  }

  /**
   * Run natively via Node.js: extract RUFLO section to a temp dir,
   * configure env vars, optionally decrypt API-key vault, and spawn.
   */
  async runNative(options: RunOptions): Promise<RunResult> {
    const workDir = join(tmpdir(), `rvfa-${this.header.name}-${Date.now()}`);
    try {
      await mkdir(workDir, { recursive: true });

      const ruflo = tryExtract(this.reader, 'ruflo');
      if (!ruflo) return fail('RVFA appliance does not contain a "ruflo" section');

      const entryFile = join(workDir, 'ruflo-bundle.js');
      await writeFile(entryFile, ruflo);

      const env: Record<string, string> = {
        ...this.header.boot.env,
        RVFA_APPLIANCE_NAME: this.header.name,
        RVFA_APPLIANCE_VERSION: this.header.appVersion,
        RVFA_RUN_MODE: options.mode,
        RVFA_PROFILE: this.header.profile,
      };

      if (options.passphrase && this.header.models.provider !== 'ruvllm') {
        const vault = tryExtract(this.reader, 'models');
        if (vault) {
          const keys = await this.decryptVault(vault, options.passphrase);
          if (keys) Object.assign(env, keys);
        }
      }

      const args = [...this.header.boot.args];
      if (options.mode === 'mcp') args.push('--mcp', '--transport', 'stdio');

      return spawnAsync(this.header.boot.entrypoint || 'node', [entryFile, ...args], {
        cwd: workDir, env, verbose: options.verbose,
      });
    } finally {
      await cleanup(workDir);
    }
  }

  /**
   * Run in a Docker container: generate a Dockerfile from the
   * extracted sections, build the image, and run it.
   */
  async runContainer(options: RunOptions): Promise<RunResult> {
    const dockerCheck = await spawnAsync('docker', ['info'], { verbose: false });
    if (dockerCheck.exitCode !== 0) {
      return fail('Docker is not available. Install Docker or use isolation: "native".');
    }

    const workDir = join(tmpdir(), `rvfa-container-${Date.now()}`);
    try {
      await mkdir(workDir, { recursive: true });

      const ruflo = tryExtract(this.reader, 'ruflo');
      if (!ruflo) return fail('RVFA appliance does not contain a "ruflo" section');
      await writeFile(join(workDir, 'ruflo-bundle.js'), ruflo);

      const data = tryExtract(this.reader, 'data');
      if (data) await writeFile(join(workDir, 'data.bin'), data);

      const envFlags: string[] = [];
      for (const [k, v] of Object.entries(this.header.boot.env)) envFlags.push('-e', `${k}=${v}`);
      envFlags.push('-e', `RVFA_RUN_MODE=${options.mode}`, '-e', `RVFA_PROFILE=${this.header.profile}`);

      const baseImage = this.header.platform === 'alpine' ? 'node:20-alpine' : 'node:20-slim';
      const cmdArgs = this.header.boot.args.map((a) => `, "${a}"`).join('');
      const dockerfile = [
        `FROM ${baseImage}`, 'WORKDIR /app', 'COPY ruflo-bundle.js .',
        data ? 'COPY data.bin .' : '', `CMD ["node", "ruflo-bundle.js"${cmdArgs}]`,
      ].filter(Boolean).join('\n');
      await writeFile(join(workDir, 'Dockerfile'), dockerfile);

      const imageName = `rvfa-${this.header.name}:${this.header.appVersion}`.toLowerCase();
      const build = await spawnAsync('docker', ['build', '-t', imageName, '.'], {
        cwd: workDir, verbose: options.verbose,
      });
      if (build.exitCode !== 0) {
        return { ...build, stderr: `Docker build failed:\n${build.stderr}` };
      }

      return spawnAsync('docker', ['run', '--rm', ...envFlags, imageName], { verbose: options.verbose });
    } finally {
      await cleanup(workDir);
    }
  }

  /**
   * Run the verification suite. Extracts the VERIFY section and
   * executes it; falls back to a basic integrity report.
   */
  async runVerify(options: RunOptions): Promise<RunResult> {
    const start = performance.now();
    const verifyPayload = tryExtract(this.reader, 'verify');

    if (!verifyPayload) {
      const { valid, errors } = this.reader.verify();
      const lines = [
        `Appliance: ${this.header.name} v${this.header.appVersion}`,
        `Profile:   ${this.header.profile}`,
        `Sections:  ${this.header.sections.length}`,
        `Integrity: ${valid ? 'PASS' : 'FAIL'}`,
        ...errors.map((e) => `  FAIL: ${e}`),
        errors.length === 0 ? '  All checks PASS' : '',
      ];
      return {
        exitCode: valid ? 0 : 1,
        stdout: lines.filter(Boolean).join('\n'), stderr: '',
        duration: performance.now() - start,
      };
    }

    const workDir = join(tmpdir(), `rvfa-verify-${Date.now()}`);
    try {
      await mkdir(workDir, { recursive: true });
      await writeFile(join(workDir, 'verify.js'), verifyPayload);
      return spawnAsync('node', [join(workDir, 'verify.js')], {
        cwd: workDir, verbose: options.verbose,
        env: { RVFA_APPLIANCE_NAME: this.header.name, RVFA_APPLIANCE_VERSION: this.header.appVersion },
      });
    } finally {
      await cleanup(workDir);
    }
  }

  /** Return appliance metadata without booting. */
  getInfo(): {
    header: RvfaHeader;
    sections: { id: string; size: number; originalSize: number }[];
    totalSize: number;
  } {
    const sections = this.reader.getSections();
    const totalSize = sections.reduce((sum, s) => sum + s.size, 0);
    return {
      header: { ...this.header },
      sections: sections.map((s) => ({ id: s.id, size: s.size, originalSize: s.originalSize })),
      totalSize,
    };
  }

  // ── Private ───────────────────────────────────────────────

  /**
   * Decrypt an API-key vault (AES-256-GCM).
   * Layout: [16-byte IV][ciphertext][16-byte auth-tag]
   * Key derived via PBKDF2 with salt = "rvfa-vault-{name}".
   */
  private async decryptVault(payload: Buffer, passphrase: string): Promise<Record<string, string> | null> {
    try {
      const { createDecipheriv, pbkdf2Sync } = await import('node:crypto');
      if (payload.length < 33) return null;

      const iv = payload.subarray(0, 16);
      const tag = payload.subarray(payload.length - 16);
      const ciphertext = payload.subarray(16, payload.length - 16);
      const key = pbkdf2Sync(passphrase, Buffer.from(`rvfa-vault-${this.header.name}`), 100_000, 32, 'sha256');

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(dec.toString('utf-8'));
    } catch {
      return null;
    }
  }
}
