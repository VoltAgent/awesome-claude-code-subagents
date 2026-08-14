/**
 * QE Model Routing Adapter
 *
 * Aligns TinyDancer model routing with ADR-026 Agent Booster routing.
 * Maps QE task categories to model tiers for optimal cost/performance.
 *
 * 3-Tier Routing Strategy:
 * - Tier 1 (Agent Booster): <1ms, $0 - Simple transforms, skip LLM
 * - Tier 2 (Haiku/Sonnet): ~500ms-2s, $0.0002-$0.003 - Simple/medium tasks
 * - Tier 3 (Opus): ~5s, $0.015 - Complex reasoning, architecture
 *
 * Based on:
 * - ADR-030: Agentic-QE Plugin Integration
 * - ADR-026: Agent Booster Model Routing
 *
 * @module v3/plugins/agentic-qe/bridges/QEModelRoutingAdapter
 */

import type {
  IQEModelRoutingAdapter,
  QETask,
  QERouteResult,
  ModelTier,
  ModelSelection,
  QELogger,
} from '../interfaces.js';

// V3 Router types (would be imported from @claude-flow/cli/ruvector in production)
interface IEnhancedModelRouter {
  route(
    task: string,
    options?: { filePath?: string }
  ): Promise<EnhancedRouteResult>;
}

interface EnhancedRouteResult {
  tier: ModelTier;
  model: ModelSelection;
  agentBoosterAvailable: boolean;
  agentBoosterIntent?: string;
  explanation: string;
  confidence: number;
}

/**
 * Category to complexity mapping
 * Based on TinyDancer categories aligned with ADR-026
 */
const CATEGORY_COMPLEXITY: Record<string, number> = {
  // Tier 1: Agent Booster (complexity < 0.2)
  'add-test-import': 0.10,
  'add-test-describe': 0.12,
  'add-assertion': 0.15,
  'add-mock': 0.18,
  'remove-console': 0.08,

  // Tier 2 Haiku (complexity 0.2-0.35)
  'generate-unit-test': 0.25,
  'generate-mock': 0.28,
  'analyze-coverage-line': 0.22,
  'validate-simple-contract': 0.30,
  'detect-flaky-test': 0.32,
  'generate-test-fixture': 0.28,

  // Tier 2 Sonnet (complexity 0.35-0.6)
  'generate-integration-test': 0.45,
  'analyze-coverage-branch': 0.42,
  'predict-defect-simple': 0.40,
  'validate-contract': 0.48,
  'generate-property-test': 0.50,
  'refactor-test': 0.52,
  'analyze-test-quality': 0.55,

  // Tier 3 Opus (complexity > 0.6)
  'generate-e2e-test': 0.70,
  'root-cause-analysis': 0.80,
  'chaos-experiment-design': 0.85,
  'security-audit-deep': 0.90,
  'architecture-analysis': 0.92,
  'generate-fuzzing-strategy': 0.75,
  'design-test-strategy': 0.78,
  'accessibility-audit': 0.72,
};

/**
 * Agent Booster intents for Tier 1 operations
 */
const AGENT_BOOSTER_INTENTS: Record<string, string> = {
  'add-test-import': 'add-import',
  'add-test-describe': 'add-describe-block',
  'add-assertion': 'add-assertion',
  'add-mock': 'add-mock',
  'remove-console': 'remove-console',
  'add-test-export': 'add-export',
};

/**
 * Category to agent mapping
 */
const CATEGORY_AGENTS: Record<string, string[]> = {
  // Test Generation
  'generate-unit-test': ['unit-test-generator'],
  'generate-integration-test': ['integration-test-generator', 'mock-generator', 'test-runner'],
  'generate-e2e-test': ['e2e-test-generator', 'browser-automation', 'test-runner', 'result-aggregator', 'visual-regression-detector'],
  'generate-property-test': ['property-test-generator', 'test-runner'],
  'generate-mock': ['mock-generator'],

  // Coverage Analysis
  'analyze-coverage-line': ['coverage-collector', 'gap-detector'],
  'analyze-coverage-branch': ['coverage-collector', 'gap-detector', 'priority-ranker'],

  // Defect Intelligence
  'predict-defect-simple': ['defect-predictor'],
  'root-cause-analysis': ['root-cause-analyzer', 'defect-predictor', 'pattern-detector', 'knowledge-graph-builder', 'semantic-searcher'],

  // Security
  'security-audit-deep': ['sast-scanner', 'dast-scanner', 'compliance-checker', 'audit-trail-manager', 'root-cause-analyzer'],

  // Chaos
  'chaos-experiment-design': ['chaos-injector', 'resilience-assessor', 'recovery-validator', 'load-generator', 'metric-aggregator'],

  // Contract
  'validate-contract': ['openapi-validator', 'graphql-validator', 'grpc-validator'],
  'validate-simple-contract': ['openapi-validator'],

  // Architecture
  'architecture-analysis': ['knowledge-graph-builder', 'dependency-analyzer', 'complexity-assessor', 'pattern-miner', 'semantic-searcher'],
};

