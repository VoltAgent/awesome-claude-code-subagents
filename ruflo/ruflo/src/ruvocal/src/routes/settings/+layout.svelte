<script lang="ts">
	import { base } from "$app/paths";
	import { afterNavigate, goto } from "$app/navigation";
	import { useSettingsStore } from "$lib/stores/settings";
	import CarbonCheckmark from "~icons/carbon/checkmark";

	import Modal from "$lib/components/Modal.svelte";

	interface Props {
		children?: import("svelte").Snippet;
	}

	let { children }: Props = $props();

	let previousPage: string = $state(base || "/");

	afterNavigate(({ from }) => {
		if (from?.url && !from.url.pathname.includes("settings")) {
			previousPage = from.url.toString() || previousPage || base || "/";
		}
	});

	const settings = useSettingsStore();
</script>

<Modal
	onclose={() => goto(previousPage)}
	disableFly={true}
	width="border dark:border-gray-700 h-[95dvh] w-[90dvw] pb-0 overflow-hidden rounded-2xl bg-white shadow-2xl outline-none dark:bg-gray-800 dark:text-gray-200 sm:h-[95dvh] xl:w-[1200px] xl:h-[85dvh] 2xl:h-[75dvh]"
>
	{@render children?.()}
	{#if $settings.recentlySaved}
		<div
			class="absolute bottom-4 right-4 m-2 flex items-center gap-1.5 rounded-full border bg-black px-3 py-1 text-white dark:border-white/10 dark:bg-gray-700 dark:text-gray-100"
		>
			<CarbonCheckmark class="text-white" />
			Saved
		</div>
	{/if}
</Modal>
