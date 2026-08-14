import { base } from "$app/paths";

export async function load({ params, parent, fetch }) {
	await fetch(`${base}/api/v2/models/${params.model}/subscribe`, {
		method: "POST",
	});

	return {
		settings: await parent().then((data) => ({
			...data.settings,
			activeModel: params.model,
		})),
	};
}
