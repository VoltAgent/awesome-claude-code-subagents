import { error, type RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { requireAdmin } from "$lib/server/api/utils/requireAuth";
import { refreshModels, lastModelRefreshSummary } from "$lib/server/models";

export const POST: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);

	const previous = lastModelRefreshSummary;

	try {
		const summary = await refreshModels();
		return superjsonResponse({
			refreshedAt: summary.refreshedAt.toISOString(),
			durationMs: summary.durationMs,
			added: summary.added,
			removed: summary.removed,
			changed: summary.changed,
			total: summary.total,
			hadChanges:
				summary.added.length > 0 || summary.removed.length > 0 || summary.changed.length > 0,
			previous:
				previous.refreshedAt.getTime() > 0
					? {
							refreshedAt: previous.refreshedAt.toISOString(),
							total: previous.total,
						}
					: null,
		});
	} catch {
		error(502, "Model refresh failed");
	}
};
