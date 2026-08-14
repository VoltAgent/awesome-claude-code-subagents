// Client-safe HF utilities used in UI components

export function isStrictHfMcpLogin(urlString: string): boolean {
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
}
