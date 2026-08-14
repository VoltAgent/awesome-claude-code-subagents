/**
 * Regression test for #1567: validateAgentSpawn's Zod call was passing
 * `{ agentType, name }` to `@claude-flow/security`'s SpawnAgentSchema, which
 * expects `{ type, id }` — so every call failed with "type: Required" and
 * the MCP agent_spawn tool returned an input validation error for every
 * possible input. The fix aligns the field names AND swallows
 * `invalid_enum_value` errors so custom agent types (beyond the 15-type
 * hardcoded enum) continue to work.
 */

import { describe, it, expect } from 'vitest';
import { validateAgentSpawn } from '../src/mcp-tools/validate-input.js';

describe('validateAgentSpawn (#1567)', () => {
  it('accepts a built-in agent type like "tester"', async () => {
    const r = await validateAgentSpawn({ agentType: 'tester', agentId: 'tester-1' });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('accepts a custom agent type not in the SpawnAgentSchema enum', async () => {
    // "memory-specialist" is not one of the 15 types that
    // @claude-flow/security's AgentTypeSchema enumerates, but it's a valid
    // Claude Flow agent type and should NOT be rejected.
    const r = await validateAgentSpawn({ agentType: 'memory-specialist', agentId: 'mem-1' });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('still rejects an agentId with invalid characters', async () => {
    const r = await validateAgentSpawn({
      agentType: 'tester',
      agentId: 'has spaces and $pecials',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('does not require the domain field', async () => {
    const r = await validateAgentSpawn({ agentType: 'coder', agentId: 'c1' });
    expect(r.valid).toBe(true);
  });
});
