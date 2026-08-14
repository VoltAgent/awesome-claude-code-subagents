import katex from "katex";
import "katex/dist/contrib/mhchem.mjs";
import { Marked } from "marked";
import type { Tokens, TokenizerExtension, RendererExtension } from "marked";
import { parseDocument } from "htmlparser2";
// Simple type to replace removed WebSearchSource
type SimpleSource = {
	title?: string;
	link: string;
};
import hljs from "highlight.js/lib/core";
import type { LanguageFn } from "highlight.js";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import shell from "highlight.js/lib/languages/shell";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import java from "highlight.js/lib/languages/java";
import csharp from "highlight.js/lib/languages/csharp";
import cpp from "highlight.js/lib/languages/cpp";
import cLang from "highlight.js/lib/languages/c";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import scss from "highlight.js/lib/languages/scss";
import markdownLang from "highlight.js/lib/languages/markdown";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import plaintext from "highlight.js/lib/languages/plaintext";
import { parseIncompleteMarkdown } from "./parseIncompleteMarkdown";
import { parseMarkdownIntoBlocks } from "./parseBlocks";

const bundledLanguages: [string, LanguageFn][] = [
	["javascript", javascript],
	["typescript", typescript],
	["json", json],
	["bash", bash],
	["shell", shell],
	["python", python],
	["go", go],
	["rust", rust],
	["java", java],
	["csharp", csharp],
	["cpp", cpp],
	["c", cLang],
	["xml", xml],
	["html", xml],
	["css", css],
	["scss", scss],
	["markdown", markdownLang],
	["yaml", yaml],
	["sql", sql],
	["plaintext", plaintext],
];

bundledLanguages.forEach(([name, language]) => hljs.registerLanguage(name, language));

