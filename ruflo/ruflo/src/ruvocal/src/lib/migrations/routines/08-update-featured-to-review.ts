import type { Migration } from ".";
import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { ReviewStatus } from "$lib/types/Review";

const updateFeaturedToReview: Migration = {
	_id: new ObjectId("000000000000000000000008"),
	name: "Update featured to review",
	up: async () => {
		const { assistants, tools } = collections;

		// Update assistants
		await assistants.updateMany({ featured: true }, { $set: { review: ReviewStatus.APPROVED } });
		await assistants.updateMany(
			{ featured: { $ne: true } },
			{ $set: { review: ReviewStatus.PRIVATE } }
		);

		await assistants.updateMany({}, { $unset: { featured: "" } });

		// Update tools
		await tools.updateMany({ featured: true }, { $set: { review: ReviewStatus.APPROVED } });
		await tools.updateMany({ featured: { $ne: true } }, { $set: { review: ReviewStatus.PRIVATE } });

		await tools.updateMany({}, { $unset: { featured: "" } });

		return true;
	},
	runEveryTime: false,
};

export default updateFeaturedToReview;
