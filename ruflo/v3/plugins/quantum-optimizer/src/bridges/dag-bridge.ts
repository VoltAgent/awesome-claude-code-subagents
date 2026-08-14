/**
 * DAG Bridge - Directed Acyclic Graph Operations
 *
 * Bridge to @ruvector/dag-wasm for dependency graph analysis,
 * topological sorting, and cycle detection.
 */

import type {
  PackageDescriptor,
  DependencyConstraints,
  DependencyResult,
  ScheduleTask,
  ScheduleResource,
  ScheduleResult,
  ScheduledTask,
  ScheduleObjective,
} from '../types.js';

/**
 * WASM module status
 */
export type WasmModuleStatus = 'unloaded' | 'loading' | 'ready' | 'error';

/**
 * DAG node
 */
export interface DagNode {
  readonly id: string;
  readonly data?: Record<string, unknown>;
}

/**
 * DAG edge
 */
export interface DagEdge {
  readonly from: string;
  readonly to: string;
  readonly weight?: number;
}

/**
 * DAG structure
 */
export interface Dag {
  readonly nodes: ReadonlyArray<DagNode>;
  readonly edges: ReadonlyArray<DagEdge>;
}

/**
 * Topological sort result
 */
export interface TopologicalSortResult {
  readonly order: ReadonlyArray<string>;
  readonly hasCycle: boolean;
  readonly cycleNodes?: ReadonlyArray<string>;
}

/**
 * Critical path result
 */
export interface CriticalPathResult {
  readonly path: ReadonlyArray<string>;
  readonly length: number;
  readonly slack: Map<string, number>;
}

/**
 * DAG WASM module interface
 */
interface DagWasmModule {
  // Graph operations
  topological_sort(nodes: Uint32Array, edges: Uint32Array, numNodes: number, numEdges: number): Uint32Array;
  detect_cycle(nodes: Uint32Array, edges: Uint32Array, numNodes: number, numEdges: number): Uint32Array;
  critical_path(nodes: Uint32Array, edges: Uint32Array, durations: Float32Array, numNodes: number, numEdges: number): Float32Array;

  // Memory
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  memory: WebAssembly.Memory;
}

/**
 * DAG Bridge for dependency graph operations
 */
export class DagBridge {
  readonly name = 'quantum-dag-bridge';
  readonly version = '0.1.0';

  private _status: WasmModuleStatus = 'unloaded';
  private _module: DagWasmModule | null = null;

  get status(): WasmModuleStatus {
    return this._status;
  }

  get initialized(): boolean {
    return this._status === 'ready';
  }

