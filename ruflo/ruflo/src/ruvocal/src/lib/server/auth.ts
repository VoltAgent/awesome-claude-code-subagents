import {
	Issuer,
	type BaseClient,
	type UserinfoResponse,
	type TokenSet,
	custom,
	generators,
} from "openid-client";
import type { RequestEvent } from "@sveltejs/kit";
import { addHours, addWeeks, differenceInMinutes, subMinutes } from "date-fns";
import { config } from "$lib/server/config";
import { sha256 } from "$lib/utils/sha256";
import { z } from "zod";
import { dev } from "$app/environment";
import { redirect, type Cookies } from "@sveltejs/kit";
import { collections } from "$lib/server/database";
import JSON5 from "json5";
import { logger } from "$lib/server/logger";
import { ObjectId } from "mongodb";
import { adminTokenManager } from "./adminToken";
import type { User } from "$lib/types/User";
import type { Session } from "$lib/types/Session";
import { base } from "$app/paths";
import { acquireLock, isDBLocked, releaseLock } from "$lib/migrations/lock";
import { Semaphores } from "$lib/types/Semaphore";

export interface OIDCSettings {
	redirectURI: string;
}

export interface OIDCUserInfo {
	token: TokenSet;
	userData: UserinfoResponse;
}

const stringWithDefault = (value: string) =>
	z
		.string()
		.default(value)
		.transform((el) => (el ? el : value));

export const OIDConfig = z
	.object({
		CLIENT_ID: stringWithDefault(config.OPENID_CLIENT_ID),
		CLIENT_SECRET: stringWithDefault(config.OPENID_CLIENT_SECRET),
		PROVIDER_URL: stringWithDefault(config.OPENID_PROVIDER_URL),
		SCOPES: stringWithDefault(config.OPENID_SCOPES),
		NAME_CLAIM: stringWithDefault(config.OPENID_NAME_CLAIM).refine(
			(el) => !["preferred_username", "email", "picture", "sub"].includes(el),
			{ message: "nameClaim cannot be one of the restricted keys." }
		),
		TOLERANCE: stringWithDefault(config.OPENID_TOLERANCE),
		RESOURCE: stringWithDefault(config.OPENID_RESOURCE),
		ID_TOKEN_SIGNED_RESPONSE_ALG: z.string().optional(),
	})
	.parse(JSON5.parse(config.OPENID_CONFIG || "{}"));

export const loginEnabled = !!OIDConfig.CLIENT_ID;

const sameSite = z
	.enum(["lax", "none", "strict"])
	.default(dev || config.ALLOW_INSECURE_COOKIES === "true" ? "lax" : "none")
	.parse(config.COOKIE_SAMESITE === "" ? undefined : config.COOKIE_SAMESITE);

const secure = z
	.boolean()
	.default(!(dev || config.ALLOW_INSECURE_COOKIES === "true"))
	.parse(config.COOKIE_SECURE === "" ? undefined : config.COOKIE_SECURE === "true");

function sanitizeReturnPath(path: string | undefined | null): string | undefined {
	if (!path) {
		return undefined;
	}
	if (path.startsWith("//")) {
		return undefined;
	}
	if (!path.startsWith("/")) {
		return undefined;
	}
	return path;
}

export function refreshSessionCookie(cookies: Cookies, sessionId: string) {
	cookies.set(config.COOKIE_NAME, sessionId, {
		path: "/",
		// So that it works inside the space's iframe
		sameSite,
		secure,
		httpOnly: true,
		expires: addWeeks(new Date(), 2),
	});
}

