/**
 * MCP Tool Types for CLI
 *
 * Local type definitions to avoid external imports outside package boundary.
 */

export interface MCPToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * Returns the effective project working directory.
 * Prefers CLAUDE_FLOW_CWD (set by the install script for global/MCP installs
 * where process.cwd() may resolve to '/') over the real process.cwd().
 */
export function getProjectCwd(): string {
  const envCwd = process.env.CLAUDE_FLOW_CWD;
  if (envCwd && envCwd !== '/' && envCwd !== process.env.HOME) {
    return envCwd;
  }
  return process.cwd();
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
  category?: string;
  tags?: string[];
  version?: string;
  cacheable?: boolean;
  cacheTTL?: number;
  handler: (input: Record<string, unknown>, context?: Record<string, unknown>) => Promise<MCPToolResult | unknown>;
}
