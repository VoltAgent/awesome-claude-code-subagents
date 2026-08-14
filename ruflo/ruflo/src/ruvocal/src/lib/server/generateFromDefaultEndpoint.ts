import { taskModel, models } from "$lib/server/models";
import { MessageUpdateType, type MessageUpdate } from "$lib/types/MessageUpdate";
import type { EndpointMessage } from "./endpoints/endpoints";

export async function* generateFromDefaultEndpoint({
	messages,
	preprompt,
	generateSettings,
	modelId,
	locals,
}: {
	messages: EndpointMessage[];
	preprompt?: string;
	generateSettings?: Record<string, unknown>;
	/** Optional: use this model instead of the default task model */
	modelId?: string;
	locals: App.Locals | undefined;
}): AsyncGenerator<MessageUpdate, string, undefined> {
	try {
		// Choose endpoint based on provided modelId, else fall back to taskModel
		const model = modelId ? (models.find((m) => m.id === modelId) ?? taskModel) : taskModel;
		const endpoint = await model.getEndpoint();
		const tokenStream = await endpoint({ messages, preprompt, generateSettings, locals });

		for await (const output of tokenStream) {
			// if not generated_text is here it means the generation is not done
			if (output.generated_text) {
				let generated_text = output.generated_text;
				for (const stop of [...(model.parameters?.stop ?? []), "<|endoftext|>"]) {
					if (generated_text.endsWith(stop)) {
						generated_text = generated_text.slice(0, -stop.length).trimEnd();
					}
				}
				return generated_text;
			}
			yield {
				type: MessageUpdateType.Stream,
				token: output.token.text,
			};
		}
	} catch (error) {
		return "";
	}

	return "";
}
