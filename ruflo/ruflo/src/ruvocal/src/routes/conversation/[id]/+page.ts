import { useAPIClient, handleResponse } from "$lib/APIClient";
import { UrlDependency } from "$lib/types/UrlDependency";
import { redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import type { PageLoad } from "./$types";
import type { Message } from "$lib/types/Message";

interface ConversationData {
	messages: Message[];
	title: string;
	model: string;
	preprompt?: string;
	rootMessageId?: string;
	id: string;
	updatedAt: Date;
	modelId: string;
	shared: boolean;
}

export const load: PageLoad = async ({ params, depends, fetch, url, parent }) => {
	depends(UrlDependency.Conversation);

	const client = useAPIClient({ fetch, origin: url.origin });

	// Handle share import for logged-in users (7-char IDs are share IDs)
	if (params.id.length === 7) {
		const parentData = await parent();

		if (parentData.loginEnabled && parentData.user) {
			const leafId = url.searchParams.get("leafId");

			let importedConversationId: string | undefined;
			try {
				const result = await client.conversations["import-share"]
					.post({ shareId: params.id })
					.then(handleResponse);
				importedConversationId = result.conversationId;
			} catch {
				// Import failed, continue to load shared conversation for viewing
			}

			if (importedConversationId) {
				redirect(
					302,
					`${base}/conversation/${importedConversationId}?leafId=${leafId ?? ""}&fromShare=${params.id}`
				);
			}
		}
	}

	// Load conversation (works for both owned and shared conversations)
	try {
		return (await client
			.conversations({ id: params.id })
			.get({ query: { fromShare: url.searchParams.get("fromShare") ?? undefined } })
			.then(handleResponse)) as ConversationData;
	} catch {
		redirect(302, `${base}/`);
	}
};
