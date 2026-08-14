import type { MessageToolProgressUpdate } from "$lib/types/MessageUpdate";

export function formatToolProgressLabel(progress?: MessageToolProgressUpdate): string {
	if (!progress) return "";
	const total = typeof progress.total === "number" ? `/${progress.total}` : "";
	const value = `${progress.progress}${total}`;
	if (progress.message && progress.message.trim().length > 0) {
		return `${progress.message} (${value})`;
	}
	return `Progress: ${value}`;
}