/**
 * Model tier cost estimates per request
 */
const TIER_COSTS: Record<ModelTier, number> = {
  1: 0,        // Agent Booster - free
  2: 0.001,    // Haiku/Sonnet average
  3: 0.015,    // Opus
};

/**
 * Model selection by tier
 */
const TIER_MODELS: Record<ModelTier, ModelSelection> = {
  1: 'haiku',   // Fallback if Agent Booster unavailable
  2: 'sonnet',  // Default for Tier 2
  3: 'opus',    // Always Opus for Tier 3
};

/**
 * QE Model Routing Adapter Implementation
 *
 * Aligns TinyDancer routing with V3's ADR-026 Agent Booster routing.
 * Provides optimal model selection for QE tasks.
 */
export class QEModelRoutingAdapter implements IQEModelRoutingAdapter {
  private v3Router: IEnhancedModelRouter | null;
  private logger: QELogger;

  constructor(
    logger: QELogger,
    v3Router?: IEnhancedModelRouter
  ) {
    this.logger = logger;
    this.v3Router = v3Router || null;
  }

  /**
   * Route a QE task to the appropriate model tier
   */
  async routeQETask(task: QETask): Promise<QERouteResult> {
    try {
      this.logger.debug(`Routing QE task: ${task.category}`);

      // 1. Get QE-specific complexity
      const complexity = this.getCategoryComplexity(task.category);

      // 2. Determine tier based on complexity
      const tier = this.determineTier(complexity);

      // 3. Check for Agent Booster availability
      const agentBooster = this.canUseAgentBooster(task);

      // 4. Try V3 router if available for enhanced routing
      let v3Result: EnhancedRouteResult | null = null;
      if (this.v3Router) {
        try {
          v3Result = await this.v3Router.route(task.description, {
            filePath: task.targetPath,
          });
        } catch (error) {
          this.logger.warn('V3 router failed, using fallback', error);
        }
      }

      // 5. Build final route result
      const model = this.selectModel(tier, v3Result);
      const recommendedAgents = this.getRecommendedAgents(task.category, tier);
      const costEstimate = this.estimateCost(task, tier);

      const result: QERouteResult = {
        tier: agentBooster.available ? 1 : tier,
        model: agentBooster.available ? 'haiku' : model,
        qeCategory: task.category,
        qeComplexity: complexity,
        recommendedAgents,
        costEstimate: agentBooster.available ? 0 : costEstimate,
        agentBoosterAvailable: agentBooster.available,
        agentBoosterIntent: agentBooster.intent,
        explanation: this.buildExplanation(task, tier, agentBooster, v3Result),
      };

      this.logger.info(`Routed task "${task.category}" -> Tier ${result.tier} (${result.model})`);
      return result;
    } catch (error) {
      this.logger.error('Task routing failed', error);
      throw new QERoutingError('Task routing failed', error as Error);
    }
  }

  /**
   * Get complexity score for a category
   */
  getCategoryComplexity(category: string): number {
    // Check exact match
    if (CATEGORY_COMPLEXITY[category] !== undefined) {
      return CATEGORY_COMPLEXITY[category];
    }

    // Check partial matches
    for (const [key, value] of Object.entries(CATEGORY_COMPLEXITY)) {
      if (category.includes(key) || key.includes(category)) {
        return value;
      }
    }

    // Default to medium complexity
    this.logger.debug(`Unknown category "${category}", defaulting to 0.5 complexity`);
    return 0.5;
  }

