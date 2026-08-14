//! Ultra-Optimized Critical Path Analysis
//!
//! Target: <0.2ms for critical path computation (500x faster than JavaScript)
//!
//! Optimizations:
//! - Forward/backward pass with pre-allocated arrays
//! - FxHash for O(1) lookups
//! - Single-pass duration aggregation
//! - Cache-friendly memory layout

use wasm_bindgen::prelude::*;
use gastown_shared::{FxHashMap, pool::SmallBuffer};
use crate::{BeadNode, CriticalPathResult};

/// Compute critical path through bead dependencies
///
/// # Performance
/// Target: <0.2ms
#[inline]
pub fn critical_path_impl(beads_json: &str) -> Result<String, JsValue> {
    let beads: Vec<BeadNode> = serde_json::from_str(beads_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    let result = critical_path_internal(&beads)?;

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Internal critical path computation using forward and backward pass
///
/// Uses pre-allocated arrays for cache efficiency
#[inline]
fn critical_path_internal(beads: &[BeadNode]) -> Result<CriticalPathResult, JsValue> {
    if beads.is_empty() {
        return Ok(CriticalPathResult {
            path: vec![],
            total_duration: 0,
            slack: FxHashMap::default(),
        });
    }

    let n = beads.len();

    // Build lookup maps
    let mut id_to_index: FxHashMap<&str, usize> = FxHashMap::default();
    id_to_index.reserve(n);

    let mut durations: Vec<u32> = Vec::with_capacity(n);

    for (i, bead) in beads.iter().enumerate() {
        id_to_index.insert(&bead.id, i);
        durations.push(bead.duration.unwrap_or(1));
    }

    // Find topological order using Kahn's algorithm
    let topo_order = topo_sort_kahn_indices(beads, &id_to_index)?;

    // Forward pass: compute earliest start and finish times
    let mut earliest_start: Vec<u32> = vec![0; n];
    let mut earliest_finish: Vec<u32> = vec![0; n];

    for &i in &topo_order {
        let bead = &beads[i];
        let es = if bead.blocked_by.is_empty() {
            0
        } else {
            bead.blocked_by.iter()
                .filter_map(|dep| id_to_index.get(dep.as_str()))
                .map(|&j| earliest_finish[j])
                .max()
                .unwrap_or(0)
        };
        earliest_start[i] = es;
        earliest_finish[i] = es + durations[i];
    }

    // Find project completion time
    let project_duration = earliest_finish.iter().max().copied().unwrap_or(0);

    // Backward pass: compute latest start and finish times
    let mut latest_finish: Vec<u32> = vec![project_duration; n];
    let mut latest_start: Vec<u32> = vec![0; n];

    // Build successors map for backward pass
    let mut successors: Vec<SmallBuffer<usize, 8>> = vec![SmallBuffer::new(); n];
    for bead in beads {
        if let Some(&i) = id_to_index.get(bead.id.as_str()) {
            for blocked in &bead.blocks {
                if let Some(&j) = id_to_index.get(blocked.as_str()) {
                    successors[i].push(j);
                }
            }
        }
    }

    for &i in topo_order.iter().rev() {
        let lf = if successors[i].is_empty() {
            project_duration
        } else {
            successors[i].iter()
                .map(|&j| latest_start[j])
                .min()
                .unwrap_or(project_duration)
        };
        latest_finish[i] = lf;
        latest_start[i] = lf.saturating_sub(durations[i]);
    }

    // Compute slack and find critical path
    let mut slack: FxHashMap<String, u32> = FxHashMap::default();
    slack.reserve(n);

    let mut critical_indices: Vec<usize> = Vec::new();

    for i in 0..n {
        let s = latest_start[i].saturating_sub(earliest_start[i]);
        slack.insert(beads[i].id.clone(), s);

        if s == 0 {
            critical_indices.push(i);
        }
    }

    // Build critical path (following dependencies through critical nodes)
    let path = build_critical_path_optimized(&critical_indices, beads, &id_to_index, &successors);

    Ok(CriticalPathResult {
        path,
        total_duration: project_duration,
        slack,
    })
}

/// Topological sort using Kahn's algorithm returning indices
#[inline]
fn topo_sort_kahn_indices(beads: &[BeadNode], id_to_index: &FxHashMap<&str, usize>) -> Result<Vec<usize>, JsValue> {
    let n = beads.len();

    // Compute in-degrees
    let mut in_degree: Vec<usize> = vec![0; n];
    let mut successors: Vec<SmallBuffer<usize, 8>> = vec![SmallBuffer::new(); n];

    for (i, bead) in beads.iter().enumerate() {
        in_degree[i] = bead.blocked_by.len();

        for blocked in &bead.blocks {
            if let Some(&j) = id_to_index.get(blocked.as_str()) {
                successors[i].push(j);
            }
        }
    }

    // Initialize queue with nodes that have no dependencies
    let mut queue: std::collections::VecDeque<usize> = std::collections::VecDeque::with_capacity(n);

    for i in 0..n {
        if in_degree[i] == 0 {
            queue.push_back(i);
        }
    }

    // Process nodes in topological order
    let mut result: Vec<usize> = Vec::with_capacity(n);

    while let Some(i) = queue.pop_front() {
        result.push(i);

        for &j in &successors[i] {
            in_degree[j] -= 1;
            if in_degree[j] == 0 {
                queue.push_back(j);
            }
        }
    }

    if result.len() != n {
        return Err(JsValue::from_str("Cycle detected in dependency graph"));
    }

    Ok(result)
}

/// Build the critical path by following dependencies through critical nodes
#[inline]
fn build_critical_path_optimized(
    critical_indices: &[usize],
    beads: &[BeadNode],
    id_to_index: &FxHashMap<&str, usize>,
    successors: &[SmallBuffer<usize, 8>],
) -> Vec<String> {
    if critical_indices.is_empty() {
        return vec![];
    }

    let critical_set: std::collections::HashSet<usize> = critical_indices.iter().copied().collect();

    // Find starting node (critical node with no critical dependencies)
    let mut start = None;
    for &i in critical_indices {
        let has_critical_dep = beads[i].blocked_by.iter()
            .filter_map(|dep| id_to_index.get(dep.as_str()))
            .any(|&j| critical_set.contains(&j));

        if !has_critical_dep {
            start = Some(i);
            break;
        }
    }

    let Some(start_idx) = start else {
        // If no clear start, return first critical node
        return critical_indices.iter()
            .map(|&i| beads[i].id.clone())
            .collect();
    };

    // Build path by following critical successors
    let mut path = vec![beads[start_idx].id.clone()];
    let mut current = start_idx;

    loop {
        // Find critical successor
        let critical_succ = successors[current].iter()
            .copied()
            .find(|&j| critical_set.contains(&j));

        match critical_succ {
            Some(j) => {
                path.push(beads[j].id.clone());
                current = j;
            }
            None => break,
        }
    }

    path
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_critical_path_linear() {
        let beads = vec![
            BeadNode {
                id: "a".to_string(),
                title: "A".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec![],
                blocks: vec!["b".to_string()],
                duration: Some(10),
            },
            BeadNode {
                id: "b".to_string(),
                title: "B".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec!["a".to_string()],
                blocks: vec!["c".to_string()],
                duration: Some(20),
            },
            BeadNode {
                id: "c".to_string(),
                title: "C".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec!["b".to_string()],
                blocks: vec![],
                duration: Some(15),
            },
        ];

        let result = critical_path_internal(&beads).unwrap();

        assert_eq!(result.total_duration, 45);
        assert_eq!(result.path.len(), 3);
        assert_eq!(result.path[0], "a");
        assert_eq!(result.path[1], "b");
        assert_eq!(result.path[2], "c");

        // All nodes are critical (no slack)
        for (_, s) in &result.slack {
            assert_eq!(*s, 0);
        }
    }

    #[test]
    fn test_critical_path_with_slack() {
        // a (10) -> c (5)
        // b (30) -> c (5)
        // Critical path: b -> c (35 total)
        // a has slack of 20
        let beads = vec![
            BeadNode {
                id: "a".to_string(),
                title: "A".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec![],
                blocks: vec!["c".to_string()],
                duration: Some(10),
            },
            BeadNode {
                id: "b".to_string(),
                title: "B".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec![],
                blocks: vec!["c".to_string()],
                duration: Some(30),
            },
            BeadNode {
                id: "c".to_string(),
                title: "C".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec!["a".to_string(), "b".to_string()],
                blocks: vec![],
                duration: Some(5),
            },
        ];

        let result = critical_path_internal(&beads).unwrap();

        assert_eq!(result.total_duration, 35);
        assert_eq!(result.slack.get("a"), Some(&20));
        assert_eq!(result.slack.get("b"), Some(&0));
        assert_eq!(result.slack.get("c"), Some(&0));
    }

    #[test]
    fn test_empty_beads() {
        let beads: Vec<BeadNode> = vec![];
        let result = critical_path_internal(&beads).unwrap();

        assert_eq!(result.total_duration, 0);
        assert!(result.path.is_empty());
        assert!(result.slack.is_empty());
    }

    #[test]
    fn test_single_bead() {
        let beads = vec![
            BeadNode {
                id: "only".to_string(),
                title: "Only".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec![],
                blocks: vec![],
                duration: Some(42),
            },
        ];

        let result = critical_path_internal(&beads).unwrap();

        assert_eq!(result.total_duration, 42);
        assert_eq!(result.path.len(), 1);
        assert_eq!(result.path[0], "only");
        assert_eq!(result.slack.get("only"), Some(&0));
    }
}
