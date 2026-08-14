import { error, json } from "@sveltejs/kit";
import { config } from "$lib/server/config";
import { getApiToken } from "$lib/server/apiToken";
import { logger } from "$lib/server/logger";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
const TRANSCRIPTION_TIMEOUT = 60000; // 60 seconds

const ALLOWED_CONTENT_TYPES = [
	"audio/webm",
	"audio/ogg",
	"audio/wav",
	"audio/flac",
	"audio/mpeg",
	"audio/mp4",
	"audio/x-wav",
];

export async function POST({ request, locals }) {
	const transcriptionModel = config.get("TRANSCRIPTION_MODEL");

	if (!transcriptionModel) {
		throw error(503, "Transcription is not configured");
	}

	const token = getApiToken(locals);

	if (!token) {
		throw error(401, "Authentication required");
	}

	const rawContentType = request.headers.get("content-type") || "";
	// Normalize content-type: Safari sends "audio/webm; codecs=opus" (with space)
	// but HF API expects "audio/webm;codecs=opus" (no space)
	const contentType = rawContentType.replace(/;\s+/g, ";");
	const isAllowed = ALLOWED_CONTENT_TYPES.some((type) => contentType.includes(type));

	if (!isAllowed) {
		logger.warn({ contentType }, "Unsupported audio format for transcription");
		throw error(400, `Unsupported audio format: ${contentType}`);
	}

	const contentLength = parseInt(request.headers.get("content-length") || "0");
	if (contentLength > MAX_AUDIO_SIZE) {
		throw error(413, "Audio file too large (max 25MB)");
	}

	try {
		const audioBuffer = await request.arrayBuffer();

		if (audioBuffer.byteLength > MAX_AUDIO_SIZE) {
			throw error(413, "Audio file too large (max 25MB)");
		}

		const baseUrl =
			config.get("TRANSCRIPTION_BASE_URL") || "https://router.huggingface.co/hf-inference/models";
		const apiUrl = `${baseUrl}/${transcriptionModel}`;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT);

		const response = await fetch(apiUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": contentType,
				// Bill to organization if configured
				...(locals?.billingOrganization ? { "X-HF-Bill-To": locals.billingOrganization } : {}),
			},
			body: audioBuffer,
			signal: controller.signal,
		}).finally(() => clearTimeout(timeoutId));

		if (!response.ok) {
			const errorText = await response.text();
			logger.error(
				{ status: response.status, error: errorText, model: transcriptionModel },
				"Whisper API error"
			);
			throw error(response.status, `Transcription failed: ${errorText}`);
		}

		const result = await response.json();

		// Whisper API returns { text: "transcribed text" }
		// Filter out responses that only contain dots (e.g. "..." returned for silence/unclear audio)
		const text = (result.text || "").trim();
		const isOnlyDots = /^\.+$/.test(text);
		return json({ text: isOnlyDots ? "" : text });
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			logger.error({ model: transcriptionModel }, "Transcription timeout");
			throw error(504, "Transcription took too long. Please try a shorter recording.");
		}

		// Re-throw SvelteKit errors
		if (err && typeof err === "object" && "status" in err) {
			throw err;
		}

		logger.error(err, "Transcription error");
		throw error(500, "Failed to transcribe audio");
	}
}
