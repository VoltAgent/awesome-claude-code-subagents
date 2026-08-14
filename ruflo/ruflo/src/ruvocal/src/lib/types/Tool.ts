export enum ToolResultStatus {
	Success = "success",
	Error = "error",
}

export interface ToolCall {
	name: string;
	parameters: Record<string, string | number | boolean>;
	toolId?: string;
}

export interface ToolResultSuccess {
	status: ToolResultStatus.Success;
	call: ToolCall;
	outputs: Record<string, unknown>[];
	display?: boolean;
}

export interface ToolResultError {
	status: ToolResultStatus.Error;
	call: ToolCall;
	message: string;
	display?: boolean;
}

export type ToolResult = ToolResultSuccess | ToolResultError;

export interface ToolFront {
	_id: string;
	name: string;
	displayName?: string;
	description?: string;
	color?: string;
	icon?: string;
	type?: "config" | "community";
	isOnByDefault?: boolean;
	isLocked?: boolean;
	mimeTypes?: string[];
	timeToUseMS?: number;
}

// MCP Server types
export interface KeyValuePair {
	key: string;
	value: string;
}

export type ServerStatus = "connected" | "connecting" | "disconnected" | "error";

export interface MCPTool {
	name: string;
	description?: string;
	inputSchema?: unknown;
}

export interface MCPServer {
	id: string;
	name: string;
	url: string;
	type: "base" | "custom" | "wasm";
	headers?: KeyValuePair[];
	env?: KeyValuePair[];
	status?: ServerStatus;
	isLocked?: boolean;
	tools?: MCPTool[];
	errorMessage?: string;
	// Indicates server reports or appears to require OAuth or other auth
	authRequired?: boolean;
	// For WASM servers: active template info
	wasmTemplateId?: string;
	wasmTemplateName?: string;
}

export interface MCPServerApi {
	url: string;
	headers?: KeyValuePair[];
}
