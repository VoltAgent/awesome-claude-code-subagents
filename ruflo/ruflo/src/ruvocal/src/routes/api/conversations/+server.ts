import { collections } from "$lib/server/database";
import { authCondition } from "$lib/server/auth";
import type { Conversation } from "$lib/types/Conversation";
import { CONV_NUM_PER_PAGE } from "$lib/constants/pagination";

export async function GET({ locals, url }) {
	const p = parseInt(url.searchParams.get("p") ?? "0");
	if (locals.user?._id || locals.sessionId) {
		const convs = await collections.conversations
			.find({
				...authCondition(locals),
			})
			.project<Pick<Conversation, "_id" | "title" | "updatedAt" | "model" | never>>({
				title: 1,
				updatedAt: 1,
				model: 1,
			})
			.sort({ updatedAt: -1 })
			.skip(p * CONV_NUM_PER_PAGE)
			.limit(CONV_NUM_PER_PAGE)
			.toArray();

		if (convs.length === 0) {
			return Response.json([]);
		}
		const res = convs.map((conv) => ({
			_id: conv._id,
			id: conv._id, // legacy param iOS
			title: conv.title,
			updatedAt: conv.updatedAt,
			model: conv.model,
			modelId: conv.model, // legacy param iOS
		}));
		return Response.json(res);
	} else {
		return Response.json({ message: "Must have session cookie" }, { status: 401 });
	}
}

export async function DELETE({ locals }) {
	if (locals.user?._id || locals.sessionId) {
		await collections.conversations.deleteMany({
			...authCondition(locals),
		});
	}

	return new Response();
}
