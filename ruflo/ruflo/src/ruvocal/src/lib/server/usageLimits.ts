import { z } from "zod";
import { config } from "$lib/server/config";
import JSON5 from "json5";

const sanitizeJSONEnv = (val: string, fallback: string) => {
	const raw = (val ?? "").trim();
	const unquoted = raw.startsWith("`") && raw.endsWith("`") ? raw.slice(1, -1) : raw;
	return unquoted || fallback;
};

// RATE_LIMIT is the legacy way to define messages per minute limit
export const usageLimitsSchema = z
	.object({
		conversations: z.coerce.number().optional(), // how many conversations
		messages: z.coerce.number().optional(), // how many messages in a conversation
		messageLength: z.coerce.number().optional(), // how long can a message be before we cut it off
		messagesPerMinute: z
			.preprocess((val) => {
				if (val === undefined) {
					return config.RATE_LIMIT;
				}
				return val;
			}, z.coerce.number().optional())
			.optional(), // how many messages per minute
	})
	.optional();

export const usageLimits = usageLimitsSchema.parse(
	JSON5.parse(sanitizeJSONEnv(config.USAGE_LIMITS, "{}"))
);
