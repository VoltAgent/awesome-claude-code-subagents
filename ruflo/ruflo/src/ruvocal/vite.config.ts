import { sveltekit } from "@sveltejs/kit/vite";
import Icons from "unplugin-icons/vite";
import { promises } from "fs";
import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: "./.env.local" });

// used to load fonts server side for thumbnail generation
function loadTTFAsArrayBuffer() {
	return {
		name: "load-ttf-as-array-buffer",
		async transform(_src, id) {
			if (id.endsWith(".ttf")) {
				return `export default new Uint8Array([
			${new Uint8Array(await promises.readFile(id))}
		  ]).buffer`;
			}
		},
	};
}
export default defineConfig({
	plugins: [
		sveltekit(),
		Icons({
			compiler: "svelte",
		}),
		loadTTFAsArrayBuffer(),
	],
	// Allow external access via ngrok tunnel host
	server: {
		port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
		// Allow any ngrok-free.app subdomain (dynamic tunnels)
		// See Vite server.allowedHosts: string[] | true
		// Using leading dot matches subdomains per Vite's host check logic
		allowedHosts: ["huggingface.ngrok.io"],
	},
	optimizeDeps: {
		include: ["uuid", "sharp", "clsx"],
	},
	test: {
		workspace: [
			...(process.env.VITEST_BROWSER === "true"
				? [
						{
							// Client-side tests (Svelte components), opt-in due flaky browser harness in CI/local
							extends: "./vite.config.ts",
							test: {
								name: "client",
								environment: "browser",
								browser: {
									enabled: true,
									provider: "playwright",
									instances: [{ browser: "chromium", headless: true }],
								},
								include: ["src/**/*.svelte.{test,spec}.{js,ts}"],
								exclude: ["src/lib/server/**", "src/**/*.ssr.{test,spec}.{js,ts}"],
								setupFiles: ["./scripts/setups/vitest-setup-client.ts"],
							},
						},
					]
				: []),
			{
				// SSR tests (Server-side rendering)
				extends: "./vite.config.ts",
				test: {
					name: "ssr",
					environment: "node",
					include: ["src/**/*.ssr.{test,spec}.{js,ts}"],
				},
			},
			{
				// Server-side tests (Node.js utilities)
				extends: "./vite.config.ts",
				test: {
					name: "server",
					environment: "node",
					include: ["src/**/*.{test,spec}.{js,ts}"],
					exclude: ["src/**/*.svelte.{test,spec}.{js,ts}", "src/**/*.ssr.{test,spec}.{js,ts}"],
					setupFiles: ["./scripts/setups/vitest-setup-server.ts"],
					testTimeout: 30000,
					hookTimeout: 30000,
				},
			},
		],
	},
});
