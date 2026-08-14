import { config } from "$lib/server/config";
import { logger } from "$lib/server/logger";
import type { ProcessedModel } from "../models";

export const ROUTER_TOOLS_ROUTE = "agentic";

type LocalsWithMcp = App.Locals & {
	mcp?: {
		selectedServers?: unknown[];
		selectedServerNames?: unknown[];
	};
};

export function isRouterToolsBypassEnabled(): boolean {
	return (config.LLM_ROUTER_ENABLE_TOOLS || "").toLowerCase() === "true";
}

export function hasActiveToolsSelection(locals: App.Locals | undefined): boolean {
	try {
		const reqMcp = (locals as LocalsWithMcp | undefined)?.mcp;
		const byConfig =
			Array.isArray(reqMcp?.selectedServers) && (reqMcp?.selectedServers?.length ?? 0) > 0;
		const byName =
			Array.isArray(reqMcp?.selectedServerNames) && (reqMcp?.selectedServerNames?.length ?? 0) > 0;
		return Boolean(byConfig || byName);
	} catch {
		return false;
	}
}

export function pickToolsCapableModel(
	models: ProcessedModel[] | undefined
): ProcessedModel | undefined {
	const preferredRaw = (config as unknown as Record<string, string>).LLM_ROUTER_TOOLS_MODEL;
	const preferred = preferredRaw?.trim();
	if (!preferred) {
		logger.warn("[router] tools bypass requested but LLM_ROUTER_TOOLS_MODEL is not set");
		return undefined;
	}
	if (!models?.length) return undefined;
	const found = models.find((m) => m.id === preferred || m.name === preferred);
	if (!found) {
		logger.warn(
			{ configuredModel: preferred },
			"[router] configured tools model not found; falling back to Arch routing"
		);
		return undefined;
	}
	logger.info({ model: found.id ?? found.name }, "[router] using configured tools model");
	return found;
}
