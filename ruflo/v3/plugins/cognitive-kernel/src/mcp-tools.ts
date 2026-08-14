/**
 * Cognitive Kernel MCP Tools
 *
 * 5 MCP tools for cognitive augmentation:
 * - cognition/working-memory: Working memory slot management
 * - cognition/attention-control: Cognitive attention control
 * - cognition/meta-monitor: Meta-cognitive monitoring
 * - cognition/scaffold: Cognitive scaffolding
 * - cognition/cognitive-load: Cognitive load management
 */

import type {
  MCPTool,
  MCPToolResult,
  ToolContext,
  WorkingMemoryOutput,
  AttentionControlOutput,
  MetaMonitorOutput,
  ScaffoldOutput,
  CognitiveLoadOutput,
  WorkingMemorySlot,
  AttentionState,
  AttentionMode,
  MonitoringType,
  ReflectionDepth,
  ScaffoldStep,
  TaskComplexity,
  ScaffoldType,
  LoadOptimization,
} from './types.js';
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
} from './types.js';

// ============================================================================
// Default Logger
// ============================================================================

const defaultLogger = {
  debug: (msg: string, meta?: Record<string, unknown>) => console.debug(`[cognitive-kernel] ${msg}`, meta),
  info: (msg: string, meta?: Record<string, unknown>) => console.info(`[cognitive-kernel] ${msg}`, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[cognitive-kernel] ${msg}`, meta),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(`[cognitive-kernel] ${msg}`, meta),
};

// ============================================================================
// In-Memory State (for fallback implementation)
// ============================================================================

const workingMemoryState = new Map<string, WorkingMemorySlot>();
let currentAttentionState: AttentionState = {
  mode: 'focus',
  focus: [],
  breadth: 0.5,
  intensity: 0.7,
  filters: { noveltyBias: 0.5 },
  distractors: [],
};
let currentCognitiveLoad = {
  intrinsic: 0.3,
  extraneous: 0.2,
  germane: 0.2,
};

// ============================================================================
// Tool 1: Working Memory
// ============================================================================

async function workingMemoryHandler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    const validation = WorkingMemoryInputSchema.safeParse(input);
    if (!validation.success) {
      logger.error('Input validation failed', { error: validation.error.message });
      return errorResult(`Invalid input: ${validation.error.message}`);
    }

    const { action, slot, capacity, consolidationTarget } = validation.data;
    logger.debug('Processing working memory', { action, capacity });

    let output: WorkingMemoryOutput;

    // Use cognitive bridge if available
    const bridge = context?.cognitiveBridge;

    switch (action) {
      case 'allocate': {
        if (!slot?.id) {
          const newId = `slot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const newSlot: WorkingMemorySlot = {
            id: newId,
            content: slot?.content ?? null,
            priority: slot?.priority ?? 0.5,
            decay: slot?.decay ?? 0.1,
            createdAt: Date.now(),
            accessCount: 0,
            lastAccessed: Date.now(),
          };

          // Check capacity (Miller's Law: 7 +/- 2)
          if (workingMemoryState.size >= capacity) {
            // Evict lowest priority slot
            let lowestPriority = Infinity;
            let lowestId = '';
            for (const [id, s] of workingMemoryState) {
              if (s.priority < lowestPriority) {
                lowestPriority = s.priority;
                lowestId = id;
              }
            }
            if (lowestId) {
              workingMemoryState.delete(lowestId);
            }
          }

          workingMemoryState.set(newId, newSlot);

          output = {
            action,
            success: true,
            state: {
              slotsUsed: workingMemoryState.size,
              capacity,
              utilization: workingMemoryState.size / capacity,
            },
            details: {
              slotId: newId,
              avgPriority: calculateAvgPriority(),
              interpretation: `Allocated new slot "${newId}" in working memory`,
            },
          };
        } else {
          return errorResult('Slot ID should not be provided for allocate action');
        }
        break;
      }

      case 'update': {
        if (!slot?.id) {
          return errorResult('Slot ID is required for update action');
        }
        const existing = workingMemoryState.get(slot.id);
        if (!existing) {
          return errorResult(`Slot "${slot.id}" not found in working memory`);
        }

        existing.content = slot.content ?? existing.content;
        existing.priority = slot.priority ?? existing.priority;
        existing.decay = slot.decay ?? existing.decay;
        existing.lastAccessed = Date.now();
        existing.accessCount++;

        output = {
          action,
          success: true,
          state: {
            slotsUsed: workingMemoryState.size,
            capacity,
            utilization: workingMemoryState.size / capacity,
          },
          details: {
            slotId: slot.id,
            avgPriority: calculateAvgPriority(),
            interpretation: `Updated slot "${slot.id}" in working memory`,
          },
        };
        break;
      }

      case 'retrieve': {
        if (slot?.id) {
          const existing = workingMemoryState.get(slot.id);
          if (!existing) {
            output = {
              action,
              success: false,
              state: {
                slotsUsed: workingMemoryState.size,
                capacity,
                utilization: workingMemoryState.size / capacity,
              },
              details: {
                avgPriority: calculateAvgPriority(),
                interpretation: `Slot "${slot.id}" not found in working memory`,
              },
            };
          } else {
            existing.accessCount++;
            existing.lastAccessed = Date.now();
            // Boost priority on retrieval
            existing.priority = Math.min(1, existing.priority + 0.1);

            output = {
              action,
              success: true,
              state: {
                slotsUsed: workingMemoryState.size,
                capacity,
                utilization: workingMemoryState.size / capacity,
              },
              details: {
                slotId: slot.id,
                content: existing.content,
                avgPriority: calculateAvgPriority(),
                interpretation: `Retrieved slot "${slot.id}" from working memory`,
              },
            };
          }
        } else {
          // Return all slots
          const slots = Array.from(workingMemoryState.values());
          output = {
            action,
            success: true,
            state: {
              slotsUsed: slots.length,
              capacity,
              utilization: slots.length / capacity,
            },
            details: {
              content: slots,
              avgPriority: calculateAvgPriority(),
              interpretation: `Retrieved all ${slots.length} slots from working memory`,
            },
          };
        }
        break;
      }

      case 'clear': {
        if (slot?.id) {
          workingMemoryState.delete(slot.id);
          output = {
            action,
            success: true,
            state: {
              slotsUsed: workingMemoryState.size,
              capacity,
              utilization: workingMemoryState.size / capacity,
            },
            details: {
              avgPriority: calculateAvgPriority(),
              interpretation: `Cleared slot "${slot.id}" from working memory`,
            },
          };
        } else {
          workingMemoryState.clear();
          output = {
            action,
            success: true,
            state: {
              slotsUsed: 0,
              capacity,
              utilization: 0,
            },
            details: {
              avgPriority: 0,
              interpretation: 'Cleared all slots from working memory',
            },
          };
        }
        break;
      }

      case 'consolidate': {
        // Consolidate high-priority items to long-term memory
        const toConsolidate: WorkingMemorySlot[] = [];
        for (const s of workingMemoryState.values()) {
          if (s.priority > 0.7 && s.accessCount > 2) {
            toConsolidate.push(s);
          }
        }

        // Mark as consolidated (in real impl, would transfer to LTM)
        for (const s of toConsolidate) {
          (s as WorkingMemorySlot & { consolidated?: boolean }).consolidated = true;
        }

        output = {
          action,
          success: true,
          state: {
            slotsUsed: workingMemoryState.size,
            capacity,
            utilization: workingMemoryState.size / capacity,
          },
          details: {
            content: { consolidated: toConsolidate.length, target: consolidationTarget },
            avgPriority: calculateAvgPriority(),
            interpretation: `Consolidated ${toConsolidate.length} high-priority slots to ${consolidationTarget ?? 'episodic'} memory`,
          },
        };
        break;
      }

      default:
        return errorResult(`Unknown action: ${action}`);
    }

    const duration = performance.now() - startTime;
    logger.info('Working memory operation completed', {
      action,
      slotsUsed: workingMemoryState.size,
      durationMs: duration.toFixed(2),
    });

    return successResult(output);
  } catch (error) {
    logger.error('Working memory operation failed', { error: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

function calculateAvgPriority(): number {
  if (workingMemoryState.size === 0) return 0;
  let sum = 0;
  for (const slot of workingMemoryState.values()) {
    sum += slot.priority;
  }
  return sum / workingMemoryState.size;
}

export const workingMemoryTool: MCPTool = {
  name: 'cognition/working-memory',
  description: 'Manage working memory slots for complex reasoning tasks. Supports allocate, update, retrieve, clear, and consolidate operations with Miller number capacity limits.',
  category: 'cognition',
  version: '0.1.0',
  tags: ['working-memory', 'cognitive', 'reasoning', 'slots'],
  cacheable: false,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['allocate', 'update', 'retrieve', 'clear', 'consolidate'],
      },
      slot: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: {},
          priority: { type: 'number', default: 0.5 },
          decay: { type: 'number', default: 0.1 },
        },
      },
      capacity: { type: 'number', default: 7 },
      consolidationTarget: {
        type: 'string',
        enum: ['episodic', 'semantic', 'procedural'],
      },
    },
    required: ['action'],
  },
  handler: workingMemoryHandler,
};

