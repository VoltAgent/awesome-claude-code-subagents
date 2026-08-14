/**
 * RVFA (RuVector Format Appliance) — Binary format reader/writer
 * for self-contained Ruflo appliances.
 *
 * Binary layout:
 *   [4B magic "RVFA"] [4B version u32LE] [4B header_len u32LE]
 *   [header_len B JSON header] [section data ...] [32B SHA256 footer]
 */

import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RVFA_MAGIC = Buffer.from('RVFA');
export const RVFA_VERSION = 1;

const MAGIC_SIZE = 4;
const VERSION_SIZE = 4;
const HEADER_LEN_SIZE = 4;
const PREAMBLE_SIZE = MAGIC_SIZE + VERSION_SIZE + HEADER_LEN_SIZE; // 12
const SHA256_SIZE = 32;
const MAX_HEADER_JSON_SIZE = 1024 * 1024; // 1 MB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RvfaHeader {
  magic: string;
  version: number;
  name: string;
  appVersion: string;
  arch: string;
  platform: string;
  profile: 'cloud' | 'hybrid' | 'offline';
  created: string;
  sections: RvfaSection[];
  boot: RvfaBootConfig;
  models: RvfaModelConfig;
  capabilities: string[];
}

export interface RvfaSection {
  id: string;
  type: string;
  offset: number;
  size: number;
  originalSize: number;
  sha256: string;
  compression: 'none' | 'gzip' | 'zstd';
}

export interface RvfaBootConfig {
  entrypoint: string;
  args: string[];
  env: Record<string, string>;
  isolation: 'container' | 'microvm' | 'native';
}