  /**
   * Initialize the WASM module
   */
  async initialize(): Promise<void> {
    if (this._status === 'ready') return;
    if (this._status === 'loading') return;

    this._status = 'loading';

    try {
      // Dynamic import - module may not be installed
      const wasmModule = await import(/* webpackIgnore: true */ '@ruvector/dag-wasm' as string).catch(() => null);

      if (wasmModule) {
        this._module = wasmModule as unknown as DagWasmModule;
      } else {
        this._module = this.createMockModule();
      }

      this._status = 'ready';
    } catch (error) {
      this._status = 'error';
      throw new Error(`Failed to initialize DagBridge: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Dispose of resources
   */
  async dispose(): Promise<void> {
    this._module = null;
    this._status = 'unloaded';
  }

  /**
   * Perform topological sort on a DAG
   */
  topologicalSort(dag: Dag): TopologicalSortResult {
    const nodeIndex = new Map<string, number>();
    dag.nodes.forEach((node, idx) => nodeIndex.set(node.id, idx));

    // Build adjacency list
    const adjList = new Map<number, number[]>();
    const inDegree = new Array(dag.nodes.length).fill(0);

    for (const edge of dag.edges) {
      const from = nodeIndex.get(edge.from);
      const to = nodeIndex.get(edge.to);

      if (from === undefined || to === undefined) continue;

      if (!adjList.has(from)) {
        adjList.set(from, []);
      }
      adjList.get(from)!.push(to);
      inDegree[to]++;
    }

    // Kahn's algorithm
    const queue: number[] = [];
    for (let i = 0; i < dag.nodes.length; i++) {
      if (inDegree[i] === 0) {
        queue.push(i);
      }
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      order.push(dag.nodes[node]!.id);

      for (const neighbor of adjList.get(node) ?? []) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check for cycle
    if (order.length !== dag.nodes.length) {
      const cycleNodes = dag.nodes
        .filter((_, idx) => inDegree[idx]! > 0)
        .map(n => n.id);

      return {
        order: [],
        hasCycle: true,
        cycleNodes,
      };
    }

    return {
      order,
      hasCycle: false,
    };
  }

  /**
   * Find critical path in a DAG with durations
   */
  criticalPath(dag: Dag, durations: Map<string, number>): CriticalPathResult {
    const sortResult = this.topologicalSort(dag);

    if (sortResult.hasCycle) {
      throw new Error('Cannot compute critical path for cyclic graph');
    }

    const nodeIndex = new Map<string, number>();
    dag.nodes.forEach((node, idx) => nodeIndex.set(node.id, idx));

    // Forward pass: compute earliest start times
    const earliest = new Map<string, number>();
    for (const nodeId of sortResult.order) {
      let maxPredecessor = 0;

      for (const edge of dag.edges) {
        if (edge.to === nodeId) {
          const predEnd = (earliest.get(edge.from) ?? 0) + (durations.get(edge.from) ?? 0);
          maxPredecessor = Math.max(maxPredecessor, predEnd);
        }
      }

      earliest.set(nodeId, maxPredecessor);
    }

    // Find total project duration
    let maxEnd = 0;
    let lastNode = sortResult.order[0]!;

    for (const nodeId of sortResult.order) {
      const end = (earliest.get(nodeId) ?? 0) + (durations.get(nodeId) ?? 0);
      if (end > maxEnd) {
        maxEnd = end;
        lastNode = nodeId;
      }
    }

    // Backward pass: compute latest start times
    const latest = new Map<string, number>();
    const reversedOrder = [...sortResult.order].reverse();

    for (const nodeId of reversedOrder) {
      let minSuccessor = maxEnd;

      for (const edge of dag.edges) {
        if (edge.from === nodeId) {
          const succStart = latest.get(edge.to) ?? maxEnd;
          minSuccessor = Math.min(minSuccessor, succStart);
        }
      }

      latest.set(nodeId, minSuccessor - (durations.get(nodeId) ?? 0));
    }

    // Compute slack and find critical path
    const slack = new Map<string, number>();
    const criticalNodes: string[] = [];

    for (const nodeId of sortResult.order) {
      const nodeSlack = (latest.get(nodeId) ?? 0) - (earliest.get(nodeId) ?? 0);
      slack.set(nodeId, nodeSlack);

      if (nodeSlack === 0) {
        criticalNodes.push(nodeId);
      }
    }

    return {
      path: criticalNodes,
      length: maxEnd,
      slack,
    };
  }

  /**
   * Resolve package dependencies using quantum-inspired optimization
   */
  async resolveDependencies(
    packages: ReadonlyArray<PackageDescriptor>,
    constraints: DependencyConstraints
  ): Promise<DependencyResult> {
    const startTime = performance.now();
    const timeout = constraints.timeout;

    // Build dependency graph
    const packageMap = new Map<string, PackageDescriptor>();
    packages.forEach(pkg => packageMap.set(`${pkg.name}@${pkg.version}`, pkg));

    // Create version lookup
    const versionsByName = new Map<string, PackageDescriptor[]>();
    for (const pkg of packages) {
      if (!versionsByName.has(pkg.name)) {
        versionsByName.set(pkg.name, []);
      }
      versionsByName.get(pkg.name)!.push(pkg);
    }

    // Build constraint graph
    const resolved = new Map<string, string>();
    const resolvedConflicts: Array<{ packages: [string, string]; resolution: string }> = [];

    // Initialize with lockfile if present
    if (constraints.lockfile) {
      for (const [name, version] of Object.entries(constraints.lockfile)) {
        resolved.set(name, version);
      }
    }

    // Greedy resolution with backtracking
    const visited = new Set<string>();
    const stack: string[] = [];

    const resolvePackage = (name: string, requiredVersion: string): boolean => {
      if (resolved.has(name)) {
        return this.versionSatisfies(resolved.get(name)!, requiredVersion);
      }

      if (visited.has(name)) {
        // Cycle detected
        return true;
      }

      visited.add(name);

      // Find compatible versions
      const candidates = versionsByName.get(name) ?? [];
      const compatible = candidates
        .filter(pkg => this.versionSatisfies(pkg.version, requiredVersion))
        .sort((a, b) => {
          // Sort by objective
          switch (constraints.minimize) {
            case 'size':
              return (a.size ?? 0) - (b.size ?? 0);
            case 'vulnerabilities':
              return (a.vulnerabilities?.length ?? 0) - (b.vulnerabilities?.length ?? 0);
            case 'depth':
              return Object.keys(a.dependencies).length - Object.keys(b.dependencies).length;
            default:
              return this.compareVersions(b.version, a.version); // Prefer newer
          }
        });

      for (const pkg of compatible) {
        // Check conflicts
        let hasConflict = false;
        for (const conflict of pkg.conflicts) {
          if (resolved.has(conflict.split('@')[0]!)) {
            hasConflict = true;
            break;
          }
        }

        if (hasConflict) continue;

        // Try this version
        resolved.set(name, pkg.version);
        stack.push(name);

        // Resolve dependencies
        let allDepsResolved = true;
        for (const [depName, depVersion] of Object.entries(pkg.dependencies)) {
          if (!resolvePackage(depName, depVersion)) {
            allDepsResolved = false;
            break;
          }

          if (performance.now() - startTime > timeout) {
            throw new Error('Dependency resolution timeout');
          }
        }

        if (allDepsResolved) {
          return true;
        }

        // Backtrack
        resolved.delete(name);
        stack.pop();
      }

      visited.delete(name);
      return false;
    };

    // Resolve all root packages
    for (const pkg of packages) {
      if (!resolved.has(pkg.name)) {
        resolvePackage(pkg.name, pkg.version);
      }
    }

    // Build installation order
    const dag: Dag = {
      nodes: Array.from(resolved.keys()).map(name => ({ id: name })),
      edges: [],
    };

    const edges: DagEdge[] = [];
    for (const [name, version] of resolved) {
      const pkg = packages.find(p => p.name === name && p.version === version);
      if (pkg) {
        for (const depName of Object.keys(pkg.dependencies)) {
          if (resolved.has(depName)) {
            edges.push({ from: depName, to: name });
          }
        }
      }
    }

    const sortedDag: Dag = { nodes: dag.nodes, edges };
    const sortResult = this.topologicalSort(sortedDag);

    // Calculate totals
    let totalSize = 0;
    const allVulns: string[] = [];

    for (const [name, version] of resolved) {
      const pkg = packages.find(p => p.name === name && p.version === version);
      if (pkg) {
        totalSize += pkg.size ?? 0;
        allVulns.push(...(pkg.vulnerabilities ?? []));
      }
    }

    return {
      resolved: Object.fromEntries(resolved),
      order: sortResult.order,
      resolvedConflicts,
      totalSize,
      vulnerabilities: [...new Set(allVulns)],
    };
  }

  /**
   * Optimize task schedule using DAG analysis
   */
  async optimizeSchedule(
    tasks: ReadonlyArray<ScheduleTask>,
    resources: ReadonlyArray<ScheduleResource>,
    objective: ScheduleObjective
  ): Promise<ScheduleResult> {
    // Build task DAG
    const dag: Dag = {
      nodes: tasks.map(t => ({ id: t.id })),
      edges: tasks.flatMap(t =>
        t.dependencies.map(dep => ({ from: dep, to: t.id }))
      ),
    };

    // Check for cycles
    const sortResult = this.topologicalSort(dag);
    if (sortResult.hasCycle) {
      throw new Error(`Cycle detected in task dependencies: ${sortResult.cycleNodes?.join(', ')}`);
    }

    // Build duration map
    const durations = new Map<string, number>();
    tasks.forEach(t => durations.set(t.id, t.duration));

    // Find critical path
    const critPath = this.criticalPath(dag, durations);

    // Schedule tasks
    const schedule: ScheduledTask[] = [];
    const resourceUsage = new Map<string, Array<{ start: number; end: number }>>();

    resources.forEach(r => resourceUsage.set(r.id, []));

    const taskEndTimes = new Map<string, number>();

    for (const taskId of sortResult.order) {
      const task = tasks.find(t => t.id === taskId);
      if (!task) continue;

      // Find earliest start (after all dependencies)
      let earliestStart = 0;
      for (const depId of task.dependencies) {
        const depEnd = taskEndTimes.get(depId) ?? 0;
        earliestStart = Math.max(earliestStart, depEnd);
      }

      // Find resource availability
      for (const resourceId of task.resources) {
        const usage = resourceUsage.get(resourceId) ?? [];
        const resource = resources.find(r => r.id === resourceId);

        if (resource) {
          // Find next available slot
          for (const slot of usage) {
            if (slot.end > earliestStart && slot.start < earliestStart + task.duration) {
              earliestStart = slot.end;
            }
          }
        }
      }

      const start = earliestStart;
      const end = start + task.duration;

      schedule.push({
        taskId,
        start,
        end,
        resources: [...task.resources],
      });

      taskEndTimes.set(taskId, end);

      // Update resource usage
      for (const resourceId of task.resources) {
        resourceUsage.get(resourceId)?.push({ start, end });
      }
    }

    // Calculate metrics
    const makespan = Math.max(...schedule.map(s => s.end));

    let totalCost = 0;
    const utilization: Record<string, number> = {};

    for (const resource of resources) {
      const usage = resourceUsage.get(resource.id) ?? [];
      const totalUsed = usage.reduce((s, u) => s + (u.end - u.start), 0);
      utilization[resource.id] = totalUsed / makespan;
      totalCost += totalUsed * resource.cost;
    }

    // Calculate objective score
    let score: number;
    switch (objective) {
      case 'cost':
        score = 1 / (1 + totalCost);
        break;
      case 'utilization':
        score = Object.values(utilization).reduce((s, u) => s + u, 0) / resources.length;
        break;
      case 'weighted':
        score = (1 / (1 + makespan)) * 0.4 + (1 / (1 + totalCost)) * 0.3 +
          Object.values(utilization).reduce((s, u) => s + u, 0) / resources.length * 0.3;
        break;
      case 'makespan':
      default:
        score = 1 / (1 + makespan);
    }

    return {
      schedule,
      makespan,
      cost: totalCost,
      utilization,
      criticalPath: critPath.path as string[],
      score,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private versionSatisfies(version: string, constraint: string): boolean {
    // Simple version matching - in production use semver library
    if (constraint === '*' || constraint === '') return true;
    if (constraint.startsWith('^')) {
      const major = version.split('.')[0];
      const reqMajor = constraint.slice(1).split('.')[0];
      return major === reqMajor;
    }
    if (constraint.startsWith('~')) {
      const [major, minor] = version.split('.');
      const [reqMajor, reqMinor] = constraint.slice(1).split('.');
      return major === reqMajor && minor === reqMinor;
    }
    if (constraint.startsWith('>=')) {
      return this.compareVersions(version, constraint.slice(2)) >= 0;
    }
    if (constraint.startsWith('>')) {
      return this.compareVersions(version, constraint.slice(1)) > 0;
    }
    if (constraint.startsWith('<=')) {
      return this.compareVersions(version, constraint.slice(2)) <= 0;
    }
    if (constraint.startsWith('<')) {
      return this.compareVersions(version, constraint.slice(1)) < 0;
    }
    return version === constraint;
  }

  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const pA = partsA[i] ?? 0;
      const pB = partsB[i] ?? 0;
      if (pA > pB) return 1;
      if (pA < pB) return -1;
    }

    return 0;
  }

  /**
   * Create mock module for development
   */
  private createMockModule(): DagWasmModule {
    return {
      topological_sort: () => new Uint32Array(0),
      detect_cycle: () => new Uint32Array(0),
      critical_path: () => new Float32Array(0),
      alloc: () => 0,
      dealloc: () => undefined,
      memory: new WebAssembly.Memory({ initial: 1 }),
    };
  }
}

/**
 * Create a new DagBridge instance
 */
export function createDagBridge(): DagBridge {
  return new DagBridge();
}
