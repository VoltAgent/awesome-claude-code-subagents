/**
 * @claude-flow/teammate-plugin Types
 *
 * Complete type definitions for TeammateTool integration.
 * Requires Claude Code >= 2.1.19
 *
 * @module @claude-flow/teammate-plugin/types
 * @version 1.0.0-alpha.1
 */

// ============================================================================
// Version Requirements
// ============================================================================

export const MINIMUM_CLAUDE_CODE_VERSION = '2.1.19';

// Security limits
export const SECURITY_LIMITS = {
  MAX_NAME_LENGTH: 64,
  MAX_PAYLOAD_SIZE: 1024 * 1024, // 1MB
  MAX_TEAMMATES_PER_TEAM: 50,
  MAX_MESSAGES_PER_MAILBOX: 1000,
  MAX_PLANS_PER_TEAM: 100,
  MAX_DELEGATION_DEPTH: 5,
} as const;

// Rate limiting defaults
export const RATE_LIMIT_DEFAULTS = {
  SPAWN_PER_MINUTE: 10,
  MESSAGES_PER_MINUTE: 100,
  BROADCASTS_PER_MINUTE: 20,
  PLANS_PER_MINUTE: 5,
  API_CALLS_PER_MINUTE: 200,
} as const;

// Retry configuration
export const RETRY_DEFAULTS = {
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 100,
  MAX_DELAY_MS: 5000,
  BACKOFF_MULTIPLIER: 2,
} as const;

// Health check configuration
export const HEALTH_CHECK_DEFAULTS = {
  INTERVAL_MS: 30000, // 30 seconds
  TIMEOUT_MS: 5000,   // 5 seconds
  UNHEALTHY_THRESHOLD: 3,
  HEALTHY_THRESHOLD: 2,
} as const;

// MCP tool parameter limits
export const MCP_PARAM_LIMITS = {
  MAX_PARAM_LENGTH: 10000,
  MAX_ARRAY_ITEMS: 100,
} as const;

export interface VersionInfo {
  claudeCode: string | null;
  plugin: string;
  compatible: boolean;
  missingFeatures: string[];
}

// ============================================================================
// TeammateTool Operations (13 operations from Claude Code v2.1.19)
// ============================================================================

export type TeammateOperation =
  | 'spawnTeam'
  | 'discoverTeams'
  | 'requestJoin'
  | 'approveJoin'
  | 'rejectJoin'
  | 'write'
  | 'broadcast'
  | 'requestShutdown'
  | 'approveShutdown'
  | 'rejectShutdown'
  | 'approvePlan'
  | 'rejectPlan'
  | 'cleanup';

// ============================================================================
// Team Configuration
// ============================================================================

export type TeamTopology = 'flat' | 'hierarchical' | 'mesh';
export type SpawnBackend = 'tmux' | 'in_process' | 'auto';
export type TeammateType = 'regular' | 'swarm' | 'coordinator' | 'worker';
export type PermissionMode =
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'default'
  | 'delegate'
  | 'dontAsk'
  | 'plan';

export interface TeamConfig {
  name: string;
  topology: TeamTopology;
  maxTeammates: number;
  spawnBackend: SpawnBackend;
  planModeRequired: boolean;
  autoApproveJoin: boolean;
  messageRetention: number;
  delegationEnabled: boolean;
  remoteSync: RemoteSyncConfig;
  tmuxConfig?: TmuxBackendConfig;
}

// ============================================================================
// Teammate Configuration
// ============================================================================

export interface TeammateSpawnConfig {
  name: string;
  role: string;
  prompt: string;
  model?: 'sonnet' | 'opus' | 'haiku';
  allowedTools?: string[];
  mode?: PermissionMode;
  teamName?: string;
  runInBackground?: boolean;
  maxTurns?: number;
  teammateType?: TeammateType;
  delegateAuthority?: boolean;
  delegatedPermissions?: string[];
  delegationDepth?: number;
}

export interface TeammateInfo {
  id: string;
  name: string;
  role: string;
  status: TeammateStatus;
  spawnedAt: Date;
  messagesSent: number;
  messagesReceived: number;
  currentTask?: string;
  delegatedFrom?: string;
  delegatedPermissions?: string[];
  memoryUsage?: number;
  lastHeartbeat?: Date;
}

