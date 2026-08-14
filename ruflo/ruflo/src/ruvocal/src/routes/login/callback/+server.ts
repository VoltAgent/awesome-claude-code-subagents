import { error, redirect } from "@sveltejs/kit";
import { getOIDCUserData, validateAndParseCsrfToken } from "$lib/server/auth";
import { z } from "zod";
import { base } from "$app/paths";
import { config } from "$lib/server/config";
import JSON5 from "json5";
import { updateUser } from "./updateUser.js";

const sanitizeJSONEnv = (val: string, fallback: string) => {
	const raw = (val ?? "").trim();
	const unquoted = raw.startsWith("`") && raw.endsWith("`") ? raw.slice(1, -1) : raw;
	return unquoted || fallback;
};

const allowedUserEmails = z
	.array(z.string().email())
	.optional()
	.default([])
	.parse(JSON5.parse(sanitizeJSONEnv(config.ALLOWED_USER_EMAILS, "[]")));

const allowedUserDomains = z
	.array(z.string().regex(/\.\w+$/)) // Contains at least a dot
	.optional()
	.default([])
	.parse(JSON5.parse(sanitizeJSONEnv(config.ALLOWED_USER_DOMAINS, "[]")));

export async function GET({ url, locals, cookies, request, getClientAddress }) {
	const { error: errorName, error_description: errorDescription } = z
		.object({
			error: z.string().optional(),
			error_description: z.string().optional(),
		})
		.parse(Object.fromEntries(url.searchParams.entries()));

	if (errorName) {
		throw error(400, errorName + (errorDescription ? ": " + errorDescription : ""));
	}

	const { code, state, iss } = z
		.object({
			code: z.string(),
			state: z.string(),
			iss: z.string().optional(),
		})
		.parse(Object.fromEntries(url.searchParams.entries()));

	const csrfToken = Buffer.from(state, "base64").toString("utf-8");

	const validatedToken = await validateAndParseCsrfToken(csrfToken, locals.sessionId);

	if (!validatedToken) {
		throw error(403, "Invalid or expired CSRF token");
	}

	const codeVerifier = cookies.get("hfChat-codeVerifier");
	if (!codeVerifier) {
		throw error(403, "Code verifier cookie not found");
	}

	const { userData, token } = await getOIDCUserData(
		{ redirectURI: validatedToken.redirectUrl },
		code,
		codeVerifier,
		iss,
		url
	);

	// Filter by allowed user emails or domains
	if (allowedUserEmails.length > 0 || allowedUserDomains.length > 0) {
		if (!userData.email) {
			throw error(403, "User not allowed: email not returned");
		}
		const emailVerified = userData.email_verified ?? true;
		if (!emailVerified) {
			throw error(403, "User not allowed: email not verified");
		}

		const emailDomain = userData.email.split("@")[1];
		const isEmailAllowed = allowedUserEmails.includes(userData.email);
		const isDomainAllowed = allowedUserDomains.includes(emailDomain);

		if (!isEmailAllowed && !isDomainAllowed) {
			throw error(403, "User not allowed");
		}
	}

	await updateUser({
		userData,
		token,
		locals,
		cookies,
		userAgent: request.headers.get("user-agent") ?? undefined,
		ip: getClientAddress(),
	});

	// Prefer returning the user to their original in-app path when provided.
	// `validatedToken.next` is sanitized server-side to avoid protocol-relative redirects.
	const next = validatedToken.next;
	if (next) {
		return redirect(302, next);
	}
	return redirect(302, `${base}/`);
}
