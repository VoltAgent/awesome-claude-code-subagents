/**
 * Convoy Tests
 *
 * Tests for convoy (work order) management including creation,
 * issue tracking, status calculation, completion detection,
 * blocker identification, observer callbacks, and cancellation.
 * Uses London School TDD approach with mock-first design.
 *
 * @module gastown-bridge/tests/convoy
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Types
// ============================================================================

type ConvoyStatus = 'active' | 'landed' | 'failed' | 'paused' | 'cancelled';
type IssueStatus = 'open' | 'in_progress' | 'closed' | 'blocked';

interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
  blockedBy?: string[];
  blocks?: string[];
  priority: number;
  assignee?: string;
}

interface ConvoyProgress {
  total: number;
  closed: number;
  inProgress: number;
  blocked: number;
  open: number;
  percentComplete: number;
}

interface ConvoyConfig {
  id: string;
  name: string;
  description?: string;
  autoComplete?: boolean;
  failOnBlocked?: boolean;
}

interface ConvoyEvent {
  type: 'issue-added' | 'issue-removed' | 'status-changed' | 'completed' | 'failed' | 'cancelled';
  convoy: string;
  timestamp: Date;
  data?: unknown;
}

type ConvoyObserver = (event: ConvoyEvent) => void;

// ============================================================================
// Convoy Implementation (to be tested)
// ============================================================================

class Convoy {
  private readonly config: ConvoyConfig;
  private issues: Map<string, Issue> = new Map();
  private _status: ConvoyStatus = 'active';
  private observers: Set<ConvoyObserver> = new Set();
  private createdAt: Date;
  private completedAt?: Date;
  private _cancelled = false;

  constructor(config: ConvoyConfig) {
    this.config = {
      autoComplete: true,
      failOnBlocked: false,
      ...config,
    };
    this.createdAt = new Date();
  }

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get description(): string | undefined {
    return this.config.description;
  }

  get status(): ConvoyStatus {
    return this._status;
  }

  get isCancelled(): boolean {
    return this._cancelled;
  }

  // ==========================================================================
  // Issue Management
  // ==========================================================================

  addIssue(issue: Issue): boolean {
    if (this._cancelled || this._status === 'landed' || this._status === 'failed') {
      return false;
    }

    if (this.issues.has(issue.id)) {
      return false; // Already exists
    }

    this.issues.set(issue.id, { ...issue });
    this.emit({
      type: 'issue-added',
      convoy: this.id,
      timestamp: new Date(),
      data: { issueId: issue.id },
    });

    this.recalculateStatus();
    return true;
  }

  addIssues(issues: Issue[]): { added: string[]; failed: string[] } {
    const added: string[] = [];
    const failed: string[] = [];

    for (const issue of issues) {
      if (this.addIssue(issue)) {
        added.push(issue.id);
      } else {
        failed.push(issue.id);
      }
    }

    return { added, failed };
  }

  removeIssue(issueId: string): boolean {
    if (this._cancelled) {
      return false;
    }

    if (!this.issues.has(issueId)) {
      return false;
    }

    this.issues.delete(issueId);
    this.emit({
      type: 'issue-removed',
      convoy: this.id,
      timestamp: new Date(),
      data: { issueId },
    });

    this.recalculateStatus();
    return true;
  }

  getIssue(issueId: string): Issue | undefined {
    const issue = this.issues.get(issueId);
    return issue ? { ...issue } : undefined;
  }

  getAllIssues(): Issue[] {
    return Array.from(this.issues.values()).map(i => ({ ...i }));
  }

  updateIssue(issueId: string, updates: Partial<Omit<Issue, 'id'>>): boolean {
    if (this._cancelled) {
      return false;
    }

    const issue = this.issues.get(issueId);
    if (!issue) {
      return false;
    }

    const oldStatus = issue.status;
    Object.assign(issue, updates);

    if (oldStatus !== issue.status) {
      this.emit({
        type: 'status-changed',
        convoy: this.id,
        timestamp: new Date(),
        data: { issueId, oldStatus, newStatus: issue.status },
      });
    }

    this.recalculateStatus();
    return true;
  }

  // ==========================================================================
  // Status Calculation
  // ==========================================================================

  getProgress(): ConvoyProgress {
    const issues = Array.from(this.issues.values());
    const total = issues.length;

    if (total === 0) {
      return {
        total: 0,
        closed: 0,
        inProgress: 0,
        blocked: 0,
        open: 0,
        percentComplete: 0,
      };
    }

    const closed = issues.filter(i => i.status === 'closed').length;
    const inProgress = issues.filter(i => i.status === 'in_progress').length;
    const blocked = issues.filter(i => i.status === 'blocked').length;
    const open = issues.filter(i => i.status === 'open').length;

    return {
      total,
      closed,
      inProgress,
      blocked,
      open,
      percentComplete: Math.round((closed / total) * 100),
    };
  }

  isComplete(): boolean {
    if (this.issues.size === 0) {
      return false;
    }

    const progress = this.getProgress();
    return progress.closed === progress.total;
  }

  // ==========================================================================
  // Blocker Identification
  // ==========================================================================

  getBlockers(): Issue[] {
    const blockers: Issue[] = [];

    for (const issue of this.issues.values()) {
      if (issue.status === 'blocked') {
        blockers.push({ ...issue });
      }
    }

    return blockers;
  }

  getBlockedIssues(): Issue[] {
    return this.getBlockers();
  }

  getBlockingChain(issueId: string): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();

    const traverse = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);

      const issue = this.issues.get(id);
      if (!issue?.blockedBy) return;

      for (const blockerId of issue.blockedBy) {
        if (this.issues.has(blockerId)) {
          chain.push(blockerId);
          traverse(blockerId);
        }
      }
    };

    traverse(issueId);
    return chain;
  }

  // ==========================================================================
  // Ready Issues
  // ==========================================================================

  getReadyIssues(): Issue[] {
    const ready: Issue[] = [];

    for (const issue of this.issues.values()) {
      if (this.isIssueReady(issue)) {
        ready.push({ ...issue });
      }
    }

    // Sort by priority (lower number = higher priority)
    return ready.sort((a, b) => a.priority - b.priority);
  }

  private isIssueReady(issue: Issue): boolean {
    // Issue is ready if:
    // 1. It's open (not in_progress, closed, or blocked)
    // 2. All its blockers are closed
    if (issue.status !== 'open') {
      return false;
    }

    if (!issue.blockedBy || issue.blockedBy.length === 0) {
      return true;
    }

    return issue.blockedBy.every(blockerId => {
      const blocker = this.issues.get(blockerId);
      return !blocker || blocker.status === 'closed';
    });
  }

  // ==========================================================================
  // Observer Pattern
  // ==========================================================================

  subscribe(observer: ConvoyObserver): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  private emit(event: ConvoyEvent): void {
    for (const observer of this.observers) {
      try {
        observer(event);
      } catch {
        // Ignore observer errors
      }
    }
  }

  // ==========================================================================
  // Cancellation
  // ==========================================================================

  cancel(reason?: string): boolean {
    if (this._cancelled || this._status === 'landed' || this._status === 'failed') {
      return false;
    }

    this._cancelled = true;
    this._status = 'cancelled';

    this.emit({
      type: 'cancelled',
      convoy: this.id,
      timestamp: new Date(),
      data: { reason },
    });

    return true;
  }

  pause(): boolean {
    if (this._cancelled || this._status !== 'active') {
      return false;
    }

    this._status = 'paused';
    this.emit({
      type: 'status-changed',
      convoy: this.id,
      timestamp: new Date(),
      data: { oldStatus: 'active', newStatus: 'paused' },
    });

    return true;
  }

  resume(): boolean {
    if (this._cancelled || this._status !== 'paused') {
      return false;
    }

    this._status = 'active';
    this.emit({
      type: 'status-changed',
      convoy: this.id,
      timestamp: new Date(),
      data: { oldStatus: 'paused', newStatus: 'active' },
    });

    this.recalculateStatus();
    return true;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private recalculateStatus(): void {
    if (this._cancelled || this._status === 'paused') {
      return;
    }

    const progress = this.getProgress();

    // Check for completion
    if (this.config.autoComplete && this.isComplete()) {
      this._status = 'landed';
      this.completedAt = new Date();
      this.emit({
        type: 'completed',
        convoy: this.id,
        timestamp: new Date(),
        data: { progress },
      });
      return;
    }

    // Check for failure due to blocked issues
    if (this.config.failOnBlocked && progress.blocked > 0) {
      const openOrInProgress = progress.open + progress.inProgress;
      if (openOrInProgress === 0 && progress.blocked > 0) {
        // All remaining issues are blocked - fail
        this._status = 'failed';
        this.emit({
          type: 'failed',
          convoy: this.id,
          timestamp: new Date(),
          data: { reason: 'All remaining issues are blocked', progress },
        });
        return;
      }
    }

    // Otherwise remain active
    this._status = 'active';
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this.status,
      progress: this.getProgress(),
      issues: this.getAllIssues(),
      createdAt: this.createdAt.toISOString(),
      completedAt: this.completedAt?.toISOString(),
    };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Convoy', () => {
  let convoy: Convoy;

  beforeEach(() => {
    convoy = new Convoy({
      id: 'conv-test-001',
      name: 'Test Convoy',
      description: 'A test convoy for unit tests',
    });
  });

  afterEach(() => {
    // Cleanup
  });

  // ==========================================================================
  // Creation Tests
  // ==========================================================================

  describe('creation', () => {
    it('should create convoy with required fields', () => {
      expect(convoy.id).toBe('conv-test-001');
      expect(convoy.name).toBe('Test Convoy');
      expect(convoy.status).toBe('active');
    });

    it('should create convoy with optional description', () => {
      expect(convoy.description).toBe('A test convoy for unit tests');
    });

    it('should create convoy without description', () => {
      const minimal = new Convoy({ id: 'c1', name: 'Minimal' });
      expect(minimal.description).toBeUndefined();
    });

    it('should start with active status', () => {
      expect(convoy.status).toBe('active');
    });

    it('should start with no issues', () => {
      expect(convoy.getAllIssues()).toEqual([]);
    });

    it('should have default autoComplete enabled', () => {
      // Add issues and close them to test auto-completion
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });
      convoy.updateIssue('i1', { status: 'closed' });

      expect(convoy.status).toBe('landed');
    });
  });

  // ==========================================================================
  // Adding/Removing Issues Tests
  // ==========================================================================

  describe('adding issues', () => {
    it('should add single issue', () => {
      const issue: Issue = {
        id: 'issue-1',
        title: 'First Issue',
        status: 'open',
        priority: 1,
      };

      const result = convoy.addIssue(issue);

      expect(result).toBe(true);
      expect(convoy.getAllIssues()).toHaveLength(1);
    });

    it('should add multiple issues', () => {
      const issues: Issue[] = [
        { id: 'i1', title: 'Issue 1', status: 'open', priority: 1 },
        { id: 'i2', title: 'Issue 2', status: 'open', priority: 2 },
        { id: 'i3', title: 'Issue 3', status: 'open', priority: 3 },
      ];

      const result = convoy.addIssues(issues);

      expect(result.added).toEqual(['i1', 'i2', 'i3']);
      expect(result.failed).toEqual([]);
      expect(convoy.getAllIssues()).toHaveLength(3);
    });

    it('should reject duplicate issue', () => {
      const issue: Issue = { id: 'dup', title: 'Duplicate', status: 'open', priority: 1 };

      convoy.addIssue(issue);
      const result = convoy.addIssue(issue);

      expect(result).toBe(false);
      expect(convoy.getAllIssues()).toHaveLength(1);
    });

    it('should reject adding to cancelled convoy', () => {
      convoy.cancel();
      const result = convoy.addIssue({ id: 'new', title: 'New', status: 'open', priority: 1 });

      expect(result).toBe(false);
    });

    it('should reject adding to completed convoy', () => {
      convoy.addIssue({ id: 'i1', title: 'Issue', status: 'open', priority: 1 });
      convoy.updateIssue('i1', { status: 'closed' });

      expect(convoy.status).toBe('landed');

      const result = convoy.addIssue({ id: 'new', title: 'New', status: 'open', priority: 1 });
      expect(result).toBe(false);
    });
  });

  describe('removing issues', () => {
    it('should remove existing issue', () => {
      convoy.addIssue({ id: 'i1', title: 'Issue', status: 'open', priority: 1 });

      const result = convoy.removeIssue('i1');

      expect(result).toBe(true);
      expect(convoy.getAllIssues()).toHaveLength(0);
    });

    it('should return false for non-existent issue', () => {
      const result = convoy.removeIssue('nonexistent');

      expect(result).toBe(false);
    });

    it('should reject removal from cancelled convoy', () => {
      convoy.addIssue({ id: 'i1', title: 'Issue', status: 'open', priority: 1 });
      convoy.cancel();

      const result = convoy.removeIssue('i1');

      expect(result).toBe(false);
    });
  });

  describe('retrieving issues', () => {
    it('should get issue by id', () => {
      convoy.addIssue({ id: 'i1', title: 'Find Me', status: 'open', priority: 1 });

      const issue = convoy.getIssue('i1');

      expect(issue).toBeDefined();
      expect(issue!.title).toBe('Find Me');
    });

    it('should return undefined for non-existent issue', () => {
      const issue = convoy.getIssue('nonexistent');

      expect(issue).toBeUndefined();
    });

    it('should return copy of issue, not reference', () => {
      convoy.addIssue({ id: 'i1', title: 'Original', status: 'open', priority: 1 });

      const issue = convoy.getIssue('i1');
      issue!.title = 'Modified';

      const fresh = convoy.getIssue('i1');
      expect(fresh!.title).toBe('Original');
    });
  });

  // ==========================================================================
  // Status Calculation Tests
  // ==========================================================================

  describe('status calculation', () => {
    it('should calculate empty progress correctly', () => {
      const progress = convoy.getProgress();

      expect(progress.total).toBe(0);
      expect(progress.closed).toBe(0);
      expect(progress.inProgress).toBe(0);
      expect(progress.blocked).toBe(0);
      expect(progress.open).toBe(0);
      expect(progress.percentComplete).toBe(0);
    });

    it('should calculate progress with mixed statuses', () => {
      convoy.addIssues([
        { id: 'i1', title: 'Open', status: 'open', priority: 1 },
        { id: 'i2', title: 'In Progress', status: 'in_progress', priority: 2 },
        { id: 'i3', title: 'Closed', status: 'closed', priority: 3 },
        { id: 'i4', title: 'Blocked', status: 'blocked', priority: 4 },
      ]);

      const progress = convoy.getProgress();

      expect(progress.total).toBe(4);
      expect(progress.open).toBe(1);
      expect(progress.inProgress).toBe(1);
      expect(progress.closed).toBe(1);
      expect(progress.blocked).toBe(1);
      expect(progress.percentComplete).toBe(25);
    });

    it('should calculate 100% when all closed', () => {
      convoy.addIssues([
        { id: 'i1', title: 'A', status: 'closed', priority: 1 },
        { id: 'i2', title: 'B', status: 'closed', priority: 2 },
      ]);

      const progress = convoy.getProgress();

      expect(progress.percentComplete).toBe(100);
    });

    it('should round percentage to integer', () => {
      // Create convoy without autoComplete to avoid auto-transition
      const manualConvoy = new Convoy({
        id: 'manual',
        name: 'Manual',
        autoComplete: false,
      });

      manualConvoy.addIssues([
        { id: 'i1', title: 'A', status: 'open', priority: 1 },
        { id: 'i2', title: 'B', status: 'open', priority: 2 },
        { id: 'i3', title: 'C', status: 'open', priority: 3 },
      ]);

      // Close one of three issues
      manualConvoy.updateIssue('i1', { status: 'closed' });

      const progress = manualConvoy.getProgress();

      expect(progress.percentComplete).toBe(33); // 1/3 = 33.33... rounds to 33
    });
  });

  // ==========================================================================
  // Completion Detection Tests
  // ==========================================================================

  describe('completion detection', () => {
    it('should not be complete when empty', () => {
      expect(convoy.isComplete()).toBe(false);
    });

    it('should not be complete with open issues', () => {
      convoy.addIssue({ id: 'i1', title: 'Open', status: 'open', priority: 1 });

      expect(convoy.isComplete()).toBe(false);
    });

    it('should not be complete with in_progress issues', () => {
      convoy.addIssue({ id: 'i1', title: 'WIP', status: 'in_progress', priority: 1 });

      expect(convoy.isComplete()).toBe(false);
    });

    it('should be complete when all closed', () => {
      convoy.addIssues([
        { id: 'i1', title: 'A', status: 'closed', priority: 1 },
        { id: 'i2', title: 'B', status: 'closed', priority: 2 },
      ]);

      expect(convoy.isComplete()).toBe(true);
    });

    it('should auto-transition to landed status', () => {
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });
      convoy.updateIssue('i1', { status: 'closed' });

      expect(convoy.status).toBe('landed');
    });

    it('should not auto-complete when autoComplete is false', () => {
      const manualConvoy = new Convoy({
        id: 'manual',
        name: 'Manual',
        autoComplete: false,
      });

      manualConvoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });
      manualConvoy.updateIssue('i1', { status: 'closed' });

      expect(manualConvoy.status).toBe('active');
    });
  });

  // ==========================================================================
  // Blocker Identification Tests
  // ==========================================================================

  describe('blocker identification', () => {
    it('should return empty array when no blockers', () => {
      convoy.addIssue({ id: 'i1', title: 'Normal', status: 'open', priority: 1 });

      expect(convoy.getBlockers()).toEqual([]);
    });

    it('should identify blocked issues', () => {
      convoy.addIssues([
        { id: 'i1', title: 'Blocker', status: 'open', priority: 1 },
        { id: 'i2', title: 'Blocked', status: 'blocked', blockedBy: ['i1'], priority: 2 },
      ]);

      const blockers = convoy.getBlockers();

      expect(blockers).toHaveLength(1);
      expect(blockers[0].id).toBe('i2');
    });

    it('should get blocking chain', () => {
      convoy.addIssues([
        { id: 'i1', title: 'Root', status: 'open', priority: 1 },
        { id: 'i2', title: 'Middle', status: 'blocked', blockedBy: ['i1'], priority: 2 },
        { id: 'i3', title: 'Leaf', status: 'blocked', blockedBy: ['i2'], priority: 3 },
      ]);

      const chain = convoy.getBlockingChain('i3');

      expect(chain).toContain('i2');
      expect(chain).toContain('i1');
    });

    it('should handle circular blocking references', () => {
      convoy.addIssues([
        { id: 'i1', title: 'A', status: 'blocked', blockedBy: ['i2'], priority: 1 },
        { id: 'i2', title: 'B', status: 'blocked', blockedBy: ['i1'], priority: 2 },
      ]);

      // Should not infinite loop
      const chain = convoy.getBlockingChain('i1');

      expect(chain).toContain('i2');
    });
  });

  // ==========================================================================
  // Ready Issue Listing Tests
  // ==========================================================================

  describe('ready issue listing', () => {
    it('should return open issues without blockers', () => {
      convoy.addIssues([
        { id: 'i1', title: 'Ready', status: 'open', priority: 1 },
        { id: 'i2', title: 'In Progress', status: 'in_progress', priority: 2 },
        { id: 'i3', title: 'Closed', status: 'closed', priority: 3 },
      ]);

      const ready = convoy.getReadyIssues();

      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('i1');
    });

    it('should exclude issues with unresolved blockers', () => {
      convoy.addIssues([
        { id: 'i1', title: 'Blocker', status: 'open', priority: 1 },
        { id: 'i2', title: 'Blocked', status: 'open', blockedBy: ['i1'], priority: 2 },
      ]);

      const ready = convoy.getReadyIssues();

      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('i1');
    });

    it('should include issues when blockers are closed', () => {
      // Create convoy without autoComplete to avoid auto-transition when blocker closes
      const manualConvoy = new Convoy({
        id: 'manual',
        name: 'Manual',
        autoComplete: false,
      });

      manualConvoy.addIssues([
        { id: 'i1', title: 'Blocker', status: 'open', priority: 1 },
        { id: 'i2', title: 'Was Blocked', status: 'open', blockedBy: ['i1'], priority: 2 },
      ]);

      // Close the blocker
      manualConvoy.updateIssue('i1', { status: 'closed' });

      const ready = manualConvoy.getReadyIssues();

      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('i2');
    });

    it('should sort by priority', () => {
      convoy.addIssues([
        { id: 'i3', title: 'Low', status: 'open', priority: 3 },
        { id: 'i1', title: 'High', status: 'open', priority: 1 },
        { id: 'i2', title: 'Medium', status: 'open', priority: 2 },
      ]);

      const ready = convoy.getReadyIssues();

      expect(ready[0].id).toBe('i1');
      expect(ready[1].id).toBe('i2');
      expect(ready[2].id).toBe('i3');
    });

    it('should handle external blockers gracefully', () => {
      convoy.addIssue({
        id: 'i1',
        title: 'Blocked by external',
        status: 'open',
        blockedBy: ['external-id'], // Not in convoy
        priority: 1,
      });

      // External blocker is considered resolved (not in convoy)
      const ready = convoy.getReadyIssues();

      expect(ready).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Observer Callback Tests
  // ==========================================================================

  describe('observer callbacks', () => {
    it('should notify on issue added', () => {
      const observer = vi.fn();
      convoy.subscribe(observer);

      convoy.addIssue({ id: 'i1', title: 'New', status: 'open', priority: 1 });

      expect(observer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'issue-added',
          convoy: 'conv-test-001',
          data: { issueId: 'i1' },
        })
      );
    });

    it('should notify on issue removed', () => {
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });

      const observer = vi.fn();
      convoy.subscribe(observer);

      convoy.removeIssue('i1');

      expect(observer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'issue-removed',
          data: { issueId: 'i1' },
        })
      );
    });

    it('should notify on status change', () => {
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });

      const observer = vi.fn();
      convoy.subscribe(observer);

      convoy.updateIssue('i1', { status: 'in_progress' });

      expect(observer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status-changed',
          data: expect.objectContaining({
            issueId: 'i1',
            oldStatus: 'open',
            newStatus: 'in_progress',
          }),
        })
      );
    });

    it('should notify on completion', () => {
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });

      const observer = vi.fn();
      convoy.subscribe(observer);

      convoy.updateIssue('i1', { status: 'closed' });

      expect(observer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'completed',
        })
      );
    });

    it('should notify on cancellation', () => {
      const observer = vi.fn();
      convoy.subscribe(observer);

      convoy.cancel('User requested');

      expect(observer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cancelled',
          data: { reason: 'User requested' },
        })
      );
    });

    it('should allow unsubscribe', () => {
      const observer = vi.fn();
      const unsubscribe = convoy.subscribe(observer);

      unsubscribe();
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });

      expect(observer).not.toHaveBeenCalled();
    });

    it('should handle observer errors gracefully', () => {
      const badObserver = vi.fn().mockImplementation(() => {
        throw new Error('Observer error');
      });
      const goodObserver = vi.fn();

      convoy.subscribe(badObserver);
      convoy.subscribe(goodObserver);

      // Should not throw
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });

      expect(goodObserver).toHaveBeenCalled();
    });

    it('should include timestamp in events', () => {
      const observer = vi.fn();
      convoy.subscribe(observer);

      const before = new Date();
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });
      const after = new Date();

      const event = observer.mock.calls[0][0];
      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ==========================================================================
  // Cancellation Tests
  // ==========================================================================

  describe('cancellation', () => {
    it('should cancel active convoy', () => {
      const result = convoy.cancel();

      expect(result).toBe(true);
      expect(convoy.status).toBe('cancelled');
      expect(convoy.isCancelled).toBe(true);
    });

    it('should not cancel already cancelled convoy', () => {
      convoy.cancel();
      const result = convoy.cancel();

      expect(result).toBe(false);
    });

    it('should not cancel completed convoy', () => {
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });
      convoy.updateIssue('i1', { status: 'closed' });

      const result = convoy.cancel();

      expect(result).toBe(false);
    });

    it('should prevent modifications after cancel', () => {
      convoy.cancel();

      expect(convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 })).toBe(false);
    });

    it('should include cancel reason in event', () => {
      const observer = vi.fn();
      convoy.subscribe(observer);

      convoy.cancel('Budget exceeded');

      expect(observer).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { reason: 'Budget exceeded' },
        })
      );
    });
  });

  // ==========================================================================
  // Pause/Resume Tests
  // ==========================================================================

  describe('pause and resume', () => {
    it('should pause active convoy', () => {
      const result = convoy.pause();

      expect(result).toBe(true);
      expect(convoy.status).toBe('paused');
    });

    it('should resume paused convoy', () => {
      convoy.pause();
      const result = convoy.resume();

      expect(result).toBe(true);
      expect(convoy.status).toBe('active');
    });

    it('should not pause cancelled convoy', () => {
      convoy.cancel();
      const result = convoy.pause();

      expect(result).toBe(false);
    });

    it('should not resume active convoy', () => {
      const result = convoy.resume();

      expect(result).toBe(false);
    });

    it('should not auto-complete while paused', () => {
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });
      convoy.pause();

      convoy.updateIssue('i1', { status: 'closed' });

      expect(convoy.status).toBe('paused');
    });

    it('should check completion on resume', () => {
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });
      convoy.pause();
      convoy.updateIssue('i1', { status: 'closed' });
      convoy.resume();

      expect(convoy.status).toBe('landed');
    });
  });

  // ==========================================================================
  // Serialization Tests
  // ==========================================================================

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });

      const json = convoy.toJSON();

      expect(json.id).toBe('conv-test-001');
      expect(json.name).toBe('Test Convoy');
      expect(json.status).toBe('active');
      expect(json.progress).toEqual({
        total: 1,
        closed: 0,
        inProgress: 0,
        blocked: 0,
        open: 1,
        percentComplete: 0,
      });
      expect((json.issues as Issue[])).toHaveLength(1);
    });

    it('should include dates in ISO format', () => {
      const json = convoy.toJSON();

      expect(typeof json.createdAt).toBe('string');
      expect(() => new Date(json.createdAt as string)).not.toThrow();
    });

    it('should include completedAt for landed convoys', () => {
      convoy.addIssue({ id: 'i1', title: 'Test', status: 'open', priority: 1 });
      convoy.updateIssue('i1', { status: 'closed' });

      const json = convoy.toJSON();

      expect(json.completedAt).toBeDefined();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle updating non-existent issue', () => {
      const result = convoy.updateIssue('nonexistent', { status: 'closed' });

      expect(result).toBe(false);
    });

    it('should handle empty issue list operations', () => {
      expect(convoy.getProgress().total).toBe(0);
      expect(convoy.getBlockers()).toEqual([]);
      expect(convoy.getReadyIssues()).toEqual([]);
      expect(convoy.isComplete()).toBe(false);
    });

    it('should preserve issue data integrity', () => {
      const original: Issue = {
        id: 'i1',
        title: 'Original Title',
        status: 'open',
        priority: 1,
        assignee: 'alice',
        blockedBy: ['other'],
        blocks: ['downstream'],
      };

      convoy.addIssue(original);
      const retrieved = convoy.getIssue('i1');

      expect(retrieved).toEqual(original);
    });

    it('should handle failOnBlocked configuration', () => {
      const failingConvoy = new Convoy({
        id: 'fail-convoy',
        name: 'Fail on Blocked',
        autoComplete: false,
        failOnBlocked: true,
      });

      failingConvoy.addIssues([
        { id: 'i1', title: 'Blocked', status: 'blocked', priority: 1 },
      ]);

      // When all remaining are blocked, should fail
      expect(failingConvoy.status).toBe('failed');
    });

    it('should not fail when there are open issues alongside blocked', () => {
      const failingConvoy = new Convoy({
        id: 'fail-convoy',
        name: 'Mixed',
        failOnBlocked: true,
      });

      failingConvoy.addIssues([
        { id: 'i1', title: 'Open', status: 'open', priority: 1 },
        { id: 'i2', title: 'Blocked', status: 'blocked', priority: 2 },
      ]);

      expect(failingConvoy.status).toBe('active');
    });
  });
});