export interface RvfaModelConfig {
  provider: 'ruvllm' | 'api-vault' | 'hybrid';
  engine?: string;
  models?: string[];
  vaultEncryption?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function sha256Bytes(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

/** Format bytes into a human-readable string (e.g. '2.3 GB'). */
export function formatSize(bytes: number): string {
  if (bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return idx === 0 ? `${value} ${units[idx]}` : `${value.toFixed(1)} ${units[idx]}`;
}

/** Create a sensible default header for a given profile. */
export function createDefaultHeader(
  profile: 'cloud' | 'hybrid' | 'offline',
): RvfaHeader {
  const modelDefaults: Record<string, RvfaModelConfig> = {
    cloud: { provider: 'api-vault', vaultEncryption: 'aes-256-gcm' },
    hybrid: {
      provider: 'hybrid',
      engine: 'ruvllm-0.1.0',
      models: ['phi-3-mini-q4'],
      vaultEncryption: 'aes-256-gcm',
    },
    offline: {
      provider: 'ruvllm',
      engine: 'ruvllm-0.1.0',
      models: ['phi-3-mini-q4'],
    },
  };

  const capDefaults: Record<string, string[]> = {
    cloud: ['mcp', 'swarm', 'memory', 'hooks', 'neural', 'api-vault'],
    hybrid: ['mcp', 'swarm', 'memory', 'hooks', 'neural', 'ruvllm', 'api-vault'],
    offline: ['mcp', 'swarm', 'memory', 'hooks', 'neural', 'ruvllm'],
  };

  return {
    magic: 'RVFA',
    version: RVFA_VERSION,
    name: '',
    appVersion: '3.5.0',
    arch: 'x86_64',
    platform: 'linux',
    profile,
    created: new Date().toISOString(),
    sections: [],
    boot: {
      entrypoint: '/opt/ruflo/bin/ruflo',
      args: ['--appliance'],
      env: {},
      isolation: profile === 'cloud' ? 'container' : 'native',
    },
    models: modelDefaults[profile],
    capabilities: capDefaults[profile],
  };
}

/** Type-guard that validates an unknown value is a well-formed RvfaHeader. */
export function validateHeader(header: unknown): header is RvfaHeader {
  if (typeof header !== 'object' || header === null) return false;
  const h = header as Record<string, unknown>;
  const str = (v: unknown) => typeof v === 'string';
  const obj = (v: unknown) => typeof v === 'object' && v !== null;
  const oneOf = (v: unknown, vals: string[]) => vals.includes(v as string);

  if (h.magic !== 'RVFA' || typeof h.version !== 'number' || h.version < 1) return false;
  if (!str(h.name) || !str(h.appVersion) || !str(h.arch) || !str(h.platform)) return false;
  if (!oneOf(h.profile, ['cloud', 'hybrid', 'offline'])) return false;
  if (!str(h.created) || !Array.isArray(h.sections) || !Array.isArray(h.capabilities)) return false;

  if (!obj(h.boot)) return false;
  const boot = h.boot as Record<string, unknown>;
  if (!str(boot.entrypoint) || !Array.isArray(boot.args) || !obj(boot.env)) return false;
  if (!oneOf(boot.isolation, ['container', 'microvm', 'native'])) return false;

  if (!obj(h.models)) return false;
  if (!oneOf((h.models as Record<string, unknown>).provider, ['ruvllm', 'api-vault', 'hybrid'])) return false;

  for (const sec of h.sections as unknown[]) {
    if (!obj(sec)) return false;
    const s = sec as Record<string, unknown>;
    if (!str(s.id) || !str(s.type) || !str(s.sha256)) return false;
    if (typeof s.offset !== 'number' || typeof s.size !== 'number') return false;
    if (typeof s.originalSize !== 'number') return false;
    if (!oneOf(s.compression, ['none', 'gzip', 'zstd'])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// RvfaWriter
// ---------------------------------------------------------------------------
/** Internal staging type used by the writer before offsets are known. */
interface StagedSection {
  id: string; type: string; data: Buffer;
  originalSize: number; sha256: string; compression: 'none' | 'gzip' | 'zstd';
}

export class RvfaWriter {
  private header: RvfaHeader;
  private staged: StagedSection[] = [];

  constructor(partial: Partial<RvfaHeader>) {
    const profile = partial.profile ?? 'cloud';
    const defaults = createDefaultHeader(profile);
    this.header = { ...defaults, ...partial, sections: [] };
  }

  /**
   * Add a section to the appliance image.
   *
   * @param id      Section identifier (e.g. 'kernel', 'runtime', 'ruflo').
   * @param data    Raw (uncompressed) section payload.
   * @param options Optional compression and MIME type overrides.
   */
  addSection(
    id: string,
    data: Buffer,
    options?: { compression?: 'none' | 'gzip' | 'zstd'; type?: string },
  ): void {
    const compression = options?.compression ?? 'gzip';
    const mimeType = options?.type ?? 'application/octet-stream';

    let compressed: Buffer;
    let actualCompression: 'none' | 'gzip' | 'zstd' = compression;

    if (compression === 'gzip') {
      compressed = gzipSync(data);
    } else if (compression === 'zstd') {
      // zstd not available in core Node.js — fall back to gzip
      compressed = gzipSync(data);
      actualCompression = 'gzip';
    } else {
      compressed = data;
    }

    const hash = sha256(compressed);

    this.staged.push({
      id,
      type: mimeType,
      data: compressed,
      originalSize: data.length,
      sha256: hash,
      compression: actualCompression,
    });
  }

  /**
   * Assemble the final RVFA binary image.
   *
   * Layout:
   *   [4B magic] [4B version] [4B header_len]
   *   [header JSON bytes]
   *   [section 0 bytes] [section 1 bytes] ...
   *   [32B SHA256 of all section bytes combined]
   */
  build(): Buffer {
    // Build section descriptors with placeholder offsets
    const sectionDescriptors: RvfaSection[] = this.staged.map((s) => ({
      id: s.id,
      type: s.type,
      offset: 0,
      size: s.data.length,
      originalSize: s.originalSize,
      sha256: s.sha256,
      compression: s.compression,
    }));

    // Iteratively compute offsets: the header contains the offsets as JSON,
    // so changing offsets can change the header length. We converge quickly.
    this.header.sections = sectionDescriptors;
    let headerJson = Buffer.from(JSON.stringify(this.header), 'utf-8');
    let prevLen = -1;

    for (let attempt = 0; attempt < 5 && headerJson.length !== prevLen; attempt++) {
      prevLen = headerJson.length;
      const dataAreaStart = PREAMBLE_SIZE + headerJson.length;
      let cursor = dataAreaStart;
      for (let i = 0; i < this.staged.length; i++) {
        sectionDescriptors[i].offset = cursor;
        cursor += this.staged[i].data.length;
      }
      this.header.sections = sectionDescriptors;
      headerJson = Buffer.from(JSON.stringify(this.header), 'utf-8');
    }

    // Build preamble buffers
    const magicBuf = Buffer.from('RVFA');
    const versionBuf = Buffer.alloc(VERSION_SIZE);
    versionBuf.writeUInt32LE(RVFA_VERSION, 0);
    const headerLenBuf = Buffer.alloc(HEADER_LEN_SIZE);
    headerLenBuf.writeUInt32LE(headerJson.length, 0);

    // Concatenate section data
    const sectionBuffers = this.staged.map((s) => s.data);
    const allSectionData = Buffer.concat(sectionBuffers);

    // Footer: SHA256 of all section data combined
    const footer = sha256Bytes(allSectionData);

    return Buffer.concat([
      magicBuf,
      versionBuf,
      headerLenBuf,
      headerJson,
      allSectionData,
      footer,
    ]);
  }
}

// ---------------------------------------------------------------------------
// RvfaReader
// ---------------------------------------------------------------------------
export class RvfaReader {
  private buf: Buffer;
  private header: RvfaHeader;

  private constructor(buf: Buffer, header: RvfaHeader) {
    this.buf = buf;
    this.header = header;
  }

  /** Parse an RVFA image from an in-memory Buffer. */
  static fromBuffer(buf: Buffer): RvfaReader {
    if (buf.length < PREAMBLE_SIZE) {
      throw new Error('Buffer too small to contain RVFA preamble');
    }

    // Magic
    const magic = buf.subarray(0, MAGIC_SIZE).toString('ascii');
    if (magic !== 'RVFA') {
      throw new Error(`Invalid RVFA magic: expected "RVFA", got "${magic}"`);
    }

    // Version
    const version = buf.readUInt32LE(MAGIC_SIZE);
    if (version !== RVFA_VERSION) {
      throw new Error(
        `Unsupported RVFA version: ${version} (expected ${RVFA_VERSION})`,
      );
    }

    // Header length
    const headerLen = buf.readUInt32LE(MAGIC_SIZE + VERSION_SIZE);
    if (headerLen > MAX_HEADER_JSON_SIZE) {
      throw new Error(
        `Header JSON exceeds maximum size (${headerLen} > ${MAX_HEADER_JSON_SIZE})`,
      );
    }
    if (PREAMBLE_SIZE + headerLen > buf.length) {
      throw new Error('Buffer too small to contain declared header');
    }

    // Parse header JSON
    const headerSlice = buf.subarray(PREAMBLE_SIZE, PREAMBLE_SIZE + headerLen);
    let parsed: unknown;
    try {
      parsed = JSON.parse(headerSlice.toString('utf-8'));
    } catch {
      throw new Error('Failed to parse RVFA header JSON');
    }

    if (!validateHeader(parsed)) {
      throw new Error('RVFA header failed validation');
    }
    const header = parsed as RvfaHeader;

    // Bounds-check every section offset
    const totalSize = buf.length;
    for (const sec of header.sections) {
      if (sec.offset < 0 || sec.size < 0) {
        throw new Error(`Section "${sec.id}" has negative offset or size`);
      }
      if (sec.offset + sec.size > totalSize - SHA256_SIZE) {
        throw new Error(
          `Section "${sec.id}" extends beyond buffer ` +
            `(offset=${sec.offset}, size=${sec.size}, bufLen=${totalSize})`,
        );
      }
    }

    // Check for overlapping sections
    const sorted = [...header.sections].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.offset + prev.size > curr.offset) {
        throw new Error(
          `Sections "${prev.id}" and "${curr.id}" overlap ` +
            `(${prev.offset}+${prev.size} > ${curr.offset})`,
        );
      }
    }

    return new RvfaReader(buf, header);
  }

  /** Read an RVFA image from a file path. */
  static async fromFile(path: string): Promise<RvfaReader> {
    if (path.includes('\0')) {
      throw new Error('Path contains null bytes');
    }
    const data = await readFile(path);
    return RvfaReader.fromBuffer(data);
  }

  /** Return the parsed header. */
  getHeader(): RvfaHeader {
    return this.header;
  }

  /** List all sections declared in the header. */
  getSections(): RvfaSection[] {
    return this.header.sections;
  }

  /**
   * Extract and decompress a section by its id.
   *
   * @param id  The section identifier (e.g. 'kernel', 'runtime').
   * @returns   The decompressed section payload.
   */
  extractSection(id: string): Buffer {
    const sec = this.header.sections.find((s) => s.id === id);
    if (!sec) {
      throw new Error(`Section "${id}" not found`);
    }

    if (sec.offset + sec.size > this.buf.length - SHA256_SIZE) {
      throw new Error(`Section "${id}" exceeds buffer bounds`);
    }

    const raw = this.buf.subarray(sec.offset, sec.offset + sec.size);

    if (sec.compression === 'gzip') {
      return gunzipSync(raw);
    }
    if (sec.compression === 'zstd') {
      // zstd not natively supported — attempt gzip fallback (mirrors writer)
      try {
        return gunzipSync(raw);
      } catch {
        throw new Error(
          'zstd decompression is not supported in this environment',
        );
      }
    }

    // compression === 'none'
    return Buffer.from(raw);
  }

  /**
   * Verify the integrity of the RVFA image.
   *
   * Checks:
   *  1. Magic bytes
   *  2. Version number
   *  3. SHA256 of each section's compressed data
   *  4. SHA256 footer (all section data combined)
   */
  verify(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. Magic
    const magic = this.buf.subarray(0, MAGIC_SIZE).toString('ascii');
    if (magic !== 'RVFA') {
      errors.push(`Invalid magic: "${magic}"`);
    }

    // 2. Version
    const version = this.buf.readUInt32LE(MAGIC_SIZE);
    if (version !== RVFA_VERSION) {
      errors.push(`Unsupported version: ${version}`);
    }

    // 3. Per-section SHA256
    const sectionDataParts: Buffer[] = [];
    for (const sec of this.header.sections) {
      if (sec.offset + sec.size > this.buf.length - SHA256_SIZE) {
        errors.push(`Section "${sec.id}" extends beyond buffer`);
        continue;
      }
      const raw = this.buf.subarray(sec.offset, sec.offset + sec.size);
      sectionDataParts.push(raw);

      const actual = sha256(raw);
      if (actual !== sec.sha256) {
        errors.push(
          `Section "${sec.id}" SHA256 mismatch: ` +
            `expected ${sec.sha256}, got ${actual}`,
        );
      }
    }

    // 4. Footer SHA256
    if (this.buf.length >= SHA256_SIZE) {
      const allSections = Buffer.concat(sectionDataParts);
      const expectedFooter = sha256Bytes(allSections);
      const actualFooter = this.buf.subarray(this.buf.length - SHA256_SIZE);

      if (!expectedFooter.equals(actualFooter)) {
        errors.push(
          `Footer SHA256 mismatch: expected ${expectedFooter.toString('hex')}, ` +
            `got ${actualFooter.toString('hex')}`,
        );
      }
    } else {
      errors.push('Buffer too small to contain SHA256 footer');
    }

    return { valid: errors.length === 0, errors };
  }
}
