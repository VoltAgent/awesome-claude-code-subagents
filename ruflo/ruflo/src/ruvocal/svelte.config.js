import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import dotenv from "dotenv";
import { execSync } from "child_process";

dotenv.config({ path: "./.env.local", override: true });
dotenv.config({ path: "./.env" });

const useStatic = process.env.ADAPTER === "static";

function getCurrentCommitSHA() {
	try {
		return execSync("git rev-parse HEAD").toString();
	} catch (error) {
		console.error("Error getting current commit SHA:", error);
		return "unknown";
	}
}

process.env.PUBLIC_VERSION ??= process.env.npm_package_version;
process.env.PUBLIC_COMMIT_SHA ??= getCurrentCommitSHA();
process.env.PUBLIC_APP_ASSETS ??= "chatui";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: useStatic ? adapterStatic({ fallback: "index.html", strict: false }) : adapterNode(),

		paths: {
			base: process.env.APP_BASE || "",
			relative: false,
		},
		csrf: {
			// handled in hooks.server.ts, because we can have multiple valid origins
			trustedOrigins: ["*"],
		},
		csp: {
			directives: {
				...(process.env.ALLOW_IFRAME === "true"
					? {}
					: { "frame-ancestors": ["https://huggingface.co"] }),
			},
		},
		alias: {},
	},
};

export default config;
