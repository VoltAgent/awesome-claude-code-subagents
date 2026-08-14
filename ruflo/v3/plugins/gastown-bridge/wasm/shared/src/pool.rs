//! Memory Pool
//!
//! Reusable memory pools for avoiding repeated allocations.
//! Particularly useful for batch operations.

use std::cell::RefCell;
use smallvec::SmallVec;

/// A pool of reusable vectors
pub struct VecPool<T> {
    pool: RefCell<Vec<Vec<T>>>,
    default_capacity: usize,
}

impl<T> VecPool<T> {
    /// Create a new vector pool
    #[inline]
    pub fn new(default_capacity: usize) -> Self {
        Self {
            pool: RefCell::new(Vec::new()),
            default_capacity,
        }
    }

    /// Get a vector from the pool (or create a new one)
    #[inline(always)]
    pub fn get(&self) -> Vec<T> {
        self.pool
            .borrow_mut()
            .pop()
            .unwrap_or_else(|| Vec::with_capacity(self.default_capacity))
    }

    /// Return a vector to the pool for reuse
    #[inline(always)]
    pub fn put(&self, mut vec: Vec<T>) {
        vec.clear();
        self.pool.borrow_mut().push(vec);
    }
}

impl<T> Default for VecPool<T> {
    fn default() -> Self {
        Self::new(32)
    }
}

/// A pool of reusable hash maps
pub struct MapPool<K, V> {
    pool: RefCell<Vec<super::FxHashMap<K, V>>>,
    default_capacity: usize,
}

impl<K, V> MapPool<K, V> {
    /// Create a new map pool
    #[inline]
    pub fn new(default_capacity: usize) -> Self {
        Self {
            pool: RefCell::new(Vec::new()),
            default_capacity,
        }
    }

    /// Get a map from the pool (or create a new one)
    #[inline(always)]
    pub fn get(&self) -> super::FxHashMap<K, V> {
        self.pool
            .borrow_mut()
            .pop()
            .unwrap_or_else(|| super::hash::new_map_with_capacity(self.default_capacity))
    }

    /// Return a map to the pool for reuse
    #[inline(always)]
    pub fn put(&self, mut map: super::FxHashMap<K, V>) {
        map.clear();
        self.pool.borrow_mut().push(map);
    }
}

impl<K, V> Default for MapPool<K, V> {
    fn default() -> Self {
        Self::new(32)
    }
}

/// A general memory pool for typed objects
pub struct MemoryPool<T> {
    pool: RefCell<Vec<T>>,
    factory: fn() -> T,
    reset: fn(&mut T),
}

impl<T> MemoryPool<T> {
    /// Create a new memory pool with custom factory and reset functions
    #[inline]
    pub fn new(factory: fn() -> T, reset: fn(&mut T)) -> Self {
        Self {
            pool: RefCell::new(Vec::new()),
            factory,
            reset,
        }
    }

    /// Get an object from the pool (or create a new one)
    #[inline(always)]
    pub fn get(&self) -> T {
        self.pool
            .borrow_mut()
            .pop()
            .unwrap_or_else(|| (self.factory)())
    }

    /// Return an object to the pool for reuse
    #[inline(always)]
    pub fn put(&self, mut obj: T) {
        (self.reset)(&mut obj);
        self.pool.borrow_mut().push(obj);
    }
}

/// Stack-allocated buffer for small operations
pub type SmallBuffer<T, const N: usize = 32> = SmallVec<[T; N]>;

/// Create a small buffer with inline capacity
#[inline(always)]
pub fn small_buffer<T, const N: usize>() -> SmallBuffer<T, N> {
    SmallVec::new()
}

/// Create a small buffer with initial values
#[inline(always)]
pub fn small_buffer_from<T: Clone, const N: usize>(slice: &[T]) -> SmallBuffer<T, N> {
    SmallVec::from_slice(slice)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vec_pool() {
        let pool: VecPool<i32> = VecPool::new(16);
        let mut v1 = pool.get();
        v1.push(1);
        v1.push(2);
        pool.put(v1);

        let v2 = pool.get();
        assert!(v2.is_empty());
        assert!(v2.capacity() >= 16);
    }

    #[test]
    fn test_small_buffer() {
        let mut buf: SmallBuffer<i32, 8> = small_buffer();
        for i in 0..8 {
            buf.push(i);
        }
        // Still on stack
        assert!(!buf.spilled());

        buf.push(8);
        // Now on heap
        assert!(buf.spilled());
    }
}
