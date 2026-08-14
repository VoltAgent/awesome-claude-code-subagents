//! ProofChain cryptographic primitives
//!
//! SHA-256 content hashing, HMAC-SHA256 signing, and hash chain verification.
//! All functions are pure and deterministic — identical inputs produce
//! identical outputs across all platforms (Node, Deno, browser).

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

/// Compute SHA-256 hex digest of arbitrary input.
pub fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

/// Compute HMAC-SHA256 hex digest.
pub fn hmac_sha256_hex(key: &str, input: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(key.as_bytes())
        .expect("HMAC key length is always valid");
    mac.update(input.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Compute content hash with sorted JSON keys.
///
/// Parses the JSON, re-serializes with sorted keys, then SHA-256 hashes.
/// This ensures deterministic hashing regardless of key order in the input.
pub fn content_hash_sorted(json_input: &str) -> String {
    // Parse and re-serialize with sorted keys for determinism
    match serde_json::from_str::<serde_json::Value>(json_input) {
        Ok(value) => {
            let sorted = sort_json_value(&value);
            let canonical = serde_json::to_string(&sorted).unwrap_or_default();
            sha256_hex(&canonical)
        }
        Err(_) => {
            // If not valid JSON, hash raw input
            sha256_hex(json_input)
        }
    }
}

/// Verify an entire proof chain from serialized JSON.
///
/// Checks:
/// 1. Each envelope's HMAC signature is valid
/// 2. Each envelope links to the previous envelope's contentHash
/// 3. First envelope links to genesis hash (64 zeros)
pub fn verify_chain_json(chain_json: &str, signing_key: &str) -> bool {
    let chain: SerializedChain = match serde_json::from_str(chain_json) {
        Ok(c) => c,
        Err(_) => return false,
    };

    let genesis = "0".repeat(64);

    for (i, envelope) in chain.envelopes.iter().enumerate() {
        // Verify signature
        let body = envelope_signing_body(envelope);
        let expected_sig = hmac_sha256_hex(signing_key, &body);
        if envelope.signature != expected_sig {
            return false;
        }

        // Verify chain linkage
        if i == 0 {
            if envelope.previous_hash != genesis {
                return false;
            }
        } else if envelope.previous_hash != chain.envelopes[i - 1].content_hash {
            return false;
        }
    }

    true
}

/// Recursively sort JSON object keys for deterministic serialization.
fn sort_json_value(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut sorted: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for key in keys {
                sorted.insert(key.clone(), sort_json_value(&map[key]));
            }
            serde_json::Value::Object(sorted)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(sort_json_value).collect())
        }
        other => other.clone(),
    }
}

/// Build the signing body for a proof envelope (all fields except signature).
fn envelope_signing_body(envelope: &Envelope) -> String {
    let body = serde_json::json!({
        "envelopeId": envelope.envelope_id,
        "runEventId": envelope.run_event_id,
        "timestamp": envelope.timestamp,
        "contentHash": envelope.content_hash,
        "previousHash": envelope.previous_hash,
        "toolCallHashes": envelope.tool_call_hashes,
        "guidanceHash": envelope.guidance_hash,
        "memoryLineage": envelope.memory_lineage,
        "metadata": envelope.metadata,
    });
    serde_json::to_string(&body).unwrap_or_default()
}

// === Serialization types matching the TypeScript ProofEnvelope ===

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SerializedChain {
    envelopes: Vec<Envelope>,
    #[allow(dead_code)]
    version: u32,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    envelope_id: String,
    run_event_id: String,
    timestamp: String,
    content_hash: String,
    previous_hash: String,
    tool_call_hashes: serde_json::Value,
    guidance_hash: String,
    memory_lineage: serde_json::Value,
    signature: String,
    metadata: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_deterministic() {
        let a = sha256_hex("hello world");
        let b = sha256_hex("hello world");
        assert_eq!(a, b);
        assert_eq!(a, "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    }

    #[test]
    fn test_hmac_sha256_deterministic() {
        let a = hmac_sha256_hex("key", "message");
        let b = hmac_sha256_hex("key", "message");
        assert_eq!(a, b);
    }

    #[test]
    fn test_content_hash_key_order_independence() {
        let a = content_hash_sorted(r#"{"b": 2, "a": 1}"#);
        let b = content_hash_sorted(r#"{"a": 1, "b": 2}"#);
        assert_eq!(a, b);
    }

    #[test]
    fn test_content_hash_nested() {
        let a = content_hash_sorted(r#"{"z": {"b": 2, "a": 1}, "y": [3, 2, 1]}"#);
        let b = content_hash_sorted(r#"{"y": [3, 2, 1], "z": {"a": 1, "b": 2}}"#);
        assert_eq!(a, b);
    }
}
