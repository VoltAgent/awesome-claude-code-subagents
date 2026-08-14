export function parseStringToList(links: unknown): string[] {
	if (typeof links !== "string") {
		throw new Error("Expected a string");
	}

	return links
		.split(",")
		.map((link) => link.trim())
		.filter((link) => link.length > 0);
}
