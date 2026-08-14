import { base } from "$app/paths";
import { page } from "$app/state";

// Returns a public share URL for a conversation id.
// If `id` is already a 7-char share id, no network call is made.
export async function createShareLink(id: string): Promise<string> {
	const prefix =
		page.data.publicConfig.PUBLIC_SHARE_PREFIX ||
		`${page.data.publicConfig.PUBLIC_ORIGIN || page.url.origin}${base}`;

	if (id.length === 7) {
		return `${prefix}/r/${id}`;
	}

	const res = await fetch(`${base}/conversation/${id}/share`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(text || "Failed to create share link");
	}

	const { shareId } = await res.json();
	return `${prefix}/r/${shareId}`;
}
