declare module "*.ttf" {
	const value: ArrayBuffer;
	export default value;
}

// Legacy helpers removed: web search support is deprecated, so we intentionally
// avoid leaking those shapes into the global ambient types.
