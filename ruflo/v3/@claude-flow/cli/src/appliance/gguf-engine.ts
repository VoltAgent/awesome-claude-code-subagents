/**
 * ruvLLM GGUF Inference Engine -- Pure Node.js GGUF Model Interface
 *
 * Provides:
 *   1. GGUF binary header parsing (metadata without loading weights)
 *   2. Model loading abstraction (node-llama-cpp when available, metadata-only fallback)
 *   3. Token generation interface with async iterator streaming
 *   4. KV-cache persistence to RVF-compatible binary format
 *
 * Zero external dependencies. node-llama-cpp is an optional peer.
 *
 * @module @claude-flow/cli/appliance/gguf-engine
 */

import { open, readFile, writeFile, stat as fsStat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

// ── GGUF Metadata Value Types ───────────────────────────────

const enum GgufValueType {
  UINT8 = 0, INT8 = 1, UINT16 = 2, INT16 = 3, UINT32 = 4, INT32 = 5,
  FLOAT32 = 6, BOOL = 7, STRING = 8, ARRAY = 9, UINT64 = 10, INT64 = 11, FLOAT64 = 12,
}

const GGUF_MAGIC = 0x46554747; // "GGUF" in little-endian
const RVKV_MAGIC = 0x564B5652; // "RVKV" in little-endian
const RVKV_VERSION = 1;

// ── Public Interfaces ───────────────────────────────────────

export interface GgufMetadata {
  magic: string;
  version: number;
  tensorCount: number;
  kvCount: number;
  architecture?: string;
  name?: string;
  contextLength?: number;
  embeddingLength?: number;
  blockCount?: number;
  vocabSize?: number;
  quantization?: string;
  fileSize: number;
  metadata: Record<string, unknown>;
}

export interface GgufEngineConfig {
  contextSize?: number;
  maxTokens?: number;
  temperature?: number;
  kvCachePath?: string;
  verbose?: boolean;
}

export interface GenerateRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  stopSequences?: string[];
}

export interface GenerateResponse {
  text: string;
  model: string;
  tokensUsed: number;
  latencyMs: number;
  metadataOnly: boolean;
}

// ── Internal Buffer Reader ──────────────────────────────────

/** Stateful cursor over a Buffer for sequential binary reads. */
class BufferReader {
  private offset = 0;
  constructor(private buf: Buffer) {}
  get remaining(): number { return this.buf.length - this.offset; }

  readU8(): number  { const v = this.buf.readUInt8(this.offset); this.offset += 1; return v; }
  readI8(): number  { const v = this.buf.readInt8(this.offset); this.offset += 1; return v; }
  readU16(): number { const v = this.buf.readUInt16LE(this.offset); this.offset += 2; return v; }
  readI16(): number { const v = this.buf.readInt16LE(this.offset); this.offset += 2; return v; }
  readU32(): number { const v = this.buf.readUInt32LE(this.offset); this.offset += 4; return v; }
  readI32(): number { const v = this.buf.readInt32LE(this.offset); this.offset += 4; return v; }
  readF32(): number { const v = this.buf.readFloatLE(this.offset); this.offset += 4; return v; }
  readF64(): number { const v = this.buf.readDoubleLE(this.offset); this.offset += 8; return v; }
  readU64(): bigint { const v = this.buf.readBigUInt64LE(this.offset); this.offset += 8; return v; }
  readI64(): bigint { const v = this.buf.readBigInt64LE(this.offset); this.offset += 8; return v; }
  /** Safe for values up to 2^53. Real GGUF files never exceed this for tensor/kv counts. */
  readU64AsNumber(): number { return Number(this.readU64()); }
  readBool(): boolean { return this.readU8() !== 0; }

  /** GGUF string: [length u64 LE][utf-8 bytes]. */
  readString(): string {
    const len = this.readU64AsNumber();
    if (len === 0) return '';
    if (len > this.remaining) throw new Error(`String length ${len} exceeds remaining buffer`);
    const s = this.buf.toString('utf-8', this.offset, this.offset + len);
    this.offset += len;
    return s;
  }
}

// ── GGUF Value Reading ──────────────────────────────────────

/** Read a typed scalar from the buffer (shared by value and array-element readers). */
function readScalar(reader: BufferReader, t: number): unknown {
  switch (t) {
    case GgufValueType.UINT8:   return reader.readU8();
    case GgufValueType.INT8:    return reader.readI8();
    case GgufValueType.UINT16:  return reader.readU16();
    case GgufValueType.INT16:   return reader.readI16();
    case GgufValueType.UINT32:  return reader.readU32();
    case GgufValueType.INT32:   return reader.readI32();
    case GgufValueType.FLOAT32: return reader.readF32();
    case GgufValueType.BOOL:    return reader.readBool();
    case GgufValueType.STRING:  return reader.readString();
    case GgufValueType.UINT64:  return Number(reader.readU64());
    case GgufValueType.INT64:   return Number(reader.readI64());
    case GgufValueType.FLOAT64: return reader.readF64();
    default: return undefined;
  }
}