export async function findUser(
	sessionId: string,
	coupledCookieHash: string | undefined,
	url: URL
): Promise<{
	user: User | null;
	invalidateSession: boolean;
	oauth?: Session["oauth"];
}> {
	const session = await collections.sessions.findOne({ sessionId });

	if (!session) {
		return { user: null, invalidateSession: false };
	}

	if (coupledCookieHash && session.coupledCookieHash !== coupledCookieHash) {
		return { user: null, invalidateSession: true };
	}

	// Check if OAuth token needs refresh
	if (session.oauth?.token && session.oauth.refreshToken) {
		// If token expires in less than 5 minutes, refresh it
		if (differenceInMinutes(session.oauth.token.expiresAt, new Date()) < 5) {
			const lockKey = `${Semaphores.OAUTH_TOKEN_REFRESH}:${sessionId}`;

			// Acquire lock for token refresh
			const lockId = await acquireLock(lockKey);
			if (lockId) {
				try {
					// Attempt to refresh the token
					const newTokenSet = await refreshOAuthToken(
						{ redirectURI: `${config.PUBLIC_ORIGIN}${base}/login/callback` },
						session.oauth.refreshToken,
						url
					);

					if (!newTokenSet || !newTokenSet.access_token) {
						// Token refresh failed, invalidate session
						return { user: null, invalidateSession: true };
					}

					// Update session with new token information
					const updatedOAuth = tokenSetToSessionOauth(newTokenSet);

					if (!updatedOAuth) {
						// Token refresh failed, invalidate session
						return { user: null, invalidateSession: true };
					}

					await collections.sessions.updateOne(
						{ sessionId },
						{
							$set: {
								oauth: updatedOAuth,
								updatedAt: new Date(),
							},
						}
					);

					session.oauth = updatedOAuth;
				} catch (err) {
					logger.error(err, "Error during token refresh:");
					return { user: null, invalidateSession: true };
				} finally {
					await releaseLock(lockKey, lockId);
				}
			} else if (new Date() > session.oauth.token.expiresAt) {
				// If the token has expired, we need to wait for the token refresh to complete
				let attempts = 0;
				do {
					await new Promise((resolve) => setTimeout(resolve, 200));
					attempts++;
					if (attempts > 20) {
						return { user: null, invalidateSession: true };
					}
				} while (await isDBLocked(lockKey));

				const updatedSession = await collections.sessions.findOne({ sessionId });
				if (!updatedSession || updatedSession.oauth?.token === session.oauth.token) {
					return { user: null, invalidateSession: true };
				}

				session.oauth = updatedSession.oauth;
			}
		}
	}

	return {
		user: await collections.users.findOne({ _id: session.userId }),
		invalidateSession: false,
		oauth: session.oauth,
	};
}
export const authCondition = (locals: App.Locals) => {
	if (!locals.user && !locals.sessionId) {
		throw new Error("User or sessionId is required");
	}

	return locals.user
		? { userId: locals.user._id }
		: { sessionId: locals.sessionId, userId: { $exists: false } };
};

export function tokenSetToSessionOauth(tokenSet: TokenSet): Session["oauth"] {
	if (!tokenSet.access_token) {
		return undefined;
	}

	return {
		token: {
			value: tokenSet.access_token,
			expiresAt: tokenSet.expires_at
				? subMinutes(new Date(tokenSet.expires_at * 1000), 1)
				: addWeeks(new Date(), 2),
		},
		refreshToken: tokenSet.refresh_token || undefined,
	};
}

/**
 * Generates a CSRF token using the user sessionId. Note that we don't need a secret because sessionId is enough.
 */
export async function generateCsrfToken(
	sessionId: string,
	redirectUrl: string,
	next?: string
): Promise<string> {
	const sanitizedNext = sanitizeReturnPath(next);
	const data = {
		expiration: addHours(new Date(), 1).getTime(),
		redirectUrl,
		...(sanitizedNext ? { next: sanitizedNext } : {}),
	} as {
		expiration: number;
		redirectUrl: string;
		next?: string;
	};

	return Buffer.from(
		JSON.stringify({
			data,
			signature: await sha256(JSON.stringify(data) + "##" + sessionId),
		})
	).toString("base64");
}

let lastIssuer: Issuer<BaseClient> | null = null;
let lastIssuerFetchedAt: Date | null = null;
async function getOIDCClient(settings: OIDCSettings, url: URL): Promise<BaseClient> {
	if (
		lastIssuer &&
		lastIssuerFetchedAt &&
		differenceInMinutes(new Date(), lastIssuerFetchedAt) >= 10
	) {
		lastIssuer = null;
		lastIssuerFetchedAt = null;
	}
	if (!lastIssuer) {
		lastIssuer = await Issuer.discover(OIDConfig.PROVIDER_URL);
		lastIssuerFetchedAt = new Date();
	}

	const issuer = lastIssuer;

	const client_config: ConstructorParameters<typeof issuer.Client>[0] = {
		client_id: OIDConfig.CLIENT_ID,
		client_secret: OIDConfig.CLIENT_SECRET,
		redirect_uris: [settings.redirectURI],
		response_types: ["code"],
		[custom.clock_tolerance]: OIDConfig.TOLERANCE || undefined,
		id_token_signed_response_alg: OIDConfig.ID_TOKEN_SIGNED_RESPONSE_ALG || undefined,
	};

	if (OIDConfig.CLIENT_ID === "__CIMD__") {
		// See https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/
		client_config.client_id = new URL(
			`${base}/.well-known/oauth-cimd`,
			config.PUBLIC_ORIGIN || url.origin
		).toString();
	}

	const alg_supported = issuer.metadata["id_token_signing_alg_values_supported"];

	if (Array.isArray(alg_supported)) {
		client_config.id_token_signed_response_alg ??= alg_supported[0];
	}

	return new issuer.Client(client_config);
}

