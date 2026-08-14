/**
 * Cognitive Bridge
 *
 * Bridge to cognitum-gate-kernel for cognitive computation including
 * working memory, attention control, meta-cognition, and scaffolding.
 */

import type { CognitiveItem, MetaCognitiveAssessment } from '../types.js';

/**
 * WASM module status
 */
export type WasmModuleStatus = 'unloaded' | 'loading' | 'ready' | 'error';

/**
 * Cognitive configuration
 */
export interface CognitiveConfig {
  /** Working memory capacity (Miller's 7 +/- 2) */
  workingMemorySize: number;
  /** Attention span in seconds */
  attentionSpan: number;
  /** Enable meta-cognitive monitoring */
  metaCognitionEnabled: boolean;
  /** Scaffolding level */
  scaffoldingLevel: 'none' | 'light' | 'moderate' | 'heavy';
  /** Decay rate for memory items */
  decayRate: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CognitiveConfig = {
  workingMemorySize: 7,
  attentionSpan: 10,
  metaCognitionEnabled: true,
  scaffoldingLevel: 'light',
  decayRate: 0.1,
};

/**
 * Attention state
 */
export interface AttentionState {
  focus: string[];
  breadth: number;
  intensity: number;
  distractors: string[];
}

/**
 * WASM cognitive module interface
 */
interface CognitiveModule {
  // Working memory
  store(item: CognitiveItem): boolean;
  retrieve(id: string): CognitiveItem | null;
  search(query: Float32Array, k: number): CognitiveItem[];
  decay(deltaTime: number): void;
  consolidate(): void;

  // Attention control
  focus(ids: string[]): AttentionState;
  broaden(): AttentionState;
  narrow(): AttentionState;
  getAttentionState(): AttentionState;

  // Meta-cognition
  assess(): MetaCognitiveAssessment;
  monitor(task: string): number;
  regulate(strategy: string): void;

  // Scaffolding
  scaffold(task: string, difficulty: number): string[];
  adapt(performance: number): void;
}

/**
 * Cognitive Bridge implementation
 */
export class CognitiveBridge {
  readonly name = 'cognitum-gate-kernel';
  readonly version = '0.1.0';

  private _status: WasmModuleStatus = 'unloaded';
  private _module: CognitiveModule | null = null;
  private config: CognitiveConfig;

  constructor(config?: Partial<CognitiveConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get status(): WasmModuleStatus {
    return this._status;
  }

  get initialized(): boolean {
    return this._status === 'ready';
  }

  async init(): Promise<void> {
    if (this._status === 'ready') return;
    if (this._status === 'loading') return;

    this._status = 'loading';

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wasmModule = await (import('@ruvector/cognitum-gate-kernel' as any) as Promise<unknown>).catch(() => null);

      if (wasmModule) {
        this._module = wasmModule as unknown as CognitiveModule;
      } else {
        this._module = this.createMockModule();
      }

      this._status = 'ready';
    } catch (error) {
      this._status = 'error';
      throw error;
    }
  }

  async destroy(): Promise<void> {
    this._module = null;
    this._status = 'unloaded';
  }

  isReady(): boolean {
    return this._status === 'ready';
  }

  getModule(): CognitiveModule | null {
    return this._module;
  }

  /**
   * Store item in working memory
   */
  store(item: CognitiveItem): boolean {
    if (!this._module) throw new Error('Cognitive module not initialized');
    return this._module.store(item);
  }

  /**
   * Retrieve item from working memory
   */
  retrieve(id: string): CognitiveItem | null {
    if (!this._module) throw new Error('Cognitive module not initialized');
    return this._module.retrieve(id);
  }

  /**
   * Search working memory
   */
  search(query: Float32Array, k: number): CognitiveItem[] {
    if (!this._module) throw new Error('Cognitive module not initialized');
    return this._module.search(query, k);
  }

