//! Ultra-Optimized Topological Sort
//!
//! Target: <0.3ms for 1000 nodes (500x faster than JavaScript)
//!
//! Optimizations:
//! - Kahn's algorithm with pre-allocated queues
//! - FxHash for O(1) lookups
//! - Cache-friendly iteration order
//! - Parallel-ready execution levels

use wasm_bindgen::prelude::*;
use petgraph::algo::toposort;
use gastown_shared::{FxHashMap, pool::SmallBuffer};
use crate::{BeadNode, TopoSortResult};
use crate::dag::build_graph;

/// Perform topological sort on beads
///
/// # Performance
/// Target: <0.3ms for 1000 nodes
#[inline]
pub fn topo_sort_impl(beads_json: &str) -> Result<String, JsValue> {
    let beads: Vec<BeadNode> = serde_json::from_str(beads_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    let result = topo_sort_internal(&beads);

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Internal topological sort implementation
///
/// Uses Kahn's algorithm for better cache locality on large graphs
#[inline]
pub fn topo_sort_internal(beads: &[BeadNode]) -> TopoSortResult {
    if beads.is_empty() {
        return TopoSortResult {
            sorted: vec![],
            has_cycle: false,
            cycle_nodes: vec![],
        };
    }

    // For small graphs, use petgraph's optimized implementation
    if beads.len() <= 100 {
        return topo_sort_petgraph(beads);
    }

    // For larger graphs, use our optimized Kahn's algorithm
    topo_sort_kahn(beads)
}

/// Topological sort using petgraph (optimized for small graphs)
#[inline]
fn topo_sort_petgraph(beads: &[BeadNode]) -> TopoSortResult {
    let graph = build_graph(beads);

    match toposort(&graph, None) {
        Ok(order) => {
            let sorted: Vec<String> = order.iter()
                .map(|idx| graph[*idx].clone())
                .collect();

            TopoSortResult {
                sorted,
                has_cycle: false,
                cycle_nodes: vec![],
            }
        }
        Err(cycle) => {
            let cycle_node = graph[cycle.node_id()].clone();

            TopoSortResult {
                sorted: vec![],
                has_cycle: true,
                cycle_nodes: vec![cycle_node],
            }
        }
    }
}

/// Topological sort using Kahn's algorithm (optimized for large graphs)
///
/// Kahn's algorithm has better cache locality for large graphs
/// because it processes nodes in BFS order rather than DFS.
#[inline]
fn topo_sort_kahn(beads: &[BeadNode]) -> TopoSortResult {
    let n = beads.len();

    // Build index mappings
    let mut id_to_index: FxHashMap<&str, usize> = FxHashMap::default();
    id_to_index.reserve(n);

    for (i, bead) in beads.iter().enumerate() {
        id_to_index.insert(&bead.id, i);
    }

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
    let mut sorted: Vec<String> = Vec::with_capacity(n);

    while let Some(i) = queue.pop_front() {
        sorted.push(beads[i].id.clone());

        for &j in &successors[i] {
            in_degree[j] -= 1;
            if in_degree[j] == 0 {
                queue.push_back(j);
            }
        }
    }

    // Check for cycles
    if sorted.len() != n {
        // Find nodes that weren't processed (they're in a cycle)
        let sorted_set: std::collections::HashSet<_> = sorted.iter().collect();
        let cycle_nodes: Vec<String> = beads.iter()
            .filter(|b| !sorted_set.contains(&b.id))
            .map(|b| b.id.clone())
            .collect();

        TopoSortResult {
            sorted: vec![],
            has_cycle: true,
            cycle_nodes,
        }
    } else {
        TopoSortResult {
            sorted,
            has_cycle: false,
            cycle_nodes: vec![],
        }
    }
}

/// Get beads in execution order with parallel groups
#[inline]
pub fn get_execution_order_impl(beads_json: &str) -> Result<String, JsValue> {
    let beads: Vec<BeadNode> = serde_json::from_str(beads_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    let order = get_execution_order_internal(&beads)?;

    serde_json::to_string(&order)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

/// Group beads into parallel execution waves
#[inline]
fn get_execution_order_internal(beads: &[BeadNode]) -> Result<Vec<Vec<String>>, JsValue> {
    let result = topo_sort_internal(beads);

    if result.has_cycle {
        return Err(JsValue::from_str("Cannot compute execution order: cycle detected"));
    }

    if beads.is_empty() {
        return Ok(vec![]);
    }

    // Build level map
    let mut id_to_bead: FxHashMap<&str, &BeadNode> = FxHashMap::default();
    id_to_bead.reserve(beads.len());

    for bead in beads {
        id_to_bead.insert(&bead.id, bead);
    }

    let mut levels: FxHashMap<String, usize> = FxHashMap::default();
    levels.reserve(beads.len());

    let mut max_level = 0;

    // Compute level for each bead in topological order
    for id in &result.sorted {
        if let Some(bead) = id_to_bead.get(id.as_str()) {
            let level = if bead.blocked_by.is_empty() {
                0
            } else {
                bead.blocked_by.iter()
                    .filter_map(|dep| levels.get(dep))
                    .max()
                    .map(|l| l + 1)
                    .unwrap_or(0)
            };
            levels.insert(id.clone(), level);
            max_level = max_level.max(level);
        }
    }

    // Group by level
    let mut waves: Vec<Vec<String>> = vec![Vec::new(); max_level + 1];
    for (id, level) in &levels {
        waves[*level].push(id.clone());
    }

    Ok(waves)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_topo_sort_linear() {
        let beads = vec![
            BeadNode {
                id: "a".to_string(),
                title: "A".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec![],
                blocks: vec!["b".to_string()],
                duration: None,
            },
            BeadNode {
                id: "b".to_string(),
                title: "B".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec!["a".to_string()],
                blocks: vec!["c".to_string()],
                duration: None,
            },
            BeadNode {
                id: "c".to_string(),
                title: "C".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec!["b".to_string()],
                blocks: vec![],
                duration: None,
            },
        ];

        let result = topo_sort_internal(&beads);

        assert!(!result.has_cycle);
        assert_eq!(result.sorted.len(), 3);

        // Verify order: a before b before c
        let pos = |id: &str| result.sorted.iter().position(|x| x == id);
        assert!(pos("a") < pos("b"));
        assert!(pos("b") < pos("c"));
    }

    #[test]
    fn test_topo_sort_diamond() {
        // Diamond dependency: a -> b, a -> c, b -> d, c -> d
        let beads = vec![
            BeadNode {
                id: "a".to_string(),
                title: "A".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec![],
                blocks: vec!["b".to_string(), "c".to_string()],
                duration: None,
            },
            BeadNode {
                id: "b".to_string(),
                title: "B".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec!["a".to_string()],
                blocks: vec!["d".to_string()],
                duration: None,
            },
            BeadNode {
                id: "c".to_string(),
                title: "C".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec!["a".to_string()],
                blocks: vec!["d".to_string()],
                duration: None,
            },
            BeadNode {
                id: "d".to_string(),
                title: "D".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec!["b".to_string(), "c".to_string()],
                blocks: vec![],
                duration: None,
            },
        ];

        let result = topo_sort_internal(&beads);

        assert!(!result.has_cycle);
        assert_eq!(result.sorted.len(), 4);

        // Verify order: a first, d last
        let pos = |id: &str| result.sorted.iter().position(|x| x == id);
        assert_eq!(pos("a"), Some(0));
        assert_eq!(pos("d"), Some(3));
    }

    #[test]
    fn test_execution_waves() {
        let beads = vec![
            BeadNode {
                id: "a".to_string(),
                title: "A".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec![],
                blocks: vec!["c".to_string()],
                duration: None,
            },
            BeadNode {
                id: "b".to_string(),
                title: "B".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec![],
                blocks: vec!["c".to_string()],
                duration: None,
            },
            BeadNode {
                id: "c".to_string(),
                title: "C".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec!["a".to_string(), "b".to_string()],
                blocks: vec![],
                duration: None,
            },
        ];

        let waves = get_execution_order_internal(&beads).unwrap();

        // Wave 0: a and b (can run in parallel)
        // Wave 1: c (depends on both a and b)
        assert_eq!(waves.len(), 2);
        assert_eq!(waves[0].len(), 2);
        assert!(waves[0].contains(&"a".to_string()));
        assert!(waves[0].contains(&"b".to_string()));
        assert_eq!(waves[1], vec!["c".to_string()]);
    }

    #[test]
    fn test_topo_sort_cycle() {
        let beads = vec![
            BeadNode {
                id: "a".to_string(),
                title: "A".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec!["b".to_string()],
                blocks: vec!["b".to_string()],
                duration: None,
            },
            BeadNode {
                id: "b".to_string(),
                title: "B".to_string(),
                status: "open".to_string(),
                priority: 0,
                blocked_by: vec!["a".to_string()],
                blocks: vec!["a".to_string()],
                duration: None,
            },
        ];

        let result = topo_sort_kahn(&beads);
        assert!(result.has_cycle);
        assert!(!result.cycle_nodes.is_empty());
    }
}
