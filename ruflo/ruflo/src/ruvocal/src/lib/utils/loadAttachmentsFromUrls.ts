import { base } from "$app/paths";
import { pickSafeMime } from "$lib/utils/mime";

export interface AttachmentLoadResult {
	files: File[];
	errors: string[];
}

/**
 * Parse attachment URLs from query parameters
 * Supports both comma-separated (?attachments=url1,url2) and multiple params (?attachments=url1&attachments=url2)
 */
function parseAttachmentUrls(searchParams: URLSearchParams): string[] {
	const urls: string[] = [];

	// Get all 'attachments' parameters
	const attachmentParams = searchParams.getAll("attachments");

	for (const param of attachmentParams) {
		// Split by comma in case multiple URLs are in one param
		const splitUrls = param.split(",").map((url) => url.trim());
		urls.push(...splitUrls);
	}

	// Filter out empty strings
	return urls.filter((url) => url.length > 0);
}

/**
 * Extract filename from URL or Content-Disposition header
 */
function extractFilename(url: string, contentDisposition?: string | null): string {
	// Try to get filename from Content-Disposition header
	if (contentDisposition) {
		const filenameStar = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
		if (filenameStar) {
			const cleaned = filenameStar.trim().replace(/['"]/g, "");
			try {
				return decodeURIComponent(cleaned);
			} catch {
				return cleaned;
			}
		}

		const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
		if (match && match[1]) return match[1].replace(/['"]/g, "");
	}

	// Fallback: extract from URL
	try {
		const urlObj = new URL(url);
		const pathname = urlObj.pathname;
		const segments = pathname.split("/");
		const lastSegment = segments[segments.length - 1];

		if (lastSegment && lastSegment.length > 0) {
			return decodeURIComponent(lastSegment);
		}
	} catch {
		// Invalid URL, fall through to default
	}

	return "attachment";
}

/**
 * Load files from remote URLs via server-side proxy
 */
export async function loadAttachmentsFromUrls(
	searchParams: URLSearchParams
): Promise<AttachmentLoadResult> {
	const urls = parseAttachmentUrls(searchParams);

	if (urls.length === 0) {
		return { files: [], errors: [] };
	}

	const files: File[] = [];
	const errors: string[] = [];

	await Promise.all(
		urls.map(async (url) => {
			try {
				// Fetch via our proxy endpoint to bypass CORS
				const proxyUrl = `${base}/api/fetch-url?${new URLSearchParams({ url })}`;
				const response = await fetch(proxyUrl);

				if (!response.ok) {
					const errorText = await response.text();
					errors.push(`Failed to fetch ${url}: ${errorText}`);
					return;
				}

				const forwardedType = response.headers.get("x-forwarded-content-type");
				const blob = await response.blob();
				const mimeType = pickSafeMime(forwardedType, blob.type, url);
				const contentDisposition = response.headers.get("content-disposition");
				const filename = extractFilename(url, contentDisposition);

				// Create File object
				const file = new File([blob], filename, {
					type: mimeType,
				});

				files.push(file);
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				errors.push(`Failed to load ${url}: ${message}`);
				console.error(`Error loading attachment from ${url}:`, err);
			}
		})
	);

	return { files, errors };
}
