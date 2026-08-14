export type RouterFollowUp = {
	title: string;
	prompt: string;
};

export type RouterExampleAttachment = {
	src: string;
};

export type RouterExample = {
	title: string;
	prompt: string;
	followUps?: RouterFollowUp[];
	attachments?: RouterExampleAttachment[];
};

// RuFlo-themed router examples — shown on the empty-state welcome screen
// when the user hasn't enabled the full MCP toolset. Keep these light enough
// that even a model without tool-calling can answer (no explicit tool names).
export const routerExamples: RouterExample[] = [
	{
		title: "Build a coding swarm",
		prompt: "Design a 5-agent coding swarm to refactor a Python CLI to TypeScript. Suggest topology, roles, and the order each agent should run.",
		followUps: [
			{
				title: "Add tests",
				prompt: "Add a tester agent and a security-auditor. What should each one own?",
			},
			{
				title: "Trade-offs",
				prompt: "Compare hierarchical vs mesh topology for this swarm.",
			},
			{
				title: "Failure mode",
				prompt: "What happens if the architect agent fails halfway through?",
			},
		],
	},
	{
		title: "Memory & recall",
		prompt: "Explain how RuFlo's persistent memory works across sessions, and give me a 3-step example of saving a preference and recalling it later.",
		followUps: [
			{
				title: "Namespaces",
				prompt: "When should I use separate memory namespaces vs one shared namespace?",
			},
			{
				title: "Vector vs key",
				prompt: "When should I use semantic search vs exact key retrieval?",
			},
		],
	},
	{
		title: "Plan a migration",
		prompt: "Plan a zero-downtime Postgres schema migration. Use Goal-Oriented Action Planning to break it into phases with rollback points.",
		followUps: [
			{
				title: "Risk scoring",
				prompt: "Which phases are highest-risk and how would you mitigate them?",
			},
			{
				title: "Verification",
				prompt: "How would you verify each phase before proceeding?",
			},
		],
	},
	{
		title: "Review a diff",
		prompt: "What signals would you use to risk-score a code diff (size, files touched, hot paths) and how would you suggest reviewers?",
		followUps: [
			{
				title: "Auto-classify",
				prompt: "Classify a diff as feature/bugfix/refactor/docs from its file mix and message.",
			},
			{
				title: "Security focus",
				prompt: "Which patterns in a diff should trigger a security review?",
			},
		],
	},
	{
		title: "Explain HNSW",
		prompt: "Explain HNSW vector indexing in plain language, and why it's 150x-12,500x faster than brute-force similarity search at scale.",
		followUps: [
			{
				title: "Quantization",
				prompt: "What does Int8 quantization buy you, and what's the trade-off?",
			},
			{
				title: "Use case",
				prompt: "When would you reach for HNSW vs a relational keyword index?",
			},
		],
	},
	{
		title: "Choose a topology",
		prompt: "I have 12 agents to coordinate on a multi-step refactor. Compare hierarchical, mesh, hierarchical-mesh, and adaptive topologies — pick one and explain why.",
		followUps: [
			{
				title: "Anti-drift",
				prompt: "What's 'anti-drift' coordination and why does it matter for >8 agents?",
			},
			{
				title: "Consensus",
				prompt: "Compare Raft, Byzantine, gossip, and CRDT consensus for this swarm.",
			},
		],
	},
	{
		title: "Track a long task",
		prompt: "I'm starting a 4-week migration. How should I structure horizon tracking, milestone checkpoints, and drift detection in RuFlo?",
		followUps: [
			{
				title: "Resume after break",
				prompt: "What state should be persisted so I can resume next week?",
			},
		],
	},
	{
		title: "Local WASM tools",
		prompt: "What's the difference between the in-browser WASM MCP server and the cloud bridge MCP servers? When should I use each?",
		followUps: [
			{
				title: "Privacy",
				prompt: "Which tools never leave my browser?",
			},
			{
				title: "Offline",
				prompt: "What can RuFlo still do if my network drops?",
			},
		],
	},
];
