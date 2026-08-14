<script lang="ts">
	import { fade } from "svelte/transition";
	import Portal from "./Portal.svelte";
	import IconDazzled from "$lib/components/icons/IconDazzled.svelte";

	interface Props {
		message?: string;
	}

	let { message = "" }: Props = $props();
</script>

<Portal>
	<div
		transition:fade|global={{ duration: 300 }}
		class="pointer-events-none fixed right-0 top-12 z-50 bg-gradient-to-bl from-red-500/20 via-red-500/0 to-red-500/0 pb-36 pl-36 pr-2 pt-2 max-sm:text-sm md:top-0 md:pr-8 md:pt-5"
	>
		<div
			class="pointer-events-auto flex items-center rounded-full bg-white/90 px-3 py-1 shadow-sm dark:bg-gray-900/80"
		>
			<IconDazzled classNames="text-2xl mr-2 flex-none" />
			<h2 class="line-clamp-2 max-w-2xl font-semibold text-gray-800 dark:text-gray-200">
				{message}
			</h2>
		</div>
	</div>
</Portal>
