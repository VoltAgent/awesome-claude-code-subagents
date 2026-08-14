import { collections } from "$lib/server/database";
import type { Migration } from ".";
import { ObjectId } from "mongodb";

const migration: Migration = {
	_id: new ObjectId("000000000000000000000010"),
	name: "Update reports with assistantId to use contentId",
	up: async () => {
		await collections.reports.updateMany(
			{
				assistantId: { $exists: true, $ne: null },
			},
			[
				{
					$set: {
						object: "assistant",
						contentId: "$assistantId",
					},
				},
				{
					$unset: "assistantId",
				},
			]
		);
		return true;
	},
};

export default migration;
