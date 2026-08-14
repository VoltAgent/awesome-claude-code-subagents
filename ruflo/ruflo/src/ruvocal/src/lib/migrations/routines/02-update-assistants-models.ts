import type { Migration } from ".";
import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";

const updateAssistantsModels: Migration = {
	_id: new ObjectId("5f9f3f3f3f3f3f3f3f3f3f3f"),
	name: "Update deprecated models in assistants with the default model",
	up: async () => {
		const models = (await import("$lib/server/models")).models;
		//@ts-expect-error the property doesn't exist anymore, keeping the script for reference
		const oldModels = (await import("$lib/server/models")).oldModels;
		const { assistants } = collections;

		const modelIds = models.map((el) => el.id);
		const defaultModelId = models[0].id;

		// Find all assistants whose modelId is not in modelIds, and update it
		const bulkOps = await assistants
			.find({ modelId: { $nin: modelIds } })
			.map((assistant) => {
				// has an old model
				let newModelId = defaultModelId;

				const oldModel = oldModels.find((m: (typeof models)[number]) => m.id === assistant.modelId);
				if (oldModel && oldModel.transferTo && !!models.find((m) => m.id === oldModel.transferTo)) {
					newModelId = oldModel.transferTo;
				}

				return {
					updateOne: {
						filter: { _id: assistant._id },
						update: { $set: { modelId: newModelId } },
					},
				};
			})
			.toArray();

		if (bulkOps.length > 0) {
			await assistants.bulkWrite(bulkOps);
		}

		return true;
	},
	runEveryTime: true,
	runForHuggingChat: "only",
};

export default updateAssistantsModels;
