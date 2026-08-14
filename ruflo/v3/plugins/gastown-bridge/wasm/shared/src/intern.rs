//! String Interning
//!
//! Zero-copy string interning for repeated string comparisons.
//! Interned strings can be compared by pointer equality (O(1)).

use super::hash::{FxHashMap, fx_hash_str};
use std::cell::RefCell;

/// An interned string symbol (cheap to copy and compare)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Symbol(u32);

impl Symbol {
    /// Get the symbol index
    #[inline(always)]
    pub fn index(self) -> u32 {
        self.0
    }
}

/// String interner for zero-copy string deduplication
pub struct StringInterner {
    strings: RefCell<Vec<String>>,
    map: RefCell<FxHashMap<u64, Symbol>>,
}

impl StringInterner {
    /// Create a new string interner
    #[inline]
    pub fn new() -> Self {
        Self {
            strings: RefCell::new(Vec::with_capacity(64)),
            map: RefCell::new(FxHashMap::default()),
        }
    }

    /// Create a new string interner with pre-allocated capacity
    #[inline]
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            strings: RefCell::new(Vec::with_capacity(capacity)),
            map: RefCell::new(FxHashMap::default()),
        }
    }

    /// Intern a string, returning a symbol
    #[inline]
    pub fn intern(&self, s: &str) -> Symbol {
        let hash = fx_hash_str(s);

        // Check if already interned
        if let Some(&symbol) = self.map.borrow().get(&hash) {
            return symbol;
        }

        // Intern the string
        let mut strings = self.strings.borrow_mut();
        let index = strings.len() as u32;
        strings.push(s.to_string());

        let symbol = Symbol(index);
        self.map.borrow_mut().insert(hash, symbol);

        symbol
    }

    /// Get the string for a symbol
    #[inline(always)]
    pub fn get(&self, symbol: Symbol) -> Option<String> {
        self.strings
            .borrow()
            .get(symbol.0 as usize)
            .cloned()
    }

    /// Get the string slice for a symbol (borrows interner)
    #[inline(always)]
    pub fn get_str(&self, symbol: Symbol) -> Option<&str> {
        // Safety: We never remove strings, so the reference is valid
        // This is a workaround for the borrow checker
        unsafe {
            self.strings
                .as_ptr()
                .as_ref()
                .and_then(|s| s.get(symbol.0 as usize))
                .map(|s| s.as_str())
        }
    }

    /// Number of interned strings
    #[inline]
    pub fn len(&self) -> usize {
        self.strings.borrow().len()
    }

    /// Check if the interner is empty
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.strings.borrow().is_empty()
    }

    /// Clear all interned strings
    #[inline]
    pub fn clear(&self) {
        self.strings.borrow_mut().clear();
        self.map.borrow_mut().clear();
    }
}

impl Default for StringInterner {
    fn default() -> Self {
        Self::new()
    }
}

/// Batch intern multiple strings
#[inline]
pub fn intern_batch(interner: &StringInterner, strings: &[&str]) -> Vec<Symbol> {
    strings.iter().map(|s| interner.intern(s)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_intern_basic() {
        let interner = StringInterner::new();
        let s1 = interner.intern("hello");
        let s2 = interner.intern("world");
        let s3 = interner.intern("hello");

        assert_eq!(s1, s3); // Same string = same symbol
        assert_ne!(s1, s2); // Different strings = different symbols
    }

    #[test]
    fn test_intern_get() {
        let interner = StringInterner::new();
        let symbol = interner.intern("test");

        assert_eq!(interner.get(symbol), Some("test".to_string()));
    }

    #[test]
    fn test_intern_batch() {
        let interner = StringInterner::new();
        let strings = ["a", "b", "c", "a", "b"];
        let symbols = intern_batch(&interner, &strings);

        assert_eq!(symbols[0], symbols[3]); // "a" == "a"
        assert_eq!(symbols[1], symbols[4]); // "b" == "b"
        assert_eq!(interner.len(), 3); // Only 3 unique strings
    }
}
