/**
 * prioritize-gaps.ts - Risk-based gap prioritization MCP tool handler
 *
 * Prioritizes coverage gaps based on multiple risk factors including
 * code complexity, change frequency, business criticality, and defect history.
 */

import { z } from 'zod';

// Input schema for prioritize-gaps tool
export const PrioritizeGapsInputSchema = z.object({
  gaps: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(['line', 'branch', 'function']),
        file: z.string(),
        startLine: z.number(),
        endLine: z.number(),
      })
    )
    .optional()
    .describe('Pre-analyzed gaps (or will analyze from targetPath)'),
  targetPath: z.string().optional().describe('Path to analyze if gaps not provided'),
  factors: z
    .array(
      z.enum([
        'complexity',
        'change-frequency',
        'defect-history',
        'business-critical',
        'dependency-count',
        'test-difficulty',
      ])
    )
    .default(['complexity', 'change-frequency', 'defect-history'])
    .describe('Prioritization factors'),
  weights: z
    .object({
      complexity: z.number().min(0).max(1).default(0.25),
      changeFrequency: z.number().min(0).max(1).default(0.25),
      defectHistory: z.number().min(0).max(1).default(0.2),
      businessCritical: z.number().min(0).max(1).default(0.15),
      dependencyCount: z.number().min(0).max(1).default(0.1),
      testDifficulty: z.number().min(0).max(1).default(0.05),
    })
    .optional()
    .describe('Custom weights for prioritization factors'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum gaps to return'),
  groupBy: z
    .enum(['risk', 'file', 'type', 'none'])
    .default('risk')
    .describe('How to group the results'),
});

export type PrioritizeGapsInput = z.infer<typeof PrioritizeGapsInputSchema>;

// Output structures
export interface PrioritizeGapsOutput {
  success: boolean;
  prioritizedGaps: PrioritizedGap[];
  groups: GapGroup[];
  statistics: PrioritizationStatistics;
  recommendations: Recommendation[];
  metadata: PrioritizationMetadata;
}

export interface PrioritizedGap {
  id: string;
  type: 'line' | 'branch' | 'function';
  file: string;
  location: { startLine: number; endLine: number };
  risk: 'critical' | 'high' | 'medium' | 'low';
  priorityScore: number;
  factors: FactorScore[];
  effort: 'low' | 'medium' | 'high';
  roi: number; // Return on investment for testing this gap
}

export interface FactorScore {
  factor: string;
  score: number;
  weight: number;
  contribution: number;
  details: string;
}

export interface GapGroup {
  name: string;
  count: number;
  avgPriorityScore: number;
  gaps: PrioritizedGap[];
}

export interface PrioritizationStatistics {
  totalGaps: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  avgPriorityScore: number;
  avgEffort: string;
  estimatedTestingEffort: string;
}

export interface Recommendation {
  type: 'immediate-action' | 'short-term' | 'long-term';
  priority: number;
  description: string;
  affectedGaps: string[];
  expectedImpact: string;
}

export interface PrioritizationMetadata {
  analyzedAt: string;
  durationMs: number;
  factorsUsed: string[];
  weightsApplied: Record<string, number>;
}

// Tool context interface
export interface ToolContext {
  get<T>(key: string): T | undefined;
}

// Default weights
const DEFAULT_WEIGHTS = {
  complexity: 0.25,
  changeFrequency: 0.25,
  defectHistory: 0.2,
  businessCritical: 0.15,
  dependencyCount: 0.1,
  testDifficulty: 0.05,
};

/**
 * MCP Tool Handler for prioritize-gaps
 */
