/**
 * Metrics Collector for TeammateTool operations
 *
 * Collects and aggregates metrics for monitoring and
 * observability of teammate bridge operations.
 *
 * @module @claude-flow/teammate-plugin/utils/metrics-collector
 */

import type { BridgeMetrics, MetricSnapshot } from '../types.js';

/**
 * Metrics collector with counters, gauges, and histograms
 */
export class MetricsCollector {
  private metrics: BridgeMetrics;
  private readonly maxHistogramSize = 1000;

  constructor() {
    this.metrics = this.createEmptyMetrics();
  }

  private createEmptyMetrics(): BridgeMetrics {
    return {
      teamsCreated: 0,
      teammatesSpawned: 0,
      messagesSent: 0,
      broadcastsSent: 0,
      plansSubmitted: 0,
      plansApproved: 0,
      plansRejected: 0,
      swarmsLaunched: 0,
      delegationsGranted: 0,
      errorsCount: 0,
      activeTeams: 0,
      activeTeammates: 0,
      pendingPlans: 0,
      mailboxSize: 0,
      spawnLatency: [],
      messageLatency: [],
      planApprovalLatency: [],
      rateLimitHits: 0,
      rateLimitBlocks: 0,
      healthChecksPassed: 0,
      healthChecksFailed: 0,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };
  }

  /**
   * Increment a counter metric
   */
  increment(metric: keyof BridgeMetrics, amount = 1): void {
    const value = this.metrics[metric];
    if (typeof value === 'number') {
      (this.metrics[metric] as number) += amount;
    }
    this.metrics.lastActivityAt = new Date();
  }

  /**
   * Decrement a counter metric
   */
  decrement(metric: keyof BridgeMetrics, amount = 1): void {
    const value = this.metrics[metric];
    if (typeof value === 'number') {
      (this.metrics[metric] as number) = Math.max(0, (value as number) - amount);
    }
  }

  /**
   * Set a gauge metric to a specific value
   */
  set(metric: keyof BridgeMetrics, value: number): void {
    if (typeof this.metrics[metric] === 'number') {
      (this.metrics[metric] as number) = value;
    }
  }

  /**
   * Record a latency measurement
   */
  recordLatency(metric: 'spawnLatency' | 'messageLatency' | 'planApprovalLatency', ms: number): void {
    const arr = this.metrics[metric];
    if (arr.length >= this.maxHistogramSize) {
      arr.shift(); // Remove oldest
    }
    arr.push(ms);
  }

  /**
   * Get a snapshot of current metrics
   */
  getSnapshot(): MetricSnapshot {
    const elapsed = (Date.now() - this.metrics.startedAt.getTime()) / 1000;
    return {
      timestamp: new Date(),
      metrics: { ...this.metrics },
      rates: {
        messagesPerSecond: elapsed > 0 ? this.metrics.messagesSent / elapsed : 0,
        spawnsPerMinute: elapsed > 0 ? (this.metrics.teammatesSpawned / elapsed) * 60 : 0,
        errorRate: this.metrics.messagesSent > 0
          ? this.metrics.errorsCount / this.metrics.messagesSent
          : 0,
      },
    };
  }

  /**
   * Calculate percentile for latency metrics
   */
  getPercentile(metric: 'spawnLatency' | 'messageLatency' | 'planApprovalLatency', percentile: number): number {
    const arr = [...this.metrics[metric]].sort((a, b) => a - b);
    if (arr.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  }

  /**
   * Get average latency for a metric
   */
  getAverageLatency(metric: 'spawnLatency' | 'messageLatency' | 'planApprovalLatency'): number {
    const arr = this.metrics[metric];
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Get raw metrics object (for testing)
   */
  getRawMetrics(): BridgeMetrics {
    return { ...this.metrics };
  }
}