  /**
   * Get recommended agents for a tier and category
   */
  getRecommendedAgents(category: string, tier: ModelTier): string[] {
    // Get agents for category
    const categoryAgents = CATEGORY_AGENTS[category] || ['generic-qe-agent'];

    // Tier determines how many agents to use
    const tierAgentCounts: Record<ModelTier, number> = {
      1: 1,  // Single agent for simple tasks
      2: 3,  // Small team for medium tasks
      3: 5,  // Full team for complex tasks
    };

    const maxAgents = tierAgentCounts[tier];
    return categoryAgents.slice(0, maxAgents);
  }

  /**
   * Estimate cost for a task
   */
  estimateCost(task: QETask, tier: ModelTier): number {
    const baseCost = TIER_COSTS[tier];
    const complexity = this.getCategoryComplexity(task.category);

    // Adjust for task complexity and context
    let multiplier = 1 + complexity;

    // Larger files = more tokens = higher cost
    if (task.context?.fileSize && typeof task.context.fileSize === 'number') {
      const fileSizeKb = task.context.fileSize / 1024;
      multiplier *= 1 + (fileSizeKb / 100); // +1% per 100KB
    }

    return Math.round(baseCost * multiplier * 10000) / 10000;
  }

  /**
   * Check if Agent Booster can handle the task
   */
  canUseAgentBooster(task: QETask): { available: boolean; intent?: string } {
    const intent = AGENT_BOOSTER_INTENTS[task.category];

    if (intent) {
      return { available: true, intent };
    }

    // Check if complexity is low enough for Agent Booster
    const complexity = this.getCategoryComplexity(task.category);
    if (complexity < 0.2) {
      // Infer intent from category
      if (task.category.includes('add-')) {
        return { available: true, intent: task.category };
      }
      if (task.category.includes('remove-')) {
        return { available: true, intent: task.category };
      }
    }

    return { available: false };
  }

  /**
   * Determine tier based on complexity
   */
  private determineTier(complexity: number): ModelTier {
    if (complexity < 0.2) return 1;
    if (complexity < 0.6) return 2;
    return 3;
  }

  /**
   * Select model based on tier and V3 router result
   */
  private selectModel(tier: ModelTier, v3Result: EnhancedRouteResult | null): ModelSelection {
    // If V3 router provided a result, use its model if tiers align
    if (v3Result && v3Result.tier === tier) {
      return v3Result.model;
    }

    // Tier 2 decision: Haiku for simpler, Sonnet for medium
    if (tier === 2) {
      // Use Sonnet as default for Tier 2 in QE (more capable for test generation)
      return 'sonnet';
    }

    return TIER_MODELS[tier];
  }

  /**
   * Build explanation for routing decision
   */
  private buildExplanation(
    task: QETask,
    tier: ModelTier,
    agentBooster: { available: boolean; intent?: string },
    v3Result: EnhancedRouteResult | null
  ): string {
    const parts: string[] = [];

    // Category and complexity
    const complexity = this.getCategoryComplexity(task.category);
    parts.push(`Task category "${task.category}" has complexity ${complexity.toFixed(2)}.`);

    // Agent Booster
    if (agentBooster.available) {
      parts.push(`Agent Booster available (intent: ${agentBooster.intent}) for 352x faster execution at $0 cost.`);
    }

    // Tier selection
    const tierDescriptions: Record<ModelTier, string> = {
      1: 'Simple transformation - can be handled without LLM',
      2: 'Medium complexity - requires Haiku or Sonnet',
      3: 'High complexity - requires Opus for complex reasoning',
    };
    parts.push(`Selected Tier ${tier}: ${tierDescriptions[tier]}.`);

    // V3 router alignment
    if (v3Result) {
      if (v3Result.tier === tier) {
        parts.push('V3 router agrees with tier selection.');
      } else {
        parts.push(`V3 router suggested Tier ${v3Result.tier} but QE complexity mapping prefers Tier ${tier}.`);
      }
    }

    // Agent recommendation
    const agents = this.getRecommendedAgents(task.category, tier);
    parts.push(`Recommended ${agents.length} agent(s): ${agents.join(', ')}.`);

    return parts.join(' ');
  }
}

/**
 * QE Routing Error class
 */
export class QERoutingError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'QERoutingError';
    this.cause = cause;
  }
}
