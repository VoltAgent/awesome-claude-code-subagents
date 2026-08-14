import { collections } from "$lib/server/database";
import { z } from "zod";
import { authCondition } from "$lib/server/auth";
import { DEFAULT_SETTINGS, type SettingsEditable } from "$lib/types/Settings";
import { resolveStreamingMode } from "$lib/utils/messageUpdates";

const settingsSchema = z.object({
	shareConversationsWithModelAuthors: z
		.boolean()
		.default(DEFAULT_SETTINGS.shareConversationsWithModelAuthors),
	welcomeModalSeen: z.boolean().optional(),
	activeModel: z.string().default(DEFAULT_SETTINGS.activeModel),
	customPrompts: z.record(z.string()).default({}),
	multimodalOverrides: z.record(z.boolean()).default({}),
	toolsOverrides: z.record(z.boolean()).default({}),
	providerOverrides: z.record(z.string()).default({}),
	streamingMode: z.enum(["raw", "smooth"]).optional(),
	directPaste: z.boolean().default(false),
	hapticsEnabled: z.boolean().default(true),
	hidePromptExamples: z.record(z.boolean()).default({}),
	autopilotEnabled: z.boolean().default(true),
	autopilotMaxSteps: z
		.number()
		.int()
		.min(1)
		.max(100)
		.default(DEFAULT_SETTINGS.autopilotMaxSteps),
	billingOrganization: z.string().optional(),
});

export async function POST({ request, locals }) {
	const body = await request.json();

	const { welcomeModalSeen, ...parsedSettings } = settingsSchema.parse(body);
	const streamingMode = resolveStreamingMode(parsedSettings);
	const settings = {
		...parsedSettings,
		streamingMode,
	} satisfies SettingsEditable;

	await collections.settings.updateOne(
		authCondition(locals),
		{
			$set: {
				...settings,
				...(welcomeModalSeen && { welcomeModalSeenAt: new Date() }),
				updatedAt: new Date(),
			},
			$setOnInsert: {
				createdAt: new Date(),
			},
		},
		{
			upsert: true,
		}
	);
	// return ok response
	return new Response();
}
