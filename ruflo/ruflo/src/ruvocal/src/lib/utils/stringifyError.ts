/** Takes an unknown error and attempts to convert it to a string */
export function stringifyError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	if (typeof error === "object" && error !== null) {
		// try a few common properties
		if ("message" in error && typeof error.message === "string") return error.message;
		if ("body" in error && typeof error.body === "string") return error.body;
		if ("name" in error && typeof error.name === "string") return error.name;
	}
	return "Unknown error";
}