  /**
   * Apply memory decay
   */
  decay(deltaTime: number): void {
    if (!this._module) throw new Error('Cognitive module not initialized');
    this._module.decay(deltaTime);
  }

  /**
   * Consolidate working memory to long-term
   */
  consolidate(): void {
    if (!this._module) throw new Error('Cognitive module not initialized');
    this._module.consolidate();
  }

  /**
   * Focus attention on specific items
   */
  focus(ids: string[]): AttentionState {
    if (!this._module) throw new Error('Cognitive module not initialized');
    return this._module.focus(ids);
  }

  /**
   * Broaden attention
   */
  broaden(): AttentionState {
    if (!this._module) throw new Error('Cognitive module not initialized');
    return this._module.broaden();
  }

  /**
   * Narrow attention
   */
  narrow(): AttentionState {
    if (!this._module) throw new Error('Cognitive module not initialized');
    return this._module.narrow();
  }

  /**
   * Get current attention state
   */
  getAttentionState(): AttentionState {
    if (!this._module) throw new Error('Cognitive module not initialized');
    return this._module.getAttentionState();
  }

  /**
   * Perform meta-cognitive assessment
   */
  assess(): MetaCognitiveAssessment {
    if (!this._module) throw new Error('Cognitive module not initialized');
    return this._module.assess();
  }

  /**
   * Monitor task performance
   */
  monitor(task: string): number {
    if (!this._module) throw new Error('Cognitive module not initialized');
    return this._module.monitor(task);
  }

  /**
   * Apply cognitive regulation strategy
   */
  regulate(strategy: string): void {
    if (!this._module) throw new Error('Cognitive module not initialized');
    this._module.regulate(strategy);
  }

  /**
   * Get scaffolding for task
   */
  scaffold(task: string, difficulty: number): string[] {
    if (!this._module) throw new Error('Cognitive module not initialized');
    return this._module.scaffold(task, difficulty);
  }

  /**
   * Adapt scaffolding based on performance
   */
  adapt(performance: number): void {
    if (!this._module) throw new Error('Cognitive module not initialized');
    this._module.adapt(performance);
  }

