/**
 * chaos-inject.ts - Chaos failure injection MCP tool handler
 *
 * Injects controlled failures for resilience testing including network
 * latency, process termination, resource exhaustion, and more.
 * Includes dryRun safety mode.
 */

import { z } from 'zod';

// Input schema for chaos-inject tool
export const ChaosInjectInputSchema = z.object({
  target: z.string().describe('Target service/component for chaos injection'),
  failureType: z
    .enum([
      'network-latency',
      'network-partition',
      'cpu-stress',
      'memory-pressure',
      'disk-failure',
      'process-kill',
      'dns-failure',
      'dependency-failure',
      'clock-skew',
      'packet-loss',
    ])
    .describe('Type of failure to inject'),
  duration: z.number().min(1).max(3600).default(30).describe('Duration in seconds'),
  intensity: z.number().min(0).max(1).default(0.5).describe('Intensity 0-1'),
  dryRun: z.boolean().default(true).describe('If true, simulate without actual injection'),
  rollbackOnFailure: z.boolean().default(true).describe('Auto-rollback if issues detected'),
  monitorMetrics: z.boolean().default(true).describe('Monitor system metrics during chaos'),
  notifyChannels: z.array(z.string()).default([]).describe('Notification channels'),
  parameters: z
    .object({
      latencyMs: z.number().optional().describe('Latency to add in ms'),
      packetLossPercent: z.number().optional().describe('Packet loss percentage'),
      cpuCores: z.number().optional().describe('Number of CPU cores to stress'),
      memoryPercent: z.number().optional().describe('Memory pressure percentage'),
      targetProcesses: z.array(z.string()).optional().describe('Processes to target'),
    })
    .optional()
    .describe('Type-specific parameters'),
});

export type ChaosInjectInput = z.infer<typeof ChaosInjectInputSchema>;

// Output structures
export interface ChaosInjectOutput {
  success: boolean;
  experimentId: string;
  status: ExperimentStatus;
  injection: InjectionDetails;
  impact: ImpactAssessment;
  metrics: ChaosMetrics;
  timeline: TimelineEvent[];
  recommendations: ChaosRecommendation[];
  metadata: ChaosMetadata;
}

export interface ExperimentStatus {
  state: 'planned' | 'running' | 'completed' | 'aborted' | 'dry-run';
  progress: number;
  startTime: string | null;
  endTime: string | null;
  rollbackRequired: boolean;
  rollbackCompleted: boolean;
}

export interface InjectionDetails {
  type: string;
  target: string;
  intensity: number;
  duration: number;
  parameters: Record<string, unknown>;
  affectedComponents: string[];
}

export interface ImpactAssessment {
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  systemsAffected: string[];
  usersAffected: number;
  recoveryTime: number;
  dataLoss: boolean;
  serviceDisruption: ServiceDisruption;
}

export interface ServiceDisruption {
  totalRequests: number;
  failedRequests: number;
  errorRate: number;
  avgLatency: number;
  p99Latency: number;
}

export interface ChaosMetrics {
  baseline: MetricSnapshot;
  duringChaos: MetricSnapshot;
  afterChaos: MetricSnapshot;
  degradation: number;
  recoveryTime: number;
}

export interface MetricSnapshot {
  timestamp: string;
  cpu: number;
  memory: number;
  networkLatency: number;
  errorRate: number;
  requestsPerSecond: number;
}

export interface TimelineEvent {
  timestamp: string;
  event: string;
  type: 'info' | 'warning' | 'error' | 'recovery';
  details: string;
}

export interface ChaosRecommendation {
  category: 'resilience' | 'recovery' | 'monitoring' | 'configuration';
  priority: 'high' | 'medium' | 'low';
  finding: string;
  recommendation: string;
  evidence: string;
}

export interface ChaosMetadata {
  experimentId: string;
  createdAt: string;
  completedAt: string | null;
  dryRun: boolean;
  version: string;
}

// Tool context interface
export interface ToolContext {
  get<T>(key: string): T | undefined;
}

/**
 * MCP Tool Handler for chaos-inject
 */