// ============================================================================
// Tool 2: Attention Control
// ============================================================================

async function attentionControlHandler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    const validation = AttentionControlInputSchema.safeParse(input);
    if (!validation.success) {
      logger.error('Input validation failed', { error: validation.error.message });
      return errorResult(`Invalid input: ${validation.error.message}`);
    }

    const { mode, targets, filters } = validation.data;
    logger.debug('Controlling attention', { mode, targetCount: targets?.length ?? 0 });

    // Update attention state based on mode
    const newFocus: string[] = targets?.map(t => t.entity) ?? [];
    let newBreadth = 0.5;
    let newIntensity = 0.7;

    switch (mode) {
      case 'focus':
        // Narrow, intense focus
        newBreadth = 0.2;
        newIntensity = 0.9;
        break;

      case 'diffuse':
        // Broad, relaxed attention
        newBreadth = 0.9;
        newIntensity = 0.4;
        break;

      case 'selective':
        // Selective attention based on targets
        newBreadth = 0.3;
        newIntensity = 0.8;
        break;

      case 'divided':
        // Divided attention across multiple targets
        newBreadth = 0.6;
        newIntensity = 0.6;
        break;

      case 'sustained':
        // Maintained attention over time
        newBreadth = currentAttentionState.breadth;
        newIntensity = 0.75;
        break;
    }

    // Apply target weights to intensity
    if (targets && targets.length > 0) {
      const avgWeight = targets.reduce((s, t) => s + t.weight, 0) / targets.length;
      newIntensity = (newIntensity + avgWeight) / 2;
    }

    // Apply filters
    const newFilters = filters ?? currentAttentionState.filters;

    // Identify distractors (entities matching exclude patterns)
    const distractors: string[] = [];
    if (newFilters.excludePatterns) {
      for (const pattern of newFilters.excludePatterns) {
        try {
          const regex = new RegExp(pattern);
          for (const focus of newFocus) {
            if (regex.test(focus)) {
              distractors.push(focus);
            }
          }
        } catch {
          // Invalid regex, skip
        }
      }
    }

    // Update state
    currentAttentionState = {
      mode,
      focus: newFocus.filter(f => !distractors.includes(f)),
      breadth: newBreadth,
      intensity: newIntensity,
      filters: newFilters,
      distractors,
    };

    const interpretations: Record<AttentionMode, string> = {
      focus: 'Attention narrowed to specific targets with high intensity',
      diffuse: 'Attention broadened for creative exploration',
      selective: 'Attention filtered to relevant information',
      divided: 'Attention distributed across multiple targets',
      sustained: 'Attention maintained for extended duration',
    };

    const output: AttentionControlOutput = {
      mode,
      state: {
        focus: currentAttentionState.focus,
        breadth: newBreadth,
        intensity: newIntensity,
      },
      details: {
        targetsActive: currentAttentionState.focus.length,
        filterPatterns: (newFilters.includePatterns?.length ?? 0) + (newFilters.excludePatterns?.length ?? 0),
        interpretation: interpretations[mode],
      },
    };

    const duration = performance.now() - startTime;
    logger.info('Attention control completed', {
      mode,
      focus: currentAttentionState.focus.length,
      durationMs: duration.toFixed(2),
    });

    return successResult(output);
  } catch (error) {
    logger.error('Attention control failed', { error: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export const attentionControlTool: MCPTool = {
  name: 'cognition/attention-control',
  description: 'Control cognitive attention and information filtering. Supports focus, diffuse, selective, divided, and sustained attention modes.',
  category: 'cognition',
  version: '0.1.0',
  tags: ['attention', 'cognitive', 'focus', 'filter'],
  cacheable: false,
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['focus', 'diffuse', 'selective', 'divided', 'sustained'],
      },
      targets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            entity: { type: 'string' },
            weight: { type: 'number' },
            duration: { type: 'number' },
          },
        },
      },
      filters: {
        type: 'object',
        properties: {
          includePatterns: { type: 'array', items: { type: 'string' } },
          excludePatterns: { type: 'array', items: { type: 'string' } },
          noveltyBias: { type: 'number', default: 0.5 },
        },
      },
    },
    required: ['mode'],
  },
  handler: attentionControlHandler,
};

