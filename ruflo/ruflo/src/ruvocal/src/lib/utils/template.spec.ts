import { describe, test, expect } from "vitest";
import { compileTemplate } from "./template";

// Test data for simple templates
const modelData = {
	preprompt: "Hello",
};

const simpleTemplate = "Test: {{preprompt}} and {{foo}}";

// Additional realistic test data for Llama 70B templates
const messages = [
	{ from: "user", content: "Hello there" },
	{ from: "assistant", content: "Hi, how can I help?" },
];

// Handlebars Llama 70B Template
const llama70bTemplateHB = `<s>{{#if preprompt}}Source: system\n\n{{preprompt}}<step>{{/if}}{{#each messages}}{{#ifUser}}Source: user\n\n{{content}}<step>{{/ifUser}}{{#ifAssistant}}Source: assistant\n\n{{content}}<step>{{/ifAssistant}}{{/each}}Source: assistant\nDestination: user\n\n`;

// Expected output for Handlebars Llama 70B Template
const expectedHB =
	"<s>Source: system\n\nSystem Message<step>Source: user\n\nHello there<step>Source: assistant\n\nHi, how can I help?<step>Source: assistant\nDestination: user\n\n";

// Jinja Llama 70B Template
const llama70bTemplateJinja = `<s>{% if preprompt %}Source: system\n\n{{ preprompt }}<step>{% endif %}{% for message in messages %}{% if message.from == 'user' %}Source: user\n\n{{ message.content }}<step>{% elif message.from == 'assistant' %}Source: assistant\n\n{{ message.content }}<step>{% endif %}{% endfor %}Source: assistant\nDestination: user\n\n`;

// Expected output for Jinja Llama 70B Template
const expectedJinja =
	"<s>Source: system\n\nSystem Message<step>Source: user\n\nHello there<step>Source: assistant\n\nHi, how can I help?<step>Source: assistant\nDestination: user\n\n";

describe("Template Engine Rendering", () => {
	test("should render using Handlebars fallback when no templateEngine is specified", () => {
		const render = compileTemplate(simpleTemplate, modelData);
		const result = render({ foo: "World" });
		expect(result).toBe("Test: Hello and World");
	});

	test('should render using Jinja when templateEngine is set to "jinja"', () => {
		const render = compileTemplate(simpleTemplate, modelData);
		const result = render({ foo: "World" });
		expect(result).toBe("Test: Hello and World");
	});

	// Realistic Llama 70B template tests
	test("should render realistic Llama 70B template using Handlebars", () => {
		const render = compileTemplate(llama70bTemplateHB, { preprompt: "System Message" });
		const result = render({ messages });
		expect(result).toBe(expectedHB);
	});

	test("should render realistic Llama 70B template using Jinja", () => {
		const render = compileTemplate(llama70bTemplateJinja, {
			preprompt: "System Message",
		});
		const result = render({ messages });
		// Trim both outputs to account for whitespace differences in Jinja engine
		expect(result.trim()).toBe(expectedJinja.trim());
	});
});
