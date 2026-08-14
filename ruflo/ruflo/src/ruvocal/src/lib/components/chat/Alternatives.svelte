<script lang="ts">
	import type { Message } from "$lib/types/Message";
	import CarbonChevronLeft from "~icons/carbon/chevron-left";
	import CarbonChevronRight from "~icons/carbon/chevron-right";

	interface Props {
		message: Message;
		alternatives?: Message["id"][];
		loading?: boolean;
		classNames?: string;
		onshowAlternateMsg?: (payload: { id: Message["id"] }) => void;
	}

	let {
		message,
		alternatives = [],
		loading = false,
		classNames = "",
		onshowAlternateMsg,
	}: Props = $props();

	let currentIdx = $derived(alternatives.findIndex((id) => id === message.id));

	// API client removed as deletion UI is commented out
</script>

<div
	class="font-white group/navbranch z-0 flex h-6 w-fit select-none items-center justify-center gap-1 whitespace-nowrap text-sm {classNames}"
>
	<button
		class="inline text-lg font-thin text-gray-400 hover:text-gray-800 disabled:pointer-events-none disabled:opacity-25 dark:text-gray-500 dark:hover:text-gray-200"
		onclick={() => onshowAlternateMsg?.({ id: alternatives[Math.max(0, currentIdx - 1)] })}
		disabled={currentIdx === 0 || loading}
	>
		<CarbonChevronLeft class="text-sm" />
	</button>
	<span class=" text-gray-400 dark:text-gray-500">
		{currentIdx + 1} / {alternatives.length}
	</span>
	<button
		class="inline text-lg font-thin text-gray-400 hover:text-gray-800 disabled:pointer-events-none disabled:opacity-25 dark:text-gray-500 dark:hover:text-gray-200"
		onclick={() =>
			onshowAlternateMsg?.({
				id: alternatives[Math.min(alternatives.length - 1, currentIdx + 1)],
			})}
		disabled={currentIdx === alternatives.length - 1 || loading}
	>
		<CarbonChevronRight class="text-sm" />
	</button>
	<!-- {#if !loading && message.children}
		<button
			class="hidden group-hover/navbranch:block"
			onclick={() => {
				if (confirm("Are you sure you want to delete this branch?")) {
					client
						.conversations({ id: page.params.id })
						.message({ messageId: message.id })
						.delete()
						.then(handleResponse)
						.then(async () => {
							await invalidate(UrlDependency.Conversation);
						})
						.catch((err) => {
							console.error(err);
							$error = String(err);
						});
				}
			}}
		>
			<div
				class="flex items-center justify-center text-xs text-gray-400 hover:text-gray-800 dark:text-gray-500 dark:hover:text-gray-200"
			>
				<CarbonTrashCan />
			</div>
		</button>
	{/if} -->
</div>
