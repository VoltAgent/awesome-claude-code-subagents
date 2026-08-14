/**
 * Generates a Google favicon URL for the given server URL
 * @param serverUrl - The MCP server URL (e.g., "https://mcp.exa.ai/mcp")
 * @param size - The size of the favicon in pixels (default: 64)
 * @returns The Google favicon service URL
 */
export function getMcpServerFaviconUrl(serverUrl: string, size: number = 64): string {
	try {
		const parsed = new URL(serverUrl);
		// Extract root domain (e.g., "exa.ai" from "mcp.exa.ai")
		// Google's favicon service needs the root domain, not subdomains
		const hostnameParts = parsed.hostname.split(".");
		const rootDomain =
			hostnameParts.length >= 2 ? hostnameParts.slice(-2).join(".") : parsed.hostname;
		const domain = `${parsed.protocol}//${rootDomain}`;
		return `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodeURIComponent(domain)}`;
	} catch {
		// If URL parsing fails, just use the raw serverUrl - Google will handle it
		return `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodeURIComponent(serverUrl)}`;
	}
}
