/**
 * QE Core Bridge
 *
 * Anti-corruption layer for V3 core services integration.
 * Handles agent spawning, task orchestration, workflow execution,
 * and configuration access for QE operations.
 *
 * Integrates with V3 Core services:
 * - AgentService: Agent spawning and lifecycle
 * - TaskService: Task creation and orchestration
 * - WorkflowService: Workflow execution
 * - ConfigService: Configuration access
 *
 * Based on:
 * - ADR-030: Agentic-QE Plugin Integration
 * - ADR-003: Single Coordination Engine
 *
 * @module v3/plugins/agentic-qe/bridges/QECoreBridge
 */

import type {
  IQECoreBridge,
  TestSuite,
  ExecutorConfig,
  AgentHandle,
  TaskHandle,
  TaskResult,
  TaskProgress,
  QualityGate,
  QualityMetrics,
  WorkflowResult,
  StepResult,
  Priority,
  QELogger,
} from '../interfaces.js';

// V3 Core types (would be imported from @claude-flow/core in production)
interface IAgentService {
  spawn(config: AgentSpawnConfig): Promise<SpawnedAgent>;
  terminate(agentId: string): Promise<void>;
  sendMessage(agentId: string, message: Record<string, unknown>): Promise<void>;
  list(filter?: AgentFilter): Promise<SpawnedAgent[]>;
  get(agentId: string): Promise<SpawnedAgent | null>;
}

interface AgentSpawnConfig {
  type: string;
  name: string;
  capabilities: string[];
  config?: Record<string, unknown>;
  model?: 'haiku' | 'sonnet' | 'opus' | 'inherit';
}

interface SpawnedAgent {
  id: string;
  type: string;
  name: string;
  status: 'spawning' | 'ready' | 'busy' | 'error' | 'terminated';
  capabilities: string[];
  metrics?: AgentMetrics;
}

interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  avgDurationMs: number;
}

interface AgentFilter {
  type?: string;
  status?: string;
}

interface ITaskService {
  create(config: TaskCreateConfig): Promise<CreatedTask>;
  getStatus(taskId: string): Promise<TaskStatus>;
  cancel(taskId: string): Promise<void>;
  waitForCompletion(taskId: string): Promise<TaskCompletionResult>;
}

interface TaskCreateConfig {
  type: string;
  description: string;
  priority: Priority;
  payload: Record<string, unknown>;
  timeout?: number;
  assignTo?: string;
}

interface CreatedTask {
  id: string;
  type: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
}

interface TaskStatus {
  status: CreatedTask['status'];
  progress?: number;
  currentStep?: string;
  totalSteps?: number;
  completedSteps?: number;
}

interface TaskCompletionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

interface IWorkflowService {
  execute(config: WorkflowExecuteConfig): Promise<WorkflowExecutionResult>;
}

interface WorkflowExecuteConfig {
  name: string;
  steps: WorkflowStep[];
  failFast?: boolean;
  timeout?: number;
}

interface WorkflowStep {
  name: string;
  type: 'condition' | 'task' | 'parallel' | 'loop';
  config: Record<string, unknown>;
}

interface WorkflowExecutionResult {
  workflowId: string;
  success: boolean;
  stepResults: Array<{
    name: string;
    passed: boolean;
    output?: Record<string, unknown>;
    error?: string;
    durationMs: number;
  }>;
  durationMs: number;
  output?: Record<string, unknown>;
}

interface IConfigService {
  get<T>(key: string): Promise<T | undefined>;
  getAll(): Promise<Record<string, unknown>>;
}

/**
 * QE Agent type configurations
 */
const QE_AGENT_CONFIGS: Record<string, Partial<AgentSpawnConfig>> = {
  'qe-test-executor': {
    capabilities: ['test-execution', 'parallel-processing', 'result-aggregation'],
    model: 'sonnet',
  },
  'qe-coverage-analyzer': {
    capabilities: ['coverage-analysis', 'gap-detection', 'priority-ranking'],
    model: 'haiku',
  },
  'qe-security-scanner': {
    capabilities: ['sast', 'dast', 'compliance-checking'],
    model: 'opus',
  },
  'qe-quality-assessor': {
    capabilities: ['quality-gate-evaluation', 'risk-assessment'],
    model: 'sonnet',
  },
  'qe-defect-predictor': {
    capabilities: ['defect-prediction', 'root-cause-analysis'],
    model: 'opus',
  },
};

