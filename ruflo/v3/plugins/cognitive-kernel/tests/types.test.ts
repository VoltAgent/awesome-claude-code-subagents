/**
 * Cognitive Kernel Plugin - Types Tests
 *
 * Tests for Zod schemas and type validation
 */

import { describe, it, expect } from 'vitest';
import {
  WorkingMemoryInputSchema,
  AttentionControlInputSchema,
  MetaMonitorInputSchema,
  ScaffoldInputSchema,
  CognitiveLoadInputSchema,
  successResult,
  errorResult,
  calculateTotalLoad,
  generateScaffoldSteps,
  DEFAULT_CONFIG,
} from '../src/types.js';

describe('WorkingMemoryInputSchema', () => {
  it('should validate valid working memory input', () => {
    const validInput = {
      action: 'allocate',
      slot: {
        id: 'slot-1',
        content: { data: 'test' },
        priority: 0.8,
        decay: 0.1,
      },
      capacity: 7,
      consolidationTarget: 'episodic',
    };

    const result = WorkingMemoryInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept all valid actions', () => {
    const actions = ['allocate', 'update', 'retrieve', 'clear', 'consolidate'] as const;

    for (const action of actions) {
      const input = { action };
      const result = WorkingMemoryInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should use default capacity of 7 (Miller number)', () => {
    const input = { action: 'allocate' };

    const result = WorkingMemoryInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capacity).toBe(7);
    }
  });

  it('should reject capacity below 1', () => {
    const result = WorkingMemoryInputSchema.safeParse({
      action: 'allocate',
      capacity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject capacity above 20', () => {
    const result = WorkingMemoryInputSchema.safeParse({
      action: 'allocate',
      capacity: 25,
    });
    expect(result.success).toBe(false);
  });

  it('should reject priority outside [0, 1]', () => {
    const result = WorkingMemoryInputSchema.safeParse({
      action: 'allocate',
      slot: { priority: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  it('should accept all consolidation targets', () => {
    const targets = ['episodic', 'semantic', 'procedural'] as const;

    for (const consolidationTarget of targets) {
      const input = { action: 'consolidate', consolidationTarget };
      const result = WorkingMemoryInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });
});

describe('AttentionControlInputSchema', () => {
  it('should validate valid attention control input', () => {
    const validInput = {
      mode: 'focus',
      targets: [
        { entity: 'current-task', weight: 0.8, duration: 300 },
        { entity: 'related-context', weight: 0.5, duration: 60 },
      ],
      filters: {
        includePatterns: ['code', 'test'],
        excludePatterns: ['log', 'debug'],
        noveltyBias: 0.7,
      },
    };

    const result = AttentionControlInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept all valid attention modes', () => {
    const modes = ['focus', 'diffuse', 'selective', 'divided', 'sustained'] as const;

    for (const mode of modes) {
      const input = { mode };
      const result = AttentionControlInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should reject target weight outside [0, 1]', () => {
    const result = AttentionControlInputSchema.safeParse({
      mode: 'focus',
      targets: [{ entity: 'test', weight: 1.5, duration: 60 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject target duration exceeding 3600', () => {
    const result = AttentionControlInputSchema.safeParse({
      mode: 'focus',
      targets: [{ entity: 'test', weight: 0.5, duration: 4000 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject more than 50 targets', () => {
    const targets = Array.from({ length: 51 }, (_, i) => ({
      entity: `target-${i}`,
      weight: 0.5,
      duration: 60,
    }));
    const result = AttentionControlInputSchema.safeParse({
      mode: 'focus',
      targets,
    });
    expect(result.success).toBe(false);
  });

  it('should use default noveltyBias', () => {
    const input = {
      mode: 'diffuse',
      filters: {},
    };

    const result = AttentionControlInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.noveltyBias).toBe(0.5);
    }
  });
});

describe('MetaMonitorInputSchema', () => {
  it('should validate valid meta monitor input', () => {
    const validInput = {
      monitoring: ['confidence_calibration', 'reasoning_coherence', 'cognitive_load'],
      reflection: {
        trigger: 'periodic',
        depth: 'medium',
      },
      interventions: true,
    };

    const result = MetaMonitorInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept all monitoring types', () => {
    const types = [
      'confidence_calibration', 'reasoning_coherence', 'goal_tracking',
      'cognitive_load', 'error_detection', 'uncertainty_estimation',
    ] as const;

    const input = { monitoring: [...types] };
    const result = MetaMonitorInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept all reflection triggers', () => {
    const triggers = ['periodic', 'on_error', 'on_uncertainty'] as const;

    for (const trigger of triggers) {
      const input = { reflection: { trigger } };
      const result = MetaMonitorInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should accept all reflection depths', () => {
    const depths = ['shallow', 'medium', 'deep'] as const;

    for (const depth of depths) {
      const input = { reflection: { depth } };
      const result = MetaMonitorInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should use default interventions value', () => {
    const input = {};

    const result = MetaMonitorInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.interventions).toBe(true);
    }
  });
});

describe('ScaffoldInputSchema', () => {
  it('should validate valid scaffold input', () => {
    const validInput = {
      task: {
        description: 'Implement a binary search algorithm',
        complexity: 'moderate',
        domain: 'algorithms',
      },
      scaffoldType: 'decomposition',
      adaptivity: {
        fading: true,
        monitoring: true,
      },
    };

    const result = ScaffoldInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept all complexity levels', () => {
    const complexities = ['simple', 'moderate', 'complex', 'expert'] as const;

    for (const complexity of complexities) {
      const input = {
        task: { description: 'Test', complexity },
        scaffoldType: 'decomposition',
      };
      const result = ScaffoldInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should accept all scaffold types', () => {
    const types = [
      'decomposition', 'analogy', 'worked_example',
      'socratic', 'metacognitive_prompting', 'chain_of_thought',
    ] as const;

    for (const scaffoldType of types) {
      const input = {
        task: { description: 'Test', complexity: 'simple' },
        scaffoldType,
      };
      const result = ScaffoldInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should reject description exceeding max length', () => {
    const result = ScaffoldInputSchema.safeParse({
      task: { description: 'a'.repeat(5001), complexity: 'simple' },
      scaffoldType: 'decomposition',
    });
    expect(result.success).toBe(false);
  });

  it('should use default adaptivity values', () => {
    const input = {
      task: { description: 'Test', complexity: 'simple' },
      scaffoldType: 'decomposition',
    };

    const result = ScaffoldInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    // Default adaptivity is undefined when not provided
  });
});

describe('CognitiveLoadInputSchema', () => {
  it('should validate valid cognitive load input', () => {
    const validInput = {
      assessment: {
        intrinsic: 0.5,
        extraneous: 0.2,
        germane: 0.3,
      },
      optimization: 'balanced',
      threshold: 0.8,
    };

    const result = CognitiveLoadInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept all optimization strategies', () => {
    const strategies = [
      'reduce_extraneous', 'chunk_intrinsic',
      'maximize_germane', 'balanced',
    ] as const;

    for (const optimization of strategies) {
      const input = { optimization };
      const result = CognitiveLoadInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it('should use default optimization and threshold', () => {
    const input = {};

    const result = CognitiveLoadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.optimization).toBe('balanced');
      expect(result.data.threshold).toBe(0.8);
    }
  });

  it('should reject load values outside [0, 1]', () => {
    const result = CognitiveLoadInputSchema.safeParse({
      assessment: { intrinsic: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  it('should reject threshold outside [0, 1]', () => {
    const result = CognitiveLoadInputSchema.safeParse({
      threshold: 1.2,
    });
    expect(result.success).toBe(false);
  });
});

describe('calculateTotalLoad', () => {
  it('should calculate total load from components', () => {
    const total = calculateTotalLoad(0.3, 0.2, 0.3);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(1);
  });

  it('should cap total at 1', () => {
    const total = calculateTotalLoad(0.8, 0.8, 0.8);
    expect(total).toBe(1);
  });

  it('should return 0 for zero components', () => {
    const total = calculateTotalLoad(0, 0, 0);
    expect(total).toBe(0);
  });

  it('should handle typical cognitive load scenario', () => {
    // High intrinsic (complex task) + low extraneous + moderate germane
    const total = calculateTotalLoad(0.7, 0.1, 0.4);
    expect(total).toBeCloseTo(0.6, 1);
  });
});

describe('generateScaffoldSteps', () => {
  it('should generate more steps for higher complexity', () => {
    const simple = generateScaffoldSteps('simple', 'decomposition');
    const moderate = generateScaffoldSteps('moderate', 'decomposition');
    const complex = generateScaffoldSteps('complex', 'decomposition');
    const expert = generateScaffoldSteps('expert', 'decomposition');

    expect(simple).toBeLessThan(moderate);
    expect(moderate).toBeLessThan(complex);
    expect(complex).toBeLessThan(expert);
  });

  it('should return 2 for simple tasks', () => {
    const steps = generateScaffoldSteps('simple', 'decomposition');
    expect(steps).toBe(2);
  });

  it('should return 8 for expert tasks', () => {
    const steps = generateScaffoldSteps('expert', 'chain_of_thought');
    expect(steps).toBe(8);
  });
});

describe('successResult', () => {
  it('should create success result with JSON data', () => {
    const data = { slotsUsed: 5, capacity: 7 };
    const result = successResult(data);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBeUndefined();
  });
});

describe('errorResult', () => {
  it('should create error result', () => {
    const result = errorResult('Working memory full');

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.message).toBe('Working memory full');
  });
});

describe('DEFAULT_CONFIG', () => {
  it('should have valid working memory config', () => {
    expect(DEFAULT_CONFIG.workingMemory.defaultCapacity).toBe(7);
    expect(DEFAULT_CONFIG.workingMemory.decayRate).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.workingMemory.decayRate).toBeLessThanOrEqual(1);
  });

  it('should have valid attention config', () => {
    expect(DEFAULT_CONFIG.attention.sustainedDuration).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.attention.noveltyBias).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CONFIG.attention.noveltyBias).toBeLessThanOrEqual(1);
  });

  it('should have valid meta-cognition config', () => {
    expect(DEFAULT_CONFIG.metaCognition.reflectionInterval).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.metaCognition.confidenceThreshold).toBeGreaterThan(0);
    expect(typeof DEFAULT_CONFIG.metaCognition.interventionEnabled).toBe('boolean');
  });

  it('should have valid scaffolding config', () => {
    expect(DEFAULT_CONFIG.scaffolding.fadingRate).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.scaffolding.fadingRate).toBeLessThanOrEqual(1);
    expect(typeof DEFAULT_CONFIG.scaffolding.adaptationEnabled).toBe('boolean');
  });

  it('should have valid cognitive load config', () => {
    expect(DEFAULT_CONFIG.cognitiveLoad.maxLoad).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.cognitiveLoad.maxLoad).toBeLessThanOrEqual(1);
    expect(DEFAULT_CONFIG.cognitiveLoad.warningThreshold).toBeLessThan(DEFAULT_CONFIG.cognitiveLoad.maxLoad);
  });
});