export type TeammateStatus =
  | 'active'
  | 'idle'
  | 'busy'
  | 'shutdown_pending'
  | 'paused'
  | 'error';

// ============================================================================
// Team State
// ============================================================================

export interface TeamState {
  name: string;
  createdAt: Date;
  teammates: TeammateInfo[];
  pendingJoinRequests: JoinRequest[];
  activePlans: TeamPlan[];
  messageCount: number;
  topology: TeamTopology;
  context: TeamContext;
  delegations: DelegationRecord[];
  remoteSessionId?: string;
  remoteSessionUrl?: string;
}

export interface JoinRequest {
  agentId: string;
  agentName: string;
  requestedAt: Date;
  role: string;
}

// ============================================================================
// Team Context (NEW - from gap analysis)
// ============================================================================

export interface TeamContext {
  teamName: string;
  sharedVariables: Record<string, unknown>;
  inheritedPermissions: string[];
  workingDirectory: string;
  gitBranch?: string;
  gitRepo?: string;
  environmentVariables: Record<string, string>;
}

// ============================================================================
// Delegation (NEW - from gap analysis)
// ============================================================================

export interface DelegationRecord {
  id: string;
  fromId: string;
  toId: string;
  permissions: string[];
  grantedAt: Date;
  expiresAt?: Date;
  depth: number;
  active: boolean;
}

export interface DelegationConfig {
  maxDepth: number;
  autoExpireMs?: number;
  requireApproval: boolean;
}

// ============================================================================
// Messaging
// ============================================================================

export type MessageType = 'task' | 'result' | 'status' | 'plan' | 'approval' | 'delegation' | 'context_update';

export interface MailboxMessage {
  id: string;
  from: string;
  to: string | 'broadcast';
  timestamp: Date;
  type: MessageType;
  payload: unknown;
  acknowledged: boolean;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  ttlMs?: number;
}

// ============================================================================
// Plan System
// ============================================================================

export type PlanStatus = 'pending' | 'approved' | 'rejected' | 'executing' | 'paused' | 'completed' | 'failed';

export interface TeamPlan {
  id: string;
  description: string;
  proposedBy: string;
  steps: PlanStep[];
  requiredApprovals: number;
  approvals: string[];
  rejections: string[];
  status: PlanStatus;
  createdAt: Date;
  approvedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  currentStep?: number;
  pausedAt?: number;
}

export interface PlanStep {
  order: number;
  action: string;
  assignee?: string;
  tools: string[];
  estimatedDuration?: number;
  status?: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
}

// ============================================================================
// Remote Sync (NEW - from gap analysis)
// ============================================================================

export interface RemoteSyncConfig {
  enabled: boolean;
  autoSync: boolean;
  syncInterval: number;
  preserveOnDisconnect: boolean;
}

export interface RemoteSession {
  remoteSessionId: string;
  remoteSessionUrl: string;
  remoteSessionTitle?: string;
  syncedAt: Date;
  status: 'connected' | 'disconnected' | 'syncing' | 'error';
}

export interface SyncResult {
  success: boolean;
  changesPushed: number;
  changesPulled: number;
  conflicts: number;
  remoteUrl?: string;
  error?: string;
}

// ============================================================================
// Session Memory (NEW - from gap analysis)
// ============================================================================

export interface TeammateMemory {
  sessionId: string;
  teammateId: string;
  teamName: string;
  transcript: MailboxMessage[];
  context: Record<string, unknown>;
  nestedMemories: TeammateMemory[];
  createdAt: Date;
  updatedAt: Date;
  size: number;
}

export interface MemoryQuery {
  teammateId?: string;
  teamName?: string;
  query?: string;
  limit?: number;
  since?: Date;
  types?: MessageType[];
}

// ============================================================================
// Teleport (NEW - from gap analysis)
// ============================================================================

export interface TeleportConfig {
  autoResume: boolean;
  gitAware: boolean;
  preserveMailbox: boolean;
  preserveMemory: boolean;
}