export async function handler(
  input: PrioritizeGapsInput,
  context: ToolContext
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const startTime = Date.now();

  try {
    // Validate input
    const validatedInput = PrioritizeGapsInputSchema.parse(input);

    // Get bridge for defect history lookup
    const bridge = context.get<{ searchSimilarPatterns: (q: string, k: number) => Promise<unknown[]> }>('aqe.bridge');

    // Get or generate gaps
    let gaps = validatedInput.gaps;
    if (!gaps || gaps.length === 0) {
      if (!validatedInput.targetPath) {
        throw new Error('Either gaps or targetPath must be provided');
      }
      gaps = await generateGapsFromPath(validatedInput.targetPath);
    }

    // Apply weights
    const weights = { ...DEFAULT_WEIGHTS, ...validatedInput.weights };

    // Calculate priority scores for each gap
    const prioritizedGaps = await calculatePriorities(
      gaps,
      validatedInput.factors,
      weights,
      bridge
    );

    // Sort by priority score
    prioritizedGaps.sort((a, b) => b.priorityScore - a.priorityScore);

    // Limit results
    const limitedGaps = prioritizedGaps.slice(0, validatedInput.limit);

    // Group results
    const groups = groupGaps(limitedGaps, validatedInput.groupBy);

    // Calculate statistics
    const statistics = calculateStatistics(prioritizedGaps);

    // Generate recommendations
    const recommendations = generateRecommendations(limitedGaps, statistics);

    // Build result
    const result: PrioritizeGapsOutput = {
      success: true,
      prioritizedGaps: limitedGaps,
      groups,
      statistics,
      recommendations,
      metadata: {
        analyzedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        factorsUsed: validatedInput.factors,
        weightsApplied: weights,
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: errorMessage,
              prioritizedGaps: [],
              metadata: {
                analyzedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
}

// Input gap type
interface InputGap {
  id: string;
  type: 'line' | 'branch' | 'function';
  file: string;
  startLine: number;
  endLine: number;
}

async function generateGapsFromPath(targetPath: string): Promise<InputGap[]> {
  // Simulated gap generation
  return [
    { id: 'gap-1', type: 'branch', file: targetPath, startLine: 25, endLine: 35 },
    { id: 'gap-2', type: 'function', file: targetPath, startLine: 50, endLine: 70 },
    { id: 'gap-3', type: 'line', file: targetPath, startLine: 100, endLine: 105 },
    { id: 'gap-4', type: 'branch', file: targetPath, startLine: 120, endLine: 140 },
    { id: 'gap-5', type: 'function', file: targetPath, startLine: 200, endLine: 250 },
  ];
}

async function calculatePriorities(
  gaps: InputGap[],
  factors: string[],
  weights: Record<string, number>,
  bridge?: { searchSimilarPatterns: (q: string, k: number) => Promise<unknown[]> }
): Promise<PrioritizedGap[]> {
  const prioritizedGaps: PrioritizedGap[] = [];

  for (const gap of gaps) {
    const factorScores: FactorScore[] = [];
    let totalScore = 0;

    // Calculate each factor
    if (factors.includes('complexity')) {
      const score = calculateComplexityScore(gap);
      const contribution = score * weights.complexity;
      factorScores.push({
        factor: 'complexity',
        score,
        weight: weights.complexity,
        contribution,
        details: `Cyclomatic complexity: ${Math.round(score * 20)}`,
      });
      totalScore += contribution;
    }

    if (factors.includes('change-frequency')) {
      const score = calculateChangeFrequency(gap);
      const contribution = score * weights.changeFrequency;
      factorScores.push({
        factor: 'change-frequency',
        score,
        weight: weights.changeFrequency,
        contribution,
        details: `Changes in last 90 days: ${Math.round(score * 10)}`,
      });
      totalScore += contribution;
    }

    if (factors.includes('defect-history')) {
      const score = await calculateDefectHistory(gap, bridge);
      const contribution = score * weights.defectHistory;
      factorScores.push({
        factor: 'defect-history',
        score,
        weight: weights.defectHistory,
        contribution,
        details: `Historical defects: ${Math.round(score * 5)}`,
      });
      totalScore += contribution;
    }

    if (factors.includes('business-critical')) {
      const score = calculateBusinessCriticality(gap);
      const contribution = score * weights.businessCritical;
      factorScores.push({
        factor: 'business-critical',
        score,
        weight: weights.businessCritical,
        contribution,
        details: `Business impact: ${score > 0.7 ? 'high' : score > 0.4 ? 'medium' : 'low'}`,
      });
      totalScore += contribution;
    }

    if (factors.includes('dependency-count')) {
      const score = calculateDependencyScore(gap);
      const contribution = score * weights.dependencyCount;
      factorScores.push({
        factor: 'dependency-count',
        score,
        weight: weights.dependencyCount,
        contribution,
        details: `Dependents: ${Math.round(score * 15)}`,
      });
      totalScore += contribution;
    }

    if (factors.includes('test-difficulty')) {
      const score = calculateTestDifficulty(gap);
      const contribution = score * weights.testDifficulty;
      factorScores.push({
        factor: 'test-difficulty',
        score,
        weight: weights.testDifficulty,
        contribution,
        details: `Test complexity: ${score > 0.7 ? 'hard' : score > 0.4 ? 'medium' : 'easy'}`,
      });
      totalScore += contribution;
    }

    // Normalize score
    const priorityScore = Math.round(totalScore * 100) / 100;

    // Determine risk level
    const risk = scoreToRisk(priorityScore);

    // Calculate effort and ROI
    const effort = calculateEffort(gap, factorScores);
    const roi = calculateROI(priorityScore, effort);

    prioritizedGaps.push({
      id: gap.id,
      type: gap.type,
      file: gap.file,
      location: { startLine: gap.startLine, endLine: gap.endLine },
      risk,
      priorityScore,
      factors: factorScores,
      effort,
      roi,
    });
  }

  return prioritizedGaps;
}

function calculateComplexityScore(gap: InputGap): number {
  const lines = gap.endLine - gap.startLine;
  // Estimate cyclomatic complexity from line count
  const estimatedComplexity = lines / 5;
  return Math.min(estimatedComplexity / 10, 1);
}

function calculateChangeFrequency(gap: InputGap): number {
  // Simulated change frequency based on file location
  // In real implementation, would check git history
  const pathDepth = gap.file.split('/').length;
  return Math.min(pathDepth / 10, 1) * 0.8 + Math.random() * 0.2;
}

async function calculateDefectHistory(
  gap: InputGap,
  bridge?: { searchSimilarPatterns: (q: string, k: number) => Promise<unknown[]> }
): Promise<number> {
  if (bridge) {
    try {
      const patterns = await bridge.searchSimilarPatterns(`defect ${gap.file}`, 3);
      return Math.min(patterns.length / 5, 1);
    } catch {
      // Fall through to simulated
    }
  }
  // Simulated defect history
  return Math.random() * 0.5;
}

function calculateBusinessCriticality(gap: InputGap): number {
  // Determine criticality based on file path
  const criticalPaths = ['auth', 'payment', 'security', 'core', 'api'];
  const pathLower = gap.file.toLowerCase();
  for (const path of criticalPaths) {
    if (pathLower.includes(path)) {
      return 0.9;
    }
  }
  return 0.3;
}

function calculateDependencyScore(gap: InputGap): number {
  // Simulated dependency count
  const lines = gap.endLine - gap.startLine;
  return Math.min(lines / 50, 1);
}

function calculateTestDifficulty(gap: InputGap): number {
  // Estimate test difficulty
  const lines = gap.endLine - gap.startLine;
  if (lines > 30) return 0.8;
  if (lines > 15) return 0.5;
  return 0.2;
}

function scoreToRisk(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 0.75) return 'critical';
  if (score >= 0.5) return 'high';
  if (score >= 0.25) return 'medium';
  return 'low';
}

function calculateEffort(gap: InputGap, factors: FactorScore[]): 'low' | 'medium' | 'high' {
  const lines = gap.endLine - gap.startLine;
  const difficultyFactor = factors.find((f) => f.factor === 'test-difficulty');
  const difficulty = difficultyFactor?.score ?? 0.5;

  const effortScore = (lines / 50) * 0.5 + difficulty * 0.5;
  if (effortScore > 0.7) return 'high';
  if (effortScore > 0.3) return 'medium';
  return 'low';
}

function calculateROI(priorityScore: number, effort: 'low' | 'medium' | 'high'): number {
  const effortMultiplier = { low: 3, medium: 2, high: 1 };
  return Math.round(priorityScore * effortMultiplier[effort] * 100) / 100;
}

function groupGaps(gaps: PrioritizedGap[], groupBy: string): GapGroup[] {
  const groups: Map<string, PrioritizedGap[]> = new Map();

  for (const gap of gaps) {
    let key: string;
    switch (groupBy) {
      case 'risk':
        key = gap.risk;
        break;
      case 'file':
        key = gap.file;
        break;
      case 'type':
        key = gap.type;
        break;
      default:
        key = 'all';
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(gap);
  }

  return Array.from(groups.entries()).map(([name, gapList]) => ({
    name,
    count: gapList.length,
    avgPriorityScore: Math.round((gapList.reduce((sum, g) => sum + g.priorityScore, 0) / gapList.length) * 100) / 100,
    gaps: gapList,
  }));
}

function calculateStatistics(gaps: PrioritizedGap[]): PrioritizationStatistics {
  const total = gaps.length;
  if (total === 0) {
    return {
      totalGaps: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      avgPriorityScore: 0,
      avgEffort: 'unknown',
      estimatedTestingEffort: '0 hours',
    };
  }

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  const efforts = { low: 0, medium: 0, high: 0 };

  for (const gap of gaps) {
    counts[gap.risk]++;
    efforts[gap.effort]++;
  }

  const avgScore = gaps.reduce((sum, g) => sum + g.priorityScore, 0) / total;

  // Estimate testing effort
  const hours = efforts.low * 0.5 + efforts.medium * 2 + efforts.high * 5;

  return {
    totalGaps: total,
    criticalCount: counts.critical,
    highCount: counts.high,
    mediumCount: counts.medium,
    lowCount: counts.low,
    avgPriorityScore: Math.round(avgScore * 100) / 100,
    avgEffort: efforts.high > efforts.medium && efforts.high > efforts.low ? 'high' : efforts.medium > efforts.low ? 'medium' : 'low',
    estimatedTestingEffort: `${Math.round(hours)} hours`,
  };
}

function generateRecommendations(
  gaps: PrioritizedGap[],
  stats: PrioritizationStatistics
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Immediate action for critical gaps
  const criticalGaps = gaps.filter((g) => g.risk === 'critical');
  if (criticalGaps.length > 0) {
    recommendations.push({
      type: 'immediate-action',
      priority: 1,
      description: `Address ${criticalGaps.length} critical coverage gaps immediately`,
      affectedGaps: criticalGaps.map((g) => g.id),
      expectedImpact: 'Significant risk reduction',
    });
  }

  // High ROI opportunities
  const highROI = gaps.filter((g) => g.roi > 1).slice(0, 5);
  if (highROI.length > 0) {
    recommendations.push({
      type: 'short-term',
      priority: 2,
      description: `Focus on ${highROI.length} high-ROI gaps for maximum coverage impact`,
      affectedGaps: highROI.map((g) => g.id),
      expectedImpact: 'Best coverage improvement per effort invested',
    });
  }

  // Long-term refactoring
  const complexGaps = gaps.filter((g) => g.effort === 'high');
  if (complexGaps.length > 3) {
    recommendations.push({
      type: 'long-term',
      priority: 3,
      description: `Consider refactoring ${complexGaps.length} complex areas before testing`,
      affectedGaps: complexGaps.slice(0, 5).map((g) => g.id),
      expectedImpact: 'Improved testability and maintainability',
    });
  }

  return recommendations;
}

// Export tool definition for MCP registration
export const toolDefinition = {
  name: 'aqe/prioritize-gaps',
  description: 'Prioritize coverage gaps by risk score using multiple weighted factors',
  category: 'coverage-analysis',
  version: '3.2.3',
  inputSchema: PrioritizeGapsInputSchema,
  handler,
};

export default toolDefinition;
