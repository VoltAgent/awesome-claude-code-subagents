import { config } from "$lib/server/config";
import { logger } from "$lib/server/logger";
import type { EndpointMessage } from "../endpoints/endpoints";
import type { Route, RouteConfig, RouteSelection } from "./types";
import { getRoutes } from "./policy";
import { getApiToken } from "$lib/server/apiToken";

const DEFAULT_LAST_TURNS = 16;

/**
 * Trim a message by keeping start and end, replacing middle with minimal indicator.
 * Uses simple ellipsis since router only needs context for intent classification, not exact content.
 * @param content - The message content to trim
 * @param maxLength - Maximum total length (including indicator)
 * @returns Trimmed content with start, ellipsis, and end
 */
function trimMiddle(content: string, maxLength: number): string {
	if (content.length <= maxLength) return content;

	const indicator = "…";
	const availableLength = maxLength - indicator.length;

	if (availableLength <= 0) {
		// If no room even for indicator, just hard truncate
		return content.slice(0, maxLength);
	}

	// Reserve more space for the start (typically contains context)
	const startLength = Math.ceil(availableLength * 0.6);
	const endLength = availableLength - startLength;

	// Bug fix: slice(-0) returns entire string, so check for endLength <= 0
	if (endLength <= 0) {
		// Not enough space for end portion, just use start + indicator
		return content.slice(0, availableLength) + indicator;
	}

	const start = content.slice(0, startLength);
	const end = content.slice(-endLength);

	return start + indicator + end;
}

const PROMPT_TEMPLATE = `
You are a helpful assistant designed to find the best suited route.
You are provided with route description within <routes></routes> XML tags:

<routes>

{routes}

</routes>

<conversation>

{conversation}

</conversation>

Your task is to decide which route is best suit with user intent on the conversation in <conversation></conversation> XML tags.

Follow those instructions:
1. Use prior turns to choose the best route for the current message if needed.
2. If no route match the full conversation respond with other route {"route": "other"}.
3. Analyze the route descriptions and find the best match route for user latest intent.
4. Respond only with the route name that best matches the user's request, using the exact name in the <routes> block.
Based on your analysis, provide your response in the following JSON format if you decide to match any route:
{"route": "route_name"}
`.trim();

function lastNTurns<T>(arr: T[], n = DEFAULT_LAST_TURNS) {
	if (!Array.isArray(arr)) return [] as T[];
	return arr.slice(-n);
}

function toRouterPrompt(messages: EndpointMessage[], routes: Route[]) {
	const simpleRoutes: RouteConfig[] = routes.map((r) => ({
		name: r.name,
		description: r.description,
	}));
	const maxAssistantLength = parseInt(config.LLM_ROUTER_MAX_ASSISTANT_LENGTH || "1000", 10);
	const maxPrevUserLength = parseInt(config.LLM_ROUTER_MAX_PREV_USER_LENGTH || "1000", 10);

	const convo = messages
		.map((m) => ({ role: m.from, content: m.content }))
		.filter((m) => typeof m.content === "string" && m.content.trim() !== "");

	// Find the last user message index to preserve its full content
	const lastUserIndex = convo.findLastIndex((m) => m.role === "user");

	const trimmedConvo = convo.map((m, idx) => {
		if (typeof m.content !== "string") return m;

		// Trim assistant messages to reduce routing prompt size and improve latency
		// Keep start and end for better context understanding
		if (m.role === "assistant") {
			return {
				...m,
				content: trimMiddle(m.content, maxAssistantLength),
			};
		}

		// Trim previous user messages, but keep the latest user message full
		// Keep start and end to preserve both context and question
		if (m.role === "user" && idx !== lastUserIndex) {
			return {
				...m,
				content: trimMiddle(m.content, maxPrevUserLength),
			};
		}

		return m;
	});

	return PROMPT_TEMPLATE.replace("{routes}", JSON.stringify(simpleRoutes)).replace(
		"{conversation}",
		JSON.stringify(lastNTurns(trimmedConvo))
	);
}

function parseRouteName(text: string): string | undefined {
	if (!text) return;
	try {
		const obj = JSON.parse(text);
		if (typeof obj?.route === "string" && obj.route.trim()) return obj.route.trim();
	} catch {}
	const m = text.match(/["']route["']\s*:\s*["']([^"']+)["']/);
	if (m?.[1]) return m[1].trim();
	try {
		const obj = JSON.parse(text.replace(/'/g, '"'));
		if (typeof obj?.route === "string" && obj.route.trim()) return obj.route.trim();
	} catch {}
	return;
}

export async function archSelectRoute(
	messages: EndpointMessage[],
	traceId: string | undefined,
	locals: App.Locals | undefined
): Promise<RouteSelection> {
	const routes = await getRoutes();
	const prompt = toRouterPrompt(messages, routes);

	const baseURL = (config.LLM_ROUTER_ARCH_BASE_URL || "").replace(/\/$/, "");
	const archModel = config.LLM_ROUTER_ARCH_MODEL || "router/omni";

	if (!baseURL) {
		logger.warn("LLM_ROUTER_ARCH_BASE_URL not set; routing will fail over to fallback.");
		return { routeName: "arch_router_failure" };
	}

	const headers: HeadersInit = {
		Authorization: `Bearer ${getApiToken(locals)}`,
		"Content-Type": "application/json",
		// Bill to organization if configured (HuggingChat only)
		...(config.isHuggingChat && locals?.billingOrganization
			? { "X-HF-Bill-To": locals.billingOrganization }
			: {}),
	};
	const body = {
		model: archModel,
		messages: [{ role: "user", content: prompt }],
		temperature: 0,
		max_tokens: 16,
		stream: false,
	};

	const ctrl = new AbortController();
	const timeoutMs = Number(config.LLM_ROUTER_ARCH_TIMEOUT_MS || 10000);
	const to = setTimeout(() => ctrl.abort(), timeoutMs);

	try {
		const resp = await fetch(`${baseURL}/chat/completions`, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: ctrl.signal,
		});
		clearTimeout(to);
		if (!resp.ok) {
			// Extract error message from response
			let errorMessage = `arch-router ${resp.status}`;
			try {
				const errorData = await resp.json();
				// Try to extract message from OpenAI-style error format
				if (errorData.error?.message) {
					errorMessage = errorData.error.message;
				} else if (errorData.message) {
					errorMessage = errorData.message;
				}
			} catch {
				// If JSON parsing fails, use status text
				errorMessage = resp.statusText || errorMessage;
			}

			logger.warn(
				{ status: resp.status, error: errorMessage, traceId },
				"[arch] router returned error"
			);

			return {
				routeName: "arch_router_failure",
				error: {
					message: errorMessage,
					statusCode: resp.status,
				},
			};
		}
		const data: { choices: { message: { content: string } }[] } = await resp.json();
		const text = (data?.choices?.[0]?.message?.content ?? "").toString().trim();
		const raw = parseRouteName(text);

		const other = config.LLM_ROUTER_OTHER_ROUTE || "casual_conversation";
		const chosen = raw === "other" ? other : raw || "casual_conversation";
		const exists = routes.some((r) => r.name === chosen);
		return { routeName: exists ? chosen : "casual_conversation" };
	} catch (e) {
		clearTimeout(to);
		const err = e as Error;
		logger.warn({ err: String(e), traceId }, "arch router selection failed");

		// Return error with context but no status code (network/timeout errors)
		return {
			routeName: "arch_router_failure",
			error: {
				message: err.message || String(e),
			},
		};
	}
}
