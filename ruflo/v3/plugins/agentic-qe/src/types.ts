/**
 * Agentic-QE Plugin Types
 * TypeScript type definitions for all QE domain objects
 *
 * @module v3/plugins/agentic-qe/types
 * @version 3.2.3
 */

// =============================================================================
// Core QE Types
// =============================================================================

/**
 * Test types supported by the QE system
 */
export type TestType =
  | 'unit'
  | 'integration'
  | 'e2e'
  | 'property'
  | 'mutation'
  | 'fuzz'
  | 'api'
  | 'performance'
  | 'security'
  | 'accessibility'
  | 'contract'
  | 'bdd';

/**
 * TDD style for test generation
 */
export type TDDStyle = 'london' | 'chicago';

/**
 * Test framework identifiers
 */
export type TestFramework =
  | 'vitest'
  | 'jest'
  | 'mocha'
  | 'pytest'
  | 'junit'
  | 'xunit'
  | 'nunit'
  | 'playwright'
  | 'cypress';

/**
 * Security level classification
 */
export type SecurityLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Model tier for routing (TinyDancer alignment with ADR-026)
 */
export type ModelTier = 'agent-booster' | 'haiku' | 'sonnet' | 'opus';

/**
 * Contract types for API validation
 */
export type ContractType = 'openapi' | 'graphql' | 'grpc' | 'asyncapi';

/**
 * Chaos failure types for resilience testing
 */
export type ChaosFailureType =
  | 'network-latency'
  | 'network-partition'
  | 'cpu-stress'
  | 'memory-pressure'
  | 'disk-failure'
  | 'process-kill';

/**
 * Compliance standards for security audits
 */
export type ComplianceStandard =
  | 'owasp-top-10'
  | 'sans-25'
  | 'pci-dss'
  | 'hipaa'
  | 'gdpr'
  | 'soc2';

/**
 * Scan types for security analysis
 */
export type SecurityScanType = 'sast' | 'dast' | 'both';

/**
 * Severity levels for findings
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Quality gate operators
 */
export type QualityGateOperator = '>' | '<' | '>=' | '<=' | '==';

/**
 * Coverage gap types
 */
export type CoverageGapType =
  | 'uncovered-lines'
  | 'uncovered-branches'
  | 'uncovered-functions'
  | 'low-branch-coverage'
  | 'missing-edge-cases';

/**
 * Coverage analysis algorithms
 */
export type CoverageAlgorithm = 'johnson-lindenstrauss' | 'full-scan';

// =============================================================================
// Bounded Context Types
// =============================================================================

/**
 * The 12 DDD bounded contexts in agentic-qe
 */
export type BoundedContext =
  | 'test-generation'
  | 'test-execution'
  | 'coverage-analysis'
  | 'quality-assessment'
  | 'defect-intelligence'
  | 'requirements-validation'
  | 'code-intelligence'
  | 'security-compliance'
  | 'contract-testing'
  | 'visual-accessibility'
  | 'chaos-resilience'
  | 'learning-optimization';

/**
 * V3 Domain mapping for context integration
 */
export type V3Domain =
  | 'Security'
  | 'Core'
  | 'Memory'
  | 'Integration'
  | 'Coordination';

// =============================================================================
// Test Generation Types
// =============================================================================

/**
 * Request to generate tests for code
 */
export interface TestGenerationRequest {
  /** Path to file or directory to test */
  targetPath: string;
  /** Type of tests to generate */
  testType: TestType;
  /** Test framework to use */
  framework?: TestFramework;
  /** Coverage configuration */
  coverage?: CoverageConfig;
  /** TDD style preference */
  style?: TDDStyle;
  /** Additional context for test generation */
  context?: string;
  /** Language of the source code */
  language?: string;
  /** Maximum tests to generate */
  maxTests?: number;
}

/**
 * Coverage configuration for test generation
 */
export interface CoverageConfig {
  /** Target coverage percentage */
  target: number;
  /** Focus on coverage gaps */
  focusGaps: boolean;
  /** Include branch coverage */
  includeBranches?: boolean;
  /** Include function coverage */
  includeFunctions?: boolean;
}

/**
 * Result of test generation
 */
export interface TestGenerationResult {
  /** Generated test file paths */
  testFiles: GeneratedTestFile[];
  /** Test statistics */
  stats: TestGenerationStats;
  /** Patterns learned during generation */
  learnedPatterns?: TestPattern[];
  /** Suggestions for improvement */
  suggestions?: string[];
}

