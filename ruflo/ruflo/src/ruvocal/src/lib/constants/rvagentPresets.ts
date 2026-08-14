/**
 * rvAgent MCP Server Presets
 *
 * Pre-configured server configurations for the rvagent-mcp server
 * with different tool group combinations. These presets correspond
 * to the tool groups defined in ADR-112.
 *
 * Tool Groups:
 * - file: read, write, edit, ls, glob, grep
 * - shell: execute, bash
 * - memory: semantic_search, store, retrieve
 * - agent: spawn, status, orchestrate
 * - git: status, commit, diff, log
 * - web: fetch, search
 * - brain: search, share, vote (π Brain)
 * - task: create, list, complete
 * - core: ping, initialize (always included)
 */

export interface RvAgentPreset {
	/** Unique identifier for the preset */
	id: string;
	/** Display name */
	name: string;
	/** Short description */
	description: string;
	/** Tool groups to enable */
	groups: string[];
	/** Default port (user can override) */
	defaultPort: number;
	/** Icon/emoji for display */
	icon: string;
	/** Recommended use cases */
	useCases: string[];
}

/**
 * Pre-configured rvagent-mcp presets for common use cases
 */
export const RVAGENT_PRESETS: RvAgentPreset[] = [
	{
		id: "all-tools",
		name: "All Tools",
		description: "Full access to all 46+ rvAgent tools",
		groups: ["all"],
		defaultPort: 9000,
		icon: "🔧",
		useCases: ["Development", "Testing", "Full automation"],
	},
	{
		id: "file-shell",
		name: "File & Shell",
		description: "File operations and command execution",
		groups: ["file", "shell"],
		defaultPort: 9001,
		icon: "📂",
		useCases: ["Code editing", "Build scripts", "File management"],
	},
	{
		id: "memory-agent",
		name: "Memory & Agent",
		description: "Vector memory and multi-agent orchestration",
		groups: ["memory", "agent"],
		defaultPort: 9002,
		icon: "🧠",
		useCases: ["Knowledge retrieval", "Agent coordination", "RAG"],
	},
	{
		id: "git-web",
		name: "Git & Web",
		description: "Version control and web operations",
		groups: ["git", "web"],
		defaultPort: 9003,
		icon: "🌐",
		useCases: ["Code review", "Research", "Documentation"],
	},
	{
		id: "brain-task",
		name: "Brain & Tasks",
		description: "π Brain integration and task management",
		groups: ["brain", "task"],
		defaultPort: 9004,
		icon: "🎯",
		useCases: ["Knowledge sharing", "Task tracking", "Collaboration"],
	},
	{
		id: "dev-minimal",
		name: "Dev Minimal",
		description: "Essential development tools only",
		groups: ["file", "shell", "git"],
		defaultPort: 9005,
		icon: "💻",
		useCases: ["Quick edits", "Simple scripts", "Git operations"],
	},
	{
		id: "research",
		name: "Research Mode",
		description: "Memory, web search, and brain tools",
		groups: ["memory", "web", "brain"],
		defaultPort: 9006,
		icon: "🔬",
		useCases: ["Research", "Knowledge discovery", "Analysis"],
	},
	{
		id: "orchestration",
		name: "Orchestration",
		description: "Agent spawning and task coordination",
		groups: ["agent", "task", "memory"],
		defaultPort: 9007,
		icon: "🎭",
		useCases: ["Multi-agent workflows", "Complex tasks", "Automation"],
	},
];

/**
 * Get preset by ID
 */
export function getPresetById(id: string): RvAgentPreset | undefined {
	return RVAGENT_PRESETS.find((p) => p.id === id);
}

/**
 * Build the SSE URL for a preset
 */
export function buildPresetUrl(preset: RvAgentPreset, host = "localhost", port?: number): string {
	const actualPort = port ?? preset.defaultPort;
	return `http://${host}:${actualPort}/sse`;
}

/**
 * Build CLI command to start the server with preset configuration
 */
export function buildPresetCliCommand(preset: RvAgentPreset, port?: number): string {
	const actualPort = port ?? preset.defaultPort;
	const groupsArg = preset.groups.includes("all") ? "--all" : `--groups ${preset.groups.join(",")}`;

	return `rvagent-mcp --transport sse --port ${actualPort} ${groupsArg}`;
}

/**
 * Get all available tool group names
 */
export const TOOL_GROUPS = [
	"file",
	"shell",
	"memory",
	"agent",
	"git",
	"web",
	"brain",
	"task",
	"core",
] as const;

export type ToolGroupName = (typeof TOOL_GROUPS)[number];

/**
 * Tool group descriptions for UI display
 */
export const TOOL_GROUP_INFO: Record<ToolGroupName, { name: string; tools: string[]; icon: string }> = {
	file: {
		name: "File Operations",
		tools: ["read_file", "write_file", "edit_file", "ls", "glob", "grep"],
		icon: "📁",
	},
	shell: {
		name: "Shell Execution",
		tools: ["execute", "bash"],
		icon: "💻",
	},
	memory: {
		name: "Vector Memory",
		tools: ["semantic_search", "store_memory", "retrieve_memory"],
		icon: "🧠",
	},
	agent: {
		name: "Multi-Agent",
		tools: ["spawn_agent", "agent_status", "orchestrate"],
		icon: "🤖",
	},
	git: {
		name: "Version Control",
		tools: ["git_status", "git_commit", "git_diff", "git_log"],
		icon: "📦",
	},
	web: {
		name: "Web Operations",
		tools: ["web_fetch", "web_search"],
		icon: "🌐",
	},
	brain: {
		name: "π Brain",
		tools: ["brain_search", "brain_share", "brain_vote"],
		icon: "🧪",
	},
	task: {
		name: "Task Management",
		tools: ["create_task", "list_tasks", "complete_task"],
		icon: "✅",
	},
	core: {
		name: "Core Protocol",
		tools: ["ping", "initialize", "tools/list"],
		icon: "⚙️",
	},
};
