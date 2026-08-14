/**
 * Integration test for ADR-096 Phase 2: session-tools wired to vault.
 *
 * Exercises the full save → on-disk → load round-trip across both modes
 * (plaintext + encrypted) AND the migration path (legacy plaintext file
 * still readable after the encryption gate flips on).
 *
 * The vault primitives themselves are unit-tested in encryption-vault.test.ts.
 * This file pins the contract that session-tools honors the env-var gate
 * AND that the magic-byte format is what actually lands on disk.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { sessionTools } from '../src/mcp-tools/session-tools.js';
import { MAGIC, isEncryptedBlob } from '../src/encryption/vault.js';

// Per-test working directory so the in-process getProjectCwd() points at
// a clean tree. session-tools uses process.cwd() (via getProjectCwd) for
// the sessions dir.
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

const sessionSaveTool = sessionTools.find(t => t.name === 'session_save')!;
const sessionRestoreTool = sessionTools.find(t => t.name === 'session_restore')!;
const sessionListTool = sessionTools.find(t => t.name === 'session_list')!;

function pickSessionFile(workdir: string): string {
  const dir = join(workdir, '.claude-flow', 'sessions');
  // Find the lone JSON file the save tool produces (filename is
  // `session-<ts>-<rand>.json`).
  const fs = readFileSync; void fs; // (silence unused-import linters)
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  expect(files.length).toBe(1);
  return join(dir, files[0]);
}

async function runSave(name: string) {
  return sessionSaveTool.handler({ name } as Record<string, unknown>);
}
async function runRestore(sessionId: string) {
  return sessionRestoreTool.handler({ sessionId } as Record<string, unknown>);
}

describe('session-tools encryption-at-rest (ADR-096 Phase 2)', () => {
  let workdir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    saveEnv('CLAUDE_FLOW_ENCRYPT_AT_REST', 'CLAUDE_FLOW_ENCRYPTION_KEY');
    workdir = mkdtempSync(join(tmpdir(), 'session-enc-'));
    // Pin process.cwd() so session-tools writes into our temp dir
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
      const r = (await runSave('audit-test')) as { sessionId: string };
      const onDisk = readFileSync(pickSessionFile(workdir));
      // First byte is "{" not "R" — definitely not encrypted
      expect(onDisk[0]).toBe(0x7b);
      expect(isEncryptedBlob(onDisk)).toBe(false);
      // Sanity: the JSON parses and the sessionId round-trips
      const parsed = JSON.parse(onDisk.toString('utf-8'));
      expect(parsed.sessionId).toBe(r.sessionId);
      expect(parsed.name).toBe('audit-test');
    });

    it('round-trips save → restore', async () => {
      const saved = (await runSave('rt-plain')) as { sessionId: string };
      const restored = (await runRestore(saved.sessionId)) as {
        restored?: boolean;
        name?: string;
      };
      expect(restored.restored).toBe(true);
      expect(restored.name).toBe('rt-plain');
    });
  });

  describe('encryption enabled (RFE1 wire format)', () => {
    beforeEach(() => {
      process.env.CLAUDE_FLOW_ENCRYPT_AT_REST = '1';
      process.env.CLAUDE_FLOW_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    });

    it('writes a blob that starts with the RFE1 magic', async () => {
      await runSave('encrypted-test');
      const onDisk = readFileSync(pickSessionFile(workdir));
      expect(onDisk.subarray(0, 4)).toEqual(MAGIC);
      expect(isEncryptedBlob(onDisk)).toBe(true);
    });

    it('produces a blob that does not contain the plaintext name', async () => {
      // Defense-in-depth check: the plaintext name shouldn't appear
      // anywhere in the on-disk bytes if encryption actually ran.
      const secretName = `top-secret-${randomBytes(8).toString('hex')}`;
      await runSave(secretName);
      const onDisk = readFileSync(pickSessionFile(workdir));
      expect(onDisk.includes(Buffer.from(secretName, 'utf-8'))).toBe(false);
    });

    it('round-trips save → restore using the same key', async () => {
      const saved = (await runSave('rt-encrypted')) as { sessionId: string };
      const restored = (await runRestore(saved.sessionId)) as {
        restored?: boolean;
        name?: string;
      };
      expect(restored.restored).toBe(true);
      expect(restored.name).toBe('rt-encrypted');
    });
  });

  describe('migration: encrypt-on-write only, plaintext stays readable', () => {
    it('reads a legacy plaintext file even after encryption is enabled', async () => {
      // Step 1: save with encryption OFF → plaintext on disk
      delete process.env.CLAUDE_FLOW_ENCRYPT_AT_REST;
      delete process.env.CLAUDE_FLOW_ENCRYPTION_KEY;
      const saved = (await runSave('legacy-plain')) as { sessionId: string };

      // Step 2: turn encryption ON for the read
      process.env.CLAUDE_FLOW_ENCRYPT_AT_REST = '1';
      process.env.CLAUDE_FLOW_ENCRYPTION_KEY = randomBytes(32).toString('hex');

      // Step 3: restore should still find the plaintext file via the
      // magic-byte sniff (legacy file → not encrypted → returned as-is)
      const restored = (await runRestore(saved.sessionId)) as {
        restored?: boolean;
        name?: string;
      };
      expect(restored.restored).toBe(true);
      expect(restored.name).toBe('legacy-plain');
    });
  });

  describe('listSessions handles a mixed dir', () => {
    it('enumerates plaintext + encrypted sessions in one call', async () => {
      // First session: plaintext
      delete process.env.CLAUDE_FLOW_ENCRYPT_AT_REST;
      delete process.env.CLAUDE_FLOW_ENCRYPTION_KEY;
      await runSave('plain-1');

      // Second session: encrypted
      process.env.CLAUDE_FLOW_ENCRYPT_AT_REST = '1';
      process.env.CLAUDE_FLOW_ENCRYPTION_KEY = randomBytes(32).toString('hex');
      await runSave('encrypted-1');

      const result = (await sessionListTool.handler({} as Record<string, unknown>)) as {
        sessions: Array<{ name?: string }>;
      };
      const names = result.sessions.map(s => s.name).filter(Boolean).sort();
      expect(names).toEqual(['encrypted-1', 'plain-1']);
    });
  });
});
