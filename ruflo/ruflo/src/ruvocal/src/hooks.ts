import { publicConfigTransporter } from "$lib/utils/PublicConfig.svelte";
import type { Transport } from "@sveltejs/kit";

export const transport: Transport = {
	PublicConfig: publicConfigTransporter,
};
