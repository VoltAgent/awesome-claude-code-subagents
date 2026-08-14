/**
 * Dependency Graph
 *
 * Manages plugin dependencies with version constraint checking,
 * safe unload detection, and topological sorting.
 */

// ============================================================================
// Types
// ============================================================================

export interface PluginDependency {
  name: string;
  version: string;        // Semver range: "^3.0.0", ">=2.1.0 <3.0.0", "*"
  optional?: boolean;     // Don't fail if missing
  peerDependency?: boolean;
}

export interface DependencyNode {
  name: string;
  version: string;
  dependencies: PluginDependency[];
}

export interface DependencyError {
  type: 'missing' | 'version_mismatch' | 'circular';
  plugin: string;
  dependency?: string;
  required?: string;
  actual?: string;
  message: string;
}

// ============================================================================
// Semver Utilities
// ============================================================================

/**
 * Parse a semver version string.
 */
export function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Compare two semver versions.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (!va || !vb) return 0;

  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;

  return 0;
}

/**
 * Check if a version satisfies a semver range.
 *
 * Supported formats:
 * - "*" - any version
 * - "3.0.0" - exact version
 * - "^3.0.0" - compatible with 3.x.x (major must match)
 * - "~3.1.0" - approximately 3.1.x (major.minor must match)
 * - ">=3.0.0" - greater than or equal
 * - "<=3.0.0" - less than or equal
 * - ">3.0.0" - greater than
 * - "<3.0.0" - less than
 * - ">=2.0.0 <3.0.0" - range (space-separated)
 */
export function satisfiesVersion(range: string, version: string): boolean {
  const trimmed = range.trim();

  // Wildcard
  if (trimmed === '*' || trimmed === '') return true;

  // Parse actual version
  const actual = parseVersion(version);
  if (!actual) return false;

  // Handle space-separated ranges (AND logic)
  if (trimmed.includes(' ')) {
    const parts = trimmed.split(/\s+/);
    return parts.every(part => satisfiesVersion(part, version));
  }

  // Caret range: ^3.0.0 means >=3.0.0 <4.0.0
  if (trimmed.startsWith('^')) {
    const required = parseVersion(trimmed.slice(1));
    if (!required) return false;

    return (
      actual.major === required.major &&
      (actual.minor > required.minor ||
        (actual.minor === required.minor && actual.patch >= required.patch))
    );
  }

  // Tilde range: ~3.1.0 means >=3.1.0 <3.2.0
  if (trimmed.startsWith('~')) {
    const required = parseVersion(trimmed.slice(1));
    if (!required) return false;

    return (
      actual.major === required.major &&
      actual.minor === required.minor &&
      actual.patch >= required.patch
    );
  }

  // Greater than or equal: >=3.0.0
  if (trimmed.startsWith('>=')) {
    const required = parseVersion(trimmed.slice(2));
    if (!required) return false;
    return compareVersions(version, trimmed.slice(2)) >= 0;
  }

  // Less than or equal: <=3.0.0
  if (trimmed.startsWith('<=')) {
    const required = parseVersion(trimmed.slice(2));
    if (!required) return false;
    return compareVersions(version, trimmed.slice(2)) <= 0;
  }

  // Greater than: >3.0.0
  if (trimmed.startsWith('>')) {
    const required = parseVersion(trimmed.slice(1));
    if (!required) return false;
    return compareVersions(version, trimmed.slice(1)) > 0;
  }

  // Less than: <3.0.0
  if (trimmed.startsWith('<')) {
    const required = parseVersion(trimmed.slice(1));
    if (!required) return false;
    return compareVersions(version, trimmed.slice(1)) < 0;
  }

  // Exact match
  const required = parseVersion(trimmed);
  if (!required) return false;
  return compareVersions(version, trimmed) === 0;
}

// ============================================================================
// Dependency Graph
// ============================================================================

/**
 * Dependency graph for plugin management.
 *
 * Features:
 * - Version constraint validation
 * - Circular dependency detection
 * - Safe unload checking (no dependents)
 * - Topological sort for load order
 * - Depth-level grouping for parallel initialization
 */
export class DependencyGraph {
  // Plugin name -> node data
  private nodes = new Map<string, DependencyNode>();

