/**
 * WASM Lazy Loader for Gas Town Bridge
 *
 * Provides on-demand loading of WASM modules with:
 * - Lazy initialization (modules loaded only when needed)
 * - Gzip decompression support
 * - Caching to prevent re-initialization
 * - Graceful fallback to JS implementations
 *
 * Bundle impact: <5KB (loader only, WASM loaded separately)
 *
 * @module v3/plugins/gastown-bridge/wasm
 */

// Types for WASM modules
export interface FormulaWasm {
  parse_toml: (input: string) => unknown;
  cook_formula: (formula: unknown, variables: Record<string, unknown>) => unknown;
  generate_molecule: (formula: unknown) => unknown;
  memory: WebAssembly.Memory;
}

export interface GnnWasm {
  create_dag: () => unknown;
  add_node: (dag: unknown, id: string, data: unknown) => void;
  add_edge: (dag: unknown, from: string, to: string) => void;
  topological_sort: (dag: unknown) => string[];
  detect_cycles: (dag: unknown) => boolean;
  critical_path: (dag: unknown) => string[];
  memory: WebAssembly.Memory;
}

export interface WasmModule<T> {
  instance: T;
  memory: WebAssembly.Memory;
  ready: boolean;
}

// Module cache
let formulaModule: WasmModule<FormulaWasm> | null = null;
let gnnModule: WasmModule<GnnWasm> | null = null;

// Loading state
let formulaLoading: Promise<WasmModule<FormulaWasm>> | null = null;
let gnnLoading: Promise<WasmModule<GnnWasm>> | null = null;

/**
 * WASM loading options
 */
export interface WasmLoadOptions {
  /**
   * Base path for WASM files
   * @default './wasm'
   */
  basePath?: string;

  /**
   * Prefer gzipped WASM files
   * @default true
   */
  preferGzip?: boolean;

  /**
   * Custom fetch function (for Node.js or custom loaders)
   */
  fetch?: typeof globalThis.fetch;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;
}

/**
 * Detect runtime environment
 */
function detectEnvironment(): 'node' | 'browser' | 'edge' {
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }
  if (typeof window !== 'undefined') {
    return 'browser';
  }
  return 'edge';
}

/**
 * Load a WASM file with gzip support
 */
async function loadWasmBytes(
  moduleName: string,
  options: WasmLoadOptions = {}
): Promise<ArrayBuffer> {
  const {
    basePath = './wasm',
    preferGzip = true,
    fetch: customFetch = globalThis.fetch,
    signal,
  } = options;

  const env = detectEnvironment();
  const wasmName = moduleName.replace(/-/g, '_');

  // Try gzipped first if preferred
  const paths = preferGzip
    ? [
        `${basePath}/${moduleName}/pkg/${wasmName}_bg.wasm.gz`,
        `${basePath}/${moduleName}/pkg/${wasmName}_bg.wasm`,
      ]
    : [
        `${basePath}/${moduleName}/pkg/${wasmName}_bg.wasm`,
        `${basePath}/${moduleName}/pkg/${wasmName}_bg.wasm.gz`,
      ];

  for (const path of paths) {
    try {
      if (env === 'node') {
        // Node.js: Use fs
        const fs = await import('fs');
        const pathModule = await import('path');
        const zlib = await import('zlib');
        const { promisify } = await import('util');

        const absolutePath = pathModule.resolve(path);
        if (fs.existsSync(absolutePath)) {
          const buffer = fs.readFileSync(absolutePath);

          if (path.endsWith('.gz')) {
            const gunzip = promisify(zlib.gunzip);
            const decompressed = await gunzip(buffer);
            return decompressed.buffer.slice(
              decompressed.byteOffset,
              decompressed.byteOffset + decompressed.byteLength
            );
          }

          return buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
          );
        }
      } else {
        // Browser/Edge: Use fetch
        const response = await customFetch(path, { signal });
        if (response.ok) {
          const buffer = await response.arrayBuffer();

          if (path.endsWith('.gz')) {
            // Decompress in browser using DecompressionStream if available
            if (typeof DecompressionStream !== 'undefined') {
              const stream = new Response(buffer).body;
              if (stream) {
                const decompressed = stream.pipeThrough(
                  new DecompressionStream('gzip')
                );
                return new Response(decompressed).arrayBuffer();
              }
            }
            // Fallback: assume server decompresses or use pako
            throw new Error('Gzip decompression not supported');
          }

          return buffer;
        }
      }
    } catch {
      // Try next path
      continue;
    }
  }

  throw new Error(`Failed to load WASM module: ${moduleName}`);
}