// Media URL detection
const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov|m4v)([?#]|$)/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|aac|flac)([?#]|$)/i;

function isVideoUrl(url: string): boolean {
	return VIDEO_EXTENSIONS.test(url);
}

function isAudioUrl(url: string): boolean {
	return AUDIO_EXTENSIONS.test(url);
}

// Multimedia HTML sanitization (works in Web Workers - no DOM needed)
const MULTIMEDIA_TAGS = new Set(["video", "source", "audio"]);
const MULTIMEDIA_ALLOWED_ATTRS = new Set([
	"src",
	"type",
	"controls",
	"autoplay",
	"loop",
	"muted",
	"playsinline",
	"poster",
	"width",
	"height",
	"preload",
]);
const MULTIMEDIA_BOOLEAN_ATTRS = new Set(["controls", "autoplay", "loop", "muted", "playsinline"]);
const MULTIMEDIA_URI_ATTRS = new Set(["src", "poster"]);
const MULTIMEDIA_ALLOWED_URI_PATTERN = /^(?!javascript:|data:text\/html)/i;
const MULTIMEDIA_HTML_REGEX = /<\/?(video|source|audio)\b/i;

type HtmlNode = {
	type: string;
	name?: string;
	attribs?: Record<string, string>;
	children?: HtmlNode[];
	data?: string;
};

interface katexBlockToken extends Tokens.Generic {
	type: "katexBlock";
	raw: string;
	text: string;
	displayMode: true;
}

interface katexInlineToken extends Tokens.Generic {
	type: "katexInline";
	raw: string;
	text: string;
	displayMode: false;
}

export const katexBlockExtension: TokenizerExtension & RendererExtension = {
	name: "katexBlock",
	level: "block",

	start(src: string): number | undefined {
		const match = src.match(/(\${2}|\\\[)/);
		return match ? match.index : -1;
	},

	tokenizer(src: string): katexBlockToken | undefined {
		// 1) $$ ... $$
		const rule1 = /^\${2}([\s\S]+?)\${2}/;
		const match1 = rule1.exec(src);
		if (match1) {
			const token: katexBlockToken = {
				type: "katexBlock",
				raw: match1[0],
				text: match1[1].trim(),
				displayMode: true,
			};
			return token;
		}

		// 2) \[ ... \]
		const rule2 = /^\\\[([\s\S]+?)\\\]/;
		const match2 = rule2.exec(src);
		if (match2) {
			const token: katexBlockToken = {
				type: "katexBlock",
				raw: match2[0],
				text: match2[1].trim(),
				displayMode: true,
			};
			return token;
		}

		return undefined;
	},

	renderer(token) {
		if (token.type === "katexBlock") {
			return katex.renderToString(token.text, {
				throwOnError: false,
				displayMode: token.displayMode,
			});
		}
		return undefined;
	},
};

const katexInlineExtension: TokenizerExtension & RendererExtension = {
	name: "katexInline",
	level: "inline",

	start(src: string): number | undefined {
		const match = src.match(/(\$|\\\()/);
		return match ? match.index : -1;
	},

	tokenizer(src: string): katexInlineToken | undefined {
		// 1) $...$
		const rule1 = /^\$([^$]+?)\$/;
		const match1 = rule1.exec(src);
		if (match1) {
			const token: katexInlineToken = {
				type: "katexInline",
				raw: match1[0],
				text: match1[1].trim(),
				displayMode: false,
			};
			return token;
		}

		// 2) \(...\)
		const rule2 = /^\\\(([\s\S]+?)\\\)/;
		const match2 = rule2.exec(src);
		if (match2) {
			const token: katexInlineToken = {
				type: "katexInline",
				raw: match2[0],
				text: match2[1].trim(),
				displayMode: false,
			};
			return token;
		}

		return undefined;
	},

	renderer(token) {
		if (token.type === "katexInline") {
			return katex.renderToString(token.text, {
				throwOnError: false,
				displayMode: token.displayMode,
			});
		}
		return undefined;
	},
};

function escapeHTML(content: string) {
	return content.replace(
		/[<>&"']/g,
		(x) =>
			({
				"<": "&lt;",
				">": "&gt;",
				"&": "&amp;",
				"'": "&#39;",
				'"': "&quot;",
			})[x] || x
	);
}

function addInlineCitations(md: string, webSearchSources: SimpleSource[] = []): string {
	const linkStyle =
		"color: rgb(59, 130, 246); text-decoration: none; hover:text-decoration: underline;";
	return md.replace(/\[(\d+)\]/g, (match: string) => {
		const indices: number[] = (match.match(/\d+/g) || []).map(Number);
		const links: string = indices
			.map((index: number) => {
				if (index === 0) return false;
				const source = webSearchSources[index - 1];
				if (source) {
					return `<a href="${escapeHTML(source.link)}" target="_blank" rel="noreferrer" style="${linkStyle}">${index}</a>`;
				}
				return "";
			})
			.filter(Boolean)
			.join(", ");
		return links ? ` <sup>${links}</sup>` : match;
	});
}

function sanitizeHref(href?: string | null): string | undefined {
	if (!href) return undefined;
	const trimmed = href.trim();
	const lower = trimmed.toLowerCase();
	if (lower.startsWith("javascript:") || lower.startsWith("data:text/html")) {
		return undefined;
	}
	return trimmed.replace(/>$/, "");
}

function highlightCode(text: string, lang?: string): string {
	if (lang && hljs.getLanguage(lang)) {
		try {
			return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
		} catch {
			// fall through to auto-detect
		}
	}
	return hljs.highlightAuto(text).value;
}

function sanitizeMediaUrl(value: string): string | undefined {
	const trimmed = value.trim().replace(/>$/, "");
	if (!MULTIMEDIA_ALLOWED_URI_PATTERN.test(trimmed)) return undefined;
	return trimmed;
}

function serializeMediaAttributes(attribs?: Record<string, string>): string {
	if (!attribs) return "";
	const parts: string[] = [];
	for (const [rawName, rawValue] of Object.entries(attribs)) {
		const name = rawName.toLowerCase();
		if (!MULTIMEDIA_ALLOWED_ATTRS.has(name)) continue;
		if (MULTIMEDIA_BOOLEAN_ATTRS.has(name)) {
			parts.push(name);
			continue;
		}
		let value = rawValue ?? "";
		if (MULTIMEDIA_URI_ATTRS.has(name)) {
			const safeUrl = sanitizeMediaUrl(value);
			if (!safeUrl) continue;
			value = safeUrl;
		}
		parts.push(`${name}="${escapeHTML(value)}"`);
	}
	return parts.length ? ` ${parts.join(" ")}` : "";
}

function serializeMediaNode(node: HtmlNode, state: { hasDisallowedTag: boolean }): string {
	if (node.type === "text") {
		return escapeHTML(node.data ?? "");
	}
	if (node.type === "tag" || node.type === "script" || node.type === "style") {
		const tagName = node.name?.toLowerCase() ?? "";
		if (!MULTIMEDIA_TAGS.has(tagName)) {
			state.hasDisallowedTag = true;
			return "";
		}
		const attrs = serializeMediaAttributes(node.attribs);
		if (tagName === "source") {
			return `<source${attrs}>`;
		}
		const children = (node.children ?? [])
			.map((child) => serializeMediaNode(child, state))
			.join("");
		return `<${tagName}${attrs}>${children}</${tagName}>`;
	}
	if (node.type === "comment") {
		return "";
	}
	return "";
}

/**
 * Sanitizes HTML to allow only video/audio/source tags with safe attributes.
 * Uses htmlparser2 which works in Web Workers (no DOM needed).
 * If any disallowed tags are found, escapes the entire input.
 */
function sanitizeHtmlForMultimedia(html: string): string {
	if (!MULTIMEDIA_HTML_REGEX.test(html)) {
		return escapeHTML(html);
	}
	const document = parseDocument(html, {
		lowerCaseAttributeNames: true,
		lowerCaseTags: true,
		recognizeSelfClosing: true,
	}) as unknown as { children: HtmlNode[] };
	const state = { hasDisallowedTag: false };
	const sanitized = (document.children ?? [])
		.map((child) => serializeMediaNode(child, state))
		.join("");
	if (state.hasDisallowedTag) {
		return escapeHTML(html);
	}
	return sanitized;
}

function createMarkedInstance(sources: SimpleSource[]): Marked {
	return new Marked({
		hooks: {
			postprocess: (html) => addInlineCitations(html, sources),
		},
		extensions: [katexBlockExtension, katexInlineExtension],
		renderer: {
			link: (href, title, text) => {
				const safeHref = sanitizeHref(href);
				return safeHref
					? `<a href="${escapeHTML(safeHref)}" target="_blank" rel="noreferrer">${text}</a>`
					: `<span>${escapeHTML(text ?? "")}</span>`;
			},
			image: (href, title, text) => {
				const safeHref = sanitizeHref(href);
				if (!safeHref) return `<span>${escapeHTML(text ?? "")}</span>`;

				const safeSrc = escapeHTML(safeHref);
				const safeTitle = title ? ` title="${escapeHTML(title)}"` : "";
				const safeAlt = escapeHTML(text ?? "");

				if (isVideoUrl(safeHref)) {
					return `<video controls${safeTitle}><source src="${safeSrc}">${safeAlt}</video>`;
				}
				if (isAudioUrl(safeHref)) {
					return `<audio controls${safeTitle}><source src="${safeSrc}">${safeAlt}</audio>`;
				}
				return `<img src="${safeSrc}" alt="${safeAlt}"${safeTitle} />`;
			},
			html: (html) => sanitizeHtmlForMultimedia(html),
		},
		gfm: true,
		breaks: true,
	});
}
function isFencedBlockClosed(raw?: string): boolean {
	if (!raw) return true;
	/* eslint-disable-next-line no-control-regex */
	const trimmed = raw.replace(/[\s\u0000]+$/, "");
	const openingFenceMatch = trimmed.match(/^([`~]{3,})/);
	if (!openingFenceMatch) {
		return true;
	}
	const fence = openingFenceMatch[1];
	const closingFencePattern = new RegExp(`(?:\n|\r\n)${fence}(?:[\t ]+)?$`);
	return closingFencePattern.test(trimmed);
}

type CodeToken = {
	type: "code";
	lang: string;
	code: string;
	rawCode: string;
	isClosed: boolean;
};

type TextToken = {
	type: "text";
	html: string | Promise<string>;
};

const blockCache = new Map<string, BlockToken>();

function cacheKey(index: number, blockContent: string, sources: SimpleSource[]) {
	const sourceKey = sources.map((s) => s.link).join("|");
	return `${index}-${hashString(blockContent)}|${sourceKey}`;
}

export async function processTokens(content: string, sources: SimpleSource[]): Promise<Token[]> {
	// Apply incomplete markdown preprocessing for smooth streaming
	const processedContent = parseIncompleteMarkdown(content);

	const marked = createMarkedInstance(sources);
	const tokens = marked.lexer(processedContent);

	const processedTokens = await Promise.all(
		tokens.map(async (token) => {
			if (token.type === "code") {
				return {
					type: "code" as const,
					lang: token.lang,
					code: highlightCode(token.text, token.lang),
					rawCode: token.text,
					isClosed: isFencedBlockClosed(token.raw ?? ""),
				};
			} else {
				return {
					type: "text" as const,
					html: marked.parse(token.raw),
				};
			}
		})
	);

	return processedTokens;
}

export function processTokensSync(content: string, sources: SimpleSource[]): Token[] {
	// Apply incomplete markdown preprocessing for smooth streaming
	const processedContent = parseIncompleteMarkdown(content);

	const marked = createMarkedInstance(sources);
	const tokens = marked.lexer(processedContent);
	return tokens.map((token) => {
		if (token.type === "code") {
			return {
				type: "code" as const,
				lang: token.lang,
				code: highlightCode(token.text, token.lang),
				rawCode: token.text,
				isClosed: isFencedBlockClosed(token.raw ?? ""),
			};
		}
		return { type: "text" as const, html: marked.parse(token.raw) };
	});
}

export type Token = CodeToken | TextToken;

export type BlockToken = {
	id: string;
	content: string;
	tokens: Token[];
};

/**
 * Simple hash function for generating stable block IDs
 */
function hashString(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash).toString(36);
}

/**
 * Process markdown content into blocks with stable IDs for efficient memoization.
 * Each block is processed independently and assigned a content-based hash ID.
 */
export async function processBlocks(
	content: string,
	sources: SimpleSource[] = []
): Promise<BlockToken[]> {
	const blocks = parseMarkdownIntoBlocks(content);

	return await Promise.all(
		blocks.map(async (blockContent, index) => {
			const key = cacheKey(index, blockContent, sources);
			const cached = blockCache.get(key);
			if (cached) return cached;

			const tokens = await processTokens(blockContent, sources);
			const block: BlockToken = {
				id: `${index}-${hashString(blockContent)}`,
				content: blockContent,
				tokens,
			};
			blockCache.set(key, block);
			return block;
		})
	);
}

/**
 * Synchronous version of processBlocks for SSR
 */
export function processBlocksSync(content: string, sources: SimpleSource[] = []): BlockToken[] {
	const blocks = parseMarkdownIntoBlocks(content);

	return blocks.map((blockContent, index) => {
		const key = cacheKey(index, blockContent, sources);
		const cached = blockCache.get(key);
		if (cached) return cached;

		const tokens = processTokensSync(blockContent, sources);
		const block: BlockToken = {
			id: `${index}-${hashString(blockContent)}`,
			content: blockContent,
			tokens,
		};
		blockCache.set(key, block);
		return block;
	});
}