/** Read a single GGUF typed value (scalar or array) from the buffer. */
function readGgufValue(reader: BufferReader): unknown {
  const valueType = reader.readU32();
  if (valueType === GgufValueType.ARRAY) {
    const elemType = reader.readU32();
    const len = reader.readU64AsNumber();
    const arr: unknown[] = [];
    for (let i = 0; i < len; i++) {
      const v = readScalar(reader, elemType);
      if (v === undefined) throw new Error(`Unknown GGUF array element type: ${elemType}`);
      arr.push(v);
    }
    return arr;
  }
  const v = readScalar(reader, valueType);
  if (v === undefined) throw new Error(`Unknown GGUF value type: ${valueType}`);
  return v;
}

// ── GGUF Header Parsing ─────────────────────────────────────

/**
 * Parse the header and metadata from a GGUF file without loading tensors.
 * Reads only the first 256 KB of the file.
 */
export async function parseGgufHeader(path: string): Promise<GgufMetadata> {
  const fileInfo = await fsStat(path);
  const readSize = Math.min(fileInfo.size, 256 * 1024);
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(readSize);
    await fh.read(buf, 0, readSize, 0);
    return parseGgufBuffer(buf, fileInfo.size, path);
  } finally {
    await fh.close();
  }
}

function parseGgufBuffer(buf: Buffer, fileSize: number, filePath: string): GgufMetadata {
  const reader = new BufferReader(buf);

  const magic = reader.readU32();
  if (magic !== GGUF_MAGIC) {
    throw new Error(`Invalid GGUF magic: 0x${magic.toString(16)} (expected 0x${GGUF_MAGIC.toString(16)})`);
  }

  const version = reader.readU32();
  if (version < 2 || version > 3) {
    throw new Error(`Unsupported GGUF version: ${version} (expected 2 or 3)`);
  }

  const tensorCount = reader.readU64AsNumber();
  const kvCount = reader.readU64AsNumber();

  const metadata: Record<string, unknown> = {};
  for (let i = 0; i < kvCount; i++) {
    if (reader.remaining < 12) break;
    try {
      const key = reader.readString();
      metadata[key] = readGgufValue(reader);
    } catch {
      break; // reached end of read window
    }
  }

  const arch = asString(metadata['general.architecture']);
  const pfx = arch || 'llama'; // fallback prefix for well-known keys

  return {
    magic: 'GGUF', version, tensorCount, kvCount,
    architecture: arch,
    name: asString(metadata['general.name']),
    contextLength: asNumber(metadata[`${pfx}.context_length`]),
    embeddingLength: asNumber(metadata[`${pfx}.embedding_length`]),
    blockCount: asNumber(metadata[`${pfx}.block_count`]),
    vocabSize: inferVocabSize(metadata),
    quantization: inferQuantFromMetadata(metadata, filePath),
    fileSize, metadata,
  };
}

// ── Metadata Helpers ────────────────────────────────────────

function asString(v: unknown): string | undefined { return typeof v === 'string' ? v : undefined; }
function asNumber(v: unknown): number | undefined { return typeof v === 'number' ? v : undefined; }

const QUANT_RE: Array<[RegExp, string]> = [
  [/q2_k/i, 'Q2_K'], [/q3_k_s/i, 'Q3_K_S'], [/q3_k_m/i, 'Q3_K_M'], [/q3_k_l/i, 'Q3_K_L'],
  [/q4_k_s/i, 'Q4_K_S'], [/q4_k_m/i, 'Q4_K_M'], [/q4_0/i, 'Q4_0'], [/q4_1/i, 'Q4_1'],
  [/q5_k_s/i, 'Q5_K_S'], [/q5_k_m/i, 'Q5_K_M'], [/q5_0/i, 'Q5_0'], [/q5_1/i, 'Q5_1'],
  [/q6_k/i, 'Q6_K'], [/q8_0/i, 'Q8_0'], [/f16/i, 'F16'], [/f32/i, 'F32'],
];

function inferQuantFromMetadata(meta: Record<string, unknown>, filePath: string): string {
  const ft = meta['general.file_type'];
  if (typeof ft === 'number') return `file_type_${ft}`;
  const name = basename(filePath);
  for (const [re, label] of QUANT_RE) if (re.test(name)) return label;
  return 'unknown';
}

function inferVocabSize(meta: Record<string, unknown>): number | undefined {
  const tokens = meta['tokenizer.ggml.tokens'];
  if (Array.isArray(tokens)) return tokens.length;
  return asNumber(meta['tokenizer.ggml.vocab_size']);
}