  // Forward edges: plugin -> plugins it depends on
  private dependencies = new Map<string, Set<string>>();

  // Reverse edges: plugin -> plugins that depend on it
  private dependents = new Map<string, Set<string>>();

  // =========================================================================
  // Node Management
  // =========================================================================

  /**
   * Add a plugin to the graph.
   */
  addPlugin(name: string, version: string, dependencies: PluginDependency[] = []): void {
    // Store node data
    this.nodes.set(name, { name, version, dependencies });

    // Initialize edge sets
    if (!this.dependencies.has(name)) {
      this.dependencies.set(name, new Set());
    }
    if (!this.dependents.has(name)) {
      this.dependents.set(name, new Set());
    }

    // Add edges
    for (const dep of dependencies) {
      this.dependencies.get(name)!.add(dep.name);

      // Ensure dependent set exists
      if (!this.dependents.has(dep.name)) {
        this.dependents.set(dep.name, new Set());
      }
      this.dependents.get(dep.name)!.add(name);
    }
  }

  /**
   * Remove a plugin from the graph.
   */
  removePlugin(name: string): void {
    const node = this.nodes.get(name);
    if (!node) return;

    // Remove forward edges
    const deps = this.dependencies.get(name) ?? new Set();
    for (const dep of deps) {
      this.dependents.get(dep)?.delete(name);
    }
    this.dependencies.delete(name);

    // Remove reverse edges
    const dependers = this.dependents.get(name) ?? new Set();
    for (const depender of dependers) {
      this.dependencies.get(depender)?.delete(name);
    }
    this.dependents.delete(name);

    // Remove node
    this.nodes.delete(name);
  }

  /**
   * Check if a plugin exists in the graph.
   */
  hasPlugin(name: string): boolean {
    return this.nodes.has(name);
  }

  /**
   * Get plugin version.
   */
  getVersion(name: string): string | undefined {
    return this.nodes.get(name)?.version;
  }

  // =========================================================================
  // Dependency Queries
  // =========================================================================

  /**
   * Get direct dependencies of a plugin.
   */
  getDependencies(name: string): string[] {
    return Array.from(this.dependencies.get(name) ?? []);
  }

  /**
   * Get direct dependents of a plugin (plugins that depend on it).
   */
  getDependents(name: string): string[] {
    return Array.from(this.dependents.get(name) ?? []);
  }

  /**
   * Get all transitive dependencies of a plugin.
   */
  getAllDependencies(name: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (current: string): void => {
      if (visited.has(current)) return;
      visited.add(current);

      const deps = this.dependencies.get(current) ?? new Set();
      for (const dep of deps) {
        visit(dep);
        if (!result.includes(dep)) {
          result.push(dep);
        }
      }
    };

    visit(name);
    return result;
  }

  /**
   * Get all transitive dependents of a plugin.
   */
  getAllDependents(name: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (current: string): void => {
      if (visited.has(current)) return;
      visited.add(current);

      const deps = this.dependents.get(current) ?? new Set();
      for (const dep of deps) {
        visit(dep);
        if (!result.includes(dep)) {
          result.push(dep);
        }
      }
    };

    visit(name);
    return result;
  }

  // =========================================================================
  // Safe Operations
  // =========================================================================

  /**
   * Check if a plugin can be safely removed (no dependents).
   */
  canSafelyRemove(name: string): boolean {
    const dependents = this.getDependents(name);
    return dependents.length === 0;
  }

  /**
   * Get the order to remove plugins for cascade unload.
   * Returns plugins in reverse dependency order (dependents first).
   */
  getRemovalOrder(name: string): string[] {
    const allDependents = this.getAllDependents(name);

    // Sort by reverse topological order
    // Plugins that depend on others should be removed first
    const sorted: string[] = [];
    const visited = new Set<string>();

    const visit = (current: string): void => {
      if (visited.has(current)) return;
      visited.add(current);

      // Visit dependents first (reverse order)
      const deps = this.dependents.get(current) ?? new Set();
      for (const dep of deps) {
        if (allDependents.includes(dep)) {
          visit(dep);
        }
      }

      sorted.push(current);
    };

    visit(name);
    return sorted;
  }

  // =========================================================================
  // Validation
  // =========================================================================

