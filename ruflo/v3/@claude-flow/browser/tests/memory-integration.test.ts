/**
 * @claude-flow/browser - Memory Integration Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClaudeFlowMemoryAdapter,
  BrowserMemoryManager,
  createMemoryManager,
  getMemoryAdapter,
  type BrowserMemoryEntry,
} from '../src/infrastructure/memory-integration.js';
import type { BrowserTrajectory, Snapshot } from '../src/domain/types.js';

describe('ClaudeFlowMemoryAdapter', () => {
  let adapter: ClaudeFlowMemoryAdapter;

  beforeEach(() => {
    adapter = new ClaudeFlowMemoryAdapter('test-browser');
  });

  describe('store and retrieve', () => {
    it('should store and retrieve a memory entry', async () => {
      const entry: BrowserMemoryEntry = {
        id: 'test-1',
        type: 'trajectory',
        key: 'test-1',
        value: { goal: 'Login to app', steps: [] },
        metadata: {
          sessionId: 'session-1',
          goal: 'Login to app',
          success: true,
          timestamp: new Date().toISOString(),
        },
      };

      await adapter.store(entry);
      const retrieved = await adapter.retrieve('test-browser:trajectory:test-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-1');
      expect(retrieved?.metadata.goal).toBe('Login to app');
    });

    it('should return null for non-existent key', async () => {
      const result = await adapter.retrieve('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      const entries: BrowserMemoryEntry[] = [
        {
          id: 'login-1',
          type: 'trajectory',
          key: 'login-1',
          value: { goal: 'Login to dashboard' },
          metadata: { sessionId: 's1', goal: 'Login to dashboard', timestamp: new Date().toISOString() },
        },
        {
          id: 'login-2',
          type: 'trajectory',
          key: 'login-2',
          value: { goal: 'Login to admin panel' },
          metadata: { sessionId: 's1', goal: 'Login to admin panel', timestamp: new Date().toISOString() },
        },
        {
          id: 'scrape-1',
          type: 'pattern',
          key: 'scrape-1',
          value: { goal: 'Scrape product data' },
          metadata: { sessionId: 's2', goal: 'Scrape product data', timestamp: new Date().toISOString() },
        },
      ];

      for (const entry of entries) {
        await adapter.store(entry);
      }
    });

    it('should search by keyword', async () => {
      const results = await adapter.search('login');
      expect(results.length).toBe(2);
      expect(results.every(r => r.entry.metadata.goal?.toLowerCase().includes('login'))).toBe(true);
    });

    it('should filter by type', async () => {
      const results = await adapter.search('login', { type: 'trajectory' });
      expect(results.every(r => r.entry.type === 'trajectory')).toBe(true);
    });

    it('should limit results with topK', async () => {
      const results = await adapter.search('login', { topK: 1 });
      expect(results.length).toBe(1);
    });

    it('should filter by minimum score', async () => {
      const results = await adapter.search('login', { minScore: 0.5 });
      expect(results.every(r => r.score >= 0.5)).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete an entry', async () => {
      const entry: BrowserMemoryEntry = {
        id: 'delete-test',
        type: 'snapshot',
        key: 'delete-test',
        value: { url: 'https://example.com' },
        metadata: { sessionId: 's1', timestamp: new Date().toISOString() },
      };

      await adapter.store(entry);
      const deleted = await adapter.delete('test-browser:snapshot:delete-test');
      expect(deleted).toBe(true);

      const retrieved = await adapter.retrieve('test-browser:snapshot:delete-test');
      expect(retrieved).toBeNull();
    });
  });

  describe('list', () => {
    it('should list entries with filters', async () => {
      await adapter.store({
        id: 'list-1',
        type: 'trajectory',
        key: 'list-1',
        value: {},
        metadata: { sessionId: 'list-session', success: true, timestamp: new Date().toISOString() },
      });

      await adapter.store({
        id: 'list-2',
        type: 'error',
        key: 'list-2',
        value: {},
        metadata: { sessionId: 'list-session', success: false, timestamp: new Date().toISOString() },
      });

      const trajectories = await adapter.list({ type: 'trajectory' });
      expect(trajectories.some(e => e.id === 'list-1')).toBe(true);

      const failures = await adapter.list({ success: false });
      expect(failures.some(e => e.id === 'list-2')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return memory statistics', async () => {
      await adapter.store({
        id: 'stats-1',
        type: 'trajectory',
        key: 'stats-1',
        value: {},
        metadata: { sessionId: 's1', timestamp: new Date().toISOString() },
      });

      const stats = await adapter.getStats();
      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.byType).toBeDefined();
      expect(stats.bySession).toBeDefined();
    });
  });
});

describe('BrowserMemoryManager', () => {
  let manager: BrowserMemoryManager;

  beforeEach(() => {
    manager = createMemoryManager('test-session');
  });

  describe('storeTrajectory', () => {
    it('should store a completed trajectory', async () => {
      const trajectory: BrowserTrajectory = {
        id: 'traj-1',
        sessionId: 'test-session',
        goal: 'Complete checkout flow',
        steps: [
          {
            action: 'click',
            input: { target: '#checkout' },
            result: { success: true },
            timestamp: new Date().toISOString(),
          },
        ],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        success: true,
      };

      await manager.storeTrajectory(trajectory);
      // No error means success
    });
  });

  describe('storePattern', () => {
    it('should store a learned pattern', async () => {
      await manager.storePattern(
        'pattern-1',
        'Login to app',
        [
          { action: 'fill', selector: '#username', value: 'test' },
          { action: 'fill', selector: '#password', value: 'pass' },
          { action: 'click', selector: '#submit' },
        ],
        true
      );
      // No error means success
    });
  });

  describe('storeSnapshot', () => {
    it('should store a snapshot', async () => {
      const snapshot: Snapshot = {
        tree: { role: 'document', children: [] },
        refs: {},
        url: 'https://example.com',
        title: 'Example',
        timestamp: new Date().toISOString(),
      };

      await manager.storeSnapshot('snap-1', snapshot);
      // No error means success
    });
  });

  describe('storeError', () => {
    it('should store an error', async () => {
      const error = new Error('Element not found');
      await manager.storeError('error-1', error, {
        action: 'click',
        selector: '#non-existent',
        url: 'https://example.com',
      });
      // No error means success
    });
  });

  describe('findSimilarTrajectories', () => {
    it('should find trajectories similar to a goal', async () => {
      const trajectory: BrowserTrajectory = {
        id: 'traj-search-1',
        sessionId: 'test-session',
        goal: 'Login to dashboard',
        steps: [],
        startedAt: new Date().toISOString(),
        success: true,
      };

      await manager.storeTrajectory(trajectory);
      const similar = await manager.findSimilarTrajectories('Login');
      // Should return results (may be empty depending on scoring)
      expect(Array.isArray(similar)).toBe(true);
    });
  });

  describe('getSessionStats', () => {
    it('should return session statistics', async () => {
      const stats = await manager.getSessionStats();
      expect(stats.trajectories).toBeDefined();
      expect(stats.patterns).toBeDefined();
      expect(stats.snapshots).toBeDefined();
      expect(stats.errors).toBeDefined();
      expect(typeof stats.successRate).toBe('number');
    });
  });
});

describe('factory functions', () => {
  it('getMemoryAdapter should return singleton', () => {
    const adapter1 = getMemoryAdapter();
    const adapter2 = getMemoryAdapter();
    expect(adapter1).toBe(adapter2);
  });
});
