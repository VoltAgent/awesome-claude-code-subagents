import type { EndpointMessage } from "../../endpoints/endpoints";

export type FileRefPayload = {
	name: string;
	mime: string;
	base64: string;
};

export type RefKind = {
	prefix: string;
	matches: (mime: string) => boolean;
	toDataUrl?: (payload: FileRefPayload) => string;
};

export type ResolvedFileRef = FileRefPayload & { refKind: RefKind };
export type FileRefResolver = (ref: string) => ResolvedFileRef | undefined;

const IMAGE_REF_KIND: RefKind = {
	prefix: "image",
	matches: (mime) => typeof mime === "string" && mime.startsWith("image/"),
	toDataUrl: (payload) => `data:${payload.mime};base64,${payload.base64}`,
};

const DEFAULT_REF_KINDS: RefKind[] = [IMAGE_REF_KIND];

/**
 * Build a resolver that maps short ref strings (e.g. "image_1", "image_2") to the
 * corresponding file payload across the whole conversation in chronological
 * order of user uploads. (image_1 = first user-uploaded image, image_2 = second, etc.)
 * Currently only images are exposed to end users, but the plumbing supports
 * additional kinds later.
 */
export function buildFileRefResolver(
	messages: EndpointMessage[],
	refKinds: RefKind[] = DEFAULT_REF_KINDS
): FileRefResolver | undefined {
	if (!Array.isArray(refKinds) || refKinds.length === 0) return undefined;

	// Bucket matched files by ref kind preserving conversation order (oldest -> newest)
	const buckets = new Map<RefKind, FileRefPayload[]>();
	for (const msg of messages) {
		if (msg.from !== "user") continue;
		for (const file of msg.files ?? []) {
			const mime = file?.mime ?? "";
			const kind = refKinds.find((k) => k.matches(mime));
			if (!kind) continue;
			const payload: FileRefPayload = { name: file.name, mime, base64: file.value };
			const arr = buckets.get(kind) ?? [];
			arr.push(payload);
			buckets.set(kind, arr);
		}
	}

	if (buckets.size === 0) return undefined;

	const resolver: FileRefResolver = (ref) => {
		if (!ref || typeof ref !== "string") return undefined;
		const trimmed = ref.trim().toLowerCase();
		for (const kind of refKinds) {
			const match = new RegExp(`^${kind.prefix}_(\\d+)$`).exec(trimmed);
			if (!match) continue;
			const idx = Number(match[1]) - 1;
			const files = buckets.get(kind) ?? [];
			if (Number.isFinite(idx) && idx >= 0 && idx < files.length) {
				const payload = files[idx];
				return payload ? { ...payload, refKind: kind } : undefined;
			}
		}
		return undefined;
	};

	return resolver;
}

export function buildImageRefResolver(messages: EndpointMessage[]): FileRefResolver | undefined {
	return buildFileRefResolver(messages, [IMAGE_REF_KIND]);
}

type FieldRule = {
	keys: string[];
	action: "attachPayload" | "replaceWithDataUrl";
	attachKey?: string;
	allowedPrefixes?: string[]; // limit to specific ref kinds (e.g. ["image"])
};

const DEFAULT_FIELD_RULES: FieldRule[] = [
	{
		keys: ["image_ref"],
		action: "attachPayload",
		attachKey: "image",
		allowedPrefixes: ["image"],
	},
	{
		keys: ["input_image", "image", "image_url"],
		action: "replaceWithDataUrl",
		allowedPrefixes: ["image"],
	},
];

/**
 * Walk tool args and hydrate known ref fields while keeping logging lightweight.
 * Only image refs are recognized for now to preserve current behavior.
 */
export function attachFileRefsToArgs(
	argsObj: Record<string, unknown>,
	resolveRef?: FileRefResolver,
	fieldRules: FieldRule[] = DEFAULT_FIELD_RULES
): void {
	if (!resolveRef) return;

	const visit = (node: unknown): void => {
		if (!node || typeof node !== "object") return;
		if (Array.isArray(node)) {
			for (const v of node) visit(v);
			return;
		}

		const obj = node as Record<string, unknown>;
		for (const [key, value] of Object.entries(obj)) {
			if (typeof value !== "string") {
				if (value && typeof value === "object") visit(value);
				continue;
			}

			const resolved = resolveRef(value);
			if (!resolved) continue;

			const rule = fieldRules.find((r) => r.keys.includes(key));
			if (!rule) continue;
			if (rule.allowedPrefixes && !rule.allowedPrefixes.includes(resolved.refKind.prefix)) continue;

			if (rule.action === "attachPayload") {
				const targetKey = rule.attachKey ?? "file";
				if (
					typeof obj[targetKey] !== "object" ||
					obj[targetKey] === null ||
					Array.isArray(obj[targetKey])
				) {
					obj[targetKey] = {
						name: resolved.name,
						mime: resolved.mime,
						base64: resolved.base64,
					};
				}
			} else if (rule.action === "replaceWithDataUrl") {
				const toUrl =
					resolved.refKind.toDataUrl ??
					((p: FileRefPayload) => `data:${p.mime};base64,${p.base64}`);
				obj[key] = toUrl(resolved);
			}
		}
	};

	visit(argsObj);
}