export async function getOIDCAuthorizationUrl(
	settings: OIDCSettings,
	params: { sessionId: string; next?: string; url: URL; cookies: Cookies }
): Promise<string> {
	const client = await getOIDCClient(settings, params.url);
	const csrfToken = await generateCsrfToken(
		params.sessionId,
		settings.redirectURI,
		sanitizeReturnPath(params.next)
	);

	const codeVerifier = generators.codeVerifier();
	const codeChallenge = generators.codeChallenge(codeVerifier);

	params.cookies.set("hfChat-codeVerifier", codeVerifier, {
		path: "/",
		sameSite,
		secure,
		httpOnly: true,
		expires: addHours(new Date(), 1),
	});

	return client.authorizationUrl({
		code_challenge_method: "S256",
		code_challenge: codeChallenge,
		scope: OIDConfig.SCOPES,
		state: csrfToken,
		resource: OIDConfig.RESOURCE || undefined,
	});
}

export async function getOIDCUserData(
	settings: OIDCSettings,
	code: string,
	codeVerifier: string,
	iss: string | undefined,
	url: URL
): Promise<OIDCUserInfo> {
	const client = await getOIDCClient(settings, url);
	const token = await client.callback(
		settings.redirectURI,
		{
			code,
			iss,
		},
		{ code_verifier: codeVerifier }
	);
	const userData = await client.userinfo(token);

	return { token, userData };
}

/**
 * Refreshes an OAuth token using the refresh token
 */
export async function refreshOAuthToken(
	settings: OIDCSettings,
	refreshToken: string,
	url: URL
): Promise<TokenSet | null> {
	const client = await getOIDCClient(settings, url);
	const tokenSet = await client.refresh(refreshToken);
	return tokenSet;
}

export async function validateAndParseCsrfToken(
	token: string,
	sessionId: string
): Promise<{
	/** This is the redirect url that was passed to the OIDC provider */
	redirectUrl: string;
	/** Relative path (within this app) to return to after login */
	next?: string;
} | null> {
	try {
		const { data, signature } = z
			.object({
				data: z.object({
					expiration: z.number().int(),
					redirectUrl: z.string().url(),
					next: z.string().optional(),
				}),
				signature: z.string().length(64),
			})
			.parse(JSON.parse(token));

		const reconstructSign = await sha256(JSON.stringify(data) + "##" + sessionId);

		if (data.expiration > Date.now() && signature === reconstructSign) {
			return { redirectUrl: data.redirectUrl, next: sanitizeReturnPath(data.next) };
		}
	} catch (e) {
		logger.error(e, "Error validating and parsing CSRF token");
	}
	return null;
}

type CookieRecord = Cookies;
type HeaderRecord = Headers;

export async function getCoupledCookieHash(cookie: CookieRecord): Promise<string | undefined> {
	if (!config.COUPLE_SESSION_WITH_COOKIE_NAME) {
		return undefined;
	}

	const cookieValue = cookie.get(config.COUPLE_SESSION_WITH_COOKIE_NAME);

	if (!cookieValue) {
		return "no-cookie";
	}

	return await sha256(cookieValue);
}