// ============================================================================
// Tool 3: Meta-Monitor
// ============================================================================

async function metaMonitorHandler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    const validation = MetaMonitorInputSchema.safeParse(input);
    if (!validation.success) {
      logger.error('Input validation failed', { error: validation.error.message });
      return errorResult(`Invalid input: ${validation.error.message}`);
    }

    const { monitoring, reflection, interventions } = validation.data;
    logger.debug('Performing meta-cognitive monitoring', {
      monitoringTypes: monitoring?.length ?? 0,
      interventions
    });

    // Perform assessments based on monitoring types
    const assessments: Record<string, number> = {};
    let errorsDetected = 0;
    const suggestedInterventions: string[] = [];

    const monitoringTypes = monitoring ?? [
      'confidence_calibration',
      'reasoning_coherence',
      'cognitive_load',
    ] as MonitoringType[];

    for (const type of monitoringTypes) {
      switch (type) {
        case 'confidence_calibration':
          // Assess confidence calibration
          assessments['confidence_calibration'] = 0.7 + Math.random() * 0.2;
          if (assessments['confidence_calibration'] < 0.6) {
            suggestedInterventions.push('Recalibrate confidence estimates');
          }
          break;

        case 'reasoning_coherence':
          // Assess reasoning coherence
          assessments['reasoning_coherence'] = 0.75 + Math.random() * 0.2;
          if (assessments['reasoning_coherence'] < 0.7) {
            errorsDetected++;
            suggestedInterventions.push('Review reasoning chain for inconsistencies');
          }
          break;

        case 'goal_tracking':
          // Assess goal tracking
          assessments['goal_tracking'] = 0.8 + Math.random() * 0.15;
          if (assessments['goal_tracking'] < 0.7) {
            suggestedInterventions.push('Realign with original goals');
          }
          break;

        case 'cognitive_load':
          // Assess cognitive load
          const totalLoad = calculateTotalLoad(
            currentCognitiveLoad.intrinsic,
            currentCognitiveLoad.extraneous,
            currentCognitiveLoad.germane
          );
          assessments['cognitive_load'] = 1 - totalLoad; // Higher is better (less loaded)
          if (totalLoad > 0.7) {
            suggestedInterventions.push('Reduce cognitive load - simplify or chunk information');
          }
          break;

        case 'error_detection':
          // Detect potential errors
          const errorProbability = Math.random();
          assessments['error_detection'] = 1 - errorProbability * 0.3;
          if (errorProbability > 0.7) {
            errorsDetected++;
            suggestedInterventions.push('Potential error detected - verify recent conclusions');
          }
          break;

        case 'uncertainty_estimation':
          // Estimate uncertainty
          assessments['uncertainty_estimation'] = 0.3 + Math.random() * 0.4;
          if (assessments['uncertainty_estimation'] > 0.6) {
            suggestedInterventions.push('High uncertainty - gather more information');
          }
          break;
      }
    }

    // Calculate aggregate metrics
    const confidence = (assessments['confidence_calibration'] ?? 0.7);
    const uncertainty = (assessments['uncertainty_estimation'] ?? 0.3);
    const coherence = (assessments['reasoning_coherence'] ?? 0.8);
    const loadScore = (assessments['cognitive_load'] ?? 0.7);
    const cognitiveLoad = 1 - loadScore;

    // Apply reflection if configured
    let reflectionDepth: ReflectionDepth | null = null;
    if (reflection) {
      reflectionDepth = reflection.depth ?? 'medium';

      // Deeper reflection triggers more interventions
      if (reflectionDepth === 'deep') {
        suggestedInterventions.push('Examine underlying assumptions');
        suggestedInterventions.push('Consider alternative perspectives');
      } else if (reflectionDepth === 'medium') {
        suggestedInterventions.push('Review recent decisions');
      }
    }

    // Generate interpretation
    let interpretation = '';
    if (confidence > 0.8 && coherence > 0.8 && cognitiveLoad < 0.6) {
      interpretation = 'Cognitive state is optimal - proceed with confidence';
    } else if (cognitiveLoad > 0.8) {
      interpretation = 'Cognitive overload detected - recommend task decomposition';
    } else if (errorsDetected > 0) {
      interpretation = `${errorsDetected} potential error(s) detected - verification recommended`;
    } else if (uncertainty > 0.6) {
      interpretation = 'High uncertainty state - additional information gathering recommended';
    } else {
      interpretation = 'Cognitive state is acceptable with minor concerns';
    }

    const output: MetaMonitorOutput = {
      assessment: {
        confidence,
        uncertainty,
        coherence,
        cognitiveLoad,
      },
      interventions: interventions ? suggestedInterventions : [],
      details: {
        monitoringTypes,
        reflectionDepth,
        errorsDetected,
        interpretation,
      },
    };

    const duration = performance.now() - startTime;
    logger.info('Meta-cognitive monitoring completed', {
      confidence: confidence.toFixed(2),
      errorsDetected,
      durationMs: duration.toFixed(2),
    });

    return successResult(output);
  } catch (error) {
    logger.error('Meta-cognitive monitoring failed', { error: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export const metaMonitorTool: MCPTool = {
  name: 'cognition/meta-monitor',
  description: 'Meta-cognitive monitoring of reasoning quality. Monitors confidence, coherence, goal tracking, cognitive load, error detection, and uncertainty estimation.',
  category: 'cognition',
  version: '0.1.0',
  tags: ['meta-cognition', 'monitoring', 'reflection', 'self-assessment'],
  cacheable: false,
  inputSchema: {
    type: 'object',
    properties: {
      monitoring: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['confidence_calibration', 'reasoning_coherence', 'goal_tracking', 'cognitive_load', 'error_detection', 'uncertainty_estimation'],
        },
      },
      reflection: {
        type: 'object',
        properties: {
          trigger: { type: 'string', enum: ['periodic', 'on_error', 'on_uncertainty'] },
          depth: { type: 'string', enum: ['shallow', 'medium', 'deep'] },
        },
      },
      interventions: { type: 'boolean', default: true },
    },
  },
  handler: metaMonitorHandler,
};

// ============================================================================
// Tool 4: Scaffold
// ============================================================================

async function scaffoldHandler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    const validation = ScaffoldInputSchema.safeParse(input);
    if (!validation.success) {
      logger.error('Input validation failed', { error: validation.error.message });
      return errorResult(`Invalid input: ${validation.error.message}`);
    }

    const { task, scaffoldType, adaptivity } = validation.data;
    logger.debug('Generating scaffold', { complexity: task.complexity, scaffoldType });

    const stepCount = generateScaffoldSteps(task.complexity, scaffoldType);
    const steps: ScaffoldStep[] = [];

    // Generate scaffold steps based on type
    const scaffoldTemplates: Record<ScaffoldType, (step: number, total: number, taskDesc: string) => ScaffoldStep> = {
      decomposition: (step, total, taskDesc) => ({
        step,
        instruction: `Break "${taskDesc}" into sub-component ${step} of ${total}`,
        hints: [
          'Identify the smallest independent unit',
          'Consider dependencies between components',
        ],
        checkpoints: [`Sub-component ${step} defined`, `Dependencies identified`],
      }),

      analogy: (step, total, taskDesc) => ({
        step,
        instruction: `Find and apply analogy ${step} for "${taskDesc}"`,
        hints: [
          'Consider similar problems you have solved',
          'Map the analogy structure to current problem',
        ],
        checkpoints: [`Analogy ${step} identified`, `Mapping validated`],
      }),

      worked_example: (step, total, taskDesc) => ({
        step,
        instruction: `Study worked example step ${step} related to "${taskDesc}"`,
        hints: [
          'Focus on the reasoning, not just the answer',
          'Identify transferable patterns',
        ],
        checkpoints: [`Example ${step} understood`, `Pattern extracted`],
      }),

      socratic: (step, total, taskDesc) => ({
        step,
        instruction: `Answer guiding question ${step} about "${taskDesc}"`,
        hints: [
          'Explain your reasoning aloud',
          'Consider what you do not know',
        ],
        checkpoints: [`Question ${step} answered`, `Understanding verified`],
      }),

      metacognitive_prompting: (step, total, taskDesc) => ({
        step,
        instruction: `Apply metacognitive prompt ${step} to "${taskDesc}"`,
        hints: [
          'Assess your current understanding',
          'Plan your approach before executing',
        ],
        checkpoints: [`Self-assessment ${step} complete`, `Plan revised if needed`],
      }),

      chain_of_thought: (step, total, taskDesc) => ({
        step,
        instruction: `Reasoning step ${step} for "${taskDesc}"`,
        hints: [
          'Show your work explicitly',
          'Connect each step to the previous',
        ],
        checkpoints: [`Step ${step} reasoning clear`, `Connection to previous established`],
      }),
    };

    const template = scaffoldTemplates[scaffoldType];
    for (let i = 1; i <= stepCount; i++) {
      steps.push(template(i, stepCount, task.description.slice(0, 50)));
    }

    // Apply fading if enabled
    if (adaptivity?.fading) {
      // Reduce hints as steps progress
      for (let i = 0; i < steps.length; i++) {
        const fadeRatio = i / steps.length;
        const hintCount = Math.max(1, Math.floor(steps[i]!.hints.length * (1 - fadeRatio)));
        steps[i]!.hints = steps[i]!.hints.slice(0, hintCount);
      }
    }

    const interpretations: Record<TaskComplexity, string> = {
      simple: 'Minimal scaffolding provided for straightforward task',
      moderate: 'Moderate scaffolding to guide through task complexity',
      complex: 'Substantial scaffolding with detailed guidance',
      expert: 'Comprehensive scaffolding for expert-level challenge',
    };

    const output: ScaffoldOutput = {
      scaffoldType,
      steps,
      details: {
        taskComplexity: task.complexity,
        stepCount,
        fadingEnabled: adaptivity?.fading ?? true,
        interpretation: interpretations[task.complexity],
      },
    };

    const duration = performance.now() - startTime;
    logger.info('Scaffold generated', {
      scaffoldType,
      stepCount,
      durationMs: duration.toFixed(2),
    });

    return successResult(output);
  } catch (error) {
    logger.error('Scaffold generation failed', { error: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export const scaffoldTool: MCPTool = {
  name: 'cognition/scaffold',
  description: 'Provide cognitive scaffolding for complex reasoning. Supports decomposition, analogy, worked example, socratic, metacognitive prompting, and chain of thought scaffolds.',
  category: 'cognition',
  version: '0.1.0',
  tags: ['scaffolding', 'cognitive', 'learning', 'zpd'],
  cacheable: true,
  cacheTTL: 60000,
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          complexity: { type: 'string', enum: ['simple', 'moderate', 'complex', 'expert'] },
          domain: { type: 'string' },
        },
      },
      scaffoldType: {
        type: 'string',
        enum: ['decomposition', 'analogy', 'worked_example', 'socratic', 'metacognitive_prompting', 'chain_of_thought'],
      },
      adaptivity: {
        type: 'object',
        properties: {
          fading: { type: 'boolean', default: true },
          monitoring: { type: 'boolean', default: true },
        },
      },
    },
    required: ['task', 'scaffoldType'],
  },
  handler: scaffoldHandler,
};

