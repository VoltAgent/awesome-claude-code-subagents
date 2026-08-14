/**
 * Collection Manager Tests
 *
 * Tests for plugin collection management, activation/deactivation,
 * and state persistence.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PluginCollectionManager,
  type PluginCollection,
  type PluginCollectionEntry,
  type CollectionManagerState,
} from '../src/collections/collection-manager.js';
import { PluginBuilder } from '../src/sdk/index.js';
import { EnhancedPluginRegistry } from '../src/registry/enhanced-plugin-registry.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestPlugin(name: string, version = '1.0.0') {
  return new PluginBuilder(name, version)
    .withDescription(`Test plugin: ${name}`)
    .build();
}

function createTestCollection(
  id: string,
  plugins: Array<{ name: string; defaultEnabled: boolean }>
): PluginCollection {
  return {
    id,
    name: `Test Collection: ${id}`,
    version: '1.0.0',
    plugins: plugins.map(p => ({
      plugin: createTestPlugin(p.name),
      defaultEnabled: p.defaultEnabled,
      category: 'utility' as const,
      tags: ['test'],
    })),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('PluginCollectionManager', () => {
  let registry: EnhancedPluginRegistry;
  let manager: PluginCollectionManager;

  beforeEach(() => {
    registry = new EnhancedPluginRegistry({
      coreVersion: '3.0.0',
      dataDir: '/tmp/test',
    });
    manager = new PluginCollectionManager({
      registry,
      autoInitialize: false, // Don't auto-init for tests
    });
  });

  describe('loadCollection', () => {
    it('should load a collection', async () => {
      const collection = createTestCollection('test-collection', [
        { name: 'plugin-a', defaultEnabled: true },
        { name: 'plugin-b', defaultEnabled: false },
      ]);

      await manager.loadCollection(collection);

      expect(manager.getCollection('test-collection')).toBeDefined();
      expect(manager.listCollections()).toHaveLength(1);
    });

    it('should register enabled plugins', async () => {
      const collection = createTestCollection('test-collection', [
        { name: 'plugin-a', defaultEnabled: true },
        { name: 'plugin-b', defaultEnabled: false },
      ]);

      await manager.loadCollection(collection);

      expect(registry.getPlugin('plugin-a')).toBeDefined();
      expect(registry.getPlugin('plugin-b')).toBeUndefined();
    });

    it('should reject duplicate collection IDs', async () => {
      const collection = createTestCollection('test-collection', []);

      await manager.loadCollection(collection);

      await expect(manager.loadCollection(collection))
        .rejects.toThrow('already loaded');
    });
  });

  describe('unloadCollection', () => {
    it('should unload a collection and its plugins', async () => {
      const collection = createTestCollection('test-collection', [
        { name: 'plugin-a', defaultEnabled: true },
      ]);

      await manager.loadCollection(collection);
      await manager.unloadCollection('test-collection');

      expect(manager.getCollection('test-collection')).toBeUndefined();
      expect(registry.getPlugin('plugin-a')).toBeUndefined();
    });

    it('should throw for non-existent collection', async () => {
      await expect(manager.unloadCollection('non-existent'))
        .rejects.toThrow('not found');
    });
  });

  describe('enablePlugin', () => {
    it('should enable a disabled plugin', async () => {
      const collection = createTestCollection('test-collection', [
        { name: 'plugin-a', defaultEnabled: false },
      ]);

      await manager.loadCollection(collection);
      await manager.enablePlugin('test-collection', 'plugin-a');

      expect(await manager.isEnabled('test-collection', 'plugin-a')).toBe(true);
      expect(registry.getPlugin('plugin-a')).toBeDefined();
    });

    it('should throw for non-existent plugin', async () => {
      const collection = createTestCollection('test-collection', []);

      await manager.loadCollection(collection);

      await expect(manager.enablePlugin('test-collection', 'non-existent'))
        .rejects.toThrow('not found');
    });
  });

  describe('disablePlugin', () => {
    it('should disable an enabled plugin', async () => {
      const collection = createTestCollection('test-collection', [
        { name: 'plugin-a', defaultEnabled: true },
      ]);

      await manager.loadCollection(collection);
      await manager.disablePlugin('test-collection', 'plugin-a');

      expect(await manager.isEnabled('test-collection', 'plugin-a')).toBe(false);
    });
  });

  describe('togglePlugin', () => {
    it('should toggle plugin state', async () => {
      const collection = createTestCollection('test-collection', [
        { name: 'plugin-a', defaultEnabled: true },
      ]);

      await manager.loadCollection(collection);

      const newState1 = await manager.togglePlugin('test-collection', 'plugin-a');
      expect(newState1).toBe(false);

      const newState2 = await manager.togglePlugin('test-collection', 'plugin-a');
      expect(newState2).toBe(true);
    });
  });

  describe('bulk operations', () => {
    it('should enable all plugins', async () => {
      const collection = createTestCollection('test-collection', [
        { name: 'plugin-a', defaultEnabled: false },
        { name: 'plugin-b', defaultEnabled: false },
      ]);

      await manager.loadCollection(collection);
      await manager.enableAll('test-collection');

      expect(await manager.isEnabled('test-collection', 'plugin-a')).toBe(true);
      expect(await manager.isEnabled('test-collection', 'plugin-b')).toBe(true);
    });

    it('should disable all plugins', async () => {
      const collection = createTestCollection('test-collection', [
        { name: 'plugin-a', defaultEnabled: true },
        { name: 'plugin-b', defaultEnabled: true },
      ]);

      await manager.loadCollection(collection);
      await manager.disableAll('test-collection');

      expect(await manager.isEnabled('test-collection', 'plugin-a')).toBe(false);
      expect(await manager.isEnabled('test-collection', 'plugin-b')).toBe(false);
    });
  });

  describe('filtering', () => {
    it('should get plugins by category', async () => {
      const collection: PluginCollection = {
        id: 'test-collection',
        name: 'Test',
        version: '1.0.0',
        plugins: [
          { plugin: createTestPlugin('tool-1'), defaultEnabled: true, category: 'tool', tags: [] },
          { plugin: createTestPlugin('agent-1'), defaultEnabled: true, category: 'agent', tags: [] },
          { plugin: createTestPlugin('tool-2'), defaultEnabled: true, category: 'tool', tags: [] },
        ],
      };

      await manager.loadCollection(collection);

      const tools = manager.getPluginsByCategory('tool');
      expect(tools).toHaveLength(2);
    });

    it('should get plugins by tag', async () => {
      const collection: PluginCollection = {
        id: 'test-collection',
        name: 'Test',
        version: '1.0.0',
        plugins: [
          { plugin: createTestPlugin('plugin-1'), defaultEnabled: true, category: 'utility', tags: ['core'] },
          { plugin: createTestPlugin('plugin-2'), defaultEnabled: true, category: 'utility', tags: ['optional'] },
          { plugin: createTestPlugin('plugin-3'), defaultEnabled: true, category: 'utility', tags: ['core', 'important'] },
        ],
      };

      await manager.loadCollection(collection);

      const corePlugins = manager.getPluginsByTag('core');
      expect(corePlugins).toHaveLength(2);
    });

    it('should search plugins by name', async () => {
      const collection = createTestCollection('test-collection', [
        { name: 'auth-plugin', defaultEnabled: true },
        { name: 'cache-plugin', defaultEnabled: true },
        { name: 'auth-helper', defaultEnabled: true },
      ]);

      await manager.loadCollection(collection);

      const results = await manager.searchPlugins('auth');
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0].pluginName).toContain('auth');
    });
  });

  describe('settings', () => {
    it('should get and set plugin settings', () => {
      manager.setPluginSettings('plugin-a', { debug: true, maxRetries: 3 });

      const settings = manager.getPluginSettings('plugin-a');
      expect(settings).toEqual({ debug: true, maxRetries: 3 });
    });

    it('should update plugin settings', () => {
      manager.setPluginSettings('plugin-a', { debug: true, maxRetries: 3 });
      manager.updatePluginSettings('plugin-a', { maxRetries: 5, timeout: 1000 });

      const settings = manager.getPluginSettings('plugin-a');
      expect(settings).toEqual({ debug: true, maxRetries: 5, timeout: 1000 });
    });

    it('should return empty object for unknown plugin', () => {
      const settings = manager.getPluginSettings('unknown');
      expect(settings).toEqual({});
    });
  });

  describe('state persistence', () => {
    it('should export state', async () => {
      const collection = createTestCollection('test-collection', [
        { name: 'plugin-a', defaultEnabled: true },
        { name: 'plugin-b', defaultEnabled: false },
      ]);

      await manager.loadCollection(collection);
      await manager.disablePlugin('test-collection', 'plugin-a');
      manager.setPluginSettings('plugin-a', { custom: true });

      const state = manager.exportState();

      expect(state.version).toBe('1.0.0');
      expect(state.collections).toContain('test-collection');
      expect(state.disabledPlugins['test-collection']).toContain('plugin-a');
      expect(state.pluginSettings['plugin-a']).toEqual({ custom: true });
    });

    it('should import state', async () => {
      const state: CollectionManagerState = {
        version: '1.0.0',
        collections: ['test-collection'],
        enabledPlugins: { 'test-collection': ['plugin-b'] },
        disabledPlugins: { 'test-collection': ['plugin-a'] },
        pluginSettings: { 'plugin-a': { imported: true } },
      };

      manager.importState(state);

      expect(manager.getPluginSettings('plugin-a')).toEqual({ imported: true });
    });
  });

  describe('statistics', () => {
    it('should return correct stats', async () => {
      const collection: PluginCollection = {
        id: 'test-collection',
        name: 'Test',
        version: '1.0.0',
        plugins: [
          { plugin: createTestPlugin('tool-1'), defaultEnabled: true, category: 'tool', tags: [] },
          { plugin: createTestPlugin('agent-1'), defaultEnabled: false, category: 'agent', tags: [] },
          { plugin: createTestPlugin('hook-1'), defaultEnabled: true, category: 'hook', tags: [] },
        ],
      };

      await manager.loadCollection(collection);

      const stats = await manager.getStats();

      expect(stats.totalCollections).toBe(1);
      expect(stats.totalPlugins).toBe(3);
      expect(stats.enabledPlugins).toBe(2);
      expect(stats.disabledPlugins).toBe(1);
      expect(stats.byCategory.tool).toBe(1);
      expect(stats.byCategory.agent).toBe(1);
      expect(stats.byCategory.hook).toBe(1);
    });
  });
});