export async function authenticateRequest(
	headers: HeaderRecord,
	cookie: CookieRecord,
	url: URL,
	isApi?: boolean
): Promise<App.Locals & { secretSessionId: string }> {
	const token = cookie.get(config.COOKIE_NAME);

	let email = null;
	if (config.TRUSTED_EMAIL_HEADER) {
		email = headers.get(config.TRUSTED_EMAIL_HEADER);
	}

	let secretSessionId: string | null = null;
	let sessionId: string | null = null;

	if (email) {
		secretSessionId = sessionId = await sha256(email);
		return {
			user: {
				_id: new ObjectId(sessionId.slice(0, 24)),
				name: email,
				email,
				createdAt: new Date(),
				updatedAt: new Date(),
				hfUserId: email,
				avatarUrl: "",
			},
			sessionId,
			secretSessionId,
			isAdmin: adminTokenManager.isAdmin(sessionId),
		};
	}

	if (token) {
		secretSessionId = token;
		sessionId = await sha256(token);

		const result = await findUser(sessionId, await getCoupledCookieHash(cookie), url);

		if (result.invalidateSession) {
			secretSessionId = crypto.randomUUID();
			sessionId = await sha256(secretSessionId);

			if (await collections.sessions.findOne({ sessionId })) {
				throw new Error("Session ID collision");
			}
		}

		return {
			user: result.user ?? undefined,
			token: result.oauth?.token?.value,
			sessionId,
			secretSessionId,
			isAdmin: result.user?.isAdmin || adminTokenManager.isAdmin(sessionId),
		};
	}

	if (isApi) {
		const authorization = headers.get("Authorization");
		if (authorization?.startsWith("Bearer ")) {
			const token = authorization.slice(7);
			const hash = await sha256(token);
			sessionId = secretSessionId = hash;

			const cacheHit = await collections.tokenCaches.findOne({ tokenHash: hash });
			if (cacheHit) {
				const user = await collections.users.findOne({ hfUserId: cacheHit.userId });
				if (!user) {
					throw new Error("User not found");
				}
				return {
					user,
					sessionId,
					token,
					secretSessionId,
					isAdmin: user.isAdmin || adminTokenManager.isAdmin(sessionId),
				};
			}

			const response = await fetch("https://huggingface.co/api/whoami-v2", {
				headers: { Authorization: `Bearer ${token}` },
			});

			if (!response.ok) {
				throw new Error("Unauthorized");
			}

			const data = await response.json();
			const user = await collections.users.findOne({ hfUserId: data.id });
			if (!user) {
				throw new Error("User not found");
			}

			await collections.tokenCaches.insertOne({
				tokenHash: hash,
				userId: data.id,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			return {
				user,
				sessionId,
				secretSessionId,
				token,
				isAdmin: user.isAdmin || adminTokenManager.isAdmin(sessionId),
			};
		}
	}

	// Generate new session if none exists
	secretSessionId = crypto.randomUUID();
	sessionId = await sha256(secretSessionId);

	if (await collections.sessions.findOne({ sessionId })) {
		throw new Error("Session ID collision");
	}

	return { user: undefined, sessionId, secretSessionId, isAdmin: false };
}

export async function triggerOauthFlow({ url, locals, cookies }: RequestEvent): Promise<Response> {
	// const referer = request.headers.get("referer");
	// let redirectURI = `${(referer ? new URL(referer) : url).origin}${base}/login/callback`;
	let redirectURI = `${url.origin}${base}/login/callback`;

	// TODO: Handle errors if provider is not responding

	if (url.searchParams.has("callback")) {
		const callback = url.searchParams.get("callback") || redirectURI;
		if (config.ALTERNATIVE_REDIRECT_URLS.includes(callback)) {
			redirectURI = callback;
		}
	}

	// Preserve a safe in-app return path after login.
	// Priority: explicit ?next=... (must be an absolute path), else the current path (when auto-login kicks in).
	let next: string | undefined = undefined;
	const nextParam = sanitizeReturnPath(url.searchParams.get("next"));
	if (nextParam) {
		// Only accept absolute in-app paths to prevent open redirects
		next = nextParam;
	} else if (!url.pathname.startsWith(`${base}/login`)) {
		// For automatic login on protected pages, return to the page the user was on
		next = sanitizeReturnPath(`${url.pathname}${url.search}`) ?? `${base}/`;
	} else {
		next = sanitizeReturnPath(`${base}/`) ?? "/";
	}

	const authorizationUrl = await getOIDCAuthorizationUrl(
		{ redirectURI },
		{ sessionId: locals.sessionId, next, url, cookies }
	);

	throw redirect(302, authorizationUrl);
}
