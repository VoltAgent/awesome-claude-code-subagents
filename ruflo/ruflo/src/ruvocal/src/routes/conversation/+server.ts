import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { error, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { z } from "zod";
import type { Message } from "$lib/types/Message";
import { models, validateModel } from "$lib/server/models";
import { v4 } from "uuid";
import { authCondition } from "$lib/server/auth";
import { usageLimits } from "$lib/server/usageLimits";
import { MetricsServer } from "$lib/server/metrics";

export const POST: RequestHandler = async ({ locals, request }) => {
	const body = await request.text();

	let title = "";

	const parsedBody = z
		.object({
			fromShare: z.string().optional(),
			model: validateModel(models),
			preprompt: z.string().optional(),
		})
		.safeParse(JSON.parse(body));

	if (!parsedBody.success) {
		error(400, "Invalid request");
	}
	const values = parsedBody.data;

	const convCount = await collections.conversations.countDocuments(authCondition(locals));

	if (usageLimits?.conversations && convCount > usageLimits?.conversations) {
		error(429, "You have reached the maximum number of conversations. Delete some to continue.");
	}

	const model = models.find((m) => (m.id || m.name) === values.model);

	if (!model) {
		error(400, "Invalid model");
	}

	let messages: Message[] = [
		{
			id: v4(),
			from: "system",
			content: values.preprompt ?? "",
			createdAt: new Date(),
			updatedAt: new Date(),
			children: [],
			ancestors: [],
		},
	];

	let rootMessageId: Message["id"] = messages[0].id;

	if (values.fromShare) {
		const conversation = await collections.sharedConversations.findOne({
			_id: values.fromShare,
		});

		if (!conversation) {
			error(404, "Conversation not found");
		}

		// Strip <think> markers from imported titles
		title = conversation.title.replace(/<\/?think>/gi, "").trim();
		messages = conversation.messages;
		rootMessageId = conversation.rootMessageId ?? rootMessageId;
		values.model = conversation.model;
		values.preprompt = conversation.preprompt;
	}

	if (model.unlisted) {
		error(400, "Can't start a conversation with an unlisted model");
	}

	// use provided preprompt or model preprompt
	values.preprompt ??= model?.preprompt ?? "";

	if (messages && messages.length > 0 && messages[0].from === "system") {
		messages[0].content = values.preprompt;
	}

	const res = await collections.conversations.insertOne({
		_id: new ObjectId(),
		// Always store sanitized titles
		title: (title || "New Chat").replace(/<\/?think>/gi, "").trim(),
		rootMessageId,
		messages,
		model: values.model,
		preprompt: values.preprompt,
		createdAt: new Date(),
		updatedAt: new Date(),
		userAgent: request.headers.get("User-Agent") ?? undefined,
		...(locals.user ? { userId: locals.user._id } : { sessionId: locals.sessionId }),
		...(values.fromShare ? { meta: { fromShareId: values.fromShare } } : {}),
	});

	if (MetricsServer.isEnabled()) {
		MetricsServer.getMetrics().model.conversationsTotal.inc({ model: values.model });
	}

	return new Response(
		JSON.stringify({
			conversationId: res.insertedId.toString(),
		}),
		{ headers: { "Content-Type": "application/json" } }
	);
};

export const GET: RequestHandler = async () => {
	redirect(302, `${base}/`);
};
