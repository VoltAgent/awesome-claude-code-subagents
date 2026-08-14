import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// We mock the MCP SDK transports + Client so we can drive the connection
// outcomes deterministically. The point of these tests is to verify that
// clientPool.ts:
//   1. Skips the SSE fallback when the first transport returns 4xx/5xx (e.g. 429)
//      because retrying via SSE will hit the same upstream and produce the
//      same rate-limit response.
//   2. Surfaces a typed McpRateLimitedError on 429 with retryAfterMs derived
//      from the upstream Retry-After header when present.
//   3. Memoizes the failure for a cooldown window so subsequent getClient
//      calls don't pound the upstream.
//   4. Still falls back to SSE for transport-level / network errors that
//      have no HTTP status (the "Streamable HTTP server is not running" path).

const httpConnectMock = vi.fn();
const sseConnectMock = vi.fn();

vi.mock("@modelcontextprotocol/sdk/client", () => {
	class MockClient {
		private nextTransportIsHttp = true;
		async connect(transport: unknown) {
			// The transport instances are tagged below in the streamableHttp/sse mocks.
			const isHttp = (transport as { __kind?: string }).__kind === "http";
			if (isHttp) {
				return httpConnectMock();
			}
			return sseConnectMock();
		}
		async close() {}
		async callTool() {
			return { content: [] };
		}
	}
	return { Client: MockClient };
});

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => {
	class StreamableHTTPError extends Error {
		code: number;
		constructor(code: number, message: string) {
			super(`Streamable HTTP error: ${message}`);
			this.code = code;
			this.name = "StreamableHTTPError";
		}
	}
	class StreamableHTTPClientTransport {
		__kind = "http";
		constructor(_url: URL, _opts: unknown) {}
	}
	return { StreamableHTTPError, StreamableHTTPClientTransport };
});

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => {
	class SSEClientTransport {
		__kind = "sse";
		constructor(_url: URL, _opts: unknown) {}
	}
	return { SSEClientTransport };
});

// Import AFTER vi.mock declarations.
import { getClient, drainPool, McpRateLimitedError } from "./clientPool";

const server = { name: "test-server", url: "https://example.test/mcp", headers: {} };

describe("clientPool — rate-limit and HTTP error handling", () => {
	beforeEach(async () => {
		await drainPool();
		httpConnectMock.mockReset();
		sseConnectMock.mockReset();
	});

	afterEach(async () => {
		await drainPool();
	});

	it("skips SSE fallback on 429 and throws McpRateLimitedError", async () => {
		httpConnectMock.mockRejectedValue(
			new StreamableHTTPError(
				429,
				"Error POSTing to endpoint: Rate exceeded. Retry-After: 7"
			)
		);

		await expect(getClient(server)).rejects.toBeInstanceOf(McpRateLimitedError);
		// Critical: SSE was NOT attempted — would just hit the same upstream.
		expect(sseConnectMock).not.toHaveBeenCalled();
		expect(httpConnectMock).toHaveBeenCalledTimes(1);
	});

	it("honors Retry-After when present in the error message", async () => {
		httpConnectMock.mockRejectedValue(
			new StreamableHTTPError(
				429,
				"Error POSTing to endpoint: Rate exceeded. Retry-After: 12"
			)
		);

		try {
			await getClient(server);
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(McpRateLimitedError);
			expect((err as McpRateLimitedError).retryAfterMs).toBe(12_000);
			expect((err as McpRateLimitedError).status).toBe(429);
			expect((err as McpRateLimitedError).serverName).toBe("test-server");
		}
	});

	it("memoizes the 429 failure and skips network on subsequent calls during cooldown", async () => {
		httpConnectMock.mockRejectedValue(
			new StreamableHTTPError(429, "Error POSTing to endpoint: Rate exceeded. Retry-After: 5")
		);

		await expect(getClient(server)).rejects.toBeInstanceOf(McpRateLimitedError);
		// Second call within the cooldown window: must NOT touch the upstream again.
		await expect(getClient(server)).rejects.toBeInstanceOf(McpRateLimitedError);
		expect(httpConnectMock).toHaveBeenCalledTimes(1);
		expect(sseConnectMock).not.toHaveBeenCalled();
	});

	it("skips SSE fallback on 4xx (e.g. 401)", async () => {
		httpConnectMock.mockRejectedValue(
			new StreamableHTTPError(401, "Unauthorized")
		);
		await expect(getClient(server)).rejects.toThrow(/HTTP 401/);
		expect(sseConnectMock).not.toHaveBeenCalled();
	});

	it("skips SSE fallback on 5xx (e.g. 503)", async () => {
		httpConnectMock.mockRejectedValue(
			new StreamableHTTPError(503, "Service Unavailable")
		);
		await expect(getClient(server)).rejects.toThrow(/HTTP 503/);
		expect(sseConnectMock).not.toHaveBeenCalled();
	});

	it("falls back to SSE on transport-level / network errors with no HTTP status", async () => {
		httpConnectMock.mockRejectedValue(new Error("ECONNREFUSED"));
		sseConnectMock.mockResolvedValue(undefined);

		const client = await getClient(server);
		expect(client).toBeDefined();
		expect(httpConnectMock).toHaveBeenCalledTimes(1);
		expect(sseConnectMock).toHaveBeenCalledTimes(1);
	});

	it("falls back to SSE on 408 Request Timeout (recoverable)", async () => {
		httpConnectMock.mockRejectedValue(
			new StreamableHTTPError(408, "Request Timeout")
		);
		sseConnectMock.mockResolvedValue(undefined);

		const client = await getClient(server);
		expect(client).toBeDefined();
		expect(sseConnectMock).toHaveBeenCalledTimes(1);
	});

	it("surfaces 429 even when the SSE fallback also reports 429", async () => {
		httpConnectMock.mockRejectedValue(new Error("transport mismatch")); // forces SSE attempt
		sseConnectMock.mockRejectedValue(
			new Error("SSE error: Non-200 status code (429)")
		);

		try {
			await getClient(server);
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(McpRateLimitedError);
			expect((err as McpRateLimitedError).status).toBe(429);
		}
	});
});
