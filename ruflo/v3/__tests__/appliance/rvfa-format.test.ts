/**
 * RVFA binary format tests.
 *
 * Uses the Node.js built-in test runner (node:test).
 * Run: npx tsx --test v3/__tests__/appliance/rvfa-format.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  RvfaWriter,
  RvfaReader,
  createDefaultHeader,
  formatSize,
  validateHeader,
  RVFA_MAGIC,
  RVFA_VERSION,
} from '../../@claude-flow/cli/src/appliance/rvfa-format.js';

// -- Helpers ------------------------------------------------------------------

function makeWriter(profile: 'cloud' | 'hybrid' | 'offline' = 'cloud') {
  const header = createDefaultHeader(profile);
  return new RvfaWriter({ ...header, name: 'test-appliance' });
}

function addTestSections(writer: RvfaWriter): void {
  writer.addSection('kernel', Buffer.from('kernel-payload'), { compression: 'none' });
  writer.addSection('runtime', Buffer.from('runtime-payload'), { compression: 'gzip' });
  writer.addSection('ruflo', Buffer.from('ruflo-payload'), { compression: 'none' });
}

// -- 1. Format constants ------------------------------------------------------

describe('Format constants', () => {
  it('RVFA_MAGIC is the 4-byte ASCII string "RVFA"', () => {
    assert.equal(RVFA_MAGIC.toString('ascii'), 'RVFA');
    assert.equal(RVFA_MAGIC.length, 4);
  });

  it('RVFA_VERSION is 1', () => {
    assert.equal(RVFA_VERSION, 1);
  });
});

// -- 2. createDefaultHeader ---------------------------------------------------

describe('createDefaultHeader', () => {
  for (const profile of ['cloud', 'hybrid', 'offline'] as const) {
    it(`returns a valid header for "${profile}" profile`, () => {
      const header = createDefaultHeader(profile);
      assert.equal(header.profile, profile);
      assert.equal(header.magic, 'RVFA');
      assert.equal(header.version, RVFA_VERSION);
      assert.ok(Array.isArray(header.sections));
      assert.ok(Array.isArray(header.capabilities));
      assert.equal(typeof header.boot.entrypoint, 'string');
      assert.ok(validateHeader(header));
    });
  }

  it('cloud profile does not include ruvllm capability', () => {
    assert.ok(!createDefaultHeader('cloud').capabilities.includes('ruvllm'));
  });

  it('offline profile includes ruvllm capability', () => {
    assert.ok(createDefaultHeader('offline').capabilities.includes('ruvllm'));
  });
});

// -- 3. validateHeader --------------------------------------------------------

describe('validateHeader', () => {
  it('accepts a well-formed header', () => {
    assert.ok(validateHeader(createDefaultHeader('cloud')));
  });

  it('rejects null, non-object, and primitives', () => {
    assert.equal(validateHeader(null), false);
    assert.equal(validateHeader('string'), false);
    assert.equal(validateHeader(42), false);
  });

  it('rejects header with missing or wrong magic', () => {
    const h1 = createDefaultHeader('cloud') as Record<string, unknown>;
    delete h1.magic;
    assert.equal(validateHeader(h1), false);

    const h2 = createDefaultHeader('cloud') as Record<string, unknown>;
    h2.magic = 'NOPE';
    assert.equal(validateHeader(h2), false);
  });

  it('rejects header with wrong version type', () => {
    const h = createDefaultHeader('cloud') as Record<string, unknown>;
    h.version = 'not-a-number';
    assert.equal(validateHeader(h), false);
  });

  it('rejects header with invalid profile', () => {
    const h = createDefaultHeader('cloud') as Record<string, unknown>;
    h.profile = 'invalid';
    assert.equal(validateHeader(h), false);
  });

  it('rejects header with invalid boot.isolation', () => {
    const h = createDefaultHeader('cloud');
    (h.boot as Record<string, unknown>).isolation = 'bad';
    assert.equal(validateHeader(h), false);
  });

  it('rejects header with invalid models.provider', () => {
    const h = createDefaultHeader('cloud');
    (h.models as Record<string, unknown>).provider = 'bad';
    assert.equal(validateHeader(h), false);
  });
});

// -- 4. formatSize ------------------------------------------------------------

describe('formatSize', () => {
  it('formats 0 bytes', () => assert.equal(formatSize(0), '0 B'));
  it('formats bytes below 1 KB', () => assert.equal(formatSize(512), '512 B'));
  it('formats kilobytes', () => assert.equal(formatSize(1536), '1.5 KB'));
  it('formats megabytes', () => assert.equal(formatSize(2.3 * 1024 * 1024), '2.3 MB'));
  it('formats gigabytes', () => assert.equal(formatSize(4.1 * 1024 * 1024 * 1024), '4.1 GB'));
  it('formats negative bytes as 0 B', () => assert.equal(formatSize(-100), '0 B'));
});

// -- 5. RvfaWriter ------------------------------------------------------------

describe('RvfaWriter', () => {
  it('creates a binary starting with RVFA magic bytes', () => {
    const writer = makeWriter();
    addTestSections(writer);
    const buf = writer.build();
    assert.equal(buf.subarray(0, 4).toString('ascii'), 'RVFA');
  });

  it('writes the correct version number', () => {
    const writer = makeWriter();
    addTestSections(writer);
    assert.equal(writer.build().readUInt32LE(4), RVFA_VERSION);
  });

  it('adds sections with correct SHA256', () => {
    const writer = makeWriter();
    const payload = Buffer.from('test-data-for-sha256-check');
    writer.addSection('kernel', payload, { compression: 'none' });
    const buf = writer.build();

    const reader = RvfaReader.fromBuffer(buf);
    const sections = reader.getSections();
    const stored = buf.subarray(sections[0].offset, sections[0].offset + sections[0].size);
    const expected = createHash('sha256').update(stored).digest('hex');
    assert.equal(sections[0].sha256, expected);
  });

  it('compresses sections with gzip when requested', () => {
    const writer = makeWriter();
    const payload = Buffer.alloc(1024, 0x42);
    writer.addSection('kernel', payload, { compression: 'gzip' });
    const buf = writer.build();

    const reader = RvfaReader.fromBuffer(buf);
    const sections = reader.getSections();
    assert.equal(sections[0].compression, 'gzip');
    assert.ok(sections[0].size < payload.length);
  });

  it('computes a valid footer hash', () => {
    const writer = makeWriter();
    addTestSections(writer);
    const reader = RvfaReader.fromBuffer(writer.build());
    const result = reader.verify();
    assert.ok(result.valid, `Footer hash invalid: ${result.errors.join(', ')}`);
  });

  it('produces valid header JSON', () => {
    const writer = makeWriter();
    addTestSections(writer);
    const buf = writer.build();
    const headerLen = buf.readUInt32LE(8);
    const headerJson = buf.subarray(12, 12 + headerLen).toString('utf-8');
    assert.doesNotThrow(() => JSON.parse(headerJson));
  });

  it('section offsets are correct and non-overlapping', () => {
    const writer = makeWriter();
    writer.addSection('kernel', Buffer.from('aaa'), { compression: 'none' });
    writer.addSection('runtime', Buffer.from('bbbbb'), { compression: 'none' });
    writer.addSection('ruflo', Buffer.from('ccccccc'), { compression: 'none' });

    const reader = RvfaReader.fromBuffer(writer.build());
    const sections = reader.getSections();
    for (let i = 1; i < sections.length; i++) {
      const prev = sections[i - 1];
      const curr = sections[i];
      assert.ok(
        prev.offset + prev.size <= curr.offset,
        `${prev.id} overlaps ${curr.id}`,
      );
    }
  });
});

// -- 6. RvfaReader ------------------------------------------------------------

describe('RvfaReader', () => {
  let validBuf: Buffer;

  beforeEach(() => {
    const writer = makeWriter();
    addTestSections(writer);
    validBuf = writer.build();
  });

  it('reads back what RvfaWriter wrote (round-trip)', () => {
    const reader = RvfaReader.fromBuffer(validBuf);
    const header = reader.getHeader();
    assert.equal(header.name, 'test-appliance');
    assert.equal(header.profile, 'cloud');
    assert.equal(header.sections.length, 3);
  });

  it('extracts uncompressed sections correctly', () => {
    const data = RvfaReader.fromBuffer(validBuf).extractSection('kernel');
    assert.equal(data.toString('utf-8'), 'kernel-payload');
  });

  it('extracts gzip-compressed sections correctly', () => {
    const data = RvfaReader.fromBuffer(validBuf).extractSection('runtime');
    assert.equal(data.toString('utf-8'), 'runtime-payload');
  });

  it('verify() passes for a valid file', () => {
    const result = RvfaReader.fromBuffer(validBuf).verify();
    assert.ok(result.valid);
    assert.equal(result.errors.length, 0);
  });

  it('verify() fails for tampered magic bytes', () => {
    const tampered = Buffer.from(validBuf);
    tampered[0] = 0x00;
    assert.throws(() => RvfaReader.fromBuffer(tampered), /Invalid RVFA magic/);
  });

  it('verify() fails for tampered section data', () => {
    const tampered = Buffer.from(validBuf);
    const sections = RvfaReader.fromBuffer(validBuf).getSections();
    tampered[sections[0].offset + 1] ^= 0xff;
    const result = RvfaReader.fromBuffer(tampered).verify();
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes('SHA256 mismatch')));
  });

  it('verify() fails for tampered footer hash', () => {
    const tampered = Buffer.from(validBuf);
    tampered[tampered.length - 1] ^= 0xff;
    const result = RvfaReader.fromBuffer(tampered).verify();
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes('Footer SHA256 mismatch')));
  });

  it('rejects files with wrong magic bytes', () => {
    const bad = Buffer.alloc(100);
    bad.write('NOPE', 0, 'ascii');
    assert.throws(() => RvfaReader.fromBuffer(bad), /Invalid RVFA magic/);
  });

  it('rejects files with header too large (>1MB)', () => {
    const buf = Buffer.alloc(20);
    buf.write('RVFA', 0, 'ascii');
    buf.writeUInt32LE(RVFA_VERSION, 4);
    buf.writeUInt32LE(2 * 1024 * 1024, 8);
    assert.throws(() => RvfaReader.fromBuffer(buf), /exceeds maximum size/);
  });

  it('handles empty sections', () => {
    const writer = makeWriter();
    writer.addSection('kernel', Buffer.alloc(0), { compression: 'none' });
    const data = RvfaReader.fromBuffer(writer.build()).extractSection('kernel');
    assert.equal(data.length, 0);
  });

  it('handles multiple sections', () => {
    const writer = makeWriter();
    writer.addSection('kernel', Buffer.from('k'), { compression: 'none' });
    writer.addSection('runtime', Buffer.from('r'), { compression: 'none' });
    writer.addSection('ruflo', Buffer.from('f'), { compression: 'none' });
    writer.addSection('models', Buffer.from('m'), { compression: 'none' });
    writer.addSection('data', Buffer.from('d'), { compression: 'none' });
    writer.addSection('verify', Buffer.from('v'), { compression: 'none' });
    const reader = RvfaReader.fromBuffer(writer.build());
    assert.equal(reader.getSections().length, 6);
    assert.equal(reader.extractSection('kernel').toString(), 'k');
    assert.equal(reader.extractSection('verify').toString(), 'v');
  });

  it('throws when extracting a nonexistent section', () => {
    assert.throws(
      () => RvfaReader.fromBuffer(validBuf).extractSection('nonexistent'),
      /not found/,
    );
  });
});

// -- 7. Security --------------------------------------------------------------

describe('Security', () => {
  it('rejects negative section offsets', () => {
    const writer = makeWriter();
    writer.addSection('kernel', Buffer.from('data'), { compression: 'none' });
    const buf = writer.build();

    const headerLen = buf.readUInt32LE(8);
    const header = JSON.parse(buf.subarray(12, 12 + headerLen).toString('utf-8'));
    header.sections[0].offset = -100;
    const corruptedHeader = Buffer.from(JSON.stringify(header), 'utf-8');

    const corrupted = Buffer.concat([
      buf.subarray(0, 4),
      buf.subarray(4, 8),
      Buffer.alloc(4),
      corruptedHeader,
      buf.subarray(12 + headerLen),
    ]);
    corrupted.writeUInt32LE(corruptedHeader.length, 8);

    assert.throws(() => RvfaReader.fromBuffer(corrupted), /negative/i);
  });

  it('rejects overlapping sections', () => {
    const writer = makeWriter();
    writer.addSection('kernel', Buffer.from('aaaa'), { compression: 'none' });
    writer.addSection('runtime', Buffer.from('bbbb'), { compression: 'none' });
    const buf = writer.build();

    const headerLen = buf.readUInt32LE(8);
    const header = JSON.parse(buf.subarray(12, 12 + headerLen).toString('utf-8'));
    header.sections[1].offset = header.sections[0].offset + 1;
    const corruptedHeader = Buffer.from(JSON.stringify(header), 'utf-8');

    const corrupted = Buffer.concat([
      buf.subarray(0, 4),
      buf.subarray(4, 8),
      Buffer.alloc(4),
      corruptedHeader,
      buf.subarray(12 + headerLen),
    ]);
    corrupted.writeUInt32LE(corruptedHeader.length, 8);

    assert.throws(() => RvfaReader.fromBuffer(corrupted), /overlap/i);
  });

  it('rejects header larger than 1MB', () => {
    const buf = Buffer.alloc(20);
    buf.write('RVFA', 0, 'ascii');
    buf.writeUInt32LE(RVFA_VERSION, 4);
    buf.writeUInt32LE(1_048_577, 8);
    assert.throws(() => RvfaReader.fromBuffer(buf), /exceeds maximum size/);
  });

  it('rejects buffer too small for preamble', () => {
    const buf = Buffer.alloc(8);
    buf.write('RVFA', 0, 'ascii');
    assert.throws(() => RvfaReader.fromBuffer(buf), /too small/);
  });

  it('rejects file paths with null bytes', async () => {
    await assert.rejects(
      () => RvfaReader.fromFile('/tmp/test\0exploit.rvfa'),
      /null bytes/,
    );
  });
});