  /**
   * Validate all dependencies and return errors.
   */
  validate(): DependencyError[] {
    const errors: DependencyError[] = [];

    for (const [name, node] of this.nodes) {
      for (const dep of node.dependencies) {
        // Check if dependency exists
        const depNode = this.nodes.get(dep.name);

        if (!depNode) {
          if (!dep.optional) {
            errors.push({
              type: 'missing',
              plugin: name,
              dependency: dep.name,
              required: dep.version,
              message: `Plugin ${name} requires ${dep.name}@${dep.version} but it is not installed`,
            });
          }
          continue;
        }

        // Check version constraint
        if (!satisfiesVersion(dep.version, depNode.version)) {
          errors.push({
            type: 'version_mismatch',
            plugin: name,
            dependency: dep.name,
            required: dep.version,
            actual: depNode.version,
            message: `Plugin ${name} requires ${dep.name}@${dep.version} but found ${depNode.version}`,
          });
        }
      }
    }

    // Check for circular dependencies
    const circular = this.detectCircular();
    for (const cycle of circular) {
      errors.push({
        type: 'circular',
        plugin: cycle[0],
        message: `Circular dependency detected: ${cycle.join(' -> ')}`,
      });
    }

    return errors;
  }

  /**
   * Detect circular dependencies.
   * Returns array of cycles (each cycle is an array of plugin names).
   */
  detectCircular(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (name: string): void => {
      visited.add(name);
      recursionStack.add(name);
      path.push(name);

      const deps = this.dependencies.get(name) ?? new Set();
      for (const dep of deps) {
        if (!visited.has(dep)) {
          dfs(dep);
        } else if (recursionStack.has(dep)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep);
          const cycle = [...path.slice(cycleStart), dep];
          cycles.push(cycle);
        }
      }

      path.pop();
      recursionStack.delete(name);
    };

    for (const name of this.nodes.keys()) {
      if (!visited.has(name)) {
        dfs(name);
      }
    }

    return cycles;
  }

  // =========================================================================
  // Load Order
  // =========================================================================

  /**
   * Get topological sort order for loading plugins.
   * Dependencies come before dependents.
   */
  getLoadOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (name: string): void => {
      if (visited.has(name)) return;
      visited.add(name);

      // Visit dependencies first
      const deps = this.dependencies.get(name) ?? new Set();
      for (const dep of deps) {
        if (this.nodes.has(dep)) {
          visit(dep);
        }
      }

      order.push(name);
    };

    for (const name of this.nodes.keys()) {
      visit(name);
    }

    return order;
  }

  /**
   * Get plugins grouped by dependency depth.
   * Level 0 = no dependencies, Level 1 = depends only on level 0, etc.
   *
   * Useful for parallel initialization: init all level N before starting level N+1.
   */
  getDepthLevels(): string[][] {
    const depths = new Map<string, number>();
    const order = this.getLoadOrder();

    // Calculate depth for each plugin
    for (const name of order) {
      const deps = this.dependencies.get(name) ?? new Set();
      let maxDepth = -1;

      for (const dep of deps) {
        const depDepth = depths.get(dep);
        if (depDepth !== undefined && depDepth > maxDepth) {
          maxDepth = depDepth;
        }
      }

      depths.set(name, maxDepth + 1);
    }

    // Group by depth
    const levels: string[][] = [];
    for (const [name, depth] of depths) {
      while (levels.length <= depth) {
        levels.push([]);
      }
      levels[depth].push(name);
    }

    return levels;
  }

  // =========================================================================
  // Utilities
  // =========================================================================

  /**
   * Get all plugin names.
   */
  getPluginNames(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Get plugin count.
   */
  size(): number {
    return this.nodes.size;
  }

  /**
   * Clear the graph.
   */
  clear(): void {
    this.nodes.clear();
    this.dependencies.clear();
    this.dependents.clear();
  }

  /**
   * Export graph state for debugging.
   */
  toJSON(): object {
    return {
      nodes: Array.from(this.nodes.entries()).map(([name, node]) => ({
        name,
        version: node.version,
        dependencies: node.dependencies,
      })),
      edges: Array.from(this.dependencies.entries()).map(([from, tos]) => ({
        from,
        to: Array.from(tos),
      })),
    };
  }
}
