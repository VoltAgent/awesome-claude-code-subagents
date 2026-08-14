// Minimal shared helpers for HF MCP token forwarding

export const hasAuthHeader = (h?: Record<string, string>) =>
	!!h && Object.keys(h).some((k) => k.toLowerCase() === "authorization");

export const isStrictHfMcpLogin = (urlString: string) => {
	try {
		const u = new URL(urlString);
		const host = u.hostname.toLowerCase();
		const allowedHosts = new Set(["hf.co", "huggingface.co"]);
		return (
			u.protocol === "https:" &&
			allowedHosts.has(host) &&
			u.pathname === "/mcp" &&
			u.search === "?login"
		);
	} catch {
		return false;
	}
};

export const hasNonEmptyToken = (tok: unknown): tok is string =>
	typeof tok === "string" && tok.trim().length > 0;

export const isExaMcpServer = (urlString: string): boolean => {
	try {
		const u = new URL(urlString);
		return u.protocol === "https:" && u.hostname.toLowerCase() === "mcp.exa.ai";
	} catch {
		return false;
	}
};