export interface TeleportTarget {
  workingDirectory?: string;
  gitRepo?: string;
  gitBranch?: string;
  sessionId?: string;
  terminalType?: 'tmux' | 'iterm2' | 'default';
}

export interface TeleportResult {
  success: boolean;
  teamState?: TeamState;
  blockers?: string[];
  warnings?: string[];
}

// ============================================================================
// Spawn Backends
// ============================================================================

export interface TmuxBackendConfig {
  sessionName?: string;
  windowName?: string;
  paneLayout?: 'tiled' | 'even-horizontal' | 'even-vertical' | 'main-horizontal' | 'main-vertical';
  prefixKey?: string;
  shellCommand?: string;
  environment?: Record<string, string>;
}

export interface InProcessConfig {
  maxConcurrent: number;
  memoryLimitMb: number;
  timeoutMs: number;
  isolationLevel: 'none' | 'vm' | 'worker';
}

export interface BackendStatus {
  backend: SpawnBackend;
  available: boolean;
  activeTeammates: number;
  capacity: number;
  details?: Record<string, unknown>;
}

// ============================================================================
// Error Handling
// ============================================================================

export enum TeammateErrorCode {
  VERSION_INCOMPATIBLE = 'VERSION_INCOMPATIBLE',
  TEAM_NOT_FOUND = 'TEAM_NOT_FOUND',
  TEAMMATE_NOT_FOUND = 'TEAMMATE_NOT_FOUND',
  ALREADY_IN_TEAM = 'ALREADY_IN_TEAM',
  NO_TEAM_CONTEXT = 'NO_TEAM_CONTEXT',
  PLAN_NOT_FOUND = 'PLAN_NOT_FOUND',
  PLAN_NOT_APPROVED = 'PLAN_NOT_APPROVED',
  PLAN_ALREADY_EXECUTING = 'PLAN_ALREADY_EXECUTING',
  DELEGATION_DENIED = 'DELEGATION_DENIED',
  DELEGATION_DEPTH_EXCEEDED = 'DELEGATION_DEPTH_EXCEEDED',
  REMOTE_SYNC_FAILED = 'REMOTE_SYNC_FAILED',
  TELEPORT_FAILED = 'TELEPORT_FAILED',
  MAILBOX_FULL = 'MAILBOX_FULL',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  TIMEOUT = 'TIMEOUT',
  BACKEND_UNAVAILABLE = 'BACKEND_UNAVAILABLE',
  MEMORY_SAVE_FAILED = 'MEMORY_SAVE_FAILED',
  MEMORY_LOAD_FAILED = 'MEMORY_LOAD_FAILED',
}

export interface RecoveryConfig {
  maxRetries: number;
  retryDelayMs: number;
  exponentialBackoff: boolean;
  fallbackToMCP: boolean;
  autoCleanupOnError: boolean;
}

// ============================================================================
// AgentInput (Claude Code Task tool schema)
// ============================================================================

export interface AgentInput {
  description: string;
  prompt: string;
  subagent_type: string;
  model?: 'sonnet' | 'opus' | 'haiku';
  resume?: string;
  run_in_background?: boolean;
  max_turns?: number;
  allowed_tools?: string[];
  name?: string;
  team_name?: string;
  mode?: PermissionMode;
}

// ============================================================================
// ExitPlanModeInput (Claude Code plan exit schema)
// ============================================================================

export interface ExitPlanModeInput {
  allowedPrompts?: Array<{ tool: 'Bash'; prompt: string }>;
  pushToRemote?: boolean;
  remoteSessionId?: string;
  remoteSessionUrl?: string;
  remoteSessionTitle?: string;
  launchSwarm?: boolean;
  teammateCount?: number;
}

// ============================================================================
// Event Types
// ============================================================================

export interface TeammateBridgeEvents {
  // Initialization
  'initialized': { claudeCodeVersion: string | null; teammateToolAvailable: boolean };

  // Team lifecycle
  'team:spawned': { team: string; config: TeamConfig };
  'team:cleanup': { team: string };

  // Join/Leave
  'team:join_requested': { team: string; agent: TeammateInfo };
  'team:join_approved': { team: string; agent: string };
  'team:join_rejected': { team: string; agent: string; reason?: string };

