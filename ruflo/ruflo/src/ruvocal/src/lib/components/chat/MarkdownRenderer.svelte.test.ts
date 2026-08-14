import MarkdownRenderer from "./MarkdownRenderer.svelte";
import { render } from "vitest-browser-svelte";
import { page } from "@vitest/browser/context";

import { describe, expect, it } from "vitest";

describe("MarkdownRenderer", () => {
	it("renders", () => {
		render(MarkdownRenderer, { content: "Hello, world!" });
		expect(page.getByText("Hello, world!")).toBeInTheDocument();
	});
	it("renders headings", () => {
		render(MarkdownRenderer, { content: "# Hello, world!" });
		expect(page.getByRole("heading", { level: 1 })).toBeInTheDocument();
	});
	it("renders links", () => {
		render(MarkdownRenderer, { content: "[Hello, world!](https://example.com)" });
		const link = page.getByRole("link", { name: "Hello, world!" });
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "https://example.com");
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noreferrer");
	});
	it("renders inline codespans", () => {
		render(MarkdownRenderer, { content: "`foobar`" });
		expect(page.getByRole("code")).toHaveTextContent("foobar");
	});
	it("renders block codes", () => {
		render(MarkdownRenderer, { content: "```foobar```" });
		expect(page.getByRole("code")).toHaveTextContent("foobar");
	});
	it("doesnt render raw html directly", () => {
		render(MarkdownRenderer, { content: "<button>Click me</button>" });
		expect(page.getByRole("button").elements).toHaveLength(0);
		// htmlparser2 escapes disallowed tags
		expect(page.getByRole("paragraph")).toHaveTextContent("<button>Click me</button>");
	});
	it("renders latex", () => {
		const { baseElement } = render(MarkdownRenderer, { content: "$(oo)^2$" });
		expect(baseElement.querySelectorAll(".katex")).toHaveLength(1);
	});
	it("does not render latex in code blocks", () => {
		const { baseElement } = render(MarkdownRenderer, { content: "```\n$(oo)^2$\n```" });
		expect(baseElement.querySelectorAll(".katex")).toHaveLength(0);
	});
	it("does not render latex in inline codes", () => {
		const { baseElement } = render(MarkdownRenderer, { content: "`$oo` and `$bar`" });
		expect(baseElement.querySelectorAll(".katex")).toHaveLength(0);
	});
	it("does not render latex across multiple lines", () => {
		const { baseElement } = render(MarkdownRenderer, { content: "* $oo \n* $aa" });
		expect(baseElement.querySelectorAll(".katex")).toHaveLength(0);
	});
	it("renders latex with some < and > symbols", () => {
		const { baseElement } = render(MarkdownRenderer, { content: "$foo < bar > baz$" });
		expect(baseElement.querySelectorAll(".katex")).toHaveLength(1);
	});
});
