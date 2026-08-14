import type { MessageFile } from "$lib/types/Message";
import { z } from "zod";

export interface FileProcessorOptions<TMimeType extends string = string> {
	supportedMimeTypes: TMimeType[];
	maxSizeInMB: number;
}

// Removed unused ImageProcessor type alias

export const createDocumentProcessorOptionsValidator = <TMimeType extends string = string>(
	defaults: FileProcessorOptions<TMimeType>
) => {
	return z
		.object({
			supportedMimeTypes: z
				.array(
					z.enum<string, [TMimeType, ...TMimeType[]]>([
						defaults.supportedMimeTypes[0],
						...defaults.supportedMimeTypes.slice(1),
					])
				)
				.default(defaults.supportedMimeTypes),
			maxSizeInMB: z.number().positive().default(defaults.maxSizeInMB),
		})
		.default(defaults);
};

// Removed unused DocumentProcessor type alias

export type AsyncDocumentProcessor<TMimeType extends string = string> = (
	file: MessageFile
) => Promise<{
	file: Buffer;
	mime: TMimeType;
}>;

export function makeDocumentProcessor<TMimeType extends string = string>(
	options: FileProcessorOptions<TMimeType>
): AsyncDocumentProcessor<TMimeType> {
	return async (file) => {
		const { supportedMimeTypes, maxSizeInMB } = options;
		const { mime, value } = file;

		const buffer = Buffer.from(value, "base64");
		const tooLargeInBytes = buffer.byteLength > maxSizeInMB * 1000 * 1000;

		if (tooLargeInBytes) {
			throw Error("Document is too large");
		}

		const outputMime = validateMimeType(supportedMimeTypes, mime);
		return { file: buffer, mime: outputMime };
	};
}

const validateMimeType = <T extends readonly string[]>(
	supportedMimes: T,
	mime: string
): T[number] => {
	if (!supportedMimes.includes(mime)) {
		const supportedMimesStr = supportedMimes.join(", ");

		throw Error(`Mimetype "${mime}" not found in supported mimes: ${supportedMimesStr}`);
	}

	return mime;
};
