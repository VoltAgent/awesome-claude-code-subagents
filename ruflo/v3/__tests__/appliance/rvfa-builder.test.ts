/**
 * RVFA Builder pipeline tests.
 *
 * Uses the Node.js built-in test runner (node:test).
 * Run: npx tsx --test v3/__tests__/appliance/rvfa-builder.test.ts
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  RvfaBuilder,
  encryptApiKeys,
  decryptApiKeys,
} from '../../@claude-flow/cli/src/appliance/rvfa-builder.js';
import { RvfaReader } from '../../@claude-flow/cli/src/appliance/rvfa-format.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXPECTED_SECTION_IDS = ['kernel', 'runtime', 'ruflo', 'models', 'data', 'verify'];

/** Paths to clean up after each test. */
const cleanupPaths: string[] = [];

function tmpPath(suffix: string): string {
  const p = join(tmpdir(), `rvfa-test-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`);
  cleanupPaths.push(p);
  return p;
}

function writeEnvFile(content: string): string {
  const p = tmpPath('.env');
  writeFileSync(p, content, 'utf-8');
  return p;
}

function makeBuilder(profile: 'cloud' | 'hybrid' | 'offline' = 'cloud'): RvfaBuilder {
  return new RvfaBuilder({
    profile,
    arch: 'x86_64',
    output: tmpPath('.rvfa'),
    verbose: false,
  });
}

afterEach(() => {
  for (const p of cleanupPaths) {
    try { unlinkSync(p); } catch { /* ignore */ }
  }
  cleanupPaths.length = 0;
});

// ---------------------------------------------------------------------------
// Builder tests
// ---------------------------------------------------------------------------

describe('RvfaBuilder', () => {
  it('creates a valid RVFA for cloud profile', async () => {
    const builder = makeBuilder('cloud');
    const result = await builder.build();
    assert.ok(result.size > 0);
    assert.equal(result.profile, 'cloud');
    assert.ok(existsSync(result.outputPath));
  });

  it('creates a valid RVFA for hybrid profile', async () => {
    const builder = makeBuilder('hybrid');
    const result = await builder.build();
    assert.equal(result.profile, 'hybrid');
    assert.ok(result.size > 0);
  });

  it('creates a valid RVFA for offline profile', async () => {
    const builder = makeBuilder('offline');
    const result = await builder.build();
    assert.equal(result.profile, 'offline');
    assert.ok(result.size > 0);
  });

  it('output file is readable by RvfaReader', async () => {
    const builder = makeBuilder('cloud');
    const result = await builder.build();
    const buf = readFileSync(result.outputPath);
    const reader = RvfaReader.fromBuffer(buf);
    const header = reader.getHeader();
    assert.equal(header.magic, 'RVFA');
    assert.equal(header.profile, 'cloud');
  });

  it('all expected sections present in result', async () => {
    const builder = makeBuilder('cloud');
    const result = await builder.build();
    const sectionIds = result.sections.map((s) => s.id);
    for (const expected of EXPECTED_SECTION_IDS) {
      assert.ok(sectionIds.includes(expected), `Missing section: ${expected}`);
    }
  });

  it('section checksums validate', async () => {
    const builder = makeBuilder('cloud');
    const result = await builder.build();
    const buf = readFileSync(result.outputPath);
    const reader = RvfaReader.fromBuffer(buf);
    const verification = reader.verify();
    assert.ok(verification.valid, `Checksum errors: ${verification.errors.join(', ')}`);
  });

  it('duration is tracked', async () => {
    const builder = makeBuilder('cloud');
    const result = await builder.build();
    assert.equal(typeof result.duration, 'number');
    assert.ok(result.duration >= 0);
  });

  it('each section has originalSize > 0', async () => {
    const builder = makeBuilder('cloud');
    const result = await builder.build();
    for (const sec of result.sections) {
      assert.ok(sec.originalSize > 0, `Section "${sec.id}" has zero originalSize`);
    }
  });
});

// ---------------------------------------------------------------------------
// Encryption tests
// ---------------------------------------------------------------------------

describe('encryptApiKeys / decryptApiKeys', () => {
  it('round-trips correctly', () => {
    const envPath = writeEnvFile('ANTHROPIC_API_KEY=sk-ant-xxx\nOPENAI_API_KEY=sk-yyy');
    const encrypted = encryptApiKeys(envPath, 'my-secret');
    const decrypted = decryptApiKeys(encrypted, 'my-secret');
    assert.equal(decrypted['ANTHROPIC_API_KEY'], 'sk-ant-xxx');
    assert.equal(decrypted['OPENAI_API_KEY'], 'sk-yyy');
  });

  it('decryption fails with wrong passphrase', () => {
    const envPath = writeEnvFile('API_KEY=secret123');
    const encrypted = encryptApiKeys(envPath, 'correct-pass');
    assert.throws(
      () => decryptApiKeys(encrypted, 'wrong-pass'),
      /Unsupported state|unable to authenticate|Invalid/i,
    );
  });

  it('handles empty .env', () => {
    const envPath = writeEnvFile('');
    const encrypted = encryptApiKeys(envPath, 'pass');
    const decrypted = decryptApiKeys(encrypted, 'pass');
    assert.deepEqual(decrypted, {});
  });

  it('handles multiline .env with comments and quoted values', () => {
    const envContent = [
      '# This is a comment',
      'KEY1=value1',
      'KEY2="quoted-value"',
      "KEY3='single-quoted'",
      '',
      'KEY4=multi=equals=signs',
    ].join('\n');

    const envPath = writeEnvFile(envContent);
    const encrypted = encryptApiKeys(envPath, 'pass123');
    const decrypted = decryptApiKeys(encrypted, 'pass123');
    assert.equal(decrypted['KEY1'], 'value1');
    assert.equal(decrypted['KEY2'], 'quoted-value');
    assert.equal(decrypted['KEY3'], 'single-quoted');
    assert.equal(decrypted['KEY4'], 'multi=equals=signs');
  });

  it('produces different ciphertext for same input (random salt/IV)', () => {
    const envPath = writeEnvFile('API_KEY=test');
    const enc1 = encryptApiKeys(envPath, 'pass');
    const enc2 = encryptApiKeys(envPath, 'pass');
    // Salt and IV are random, so ciphertext should differ
    assert.ok(!enc1.equals(enc2));
  });

  it('rejects truncated encrypted payload', () => {
    const envPath = writeEnvFile('API_KEY=secret');
    const encrypted = encryptApiKeys(envPath, 'pass');
    const truncated = encrypted.subarray(0, 10); // too short
    assert.throws(() => decryptApiKeys(truncated, 'pass'), /too short/i);
  });

  it('skips comment lines and empty lines', () => {
    const envContent = [
      '# comment',
      '',
      '  ',
      'REAL_KEY=real_value',
      '# another comment',
    ].join('\n');

    const envPath = writeEnvFile(envContent);
    const encrypted = encryptApiKeys(envPath, 'pass');
    const decrypted = decryptApiKeys(encrypted, 'pass');
    assert.equal(Object.keys(decrypted).length, 1);
    assert.equal(decrypted['REAL_KEY'], 'real_value');
  });
});
