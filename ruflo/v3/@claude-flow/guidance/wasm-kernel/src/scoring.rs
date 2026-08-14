//! Shard scoring and ranking for the ShardRetriever
//!
//! Pure functions for computing relevance scores over shard metadata.
//! Moved to WASM for predictable latency and zero GC stalls.

use serde::{Deserialize, Serialize};

/// A shard with its metadata for scoring.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShardInput {
    pub id: String,
    pub domains: Vec<String>,
    pub risk_class: String,
    pub weight: f64,
    pub text_snippet: String,
}

/// Scored shard result.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoredShard {
    pub id: String,
    pub score: f64,
    pub match_reasons: Vec<String>,
}

/// Scoring request: intent + domain + shards.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreRequest {
    pub intent: String,
    pub domain: String,
    pub risk_class: Option<String>,
    pub shards: Vec<ShardInput>,
}

/// Score and rank shards based on intent, domain, and risk class.
///
/// Scoring formula:
/// - Base weight from shard
/// - +0.3 bonus for domain match
/// - +0.2 bonus for risk class match
/// - +0.1 bonus for intent keyword match in snippet
/// - Results sorted descending by score
pub fn score_shards(request: &ScoreRequest) -> Vec<ScoredShard> {
    let intent_lower = request.intent.to_lowercase();
    let intent_words: Vec<&str> = intent_lower.split_whitespace().collect();

    let mut scored: Vec<ScoredShard> = request.shards.iter().map(|shard| {
        let mut score = shard.weight;
        let mut reasons = Vec::new();

        // Domain match bonus
        if shard.domains.iter().any(|d| d == &request.domain) {
            score += 0.3;
            reasons.push(format!("domain:{}", request.domain));
        }

        // Risk class match bonus
        if let Some(ref risk) = request.risk_class {
            if &shard.risk_class == risk {
                score += 0.2;
                reasons.push(format!("risk:{}", risk));
            }
        }

        // Intent keyword overlap bonus
        let snippet_lower = shard.text_snippet.to_lowercase();
        let keyword_hits: usize = intent_words.iter()
            .filter(|w| w.len() > 2 && snippet_lower.contains(**w))
            .count();
        if keyword_hits > 0 {
            let keyword_bonus = 0.1 * (keyword_hits as f64).min(3.0);
            score += keyword_bonus;
            reasons.push(format!("keywords:{}", keyword_hits));
        }

        ScoredShard {
            id: shard.id.clone(),
            score,
            match_reasons: reasons,
        }
    }).collect();

    // Sort descending by score
    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    scored
}

/// Score shards from JSON input, return JSON output.
pub fn score_shards_json(json_input: &str) -> String {
    match serde_json::from_str::<ScoreRequest>(json_input) {
        Ok(request) => {
            let results = score_shards(&request);
            serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
        }
        Err(e) => format!(r#"[{{"error":"{}"}}]"#, e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_request() -> ScoreRequest {
        ScoreRequest {
            intent: "fix authentication bug".to_string(),
            domain: "security".to_string(),
            risk_class: Some("critical".to_string()),
            shards: vec![
                ShardInput {
                    id: "s1".to_string(),
                    domains: vec!["security".to_string()],
                    risk_class: "critical".to_string(),
                    weight: 0.5,
                    text_snippet: "Authentication tokens must be validated".to_string(),
                },
                ShardInput {
                    id: "s2".to_string(),
                    domains: vec!["testing".to_string()],
                    risk_class: "standard".to_string(),
                    weight: 0.3,
                    text_snippet: "Run unit tests before merge".to_string(),
                },
                ShardInput {
                    id: "s3".to_string(),
                    domains: vec!["security".to_string(), "coding".to_string()],
                    risk_class: "critical".to_string(),
                    weight: 0.4,
                    text_snippet: "Fix bugs in auth flow carefully".to_string(),
                },
            ],
        }
    }

    #[test]
    fn test_scoring_order() {
        let request = make_request();
        let results = score_shards(&request);
        // s1 should be highest: domain match + risk match + keyword overlap
        assert_eq!(results[0].id, "s1");
        assert!(results[0].score > results[1].score);
    }

    #[test]
    fn test_domain_bonus() {
        let request = make_request();
        let results = score_shards(&request);
        let s1 = results.iter().find(|r| r.id == "s1").unwrap();
        assert!(s1.match_reasons.iter().any(|r| r.starts_with("domain:")));
    }

    #[test]
    fn test_risk_class_bonus() {
        let request = make_request();
        let results = score_shards(&request);
        let s1 = results.iter().find(|r| r.id == "s1").unwrap();
        assert!(s1.match_reasons.iter().any(|r| r.starts_with("risk:")));
    }

    #[test]
    fn test_json_roundtrip() {
        let json = serde_json::to_string(&make_request()).unwrap();
        let output = score_shards_json(&json);
        assert!(output.starts_with('['));
        assert!(output.contains("s1"));
    }
}
