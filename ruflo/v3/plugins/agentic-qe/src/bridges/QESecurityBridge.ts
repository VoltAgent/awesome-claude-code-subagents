/**
 * QE Security Bridge
 *
 * Anti-corruption layer for V3 security module integration.
 * Handles path validation, safe execution, audit trails, and PII detection.
 *
 * Integrates with ADR-013: Core Security Module components:
 * - PathValidator: Prevents path traversal attacks
 * - SafeExecutor: Sandboxed command execution
 * - InputValidator: Zod-based input validation
 * - TokenGenerator: Cryptographic operations
 *
 * Based on:
 * - ADR-030: Agentic-QE Plugin Integration
 * - ADR-013: Core Security Module
 *
 * @module v3/plugins/agentic-qe/bridges/QESecurityBridge
 */

import type {
  IQESecurityBridge,
  ValidatedPath,
  DASTProbe,
  DASTResult,
  AuditEvent,
  SignedAuditEntry,
  PIIDetection,
  PIIType,
  SecurityPolicy,
  QELogger,
} from '../interfaces.js';

// V3 Security types (would be imported from @claude-flow/security in production)
interface ISecurityModule {
  pathValidator: IPathValidator;
  safeExecutor: ISafeExecutor;
  inputValidator: IInputValidator;
  tokenGenerator: ITokenGenerator;
}

interface IPathValidator {
  validate(path: string, options?: PathValidatorOptions): Promise<PathValidationResult>;
}

interface PathValidatorOptions {
  allowedPrefixes?: string[];
  allowSymlinks?: boolean;
  resolveRealPath?: boolean;
}

interface PathValidationResult {
  valid: boolean;
  error?: string;
  resolvedPath?: string;
}

interface ISafeExecutor {
  execute(
    command: string,
    args: string[],
    options?: SafeExecutorOptions
  ): Promise<ExecutionResult>;
}

interface SafeExecutorOptions {
  timeout?: number;
  cwd?: string;
  allowedPaths?: string[];
  networkPolicy?: 'unrestricted' | 'local-only' | 'blocked';
  env?: Record<string, string>;
}

interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface IInputValidator {
  validate<T>(input: unknown, schema: string): ValidationResult<T>;
  getPIIPatterns(): Record<string, RegExp>;
  getSchema(name: string): unknown;
}

interface ValidationResult<T> {
  valid: boolean;
  errors?: string[];
  value?: T;
}

interface ITokenGenerator {
  sign(data: string, options?: SignOptions): string;
  verify(data: string, signature: string): boolean;
  generateToken(length?: number): string;
}

interface SignOptions {
  algorithm?: 'HS256' | 'HS384' | 'HS512';
}

/**
 * Security policy configurations by context
 */
const SECURITY_POLICIES: Record<string, SecurityPolicy> = {
  'test-generation': {
    level: 'medium',
    networkPolicy: 'restricted',
    fileSystemPolicy: 'workspace-only',
    allowedCommands: ['node', 'npm', 'npx'],
    blockedPaths: ['/etc', '/var', '~/.ssh', '~/.aws'],
    maxExecutionTime: 30000,
    maxMemory: 512 * 1024 * 1024,
  },
  'test-execution': {
    level: 'high',
    networkPolicy: 'restricted',
    fileSystemPolicy: 'workspace-only',
    allowedCommands: ['node', 'npm', 'npx', 'vitest', 'jest', 'pytest'],
    blockedPaths: ['/etc', '/var', '~/.ssh', '~/.aws', '~/.config'],
    maxExecutionTime: 60000,
    maxMemory: 1024 * 1024 * 1024,
  },
  'security-compliance': {
    level: 'critical',
    networkPolicy: 'blocked',
    fileSystemPolicy: 'readonly',
    allowedCommands: ['node'],
    blockedPaths: ['/etc', '/var', '~/.ssh', '~/.aws', '~/.config', '/tmp'],
    maxExecutionTime: 10000,
    maxMemory: 256 * 1024 * 1024,
  },
  'chaos-resilience': {
    level: 'critical',
    networkPolicy: 'restricted',
    fileSystemPolicy: 'workspace-only',
    allowedCommands: ['node', 'npm', 'npx'],
    blockedPaths: ['/etc', '/var', '~/.ssh', '~/.aws'],
    maxExecutionTime: 30000,
    maxMemory: 512 * 1024 * 1024,
  },
  default: {
    level: 'medium',
    networkPolicy: 'restricted',
    fileSystemPolicy: 'workspace-only',
    allowedCommands: ['node', 'npm', 'npx'],
    blockedPaths: ['/etc', '/var', '~/.ssh', '~/.aws'],
    maxExecutionTime: 30000,
    maxMemory: 512 * 1024 * 1024,
  },
};

