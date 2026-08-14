/**
 * Cognitive Kernel Plugin - MCP Tools Tests
 *
 * Tests for MCP tool handlers with mock data
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cognitiveKernelTools,
  getTool,
  getToolNames,
} from '../src/mcp-tools.js';

describe('cognitiveKernelTools', () => {
  it('should export 5 MCP tools', () => {
    expect(cognitiveKernelTools).toHaveLength(5);
  });

  it('should have unique tool names', () => {
    const names = cognitiveKernelTools.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('should have required tool properties', () => {
    for (const tool of cognitiveKernelTools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    }
  });
});

describe('getTool', () => {
  it('should return tool by name', () => {
    const tool = getTool('cognition/working-memory');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('cognition/working-memory');
  });

  it('should return undefined for unknown tool', () => {
    const tool = getTool('unknown/tool');
    expect(tool).toBeUndefined();
  });
});

describe('getToolNames', () => {
  it('should return array of tool names', () => {
    const names = getToolNames();
    expect(names).toContain('cognition/working-memory');
    expect(names).toContain('cognition/attention-control');
    expect(names).toContain('cognition/meta-monitor');
    expect(names).toContain('cognition/scaffold');
    expect(names).toContain('cognition/cognitive-load');
  });
});

describe('cognition/working-memory handler', () => {
  const tool = getTool('cognition/working-memory')!;

  it('should handle allocate action', async () => {
    const input = {
      action: 'allocate',
      slot: {
        id: 'slot-1',
        content: { data: 'important context' },
        priority: 0.9,
        decay: 0.05,
      },
      capacity: 7,
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.action).toBe('allocate');
    expect(parsed.success).toBe(true);
    expect(parsed.state).toHaveProperty('capacity');
  });

  it('should handle update action', async () => {
    const input = {
      action: 'update',
      slot: {
        id: 'slot-1',
        content: { data: 'updated content' },
      },
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.action).toBe('update');
  });

  it('should handle retrieve action', async () => {
    const input = {
      action: 'retrieve',
      slot: { id: 'slot-1' },
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.action).toBe('retrieve');
  });

  it('should handle clear action', async () => {
    const input = {
      action: 'clear',
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.action).toBe('clear');
  });

  it('should handle consolidate action', async () => {
    const input = {
      action: 'consolidate',
      consolidationTarget: 'episodic',
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.action).toBe('consolidate');
  });

  it('should respect capacity limit', async () => {
    const input = {
      action: 'allocate',
      capacity: 3,
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.state.capacity).toBe(3);
  });
});

describe('cognition/attention-control handler', () => {
  const tool = getTool('cognition/attention-control')!;

  it('should handle valid input', async () => {
    const input = {
      mode: 'focus',
      targets: [
        { entity: 'current-task', weight: 0.9, duration: 300 },
        { entity: 'related-info', weight: 0.5, duration: 60 },
      ],
      filters: {
        includePatterns: ['code', 'test'],
        excludePatterns: ['log', 'debug'],
        noveltyBias: 0.6,
      },
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.mode).toBe('focus');
    expect(parsed.state).toHaveProperty('focus');
    expect(parsed.state).toHaveProperty('breadth');
    expect(parsed.state).toHaveProperty('intensity');
  });

  it('should handle all attention modes', async () => {
    const modes = ['focus', 'diffuse', 'selective', 'divided', 'sustained'];

    for (const mode of modes) {
      const input = { mode };
      const result = await tool.handler(input);

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.mode).toBe(mode);
    }
  });

  it('should compute attention state', async () => {
    const input = {
      mode: 'selective',
      targets: [
        { entity: 'target-1', weight: 1.0, duration: 100 },
      ],
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.state.focus.length).toBeGreaterThan(0);
    expect(parsed.state.intensity).toBeGreaterThan(0);
  });

  it('should return error for invalid mode', async () => {
    const input = {
      mode: 'invalid_mode',
    };

    const result = await tool.handler(input);

    expect(result.isError).toBe(true);
  });
});

describe('cognition/meta-monitor handler', () => {
  const tool = getTool('cognition/meta-monitor')!;

  it('should handle valid input', async () => {
    const input = {
      monitoring: ['confidence_calibration', 'reasoning_coherence', 'cognitive_load'],
      reflection: {
        trigger: 'periodic',
        depth: 'medium',
      },
      interventions: true,
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('assessment');
    expect(parsed).toHaveProperty('interventions');
    expect(parsed).toHaveProperty('details');
  });

  it('should compute assessment metrics', async () => {
    const input = {
      monitoring: ['confidence_calibration', 'uncertainty_estimation'],
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.assessment).toHaveProperty('confidence');
    expect(parsed.assessment).toHaveProperty('uncertainty');
    expect(parsed.assessment).toHaveProperty('coherence');
    expect(parsed.assessment).toHaveProperty('cognitiveLoad');

    // Values should be in [0, 1] range
    expect(parsed.assessment.confidence).toBeGreaterThanOrEqual(0);
    expect(parsed.assessment.confidence).toBeLessThanOrEqual(1);
  });

  it('should generate interventions when enabled', async () => {
    const input = {
      interventions: true,
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(Array.isArray(parsed.interventions)).toBe(true);
  });

  it('should handle all reflection depths', async () => {
    const depths = ['shallow', 'medium', 'deep'];

    for (const depth of depths) {
      const input = {
        reflection: { depth },
      };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();
    }
  });
});

describe('cognition/scaffold handler', () => {
  const tool = getTool('cognition/scaffold')!;

  it('should handle valid input', async () => {
    const input = {
      task: {
        description: 'Implement a binary search algorithm in TypeScript',
        complexity: 'moderate',
        domain: 'algorithms',
      },
      scaffoldType: 'decomposition',
      adaptivity: {
        fading: true,
        monitoring: true,
      },
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.scaffoldType).toBe('decomposition');
    expect(parsed).toHaveProperty('steps');
    expect(Array.isArray(parsed.steps)).toBe(true);
  });

  it('should generate appropriate steps for complexity', async () => {
    const simpleInput = {
      task: { description: 'Simple task', complexity: 'simple' },
      scaffoldType: 'decomposition',
    };
    const complexInput = {
      task: { description: 'Complex task', complexity: 'expert' },
      scaffoldType: 'decomposition',
    };

    const simpleResult = await tool.handler(simpleInput);
    const complexResult = await tool.handler(complexInput);

    const simpleParsed = JSON.parse(simpleResult.content[0].text!);
    const complexParsed = JSON.parse(complexResult.content[0].text!);

    expect(complexParsed.steps.length).toBeGreaterThanOrEqual(simpleParsed.steps.length);
  });

  it('should handle all scaffold types', async () => {
    const types = [
      'decomposition', 'analogy', 'worked_example',
      'socratic', 'metacognitive_prompting', 'chain_of_thought',
    ];

    for (const scaffoldType of types) {
      const input = {
        task: { description: 'Test', complexity: 'simple' },
        scaffoldType,
      };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();
    }
  });

  it('should include hints and checkpoints in steps', async () => {
    const input = {
      task: { description: 'Test task', complexity: 'moderate' },
      scaffoldType: 'chain_of_thought',
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    for (const step of parsed.steps) {
      expect(step).toHaveProperty('step');
      expect(step).toHaveProperty('instruction');
      expect(step).toHaveProperty('hints');
      expect(step).toHaveProperty('checkpoints');
    }
  });
});

describe('cognition/cognitive-load handler', () => {
  const tool = getTool('cognition/cognitive-load')!;

  it('should handle valid input', async () => {
    const input = {
      assessment: {
        intrinsic: 0.5,
        extraneous: 0.2,
        germane: 0.3,
      },
      optimization: 'balanced',
      threshold: 0.8,
    };

    const result = await tool.handler(input);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toHaveProperty('currentLoad');
    expect(parsed).toHaveProperty('overloaded');
    expect(parsed).toHaveProperty('recommendations');
  });

  it('should detect overload condition', async () => {
    const input = {
      assessment: {
        intrinsic: 0.9,
        extraneous: 0.8,
        germane: 0.7,
      },
      threshold: 0.8,
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.overloaded).toBe(true);
  });

  it('should not detect overload for low load', async () => {
    const input = {
      assessment: {
        intrinsic: 0.2,
        extraneous: 0.1,
        germane: 0.1,
      },
      threshold: 0.8,
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.overloaded).toBe(false);
  });

  it('should handle all optimization strategies', async () => {
    const strategies = [
      'reduce_extraneous', 'chunk_intrinsic',
      'maximize_germane', 'balanced',
    ];

    for (const optimization of strategies) {
      const input = { optimization };

      const result = await tool.handler(input);
      expect(result.isError).toBeUndefined();

      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.details.optimization).toBe(optimization);
    }
  });

  it('should provide recommendations', async () => {
    const input = {
      assessment: {
        intrinsic: 0.6,
        extraneous: 0.5,
        germane: 0.2,
      },
      optimization: 'balanced',
    };

    const result = await tool.handler(input);
    const parsed = JSON.parse(result.content[0].text!);

    expect(Array.isArray(parsed.recommendations)).toBe(true);
  });
});

describe('Tool metadata', () => {
  it('should have correct categories', () => {
    for (const tool of cognitiveKernelTools) {
      expect(tool.category).toBe('cognition');
    }
  });

  it('should have version numbers', () => {
    for (const tool of cognitiveKernelTools) {
      expect(tool.version).toBeDefined();
      expect(tool.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('should have tags', () => {
    for (const tool of cognitiveKernelTools) {
      expect(Array.isArray(tool.tags)).toBe(true);
      expect(tool.tags!.length).toBeGreaterThan(0);
    }
  });
});
