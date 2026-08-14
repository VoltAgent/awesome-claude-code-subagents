import { readFile } from "node:fs/promises";
import { config } from "$lib/server/config";
import type { Route } from "./types";

let ROUTES: Route[] = [];
let loaded = false;

export async function loadPolicy(): Promise<Route[]> {
	const path = config.LLM_ROUTER_ROUTES_PATH;
	const text = await readFile(path, "utf8");
	const arr = JSON.parse(text) as Route[];
	if (!Array.isArray(arr)) {
		throw new Error("Routes config must be a flat array of routes");
	}
	const seen = new Set<string>();
	for (const r of arr) {
		if (!r?.name || !r?.description || !r?.primary_model) {
			throw new Error(`Invalid route entry: ${JSON.stringify(r)}`);
		}
		if (seen.has(r.name)) {
			throw new Error(`Duplicate route name: ${r.name}`);
		}
		seen.add(r.name);
	}
	ROUTES = arr;
	loaded = true;
	return ROUTES;
}

export async function getRoutes(): Promise<Route[]> {
	if (!loaded) await loadPolicy();
	return ROUTES;
}

export function resolveRouteModels(
	routeName: string,
	routes: Route[],
	fallbackModel: string
): { candidates: string[] } {
	if (routeName === "arch_router_failure") {
		return { candidates: [fallbackModel] };
	}
	const sel =
		routes.find((r) => r.name === routeName) ||
		routes.find((r) => r.name === "casual_conversation");
	if (!sel) return { candidates: [fallbackModel] };
	const fallbacks = Array.isArray(sel.fallback_models) ? sel.fallback_models : [];
	return { candidates: [sel.primary_model, ...fallbacks] };
}