/**
 * A generated test file
 */
export interface GeneratedTestFile {
  /** Path to the generated test file */
  path: string;
  /** Content of the test file */
  content: string;
  /** Number of test cases */
  testCount: number;
  /** Target file being tested */
  targetFile: string;
  /** Test type */
  testType: TestType;
  /** Framework used */
  framework: TestFramework;
}

/**
 * Statistics for test generation
 */
export interface TestGenerationStats {
  /** Total tests generated */
  totalTests: number;
  /** Files processed */
  filesProcessed: number;
  /** Estimated coverage increase */
  estimatedCoverageIncrease: number;
  /** Generation duration in ms */
  duration: number;
  /** Model tier used */
  modelTier: ModelTier;
}

/**
 * A learned test pattern for ReasoningBank
 */
export interface TestPattern {
  /** Unique pattern identifier */
  id: string;
  /** Pattern type/category */
  type: string;
  /** Pattern description */
  description: string;
  /** Programming language */
  language: string;
  /** Test framework */
  framework: TestFramework;
  /** Pattern effectiveness score (0-1) */
  effectiveness: number;
  /** Number of times pattern was used */
  usageCount: number;
  /** Pattern template */
  template?: string;
  /** Tags for categorization */
  tags: string[];
}

// =============================================================================
// TDD Cycle Types
// =============================================================================

/**
 * Request to execute a TDD cycle
 */
export interface TDDCycleRequest {
  /** Requirement or user story to implement */
  requirement: string;
  /** Path to implement in */
  targetPath: string;
  /** TDD style (London or Chicago) */
  style: TDDStyle;
  /** Maximum cycles to execute */
  maxCycles: number;
  /** Test framework to use */
  framework?: TestFramework;
}

/**
 * Result of a TDD cycle execution
 */
export interface TDDCycleResult {
  /** Number of cycles completed */
  cyclesCompleted: number;
  /** Final test results */
  testResults: TestExecutionResult;
  /** Implementation generated */
  implementation: ImplementationArtifact;
  /** Coverage achieved */
  coverage: CoverageReport;
  /** Refactoring suggestions */
  refactoringSuggestions?: RefactoringSuggestion[];
}

/**
 * A single TDD cycle step
 */
export interface TDDCycleStep {
  /** Cycle number */
  cycle: number;
  /** Phase: red, green, or refactor */
  phase: 'red' | 'green' | 'refactor';
  /** Step description */
  description: string;
  /** Duration in ms */
  duration: number;
  /** Success status */
  success: boolean;
  /** Agent that executed the step */
  agent: string;
  /** Artifacts produced */
  artifacts: string[];
}

/**
 * Implementation artifact from TDD cycle
 */
export interface ImplementationArtifact {
  /** File path */
  path: string;
  /** File content */
  content: string;
  /** Lines of code */
  linesOfCode: number;
  /** Complexity score */
  complexity: number;
}

/**
 * Refactoring suggestion from TDD cycle
 */
export interface RefactoringSuggestion {
  /** Type of refactoring */
  type: string;
  /** Description */
  description: string;
  /** File path */
  filePath: string;
  /** Line range */
  lineRange: [number, number];
  /** Priority */
  priority: 'high' | 'medium' | 'low';
}

// =============================================================================
// Coverage Analysis Types
// =============================================================================

/**
 * Request to analyze coverage
 */
export interface CoverageAnalysisRequest {
  /** Path to coverage report (lcov/json) */
  coverageReport?: string;
  /** Target path to analyze */
  targetPath: string;
  /** Algorithm to use */
  algorithm: CoverageAlgorithm;
  /** Prioritize gaps by risk */
  prioritize: boolean;
}

/**
 * Coverage report from analysis
 */
export interface CoverageReport {
  /** Overall coverage metrics */
  overall: CoverageMetrics;
  /** Per-file coverage */
  files: FileCoverage[];
  /** Detected coverage gaps */
  gaps: CoverageGap[];
  /** Trends over time */
  trends?: CoverageTrend[];
  /** Analysis timestamp */
  timestamp: number;
}

/**
 * Coverage metrics
 */
