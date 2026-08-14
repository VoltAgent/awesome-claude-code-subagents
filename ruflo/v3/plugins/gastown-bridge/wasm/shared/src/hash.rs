//! Fast Hash Utilities
//!
//! FxHash is ~2x faster than std HashMap for small keys (< 64 bytes).
//! Based on rustc's internal hash implementation.

use rustc_hash::{FxHasher, FxBuildHasher as RustcFxBuildHasher};
use std::collections::{HashMap, HashSet};
use std::hash::BuildHasherDefault;

/// Type alias for FxHash-based HashMap
pub type FxHashMap<K, V> = HashMap<K, V, BuildHasherDefault<FxHasher>>;

/// Type alias for FxHash-based HashSet
pub type FxHashSet<T> = HashSet<T, BuildHasherDefault<FxHasher>>;

/// FxHash BuildHasher
pub type FxBuildHasher = BuildHasherDefault<FxHasher>;

/// Create a new FxHashMap with pre-allocated capacity
#[inline(always)]
pub fn new_map_with_capacity<K, V>(capacity: usize) -> FxHashMap<K, V> {
    FxHashMap::with_capacity_and_hasher(capacity, FxBuildHasher::default())
}

/// Create a new FxHashSet with pre-allocated capacity
#[inline(always)]
pub fn new_set_with_capacity<T>(capacity: usize) -> FxHashSet<T> {
    FxHashSet::with_capacity_and_hasher(capacity, FxBuildHasher::default())
}

/// Fast hash function for single values
#[inline(always)]
pub fn fx_hash<T: std::hash::Hash>(value: &T) -> u64 {
    use std::hash::Hasher;
    let mut hasher = FxHasher::default();
    value.hash(&mut hasher);
    hasher.finish()
}

/// Fast string hash (specialized for string slices)
#[inline(always)]
pub fn fx_hash_str(s: &str) -> u64 {
    fx_hash(&s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fxhashmap() {
        let mut map: FxHashMap<String, i32> = FxHashMap::default();
        map.insert("test".to_string(), 42);
        assert_eq!(map.get("test"), Some(&42));
    }

    #[test]
    fn test_fxhashset() {
        let mut set: FxHashSet<i32> = FxHashSet::default();
        set.insert(1);
        set.insert(2);
        assert!(set.contains(&1));
        assert!(set.contains(&2));
        assert!(!set.contains(&3));
    }

    #[test]
    fn test_fx_hash() {
        let h1 = fx_hash_str("hello");
        let h2 = fx_hash_str("hello");
        let h3 = fx_hash_str("world");
        assert_eq!(h1, h2);
        assert_ne!(h1, h3);
    }
}
