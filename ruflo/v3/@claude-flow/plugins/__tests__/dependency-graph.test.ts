/**
 * Dependency Graph Tests
 *
 * Comprehensive tests for version constraints, dependency resolution,
 * and safe unload functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DependencyGraph,
  parseVersion,
  compareVersions,
  satisfiesVersion,
  type PluginDependency,
} from '../src/registry/dependency-graph.js';

// ============================================================================
// Version Parsing Tests
// ============================================================================

describe('parseVersion', () => {
  it('should parse valid semver versions', () => {
    expect(parseVersion('1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(parseVersion('3.2.1')).toEqual({ major: 3, minor: 2, patch: 1 });
    expect(parseVersion('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 });
  });

  it('should parse versions with prerelease suffixes', () => {
    expect(parseVersion('1.0.0-alpha')).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(parseVersion('2.0.0-beta.1')).toEqual({ major: 2, minor: 0, patch: 0 });
  });

  it('should return null for invalid versions', () => {
    expect(parseVersion('invalid')).toBeNull();
    expect(parseVersion('1.0')).toBeNull();
    expect(parseVersion('1')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

// ============================================================================
// Version Comparison Tests
// ============================================================================

describe('compareVersions', () => {
  it('should compare major versions', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('should compare minor versions', () => {
    expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.2.0')).toBe(-1);
    expect(compareVersions('1.1.0', '1.1.0')).toBe(0);
  });

  it('should compare patch versions', () => {
    expect(compareVersions('1.0.2', '1.0.1')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.2')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0.1')).toBe(0);
  });

  it('should handle complex comparisons', () => {
    expect(compareVersions('2.1.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.9.9', '2.0.0')).toBe(-1);
  });
});

// ============================================================================
// Version Satisfies Tests
// ============================================================================

describe('satisfiesVersion', () => {
  describe('wildcard', () => {
    it('should match any version with *', () => {
      expect(satisfiesVersion('*', '1.0.0')).toBe(true);
      expect(satisfiesVersion('*', '99.99.99')).toBe(true);
    });

    it('should match any version with empty string', () => {
      expect(satisfiesVersion('', '1.0.0')).toBe(true);
    });
  });

  describe('exact match', () => {
    it('should match exact versions', () => {
      expect(satisfiesVersion('1.0.0', '1.0.0')).toBe(true);
      expect(satisfiesVersion('2.3.4', '2.3.4')).toBe(true);
    });

    it('should reject non-matching versions', () => {
      expect(satisfiesVersion('1.0.0', '1.0.1')).toBe(false);
      expect(satisfiesVersion('1.0.0', '2.0.0')).toBe(false);
    });
  });

  describe('caret range (^)', () => {
    it('should match compatible versions', () => {
      expect(satisfiesVersion('^1.0.0', '1.0.0')).toBe(true);
      expect(satisfiesVersion('^1.0.0', '1.0.1')).toBe(true);
      expect(satisfiesVersion('^1.0.0', '1.5.0')).toBe(true);
      expect(satisfiesVersion('^1.0.0', '1.99.99')).toBe(true);
    });

    it('should reject incompatible major versions', () => {
      expect(satisfiesVersion('^1.0.0', '2.0.0')).toBe(false);
      expect(satisfiesVersion('^1.0.0', '0.9.9')).toBe(false);
    });

    it('should reject lower minor/patch than minimum', () => {
      expect(satisfiesVersion('^1.2.3', '1.2.2')).toBe(false);
      expect(satisfiesVersion('^1.2.3', '1.1.0')).toBe(false);
    });
  });

  describe('tilde range (~)', () => {
    it('should match patch versions', () => {
      expect(satisfiesVersion('~1.2.0', '1.2.0')).toBe(true);
      expect(satisfiesVersion('~1.2.0', '1.2.5')).toBe(true);
      expect(satisfiesVersion('~1.2.0', '1.2.99')).toBe(true);
    });

    it('should reject different minor versions', () => {
      expect(satisfiesVersion('~1.2.0', '1.3.0')).toBe(false);
      expect(satisfiesVersion('~1.2.0', '1.1.0')).toBe(false);
    });

    it('should reject different major versions', () => {
      expect(satisfiesVersion('~1.2.0', '2.2.0')).toBe(false);
    });
  });

  describe('comparison operators', () => {
    it('should handle >=', () => {
      expect(satisfiesVersion('>=1.0.0', '1.0.0')).toBe(true);
      expect(satisfiesVersion('>=1.0.0', '2.0.0')).toBe(true);
      expect(satisfiesVersion('>=1.0.0', '0.9.0')).toBe(false);
    });

    it('should handle <=', () => {
      expect(satisfiesVersion('<=2.0.0', '2.0.0')).toBe(true);
      expect(satisfiesVersion('<=2.0.0', '1.0.0')).toBe(true);
      expect(satisfiesVersion('<=2.0.0', '3.0.0')).toBe(false);
    });

    it('should handle >', () => {
      expect(satisfiesVersion('>1.0.0', '1.0.1')).toBe(true);
      expect(satisfiesVersion('>1.0.0', '2.0.0')).toBe(true);
      expect(satisfiesVersion('>1.0.0', '1.0.0')).toBe(false);
    });

    it('should handle <', () => {
      expect(satisfiesVersion('<2.0.0', '1.9.9')).toBe(true);
      expect(satisfiesVersion('<2.0.0', '1.0.0')).toBe(true);
      expect(satisfiesVersion('<2.0.0', '2.0.0')).toBe(false);
    });
  });

  describe('range expressions', () => {
    it('should handle AND ranges', () => {
      expect(satisfiesVersion('>=1.0.0 <2.0.0', '1.5.0')).toBe(true);
      expect(satisfiesVersion('>=1.0.0 <2.0.0', '1.0.0')).toBe(true);
      expect(satisfiesVersion('>=1.0.0 <2.0.0', '1.9.9')).toBe(true);
      expect(satisfiesVersion('>=1.0.0 <2.0.0', '2.0.0')).toBe(false);
      expect(satisfiesVersion('>=1.0.0 <2.0.0', '0.9.9')).toBe(false);
    });
  });
});

// ============================================================================
// Dependency Graph Tests
// ============================================================================

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  describe('addPlugin', () => {
    it('should add a plugin without dependencies', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      expect(graph.hasPlugin('plugin-a')).toBe(true);
      expect(graph.getVersion('plugin-a')).toBe('1.0.0');
    });

    it('should add a plugin with dependencies', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);

      expect(graph.getDependencies('plugin-b')).toEqual(['plugin-a']);
      expect(graph.getDependents('plugin-a')).toEqual(['plugin-b']);
    });
  });

  describe('removePlugin', () => {
    it('should remove a plugin and its edges', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);

      graph.removePlugin('plugin-b');

      expect(graph.hasPlugin('plugin-b')).toBe(false);
      expect(graph.getDependents('plugin-a')).toEqual([]);
    });

    it('should handle removing a plugin with dependents', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);

      graph.removePlugin('plugin-a');

      expect(graph.hasPlugin('plugin-a')).toBe(false);
      expect(graph.getDependencies('plugin-b')).toEqual([]);
    });
  });

  describe('getDependencies', () => {
    it('should return direct dependencies', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0');
      graph.addPlugin('plugin-c', '1.0.0', [
        { name: 'plugin-a', version: '^1.0.0' },
        { name: 'plugin-b', version: '^1.0.0' },
      ]);

      expect(graph.getDependencies('plugin-c')).toEqual(['plugin-a', 'plugin-b']);
    });

    it('should return empty array for plugin with no dependencies', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      expect(graph.getDependencies('plugin-a')).toEqual([]);
    });
  });

  describe('getDependents', () => {
    it('should return plugins that depend on this one', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);
      graph.addPlugin('plugin-c', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);

      const dependents = graph.getDependents('plugin-a');
      expect(dependents).toContain('plugin-b');
      expect(dependents).toContain('plugin-c');
      expect(dependents).toHaveLength(2);
    });
  });

  describe('getAllDependencies', () => {
    it('should return transitive dependencies', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);
      graph.addPlugin('plugin-c', '1.0.0', [{ name: 'plugin-b', version: '^1.0.0' }]);

      const allDeps = graph.getAllDependencies('plugin-c');
      expect(allDeps).toContain('plugin-a');
      expect(allDeps).toContain('plugin-b');
    });
  });

  describe('getAllDependents', () => {
    it('should return transitive dependents', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);
      graph.addPlugin('plugin-c', '1.0.0', [{ name: 'plugin-b', version: '^1.0.0' }]);

      const allDependents = graph.getAllDependents('plugin-a');
      expect(allDependents).toContain('plugin-b');
      expect(allDependents).toContain('plugin-c');
    });
  });

  describe('canSafelyRemove', () => {
    it('should return true for plugins with no dependents', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      expect(graph.canSafelyRemove('plugin-a')).toBe(true);
    });

    it('should return false for plugins with dependents', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);

      expect(graph.canSafelyRemove('plugin-a')).toBe(false);
    });
  });

  describe('getRemovalOrder', () => {
    it('should return correct removal order (dependents first)', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);
      graph.addPlugin('plugin-c', '1.0.0', [{ name: 'plugin-b', version: '^1.0.0' }]);

      const order = graph.getRemovalOrder('plugin-a');
      expect(order.indexOf('plugin-c')).toBeLessThan(order.indexOf('plugin-b'));
      expect(order.indexOf('plugin-b')).toBeLessThan(order.indexOf('plugin-a'));
    });
  });

  describe('validate', () => {
    it('should detect missing dependencies', () => {
      graph.addPlugin('plugin-a', '1.0.0', [{ name: 'missing-plugin', version: '^1.0.0' }]);

      const errors = graph.validate();
      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe('missing');
      expect(errors[0].dependency).toBe('missing-plugin');
    });

    it('should detect version mismatches', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^2.0.0' }]);

      const errors = graph.validate();
      expect(errors.some(e => e.type === 'version_mismatch')).toBe(true);
    });

    it('should detect circular dependencies', () => {
      graph.addPlugin('plugin-a', '1.0.0', [{ name: 'plugin-c', version: '^1.0.0' }]);
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);
      graph.addPlugin('plugin-c', '1.0.0', [{ name: 'plugin-b', version: '^1.0.0' }]);

      const errors = graph.validate();
      expect(errors.some(e => e.type === 'circular')).toBe(true);
    });

    it('should pass validation for valid dependencies', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.5.0', [{ name: 'plugin-a', version: '^1.0.0' }]);

      const errors = graph.validate();
      expect(errors).toHaveLength(0);
    });
  });

  describe('detectCircular', () => {
    it('should detect simple cycles', () => {
      graph.addPlugin('plugin-a', '1.0.0', [{ name: 'plugin-b', version: '^1.0.0' }]);
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);

      const cycles = graph.detectCircular();
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should detect longer cycles', () => {
      graph.addPlugin('plugin-a', '1.0.0', [{ name: 'plugin-b', version: '^1.0.0' }]);
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-c', version: '^1.0.0' }]);
      graph.addPlugin('plugin-c', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);

      const cycles = graph.detectCircular();
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should return empty array for acyclic graphs', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);
      graph.addPlugin('plugin-c', '1.0.0', [{ name: 'plugin-b', version: '^1.0.0' }]);

      const cycles = graph.detectCircular();
      expect(cycles).toHaveLength(0);
    });
  });

  describe('getLoadOrder', () => {
    it('should return topological order', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);
      graph.addPlugin('plugin-c', '1.0.0', [{ name: 'plugin-b', version: '^1.0.0' }]);

      const order = graph.getLoadOrder();
      expect(order.indexOf('plugin-a')).toBeLessThan(order.indexOf('plugin-b'));
      expect(order.indexOf('plugin-b')).toBeLessThan(order.indexOf('plugin-c'));
    });

    it('should handle multiple roots', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0');
      graph.addPlugin('plugin-c', '1.0.0', [
        { name: 'plugin-a', version: '^1.0.0' },
        { name: 'plugin-b', version: '^1.0.0' },
      ]);

      const order = graph.getLoadOrder();
      expect(order.indexOf('plugin-a')).toBeLessThan(order.indexOf('plugin-c'));
      expect(order.indexOf('plugin-b')).toBeLessThan(order.indexOf('plugin-c'));
    });
  });

  describe('getDepthLevels', () => {
    it('should group plugins by dependency depth', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0');
      graph.addPlugin('plugin-c', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);
      graph.addPlugin('plugin-d', '1.0.0', [{ name: 'plugin-c', version: '^1.0.0' }]);

      const levels = graph.getDepthLevels();

      expect(levels[0]).toContain('plugin-a');
      expect(levels[0]).toContain('plugin-b');
      expect(levels[1]).toContain('plugin-c');
      expect(levels[2]).toContain('plugin-d');
    });

    it('should handle complex dependency trees', () => {
      graph.addPlugin('core', '1.0.0');
      graph.addPlugin('utils', '1.0.0', [{ name: 'core', version: '^1.0.0' }]);
      graph.addPlugin('auth', '1.0.0', [{ name: 'core', version: '^1.0.0' }]);
      graph.addPlugin('api', '1.0.0', [
        { name: 'utils', version: '^1.0.0' },
        { name: 'auth', version: '^1.0.0' },
      ]);

      const levels = graph.getDepthLevels();

      expect(levels[0]).toContain('core');
      expect(levels[1]).toContain('utils');
      expect(levels[1]).toContain('auth');
      expect(levels[2]).toContain('api');
    });
  });

  describe('toJSON', () => {
    it('should export graph structure', () => {
      graph.addPlugin('plugin-a', '1.0.0');
      graph.addPlugin('plugin-b', '1.0.0', [{ name: 'plugin-a', version: '^1.0.0' }]);

      const json = graph.toJSON() as any;

      expect(json.nodes).toHaveLength(2);
      expect(json.edges).toHaveLength(2);
    });
  });
});
