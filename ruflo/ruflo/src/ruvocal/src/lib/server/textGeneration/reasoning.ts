import { generateFromDefaultEndpoint } from "$lib/server/generateFromDefaultEndpoint";
import { MessageUpdateType } from "$lib/types/MessageUpdate";

export async function generateSummaryOfReasoning(
	reasoning: string,
	modelId: string | undefined,
	locals: App.Locals | undefined
): Promise<string> {
	const prompt = `Summarize concisely the following reasoning for the user. Keep it short (one short paragraph).\n\n${reasoning}`;
	const summary = await (async () => {
		const it = generateFromDefaultEndpoint({
			messages: [{ from: "user", content: prompt }],
			modelId,
			locals,
		});
		let out = "";
		for await (const update of it) {
			if (update.type === MessageUpdateType.Stream) out += update.token;
		}
		return out;
	})();
	return summary.trim();
}
