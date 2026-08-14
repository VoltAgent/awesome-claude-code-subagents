/**
 * JSON-safe serialization helpers for neural state.
 *
 * The package's hot-path types use `Float32Array` and `Map<string, X>` which
 * don't survive `JSON.stringify` cleanly. These helpers encode/decode them
 * in a stable shape so SONAManager / ReasoningBank / PatternLearner can
 * round-trip through `serialize()` → `JSON.stringify` → file → `JSON.parse`
 * → `deserialize()` without losing precision or structure.
 *
 * Encoding:
 *   Float32Array  ↔ { __f32: number[] }
 *   Map<K, V>     ↔ { __map: Array<[K, V]> }
 *
 * Numbers in Float32Array are stored as plain JS `number` (double precision).
 * Round-trip is loss-free at single-precision (the values were f32 originally;
 * widening to f64 then narrowing back is exact for any finite f32).
 */

export interface EncodedFloat32Array {
  __f32: number[];
}

export interface EncodedMap<V> {
  __map: Array<[string, V]>;
}

export function encodeFloat32Array(arr: Float32Array): EncodedFloat32Array {
  return { __f32: Array.from(arr) };
}

export function decodeFloat32Array(encoded: EncodedFloat32Array): Float32Array {
  return new Float32Array(encoded.__f32);
}

export function isEncodedFloat32Array(v: unknown): v is EncodedFloat32Array {
  return typeof v === 'object' && v !== null && Array.isArray((v as EncodedFloat32Array).__f32);
}

export function encodeMap<V>(map: Map<string, V>, encodeValue?: (v: V) => unknown): EncodedMap<unknown> {
  const entries: Array<[string, unknown]> = [];
  for (const [k, v] of map.entries()) {
    entries.push([k, encodeValue ? encodeValue(v) : v]);
  }
  return { __map: entries as Array<[string, unknown]> };
}

export function decodeMap<V>(encoded: EncodedMap<unknown>, decodeValue?: (v: unknown) => V): Map<string, V> {
  const m = new Map<string, V>();
  for (const [k, v] of encoded.__map) {
    m.set(k, (decodeValue ? decodeValue(v) : v) as V);
  }
  return m;
}

export function isEncodedMap(v: unknown): v is EncodedMap<unknown> {
  return typeof v === 'object' && v !== null && Array.isArray((v as EncodedMap<unknown>).__map);
}

/**
 * Deep walk an object and encode all Float32Array/Map nodes. Useful when
 * a class's state contains nested f32 arrays in unknown locations (e.g.,
 * Trajectory.steps[i].stateEmbedding). Skip with caution — the deep walker
 * is recursive and shouldn't be used on objects with cycles.
 */
export function deepEncode(value: unknown): unknown {
  if (value instanceof Float32Array) return encodeFloat32Array(value);
  if (value instanceof Map) {
    return encodeMap(value as Map<string, unknown>, (v) => deepEncode(v));
  }
  if (Array.isArray(value)) return value.map((v) => deepEncode(v));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepEncode(v);
    return out;
  }
  return value;
}

export function deepDecode(value: unknown): unknown {
  if (isEncodedFloat32Array(value)) return decodeFloat32Array(value);
  if (isEncodedMap(value)) {
    return decodeMap(value, (v) => deepDecode(v));
  }
  if (Array.isArray(value)) return value.map((v) => deepDecode(v));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepDecode(v);
    return out;
  }
  return value;
}
