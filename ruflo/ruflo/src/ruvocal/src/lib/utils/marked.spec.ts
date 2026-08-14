import { describe, expect, test } from "vitest";
import { processTokensSync } from "./marked";

function renderHtml(md: string): string {
	const tokens = processTokensSync(md, []);
	const textToken = tokens.find((token) => token.type === "text");
	if (!textToken || textToken.type !== "text") return "";
	return typeof textToken.html === "string" ? textToken.html : "";
}

describe("marked basic rendering", () => {
	test("renders bold text", () => {
		const html = renderHtml("**bold**");
		expect(html).toContain("<strong>bold</strong>");
	});

	test("renders links", () => {
		const html = renderHtml("[link](https://example.com)");
		expect(html).toContain('<a href="https://example.com"');
		expect(html).toContain("link</a>");
	});

	test("renders paragraphs", () => {
		const html = renderHtml("hello world");
		expect(html).toContain("<p>hello world</p>");
	});
});

describe("marked image renderer", () => {
	test("renders video extensions as <video>", () => {
		const html = renderHtml("![](https://example.com/clip.mp4)");
		expect(html).toContain("<video controls");
		expect(html).toContain('<source src="https://example.com/clip.mp4">');
	});

	test("renders audio extensions as <audio>", () => {
		const html = renderHtml("![](https://example.com/clip.mp3)");
		expect(html).toContain("<audio controls");
		expect(html).toContain('<source src="https://example.com/clip.mp3">');
	});

	test("renders non-video images as <img>", () => {
		const html = renderHtml("![](https://example.com/pic.png)");
		expect(html).toContain('<img src="https://example.com/pic.png"');
	});

	test("renders video with query params", () => {
		const html = renderHtml("![](https://example.com/clip.mp4?token=abc)");
		expect(html).toContain("<video controls");
		expect(html).toContain("clip.mp4?token=abc");
	});
});

describe("marked html video tag support", () => {
	test("allows raw <video> tags with controls", () => {
		const html = renderHtml('<video controls src="https://example.com/video.mp4"></video>');
		expect(html).toContain("<video");
		expect(html).toContain("controls");
		expect(html).toContain('src="https://example.com/video.mp4"');
	});

	test("allows <video> with nested <source> tags", () => {
		const html = renderHtml(
			'<video controls><source src="https://example.com/video.webm" type="video/webm"></video>'
		);
		expect(html).toContain("<video");
		expect(html).toContain("<source");
		expect(html).toContain('src="https://example.com/video.webm"');
	});

	test("strips disallowed attributes from video tags", () => {
		const html = renderHtml('<video onclick="alert(1)" src="https://example.com/v.mp4"></video>');
		expect(html).toContain("<video");
		expect(html).not.toContain("onclick");
	});

	test("strips javascript: URLs from media sources", () => {
		const html = renderHtml('<video controls src="javascript:alert(1)"></video>');
		expect(html).not.toContain("javascript:");
	});

	test("escapes disallowed html tags", () => {
		const html = renderHtml("<script>alert(1)</script>");
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});

	test("allows <audio> tags with controls", () => {
		const html = renderHtml(
			'<audio controls><source src="https://example.com/audio.mp3" type="audio/mpeg"></audio>'
		);
		expect(html).toContain("<audio");
		expect(html).toContain("<source");
		expect(html).toContain('type="audio/mpeg"');
	});
});
