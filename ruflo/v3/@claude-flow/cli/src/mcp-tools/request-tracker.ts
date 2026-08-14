/**
 * MCP Request Tracker
 * Lightweight counter for tracking MCP tool invocations.
 * Used by system_metrics to report real request counts.
 */

interface RequestCounts {
  total: number;
  success: number;
  errors: number;
  byTool: Record<string, number>;
  startedAt: string;
}

let counts: RequestCounts = {
  total: 0,
  success: 0,
  errors: 0,
  byTool: {},
  startedAt: new Date().toISOString(),
};

export function trackRequest(toolName: string, success: boolean): void {
  counts.total++;
  if (success) counts.success++;
  else counts.errors++;
  counts.byTool[toolName] = (counts.byTool[toolName] || 0) + 1;
}

export function getRequestCounts(): RequestCounts {
  return { ...counts };
}

export function resetRequestCounts(): void {
  counts = { total: 0, success: 0, errors: 0, byTool: {}, startedAt: new Date().toISOString() };
}
