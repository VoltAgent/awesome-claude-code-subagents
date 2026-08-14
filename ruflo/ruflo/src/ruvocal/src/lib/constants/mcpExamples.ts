import type { RouterExample } from "./routerExamples";

// Examples that showcase RuFlo MCP capabilities — agents, memory,
// intelligence, dev tools, and the WASM gallery.
export const mcpExamples: RouterExample[] = [
	{
		title: "Spawn a coding swarm",
		prompt:
			"Spawn a hierarchical swarm with 5 agents (architect, coder, tester, reviewer, security-auditor) to refactor a Python CLI tool to TypeScript. Use ruflo__swarm_init then ruflo__agent_spawn for each role.",
		followUps: [
			{
				title: "Show progress",
				prompt: "Use ruflo__progress_summary to show the swarm's current state.",
			},
			{
				title: "Add tests",
				prompt: "Spawn a tester agent to write integration tests for the swarm output.",
			},
		],
	},
	{
		title: "Save & recall memory",
		prompt:
			"Use ruflo__memory_store to save: namespace='preferences', key='editor_theme', value='solarized-dark'. Then ruflo__memory_search query='theme' to verify.",
		followUps: [
			{
				title: "List entries",
				prompt: "List all entries in the 'preferences' namespace using ruflo__memory_list.",
			},
			{
				title: "Semantic search",
				prompt: "Find related memories with ruvector__hooks_recall query='editor settings'.",
			},
		],
	},
	{
		title: "Route a task",
		prompt:
			"Use ruvector__hooks_route on the task: 'add OAuth2 to a SvelteKit API'. Tell me which agent type and topology you'd recommend.",
		followUps: [
			{
				title: "Spawn the agent",
				prompt: "Spawn the recommended agent with ruflo__agent_spawn.",
			},
			{
				title: "Track trajectory",
				prompt: "Begin a trajectory with ruvector__hooks_trajectory_begin to record the work.",
			},
		],
	},
	{
		title: "Analyze a diff",
		prompt:
			"Use ruflo__analyze_diff to assess risk and ruflo__analyze_diff-reviewers to suggest reviewers for the PR at github.com/ruvnet/ruflo/pull/1687.",
		followUps: [
			{
				title: "Repo metrics",
				prompt: "Get repository metrics with ruflo__github_repo_analyze for ruvnet/ruflo.",
			},
			{
				title: "Open issues",
				prompt: "List recent issues with ruflo__github_issue_track for ruvnet/ruflo.",
			},
		],
	},
	{
		title: "System health check",
		prompt:
			"Run ruflo__system_status, ruflo__performance_metrics, and ruflo__performance_bottleneck. Summarize anything concerning.",
		followUps: [
			{
				title: "Optimize",
				prompt: "Use ruflo__performance_optimize on the slowest component identified.",
			},
			{
				title: "Benchmark",
				prompt: "Run ruflo__performance_benchmark with --suite=all.",
			},
		],
	},
	{
		title: "Browse WASM gallery",
		prompt:
			"Show me the templates in the WASM gallery (browser-side rvagent server) and explain what each one does.",
		followUps: [
			{
				title: "Load a template",
				prompt: "Load the most popular template into the local WASM MCP server.",
			},
		],
	},
	{
		title: "Plan with GOAP",
		prompt:
			"Use the goal-planner pattern: I want to migrate a Postgres schema with zero downtime. Decompose into ruflo agents and tasks.",
		followUps: [
			{
				title: "Risk analysis",
				prompt: "Run ruflo__analyze_file-risk on the migration file.",
			},
		],
	},
	{
		title: "Train neural pattern",
		prompt:
			"Use ruvector__neural_train to learn from this successful pattern: 'JWT auth with refresh tokens — store refresh in httpOnly cookie, access in memory'.",
		followUps: [
			{
				title: "Predict",
				prompt: "Use ruvector__neural_predict for the task 'add session-based auth'.",
			},
		],
	},
];
