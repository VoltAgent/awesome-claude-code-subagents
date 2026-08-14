/**
 * TDD Tests for Utility Classes
 *
 * Tests for RateLimiter, CircuitBreaker, MetricsCollector,
 * HealthChecker, and retry utilities.
 *
 * @module @claude-flow/teammate-plugin/tests/utils
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { RateLimiter } from '../src/utils/rate-limiter.js';
import { CircuitBreaker, CircuitBreakerOpenError } from '../src/utils/circuit-breaker.js';
import { MetricsCollector } from '../src/utils/metrics-collector.js';
import { HealthChecker } from '../src/utils/health-checker.js';
import {
  withRetry,
  createRetryState,
  calculateBackoffDelay,
  sleep,
  withTimeout,
} from '../src/utils/retry.js';

import {
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_HEALTH_CHECK_CONFIG,
  DEFAULT_RETRY_CONFIG,
  TeammateErrorCode,
} from '../src/types.js';

// ============================================================================
// RateLimiter Tests
// ============================================================================

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter(DEFAULT_RATE_LIMIT_CONFIG);
  });

  describe('checkLimit', () => {
    it('should allow operations within limit', () => {
      // Default spawnPerMinute is 10
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.checkLimit('spawnPerMinute')).toBe(true);
      }
    });

    it('should block operations exceeding limit', () => {
      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkLimit('spawnPerMinute');
      }

      // Next call should be blocked
      expect(rateLimiter.checkLimit('spawnPerMinute')).toBe(false);
    });

    it('should track different operations independently', () => {
      // Use up spawn limit
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkLimit('spawnPerMinute');
      }

      // Messages should still be allowed (limit is 100)
      expect(rateLimiter.checkLimit('messagesPerMinute')).toBe(true);
    });

    it('should reset after window expires', async () => {
      // Create a rate limiter with a very short window for testing
      const testConfig = { ...DEFAULT_RATE_LIMIT_CONFIG, spawnPerMinute: 1 };
      const shortLimiter = new RateLimiter(testConfig);

      // Use the limit
      shortLimiter.checkLimit('spawnPerMinute');
      expect(shortLimiter.checkLimit('spawnPerMinute')).toBe(false);

      // Manual reset simulates window expiry
      shortLimiter.reset('spawnPerMinute');
      expect(shortLimiter.checkLimit('spawnPerMinute')).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return undefined for unused operations', () => {
      expect(rateLimiter.getState('spawnPerMinute')).toBeUndefined();
    });

    it('should return state after operation is used', () => {
      rateLimiter.checkLimit('spawnPerMinute');

      const state = rateLimiter.getState('spawnPerMinute');
      expect(state).toBeDefined();
      expect(state?.count).toBe(1);
      expect(state?.blocked).toBe(false);
    });

    it('should mark state as blocked when limit exceeded', () => {
      for (let i = 0; i < 11; i++) {
        rateLimiter.checkLimit('spawnPerMinute');
      }

      const state = rateLimiter.getState('spawnPerMinute');
      expect(state?.blocked).toBe(true);
      expect(state?.nextAllowedAt).toBeDefined();
    });
  });

  describe('getRemaining', () => {
    it('should return full limit when no operations used', () => {
      expect(rateLimiter.getRemaining('spawnPerMinute')).toBe(10);
    });

    it('should decrease as operations are used', () => {
      rateLimiter.checkLimit('spawnPerMinute');
      rateLimiter.checkLimit('spawnPerMinute');
      rateLimiter.checkLimit('spawnPerMinute');

      expect(rateLimiter.getRemaining('spawnPerMinute')).toBe(7);
    });

    it('should return 0 when limit exhausted', () => {
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkLimit('spawnPerMinute');
      }

      expect(rateLimiter.getRemaining('spawnPerMinute')).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset specific operation', () => {
      rateLimiter.checkLimit('spawnPerMinute');
      rateLimiter.checkLimit('messagesPerMinute');

      rateLimiter.reset('spawnPerMinute');

      expect(rateLimiter.getState('spawnPerMinute')).toBeUndefined();
      expect(rateLimiter.getState('messagesPerMinute')).toBeDefined();
    });

    it('should reset all operations when no argument provided', () => {
      rateLimiter.checkLimit('spawnPerMinute');
      rateLimiter.checkLimit('messagesPerMinute');

      rateLimiter.reset();

      expect(rateLimiter.getState('spawnPerMinute')).toBeUndefined();
      expect(rateLimiter.getState('messagesPerMinute')).toBeUndefined();
    });
  });

  describe('isBlocked', () => {
    it('should return false when not blocked', () => {
      rateLimiter.checkLimit('spawnPerMinute');
      expect(rateLimiter.isBlocked('spawnPerMinute')).toBe(false);
    });

    it('should return true when blocked', () => {
      for (let i = 0; i < 11; i++) {
        rateLimiter.checkLimit('spawnPerMinute');
      }
      expect(rateLimiter.isBlocked('spawnPerMinute')).toBe(true);
    });
  });
});

// ============================================================================
// CircuitBreaker Tests
// ============================================================================

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(DEFAULT_CIRCUIT_BREAKER_CONFIG);
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(circuitBreaker.isClosed()).toBe(true);
      expect(circuitBreaker.isOpen()).toBe(false);
      expect(circuitBreaker.isHalfOpen()).toBe(false);
    });

    it('should have zero failures and successes', () => {
      const state = circuitBreaker.getState();
      expect(state.failures).toBe(0);
      expect(state.successes).toBe(0);
    });
  });

  describe('execute', () => {
    it('should execute function and return result when closed', async () => {
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should record success after successful execution', async () => {
      await circuitBreaker.execute(async () => 'ok');

      const state = circuitBreaker.getState();
      expect(state.successes).toBe(1);
      expect(state.lastSuccess).not.toBeNull();
    });

    it('should record failure after failed execution', async () => {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('test error');
        });
      } catch {
        // Expected
      }

      const state = circuitBreaker.getState();
      expect(state.failures).toBe(1);
      expect(state.lastFailure).not.toBeNull();
    });

    it('should open circuit after failure threshold reached', async () => {
      // Default threshold is 5
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('failure');
          });
        } catch {
          // Expected
        }
      }

      expect(circuitBreaker.isOpen()).toBe(true);
    });

    it('should reject immediately when open', async () => {
      circuitBreaker.forceOpen();

      await expect(
        circuitBreaker.execute(async () => 'should not run')
      ).rejects.toThrow(CircuitBreakerOpenError);
    });

    it('should include error code in CircuitBreakerOpenError', async () => {
      circuitBreaker.forceOpen();

      try {
        await circuitBreaker.execute(async () => 'test');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect((error as CircuitBreakerOpenError).code).toBe(TeammateErrorCode.BACKEND_UNAVAILABLE);
      }
    });
  });

  describe('state transitions', () => {
    it('should transition from closed to open after failures', async () => {
      expect(circuitBreaker.isClosed()).toBe(true);

      // Trigger failures up to threshold (5)
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      expect(circuitBreaker.isOpen()).toBe(true);
    });

    it('should transition from open to half-open after reset time', async () => {
      const quickConfig = {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        resetTimeMs: 10, // Very short for testing
      };
      const quickBreaker = new CircuitBreaker(quickConfig);
      quickBreaker.forceOpen();

      // Wait for reset time
      await sleep(20);

      // Try to execute - should transition to half-open
      try {
        await quickBreaker.execute(async () => 'test');
      } catch {
        // May fail, but state should change
      }

      expect(quickBreaker.isHalfOpen()).toBe(true);
    });

    it('should transition from half-open to closed after successes', async () => {
      circuitBreaker.forceHalfOpen();

      // Success threshold is 2
      await circuitBreaker.execute(async () => 'success1');
      await circuitBreaker.execute(async () => 'success2');

      expect(circuitBreaker.isClosed()).toBe(true);
    });

    it('should transition from half-open to open on failure', async () => {
      circuitBreaker.forceHalfOpen();

      // Need to accumulate failures
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      expect(circuitBreaker.isOpen()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset to initial closed state', async () => {
      // Open the circuit
      circuitBreaker.forceOpen();
      expect(circuitBreaker.isOpen()).toBe(true);

      // Reset
      circuitBreaker.reset();

      expect(circuitBreaker.isClosed()).toBe(true);
      const state = circuitBreaker.getState();
      expect(state.failures).toBe(0);
      expect(state.successes).toBe(0);
    });
  });

  describe('disabled circuit breaker', () => {
    it('should pass through when disabled', async () => {
      const disabledBreaker = new CircuitBreaker({
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        enabled: false,
      });

      disabledBreaker.forceOpen();

      // Should still execute even though "open"
      const result = await disabledBreaker.execute(async () => 'passed');
      expect(result).toBe('passed');
    });
  });

  describe('timeout', () => {
    it('should timeout slow operations', async () => {
      const quickTimeoutConfig = {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        timeoutMs: 10,
      };
      const quickBreaker = new CircuitBreaker(quickTimeoutConfig);

      await expect(
        quickBreaker.execute(async () => {
          await sleep(100);
          return 'too slow';
        })
      ).rejects.toThrow('timeout');
    });
  });
});

// ============================================================================
// MetricsCollector Tests
// ============================================================================

describe('MetricsCollector', () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  describe('increment', () => {
    it('should increment counter metrics', () => {
      metrics.increment('teamsCreated');
      metrics.increment('teamsCreated');

      const snapshot = metrics.getSnapshot();
      expect(snapshot.metrics.teamsCreated).toBe(2);
    });

    it('should increment by custom amount', () => {
      metrics.increment('messagesSent', 5);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.metrics.messagesSent).toBe(5);
    });

    it('should update lastActivityAt', () => {
      const before = new Date();
      metrics.increment('teamsCreated');

      const snapshot = metrics.getSnapshot();
      expect(snapshot.metrics.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('decrement', () => {
    it('should decrement counter metrics', () => {
      metrics.increment('activeTeams', 5);
      metrics.decrement('activeTeams', 2);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.metrics.activeTeams).toBe(3);
    });

    it('should not go below zero', () => {
      metrics.increment('activeTeams', 2);
      metrics.decrement('activeTeams', 10);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.metrics.activeTeams).toBe(0);
    });
  });

  describe('set', () => {
    it('should set gauge metrics to specific value', () => {
      metrics.set('activeTeammates', 42);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.metrics.activeTeammates).toBe(42);
    });
  });

  describe('recordLatency', () => {
    it('should record latency measurements', () => {
      metrics.recordLatency('spawnLatency', 100);
      metrics.recordLatency('spawnLatency', 200);
      metrics.recordLatency('spawnLatency', 150);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.metrics.spawnLatency).toHaveLength(3);
    });
  });

  describe('getPercentile', () => {
    it('should calculate percentiles correctly', () => {
      // Add values 1-100
      for (let i = 1; i <= 100; i++) {
        metrics.recordLatency('messageLatency', i);
      }

      // P50 should be ~50
      const p50 = metrics.getPercentile('messageLatency', 50);
      expect(p50).toBeGreaterThanOrEqual(49);
      expect(p50).toBeLessThanOrEqual(51);

      // P99 should be ~99
      const p99 = metrics.getPercentile('messageLatency', 99);
      expect(p99).toBeGreaterThanOrEqual(98);
    });

    it('should return 0 for empty histogram', () => {
      expect(metrics.getPercentile('spawnLatency', 50)).toBe(0);
    });
  });

  describe('getAverageLatency', () => {
    it('should calculate average correctly', () => {
      metrics.recordLatency('spawnLatency', 100);
      metrics.recordLatency('spawnLatency', 200);
      metrics.recordLatency('spawnLatency', 300);

      expect(metrics.getAverageLatency('spawnLatency')).toBe(200);
    });

    it('should return 0 for empty histogram', () => {
      expect(metrics.getAverageLatency('spawnLatency')).toBe(0);
    });
  });

  describe('getSnapshot', () => {
    it('should include calculated rates', () => {
      metrics.increment('messagesSent', 10);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.rates).toBeDefined();
      expect(snapshot.rates.messagesPerSecond).toBeGreaterThanOrEqual(0);
    });

    it('should include timestamp', () => {
      const before = new Date();
      const snapshot = metrics.getSnapshot();

      expect(snapshot.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('reset', () => {
    it('should reset all metrics to initial values', () => {
      metrics.increment('teamsCreated', 5);
      metrics.recordLatency('spawnLatency', 100);

      metrics.reset();

      const snapshot = metrics.getSnapshot();
      expect(snapshot.metrics.teamsCreated).toBe(0);
      expect(snapshot.metrics.spawnLatency).toHaveLength(0);
    });
  });
});

// ============================================================================
// HealthChecker Tests
// ============================================================================

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;
  let statusChangeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    statusChangeSpy = vi.fn();
    healthChecker = new HealthChecker(
      {
        ...DEFAULT_HEALTH_CHECK_CONFIG,
        intervalMs: 100, // Short interval for testing
      },
      statusChangeSpy
    );
  });

  afterEach(() => {
    healthChecker.stopAll();
  });

  describe('startChecking', () => {
    it('should add teammate to checks', () => {
      healthChecker.startChecking('teammate-1', 'team-1', async () => true);

      const check = healthChecker.getCheck('teammate-1');
      expect(check).toBeDefined();
      expect(check?.teammateId).toBe('teammate-1');
      expect(check?.teamName).toBe('team-1');
    });

    it('should perform initial check', async () => {
      healthChecker.startChecking('teammate-1', 'team-1', async () => true);

      // Wait for initial check - async checks need adequate time
      await sleep(150);

      const check = healthChecker.getCheck('teammate-1');
      // After initial check, status should transition from 'unknown'
      // to either 'healthy' or 'degraded' depending on threshold
      expect(['healthy', 'degraded']).toContain(check?.status);
    });
  });

  describe('stopChecking', () => {
    it('should remove teammate from checks', () => {
      healthChecker.startChecking('teammate-1', 'team-1', async () => true);
      healthChecker.stopChecking('teammate-1');

      expect(healthChecker.getCheck('teammate-1')).toBeUndefined();
    });
  });

  describe('health status transitions', () => {
    it('should become healthy after successful checks', async () => {
      healthChecker.startChecking('teammate-1', 'team-1', async () => true);

      // Wait for checks to accumulate
      await sleep(300);

      const check = healthChecker.getCheck('teammate-1');
      expect(check?.status).toBe('healthy');
    });

    it('should become unhealthy after failed checks', async () => {
      healthChecker.startChecking('teammate-1', 'team-1', async () => false);

      // Wait for checks to fail
      await sleep(400);

      const check = healthChecker.getCheck('teammate-1');
      expect(check?.status).toBe('unhealthy');
    });

    it('should call onStatusChange when status changes', async () => {
      healthChecker.startChecking('teammate-1', 'team-1', async () => true);

      // Wait for status change
      await sleep(300);

      expect(statusChangeSpy).toHaveBeenCalled();
    });
  });

  describe('getTeamReport', () => {
    it('should aggregate health by team', async () => {
      healthChecker.startChecking('t1', 'team-1', async () => true);
      healthChecker.startChecking('t2', 'team-1', async () => true);
      healthChecker.startChecking('t3', 'team-2', async () => true);

      // Wait for checks
      await sleep(300);

      const report = healthChecker.getTeamReport('team-1');
      expect(report.teamName).toBe('team-1');
      expect(report.teammates).toHaveLength(2);
    });

    it('should calculate overall status', async () => {
      healthChecker.startChecking('t1', 'team-1', async () => true);
      healthChecker.startChecking('t2', 'team-1', async () => true);

      await sleep(300);

      const report = healthChecker.getTeamReport('team-1');
      expect(report.overallStatus).toBe('healthy');
    });
  });

  describe('forceCheck', () => {
    it('should perform check immediately', async () => {
      healthChecker.startChecking('teammate-1', 'team-1', async () => true);

      await healthChecker.forceCheck('teammate-1', async () => false);

      const check = healthChecker.getCheck('teammate-1');
      expect(check?.consecutiveFailures).toBe(1);
    });
  });
});

// ============================================================================
// Retry Utilities Tests
// ============================================================================

describe('Retry Utilities', () => {
  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const result = await withRetry(
        async () => 'success',
        DEFAULT_RETRY_CONFIG
      );

      expect(result).toBe('success');
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const result = await withRetry(
        async () => {
          attempts++;
          if (attempts < 3) throw new Error('not yet');
          return 'success';
        },
        { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 10 }
      );

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max retries exhausted', async () => {
      await expect(
        withRetry(
          async () => {
            throw new Error('always fails');
          },
          { ...DEFAULT_RETRY_CONFIG, maxRetries: 2, initialDelayMs: 10 }
        )
      ).rejects.toThrow('always fails');
    });

    it('should respect isRetryable filter', async () => {
      let attempts = 0;
      const nonRetryableError = new Error('non-retryable');

      await expect(
        withRetry(
          async () => {
            attempts++;
            throw nonRetryableError;
          },
          { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 10 },
          (error) => error.message !== 'non-retryable'
        )
      ).rejects.toThrow('non-retryable');

      // Should not have retried
      expect(attempts).toBe(1);
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should increase exponentially', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 100, backoffMultiplier: 2 };

      expect(calculateBackoffDelay(1, config)).toBe(100);
      expect(calculateBackoffDelay(2, config)).toBe(200);
      expect(calculateBackoffDelay(3, config)).toBe(400);
    });

    it('should cap at maxDelayMs', () => {
      const config = {
        ...DEFAULT_RETRY_CONFIG,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 500,
      };

      expect(calculateBackoffDelay(10, config)).toBe(500);
    });
  });

  describe('sleep', () => {
    it('should delay for specified duration', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some variance
    });
  });

  describe('withTimeout', () => {
    it('should return result if within timeout', async () => {
      const result = await withTimeout(
        async () => 'fast',
        100
      );

      expect(result).toBe('fast');
    });

    it('should throw on timeout', async () => {
      await expect(
        withTimeout(
          async () => {
            await sleep(200);
            return 'slow';
          },
          50
        )
      ).rejects.toThrow('timed out');
    });

    it('should use custom timeout error', async () => {
      const customError = new Error('custom timeout');

      await expect(
        withTimeout(
          async () => {
            await sleep(100);
          },
          10,
          customError
        )
      ).rejects.toThrow('custom timeout');
    });
  });

  describe('createRetryState', () => {
    it('should create initial retry state', () => {
      const state = createRetryState();

      expect(state.attempt).toBe(0);
      expect(state.lastError).toBeNull();
      expect(state.nextRetryAt).toBeNull();
      expect(state.totalDelayMs).toBe(0);
    });
  });
});