  // Teammate lifecycle
  'teammate:spawned': { teammate: TeammateInfo; agentInput: AgentInput };
  'teammate:shutdown_requested': { team: string; teammateId: string; reason?: string };
  'teammate:shutdown_approved': { team: string; teammateId: string };
  'teammate:shutdown_rejected': { team: string; teammateId: string };

  // Messaging
  'message:sent': { team: string; message: MailboxMessage };
  'message:broadcast': { team: string; message: MailboxMessage };
  'mailbox:messages': { team: string; teammateId: string; messages: MailboxMessage[] };

  // Plans
  'plan:submitted': { team: string; plan: TeamPlan };
  'plan:approval_added': { team: string; planId: string; approverId: string };
  'plan:approved': { team: string; plan: TeamPlan };
  'plan:rejected': { team: string; plan: TeamPlan; rejecterId: string; reason?: string };
  'plan:paused': { team: string; planId: string; atStep: number };
  'plan:resumed': { team: string; planId: string; fromStep: number };
  'plan:completed': { team: string; planId: string };
  'plan:failed': { team: string; planId: string; error: string };

  // Swarm
  'swarm:launched': { team: string; plan: TeamPlan; exitPlanInput: ExitPlanModeInput; teammateCount: number };

  // Delegation (NEW)
  'delegate:granted': { team: string; from: string; to: string; permissions: string[] };
  'delegate:revoked': { team: string; from: string; to: string };

  // Remote sync (NEW)
  'remote:pushed': { team: string; remoteUrl: string };
  'remote:pulled': { team: string; changes: number };
  'remote:synced': { team: string; result: SyncResult };
  'remote:disconnected': { team: string; reason?: string };

  // Memory (NEW)
  'memory:saved': { team: string; teammateId: string; size: number };
  'memory:loaded': { team: string; teammateId: string };
  'memory:cleared': { team: string; teammateId?: string };

  // Transcript (NEW)
  'transcript:shared': { team: string; from: string; to: string; messageCount: number };

  // Context (NEW)
  'context:updated': { team: string; keys: string[] };

  // Permissions (NEW)
  'permissions:updated': { team: string; teammateId: string; added: string[]; removed: string[] };

  // Teleport (NEW)
  'teleport:started': { team: string; target: TeleportTarget };
  'teleport:completed': { team: string; result: TeleportResult };
  'teleport:failed': { team: string; error: string };

  // Errors
  'error': Error;
}

// ============================================================================
// Plugin Configuration
// ============================================================================

export interface PluginConfig {
  autoInitialize: boolean;
  fallbackToMCP: boolean;
  recovery: RecoveryConfig;
  delegation: DelegationConfig;
  remoteSync: RemoteSyncConfig;
  teleport: TeleportConfig;
  memory: {
    autoPersist: boolean;
    persistIntervalMs: number;
    maxSizeMb: number;
  };
  mailbox: {
    pollingIntervalMs: number;
    maxMessages: number;
    retentionMs: number;
  };
}

export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  autoInitialize: true,
  fallbackToMCP: true,
  recovery: {
    maxRetries: 3,
    retryDelayMs: 1000,
    exponentialBackoff: true,
    fallbackToMCP: true,
    autoCleanupOnError: true,
  },
  delegation: {
    maxDepth: 3,
    autoExpireMs: 3600000, // 1 hour
    requireApproval: false,
  },
  remoteSync: {
    enabled: false,
    autoSync: false,
    syncInterval: 30000, // 30 seconds
    preserveOnDisconnect: true,
  },
  teleport: {
    autoResume: true,
    gitAware: true,
    preserveMailbox: true,
    preserveMemory: true,
  },
  memory: {
    autoPersist: true,
    persistIntervalMs: 60000, // 1 minute
    maxSizeMb: 100,
  },
  mailbox: {
    pollingIntervalMs: 1000,
    maxMessages: 1000,
    retentionMs: 3600000, // 1 hour
  },
};

// ============================================================================
// Rate Limiting
// ============================================================================

export interface RateLimitConfig {
  spawnPerMinute: number;
  messagesPerMinute: number;
  broadcastsPerMinute: number;
  plansPerMinute: number;
  apiCallsPerMinute: number;
}