export interface CoverageMetrics {
  /** Line coverage percentage */
  lines: number;
  /** Branch coverage percentage */
  branches: number;
  /** Function coverage percentage */
  functions: number;
  /** Statement coverage percentage */
  statements: number;
  /** Total lines */
  totalLines: number;
  /** Covered lines */
  coveredLines: number;
}

/**
 * Coverage for a single file
 */
export interface FileCoverage {
  /** File path */
  path: string;
  /** Coverage metrics */
  metrics: CoverageMetrics;
  /** Uncovered line numbers */
  uncoveredLines: number[];
  /** Uncovered branches */
  uncoveredBranches: BranchInfo[];
  /** Complexity score */
  complexity: number;
}

/**
 * Branch information for coverage
 */
export interface BranchInfo {
  /** Line number */
  line: number;
  /** Branch index */
  branchIndex: number;
  /** Branch type */
  type: 'if' | 'else' | 'switch' | 'ternary' | 'loop';
  /** Whether branch is covered */
  covered: boolean;
}

/**
 * A coverage gap with priority
 */
export interface CoverageGap {
  /** Gap identifier */
  id: string;
  /** Gap type */
  type: CoverageGapType;
  /** File path */
  filePath: string;
  /** Line range */
  lineRange: [number, number];
  /** Priority score (0-1) */
  priority: number;
  /** Risk score (0-1) */
  risk: number;
  /** Suggested test type */
  suggestedTestType: TestType;
  /** Description */
  description: string;
}

/**
 * Coverage trend over time
 */
export interface CoverageTrend {
  /** Timestamp */
  timestamp: number;
  /** Coverage at this point */
  coverage: number;
  /** Change from previous */
  change: number;
  /** Commit hash if available */
  commitHash?: string;
}

// =============================================================================
// Quality Assessment Types
// =============================================================================

/**
 * Quality gate definition
 */
export interface QualityGate {
  /** Gate identifier */
  id: string;
  /** Gate name */
  name: string;
  /** Metric to evaluate */
  metric: string;
  /** Operator for comparison */
  operator: QualityGateOperator;
  /** Threshold value */
  threshold: number;
  /** Is gate blocking */
  blocking: boolean;
  /** Description */
  description?: string;
}

/**
 * Request to evaluate quality gates
 */
export interface QualityGateRequest {
  /** Custom gate definitions */
  gates?: QualityGate[];
  /** Preset defaults to use */
  defaults?: 'strict' | 'standard' | 'minimal';
  /** Project path */
  projectPath?: string;
}

/**
 * Result of quality gate evaluation
 */
export interface QualityGateResult {
  /** Overall pass/fail */
  passed: boolean;
  /** Individual gate results */
  gateResults: GateEvaluationResult[];
  /** Overall quality score (0-100) */
  qualityScore: number;
  /** Release readiness assessment */
  readiness: ReadinessAssessment;
  /** Recommendations */
  recommendations: string[];
}

/**
 * Single gate evaluation result
 */
export interface GateEvaluationResult {
  /** Gate that was evaluated */
  gate: QualityGate;
  /** Actual value measured */
  actualValue: number;
  /** Pass/fail status */
  passed: boolean;
  /** Margin from threshold */
  margin: number;
}

/**
 * Release readiness assessment
 */
export interface ReadinessAssessment {
  /** Ready for release */
  ready: boolean;
  /** Confidence score (0-1) */
  confidence: number;
  /** Blocking issues */
  blockers: string[];
  /** Warnings */
  warnings: string[];
  /** Suggested actions */
  suggestedActions: string[];
}

// =============================================================================
// Defect Intelligence Types
// =============================================================================

/**
 * Request to predict defects
 */
export interface DefectPredictionRequest {
  /** Target path to analyze */
  targetPath: string;
  /** Analysis depth */
  depth: 'shallow' | 'medium' | 'deep';
  /** Include root cause analysis */
  includeRootCause: boolean;
}

/**
 * Defect prediction result
 */
export interface DefectPredictionResult {
  /** Predicted defects */
  predictions: DefectPrediction[];
  /** Risk hotspots */
  hotspots: DefectHotspot[];
  /** Overall risk score (0-1) */
  overallRisk: number;
  /** Analysis confidence */
  confidence: number;
}

/**
 * A predicted defect
 */