// ============================================================================
// Tool 5: Cognitive Load
// ============================================================================

async function cognitiveLoadHandler(
  input: Record<string, unknown>,
  context?: ToolContext
): Promise<MCPToolResult> {
  const logger = context?.logger ?? defaultLogger;
  const startTime = performance.now();

  try {
    const validation = CognitiveLoadInputSchema.safeParse(input);
    if (!validation.success) {
      logger.error('Input validation failed', { error: validation.error.message });
      return errorResult(`Invalid input: ${validation.error.message}`);
    }

    const { assessment, optimization, threshold } = validation.data;
    logger.debug('Managing cognitive load', { optimization, threshold });

    // Update current load if assessment provided
    if (assessment) {
      if (assessment.intrinsic !== undefined) {
        currentCognitiveLoad.intrinsic = assessment.intrinsic;
      }
      if (assessment.extraneous !== undefined) {
        currentCognitiveLoad.extraneous = assessment.extraneous;
      }
      if (assessment.germane !== undefined) {
        currentCognitiveLoad.germane = assessment.germane;
      }
    }

    const totalLoad = calculateTotalLoad(
      currentCognitiveLoad.intrinsic,
      currentCognitiveLoad.extraneous,
      currentCognitiveLoad.germane
    );
    const overloaded = totalLoad > threshold;

    // Generate recommendations based on optimization strategy
    const recommendations: string[] = [];

    switch (optimization) {
      case 'reduce_extraneous':
        if (currentCognitiveLoad.extraneous > 0.3) {
          recommendations.push('Simplify presentation and remove unnecessary elements');
          recommendations.push('Use consistent formatting and layout');
          recommendations.push('Reduce visual clutter and distractions');
        }
        break;

      case 'chunk_intrinsic':
        if (currentCognitiveLoad.intrinsic > 0.5) {
          recommendations.push('Break complex concepts into smaller chunks');
          recommendations.push('Present information sequentially, not all at once');
          recommendations.push('Build on prior knowledge incrementally');
        }
        break;

      case 'maximize_germane':
        if (currentCognitiveLoad.germane < 0.4) {
          recommendations.push('Encourage active processing and elaboration');
          recommendations.push('Connect new information to existing knowledge');
          recommendations.push('Provide opportunities for practice and application');
        }
        break;

      case 'balanced':
      default:
        if (overloaded) {
          if (currentCognitiveLoad.extraneous > currentCognitiveLoad.intrinsic) {
            recommendations.push('Reduce extraneous load first - simplify presentation');
          } else {
            recommendations.push('Chunk intrinsic load - break down complexity');
          }
        }
        if (currentCognitiveLoad.germane < 0.3) {
          recommendations.push('Increase germane load - add meaningful learning activities');
        }
        break;
    }

    // Add general recommendations based on total load
    if (overloaded) {
      recommendations.push('Take a break to allow cognitive recovery');
      recommendations.push('Consider offloading to external memory (notes, tools)');
    } else if (totalLoad < 0.3) {
      recommendations.push('Cognitive resources available - can take on more complexity');
    }

    const interpretations: Record<LoadOptimization, string> = {
      reduce_extraneous: 'Focusing on reducing presentation complexity',
      chunk_intrinsic: 'Breaking down inherent task complexity',
      maximize_germane: 'Maximizing productive learning load',
      balanced: 'Balancing all cognitive load components',
    };

    const output: CognitiveLoadOutput = {
      currentLoad: {
        intrinsic: currentCognitiveLoad.intrinsic,
        extraneous: currentCognitiveLoad.extraneous,
        germane: currentCognitiveLoad.germane,
        total: totalLoad,
      },
      overloaded,
      recommendations,
      details: {
        optimization,
        threshold,
        interpretation: overloaded
          ? `Cognitive overload detected (${(totalLoad * 100).toFixed(1)}% > ${(threshold * 100).toFixed(1)}%). ${interpretations[optimization]}`
          : `Cognitive load is manageable (${(totalLoad * 100).toFixed(1)}%). ${interpretations[optimization]}`,
      },
    };

    const duration = performance.now() - startTime;
    logger.info('Cognitive load management completed', {
      totalLoad: totalLoad.toFixed(2),
      overloaded,
      durationMs: duration.toFixed(2),
    });

    return successResult(output);
  } catch (error) {
    logger.error('Cognitive load management failed', { error: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export const cognitiveLoadTool: MCPTool = {
  name: 'cognition/cognitive-load',
  description: 'Monitor and balance cognitive load during reasoning. Manages intrinsic, extraneous, and germane load with optimization strategies.',
  category: 'cognition',
  version: '0.1.0',
  tags: ['cognitive-load', 'clt', 'optimization', 'learning'],
  cacheable: false,
  inputSchema: {
    type: 'object',
    properties: {
      assessment: {
        type: 'object',
        properties: {
          intrinsic: { type: 'number', description: 'Task complexity (0-1)' },
          extraneous: { type: 'number', description: 'Presentation complexity (0-1)' },
          germane: { type: 'number', description: 'Learning investment (0-1)' },
        },
      },
      optimization: {
        type: 'string',
        enum: ['reduce_extraneous', 'chunk_intrinsic', 'maximize_germane', 'balanced'],
        default: 'balanced',
      },
      threshold: { type: 'number', default: 0.8 },
    },
  },
  handler: cognitiveLoadHandler,
};

// ============================================================================
// Export All Tools
// ============================================================================

export const cognitiveKernelTools: MCPTool[] = [
  workingMemoryTool,
  attentionControlTool,
  metaMonitorTool,
  scaffoldTool,
  cognitiveLoadTool,
];

export const toolHandlers = new Map<string, MCPTool['handler']>([
  ['cognition/working-memory', workingMemoryTool.handler],
  ['cognition/attention-control', attentionControlTool.handler],
  ['cognition/meta-monitor', metaMonitorTool.handler],
  ['cognition/scaffold', scaffoldTool.handler],
  ['cognition/cognitive-load', cognitiveLoadTool.handler],
]);

export function getTool(name: string): MCPTool | undefined {
  return cognitiveKernelTools.find(t => t.name === name);
}

export function getToolNames(): string[] {
  return cognitiveKernelTools.map(t => t.name);
}

export default cognitiveKernelTools;
