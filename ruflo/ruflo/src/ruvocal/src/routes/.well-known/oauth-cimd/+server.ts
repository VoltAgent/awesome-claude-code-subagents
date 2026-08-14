import { base } from "$app/paths";
import { OIDConfig } from "$lib/server/auth";
import { config } from "$lib/server/config";

/**
 * See https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/
 */
export const GET = ({ url }) => {
	if (!OIDConfig.CLIENT_ID) {
		return new Response("Client ID not found", { status: 404 });
	}
	if (OIDConfig.CLIENT_ID !== "__CIMD__") {
		return new Response(
			`Client ID is manually set to something other than '__CIMD__': ${OIDConfig.CLIENT_ID}`,
			{
				status: 404,
			}
		);
	}
	return new Response(
		JSON.stringify({
			client_id: new URL(url, config.PUBLIC_ORIGIN || url.origin).toString(),
			client_name: config.PUBLIC_APP_NAME,
			client_uri: `${config.PUBLIC_ORIGIN || url.origin}${base}`,
			redirect_uris: [
				new URL(`${base}/login/callback`, config.PUBLIC_ORIGIN || url.origin).toString(),
			],
			token_endpoint_auth_method: "none",
			scopes: OIDConfig.SCOPES,
		}),
		{
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
};