export interface DefectPrediction {
  /** Defect identifier */
  id: string;
  /** Defect type/category */
  type: string;
  /** Predicted severity */
  severity: Severity;
  /** File path */
  filePath: string;
  /** Line range */
  lineRange?: [number, number];
  /** Probability of occurrence (0-1) */
  probability: number;
  /** Description */
  description: string;
  /** Root cause if analyzed */
  rootCause?: RootCauseAnalysis;
  /** Suggested fix */
  suggestedFix?: string;
}

/**
 * Defect hotspot in the codebase
 */
export interface DefectHotspot {
  /** File path */
  filePath: string;
  /** Risk score (0-1) */
  riskScore: number;
  /** Change frequency */
  changeFrequency: number;
  /** Historical defect count */
  historicalDefects: number;
  /** Complexity score */
  complexity: number;
}

/**
 * Root cause analysis result
 */
export interface RootCauseAnalysis {
  /** Primary cause */
  primaryCause: string;
  /** Contributing factors */
  contributingFactors: string[];
  /** Similar past defects */
  similarDefects: string[];
  /** Confidence (0-1) */
  confidence: number;
}

// =============================================================================
// Security Compliance Types
// =============================================================================

/**
 * Request for security scan
 */
export interface SecurityScanRequest {
  /** Target path to scan */
  targetPath: string;
  /** Scan type */
  scanType: SecurityScanType;
  /** Compliance standards to check */
  compliance: ComplianceStandard[];
  /** Severity filter */
  severityFilter: 'all' | Severity;
}

/**
 * Security scan result
 */
export interface SecurityScanResult {
  /** Scan identifier */
  scanId: string;
  /** Findings */
  findings: SecurityFinding[];
  /** Compliance status */
  complianceStatus: ComplianceStatus[];
  /** Summary statistics */
  summary: SecuritySummary;
  /** Scan timestamp */
  timestamp: number;
}

/**
 * A security finding
 */
export interface SecurityFinding {
  /** Finding identifier */
  id: string;
  /** Finding type */
  type: string;
  /** Severity */
  severity: Severity;
  /** CWE identifier */
  cweId?: string;
  /** CVE identifier */
  cveId?: string;
  /** File path */
  filePath: string;
  /** Line number */
  lineNumber?: number;
  /** Description */
  description: string;
  /** Remediation guidance */
  remediation: string;
  /** Code snippet */
  codeSnippet?: string;
}

/**
 * Compliance status for a standard
 */
export interface ComplianceStatus {
  /** Compliance standard */
  standard: ComplianceStandard;
  /** Compliance percentage (0-100) */
  compliance: number;
  /** Passing checks */
  passingChecks: number;
  /** Total checks */
  totalChecks: number;
  /** Failed checks */
  failedChecks: ComplianceCheck[];
}

/**
 * A compliance check
 */
export interface ComplianceCheck {
  /** Check identifier */
  id: string;
  /** Check name */
  name: string;
  /** Description */
  description: string;
  /** Status */
  status: 'pass' | 'fail' | 'warning' | 'not-applicable';
  /** Related findings */
  relatedFindings: string[];
}

/**
 * Security scan summary
 */
export interface SecuritySummary {
  /** Total findings */
  totalFindings: number;
  /** Findings by severity */
  bySeverity: Record<Severity, number>;
  /** Critical issues count */
  criticalCount: number;
  /** High issues count */
  highCount: number;
  /** Medium issues count */
  mediumCount: number;
  /** Low issues count */
  lowCount: number;
}

// =============================================================================
// Contract Testing Types
// =============================================================================

/**
 * Request to validate a contract
 */
export interface ContractValidationRequest {
  /** Path to contract definition */
  contractPath: string;
  /** Type of contract */
  contractType: ContractType;
  /** Target URL for live validation */
  targetUrl?: string;
  /** Strict validation mode */
  strict: boolean;
}

/**
 * Contract validation result
 */
export interface ContractValidationResult {
  /** Validation passed */
  valid: boolean;
  /** Validation errors */
  errors: ContractError[];
  /** Warnings */
  warnings: ContractWarning[];
  /** Breaking changes detected */
  breakingChanges?: BreakingChange[];
  /** Endpoints validated */
  endpointCount: number;
}

/**
 * Contract validation error
 */
export interface ContractError {
  /** Error path in contract */
  path: string;
  /** Error message */
  message: string;
  /** Severity */
  severity: 'error' | 'warning';
  /** Suggestion for fix */
  suggestion?: string;
}

