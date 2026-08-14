import { error, type RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { config } from "$lib/server/config";
import { collections } from "$lib/server/database";
import { authCondition } from "$lib/server/auth";
import { logger } from "$lib/server/logger";

export const GET: RequestHandler = async ({ locals }) => {
	if (!config.isHuggingChat) {
		error(404, "Not available");
	}

	if (!locals.user) {
		error(401, "Login required");
	}

	if (!locals.token) {
		error(401, "OAuth token not available. Please log out and log back in.");
	}

	try {
		const response = await fetch("https://huggingface.co/oauth/userinfo", {
			headers: { Authorization: `Bearer ${locals.token}` },
		});

		if (!response.ok) {
			logger.error(`Failed to fetch billing orgs: ${response.status}`);
			error(502, "Failed to fetch billing information");
		}

		const data = await response.json();

		const settings = await collections.settings.findOne(authCondition(locals));
		const currentBillingOrg = settings?.billingOrganization;

		const billingOrgs = (data.orgs ?? [])
			.filter((org: { canPay?: boolean }) => org.canPay === true)
			.map((org: { sub: string; name: string; preferred_username: string }) => ({
				sub: org.sub,
				name: org.name,
				preferred_username: org.preferred_username,
			}));

		const isCurrentOrgValid =
			!currentBillingOrg ||
			billingOrgs.some(
				(org: { preferred_username: string }) => org.preferred_username === currentBillingOrg
			);

		if (!isCurrentOrgValid && currentBillingOrg) {
			logger.info(
				`Clearing invalid billingOrganization '${currentBillingOrg}' for user ${locals.user._id}`
			);
			await collections.settings.updateOne(authCondition(locals), {
				$unset: { billingOrganization: "" },
				$set: { updatedAt: new Date() },
			});
		}

		return superjsonResponse({
			userCanPay: data.canPay ?? false,
			organizations: billingOrgs,
			currentBillingOrg: isCurrentOrgValid ? currentBillingOrg : undefined,
		});
	} catch (err) {
		// Re-throw SvelteKit HttpErrors
		if (err && typeof err === "object" && "status" in err) {
			throw err;
		}
		logger.error(err, "Error fetching billing orgs:");
		error(500, "Internal server error");
	}
};
