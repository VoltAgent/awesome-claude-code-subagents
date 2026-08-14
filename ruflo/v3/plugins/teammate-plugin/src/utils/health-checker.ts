/**
 * Health Checker for TeammateTool teammates
 *
 * Monitors teammate health status with configurable
 * thresholds and automatic status transitions.
 *
 * @module @claude-flow/teammate-plugin/utils/health-checker
 */

import type {
  HealthCheckConfig,
  TeammateHealthCheck,
  TeamHealthReport,
  HealthStatus,
} from '../types.js';

/**
 * Health checker with configurable check intervals and thresholds
 */
export class HealthChecker {
  private checks: Map<string, TeammateHealthCheck> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private config: HealthCheckConfig,
    private onStatusChange?: (check: TeammateHealthCheck) => void
  ) {}

  /**
   * Start health checks for a teammate
   */
  startChecking(teammateId: string, teamName: string, checkFn: () => Promise<boolean>): void {
    if (!this.config.enabled) return;

    const check: TeammateHealthCheck = {
      teammateId,
      teamName,
      status: 'unknown',
      lastCheck: new Date(),
      lastHealthy: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      latencyMs: null,
    };
    this.checks.set(teammateId, check);

    const interval = setInterval(async () => {
      await this.performCheck(teammateId, checkFn);
    }, this.config.intervalMs);

    this.intervals.set(teammateId, interval);

    // Perform initial check
    this.performCheck(teammateId, checkFn);
  }

  /**
   * Stop health checks for a teammate
   */
  stopChecking(teammateId: string): void {
    const interval = this.intervals.get(teammateId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(teammateId);
    }
    this.checks.delete(teammateId);
  }

  /**
   * Perform a single health check
   */
  private async performCheck(teammateId: string, checkFn: () => Promise<boolean>): Promise<void> {
    const check = this.checks.get(teammateId);
    if (!check) return;

    const startTime = Date.now();
    const previousStatus = check.status;

    try {
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), this.config.timeoutMs);
      });

      const healthy = await Promise.race([checkFn(), timeoutPromise]);
      const latency = Date.now() - startTime;

      check.lastCheck = new Date();
      check.latencyMs = latency;

      if (healthy) {
        check.consecutiveSuccesses++;
        check.consecutiveFailures = 0;
        check.lastHealthy = new Date();
        check.error = undefined;

        if (check.consecutiveSuccesses >= this.config.healthyThreshold) {
          check.status = 'healthy';
        } else if (check.status === 'unhealthy') {
          check.status = 'degraded';
        }
      } else {
        throw new Error('Health check returned false');
      }
    } catch (error) {
      check.lastCheck = new Date();
      check.consecutiveFailures++;
      check.consecutiveSuccesses = 0;
      check.error = error instanceof Error ? error.message : String(error);

      if (check.consecutiveFailures >= this.config.unhealthyThreshold) {
        check.status = 'unhealthy';
      } else {
        check.status = 'degraded';
      }
    }

    if (check.status !== previousStatus && this.onStatusChange) {
      this.onStatusChange(check);
    }
  }

  /**
   * Get health check for a teammate
   */
  getCheck(teammateId: string): TeammateHealthCheck | undefined {
    return this.checks.get(teammateId);
  }

  /**
   * Get team health report
   */
  getTeamReport(teamName: string): TeamHealthReport {
    const teammates = Array.from(this.checks.values())
      .filter(c => c.teamName === teamName);

    const healthyCount = teammates.filter(t => t.status === 'healthy').length;
    const degradedCount = teammates.filter(t => t.status === 'degraded').length;
    const unhealthyCount = teammates.filter(t => t.status === 'unhealthy').length;

    let overallStatus: HealthStatus = 'healthy';
    if (unhealthyCount > 0) {
      overallStatus = unhealthyCount > teammates.length / 2 ? 'unhealthy' : 'degraded';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    }

    return {
      teamName,
      overallStatus,
      healthyCount,
      degradedCount,
      unhealthyCount,
      teammates,
      checkedAt: new Date(),
    };
  }

  /**
   * Stop all health checks
   */
  stopAll(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
    this.checks.clear();
  }

  /**
   * Get all checks (for testing)
   */
  getAllChecks(): Map<string, TeammateHealthCheck> {
    return new Map(this.checks);
  }

  /**
   * Force a check immediately (for testing)
   */
  async forceCheck(teammateId: string, checkFn: () => Promise<boolean>): Promise<void> {
    await this.performCheck(teammateId, checkFn);
  }
}
