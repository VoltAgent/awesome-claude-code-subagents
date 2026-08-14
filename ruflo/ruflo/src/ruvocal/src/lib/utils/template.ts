import type { Message } from "$lib/types/Message";
import Handlebars from "handlebars";
import { Template } from "@huggingface/jinja";
import { logger } from "$lib/server/logger";

// Register Handlebars helpers
Handlebars.registerHelper("ifUser", function (this: Pick<Message, "from" | "content">, options) {
	if (this.from == "user") return options.fn(this);
});

Handlebars.registerHelper(
	"ifAssistant",
	function (this: Pick<Message, "from" | "content">, options) {
		if (this.from == "assistant") return options.fn(this);
	}
);

// Updated compileTemplate to try Jinja and fallback to Handlebars if Jinja fails
export function compileTemplate<T>(
	input: string,
	model: { preprompt: string; templateEngine?: string }
) {
	let jinjaTemplate: Template | undefined;
	try {
		// Try to compile with Jinja
		jinjaTemplate = new Template(input);
	} catch (e) {
		// logger.error(e, "Could not compile with Jinja");
		// Could not compile with Jinja
		jinjaTemplate = undefined;
	}

	const hbTemplate = Handlebars.compile<T>(input, {
		knownHelpers: { ifUser: true, ifAssistant: true },
		knownHelpersOnly: true,
		noEscape: true,
		strict: true,
		preventIndent: true,
	});

	return function render(inputs: T) {
		if (jinjaTemplate) {
			try {
				return jinjaTemplate.render({ ...model, ...inputs });
			} catch (e) {
				logger.error(e, "Could not render with Jinja");
				// Fallback to Handlebars if Jinja rendering fails
				return hbTemplate({ ...model, ...inputs });
			}
		}
		return hbTemplate({ ...model, ...inputs });
	};
}