/**
 * Contract warning
 */
export interface ContractWarning {
  /** Warning path */
  path: string;
  /** Warning message */
  message: string;
  /** Warning code */
  code: string;
}

/**
 * Breaking change detection
 */
export interface BreakingChange {
  /** Change type */
  type: string;
  /** Endpoint affected */
  endpoint: string;
  /** Description */
  description: string;
  /** Impact level */
  impact: 'breaking' | 'potentially-breaking' | 'non-breaking';
}

// =============================================================================
// Chaos Engineering Types
// =============================================================================

/**
 * Request to inject chaos
 */
export interface ChaosInjectionRequest {
  /** Target service/component */
  target: string;
  /** Failure type to inject */
  failureType: ChaosFailureType;
  /** Duration in seconds */
  duration: number;
  /** Intensity (0-1) */
  intensity: number;
  /** Dry run mode */
  dryRun: boolean;
}

/**
 * Chaos injection result
 */
export interface ChaosInjectionResult {
  /** Experiment identifier */
  experimentId: string;
  /** Experiment executed */
  executed: boolean;
  /** Start time */
  startTime: number;
  /** End time */
  endTime?: number;
  /** Observations */
  observations: ChaosObservation[];
  /** Resilience assessment */
  resilience?: ResilienceAssessment;
}

/**
 * Observation during chaos experiment
 */
export interface ChaosObservation {
  /** Timestamp */
  timestamp: number;
  /** Observation type */
  type: 'metric' | 'event' | 'error';
  /** Service affected */
  service: string;
  /** Description */
  description: string;
  /** Value if metric */
  value?: number;
}

/**
 * Resilience assessment after chaos
 */
export interface ResilienceAssessment {
  /** Resilience score (0-1) */
  score: number;
  /** Recovery time in ms */
  recoveryTime: number;
  /** Failure modes observed */
  failureModes: string[];
  /** Recommendations */
  recommendations: string[];
  /** Weaknesses identified */
  weaknesses: string[];
}

// =============================================================================
// Test Execution Types
// =============================================================================

/**
 * Test execution result
 */
export interface TestExecutionResult {
  /** Total tests run */
  total: number;
  /** Tests passed */
  passed: number;
  /** Tests failed */
  failed: number;
  /** Tests skipped */
  skipped: number;
  /** Flaky tests detected */
  flaky: number;
  /** Execution duration in ms */
  duration: number;
  /** Individual test results */
  tests: TestResult[];
  /** Coverage if collected */
  coverage?: CoverageMetrics;
}

/**
 * Individual test result
 */
export interface TestResult {
  /** Test name */
  name: string;
  /** Test file */
  file: string;
  /** Test status */
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  /** Duration in ms */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Retry count */
  retries?: number;
}

// =============================================================================
// Plugin Configuration Types
// =============================================================================

/**
 * Plugin configuration
 */
export interface AQEPluginConfig {
  /** Plugin version */
  version?: string;
  /** Memory namespace prefix */
  namespacePrefix?: string;
  /** Enabled bounded contexts */
  enabledContexts?: BoundedContext[];
  /** Security sandbox config */
  sandbox?: SandboxConfig;
  /** Model routing config */
  modelRouting?: ModelRoutingConfig;
  /** Performance targets */
  performanceTargets?: QEPerformanceTargets;
}

/**
 * Security sandbox configuration
 */
export interface SandboxConfig {
  /** Maximum execution time in ms */
  maxExecutionTime: number;
  /** Memory limit in bytes */
  memoryLimit: number;
  /** Network policy */
  networkPolicy: 'unrestricted' | 'restricted' | 'blocked';
  /** File system policy */
  fileSystemPolicy: 'full' | 'workspace-only' | 'readonly' | 'none';
  /** Allowed commands */
  allowedCommands: string[];
  /** Blocked paths */
  blockedPaths: string[];
}

/**
 * Model routing configuration
 */
export interface ModelRoutingConfig {
  /** Enable intelligent routing */
  enabled: boolean;
  /** Prefer cost over speed */
  preferCost: boolean;
  /** Tier thresholds */
  thresholds: {
    tier1MaxComplexity: number;
    tier2MaxComplexity: number;
  };
}

/**
 * QE-specific performance targets
 */
