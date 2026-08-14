import pino from "pino";
import { dev } from "$app/environment";
import { config } from "$lib/server/config";
import { getRequestContext } from "$lib/server/requestContext";

let options: pino.LoggerOptions = {};

if (dev) {
	options = {
		transport: {
			target: "pino-pretty",
			options: {
				colorize: true,
			},
		},
	};
}

const baseLogger = pino({
	...options,
	messageKey: "message",
	level: config.LOG_LEVEL || "info",
	formatters: {
		level: (label) => {
			return { level: label };
		},
	},
	mixin() {
		const ctx = getRequestContext();
		if (!ctx) return {};

		const result: Record<string, string | number> = {};
		if (ctx.requestId) result.request_id = ctx.requestId;
		if (ctx.url) result.url = ctx.url;
		if (ctx.ip) result.ip = ctx.ip;
		if (ctx.user) result.user = ctx.user;
		if (ctx.statusCode) result.status_code = ctx.statusCode;
		return result;
	},
});

export const logger = baseLogger;