// ── GGUF Engine ─────────────────────────────────────────────

export class GgufEngine {
  private config: Required<GgufEngineConfig>;
  private llamaCpp: any = null;
  private llamaModel: any = null;
  private llamaContext: any = null;
  private loadedModels: Map<string, GgufMetadata> = new Map();
  private activeModelPath: string | null = null;
  private kvCache: Map<string, Buffer> = new Map();

  constructor(config: GgufEngineConfig) {
    this.config = {
      contextSize: config.contextSize ?? 4096,
      maxTokens: config.maxTokens ?? 512,
      temperature: config.temperature ?? 0.7,
      kvCachePath: config.kvCachePath ?? '',
      verbose: config.verbose ?? false,
    };
  }

  /** Probe for node-llama-cpp availability. */
  async initialize(): Promise<void> {
    this.llamaCpp = await this.tryLoadLlamaCpp();
    if (this.config.verbose) {
      console.log(`[gguf-engine] node-llama-cpp: ${this.llamaCpp ? 'available' : 'not found (metadata-only mode)'}`);
    }
  }

  /** Parse GGUF header and optionally load the model for inference. */
  async loadModel(path: string): Promise<GgufMetadata> {
    const meta = await parseGgufHeader(path);
    this.loadedModels.set(path, meta);
    this.activeModelPath = path;

    if (this.llamaCpp) {
      try {
        const { getLlama } = this.llamaCpp;
        const llama = await getLlama();
        this.llamaModel = await llama.loadModel({ modelPath: path });
        this.llamaContext = await this.llamaModel.createContext({ contextSize: this.config.contextSize });
        if (this.config.verbose) console.log(`[gguf-engine] Model loaded: ${basename(path)}`);
      } catch (err) {
        if (this.config.verbose) console.warn('[gguf-engine] node-llama-cpp load failed:', err);
        this.llamaModel = null;
        this.llamaContext = null;
      }
    }
    return meta;
  }

  /** Generate text. Delegates to node-llama-cpp or returns a metadata-only stub. */
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const start = performance.now();
    const modelPath = request.model ?? this.activeModelPath;
    const modelName = modelPath ? basename(modelPath) : 'none';

    if (this.llamaContext && this.llamaModel) {
      try {
        const session = new this.llamaCpp.LlamaChatSession({
          contextSequence: this.llamaContext.getSequence(),
        });
        const text = await session.prompt(request.prompt, {
          maxTokens: request.maxTokens ?? this.config.maxTokens,
          temperature: request.temperature ?? this.config.temperature,
          stopGenerationTrigger: request.stopSequences
            ? request.stopSequences.map((s: string) => new this.llamaCpp.LlamaText([s]))
            : undefined,
        });
        // Use llama.cpp tokenizer for accurate count when available, else estimate
        let tokensUsed: number;
        try {
          const seq = this.llamaContext.getSequence();
          tokensUsed = seq.tokenCount ?? Math.ceil(text.length / 4);
        } catch {
          tokensUsed = Math.ceil(text.length / 4); // ~4 chars per token heuristic
        }
        return {
          text, model: modelName, tokensUsed,
          latencyMs: performance.now() - start, metadataOnly: false,
        };
      } catch (err) {
        if (this.config.verbose) console.warn('[gguf-engine] Generation failed:', err);
      }
    }

