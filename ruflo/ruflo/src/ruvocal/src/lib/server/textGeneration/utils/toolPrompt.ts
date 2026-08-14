import type { OpenAiTool } from "$lib/server/mcp/tools";

export function buildToolPreprompt(tools: OpenAiTool[], autopilot?: boolean): string {
	if (!Array.isArray(tools) || tools.length === 0) return "";
	const names = tools
		.map((t) => (t?.function?.name ? String(t.function.name) : ""))
		.filter((s) => s.length > 0);
	if (names.length === 0) return "";
	const now = new Date();
	const currentDate = now.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	const lines = [
		`You have access to these tools: ${names.join(", ")}.`,
		`Today's date: ${currentDate} (${isoDate}).`,
	];

	if (autopilot) {
		lines.push(
			`AUTOPILOT MODE ENABLED — PARALLEL SWARM EXECUTION. Follow these rules STRICTLY:`,
			`1. NEVER ask for confirmation. Make reasonable assumptions. Proceed immediately.`,
			`2. ALWAYS call MULTIPLE tools in parallel. If a task needs search + memory + routing, call ALL THREE at once in a single response — not sequentially.`,
			`3. For complex tasks: spawn a SWARM of parallel tool calls. Example: call search, web_research, memory_search, and hooks_route ALL in one response.`,
			`4. After getting results, immediately call the NEXT BATCH of tools in parallel. Keep chaining until done.`,
			`5. If a tool fails, try alternatives immediately — do not report failure and stop.`,
			`6. Only provide a final text response when ALL work is done and you have nothing left to execute.`,
			`7. NEVER explain what you plan to do. Just DO IT by calling tools.`,
			`8. Maximize parallel execution: if you can call 3+ tools at once, DO IT. Sequential is only for dependencies.`,
		);
	} else {
		lines.push(
			`IMPORTANT: Do NOT call a tool unless the user's request requires capabilities you lack (e.g., real-time data, image generation, code execution) or external information you do not have. For tasks like writing code, creative writing, math, or building apps, respond directly without tools. When in doubt, do not use a tool.`,
		);
	}

	lines.push(
		`PARALLEL TOOL CALLS: When multiple tool calls are needed and they are independent of each other (i.e., one does not need the result of another), call them all at once in a single response instead of one at a time. Only chain tool calls sequentially when a later call depends on an earlier call's output.`,
		`SEARCH: Use 3-6 precise keywords. For historical events, include the year the event occurred. For recent or current topics, use today's year (${now.getFullYear()}). When a tool accepts date-range parameters (e.g., startPublishedDate, endPublishedDate), always use today's date (${isoDate}) as the end date unless the user specifies otherwise. For multi-part questions, search each part separately.`,
		`ANSWER: State only facts explicitly in the results. If info is missing or results conflict, say so. Never fabricate URLs or facts.`,
		`INTERACTIVE APPS: When asked to build an interactive application, game, or visualization without a specific language/framework preference, create a single self-contained HTML file with embedded CSS and JavaScript.`,
		`If a tool generates an image, you can inline it directly: ![alt text](image_url).`,
		`If a tool needs an image, set its image field ("input_image", "image", or "image_url") to a reference like "image_1", "image_2", etc. (ordered by when the user uploaded them).`,
		`Default to image references; only use a full http(s) URL when the tool description explicitly asks for one, or reuse a URL a previous tool returned.`,
	);
	return lines.join(" ");
}
