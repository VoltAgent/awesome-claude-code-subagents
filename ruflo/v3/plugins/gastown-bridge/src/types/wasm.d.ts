/**
 * Type declarations for WASM modules
 */

declare module 'gastown-formula-wasm' {
  export interface ParsedFormula {
    name: string;
    type: string;
    description?: string;
    version?: number;
    steps?: Array<{
      id: string;
      title: string;
      description: string;
      needs?: string[];
    }>;
    vars?: Record<string, unknown>;
  }

  export interface CookedFormula extends ParsedFormula {
    cookedVars: Record<string, string>;
    cookedAt: Date;
  }

  export function init(): Promise<void>;
  export function parse_formula(content: string): ParsedFormula;
  export function cook_formula(formula: ParsedFormula, vars: Record<string, string>): CookedFormula;
  export function cook_batch(formulas: ParsedFormula[], varsArray: Record<string, string>[]): CookedFormula[];
}

declare module 'ruvector-gnn-wasm' {
  export interface GraphNode {
    id: string;
    dependencies: string[];
  }

  export interface TopoSortResult {
    sorted: string[];
    hasCycle: boolean;
    cycleNodes?: string[];
  }

  export interface CriticalPathResult {
    path: string[];
    totalDuration: number;
  }

  export function init(): Promise<void>;
  export function topo_sort(nodes: GraphNode[]): TopoSortResult;
  export function detect_cycles(nodes: GraphNode[]): { hasCycle: boolean; cycleNodes?: string[] };
  export function critical_path(nodes: string[], edges: Array<{ from: string; to: string }>, durations: number[]): CriticalPathResult;
}
