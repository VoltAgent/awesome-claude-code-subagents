import { redirect } from "@sveltejs/kit";
import { useAPIClient, handleResponse } from "$lib/APIClient";
import { base } from "$app/paths";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params, url, fetch, parent }) => {
	const leafId = url.searchParams.get("leafId");
	const parentData = await parent();

	// If logged in, import the share and redirect to the new conversation
	if (parentData.loginEnabled && parentData.user && params.id) {
		const client = useAPIClient({ fetch, origin: url.origin });

		let importedConversationId: string | undefined;
		try {
			const result = await client.conversations["import-share"]
				.post({ shareId: params.id })
				.then(handleResponse);
			importedConversationId = result.conversationId;
		} catch {
			// Fall through to view-only mode on error
		}

		if (importedConversationId) {
			redirect(
				302,
				`${base}/conversation/${importedConversationId}?leafId=${leafId ?? ""}&fromShare=${params.id}`
			);
		}
	}

	// Not logged in or import failed: redirect to view-only mode
	redirect(302, `${base}/conversation/${params.id}${leafId ? `?leafId=${leafId}` : ""}`);
};