/**
 * PII detection patterns
 */
const PII_PATTERNS: Record<PIIType, RegExp> = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  credit_card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  api_key: /\b(?:sk|pk|api|key|token|secret|password|auth)[-_]?[a-zA-Z0-9]{20,}\b/gi,
  password: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,
  address: /\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|court|ct|lane|ln|way)\b/gi,
  name: /\b(?:mr|mrs|ms|dr|prof)\.?\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
  dob: /\b(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b/g,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

/**
 * QE Security Bridge Implementation
 *
 * Bridges agentic-qe security needs to V3's security module.
 * Provides path validation, safe execution, and PII detection.
 */
export class QESecurityBridge implements IQESecurityBridge {
  private security: ISecurityModule;
  private logger: QELogger;
  private workspaceRoot: string;

  constructor(
    security: ISecurityModule,
    logger: QELogger,
    workspaceRoot?: string
  ) {
    this.security = security;
    this.logger = logger;
    this.workspaceRoot = workspaceRoot || process.cwd();
  }

  /**
   * Validate a file path before security scan
   */
  async validateScanTarget(path: string): Promise<ValidatedPath> {
    try {
      this.logger.debug(`Validating scan target: ${path}`);

      const result = await this.security.pathValidator.validate(path, {
        allowedPrefixes: [this.workspaceRoot],
        allowSymlinks: false,
        resolveRealPath: true,
      });

      if (!result.valid) {
        this.logger.warn(`Path validation failed: ${path} - ${result.error}`);
        return {
          path,
          valid: false,
          error: result.error,
        };
      }

      this.logger.debug(`Path validated: ${result.resolvedPath}`);
      return {
        path,
        valid: true,
        resolvedPath: result.resolvedPath,
      };
    } catch (error) {
      this.logger.error(`Path validation error: ${path}`, error);
      return {
        path,
        valid: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Execute DAST probes with security constraints
   */
  async executeDAST(target: string, probes: DASTProbe[]): Promise<DASTResult[]> {
    const results: DASTResult[] = [];

    this.logger.info(`Executing ${probes.length} DAST probes against ${target}`);

    for (const probe of probes) {
      try {
        this.logger.debug(`Executing probe: ${probe.id} (${probe.type})`);

        const startTime = Date.now();

        // Generate safe probe script
        const probeScript = this.generateProbeScript(probe, target);

        // Execute with security constraints
        const execResult = await this.security.safeExecutor.execute(
          'node',
          ['--input-type=module', '-e', probeScript],
          {
            timeout: probe.timeout,
            cwd: this.workspaceRoot,
            allowedPaths: [target],
            networkPolicy: 'local-only',
          }
        );

        const executionTimeMs = Date.now() - startTime;

        // Parse probe result
        const result = this.parseProbeResult(probe, execResult, executionTimeMs);
        results.push(result);

        if (result.vulnerable) {
          this.logger.warn(`Vulnerability detected by probe ${probe.id}: ${result.evidence}`);
        }
      } catch (error) {
        this.logger.error(`Probe ${probe.id} failed`, error);
        results.push({
          probeId: probe.id,
          vulnerable: false,
          statusCode: 0,
          executionTimeMs: 0,
          evidence: `Probe execution failed: ${(error as Error).message}`,
        });
      }
    }

    this.logger.info(`DAST scan complete. ${results.filter(r => r.vulnerable).length} vulnerabilities found`);
    return results;
  }

  /**
   * Create a signed audit entry
   */
  async createAuditEntry(event: AuditEvent): Promise<SignedAuditEntry> {
    try {
      this.logger.debug(`Creating audit entry: ${event.type}`);

      const entry = {
        id: this.generateUUID(),
        event,
        timestamp: Date.now(),
        actor: event.actor,
      };

      // Sign the entry with V3 token generator
      const signature = this.security.tokenGenerator.sign(
        JSON.stringify(entry),
        { algorithm: 'HS256' }
      );

      const signedEntry: SignedAuditEntry = {
        ...entry,
        signature,
        verifiable: true,
      };

      this.logger.debug(`Audit entry created: ${signedEntry.id}`);
      return signedEntry;
    } catch (error) {
      this.logger.error('Failed to create audit entry', error);
      throw new QESecurityError('Failed to create audit entry', error as Error);
    }
  }

  /**
   * Detect PII in content
   */
  async detectPII(content: string): Promise<PIIDetection[]> {
    const detections: PIIDetection[] = [];

    this.logger.debug('Scanning content for PII...');

    try {
      // Try to use V3's PII patterns first
      let patterns: Record<string, RegExp>;
      try {
        patterns = this.security.inputValidator.getPIIPatterns();
      } catch {
        // Fallback to built-in patterns
        patterns = PII_PATTERNS;
      }

      for (const [typeKey, pattern] of Object.entries(patterns)) {
        const type = typeKey as PIIType;
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
          detections.push({
            type,
            location: {
              start: match.index,
              end: match.index + match[0].length,
            },
            confidence: this.calculatePIIConfidence(type, match[0]),
            redactedValue: this.redactPII(type, match[0]),
          });
        }
      }

      this.logger.info(`Found ${detections.length} PII instances`);
      return detections;
    } catch (error) {
      this.logger.error('PII detection failed', error);
      throw new QESecurityError('PII detection failed', error as Error);
    }
  }

  /**
   * Validate input against security schemas
   */
  async validateInput<T>(
    input: unknown,
    schema: string
  ): Promise<{ valid: boolean; errors?: string[]; value?: T }> {
    try {
      this.logger.debug(`Validating input against schema: ${schema}`);

      const result = this.security.inputValidator.validate<T>(input, schema);

      if (!result.valid) {
        this.logger.warn(`Input validation failed: ${result.errors?.join(', ')}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`Input validation error for schema ${schema}`, error);
      return {
        valid: false,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Sanitize error message for safe display
   */
  sanitizeError(error: Error): Error {
    // Remove potentially sensitive information from error messages
    let message = error.message;

    // Remove file paths that could reveal system structure
    message = message.replace(/\/[\w/.-]+/g, '[PATH]');

    // Remove potential secrets
    message = message.replace(/(?:api[_-]?key|secret|password|token)[=:]\s*['"]?[\w-]+['"]?/gi, '[REDACTED]');

    // Remove stack traces
    const sanitized = new Error(message);
    sanitized.name = error.name;

    return sanitized;
  }

  /**
   * Get security policy for a context
   */
  getSecurityPolicy(context: string): SecurityPolicy {
    const policy = SECURITY_POLICIES[context] || SECURITY_POLICIES.default;
    this.logger.debug(`Returning security policy for context: ${context} (level: ${policy.level})`);
    return { ...policy };
  }

  /**
   * Generate DAST probe script
   */
  private generateProbeScript(probe: DASTProbe, target: string): string {
    // Generate a safe Node.js script to execute the probe
    const script = `
      const http = require('http');
      const https = require('https');
      const url = require('url');

      const probeConfig = ${JSON.stringify(probe)};
      const targetUrl = ${JSON.stringify(target)};

      async function executeProbe() {
        return new Promise((resolve, reject) => {
          const parsed = url.parse(targetUrl + probeConfig.endpoint);
          const protocol = parsed.protocol === 'https:' ? https : http;

          const options = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.path,
            method: probeConfig.method,
            timeout: probeConfig.timeout,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'QE-DAST-Scanner/1.0'
            }
          };

          const req = protocol.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: data
              });
            });
          });

          req.on('error', reject);
          req.on('timeout', () => reject(new Error('Request timeout')));

          if (probeConfig.payload) {
            req.write(JSON.stringify(probeConfig.payload));
          }

          req.end();
        });
      }

      executeProbe()
        .then(result => console.log(JSON.stringify(result)))
        .catch(error => console.error(JSON.stringify({ error: error.message })));
    `;

    return script;
  }

  /**
   * Parse probe execution result
   */
  private parseProbeResult(
    probe: DASTProbe,
    execResult: ExecutionResult,
    executionTimeMs: number
  ): DASTResult {
    try {
      if (execResult.timedOut) {
        return {
          probeId: probe.id,
          vulnerable: false,
          statusCode: 0,
          executionTimeMs,
          evidence: 'Request timed out',
        };
      }

      const response = JSON.parse(execResult.stdout);

      // Check for vulnerability indicators in response
      let vulnerable = false;
      let evidence: string | undefined;

      for (const indicator of probe.indicators) {
        if (response.body?.includes(indicator)) {
          vulnerable = true;
          evidence = `Found indicator: ${indicator}`;
          break;
        }
      }

      return {
        probeId: probe.id,
        vulnerable,
        severity: vulnerable ? this.determineSeverity(probe.type) : undefined,
        statusCode: response.statusCode,
        evidence,
        executionTimeMs,
      };
    } catch {
      return {
        probeId: probe.id,
        vulnerable: false,
        statusCode: 0,
        executionTimeMs,
        evidence: execResult.stderr || 'Failed to parse response',
      };
    }
  }

  /**
   * Determine vulnerability severity by type
   */
  private determineSeverity(type: DASTProbe['type']): DASTResult['severity'] {
    const severityMap: Record<DASTProbe['type'], DASTResult['severity']> = {
      sqli: 'critical',
      xss: 'high',
      ssrf: 'critical',
      csrf: 'medium',
      auth: 'critical',
      header: 'medium',
      custom: 'medium',
    };
    return severityMap[type];
  }

  /**
   * Calculate PII detection confidence
   */
  private calculatePIIConfidence(type: PIIType, value: string): number {
    // Higher confidence for certain patterns
    const baseConfidence: Record<PIIType, number> = {
      email: 0.95,
      ssn: 0.98,
      credit_card: 0.95,
      api_key: 0.85,
      phone: 0.80,
      password: 0.90,
      address: 0.70,
      name: 0.60,
      dob: 0.75,
      ip_address: 0.85,
    };

    let confidence = baseConfidence[type];

    // Adjust based on value characteristics
    if (type === 'email' && value.includes('+')) confidence *= 0.95;
    if (type === 'phone' && value.length >= 14) confidence *= 1.05;
    if (type === 'credit_card' && this.validateLuhn(value)) confidence = 0.99;

    return Math.min(confidence, 1.0);
  }

  /**
   * Luhn algorithm for credit card validation
   */
  private validateLuhn(value: string): boolean {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;

    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i], 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Redact PII value for safe storage
   */
  private redactPII(type: PIIType, value: string): string {
    switch (type) {
      case 'email': {
        const [local, domain] = value.split('@');
        return `${local[0]}***@${domain}`;
      }
      case 'phone':
        return value.replace(/\d(?=\d{4})/g, '*');
      case 'ssn':
        return '***-**-' + value.slice(-4);
      case 'credit_card':
        return '**** **** **** ' + value.replace(/\D/g, '').slice(-4);
      case 'api_key':
        return value.slice(0, 4) + '***' + value.slice(-4);
      case 'password':
        return '********';
      default:
        return value.slice(0, 2) + '***';
    }
  }

  /**
   * Generate UUID
   */
  private generateUUID(): string {
    // Simple UUID v4 generation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

/**
 * QE Security Error class
 */
export class QESecurityError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'QESecurityError';
    this.cause = cause;
  }
}
