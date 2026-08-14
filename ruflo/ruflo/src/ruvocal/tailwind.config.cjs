const defaultTheme = require("tailwindcss/defaultTheme");
const colors = require("tailwindcss/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: "class",
	mode: "jit",
	content: ["./src/**/*.{html,js,svelte,ts}"],
	theme: {
		extend: {
			colors: {
				gray: {
					600: "#323843",
					700: "#252a33",
					800: "#1b1f27",
					900: "#12151c",
					950: "#07090d",
				},
			},
			fontSize: {
				xxs: "0.625rem",
				smd: "0.94rem",
			},
		},
	},
	plugins: [
		require("tailwind-scrollbar")({ nocompatible: true }),
		require("@tailwindcss/typography"),
	],
};
