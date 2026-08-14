import { collectDefaultMetrics, Counter, Registry, Summary } from "prom-client";
import { logger } from "$lib/server/logger";
import { config } from "$lib/server/config";
import { createServer, type Server as HttpServer } from "http";
import { onExit } from "./exitHandler";

type ModelLabel = "model";
type ToolLabel = "tool";

interface Metrics {
	model: {
		conversationsTotal: Counter<ModelLabel>;
		messagesTotal: Counter<ModelLabel>;
		tokenCountTotal: Counter<ModelLabel>;
		timePerOutputToken: Summary<ModelLabel>;
		timeToFirstToken: Summary<ModelLabel>;
		latency: Summary<ModelLabel>;
		votesPositive: Counter<ModelLabel>;
		votesNegative: Counter<ModelLabel>;
	};
	webSearch: {
		requestCount: Counter;
		pageFetchCount: Counter;
		pageFetchCountError: Counter;
		pageFetchDuration: Summary;
		embeddingDuration: Summary;
	};
	tool: {
		toolUseCount: Counter<ToolLabel>;
		toolUseCountError: Counter<ToolLabel>;
		toolUseDuration: Summary<ToolLabel>;
		timeToChooseTools: Summary<ModelLabel>;
	};
}

export class MetricsServer {
	private static instance: MetricsServer | undefined;
	private readonly enabled: boolean;
	private readonly register: Registry;
	private readonly metrics: Metrics;
	private httpServer: HttpServer | undefined;

	private constructor() {
		this.enabled = config.METRICS_ENABLED === "true";
		this.register = new Registry();

		if (this.enabled) {
			collectDefaultMetrics({ register: this.register });
		}

		this.metrics = this.createMetrics();

		if (this.enabled) {
			this.startStandaloneServer();
		}
	}

	public static getInstance(): MetricsServer {
		if (!MetricsServer.instance) {
			MetricsServer.instance = new MetricsServer();
		}
		return MetricsServer.instance;
	}

	public static getMetrics(): Metrics {
		return MetricsServer.getInstance().metrics;
	}

	public static isEnabled(): boolean {
		return config.METRICS_ENABLED === "true";
	}

	public async render(): Promise<string> {
		if (!this.enabled) {
			return "";
		}

		return this.register.metrics();
	}

	private createMetrics(): Metrics {
		const labelNames: ModelLabel[] = ["model"];
		const toolLabelNames: ToolLabel[] = ["tool"];

		const noopRegistry = new Registry();

		const registry = this.enabled ? this.register : noopRegistry;

		return {
			model: {
				conversationsTotal: new Counter<ModelLabel>({
					name: "model_conversations_total",
					help: "Total number of conversations",
					labelNames,
					registers: [registry],
				}),
				messagesTotal: new Counter<ModelLabel>({
					name: "model_messages_total",
					help: "Total number of messages",
					labelNames,
					registers: [registry],
				}),
				tokenCountTotal: new Counter<ModelLabel>({
					name: "model_token_count_total",
					help: "Total number of tokens emitted by the model",
					labelNames,
					registers: [registry],
				}),
				timePerOutputToken: new Summary<ModelLabel>({
					name: "model_time_per_output_token_ms",
					help: "Per-token latency in milliseconds",
					labelNames,
					registers: [registry],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
				timeToFirstToken: new Summary<ModelLabel>({
					name: "model_time_to_first_token_ms",
					help: "Time to first token in milliseconds",
					labelNames,
					registers: [registry],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
				latency: new Summary<ModelLabel>({
					name: "model_latency_ms",
					help: "Total time to complete a response in milliseconds",
					labelNames,
					registers: [registry],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
				votesPositive: new Counter<ModelLabel>({
					name: "model_votes_positive_total",
					help: "Total number of positive votes on model messages",
					labelNames,
					registers: [registry],
				}),
				votesNegative: new Counter<ModelLabel>({
					name: "model_votes_negative_total",
					help: "Total number of negative votes on model messages",
					labelNames,
					registers: [registry],
				}),
			},
			webSearch: {
				requestCount: new Counter({
					name: "web_search_request_count",
					help: "Total number of web search requests",
					registers: [registry],
				}),
				pageFetchCount: new Counter({
					name: "web_search_page_fetch_count",
					help: "Total number of web search page fetches",
					registers: [registry],
				}),
				pageFetchCountError: new Counter({
					name: "web_search_page_fetch_count_error",
					help: "Total number of web search page fetch errors",
					registers: [registry],
				}),
				pageFetchDuration: new Summary({
					name: "web_search_page_fetch_duration_ms",
					help: "Duration of web search page fetches in milliseconds",
					registers: [registry],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
				embeddingDuration: new Summary({
					name: "web_search_embedding_duration_ms",
					help: "Duration of web search embeddings in milliseconds",
					registers: [registry],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
			},
			tool: {
				toolUseCount: new Counter<ToolLabel>({
					name: "tool_use_count",
					help: "Total number of tool invocations",
					labelNames: toolLabelNames,
					registers: [registry],
				}),
				toolUseCountError: new Counter<ToolLabel>({
					name: "tool_use_count_error",
					help: "Total number of tool invocation errors",
					labelNames: toolLabelNames,
					registers: [registry],
				}),
				toolUseDuration: new Summary<ToolLabel>({
					name: "tool_use_duration_ms",
					help: "Duration of tool invocations in milliseconds",
					labelNames: toolLabelNames,
					registers: [registry],
					maxAgeSeconds: 30 * 60,
					ageBuckets: 5,
				}),
				timeToChooseTools: new Summary<ModelLabel>({
					name: "time_to_choose_tools_ms",
					help: "Time spent selecting tools in milliseconds",
					labelNames,
					registers: [registry],
					maxAgeSeconds: 5 * 60,
					ageBuckets: 5,
				}),
			},
		};
	}

	private startStandaloneServer() {
		const port = Number(config.METRICS_PORT || "5565");

		if (!Number.isInteger(port) || port < 0 || port > 65535) {
			logger.warn(`Invalid METRICS_PORT value: ${config.METRICS_PORT}`);
			return;
		}

		this.httpServer = createServer(async (req, res) => {
			if (req.method !== "GET") {
				res.statusCode = 405;
				res.end("Method Not Allowed");
				return;
			}

			try {
				const payload = await this.render();
				res.setHeader("Content-Type", "text/plain; version=0.0.4");
				res.end(payload);
			} catch (error) {
				logger.error(error, "Failed to render metrics");
				res.statusCode = 500;
				res.end("Failed to render metrics");
			}
		});

		this.httpServer.listen(port, () => {
			logger.info(`Metrics server listening on port ${port}`);
		});

		onExit(async () => {
			if (!this.httpServer) return;
			logger.info("Shutting down metrics server...");
			await new Promise<void>((resolve, reject) => {
				this.httpServer?.close((err) => {
					if (err) {
						reject(err);
						return;
					}
					resolve();
				});
			}).catch((error) => logger.error(error, "Failed to close metrics server"));
			this.httpServer = undefined;
		});
	}
}
