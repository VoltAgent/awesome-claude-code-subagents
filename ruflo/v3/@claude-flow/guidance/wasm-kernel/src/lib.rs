//! Guidance Control Plane — Rust WASM Kernel
//!
//! Pure-function policy engine: no filesystem, no network, deterministic I/O.
//! The Node host calls into this kernel via batch payloads.
//!
//! Modules:
//! - `proof`: SHA-256 content hashing, HMAC-SHA256 signing, hash chain verification
//! - `gates`: Secret pattern scanning, destructive command detection
//! - `scoring`: Retriever shard scoring and ranking

mod proof;
mod gates;
mod scoring;

use wasm_bindgen::prelude::*;

// Re-export top-level entry points for the host
pub use proof::*;
#[allow(unused_imports)]
pub use gates::*;
#[allow(unused_imports)]
pub use scoring::*;

/// Initialize the kernel (called once on module load).
/// Returns the kernel version string.
#[wasm_bindgen]
pub fn kernel_init() -> String {
    "guidance-kernel/0.1.0".to_string()
}

/// Process a batch of operations in a single host→kernel call.
/// Accepts a JSON array of `BatchOp` and returns a JSON array of results.
///
/// This is the primary entry point for high-throughput scenarios.
/// The host batches multiple operations into one call to minimize
/// WASM boundary crossings.
#[wasm_bindgen]
pub fn batch_process(ops_json: &str) -> String {
    let ops: Vec<BatchOp> = match serde_json::from_str(ops_json) {
        Ok(v) => v,
        Err(e) => return format!(r#"[{{"error":"{}"}}]"#, e),
    };

    let results: Vec<String> = ops.iter().map(|op| {
        match op.op.as_str() {
            "sha256" => {
                let hash = proof::sha256_hex(&op.payload);
                format!(r#"{{"hash":"{}"}}"#, hash)
            }
            "hmac_sha256" => {
                let key = op.key.as_deref().unwrap_or("default");
                let sig = proof::hmac_sha256_hex(key, &op.payload);
                format!(r#"{{"signature":"{}"}}"#, sig)
            }
            "content_hash" => {
                let hash = proof::content_hash_sorted(&op.payload);
                format!(r#"{{"hash":"{}"}}"#, hash)
            }
            "tool_call_hash" => {
                let hash = proof::sha256_hex(&op.payload);
                format!(r#"{{"hash":"{}"}}"#, hash)
            }
            "sign_envelope" => {
                let key = op.key.as_deref().unwrap_or("claude-flow-guidance-default-key");
                let sig = proof::hmac_sha256_hex(key, &op.payload);
                format!(r#"{{"signature":"{}"}}"#, sig)
            }
            "verify_chain" => {
                let result = proof::verify_chain_json(&op.payload, op.key.as_deref().unwrap_or("claude-flow-guidance-default-key"));
                format!(r#"{{"valid":{}}}"#, result)
            }
            "scan_secrets" => {
                let matches = gates::scan_secrets(&op.payload);
                let matches_json = serde_json::to_string(&matches).unwrap_or_else(|_| "[]".to_string());
                format!(r#"{{"matches":{}}}"#, matches_json)
            }
            "detect_destructive" => {
                let result = gates::detect_destructive(&op.payload);
                match result {
                    Some(m) => format!(r#"{{"detected":true,"match":"{}"}}"#, m),
                    None => r#"{"detected":false}"#.to_string(),
                }
            }
            "score_shards" => {
                let scores = scoring::score_shards_json(&op.payload);
                scores
            }
            _ => format!(r#"{{"error":"unknown op: {}"}}"#, op.op),
        }
    }).collect();

    format!("[{}]", results.join(","))
}

#[derive(serde::Deserialize)]
struct BatchOp {
    op: String,
    payload: String,
    #[serde(default)]
    key: Option<String>,
}

// === Individual function exports for direct calls ===

/// Compute SHA-256 hex digest of input
#[wasm_bindgen]
pub fn sha256(input: &str) -> String {
    proof::sha256_hex(input)
}

/// Compute HMAC-SHA256 hex digest
#[wasm_bindgen]
pub fn hmac_sha256(key: &str, input: &str) -> String {
    proof::hmac_sha256_hex(key, input)
}

/// Compute content hash with sorted keys (for RunEvent hashing)
#[wasm_bindgen]
pub fn content_hash(json_input: &str) -> String {
    proof::content_hash_sorted(json_input)
}

/// Sign a proof envelope body (HMAC-SHA256)
#[wasm_bindgen]
pub fn sign_envelope(key: &str, envelope_json: &str) -> String {
    proof::hmac_sha256_hex(key, envelope_json)
}

/// Verify an entire proof chain from JSON
#[wasm_bindgen]
pub fn verify_chain(chain_json: &str, key: &str) -> bool {
    proof::verify_chain_json(chain_json, key)
}

/// Scan content for secret patterns, returns JSON array of redacted matches
#[wasm_bindgen]
pub fn scan_secrets(content: &str) -> String {
    let matches = gates::scan_secrets(content);
    serde_json::to_string(&matches).unwrap_or_else(|_| "[]".to_string())
}

/// Detect destructive command patterns, returns matched pattern or empty string
#[wasm_bindgen]
pub fn detect_destructive(command: &str) -> String {
    match gates::detect_destructive(command) {
        Some(m) => m,
        None => String::new(),
    }
}