    // Metadata-only fallback
    const meta = modelPath ? this.loadedModels.get(modelPath) : undefined;
    return {
      text: meta
        ? `[metadata-only] Model: ${meta.name ?? modelName}, arch: ${meta.architecture ?? 'unknown'}, ctx: ${meta.contextLength ?? 'unknown'}`
        : '[metadata-only] No model loaded',
      model: modelName, tokensUsed: 0,
      latencyMs: performance.now() - start, metadataOnly: true,
    };
  }

  /** Stream tokens via async iterator. Falls back to yielding full response. */
  async *stream(request: GenerateRequest): AsyncGenerator<string> {
    if (this.llamaContext && this.llamaModel) {
      try {
        const session = new this.llamaCpp.LlamaChatSession({
          contextSequence: this.llamaContext.getSequence(),
        });
        const it = session.promptWithMeta(request.prompt, {
          maxTokens: request.maxTokens ?? this.config.maxTokens,
          temperature: request.temperature ?? this.config.temperature,
        });
        if (it && typeof it[Symbol.asyncIterator] === 'function') {
          for await (const chunk of it) {
            if (typeof chunk === 'string') yield chunk;
            else if (chunk?.text) yield chunk.text;
          }
          return;
        }
      } catch { /* fall through to single-chunk fallback */ }
    }
    const response = await this.generate(request);
    yield response.text;
  }

  /**
   * Persist the KV cache to an RVF-compatible binary file.
   * Format: RVKV magic | version u32 | model SHA-256 (32B) | entry count u32
   *         entries: [key_len u32, key, val_len u32, val] | footer SHA-256 (32B)
   */
  async persistKvCache(outputPath: string): Promise<void> {
    const path = outputPath || this.config.kvCachePath;
    if (!path) throw new Error('No KV cache output path specified');

    const modelHash = createHash('sha256').update(this.activeModelPath ?? 'no-model').digest();
    const entryBufs: Buffer[] = [];
    for (const [key, value] of this.kvCache) {
      const keyBuf = Buffer.from(key, 'utf-8');
      const hdr = Buffer.alloc(8);
      hdr.writeUInt32LE(keyBuf.length, 0);
      hdr.writeUInt32LE(value.length, 4);
      entryBufs.push(hdr, keyBuf, value);
    }
    const entryData = Buffer.concat(entryBufs);
    const footer = createHash('sha256').update(entryData).digest();

    const header = Buffer.alloc(44);
    header.writeUInt32LE(RVKV_MAGIC, 0);
    header.writeUInt32LE(RVKV_VERSION, 4);
    modelHash.copy(header, 8);
    header.writeUInt32LE(this.kvCache.size, 40);

    await writeFile(path, Buffer.concat([header, entryData, footer]));
    if (this.config.verbose) console.log(`[gguf-engine] KV cache persisted: ${this.kvCache.size} entries`);
  }

  /** Restore KV cache from an RVF-compatible binary file. */
  async loadKvCache(inputPath: string): Promise<void> {
    const data = await readFile(inputPath);
    if (data.length < 44) throw new Error('KV cache file too small');

    const magic = data.readUInt32LE(0);
    if (magic !== RVKV_MAGIC) throw new Error(`Invalid KV cache magic: 0x${magic.toString(16)}`);
    const version = data.readUInt32LE(4);
    if (version !== RVKV_VERSION) throw new Error(`Unsupported KV cache version: ${version}`);

    const entryCount = data.readUInt32LE(40);
    let offset = 44;
    const entries = new Map<string, Buffer>();

    for (let i = 0; i < entryCount; i++) {
      if (offset + 8 > data.length) throw new Error('KV cache file truncated');
      const keyLen = data.readUInt32LE(offset);
      const valLen = data.readUInt32LE(offset + 4);
      offset += 8;
      if (offset + keyLen + valLen > data.length) throw new Error('KV cache file truncated');
      entries.set(data.toString('utf-8', offset, offset + keyLen), Buffer.from(data.subarray(offset + keyLen, offset + keyLen + valLen)));
      offset += keyLen + valLen;
    }

    // Verify footer hash (mandatory)
    if (offset + 32 > data.length) {
      throw new Error('KV cache file missing SHA256 footer');
    }
    const stored = data.subarray(offset, offset + 32);
    const computed = createHash('sha256').update(data.subarray(44, offset)).digest();
    if (!stored.equals(computed)) throw new Error('KV cache integrity check failed: hash mismatch');

    this.kvCache = entries;
    if (this.config.verbose) console.log(`[gguf-engine] KV cache loaded: ${entries.size} entries`);
  }

  /** Return metadata for all loaded models. */
  getLoadedModels(): GgufMetadata[] { return Array.from(this.loadedModels.values()); }

  /** Store a key-value pair in the in-memory KV cache. */
  setKvEntry(key: string, value: Buffer): void { this.kvCache.set(key, value); }

  /** Retrieve a key-value pair from the in-memory KV cache. */
  getKvEntry(key: string): Buffer | undefined { return this.kvCache.get(key); }

  /** Release resources, unload models, and optionally persist the KV cache. */
  async shutdown(): Promise<void> {
    if (this.config.kvCachePath && this.kvCache.size > 0) {
      try { await this.persistKvCache(this.config.kvCachePath); }
      catch (err) { if (this.config.verbose) console.warn('[gguf-engine] KV persist failed:', err); }
    }
    if (this.llamaContext?.dispose) { try { await this.llamaContext.dispose(); } catch { /* ignore */ } }
    if (this.llamaModel?.dispose) { try { await this.llamaModel.dispose(); } catch { /* ignore */ } }
    this.llamaContext = null;
    this.llamaModel = null;
    this.activeModelPath = null;
    this.loadedModels.clear();
    this.kvCache.clear();
    if (this.config.verbose) console.log('[gguf-engine] Shutdown complete');
  }

  // ── Private ───────────────────────────────────────────────

  private async tryLoadLlamaCpp(): Promise<any> {
    // @ts-ignore -- optional peer dependency, may not be installed
    try { return await import('node-llama-cpp'); } catch { return null; }
  }
}