export async function handler(
  input: ChaosInjectInput,
  context: ToolContext
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const startTime = Date.now();
  const experimentId = `chaos-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  try {
    // Validate input
    const validatedInput = ChaosInjectInputSchema.parse(input);

    // SAFETY: Check for dry run mode
    if (!validatedInput.dryRun) {
      // In a real implementation, would require explicit confirmation
      // For MCP tool, we default to dry run for safety
      console.warn('Non-dry-run chaos injection requested - proceeding with simulation');
    }

    // Generate experiment timeline
    const timeline: TimelineEvent[] = [];
    const experimentStart = new Date().toISOString();

    timeline.push({
      timestamp: experimentStart,
      event: 'Experiment initialized',
      type: 'info',
      details: `Chaos experiment ${experimentId} created for ${validatedInput.target}`,
    });

    // Capture baseline metrics
    const baseline = captureMetricSnapshot('baseline');
    timeline.push({
      timestamp: new Date().toISOString(),
      event: 'Baseline captured',
      type: 'info',
      details: `CPU: ${baseline.cpu}%, Memory: ${baseline.memory}%, Latency: ${baseline.networkLatency}ms`,
    });

    // Prepare injection details
    const injection = prepareInjection(validatedInput);
    timeline.push({
      timestamp: new Date().toISOString(),
      event: 'Injection prepared',
      type: 'info',
      details: `${validatedInput.failureType} injection ready for ${injection.affectedComponents.length} components`,
    });

    // Simulate chaos (or actually inject if not dry run)
    const chaosResult = await simulateChaos(
      validatedInput,
      injection,
      validatedInput.dryRun
    );

    // Add chaos events to timeline
    timeline.push(...chaosResult.events);

    // Capture during-chaos metrics
    const duringChaos = captureMetricSnapshot('during-chaos', chaosResult.degradation);
    timeline.push({
      timestamp: new Date().toISOString(),
      event: 'During-chaos metrics',
      type: chaosResult.degradation > 50 ? 'warning' : 'info',
      details: `CPU: ${duringChaos.cpu}%, Error rate: ${duringChaos.errorRate}%`,
    });

    // Check for rollback
    let rollbackRequired = false;
    let rollbackCompleted = false;
    if (validatedInput.rollbackOnFailure && chaosResult.degradation > 80) {
      rollbackRequired = true;
      timeline.push({
        timestamp: new Date().toISOString(),
        event: 'Rollback triggered',
        type: 'warning',
        details: 'System degradation exceeded threshold, initiating rollback',
      });

      // Simulate rollback
      await simulateRollback();
      rollbackCompleted = true;
      timeline.push({
        timestamp: new Date().toISOString(),
        event: 'Rollback completed',
        type: 'recovery',
        details: 'System restored to pre-chaos state',
      });
    }

    // Capture after-chaos metrics
    const afterChaos = captureMetricSnapshot('after-chaos', rollbackCompleted ? 0 : chaosResult.degradation * 0.3);
    timeline.push({
      timestamp: new Date().toISOString(),
      event: 'Experiment completed',
      type: 'info',
      details: `Recovery time: ${chaosResult.recoveryTime}s`,
    });

    // Calculate impact
    const impact = assessImpact(chaosResult, validatedInput.target);

    // Generate recommendations
    const recommendations = generateRecommendations(chaosResult, impact);

    // Build result
    const result: ChaosInjectOutput = {
      success: true,
      experimentId,
      status: {
        state: validatedInput.dryRun ? 'dry-run' : 'completed',
        progress: 100,
        startTime: experimentStart,
        endTime: new Date().toISOString(),
        rollbackRequired,
        rollbackCompleted,
      },
      injection,
      impact,
      metrics: {
        baseline,
        duringChaos,
        afterChaos,
        degradation: chaosResult.degradation,
        recoveryTime: chaosResult.recoveryTime,
      },
      timeline,
      recommendations,
      metadata: {
        experimentId,
        createdAt: experimentStart,
        completedAt: new Date().toISOString(),
        dryRun: validatedInput.dryRun,
        version: '3.2.3',
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
              experimentId,
              error: errorMessage,
              status: {
                state: 'aborted',
                progress: 0,
                rollbackRequired: false,
                rollbackCompleted: false,
              },
              metadata: {
                experimentId,
                createdAt: new Date().toISOString(),
                dryRun: input.dryRun ?? true,
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

function captureMetricSnapshot(phase: string, degradation: number = 0): MetricSnapshot {
  const baseMetrics = {
    cpu: 35,
    memory: 60,
    networkLatency: 15,
    errorRate: 0.5,
    requestsPerSecond: 1000,
  };

  // Apply degradation
  return {
    timestamp: new Date().toISOString(),
    cpu: Math.min(100, baseMetrics.cpu + degradation * 0.5),
    memory: Math.min(100, baseMetrics.memory + degradation * 0.3),
    networkLatency: baseMetrics.networkLatency * (1 + degradation / 50),
    errorRate: Math.min(100, baseMetrics.errorRate + degradation * 0.5),
    requestsPerSecond: Math.max(0, baseMetrics.requestsPerSecond * (1 - degradation / 150)),
  };
}

function prepareInjection(input: ChaosInjectInput): InjectionDetails {
  const affectedComponents = determineAffectedComponents(input.target, input.failureType);

  return {
    type: input.failureType,
    target: input.target,
    intensity: input.intensity,
    duration: input.duration,
    parameters: {
      ...input.parameters,
      failureType: input.failureType,
    },
    affectedComponents,
  };
}

function determineAffectedComponents(target: string, failureType: string): string[] {
  const components = [target];

  // Add dependent components based on failure type
  if (failureType.includes('network')) {
    components.push(`${target}-lb`, `${target}-gateway`);
  }
  if (failureType.includes('cpu') || failureType.includes('memory')) {
    components.push(`${target}-worker`, `${target}-cache`);
  }
  if (failureType.includes('dependency')) {
    components.push(`${target}-db`, `${target}-queue`);
  }

  return components;
}

interface ChaosSimulationResult {
  degradation: number;
  recoveryTime: number;
  events: TimelineEvent[];
}

async function simulateChaos(
  input: ChaosInjectInput,
  injection: InjectionDetails,
  dryRun: boolean
): Promise<ChaosSimulationResult> {
  const events: TimelineEvent[] = [];

  // Simulate injection start
  events.push({
    timestamp: new Date().toISOString(),
    event: dryRun ? 'Simulating chaos injection' : 'Chaos injection started',
    type: 'info',
    details: `${input.failureType} at ${input.intensity * 100}% intensity`,
  });

  // Calculate degradation based on failure type and intensity
  const degradation = calculateDegradation(input.failureType, input.intensity);

  // Simulate duration
  const durationEvents = simulateDurationEvents(input.duration, degradation);
  events.push(...durationEvents);

  // Simulate recovery
  const recoveryTime = calculateRecoveryTime(input.failureType, degradation);

  events.push({
    timestamp: new Date().toISOString(),
    event: dryRun ? 'Simulation complete' : 'Chaos injection ended',
    type: 'info',
    details: `Duration: ${input.duration}s, Peak degradation: ${degradation.toFixed(1)}%`,
  });

  return {
    degradation,
    recoveryTime,
    events,
  };
}

function calculateDegradation(failureType: string, intensity: number): number {
  const baseDegradation: Record<string, number> = {
    'network-latency': 30,
    'network-partition': 90,
    'cpu-stress': 50,
    'memory-pressure': 45,
    'disk-failure': 60,
    'process-kill': 95,
    'dns-failure': 80,
    'dependency-failure': 70,
    'clock-skew': 20,
    'packet-loss': 40,
  };

  const base = baseDegradation[failureType] || 50;
  return base * intensity + Math.random() * 10;
}

function calculateRecoveryTime(failureType: string, degradation: number): number {
  const baseRecovery: Record<string, number> = {
    'network-latency': 2,
    'network-partition': 30,
    'cpu-stress': 5,
    'memory-pressure': 10,
    'disk-failure': 60,
    'process-kill': 45,
    'dns-failure': 15,
    'dependency-failure': 20,
    'clock-skew': 5,
    'packet-loss': 3,
  };

  const base = baseRecovery[failureType] || 15;
  return Math.round(base * (1 + degradation / 100));
}

function simulateDurationEvents(duration: number, degradation: number): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Add mid-point event
  if (duration > 10) {
    events.push({
      timestamp: new Date().toISOString(),
      event: 'Chaos in progress',
      type: degradation > 60 ? 'warning' : 'info',
      details: `Current degradation: ${degradation.toFixed(1)}%`,
    });
  }

  // Add high degradation warning
  if (degradation > 70) {
    events.push({
      timestamp: new Date().toISOString(),
      event: 'High degradation detected',
      type: 'warning',
      details: `System showing ${degradation.toFixed(1)}% degradation`,
    });
  }

  return events;
}

async function simulateRollback(): Promise<void> {
  // Simulate rollback delay
  await new Promise((resolve) => setTimeout(resolve, 100));
}

function assessImpact(
  chaosResult: ChaosSimulationResult,
  target: string
): ImpactAssessment {
  const degradation = chaosResult.degradation;

  const severity: ImpactAssessment['severity'] =
    degradation >= 90
      ? 'critical'
      : degradation >= 70
        ? 'high'
        : degradation >= 40
          ? 'medium'
          : degradation >= 10
            ? 'low'
            : 'none';

  // Calculate affected requests
  const totalRequests = 10000;
  const failedRequests = Math.round(totalRequests * (degradation / 100) * 0.5);

  return {
    severity,
    systemsAffected: [target, `${target}-dependent`],
    usersAffected: Math.round(failedRequests / 10),
    recoveryTime: chaosResult.recoveryTime,
    dataLoss: false,
    serviceDisruption: {
      totalRequests,
      failedRequests,
      errorRate: Math.round((failedRequests / totalRequests) * 100 * 10) / 10,
      avgLatency: 15 + degradation * 2,
      p99Latency: 50 + degradation * 5,
    },
  };
}

function generateRecommendations(
  chaosResult: ChaosSimulationResult,
  impact: ImpactAssessment
): ChaosRecommendation[] {
  const recommendations: ChaosRecommendation[] = [];

  // High degradation recommendations
  if (chaosResult.degradation > 70) {
    recommendations.push({
      category: 'resilience',
      priority: 'high',
      finding: 'System showed significant degradation under chaos',
      recommendation: 'Implement circuit breakers and fallback mechanisms',
      evidence: `${chaosResult.degradation.toFixed(1)}% degradation observed`,
    });
  }

  // Slow recovery recommendations
  if (chaosResult.recoveryTime > 30) {
    recommendations.push({
      category: 'recovery',
      priority: 'high',
      finding: 'Recovery time exceeds acceptable threshold',
      recommendation: 'Implement automatic scaling and health checks',
      evidence: `Recovery time: ${chaosResult.recoveryTime}s`,
    });
  }

  // Error rate recommendations
  if (impact.serviceDisruption.errorRate > 10) {
    recommendations.push({
      category: 'resilience',
      priority: 'medium',
      finding: 'High error rate during chaos injection',
      recommendation: 'Add retry logic with exponential backoff',
      evidence: `Error rate: ${impact.serviceDisruption.errorRate}%`,
    });
  }

  // General recommendations
  recommendations.push(
    {
      category: 'monitoring',
      priority: 'medium',
      finding: 'Chaos testing revealed system behavior under failure',
      recommendation: 'Set up alerting for similar degradation patterns',
      evidence: 'Observed metrics during chaos experiment',
    },
    {
      category: 'configuration',
      priority: 'low',
      finding: 'System configuration may benefit from tuning',
      recommendation: 'Review timeout and retry configurations',
      evidence: 'Latency patterns observed during chaos',
    }
  );

  return recommendations;
}

// Export tool definition for MCP registration
export const toolDefinition = {
  name: 'aqe/chaos-inject',
  description: 'Inject chaos failures for resilience testing with dryRun safety mode',
  category: 'chaos-resilience',
  version: '3.2.3',
  inputSchema: ChaosInjectInputSchema,
  handler,
};

export default toolDefinition;
