import ModelThumbnail from "./ModelThumbnail.svelte";
import { redirect, type RequestHandler } from "@sveltejs/kit";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { html } from "satori-html";

import InterRegular from "$lib/server/fonts/Inter-Regular.ttf";
import InterBold from "$lib/server/fonts/Inter-Bold.ttf";
import { base } from "$app/paths";
import { models } from "$lib/server/models";
import { render } from "svelte/server";
import { config } from "$lib/server/config";

export const GET: RequestHandler = (async ({ params }) => {
	const model = models.find(({ id }) => id === params.model);

	if (!model || model.unlisted) {
		redirect(302, `${base}/`);
	}
	const renderedComponent = render(ModelThumbnail, {
		props: {
			name: model.name,
			isHuggingChat: config.isHuggingChat,
		},
	});

	// satori-html returns a VNode (React-like). satori's TS types expect ReactNode,
	// so cast here to satisfy the compiler without pulling in React types.
	const reactLike = html(
		"<style>" + renderedComponent.head + "</style>" + renderedComponent.body
	) as unknown as never;

	const svg = await satori(reactLike, {
		width: 1200,
		height: 648,
		fonts: [
			{
				name: "Inter",
				data: InterRegular as unknown as ArrayBuffer,
				weight: 500,
			},
			{
				name: "Inter",
				data: InterBold as unknown as ArrayBuffer,
				weight: 700,
			},
		],
	});

	const png = new Resvg(svg, {
		fitTo: { mode: "original" },
	})
		.render()
		.asPng();

	// Return a Uint8Array so BodyInit matches cleanly without generics mismatch
	return new Response(new Uint8Array(png), {
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
		},
	});
}) satisfies RequestHandler;
