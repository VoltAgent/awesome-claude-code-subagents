/**
 * Integration test for ADR-096 Phase 3: terminal-tools wired to vault.
 *
 * Mirrors session-encryption.test.ts structure: full save → on-disk →
 * load round-trip across plaintext + encrypted modes plus the migration
 * path (legacy plaintext readable after the gate flips on).
 *
 * Terminal stores are higher-stakes than session JSON because the command
 * history routinely contains pasted shell commands with credentials —
 * the on-disk-doesn't-leak-the-secret assertion is therefore stricter
 * than the equivalent session test (we plant a known credential string
 * and assert it never appears in the encrypted bytes).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { terminalTools } from '../src/mcp-tools/terminal-tools.js';
import { MAGIC, isEncryptedBlob } from '../src/encryption/vault.js';

const SAVED_ENV: Record<string, string | undefined> = {};
function saveEnv(...names: string[]) {
  for (const n of names) SAVED_ENV[n] = process.env[n];
}
function restoreEnv() {
  for (const [n, v] of Object.entries(SAVED_ENV)) {
    if (v === undefined) delete process.env[n];
    else process.env[n] = v;
  }
}

const terminalCreateTool = terminalTools.find(t => t.name === 'terminal_create')!;
const terminalListTool = terminalTools.find(t => t.name === 'terminal_list')!;

function getStoreFile(workdir: string): string {
  return join(workdir, '.claude-flow', 'terminals', 'store.json');
}

async function runCreate(name: string) {
  return terminalCreateTool.handler({ name } as Record<string, unknown>);
}

describe('terminal-tools encryption-at-rest (ADR-096 Phase 3)', () => {
  let workdir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    saveEnv('CLAUDE_FLOW_ENCRYPT_AT_REST', 'CLAUDE_FLOW_ENCRYPTION_KEY');
    workdir = mkdtempSync(join(tmpdir(), 'term-enc-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workdir);
  });

  afterEach(() => {
    cwdSpy?.mockRestore();
    rmSync(workdir, { recursive: true, force: true });
    restoreEnv();
  });

  describe('encryption disabled (legacy plaintext)', () => {
    beforeEach(() => {
      delete process.env.CLAUDE_FLOW_ENCRYPT_AT_REST;
      delete process.env.CLAUDE_FLOW_ENCRYPTION_KEY;
    });

    it('writes plaintext JSON to disk', async () => {
      await runCreate('legacy-term');
      const onDisk = readFileSync(getStoreFile(workdir));
      // First byte is "{" not "R" — plaintext JSON
      expect(onDisk[0]).toBe(0x7b);
      expect(isEncryptedBlob(onDisk)).toBe(false);
      const parsed = JSON.parse(onDisk.toString('utf-8')) as {
        sessions: Record<string, { name: string }>;
      };
      const names = Object.values(parsed.sessions).map(s => s.name);
      expect(names).toContain('legacy-term');
    });

    it('round-trips create → list', async () => {
      await runCreate('rt-plain');
      const result = (await terminalListTool.handler({} as Record<string, unknown>)) as {
        sessions?: Array<{ name?: string }>;
      };
      const names = (result.sessions ?? []).map(s => s?.name).filter(Boolean);
      expect(names).toContain('rt-plain');
    });
  });

  describe('encryption enabled (RFE1 wire format)', () => {
    beforeEach(() => {
      process.env.CLAUDE_FLOW_ENCRYPT_AT_REST = '1';
      process.env.CLAUDE_FLOW_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    });

    it('writes a blob that starts with the RFE1 magic', async () => {
      await runCreate('encrypted-term');
      const onDisk = readFileSync(getStoreFile(workdir));
      expect(onDisk.subarray(0, 4)).toEqual(MAGIC);
      expect(isEncryptedBlob(onDisk)).toBe(true);
    });

    it('does not leak the plaintext name into the on-disk bytes', async () => {
      // Defense-in-depth: terminal stores carry pasted credentials in the
      // history field. If encryption ran, NO part of the plaintext should
      // appear in the on-disk file.
      const secretName = `creds-${randomBytes(8).toString('hex')}`;
      await runCreate(secretName);
      const onDisk = readFileSync(getStoreFile(workdir));
      expect(onDisk.includes(Buffer.from(secretName, 'utf-8'))).toBe(false);
    });

    it('round-trips create → list using the same key', async () => {
      await runCreate('rt-enc');
      const result = (await terminalListTool.handler({} as Record<string, unknown>)) as {
        sessions?: Array<{ name?: string }>;
      };
      const names = (result.sessions ?? []).map(s => s?.name).filter(Boolean);
      expect(names).toContain('rt-enc');
    });
  });

  describe('migration: legacy plaintext readable after gate flips on', () => {
    it('reads a legacy plaintext store after encryption is enabled', async () => {
      // Step 1: write plaintext (gate off)
      delete process.env.CLAUDE_FLOW_ENCRYPT_AT_REST;
      delete process.env.CLAUDE_FLOW_ENCRYPTION_KEY;
      await runCreate('legacy-readable');

      // Step 2: flip encryption on for the read
      process.env.CLAUDE_FLOW_ENCRYPT_AT_REST = '1';
      process.env.CLAUDE_FLOW_ENCRYPTION_KEY = randomBytes(32).toString('hex');

      // Step 3: list should still find the legacy session via the
      // magic-byte sniff (legacy file → not encrypted → returned as-is)
      const result = (await terminalListTool.handler({} as Record<string, unknown>)) as {
        sessions?: Array<{ name?: string }>;
      };
      const names = (result.sessions ?? []).map(s => s?.name).filter(Boolean);
      expect(names).toContain('legacy-readable');
    });
  });

  describe('mixed: same store, plaintext write then encrypted overwrite', () => {
    it('rewrites the file as encrypted on the next write after gate flips on', async () => {
      // Step 1: legacy plaintext write
      delete process.env.CLAUDE_FLOW_ENCRYPT_AT_REST;
      delete process.env.CLAUDE_FLOW_ENCRYPTION_KEY;
      await runCreate('plain-first');
      expect(isEncryptedBlob(readFileSync(getStoreFile(workdir)))).toBe(false);

      // Step 2: enable encryption and add a second session — saveTerminalStore
      // rewrites the WHOLE file, so the result is encrypted bytes that
      // contain both sessions.
      process.env.CLAUDE_FLOW_ENCRYPT_AT_REST = '1';
      process.env.CLAUDE_FLOW_ENCRYPTION_KEY = randomBytes(32).toString('hex');
      await runCreate('encrypted-second');

      const onDisk = readFileSync(getStoreFile(workdir));
      expect(isEncryptedBlob(onDisk)).toBe(true);

      // Both sessions still visible via list (decrypts on read)
      const result = (await terminalListTool.handler({} as Record<string, unknown>)) as {
        sessions?: Array<{ name?: string }>;
      };
      const names = (result.sessions ?? []).map(s => s?.name).filter(Boolean);
      expect(names).toContain('plain-first');
      expect(names).toContain('encrypted-second');
    });
  });
});