  /**
   * Create mock module for development
   */
  private createMockModule(): CognitiveModule {
    const workingMemory = new Map<string, CognitiveItem>();
    let attentionState: AttentionState = {
      focus: [],
      breadth: 0.5,
      intensity: 0.7,
      distractors: [],
    };
    let scaffoldingMultiplier = 1.0;

    const self = this;

    return {
      store(item: CognitiveItem): boolean {
        if (workingMemory.size >= self.config.workingMemorySize) {
          // Remove lowest salience item (Miller's law)
          let lowestId = '';
          let lowestSalience = Infinity;
          for (const [id, stored] of workingMemory) {
            if (stored.salience < lowestSalience) {
              lowestSalience = stored.salience;
              lowestId = id;
            }
          }
          if (lowestId) workingMemory.delete(lowestId);
        }
        workingMemory.set(item.id, item);
        return true;
      },

      retrieve(id: string): CognitiveItem | null {
        const item = workingMemory.get(id);
        if (item) {
          // Boost salience on retrieval
          item.salience = Math.min(1, item.salience + 0.1);
        }
        return item ?? null;
      },

      search(query: Float32Array, k: number): CognitiveItem[] {
        const results: Array<{ item: CognitiveItem; score: number }> = [];

        for (const item of workingMemory.values()) {
          let score = 0;
          for (let i = 0; i < Math.min(query.length, item.content.length); i++) {
            score += (query[i] ?? 0) * (item.content[i] ?? 0);
          }
          results.push({ item, score: score * item.salience });
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, k).map(r => r.item);
      },

      decay(deltaTime: number): void {
        const decayRate = self.config.decayRate * deltaTime;
        for (const [id, item] of workingMemory) {
          item.salience *= 1 - decayRate * item.decay;
          if (item.salience < 0.1) {
            workingMemory.delete(id);
          }
        }
      },

      consolidate(): void {
        for (const item of workingMemory.values()) {
          if (item.salience > 0.8) {
            item.metadata = { ...item.metadata, consolidated: true };
          }
        }
      },

      focus(ids: string[]): AttentionState {
        attentionState = {
          focus: ids,
          breadth: 1 / Math.max(1, ids.length),
          intensity: Math.min(1, 0.5 + ids.length * 0.1),
          distractors: [],
        };
        return attentionState;
      },

      broaden(): AttentionState {
        attentionState.breadth = Math.min(1, attentionState.breadth + 0.2);
        attentionState.intensity = Math.max(0.3, attentionState.intensity - 0.1);
        return attentionState;
      },

      narrow(): AttentionState {
        attentionState.breadth = Math.max(0.1, attentionState.breadth - 0.2);
        attentionState.intensity = Math.min(1, attentionState.intensity + 0.1);
        return attentionState;
      },

      getAttentionState(): AttentionState {
        return { ...attentionState };
      },

      assess(): MetaCognitiveAssessment {
        const itemCount = workingMemory.size;
        const avgSalience = Array.from(workingMemory.values())
          .reduce((s, i) => s + i.salience, 0) / Math.max(1, itemCount);

        const cognitiveLoad = itemCount / self.config.workingMemorySize;
        const knowledgeGaps: string[] = [];
        const suggestedStrategies: string[] = [];

        if (cognitiveLoad > 0.8) {
          suggestedStrategies.push('consolidate');
          suggestedStrategies.push('chunk information');
        } else if (cognitiveLoad < 0.3) {
          suggestedStrategies.push('explore new information');
        }

        if (avgSalience < 0.5) {
          suggestedStrategies.push('refresh memory');
          suggestedStrategies.push('increase rehearsal');
        }

        return {
          confidence: avgSalience,
          uncertainty: 1 - avgSalience,
          coherence: avgSalience * 0.9 + 0.1,
          cognitiveLoad,
          errorsDetected: 0,
          knowledgeGaps,
          suggestedStrategies,
        };
      },

      monitor(task: string): number {
        // Return simulated performance score
        return 0.7 + Math.random() * 0.2;
      },

      regulate(strategy: string): void {
        if (strategy === 'consolidate') {
          this.consolidate();
        } else if (strategy === 'focus') {
          this.narrow();
        } else if (strategy === 'broaden') {
          this.broaden();
        }
      },

      scaffold(task: string, difficulty: number): string[] {
        const steps: string[] = [];
        const numSteps = Math.ceil(difficulty * 5 * scaffoldingMultiplier);

        const scaffoldLevels: Record<string, number> = {
          none: 0,
          light: 0.5,
          moderate: 1,
          heavy: 1.5,
        };
        const level = scaffoldLevels[self.config.scaffoldingLevel] ?? 1;

        for (let i = 1; i <= numSteps; i++) {
          if (level >= 0.5) {
            steps.push(`Step ${i}: Analyze the sub-problem of "${task}"`);
          }
          if (level >= 1) {
            steps.push(`Step ${i}.1: Consider alternative approaches`);
          }
          if (level >= 1.5) {
            steps.push(`Step ${i}.2: Validate assumptions`);
            steps.push(`Step ${i}.3: Check for edge cases`);
          }
        }

        return steps.slice(0, Math.max(2, numSteps * (level + 0.5)));
      },

      adapt(performance: number): void {
        if (performance < 0.5) {
          // Increase scaffolding
          scaffoldingMultiplier = Math.min(2, scaffoldingMultiplier + 0.2);
        } else if (performance > 0.8) {
          // Fade scaffolding
          scaffoldingMultiplier = Math.max(0.5, scaffoldingMultiplier - 0.1);
        }
      },
    };
  }
}

/**
 * Create a new cognitive bridge
 */
export function createCognitiveBridge(config?: Partial<CognitiveConfig>): CognitiveBridge {
  return new CognitiveBridge(config);
}

export default CognitiveBridge;