/**
 * QE Core Bridge Implementation
 *
 * Bridges agentic-qe core needs to V3's core services.
 * Manages agent spawning, task orchestration, and workflows.
 */
export class QECoreBridge implements IQECoreBridge {
  private agents: IAgentService;
  private tasks: ITaskService;
  private workflows: IWorkflowService;
  private config: IConfigService;
  private logger: QELogger;
  private activeHandles: Map<string, AgentHandleImpl | TaskHandleImpl> = new Map();

  constructor(
    agents: IAgentService,
    tasks: ITaskService,
    workflows: IWorkflowService,
    config: IConfigService,
    logger: QELogger
  ) {
    this.agents = agents;
    this.tasks = tasks;
    this.workflows = workflows;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Spawn a test execution agent via V3 Core
   */
  async spawnTestExecutor(
    testSuite: TestSuite,
    config: ExecutorConfig
  ): Promise<AgentHandle> {
    try {
      this.logger.info(`Spawning test executor for suite: ${testSuite.name}`);

      const agentConfig = QE_AGENT_CONFIGS['qe-test-executor'];

      const spawnedAgent = await this.agents.spawn({
        type: 'qe-test-executor',
        name: `test-executor-${testSuite.id}`,
        capabilities: [
          ...agentConfig.capabilities!,
          testSuite.framework, // Add framework-specific capability
        ],
        config: {
          testSuiteId: testSuite.id,
          parallel: config.parallel,
          maxWorkers: config.maxWorkers,
          retryCount: config.retryCount,
          timeout: config.timeout,
          testCount: testSuite.testCases.length,
          estimatedDuration: testSuite.estimatedDuration,
        },
        model: agentConfig.model,
      });

      const handle = new AgentHandleImpl(
        spawnedAgent,
        this.agents,
        this.logger
      );

      this.activeHandles.set(handle.id, handle);
      this.logger.debug(`Spawned test executor: ${handle.id}`);

      return handle;
    } catch (error) {
      this.logger.error('Failed to spawn test executor', error);
      throw new QECoreError('Failed to spawn test executor', error as Error);
    }
  }

  /**
   * Create a test execution task via V3 Task Service
   */
  async createTestTask(
    testSuite: TestSuite,
    priority: Priority
  ): Promise<TaskHandle> {
    try {
      this.logger.info(`Creating test task for suite: ${testSuite.name} (priority: ${priority})`);

      const createdTask = await this.tasks.create({
        type: 'test-execution',
        description: `Execute test suite: ${testSuite.name}`,
        priority,
        payload: {
          testSuiteId: testSuite.id,
          testCount: testSuite.testCases.length,
          framework: testSuite.framework,
          config: testSuite.config,
        },
        timeout: testSuite.estimatedDuration * 2, // 2x safety margin
      });

      const handle = new TaskHandleImpl(
        createdTask,
        this.tasks,
        this.logger
      );

      this.activeHandles.set(handle.id, handle);
      this.logger.debug(`Created test task: ${handle.id}`);

      return handle;
    } catch (error) {
      this.logger.error('Failed to create test task', error);
      throw new QECoreError('Failed to create test task', error as Error);
    }
  }

  /**
   * Execute quality gate workflow
   */
  async executeQualityGateWorkflow(
    gates: QualityGate[],
    metrics: QualityMetrics
  ): Promise<WorkflowResult> {
    try {
      this.logger.info(`Executing quality gate workflow with ${gates.length} gates`);

      // Build workflow steps from quality gates
      const steps: WorkflowStep[] = gates.map((gate) => ({
        name: `gate-${gate.id}`,
        type: 'condition' as const,
        config: {
          gateId: gate.id,
          gateName: gate.name,
          criteria: gate.criteria,
          metrics,
          required: gate.required,
          weight: gate.weight,
        },
      }));

      const result = await this.workflows.execute({
        name: 'quality-gate-evaluation',
        steps,
        failFast: true, // Stop on first required gate failure
        timeout: 30000, // 30s timeout
      });

      // Transform to QE format
      const workflowResult: WorkflowResult = {
        workflowId: result.workflowId,
        success: result.success,
        stepResults: result.stepResults.map((step) => this.transformStepResult(step, gates)),
        durationMs: result.durationMs,
        output: this.buildQualityGateOutput(result.stepResults, gates, metrics),
      };

      this.logger.info(`Quality gate workflow complete: ${result.success ? 'PASSED' : 'FAILED'}`);
      return workflowResult;
    } catch (error) {
      this.logger.error('Quality gate workflow failed', error);
      throw new QECoreError('Quality gate workflow failed', error as Error);
    }
  }

  /**
   * Get configuration value
   */
  async getConfig<T>(key: string): Promise<T | undefined> {
    try {
      return await this.config.get<T>(key);
    } catch (error) {
      this.logger.warn(`Failed to get config: ${key}`, error);
      return undefined;
    }
  }

  /**
   * List available agents by type
   */
  async listAgents(filter?: { type?: string; status?: string }): Promise<AgentHandle[]> {
    try {
      this.logger.debug(`Listing agents with filter: ${JSON.stringify(filter)}`);

      const agents = await this.agents.list({
        type: filter?.type,
        status: filter?.status,
      });

      // Filter to only QE agents
      const qeAgents = agents.filter((a) => a.type.startsWith('qe-'));

      return qeAgents.map((agent) => new AgentHandleImpl(agent, this.agents, this.logger));
    } catch (error) {
      this.logger.error('Failed to list agents', error);
      throw new QECoreError('Failed to list agents', error as Error);
    }
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<AgentHandle | null> {
    try {
      // Check active handles first
      const activeHandle = this.activeHandles.get(agentId);
      if (activeHandle && 'type' in activeHandle) {
        return activeHandle as AgentHandle;
      }

      const agent = await this.agents.get(agentId);
      if (!agent) return null;

      return new AgentHandleImpl(agent, this.agents, this.logger);
    } catch (error) {
      this.logger.error(`Failed to get agent: ${agentId}`, error);
      return null;
    }
  }

  /**
   * Transform workflow step result to QE format
   */
  private transformStepResult(
    step: WorkflowExecutionResult['stepResults'][0],
    gates: QualityGate[]
  ): StepResult {
    const gateId = step.name.replace('gate-', '');
    const gate = gates.find((g) => g.id === gateId);

    return {
      name: gate?.name || step.name,
      passed: step.passed,
      output: step.output,
      error: step.error,
      durationMs: step.durationMs,
    };
  }

  /**
   * Build quality gate output summary
   */
  private buildQualityGateOutput(
    stepResults: WorkflowExecutionResult['stepResults'],
    gates: QualityGate[],
    metrics: QualityMetrics
  ): Record<string, unknown> {
    const passedGates = stepResults.filter((s) => s.passed).length;
    const failedGates = stepResults.filter((s) => !s.passed).length;
    const requiredFailed = stepResults.filter((s, i) => !s.passed && gates[i]?.required).length;

    // Calculate weighted score
    let totalWeight = 0;
    let achievedWeight = 0;
    stepResults.forEach((step, i) => {
      const gate = gates[i];
      if (gate) {
        totalWeight += gate.weight;
        if (step.passed) achievedWeight += gate.weight;
      }
    });

    const overallScore = totalWeight > 0 ? (achievedWeight / totalWeight) * 100 : 0;

    return {
      summary: {
        passedGates,
        failedGates,
        requiredFailed,
        overallScore: Math.round(overallScore * 10) / 10,
        releaseReady: requiredFailed === 0,
      },
      metrics,
      gateDetails: stepResults.map((step, i) => ({
        id: gates[i]?.id,
        name: gates[i]?.name,
        passed: step.passed,
        required: gates[i]?.required,
        weight: gates[i]?.weight,
        error: step.error,
      })),
    };
  }
}

/**
 * Agent Handle Implementation
 */
class AgentHandleImpl implements AgentHandle {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  private _status: AgentHandle['status'];
  private agentService: IAgentService;
  private logger: QELogger;

  constructor(
    agent: SpawnedAgent,
    agentService: IAgentService,
    logger: QELogger
  ) {
    this.id = agent.id;
    this.type = agent.type;
    this.name = agent.name;
    this._status = agent.status;
    this.agentService = agentService;
    this.logger = logger;
  }

  get status(): AgentHandle['status'] {
    return this._status;
  }

  async terminate(): Promise<void> {
    try {
      this.logger.debug(`Terminating agent: ${this.id}`);
      await this.agentService.terminate(this.id);
      this._status = 'terminated';
    } catch (error) {
      this.logger.error(`Failed to terminate agent: ${this.id}`, error);
      throw new QECoreError('Failed to terminate agent', error as Error);
    }
  }

  async send(message: Record<string, unknown>): Promise<void> {
    try {
      this.logger.debug(`Sending message to agent: ${this.id}`);
      await this.agentService.sendMessage(this.id, message);
    } catch (error) {
      this.logger.error(`Failed to send message to agent: ${this.id}`, error);
      throw new QECoreError('Failed to send message', error as Error);
    }
  }
}

/**
 * Task Handle Implementation
 */
class TaskHandleImpl implements TaskHandle {
  readonly id: string;
  readonly type: string;
  private _status: TaskHandle['status'];
  private taskService: ITaskService;
  private logger: QELogger;

  constructor(
    task: CreatedTask,
    taskService: ITaskService,
    logger: QELogger
  ) {
    this.id = task.id;
    this.type = task.type;
    this._status = task.status;
    this.taskService = taskService;
    this.logger = logger;
  }

  get status(): TaskHandle['status'] {
    return this._status;
  }

  async wait(): Promise<TaskResult> {
    try {
      this.logger.debug(`Waiting for task completion: ${this.id}`);
      const result = await this.taskService.waitForCompletion(this.id);

      this._status = result.success ? 'completed' : 'failed';

      return {
        taskId: this.id,
        success: result.success,
        data: result.data,
        error: result.error,
        durationMs: result.durationMs,
      };
    } catch (error) {
      this.logger.error(`Failed to wait for task: ${this.id}`, error);
      throw new QECoreError('Failed to wait for task', error as Error);
    }
  }

  async cancel(): Promise<void> {
    try {
      this.logger.debug(`Cancelling task: ${this.id}`);
      await this.taskService.cancel(this.id);
      this._status = 'cancelled';
    } catch (error) {
      this.logger.error(`Failed to cancel task: ${this.id}`, error);
      throw new QECoreError('Failed to cancel task', error as Error);
    }
  }

  async getProgress(): Promise<TaskProgress> {
    try {
      const status = await this.taskService.getStatus(this.id);
      this._status = status.status;

      return {
        percentage: status.progress || 0,
        currentStep: status.currentStep || 'Unknown',
        totalSteps: status.totalSteps || 0,
        completedSteps: status.completedSteps || 0,
        estimatedRemainingMs: this.estimateRemaining(status),
      };
    } catch (error) {
      this.logger.error(`Failed to get task progress: ${this.id}`, error);
      throw new QECoreError('Failed to get progress', error as Error);
    }
  }

  private estimateRemaining(status: TaskStatus): number {
    if (!status.totalSteps || !status.completedSteps) return 0;
    if (status.completedSteps >= status.totalSteps) return 0;

    // Rough estimate: 1 second per remaining step
    const remainingSteps = status.totalSteps - status.completedSteps;
    return remainingSteps * 1000;
  }
}

/**
 * QE Core Error class
 */
export class QECoreError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'QECoreError';
    this.cause = cause;
  }
}
