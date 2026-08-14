module.exports = {
	root: true,
	parser: "@typescript-eslint/parser",
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:svelte/recommended",
		"prettier",
	],
	plugins: ["@typescript-eslint"],
	ignorePatterns: ["*.cjs"],
	overrides: [
		{
			files: ["*.svelte"],
			parser: "svelte-eslint-parser",
			parserOptions: {
				parser: "@typescript-eslint/parser",
			},
		},
	],
	parserOptions: {
		sourceType: "module",
		ecmaVersion: 2020,
		extraFileExtensions: [".svelte"],
	},
	rules: {
		"no-empty": "off",
		"require-yield": "off",
		"@typescript-eslint/no-explicit-any": "error",
		"@typescript-eslint/no-non-null-assertion": "error",
		"@typescript-eslint/no-unused-vars": [
			// prevent variables with a _ prefix from being marked as unused
			"error",
			{
				argsIgnorePattern: "^_",
			},
		],
		"object-shorthand": ["error", "always"],
	},
	env: {
		browser: true,
		es2017: true,
		node: true,
	},
};
