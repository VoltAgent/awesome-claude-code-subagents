/**
 * MCP tool definitions exposed by cli-core (alpha.2).
 *
 * These are pure data — name, description, inputSchema only. No handlers.
 *
 * Consumer pattern: an MCP server backed by cli-core registers these
 * definitions with `tools/list`; when the model invokes one, the server
 * dynamic-imports the handler from @claude-flow/cli (or wires its own
 * cli-core-local handler). cli-core stays small because it never imports
 * the heavy handler chain unless the user asks for it.
 */

export type { MCPToolDef } from './memory-defs.js';
export { memoryToolDefs } from './memory-defs.js';
export { hooksToolDefs } from './hooks-defs.js';
export type { MCPTool, MCPToolInputSchema, MCPToolResult } from './types.js';
export * as validateInput from './validate-input.js';

import { memoryToolDefs } from './memory-defs.js';
import { hooksToolDefs } from './hooks-defs.js';

/**
 * Convenience: every MCPTool definition cli-core ships, in one array.
 * Suitable for direct registration with an MCP `tools/list` response.
 */
export const allToolDefs = [...memoryToolDefs, ...hooksToolDefs];
