/**
 * Regression test for audit_1776853149979: session/memory/terminal stores
 * were written with the process umask — typically 0644, world-readable —
 * even though they contain conversation snapshots, agent prompts, embeddings,
 * and pasted shell command history that may include credentials. fs-secure's
 * helpers force mode 0600 (files) / 0700 (dirs). These tests pin that
 * contract.
 *
 * The mode-bit assertions are skipped on Windows, where chmod is a no-op
 * and POSIX permission bits don't apply.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { mkdirRestricted, writeFileRestricted } from '../src/fs-secure.js';

const isPosix = process.platform !== 'win32';
const itPosix = isPosix ? it : it.skip;

describe('fs-secure (audit_1776853149979)', () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'fs-secure-test-'));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  describe('writeFileRestricted', () => {
    it('writes string content correctly', () => {
      const path = join(workdir, 'session.json');
      writeFileRestricted(path, '{"hello":"world"}');
      expect(readFileSync(path, 'utf-8')).toBe('{"hello":"world"}');
    });

    it('writes Buffer content correctly (sql.js DB shape)', () => {
      const path = join(workdir, 'memory.db');
      const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      writeFileRestricted(path, buf);
      expect(readFileSync(path)).toEqual(buf);
    });

    itPosix('sets mode 0600 (owner read/write only)', () => {
      const path = join(workdir, 'session.json');
      writeFileRestricted(path, '{}');
      // Mask the type bits (S_IFMT) and check just the permission bits
      const mode = statSync(path).mode & 0o777;
      expect(mode).toBe(0o600);
    });

    itPosix('overwrite preserves restricted mode', () => {
      const path = join(workdir, 'session.json');
      writeFileRestricted(path, '{"v":1}');
      writeFileRestricted(path, '{"v":2}');
      const mode = statSync(path).mode & 0o777;
      expect(mode).toBe(0o600);
      expect(readFileSync(path, 'utf-8')).toBe('{"v":2}');
    });
  });

  describe('mkdirRestricted', () => {
    it('creates a missing directory', () => {
      const dir = join(workdir, 'sessions');
      mkdirRestricted(dir);
      expect(statSync(dir).isDirectory()).toBe(true);
    });

    it('creates nested missing directories (recursive)', () => {
      const dir = join(workdir, 'a', 'b', 'c');
      mkdirRestricted(dir);
      expect(statSync(dir).isDirectory()).toBe(true);
    });

    it('is idempotent on an existing directory', () => {
      const dir = join(workdir, 'sessions');
      mkdirRestricted(dir);
      // Second call must not throw
      expect(() => mkdirRestricted(dir)).not.toThrow();
    });

    itPosix('sets mode 0700 (owner only)', () => {
      const dir = join(workdir, 'sessions');
      mkdirRestricted(dir);
      const mode = statSync(dir).mode & 0o777;
      expect(mode).toBe(0o700);
    });
  });
});
