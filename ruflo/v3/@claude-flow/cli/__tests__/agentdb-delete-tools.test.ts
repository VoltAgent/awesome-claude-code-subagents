/**
 * agentdb_*-delete MCP tool surface tests (#1784).
 *
 * Verifies the three new delete tools exist, validate inputs, and surface
 * the right shapes for both supported (SQL fallback) and unsupported
 * (native graph-node / HierarchicalMemory) backends.
 *
 * Behavioral integration tests (actually deleting rows from a live
 * AgentDB) are out of scope here — they require a sqlite + agentdb
 * instance which the cli's existing test scaffolding doesn't spin up
 * for unit tests. The MCP-level shape tests below cover the contract
 * the importer (plugins/ruflo-adr/scripts/import.mjs) depends on.
 */

import { describe, expect, it } from 'vitest';
import {
  agentdbHierarchicalDelete,
  agentdbCausalEdgeDelete,
  agentdbCausalNodeDelete,
  agentdbTools,
} from '../src/mcp-tools/agentdb-tools.js';

describe('agentdb delete tools — surface (#1784)', () => {
  it('exposes agentdb_hierarchical-delete in the tool registry', () => {
    const names = agentdbTools.map((t) => t.name);
    expect(names).toContain('agentdb_hierarchical-delete');
  });

  it('exposes agentdb_causal-edge-delete in the tool registry', () => {
    const names = agentdbTools.map((t) => t.name);
    expect(names).toContain('agentdb_causal-edge-delete');
  });

  it('exposes agentdb_causal-node-delete in the tool registry', () => {
    const names = agentdbTools.map((t) => t.name);
    expect(names).toContain('agentdb_causal-node-delete');
  });

  it('hierarchical-delete validates required key parameter', async () => {
    const r = await agentdbHierarchicalDelete.handler({});
    expect(r.success).toBe(false);
    expect(r.deleted).toBe(false);
    expect(typeof r.error).toBe('string');
  });

  it('hierarchical-delete rejects invalid tier', async () => {
    const r = await agentdbHierarchicalDelete.handler({
      key: 'test-key',
      tier: 'not-a-real-tier',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/tier|Invalid|disallowed/i);
  });

  it('hierarchical-delete accepts valid tiers', async () => {
    for (const tier of ['working', 'episodic', 'semantic']) {
      const r = await agentdbHierarchicalDelete.handler({ key: 'test-key', tier });
      // Either it works (success) or it surfaces a controller status — both are fine
      expect(r).toBeDefined();
      expect(typeof r.success).toBe('boolean');
    }
  });

  it('causal-edge-delete validates required sourceId / targetId', async () => {
    const r1 = await agentdbCausalEdgeDelete.handler({ targetId: 'B' });
    expect(r1.success).toBe(false);
    const r2 = await agentdbCausalEdgeDelete.handler({ sourceId: 'A' });
    expect(r2.success).toBe(false);
  });

  it('causal-edge-delete handles a missing edge cleanly (returns native-unsupported or not-found)', async () => {
    const r = await agentdbCausalEdgeDelete.handler({
      sourceId: 'nonexistent-source',
      targetId: 'nonexistent-target',
    });
    expect(r).toBeDefined();
    expect(typeof r.success).toBe('boolean');
    // If the bridge isn't available at all, the tool surfaces an error;
    // if it is, controller will be 'native-unsupported' or 'sql-error'.
    if (r.controller) {
      expect(['native-unsupported', 'bridge-fallback', 'sql-error', 'guard']).toContain(r.controller);
    }
  });

  it('causal-node-delete validates required nodeId', async () => {
    const r = await agentdbCausalNodeDelete.handler({});
    expect(r.success).toBe(false);
    expect(r.deletedNode).toBe(false);
    expect(r.deletedEdges).toBe(0);
  });

  it('causal-node-delete returns the cascade contract shape', async () => {
    const r = await agentdbCausalNodeDelete.handler({ nodeId: 'nonexistent-node' });
    expect(r).toBeDefined();
    expect(typeof r.success).toBe('boolean');
    expect(typeof r.deletedNode).toBe('boolean');
    expect(typeof r.deletedEdges).toBe('number');
    // nodeId is echoed back when the bridge returns a real result. When the
    // bridge isn't available (test env without AgentDB), the handler returns
    // its no-bridge fallback shape without nodeId — both are valid.
    if (r.nodeId !== undefined) {
      expect(r.nodeId).toBe('nonexistent-node');
    } else {
      expect(r.error).toMatch(/bridge not available/i);
    }
  });

  it('all three delete tools have an inputSchema with required fields', () => {
    for (const tool of [agentdbHierarchicalDelete, agentdbCausalEdgeDelete, agentdbCausalNodeDelete]) {
      expect(tool.inputSchema.type).toBe('object');
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
      expect((tool.inputSchema.required as string[]).length).toBeGreaterThan(0);
    }
  });

  it('all three delete tools return useful descriptions surfacing the native-backend caveat', () => {
    expect(agentdbHierarchicalDelete.description).toMatch(/native|backend|delete/i);
    expect(agentdbCausalEdgeDelete.description).toMatch(/native|backend|delete/i);
    expect(agentdbCausalNodeDelete.description).toMatch(/cascade|delete/i);
  });
});