export interface QEPerformanceTargets {
  /** Test generation latency */
  testGenerationLatency: string;
  /** Coverage analysis complexity */
  coverageAnalysis: string;
  /** Quality gate evaluation time */
  qualityGateEvaluation: string;
  /** Security scan rate */
  securityScanPerKLOC: string;
  /** MCP tool response time */
  mcpToolResponse: string;
  /** Memory per context */
  memoryPerContext: string;
}

// =============================================================================
// Memory Namespace Types
// =============================================================================

/**
 * HNSW configuration for vector search
 */
export interface HNSWConfig {
  /** Number of connections per node */
  m: number;
  /** Size of dynamic candidate list for construction */
  efConstruction: number;
  /** Size of dynamic candidate list for search */
  efSearch: number;
}

/**
 * Memory namespace definition
 */
export interface QEMemoryNamespace {
  /** Namespace name */
  name: string;
  /** Description */
  description: string;
  /** Vector dimension */
  vectorDimension: number;
  /** HNSW configuration */
  hnswConfig: HNSWConfig;
  /** Schema definition */
  schema: Record<string, SchemaField>;
  /** TTL in milliseconds (null for permanent) */
  ttl: number | null;
}

/**
 * Schema field definition
 */
export interface SchemaField {
  /** Field type */
  type: 'string' | 'number' | 'boolean' | 'object';
  /** Whether field is indexed */
  index?: boolean;
  /** Whether field is required */
  required?: boolean;
}

// =============================================================================
// Worker Types
// =============================================================================

/**
 * Worker type identifiers
 */
export type QEWorkerType =
  | 'test-executor'
  | 'coverage-analyzer'
  | 'security-scanner';

/**
 * Worker definition
 */
export interface QEWorkerDefinition {
  /** Worker type */
  type: QEWorkerType;
  /** Worker capabilities */
  capabilities: string[];
  /** Maximum concurrent instances */
  maxConcurrent: number;
}

/**
 * Worker status
 */
export interface QEWorkerStatus {
  /** Worker identifier */
  id: string;
  /** Worker type */
  type: QEWorkerType;
  /** Current status */
  status: 'idle' | 'running' | 'completed' | 'error';
  /** Current task if running */
  currentTask?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Start time */
  startTime?: number;
}

// =============================================================================
// Hook Types
// =============================================================================

/**
 * Hook event type
 */
export type QEHookEvent =
  | 'pre-test-execution'
  | 'pre-security-scan'
  | 'post-test-execution'
  | 'post-coverage-analysis'
  | 'post-security-scan';

/**
 * Hook priority
 */
export type HookPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Hook definition
 */
export interface QEHookDefinition {
  /** Hook event */
  event: QEHookEvent;
  /** Hook description */
  description: string;
  /** Hook priority */
  priority: HookPriority;
  /** Handler function name */
  handler: string;
}

// =============================================================================
// Agent Types
// =============================================================================

/**
 * QE agent identifier
 */
export type QEAgentId = string;

/**
 * QE agent status
 */
export type QEAgentStatus = 'idle' | 'active' | 'blocked' | 'error';

/**
 * QE agent definition
 */
export interface QEAgentDefinition {
  /** Agent identifier */
  id: QEAgentId;
  /** Agent name */
  name: string;
  /** Bounded context */
  context: BoundedContext;
  /** Agent capabilities */
  capabilities: string[];
  /** Model tier preference */
  modelTier: ModelTier;
  /** Description */
  description: string;
}

// =============================================================================
// Context Mapping Types
// =============================================================================

/**
 * Mapping between QE context and V3 domains
 */
export interface ContextMapping {
  /** QE bounded context */
  qeContext: BoundedContext;
  /** V3 domains this context integrates with */
  v3Domains: V3Domain[];
  /** Agents in this context */
  agents: string[];
  /** Memory namespace for this context */
  memoryNamespace: string;
  /** Security level required */
  securityLevel: SecurityLevel;
}

// =============================================================================
// Result Types
// =============================================================================

/**
 * Generic result type for operations
 */
export interface QEResult<T> {
  /** Success status */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error if failed */
  error?: QEError;
  /** Warnings */
  warnings?: string[];
  /** Duration in ms */
  duration?: number;
}

/**
 * QE error structure
 */
export interface QEError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Error details */
  details?: Record<string, unknown>;
  /** Stack trace if available */
  stack?: string;
}
