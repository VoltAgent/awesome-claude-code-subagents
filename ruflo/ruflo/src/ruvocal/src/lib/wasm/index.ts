/**
 * WASM Integration Layer
 * Loads rvagent-wasm and provides TypeScript bindings
 */

import { browser } from "$app/environment";

// Types for WASM exports
export interface WasmMcpServer {
	handle_message(message: string): string;
	gallery(): WasmGallery;
}

export interface WasmGallery {
	list(): GalleryTemplate[];
	listByCategory(category: string): GalleryTemplate[];
	search(query: string): SearchResult[];
	get(id: string): GalleryTemplate;
	loadRvf(id: string): Uint8Array;
	setActive(id: string): void;
	getActive(): string | null;
	configure(configJson: string): void;
	getConfig(): unknown;
	addCustom(templateJson: string): void;
	removeCustom(id: string): void;
	getCategories(): Record<string, number>;
	count(): number;
	exportCustom(): GalleryTemplate[];
	importCustom(templatesJson: string): number;
}

export interface WasmRvfBuilder {
	addTool(toolJson: string): void;
	addTools(toolsJson: string): void;
	addPrompt(promptJson: string): void;
	addPrompts(promptsJson: string): void;
	addSkill(skillJson: string): void;
	addSkills(skillsJson: string): void;
	addMcpTools(mcpToolsJson: string): void;
	addCapabilities(capsJson: string): void;
	setOrchestrator(orchestratorJson: string): void;
	build(): Uint8Array;
}

export interface GalleryTemplate {
	id: string;
	name: string;
	description: string;
	category: string;
	version: string;
	author: string;
	tags: string[];
	builtin: boolean;
	tools?: ToolDefinition[];
	prompts?: AgentPrompt[];
	skills?: SkillDefinition[];
	mcp_tools?: McpToolEntry[];
	capabilities?: CapabilityDef[];
	orchestrator?: OrchestratorConfig;
}

export interface SearchResult {
	id: string;
	name: string;
	description: string;
	category: string;
	tags: string[];
	relevance: number;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: unknown;
	returns?: string;
}

export interface AgentPrompt {
	name: string;
	system_prompt: string;
	version: string;
}

export interface SkillDefinition {
	name: string;
	description: string;
	trigger: string;
	content: string;
}

export interface McpToolEntry {
	name: string;
	description: string;
	input_schema: unknown;
	group?: string;
}

export interface CapabilityDef {
	name: string;
	rights: string[];
	scope: string;
	delegation_depth: number;
}

export interface OrchestratorConfig {
	topology: string;
	agents: AgentNode[];
	connections: [string, string][];
}

export interface AgentNode {
	id: string;
	agent_type: string;
	prompt_ref: string;
}

// WASM module instance
let wasmModule: {
	WasmMcpServer: new () => WasmMcpServer;
	WasmGallery: new () => WasmGallery;
	WasmRvfBuilder: new () => WasmRvfBuilder;
} | null = null;

type WasmModuleType = {
	WasmMcpServer: new () => WasmMcpServer;
	WasmGallery: new () => WasmGallery;
	WasmRvfBuilder: new () => WasmRvfBuilder;
} | null;

let loadPromise: Promise<WasmModuleType> | null = null;

/**
 * Create a mock WASM module for development/testing when actual WASM isn't available
 * Implements the full rvAgent feature set with 8 tools, 14 middleware capabilities,
 * SONA learning, HNSW search, AGI containers, and security controls
 */
