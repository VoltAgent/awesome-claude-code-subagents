import { config } from "$lib/server/config";
import { logger } from "$lib/server/logger";
import type { McpServerConfig } from "./httpClient";
import { resetMcpToolsCache } from "./tools";

let cachedRaw: string | null = null;
let cachedServers: McpServerConfig[] = [];

function parseServers(raw: string): McpServerConfig[] {
	if (!raw) return [];

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed
			.map((entry) => {
				if (!entry || typeof entry !== "object") return undefined;
				const name = (entry as Record<string, unknown>).name;
				const url = (entry as Record<string, unknown>).url;
				if (typeof name !== "string" || !name.trim()) return undefined;
				if (typeof url !== "string" || !url.trim()) return undefined;

				const headersRaw = (entry as Record<string, unknown>).headers;
				let headers: Record<string, string> | undefined;
				if (headersRaw && typeof headersRaw === "object" && !Array.isArray(headersRaw)) {
					const headerEntries = Object.entries(headersRaw as Record<string, unknown>).filter(
						(entry): entry is [string, string] => typeof entry[1] === "string"
					);
					headers = Object.fromEntries(headerEntries);
				}

				return headers ? { name, url, headers } : { name, url };
			})
			.filter((server): server is McpServerConfig => Boolean(server));
	} catch (error) {
		logger.warn({ err: error }, "[mcp] failed to parse MCP_SERVERS env");
		return [];
	}
}

function setServers(raw: string) {
	cachedServers = parseServers(raw);
	cachedRaw = raw;
	resetMcpToolsCache();
	logger.debug({ count: cachedServers.length }, "[mcp] loaded server configuration");
	console.log(
		`[MCP] Loaded ${cachedServers.length} server(s):`,
		cachedServers.map((s) => s.name).join(", ") || "none"
	);
}

export function loadMcpServersOnStartup(): McpServerConfig[] {
	const raw = config.MCP_SERVERS || "[]";
	setServers(raw);
	return cachedServers;
}

export function refreshMcpServersIfChanged(): void {
	const currentRaw = config.MCP_SERVERS || "[]";
	if (cachedRaw === null) {
		setServers(currentRaw);
		return;
	}

	if (currentRaw !== cachedRaw) {
		setServers(currentRaw);
	}
}

export function getMcpServers(): McpServerConfig[] {
	if (cachedRaw === null) {
		loadMcpServersOnStartup();
	}
	return cachedServers;
}
