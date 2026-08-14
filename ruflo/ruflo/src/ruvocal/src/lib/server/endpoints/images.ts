import type { Sharp } from "sharp";
import sharp from "sharp";
import type { MessageFile } from "$lib/types/Message";
import { z, type util } from "zod";

export interface ImageProcessorOptions<TMimeType extends string = string> {
	supportedMimeTypes: TMimeType[];
	preferredMimeType: TMimeType;
	maxSizeInMB: number;
	maxWidth: number;
	maxHeight: number;
}
export type ImageProcessor<TMimeType extends string = string> = (file: MessageFile) => Promise<{
	image: Buffer;
	mime: TMimeType;
}>;

export function createImageProcessorOptionsValidator<TMimeType extends string = string>(
	defaults: ImageProcessorOptions<TMimeType>
) {
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
			preferredMimeType: z
				.enum([defaults.supportedMimeTypes[0], ...defaults.supportedMimeTypes.slice(1)])
				.default(defaults.preferredMimeType as util.noUndefined<TMimeType>),
			maxSizeInMB: z.number().positive().default(defaults.maxSizeInMB),
			maxWidth: z.number().int().positive().default(defaults.maxWidth),
			maxHeight: z.number().int().positive().default(defaults.maxHeight),
		})
		.default(defaults);
}

export function makeImageProcessor<TMimeType extends string = string>(
	options: ImageProcessorOptions<TMimeType>
): ImageProcessor<TMimeType> {
	return async (file) => {
		const { supportedMimeTypes, preferredMimeType, maxSizeInMB, maxWidth, maxHeight } = options;
		const { mime, value } = file;

		const buffer = Buffer.from(value, "base64");
		let sharpInst = sharp(buffer);

		const metadata = await sharpInst.metadata();
		if (!metadata) throw Error("Failed to read image metadata");
		const { width, height } = metadata;
		if (width === undefined || height === undefined) throw Error("Failed to read image size");

		const tooLargeInSize = width > maxWidth || height > maxHeight;
		const tooLargeInBytes = buffer.byteLength > maxSizeInMB * 1000 * 1000;

		const outputMime = chooseMimeType(supportedMimeTypes, preferredMimeType, mime, {
			preferSizeReduction: tooLargeInBytes,
		});

		// Resize if necessary
		if (tooLargeInSize || tooLargeInBytes) {
			const size = chooseImageSize({
				mime: outputMime,
				width,
				height,
				maxWidth,
				maxHeight,
				maxSizeInMB,
			});
			if (size.width !== width || size.height !== height) {
				sharpInst = resizeImage(sharpInst, size.width, size.height);
			}
		}

		// Convert format if necessary
		// We always want to convert the image when the file was too large in bytes
		// so we can guarantee that ideal options are used, which are expected when
		// choosing the image size
		if (outputMime !== mime || tooLargeInBytes) {
			sharpInst = convertImage(sharpInst, outputMime);
		}

		const processedImage = await sharpInst.toBuffer();
		return { image: processedImage, mime: outputMime };
	};
}

const outputFormats = ["png", "jpeg", "webp", "avif", "tiff", "gif"] as const;
type OutputImgFormat = (typeof outputFormats)[number];
const isOutputFormat = (format: string): format is (typeof outputFormats)[number] =>
	outputFormats.includes(format as OutputImgFormat);

export function convertImage(sharpInst: Sharp, outputMime: string): Sharp {
	const [type, format] = outputMime.split("/");
	if (type !== "image") throw Error(`Requested non-image mime type: ${outputMime}`);
	if (!isOutputFormat(format)) {
		throw Error(`Requested to convert to an unsupported format: ${format}`);
	}

	return sharpInst[format]();
}

// heic/heif requires proprietary license
// TODO: blocking heif may be incorrect considering it also supports av1, so we should instead
// detect the compression method used via sharp().metadata().compression
// TODO: consider what to do about animated formats: apng, gif, animated webp, ...
const blocklistedMimes = ["image/heic", "image/heif"];

/** Sorted from largest to smallest */
const mimesBySizeDesc = [
	"image/png",
	"image/tiff",
	"image/gif",
	"image/jpeg",
	"image/webp",
	"image/avif",
];

/**
 * Defaults to preferred format or uses existing mime if supported
 * When preferSizeReduction is true, it will choose the smallest format that is supported
 **/
function chooseMimeType<T extends readonly string[]>(
	supportedMimes: T,
	preferredMime: string,
	mime: string,
	{ preferSizeReduction }: { preferSizeReduction: boolean }
): T[number] {
	if (!supportedMimes.includes(preferredMime)) {
		const supportedMimesStr = supportedMimes.join(", ");
		throw Error(
			`Preferred format "${preferredMime}" not found in supported mimes: ${supportedMimesStr}`
		);
	}

	const [type] = mime.split("/");
	if (type !== "image") throw Error(`Received non-image mime type: ${mime}`);

	if (supportedMimes.includes(mime) && !preferSizeReduction) return mime;

	if (blocklistedMimes.includes(mime)) throw Error(`Received blocklisted mime type: ${mime}`);

	const smallestMime = mimesBySizeDesc.findLast((m) => supportedMimes.includes(m));
	return smallestMime ?? preferredMime;
}

interface ImageSizeOptions {
	mime: string;
	width: number;
	height: number;
	maxWidth: number;
	maxHeight: number;
	maxSizeInMB: number;
}

/** Resizes the image to fit within the specified size in MB by guessing the output size */
export function chooseImageSize({
	mime,
	width,
	height,
	maxWidth,
	maxHeight,
	maxSizeInMB,
}: ImageSizeOptions): { width: number; height: number } {
	const biggestDiscrepency = Math.max(1, width / maxWidth, height / maxHeight);

	let selectedWidth = Math.ceil(width / biggestDiscrepency);
	let selectedHeight = Math.ceil(height / biggestDiscrepency);

	do {
		const estimatedSize = estimateImageSizeInBytes(mime, selectedWidth, selectedHeight);
		if (estimatedSize < maxSizeInMB * 1024 * 1024) {
			return { width: selectedWidth, height: selectedHeight };
		}
		selectedWidth = Math.floor(selectedWidth / 1.1);
		selectedHeight = Math.floor(selectedHeight / 1.1);
	} while (selectedWidth > 1 && selectedHeight > 1);

	throw Error(`Failed to resize image to fit within ${maxSizeInMB}MB`);
}

const mimeToCompressionRatio: Record<string, number> = {
	"image/png": 1 / 2,
	"image/jpeg": 1 / 10,
	"image/webp": 1 / 4,
	"image/avif": 1 / 5,
	"image/tiff": 1,
	"image/gif": 1 / 5,
};

/**
 * Guesses the side of an image in MB based on its format and dimensions
 * Should guess the worst case
 **/
function estimateImageSizeInBytes(mime: string, width: number, height: number): number {
	const compressionRatio = mimeToCompressionRatio[mime];
	if (!compressionRatio) throw Error(`Unsupported image format: ${mime}`);

	const bitsPerPixel = 32; // Assuming 32-bit color depth for 8-bit R G B A
	const bytesPerPixel = bitsPerPixel / 8;
	const uncompressedSize = width * height * bytesPerPixel;

	return uncompressedSize * compressionRatio;
}

export function resizeImage(sharpInst: Sharp, maxWidth: number, maxHeight: number): Sharp {
	return sharpInst.resize({ width: maxWidth, height: maxHeight, fit: "inside" });
}