function createMockWasmModule() {
	// Built-in templates for mock gallery - comprehensive rvAgent implementations
	const builtinTemplates: GalleryTemplate[] = [
		{
			id: "development-agent",
			name: "Development Agent",
			description: "Full-featured development agent with code editing, file management, testing, and task tracking. O(1) state cloning for instant subagent spawning.",
			category: "development",
			version: "2.0.0",
			author: "RuVector",
			tags: ["development", "coding", "testing", "files", "tasks", "production"],
			builtin: true,
			tools: [
				{ name: "read_file", description: "Read file contents from the virtual filesystem", parameters: { path: "string" } },
				{ name: "write_file", description: "Write content to a file in the virtual filesystem", parameters: { path: "string", content: "string" } },
				{ name: "edit_file", description: "Edit a file by replacing old content with new content", parameters: { path: "string", old_content: "string", new_content: "string" } },
				{ name: "list_files", description: "List all files in the virtual filesystem", parameters: {} },
				{ name: "delete_file", description: "Delete a file from the virtual filesystem", parameters: { path: "string" } },
				{ name: "grep", description: "Search for patterns in files using regex", parameters: { pattern: "string", path: "string?" } },
				{ name: "glob", description: "Find files matching a glob pattern", parameters: { pattern: "string" } },
				{ name: "execute", description: "Execute a shell command (sandboxed)", parameters: { command: "string", cwd: "string?" } },
			],
			prompts: [{
				name: "developer",
				system_prompt: "You are a production-grade coding assistant powered by rvAgent. You have access to file operations, search, and task management. Be concise and focus on writing correct, secure code. Use the task tracking tools to manage complex workflows. Always validate inputs and handle errors gracefully.",
				version: "2.0.0"
			}],
			skills: [
				{ name: "commit", description: "Create a git commit with conventional commit messages", trigger: "/commit", content: "Review changes, generate commit message, stage files, create commit" },
				{ name: "review", description: "Review code for security, performance, and best practices", trigger: "/review", content: "Analyze code for issues, suggest improvements, check for vulnerabilities" },
				{ name: "test", description: "Run tests and analyze failures", trigger: "/test", content: "Execute test suite, analyze failures, suggest fixes" },
				{ name: "refactor", description: "Refactor code while maintaining behavior", trigger: "/refactor", content: "Identify code smells, propose refactoring, maintain tests" },
			],
			mcp_tools: [
				{ name: "todo_add", description: "Add a task to the todo list", input_schema: { type: "object", properties: { task: { type: "string" } } }, group: "tasks" },
				{ name: "todo_list", description: "List all pending tasks", input_schema: { type: "object" }, group: "tasks" },
				{ name: "todo_complete", description: "Mark a task as complete", input_schema: { type: "object", properties: { id: { type: "string" } } }, group: "tasks" },
				{ name: "memory_store", description: "Store information in semantic memory", input_schema: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } } }, group: "memory" },
				{ name: "memory_search", description: "Search semantic memory using HNSW", input_schema: { type: "object", properties: { query: { type: "string" } } }, group: "memory" },
			],
			capabilities: [
				{ name: "file_ops", rights: ["read", "write", "delete"], scope: "/workspace", delegation_depth: 2 },
				{ name: "execute", rights: ["run"], scope: "sandboxed", delegation_depth: 1 },
				{ name: "memory", rights: ["read", "write", "search"], scope: "session", delegation_depth: 0 },
			],
		},
		{
			id: "research-agent",
			name: "Research Agent",
			description: "Research-focused agent with web search, document analysis, and semantic memory. HNSW-indexed memory for O(log n) retrieval across millions of entries.",
			category: "research",
			version: "2.0.0",
			author: "RuVector",
			tags: ["research", "analysis", "documentation", "memory", "search"],
			builtin: true,
			tools: [
				{ name: "read_file", description: "Read file contents", parameters: { path: "string" } },
				{ name: "write_file", description: "Write content to a file", parameters: { path: "string", content: "string" } },
				{ name: "list_files", description: "List files", parameters: {} },
				{ name: "web_search", description: "Search the web for information", parameters: { query: "string", limit: "number?" } },
				{ name: "analyze_document", description: "Analyze a document for key insights", parameters: { content: "string", focus: "string?" } },
				{ name: "summarize", description: "Summarize long content", parameters: { content: "string", max_length: "number?" } },
			],
			prompts: [{
				name: "researcher",
				system_prompt: "You are an expert research assistant with access to semantic memory and document analysis tools. Your goal is to find accurate information, synthesize insights, and provide well-sourced answers. Use memory to track findings across sessions. Always cite sources and acknowledge uncertainty.",
				version: "2.0.0"
			}],
			skills: [
				{ name: "deep-dive", description: "Conduct deep research on a topic", trigger: "/deep-dive", content: "Comprehensive multi-source research with citations" },
				{ name: "summarize", description: "Create executive summary", trigger: "/summarize", content: "Condense information into key points" },
				{ name: "compare", description: "Compare multiple sources", trigger: "/compare", content: "Analyze similarities and differences" },
			],
			mcp_tools: [
				{ name: "memory_store", description: "Store research findings", input_schema: { type: "object", properties: { key: { type: "string" }, value: { type: "string" }, tags: { type: "array" } } }, group: "memory" },
				{ name: "memory_search", description: "Search past research (HNSW)", input_schema: { type: "object", properties: { query: { type: "string" }, top_k: { type: "number" } } }, group: "memory" },
				{ name: "cite", description: "Generate citation", input_schema: { type: "object", properties: { source: { type: "string" }, format: { type: "string" } } }, group: "research" },
			],
			capabilities: [
				{ name: "web_access", rights: ["search", "fetch"], scope: "internet", delegation_depth: 1 },
				{ name: "memory", rights: ["read", "write", "search"], scope: "persistent", delegation_depth: 0 },
			],
		},
		{
			id: "security-agent",
			name: "Security Agent",
			description: "Security-focused agent for code auditing, vulnerability scanning, and threat detection. 15 built-in security controls including path traversal, injection, and credential protection.",
			category: "security",
			version: "2.0.0",
			author: "RuVector",
			tags: ["security", "audit", "vulnerabilities", "penetration-testing", "compliance"],
			builtin: true,
			tools: [
				{ name: "read_file", description: "Read file contents (path-confined)", parameters: { path: "string" } },
				{ name: "list_files", description: "List files", parameters: {} },
				{ name: "grep", description: "Search for patterns (e.g., credentials)", parameters: { pattern: "string", path: "string?" } },
				{ name: "scan_vulnerabilities", description: "Scan code for known vulnerabilities", parameters: { path: "string", severity: "string?" } },
				{ name: "audit_code", description: "Audit code for security issues", parameters: { path: "string", ruleset: "string?" } },
				{ name: "check_dependencies", description: "Check dependencies for CVEs", parameters: { manifest: "string" } },
			],
			prompts: [{
				name: "security",
				system_prompt: "You are a security expert powered by rvAgent's 15 built-in security controls. You can detect path traversal, credential leaks, injection attacks, and unicode spoofing. Analyze code with a security-first mindset. Report vulnerabilities with severity, impact, and remediation steps. Never expose sensitive data in outputs.",
				version: "2.0.0"
			}],
			skills: [
				{ name: "audit", description: "Full security audit", trigger: "/audit", content: "Comprehensive security review with OWASP checks" },
				{ name: "pentest", description: "Penetration testing simulation", trigger: "/pentest", content: "Simulate attack vectors and report findings" },
				{ name: "compliance", description: "Compliance check", trigger: "/compliance", content: "Check against security frameworks (SOC2, HIPAA, etc.)" },
			],
			mcp_tools: [
				{ name: "cve_lookup", description: "Lookup CVE details", input_schema: { type: "object", properties: { cve_id: { type: "string" } } }, group: "security" },
				{ name: "report_vuln", description: "Generate vulnerability report", input_schema: { type: "object", properties: { findings: { type: "array" } } }, group: "security" },
				{ name: "witness_log", description: "Log to witness chain (immutable audit)", input_schema: { type: "object", properties: { action: { type: "string" }, data: { type: "object" } } }, group: "audit" },
			],
			capabilities: [
				{ name: "file_ops", rights: ["read"], scope: "/workspace", delegation_depth: 1 },
				{ name: "audit", rights: ["read", "write"], scope: "witness_chain", delegation_depth: 0 },
			],
		},
		{
			id: "multi-agent-orchestrator",
			name: "Multi-Agent Orchestrator",
			description: "Coordinate multiple specialized agents with CRDT-based state merging. Spawn subagents instantly with O(1) state cloning, merge results deterministically.",
			category: "orchestration",
			version: "2.0.0",
			author: "RuVector",
			tags: ["multi-agent", "orchestration", "coordination", "parallel", "subagents"],
			builtin: true,
			tools: [
				{ name: "read_file", description: "Read file contents", parameters: { path: "string" } },
				{ name: "write_file", description: "Write content to a file", parameters: { path: "string", content: "string" } },
				{ name: "list_files", description: "List files", parameters: {} },
				{ name: "spawn_agent", description: "Spawn a specialized subagent", parameters: { type: "string", task: "string" } },
				{ name: "merge_results", description: "Merge subagent results using CRDT", parameters: { results: "array" } },
			],
			prompts: [{
				name: "orchestrator",
				system_prompt: "You are a multi-agent orchestrator. You can spawn specialized subagents (security-reviewer, performance-reviewer, code-reviewer) and coordinate their work. Use CRDT merging for conflict-free result combination. Delegate effectively and synthesize findings into actionable insights.",
				version: "2.0.0"
			}],
			skills: [
				{ name: "parallel-review", description: "Parallel code review with multiple agents", trigger: "/parallel-review", content: "Spawn security, performance, and style reviewers simultaneously" },
				{ name: "swarm", description: "Deploy agent swarm for complex task", trigger: "/swarm", content: "Coordinate multiple agents for large-scale analysis" },
			],
			mcp_tools: [
				{ name: "agent_spawn", description: "Spawn a subagent", input_schema: { type: "object", properties: { type: { type: "string" }, task: { type: "string" } } }, group: "orchestration" },
				{ name: "agent_status", description: "Get subagent status", input_schema: { type: "object", properties: { id: { type: "string" } } }, group: "orchestration" },
				{ name: "results_merge", description: "Merge results with CRDT", input_schema: { type: "object", properties: { results: { type: "array" } } }, group: "orchestration" },
			],
			capabilities: [
				{ name: "orchestration", rights: ["spawn", "terminate", "merge"], scope: "subagents", delegation_depth: 3 },
				{ name: "file_ops", rights: ["read", "write"], scope: "/workspace", delegation_depth: 2 },
			],
			orchestrator: {
				topology: "hierarchical",
				agents: [
					{ id: "coordinator", agent_type: "orchestrator", prompt_ref: "orchestrator" },
					{ id: "security", agent_type: "security-reviewer", prompt_ref: "security" },
					{ id: "performance", agent_type: "performance-reviewer", prompt_ref: "performance" },
					{ id: "style", agent_type: "style-reviewer", prompt_ref: "style" },
				],
				connections: [["coordinator", "security"], ["coordinator", "performance"], ["coordinator", "style"]],
			},
		},
		{
			id: "sona-learning-agent",
			name: "SONA Learning Agent",
			description: "Self-improving agent with SONA (Self-Optimizing Neural Architecture). 3-loop learning: instant feedback (<0.05ms), background optimization, deep consolidation.",
			category: "learning",
			version: "2.0.0",
			author: "RuVector",
			tags: ["learning", "adaptive", "self-improving", "sona", "neural"],
			builtin: true,
			tools: [
				{ name: "read_file", description: "Read file contents", parameters: { path: "string" } },
				{ name: "write_file", description: "Write content to a file", parameters: { path: "string", content: "string" } },
				{ name: "edit_file", description: "Edit a file", parameters: { path: "string", old_content: "string", new_content: "string" } },
				{ name: "list_files", description: "List files", parameters: {} },
				{ name: "learn_pattern", description: "Learn a new pattern from experience", parameters: { pattern: "string", outcome: "string" } },
				{ name: "predict_action", description: "Predict best action based on learned patterns", parameters: { context: "string" } },
			],
			prompts: [{
				name: "learner",
				system_prompt: "You are a self-improving agent with SONA learning capabilities. You learn from every interaction through 3 feedback loops: Loop A (instant, <0.05ms) for immediate adjustments, Loop B (background) for pattern optimization, Loop C (consolidation) for deep learning. Track your performance and continuously improve your responses.",
				version: "2.0.0"
			}],
			skills: [
				{ name: "learn", description: "Learn from experience", trigger: "/learn", content: "Record pattern and outcome for future use" },
				{ name: "recall", description: "Recall learned patterns", trigger: "/recall", content: "Search learned patterns matching context" },
				{ name: "optimize", description: "Trigger optimization cycle", trigger: "/optimize", content: "Run background optimization on learned patterns" },
			],
			mcp_tools: [
				{ name: "pattern_store", description: "Store learned pattern", input_schema: { type: "object", properties: { pattern: { type: "string" }, outcome: { type: "string" }, confidence: { type: "number" } } }, group: "learning" },
				{ name: "pattern_search", description: "Search patterns (HNSW)", input_schema: { type: "object", properties: { query: { type: "string" }, top_k: { type: "number" } } }, group: "learning" },
				{ name: "feedback_record", description: "Record feedback for learning", input_schema: { type: "object", properties: { action: { type: "string" }, success: { type: "boolean" } } }, group: "learning" },
			],
			capabilities: [
				{ name: "learning", rights: ["read", "write", "optimize"], scope: "neural", delegation_depth: 0 },
				{ name: "file_ops", rights: ["read", "write"], scope: "/workspace", delegation_depth: 1 },
			],
		},
		{
			id: "agi-container-builder",
			name: "AGI Container Builder",
			description: "Build portable AI agent packages (AGI Containers) with tools, prompts, skills, and verified checksums. SHA3-256 integrity verification for secure deployment.",
			category: "tooling",
			version: "2.0.0",
			author: "RuVector",
			tags: ["agi", "container", "portable", "deployment", "rvf"],
			builtin: true,
			tools: [
				{ name: "read_file", description: "Read file contents", parameters: { path: "string" } },
				{ name: "write_file", description: "Write content to a file", parameters: { path: "string", content: "string" } },
				{ name: "list_files", description: "List files", parameters: {} },
				{ name: "build_container", description: "Build an AGI container", parameters: { manifest: "object" } },
				{ name: "verify_container", description: "Verify container integrity", parameters: { path: "string" } },
				{ name: "extract_container", description: "Extract container contents", parameters: { path: "string", dest: "string" } },
			],
			prompts: [{
				name: "builder",
				system_prompt: "You are an AGI Container builder. You help create portable, verified AI agent packages that bundle tools, prompts, skills, and capabilities. Each container has SHA3-256 checksum verification for security. Guide users through container creation, validation, and deployment.",
				version: "2.0.0"
			}],
			skills: [
				{ name: "build", description: "Build AGI container", trigger: "/build", content: "Create verified RVF container from manifest" },
				{ name: "verify", description: "Verify container", trigger: "/verify", content: "Check SHA3-256 integrity and validate structure" },
				{ name: "deploy", description: "Deploy container", trigger: "/deploy", content: "Extract and activate container in runtime" },
			],
			mcp_tools: [
				{ name: "rvf_build", description: "Build RVF container", input_schema: { type: "object", properties: { tools: { type: "array" }, prompts: { type: "array" }, skills: { type: "array" } } }, group: "container" },
				{ name: "rvf_verify", description: "Verify RVF container", input_schema: { type: "object", properties: { data: { type: "string" } } }, group: "container" },
				{ name: "rvf_extract", description: "Extract RVF contents", input_schema: { type: "object", properties: { data: { type: "string" } } }, group: "container" },
			],
			capabilities: [
				{ name: "container", rights: ["build", "verify", "extract"], scope: "rvf", delegation_depth: 0 },
				{ name: "file_ops", rights: ["read", "write"], scope: "/workspace", delegation_depth: 1 },
			],
		},
		{
			id: "witness-auditor",
			name: "Witness Chain Auditor",
			description: "Cryptographic audit trail agent with immutable witness chains. Every action is logged with a hash chain for forensic debugging and compliance.",
			category: "compliance",
			version: "2.0.0",
			author: "RuVector",
			tags: ["audit", "compliance", "forensics", "witness", "immutable"],
			builtin: true,
			tools: [
				{ name: "read_file", description: "Read file contents", parameters: { path: "string" } },
				{ name: "list_files", description: "List files", parameters: {} },
				{ name: "witness_log", description: "Log action to witness chain", parameters: { action: "string", data: "object" } },
				{ name: "witness_verify", description: "Verify witness chain integrity", parameters: { chain_id: "string" } },
				{ name: "witness_query", description: "Query witness chain", parameters: { filter: "object" } },
			],
			prompts: [{
				name: "auditor",
				system_prompt: "You are a compliance auditor with access to immutable witness chains. Every tool call creates a cryptographic log entry forming a hash chain. Use this for forensic debugging, compliance audits, and security investigations. You can verify chain integrity and trace exactly what happened and when.",
				version: "2.0.0"
			}],
			skills: [
				{ name: "audit-trail", description: "Generate audit trail", trigger: "/audit-trail", content: "Create comprehensive audit report from witness chain" },
				{ name: "verify-chain", description: "Verify chain integrity", trigger: "/verify-chain", content: "Validate all hashes in witness chain" },
				{ name: "compliance-report", description: "Generate compliance report", trigger: "/compliance-report", content: "Create compliance report for SOC2/HIPAA/etc." },
			],
			mcp_tools: [
				{ name: "witness_append", description: "Append to witness chain", input_schema: { type: "object", properties: { action: { type: "string" }, data: { type: "object" } } }, group: "audit" },
				{ name: "witness_verify", description: "Verify chain integrity", input_schema: { type: "object", properties: { chain_id: { type: "string" } } }, group: "audit" },
				{ name: "witness_export", description: "Export chain for external audit", input_schema: { type: "object", properties: { chain_id: { type: "string" }, format: { type: "string" } } }, group: "audit" },
			],
			capabilities: [
				{ name: "audit", rights: ["read", "write", "verify"], scope: "witness_chain", delegation_depth: 0 },
				{ name: "file_ops", rights: ["read"], scope: "/workspace", delegation_depth: 1 },
			],
		},
		{
			id: "minimal-agent",
			name: "Minimal Agent",
			description: "Lightweight agent with just file operations. Perfect for simple tasks or as a starting point for custom agents.",
			category: "basic",
			version: "2.0.0",
			author: "RuVector",
			tags: ["minimal", "simple", "files", "basic"],
			builtin: true,
			tools: [
				{ name: "read_file", description: "Read file contents", parameters: { path: "string" } },
				{ name: "write_file", description: "Write content to a file", parameters: { path: "string", content: "string" } },
				{ name: "list_files", description: "List files", parameters: {} },
			],
			prompts: [{
				name: "assistant",
				system_prompt: "You are a helpful assistant with access to file operations. Keep responses concise.",
				version: "2.0.0"
			}],
			skills: [],
			mcp_tools: [],
			capabilities: [
				{ name: "file_ops", rights: ["read", "write"], scope: "/workspace", delegation_depth: 0 },
			],
		},
	];

	// Virtual filesystem for mock MCP server
	const virtualFS = new Map<string, string>();
	let activeTemplateId: string | null = null;

	// Todo list for task tracking
	const todoList: { id: string; task: string; completed: boolean; created: number }[] = [];
	let todoIdCounter = 1;

	// Memory store for semantic memory (simulated HNSW)
	const memoryStore = new Map<string, { key: string; value: string; tags: string[]; embedding?: number[] }>();

	// Witness chain for audit trail
	const witnessChain: { hash: string; prev_hash: string; action: string; data: unknown; timestamp: number }[] = [];
	let lastWitnessHash = "genesis";

	// Helper: Simple hash for witness chain
	function simpleHash(data: string): string {
		let hash = 0;
		for (let i = 0; i < data.length; i++) {
			const char = data.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(16).padStart(8, '0');
	}

	// Helper: Add witness entry
	function addWitnessEntry(action: string, data: unknown): string {
		const entry = {
			hash: '',
			prev_hash: lastWitnessHash,
			action,
			data,
			timestamp: Date.now(),
		};
		entry.hash = simpleHash(JSON.stringify(entry));
		witnessChain.push(entry);
		lastWitnessHash = entry.hash;
		return entry.hash;
	}

	class MockWasmMcpServer implements WasmMcpServer {
		handle_message(message: string): string {
			const request = JSON.parse(message);
			const { method, params, id } = request;

			const response = {
				jsonrpc: "2.0",
				id,
				result: null as unknown,
				error: undefined as { code: number; message: string } | undefined,
			};

			switch (method) {
				case "initialize":
					response.result = {
						protocolVersion: "2024-11-05",
						serverInfo: { name: "rvagent-wasm", version: "2.0.0" },
						capabilities: {
							tools: { listChanged: true },
							prompts: { listChanged: true },
							resources: {},
						},
					};
					break;

				case "tools/list":
					response.result = {
						tools: [
							// === SYSTEM GUIDANCE (1) - CALL THIS FIRST ===
							{
								name: "system_guidance",
								description: `🔮 CALL FIRST: Get help on ALL available tools. Examples: {} for full guide, {"tool": "read_file"} for specific tool, {"category": "memory"} for category.`,
								inputSchema: {
									type: "object",
									properties: {
										tool: { type: "string", description: "Get help for specific tool name" },
										category: { type: "string", description: "Filter by: files, memory, tasks, gallery, witness, brain, search" }
									}
								}
							},
							// === FILE OPERATIONS (5) ===
							{
								name: "read_file",
								description: `Read file contents. REQUIRED: path (string). Example: {"path": "src/index.ts"}`,
								inputSchema: {
									type: "object",
									properties: { path: { type: "string", description: "File path (REQUIRED) - e.g., 'src/index.ts'" } },
									required: ["path"]
								}
							},
							{
								name: "write_file",
								description: `Create or overwrite a file. REQUIRED: path, content. Example: {"path": "hello.txt", "content": "Hello World"}`,
								inputSchema: {
									type: "object",
									properties: {
										path: { type: "string", description: "File path (REQUIRED) - e.g., 'src/new-file.ts'" },
										content: { type: "string", description: "Content to write (REQUIRED)" }
									},
									required: ["path", "content"]
								}
							},
							{
								name: "list_files",
								description: `List all files in the virtual filesystem. No parameters needed. Returns file paths.`,
								inputSchema: { type: "object", properties: {} }
							},
							{
								name: "delete_file",
								description: `Delete a file. REQUIRED: path. Example: {"path": "temp.txt"}`,
								inputSchema: {
									type: "object",
									properties: { path: { type: "string", description: "File path to delete (REQUIRED)" } },
									required: ["path"]
								}
							},
							{
								name: "edit_file",
								description: `Replace text in a file. REQUIRED: path, old_content, new_content. Example: {"path": "src/index.ts", "old_content": "const x = 1", "new_content": "const x = 2"}`,
								inputSchema: {
									type: "object",
									properties: {
										path: { type: "string", description: "File path (REQUIRED)" },
										old_content: { type: "string", description: "Text to find (REQUIRED) - must match exactly" },
										new_content: { type: "string", description: "Replacement text (REQUIRED)" }
									},
									required: ["path", "old_content", "new_content"]
								}
							},
							// === SEARCH TOOLS (2) ===
							{
								name: "grep",
								description: `Search for regex patterns. REQUIRED: pattern. OPTIONAL: path. Example: {"pattern": "function.*export", "path": "src/utils.ts"}`,
								inputSchema: {
									type: "object",
									properties: {
										pattern: { type: "string", description: "Regex pattern (REQUIRED) - e.g., 'TODO|FIXME'" },
										path: { type: "string", description: "Limit search to file (optional)" }
									},
									required: ["pattern"]
								}
							},
							{
								name: "glob",
								description: `Find files by pattern. REQUIRED: pattern. Examples: {"pattern": "*.ts"}, {"pattern": "src/**/*.tsx"}`,
								inputSchema: {
									type: "object",
									properties: { pattern: { type: "string", description: "Glob pattern (REQUIRED) - e.g., '*.ts', 'src/**/*.js'" } },
									required: ["pattern"]
								}
							},
							// === TASK MANAGEMENT (3) ===
							{
								name: "todo_add",
								description: `Add a task. REQUIRED: task. Example: {"task": "Fix login bug"}`,
								inputSchema: {
									type: "object",
									properties: { task: { type: "string", description: "Task description (REQUIRED)" } },
									required: ["task"]
								}
							},
							{
								name: "todo_list",
								description: `List all tasks with status (○ pending, ✓ complete). No parameters needed.`,
								inputSchema: { type: "object", properties: {} }
							},
							{
								name: "todo_complete",
								description: `Mark task complete. REQUIRED: id. Example: {"id": "todo-1"}`,
								inputSchema: {
									type: "object",
									properties: { id: { type: "string", description: "Task ID (REQUIRED) - e.g., 'todo-1'" } },
									required: ["id"]
								}
							},
							// === MEMORY TOOLS (2) ===
							{
								name: "memory_store",
								description: `Store data in semantic memory. REQUIRED: key, value. OPTIONAL: tags. Example: {"key": "auth-pattern", "value": "JWT with refresh tokens", "tags": ["security", "patterns"]}`,
								inputSchema: {
									type: "object",
									properties: {
										key: { type: "string", description: "Unique key (REQUIRED)" },
										value: { type: "string", description: "Value to store (REQUIRED)" },
										tags: { type: "array", items: { type: "string" }, description: "Tags for filtering (optional)" }
									},
									required: ["key", "value"]
								}
							},
							{
								name: "memory_search",
								description: `Search stored memories. REQUIRED: query. OPTIONAL: top_k. Example: {"query": "authentication", "top_k": 5}`,
								inputSchema: {
									type: "object",
									properties: {
										query: { type: "string", description: "Search query (REQUIRED)" },
										top_k: { type: "number", description: "Max results (default: 5)" }
									},
									required: ["query"]
								}
							},
							// === AUDIT TOOLS (2) ===
							{
								name: "witness_log",
								description: `Log action to immutable audit chain. REQUIRED: action. OPTIONAL: data. Example: {"action": "file_modified", "data": {"path": "config.json"}}`,
								inputSchema: {
									type: "object",
									properties: {
										action: { type: "string", description: "Action name (REQUIRED) - e.g., 'file_created', 'deploy_started'" },
										data: { type: "object", description: "Additional context (optional)" }
									},
									required: ["action"]
								}
							},
							{
								name: "witness_verify",
								description: `Verify audit chain integrity. No parameters. Returns VALID/INVALID with entry count.`,
								inputSchema: { type: "object", properties: {} }
							},
							// === RVF GALLERY (3) ===
							{
								name: "gallery_list",
								description: `List agent templates. OPTIONAL: category. Examples: {"category": "development"}, {} for all templates`,
								inputSchema: {
									type: "object",
									properties: { category: { type: "string", description: "Filter by category (optional) - development, research, security, etc." } }
								}
							},
							{
								name: "gallery_load",
								description: `Load a template. REQUIRED: id. Example: {"id": "development-agent"}`,
								inputSchema: {
									type: "object",
									properties: { id: { type: "string", description: "Template ID (REQUIRED) - e.g., 'development-agent', 'security-agent'" } },
									required: ["id"]
								}
							},
							{
								name: "gallery_search",
								description: `Search templates by name, description, or tags. REQUIRED: query. Example: {"query": "security"}`,
								inputSchema: {
									type: "object",
									properties: { query: { type: "string", description: "Search query (REQUIRED)" } },
									required: ["query"]
								}
							},
						],
					};
					break;

				case "tools/call": {
					const { name, arguments: args } = params;
					// Log to witness chain for audit
					addWitnessEntry(`tool_call:${name}`, { args: args || {} });

					switch (name) {
						case "system_guidance": {
							const toolDocs: Record<string, { cat: string; desc: string; ex: string }> = {
								// --- Help ---
								system_guidance: { cat: "help", desc: "Get help on all available tools, a specific tool, or a category", ex: '{}  or  {"tool": "brain_search"}  or  {"category": "brain"}' },
								// --- Files (local virtual filesystem in browser) ---
								read_file: { cat: "files", desc: "Read a file from the virtual filesystem. REQUIRED: path", ex: '{"path": "src/index.ts"}' },
								write_file: { cat: "files", desc: "Create or overwrite a file. REQUIRED: path, content", ex: '{"path": "hello.txt", "content": "Hello World"}' },
								list_files: { cat: "files", desc: "List all files stored in the virtual filesystem", ex: "{}" },
								delete_file: { cat: "files", desc: "Delete a file. REQUIRED: path", ex: '{"path": "temp.txt"}' },
								edit_file: { cat: "files", desc: "Find-and-replace text in a file. REQUIRED: path, old_content, new_content", ex: '{"path": "app.ts", "old_content": "const x = 1", "new_content": "const x = 2"}' },
								grep: { cat: "files", desc: "Search file contents with regex. REQUIRED: pattern. OPTIONAL: path (limit to one file)", ex: '{"pattern": "TODO|FIXME"}' },
								glob: { cat: "files", desc: "Find files by glob pattern. REQUIRED: pattern", ex: '{"pattern": "src/**/*.tsx"}' },
								// --- Memory (persistent key-value with semantic search) ---
								memory_store: { cat: "memory", desc: "Store a value in persistent memory with optional tags. REQUIRED: key, value. OPTIONAL: tags[]", ex: '{"key": "auth-pattern", "value": "JWT with refresh tokens", "tags": ["security"]}' },
								memory_search: { cat: "memory", desc: "Semantic search across stored memories. REQUIRED: query. OPTIONAL: top_k (default 5)", ex: '{"query": "authentication", "top_k": 3}' },
								// --- Tasks ---
								todo_add: { cat: "tasks", desc: "Add a new task. REQUIRED: task (description string)", ex: '{"task": "Fix login redirect bug"}' },
								todo_list: { cat: "tasks", desc: "List all tasks with status indicators", ex: "{}" },
								todo_complete: { cat: "tasks", desc: "Mark a task as complete. REQUIRED: id", ex: '{"id": "todo-1"}' },
								// --- Witness Chain (immutable audit log) ---
								witness_log: { cat: "witness", desc: "Log an action to the immutable witness chain. REQUIRED: action. OPTIONAL: data", ex: '{"action": "file_modified", "data": {"path": "config.json"}}' },
								witness_verify: { cat: "witness", desc: "Verify the integrity of the entire witness chain. Returns VALID/INVALID", ex: "{}" },
								// --- Gallery (agent templates) ---
								gallery_list: { cat: "gallery", desc: "List available agent templates. OPTIONAL: category", ex: '{"category": "development"}' },
								gallery_load: { cat: "gallery", desc: "Load and activate an agent template. REQUIRED: id", ex: '{"id": "development-agent"}' },
								gallery_search: { cat: "gallery", desc: "Search templates by keyword. REQUIRED: query", ex: '{"query": "security"}' },
								// --- Brain (shared collective intelligence at pi.ruv.io, via pi-brain MCP) ---
								brain_status: { cat: "brain", desc: "Check brain health: memory count, graph edges, clusters, embedding engine, drift status", ex: "{}" },
								brain_search: { cat: "brain", desc: "Semantic search across 2,000+ shared memories. REQUIRED: query. OPTIONAL: limit, min_quality", ex: '{"query": "authentication patterns", "limit": 5}' },
								brain_list: { cat: "brain", desc: "List recent memories. OPTIONAL: limit, category, min_quality", ex: '{"limit": 10, "category": "pattern"}' },
								brain_share: { cat: "brain", desc: "Share a learning with the collective. REQUIRED: category, title, content. OPTIONAL: tags[]. Categories: architecture|pattern|solution|convention|security|performance|tooling|debug", ex: '{"category": "pattern", "title": "React auth hook", "content": "useAuth() with refresh token rotation", "tags": ["react", "auth"]}' },
								brain_drift: { cat: "brain", desc: "Check knowledge drift across categories. Shows how knowledge is evolving over time", ex: "{}" },
								brain_partition: { cat: "brain", desc: "Get MinCut knowledge clusters. Shows emergent topic groupings with coherence scores. Use compact=true (default) to avoid large responses", ex: '{"compact": true}' },
							};

							let text: string;
							const reqTool = args?.tool?.toLowerCase();
							const reqCat = args?.category?.toLowerCase();

							if (reqTool && toolDocs[reqTool]) {
								const d = toolDocs[reqTool];
								text = `TOOL: ${reqTool}\nCategory: ${d.cat}\nDescription: ${d.desc}\nExample: ${reqTool}(${d.ex})`;
							} else if (reqCat && reqCat !== "all") {
								const filtered = Object.entries(toolDocs)
									.filter(([, d]) => d.cat === reqCat)
									.map(([n, d]) => `  ${n} — ${d.desc}\n    Example: ${n}(${d.ex})`);
								text = filtered.length > 0
									? `${reqCat.toUpperCase()} TOOLS:\n\n${filtered.join("\n\n")}`
									: `No tools in category: ${reqCat}. Available categories: help, files, memory, tasks, witness, gallery, brain`;
							} else {
								const cats = ["brain", "files", "memory", "tasks", "gallery", "witness", "help"];
								const sections = cats.map((c) => {
									const items = Object.entries(toolDocs)
										.filter(([, d]) => d.cat === c)
										.map(([n, d]) => `  ${n} — ${d.desc}\n    Ex: ${n}(${d.ex})`);
									return items.length > 0 ? `${c.toUpperCase()} (${items.length}):\n${items.join("\n")}` : null;
								}).filter(Boolean);
								text = `SYSTEM GUIDANCE — AVAILABLE TOOLS\n\n` +
									`You have two MCP servers:\n` +
									`  1. RVAgent Local (WASM) — files, memory, tasks, witness, gallery (runs in browser)\n` +
									`  2. pi-brain (mcp.pi.ruv.io) — shared collective intelligence with 2,000+ memories\n\n` +
									`${sections.join("\n\n")}\n\n` +
									`TIPS:\n` +
									`• Brain tools (brain_*) connect to pi.ruv.io shared knowledge — search before implementing\n` +
									`• Local tools (files, memory, tasks) operate in this browser sandbox\n` +
									`• Always pass REQUIRED parameters in JSON format\n` +
									`• Use witness_log to create audit trails for important actions`;
							}
							response.result = { content: [{ type: "text", text }] };
							break;
						}
						case "read_file": {
							const content = virtualFS.get(args.path);
							if (content === undefined) {
								response.result = { content: [{ type: "text", text: `Error: File not found: ${args.path}` }], isError: true };
							} else {
								response.result = { content: [{ type: "text", text: content }] };
							}
							break;
						}
						case "write_file": {
							virtualFS.set(args.path, args.content);
							response.result = { content: [{ type: "text", text: `Successfully wrote ${args.content.length} bytes to ${args.path}` }] };
							break;
						}
						case "list_files": {
							const files = [...virtualFS.keys()];
							if (files.length === 0) {
								response.result = { content: [{ type: "text", text: "No files in virtual filesystem" }] };
							} else {
								response.result = { content: [{ type: "text", text: `Files:\n${files.map(f => `- ${f}`).join('\n')}` }] };
							}
							break;
						}
						case "delete_file": {
							if (!virtualFS.has(args.path)) {
								response.result = { content: [{ type: "text", text: `Error: File not found: ${args.path}` }], isError: true };
							} else {
								virtualFS.delete(args.path);
								response.result = { content: [{ type: "text", text: `Deleted: ${args.path}` }] };
							}
							break;
						}
						case "edit_file": {
							const existing = virtualFS.get(args.path);
							if (existing === undefined) {
								response.result = { content: [{ type: "text", text: `Error: File not found: ${args.path}` }], isError: true };
							} else if (!existing.includes(args.old_content)) {
								response.result = { content: [{ type: "text", text: `Error: old_content not found in file` }], isError: true };
							} else {
								virtualFS.set(args.path, existing.replace(args.old_content, args.new_content));
								response.result = { content: [{ type: "text", text: `Successfully edited ${args.path}` }] };
							}
							break;
						}
						case "grep": {
							const pattern = new RegExp(args.pattern, 'gi');
							const results: string[] = [];
							for (const [path, content] of virtualFS.entries()) {
								if (args.path && path !== args.path) continue;
								const lines = content.split('\n');
								lines.forEach((line, idx) => {
									if (pattern.test(line)) {
										results.push(`${path}:${idx + 1}: ${line}`);
									}
								});
							}
							response.result = { content: [{ type: "text", text: results.length > 0 ? results.join('\n') : 'No matches found' }] };
							break;
						}
						case "glob": {
							const globPattern = args.pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
							const regex = new RegExp(`^${globPattern}$`);
							const matches = [...virtualFS.keys()].filter(f => regex.test(f));
							response.result = { content: [{ type: "text", text: matches.length > 0 ? matches.join('\n') : 'No matches found' }] };
							break;
						}
						case "todo_add": {
							const id = `todo-${todoIdCounter++}`;
							todoList.push({ id, task: args.task, completed: false, created: Date.now() });
							response.result = { content: [{ type: "text", text: `Added task: ${args.task} (id: ${id})` }] };
							break;
						}
						case "todo_list": {
							if (todoList.length === 0) {
								response.result = { content: [{ type: "text", text: "No tasks in todo list" }] };
							} else {
								const formatted = todoList.map(t =>
									`${t.completed ? '✓' : '○'} [${t.id}] ${t.task}`
								).join('\n');
								response.result = { content: [{ type: "text", text: `Tasks:\n${formatted}` }] };
							}
							break;
						}
						case "todo_complete": {
							const todo = todoList.find(t => t.id === args.id);
							if (!todo) {
								response.result = { content: [{ type: "text", text: `Error: Task not found: ${args.id}` }], isError: true };
							} else {
								todo.completed = true;
								response.result = { content: [{ type: "text", text: `Completed: ${todo.task}` }] };
							}
							break;
						}
						case "memory_store": {
							memoryStore.set(args.key, { key: args.key, value: args.value, tags: args.tags || [] });
							response.result = { content: [{ type: "text", text: `Stored memory: ${args.key}` }] };
							break;
						}
						case "memory_search": {
							const query = (args.query as string).toLowerCase();
							const topK = args.top_k || 5;
							const results = [...memoryStore.values()]
								.filter(m => m.key.toLowerCase().includes(query) || m.value.toLowerCase().includes(query) || m.tags.some(t => t.toLowerCase().includes(query)))
								.slice(0, topK)
								.map(m => `[${m.key}] ${m.value.slice(0, 100)}${m.value.length > 100 ? '...' : ''}`);
							response.result = { content: [{ type: "text", text: results.length > 0 ? `Found ${results.length} results:\n${results.join('\n')}` : 'No memories found' }] };
							break;
						}
						case "witness_log": {
							const hash = addWitnessEntry(args.action, args.data || {});
							response.result = { content: [{ type: "text", text: `Logged to witness chain: ${args.action} (hash: ${hash})` }] };
							break;
						}
						case "witness_verify": {
							let valid = true;
							let prevHash = "genesis";
							for (const entry of witnessChain) {
								if (entry.prev_hash !== prevHash) {
									valid = false;
									break;
								}
								prevHash = entry.hash;
							}
							response.result = { content: [{ type: "text", text: `Witness chain: ${valid ? 'VALID' : 'INVALID'} (${witnessChain.length} entries)` }] };
							break;
						}
						case "gallery_list": {
							const filtered = args.category
								? builtinTemplates.filter(t => t.category === args.category)
								: builtinTemplates;
							const list = filtered.map(t => `- ${t.id}: ${t.name} (${t.category})`).join('\n');
							response.result = { content: [{ type: "text", text: `Gallery Templates:\n${list}` }] };
							break;
						}
						case "gallery_load": {
							const template = builtinTemplates.find(t => t.id === args.id);
							if (!template) {
								response.result = { content: [{ type: "text", text: `Error: Template not found: ${args.id}` }], isError: true };
							} else {
								activeTemplateId = args.id;
								response.result = { content: [{ type: "text", text: `Loaded template: ${template.name}\nDescription: ${template.description}\nTools: ${template.tools?.map(t => t.name).join(', ') || 'none'}\nSkills: ${template.skills?.map(s => s.trigger).join(', ') || 'none'}` }] };
							}
							break;
						}
						case "gallery_search": {
							const q = (args.query as string).toLowerCase();
							const matches = builtinTemplates.filter(t =>
								t.name.toLowerCase().includes(q) ||
								t.description.toLowerCase().includes(q) ||
								t.tags.some(tag => tag.toLowerCase().includes(q))
							);
							if (matches.length === 0) {
								response.result = { content: [{ type: "text", text: "No templates found matching your query" }] };
							} else {
								const list = matches.map(t => `- ${t.id}: ${t.name}\n  ${t.description}`).join('\n');
								response.result = { content: [{ type: "text", text: `Found ${matches.length} templates:\n${list}` }] };
							}
							break;
						}
						default:
							response.error = { code: -32601, message: `Unknown tool: ${name}` };
					}
					break;
				}

				case "prompts/list": {
					// Return prompts from active template or all templates
					const prompts = activeTemplateId
						? builtinTemplates.find(t => t.id === activeTemplateId)?.prompts || []
						: builtinTemplates.flatMap(t => t.prompts || []);
					response.result = { prompts: prompts.map(p => ({ name: p.name, description: `Prompt: ${p.name}` })) };
					break;
				}

				case "prompts/get": {
					const allPrompts = builtinTemplates.flatMap(t => t.prompts || []);
					const prompt = allPrompts.find(p => p.name === params.name);
					if (prompt) {
						response.result = {
							messages: [{ role: "assistant", content: { type: "text", text: prompt.system_prompt } }],
						};
					} else {
						response.error = { code: -32602, message: `Prompt not found: ${params.name}` };
					}
					break;
				}

				case "gallery/list":
					response.result = { templates: builtinTemplates };
					break;

				case "gallery/load": {
					const template = builtinTemplates.find((t) => t.id === params.id);
					if (template) {
						activeTemplateId = params.id;
						response.result = { template_id: template.id, name: template.name };
					} else {
						response.error = { code: -32602, message: `Template not found: ${params.id}` };
					}
					break;
				}

				case "gallery/search": {
					const q = (params.query as string).toLowerCase();
					const results = builtinTemplates
						.filter(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some(tag => tag.toLowerCase().includes(q)))
						.map(t => ({ id: t.id, name: t.name, description: t.description, category: t.category, tags: t.tags, relevance: t.name.toLowerCase().includes(q) ? 1.0 : 0.5 }));
					response.result = { results };
					break;
				}

				default:
					response.error = { code: -32601, message: `Method not found: ${method}` };
			}

			return JSON.stringify(response);
		}

		gallery(): WasmGallery {
			return new MockWasmGallery();
		}
	}

	class MockWasmGallery implements WasmGallery {
		list(): GalleryTemplate[] {
			return builtinTemplates;
		}

		listByCategory(category: string): GalleryTemplate[] {
			return builtinTemplates.filter((t) => t.category === category);
		}

		search(query: string): SearchResult[] {
			const q = query.toLowerCase();
			return builtinTemplates
				.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)))
				.map((t) => ({
					id: t.id,
					name: t.name,
					description: t.description,
					category: t.category,
					tags: t.tags,
					relevance: t.name.toLowerCase().includes(q) ? 1.0 : 0.5,
				}));
		}

		get(id: string): GalleryTemplate {
			const template = builtinTemplates.find((t) => t.id === id);
			if (!template) throw new Error(`Template not found: ${id}`);
			return template;
		}

		loadRvf(id: string): Uint8Array {
			const template = this.get(id);
			// Return mock RVF bytes (magic + version + minimal content)
			const encoder = new TextEncoder();
			const json = JSON.stringify(template);
			const jsonBytes = encoder.encode(json);
			const rvf = new Uint8Array(8 + jsonBytes.length);
			rvf.set([0x52, 0x56, 0x46, 0x00, 0x01, 0x00, 0x00, 0x00]); // RVF\0 + version
			rvf.set(jsonBytes, 8);
			return rvf;
		}

		setActive(id: string): void {
			activeTemplateId = id;
		}

		getActive(): string | null {
			return activeTemplateId;
		}

		configure(_configJson: string): void {}

		getConfig(): unknown {
			return {};
		}

		addCustom(_templateJson: string): void {}

		removeCustom(_id: string): void {}

		getCategories(): Record<string, number> {
			const categories: Record<string, number> = {};
			builtinTemplates.forEach((t) => {
				categories[t.category] = (categories[t.category] || 0) + 1;
			});
			return categories;
		}

		count(): number {
			return builtinTemplates.length;
		}

		exportCustom(): GalleryTemplate[] {
			return [];
		}

		importCustom(_templatesJson: string): number {
			return 0;
		}
	}

	class MockWasmRvfBuilder implements WasmRvfBuilder {
		private tools: unknown[] = [];
		private prompts: unknown[] = [];
		private skills: unknown[] = [];
		private mcpTools: unknown[] = [];
		private capabilities: unknown[] = [];
		private orchestrator: unknown = null;

		addTool(toolJson: string): void {
			this.tools.push(JSON.parse(toolJson));
		}

		addTools(toolsJson: string): void {
			this.tools.push(...JSON.parse(toolsJson));
		}

		addPrompt(promptJson: string): void {
			this.prompts.push(JSON.parse(promptJson));
		}

		addPrompts(promptsJson: string): void {
			this.prompts.push(...JSON.parse(promptsJson));
		}

		addSkill(skillJson: string): void {
			this.skills.push(JSON.parse(skillJson));
		}

		addSkills(skillsJson: string): void {
			this.skills.push(...JSON.parse(skillsJson));
		}

		addMcpTools(mcpToolsJson: string): void {
			this.mcpTools.push(...JSON.parse(mcpToolsJson));
		}

		addCapabilities(capsJson: string): void {
			this.capabilities.push(...JSON.parse(capsJson));
		}

		setOrchestrator(orchestratorJson: string): void {
			this.orchestrator = JSON.parse(orchestratorJson);
		}

		build(): Uint8Array {
			const content = {
				tools: this.tools,
				prompts: this.prompts,
				skills: this.skills,
				mcp_tools: this.mcpTools,
				capabilities: this.capabilities,
				orchestrator: this.orchestrator,
			};
			const encoder = new TextEncoder();
			const json = JSON.stringify(content);
			const jsonBytes = encoder.encode(json);
			const rvf = new Uint8Array(8 + jsonBytes.length);
			rvf.set([0x52, 0x56, 0x46, 0x00, 0x01, 0x00, 0x00, 0x00]); // RVF\0 + version
			rvf.set(jsonBytes, 8);
			return rvf;
		}
	}

	return {
		WasmMcpServer: MockWasmMcpServer as unknown as new () => WasmMcpServer,
		WasmGallery: MockWasmGallery as unknown as new () => WasmGallery,
		WasmRvfBuilder: MockWasmRvfBuilder as unknown as new () => WasmRvfBuilder,
	};
}