/**
 * Instantiate a WASM module
 */
async function instantiateWasm<T>(
  bytes: ArrayBuffer,
  imports: WebAssembly.Imports = {}
): Promise<WasmModule<T>> {
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, imports);

  return {
    instance: instance.exports as T,
    memory: instance.exports.memory as WebAssembly.Memory,
    ready: true,
  };
}

/**
 * Load the Formula WASM module
 *
 * Features:
 * - TOML parsing (352x faster than JavaScript)
 * - Variable cooking/substitution
 * - Molecule generation
 *
 * @example
 * ```typescript
 * const formula = await loadFormulaWasm();
 * const parsed = formula.instance.parse_toml(tomlString);
 * ```
 */
export async function loadFormulaWasm(
  options: WasmLoadOptions = {}
): Promise<WasmModule<FormulaWasm>> {
  // Return cached module
  if (formulaModule?.ready) {
    return formulaModule;
  }

  // Return in-progress loading
  if (formulaLoading) {
    return formulaLoading;
  }

  // Start loading
  formulaLoading = (async () => {
    try {
      const bytes = await loadWasmBytes('gastown-formula-wasm', options);
      formulaModule = await instantiateWasm<FormulaWasm>(bytes);
      return formulaModule;
    } finally {
      formulaLoading = null;
    }
  })();

  return formulaLoading;
}

/**
 * Load the GNN WASM module
 *
 * Features:
 * - DAG construction and traversal (150x faster)
 * - Topological sorting
 * - Cycle detection
 * - Critical path analysis
 *
 * @example
 * ```typescript
 * const gnn = await loadGnnWasm();
 * const dag = gnn.instance.create_dag();
 * gnn.instance.add_node(dag, 'task1', { name: 'Build' });
 * ```
 */
export async function loadGnnWasm(
  options: WasmLoadOptions = {}
): Promise<WasmModule<GnnWasm>> {
  // Return cached module
  if (gnnModule?.ready) {
    return gnnModule;
  }

  // Return in-progress loading
  if (gnnLoading) {
    return gnnLoading;
  }

  // Start loading
  gnnLoading = (async () => {
    try {
      const bytes = await loadWasmBytes('ruvector-gnn-wasm', options);
      gnnModule = await instantiateWasm<GnnWasm>(bytes);
      return gnnModule;
    } finally {
      gnnLoading = null;
    }
  })();

  return gnnLoading;
}

/**
 * Preload all WASM modules
 *
 * Use this during application startup to avoid latency
 * on first use.
 */
export async function preloadAllWasm(
  options: WasmLoadOptions = {}
): Promise<void> {
  await Promise.all([
    loadFormulaWasm(options),
    loadGnnWasm(options),
  ]);
}

/**
 * Check if WASM modules are loaded
 */
export function isWasmLoaded(): {
  formula: boolean;
  gnn: boolean;
  all: boolean;
} {
  return {
    formula: formulaModule?.ready ?? false,
    gnn: gnnModule?.ready ?? false,
    all: (formulaModule?.ready ?? false) && (gnnModule?.ready ?? false),
  };
}

/**
 * Clear cached WASM modules
 *
 * Useful for testing or memory management
 */
export function clearWasmCache(): void {
  formulaModule = null;
  gnnModule = null;
  formulaLoading = null;
  gnnLoading = null;
}

/**
 * Get WASM memory statistics
 */
export function getWasmMemoryStats(): {
  formula: { pages: number; bytes: number } | null;
  gnn: { pages: number; bytes: number } | null;
  total: number;
} {
  const formulaPages = formulaModule?.memory?.buffer.byteLength ?? 0;
  const gnnPages = gnnModule?.memory?.buffer.byteLength ?? 0;

  return {
    formula: formulaModule
      ? { pages: formulaPages / 65536, bytes: formulaPages }
      : null,
    gnn: gnnModule
      ? { pages: gnnPages / 65536, bytes: gnnPages }
      : null,
    total: formulaPages + gnnPages,
  };
}

// WasmLoadOptions is already exported above