export interface RateLimitState {
  operation: string;
  count: number;
  windowStart: number;
  blocked: boolean;
  nextAllowedAt?: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  spawnPerMinute: RATE_LIMIT_DEFAULTS.SPAWN_PER_MINUTE,
  messagesPerMinute: RATE_LIMIT_DEFAULTS.MESSAGES_PER_MINUTE,
  broadcastsPerMinute: RATE_LIMIT_DEFAULTS.BROADCASTS_PER_MINUTE,
  plansPerMinute: RATE_LIMIT_DEFAULTS.PLANS_PER_MINUTE,
  apiCallsPerMinute: RATE_LIMIT_DEFAULTS.API_CALLS_PER_MINUTE,
};

// ============================================================================
// Metrics & Telemetry
// ============================================================================

export interface BridgeMetrics {
  // Counters
  teamsCreated: number;
  teammatesSpawned: number;
  messagesSent: number;
  broadcastsSent: number;
  plansSubmitted: number;
  plansApproved: number;
  plansRejected: number;
  swarmsLaunched: number;
  delegationsGranted: number;
  errorsCount: number;

  // Gauges
  activeTeams: number;
  activeTeammates: number;
  pendingPlans: number;
  mailboxSize: number;

  // Histograms (timing in ms)
  spawnLatency: number[];
  messageLatency: number[];
  planApprovalLatency: number[];

  // Rate limiting
  rateLimitHits: number;
  rateLimitBlocks: number;

  // Health
  healthChecksPassed: number;
  healthChecksFailed: number;

  // Timestamps
  startedAt: Date;
  lastActivityAt: Date;
}

export interface MetricSnapshot {
  timestamp: Date;
  metrics: BridgeMetrics;
  rates: {
    messagesPerSecond: number;
    spawnsPerMinute: number;
    errorRate: number;
  };
}

// ============================================================================
// Health Checks
// ============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface TeammateHealthCheck {
  teammateId: string;
  teamName: string;
  status: HealthStatus;
  lastCheck: Date;
  lastHealthy: Date | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  latencyMs: number | null;
  error?: string;
}

export interface TeamHealthReport {
  teamName: string;
  overallStatus: HealthStatus;
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  teammates: TeammateHealthCheck[];
  checkedAt: Date;
}

export interface HealthCheckConfig {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  unhealthyThreshold: number;
  healthyThreshold: number;
  autoRemoveUnhealthy: boolean;
}

export const DEFAULT_HEALTH_CHECK_CONFIG: HealthCheckConfig = {
  enabled: true,
  intervalMs: HEALTH_CHECK_DEFAULTS.INTERVAL_MS,
  timeoutMs: HEALTH_CHECK_DEFAULTS.TIMEOUT_MS,
  unhealthyThreshold: HEALTH_CHECK_DEFAULTS.UNHEALTHY_THRESHOLD,
  healthyThreshold: HEALTH_CHECK_DEFAULTS.HEALTHY_THRESHOLD,
  autoRemoveUnhealthy: false,
};

// ============================================================================
// Retry Logic
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: TeammateErrorCode[];
}

export interface RetryState {
  attempt: number;
  lastError: Error | null;
  nextRetryAt: Date | null;
  totalDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: RETRY_DEFAULTS.MAX_RETRIES,
  initialDelayMs: RETRY_DEFAULTS.INITIAL_DELAY_MS,
  maxDelayMs: RETRY_DEFAULTS.MAX_DELAY_MS,
  backoffMultiplier: RETRY_DEFAULTS.BACKOFF_MULTIPLIER,
  retryableErrors: [
    TeammateErrorCode.TIMEOUT,
    TeammateErrorCode.BACKEND_UNAVAILABLE,
    TeammateErrorCode.REMOTE_SYNC_FAILED,
    TeammateErrorCode.MEMORY_SAVE_FAILED,
  ],
};

// ============================================================================
// Circuit Breaker
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  resetTimeMs: number;
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  openedAt: Date | null;
  nextAttemptAt: Date | null;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  enabled: true,
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 10000,
  resetTimeMs: 30000,
};