/**
 * Load the WASM module
 */
export async function loadWasm(): Promise<typeof wasmModule> {
	if (!browser) {
		return null;
	}

	if (wasmModule) {
		return wasmModule;
	}

	if (loadPromise) {
		return loadPromise;
	}

	loadPromise = (async () => {
		try {
			// Check if WASM is already loaded globally (e.g., via script tag in index.html)
			// To use real WASM, add this to your index.html:
			// <script type="module">
			//   import init, * as wasm from '/wasm/rvagent_wasm.js';
			//   await init();
			//   window.rvagent_wasm = wasm;
			// </script>
			if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).rvagent_wasm) {
				const wasm = (window as unknown as Record<string, unknown>).rvagent_wasm as {
					WasmMcpServer: new () => WasmMcpServer;
					WasmGallery: new () => WasmGallery;
					WasmRvfBuilder: new () => WasmRvfBuilder;
				};

				wasmModule = {
					WasmMcpServer: wasm.WasmMcpServer,
					WasmGallery: wasm.WasmGallery,
					WasmRvfBuilder: wasm.WasmRvfBuilder,
				};

				console.log("[WASM] rvagent-wasm loaded from global");
				return wasmModule;
			}

			// Use mock module for development/testing
			// The mock provides full MCP functionality with an in-memory virtual filesystem
			console.log("[WASM] Using mock rvagent-wasm implementation");
			wasmModule = createMockWasmModule();
			return wasmModule;
		} catch (error) {
			console.error("[WASM] Failed to initialize:", error);
			loadPromise = null;
			wasmModule = createMockWasmModule();
			return wasmModule;
		}
	})();

	return loadPromise;
}

/**
 * Check if WASM is loaded
 */
export function isWasmLoaded(): boolean {
	return wasmModule !== null;
}

/**
 * Get the WASM module (throws if not loaded)
 */
export function getWasm(): NonNullable<typeof wasmModule> {
	if (!wasmModule) {
		throw new Error("WASM module not loaded. Call loadWasm() first.");
	}
	return wasmModule;
}
