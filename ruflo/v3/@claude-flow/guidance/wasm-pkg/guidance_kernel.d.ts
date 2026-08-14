/* tslint:disable */
/* eslint-disable */

/**
 * Process a batch of operations in a single host→kernel call.
 * Accepts a JSON array of `BatchOp` and returns a JSON array of results.
 *
 * This is the primary entry point for high-throughput scenarios.
 * The host batches multiple operations into one call to minimize
 * WASM boundary crossings.
 */
export function batch_process(ops_json: string): string;

/**
 * Compute content hash with sorted keys (for RunEvent hashing)
 */
export function content_hash(json_input: string): string;

/**
 * Detect destructive command patterns, returns matched pattern or empty string
 */
export function detect_destructive(command: string): string;

/**
 * Compute HMAC-SHA256 hex digest
 */
export function hmac_sha256(key: string, input: string): string;

/**
 * Initialize the kernel (called once on module load).
 * Returns the kernel version string.
 */
export function kernel_init(): string;

/**
 * Scan content for secret patterns, returns JSON array of redacted matches
 */
export function scan_secrets(content: string): string;

/**
 * Compute SHA-256 hex digest of input
 */
export function sha256(input: string): string;

/**
 * Sign a proof envelope body (HMAC-SHA256)
 */
export function sign_envelope(key: string, envelope_json: string): string;

/**
 * Verify an entire proof chain from JSON
 */
export function verify_chain(chain_json: string, key: string): boolean;
