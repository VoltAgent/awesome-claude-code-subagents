// Lightweight MIME helpers to avoid new dependencies.

const EXTENSION_TO_MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpe: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	pdf: "application/pdf",
	txt: "text/plain",
	csv: "text/csv",
	json: "application/json",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	mp4: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
	zip: "application/zip",
	gz: "application/gzip",
	tgz: "application/gzip",
	tar: "application/x-tar",
	html: "text/html",
	htm: "text/html",
	md: "text/markdown",
};

export function guessMimeFromUrl(url: string): string | undefined {
	try {
		const pathname = new URL(url).pathname;
		const ext = pathname.split(".").pop()?.toLowerCase();
		if (ext && EXTENSION_TO_MIME[ext]) return EXTENSION_TO_MIME[ext];
	} catch {
		/* ignore */
	}
	return undefined;
}

export function pickSafeMime(
	forwardedType: string | null,
	blobType: string | undefined,
	url: string
): string {
	const inferred = guessMimeFromUrl(url);
	if (forwardedType) return forwardedType;
	if (
		inferred &&
		(!blobType || blobType === "application/octet-stream" || blobType.startsWith("text/plain"))
	) {
		return inferred;
	}
	if (blobType) return blobType;
	return inferred || "application/octet-stream";
}
