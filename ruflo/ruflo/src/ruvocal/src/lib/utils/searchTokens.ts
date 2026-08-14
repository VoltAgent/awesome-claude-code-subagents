const PUNCTUATION_REGEX = /\p{P}/gu;

function removeDiacritics(s: string, form: "NFD" | "NFKD" = "NFD"): string {
	return s.normalize(form).replace(/[\u0300-\u036f]/g, "");
}

export function generateSearchTokens(value: string): string[] {
	const fullTitleToken = removeDiacritics(value)
		.replace(PUNCTUATION_REGEX, "")
		.replaceAll(/\s+/g, "")
		.toLowerCase();
	return [
		...new Set([
			...removeDiacritics(value)
				.split(/\s+/)
				.map((word) => word.replace(PUNCTUATION_REGEX, "").toLowerCase())
				.filter((word) => word.length),
			...(fullTitleToken.length ? [fullTitleToken] : []),
		]),
	];
}

function escapeForRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

export function generateQueryTokens(query: string): RegExp[] {
	return removeDiacritics(query)
		.split(/\s+/)
		.map((word) => word.replace(PUNCTUATION_REGEX, "").toLowerCase())
		.filter((word) => word.length)
		.map((token) => new RegExp(`^${escapeForRegExp(token)}`));
}
