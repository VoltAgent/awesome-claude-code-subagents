<script lang="ts">
	import type { MessageToolUpdate } from "$lib/types/MessageUpdate";
	import ToolUpdate from "./ToolUpdate.svelte";
	import CarbonChevronDown from "~icons/carbon/chevron-down";

	interface ToolBlock {
		uuid: string;
		updates: MessageToolUpdate[];
	}

	interface Props {
		step: number;
		tools: ToolBlock[];
		loading?: boolean;
	}

	let { step, tools, loading = false }: Props = $props();

	let isCollapsed = $state(false);

	let allDone = $derived(
		tools.every((t) =>
			t.updates.some(
				(u) =>
					("subtype" in u && u.subtype === "result") || ("subtype" in u && u.subtype === "error")
			)
		)
	);

	// Auto-collapse completed groups after 1.5s
	$effect(() => {
		if (allDone && !loading) {
			const timer = setTimeout(() => {
				isCollapsed = true;
			}, 1500);
			return () => clearTimeout(timer);
		}
	});
</script>

<div
	class="my-2 rounded-lg border {allDone
		? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/20'
		: 'border-blue-200 bg-blue-50/50 dark:border-blue-800/50 dark:bg-blue-950/20'}"
	data-exclude-from-copy
>
	<!-- Header -->
	<button
		onclick={() => (isCollapsed = !isCollapsed)}
		class="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium {allDone
			? 'text-emerald-700 dark:text-emerald-400'
			: 'text-blue-700 dark:text-blue-400'}"
	>
		<span
			class="flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white {allDone
				? 'bg-emerald-500'
				: 'bg-blue-500'}"
		>
			{step}
		</span>

		{#if loading && !allDone}
			<span class="inline-block size-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"></span>
			<span>Running {tools.length} tool{tools.length > 1 ? "s" : ""} in parallel...</span>
		{:else if allDone}
			<span>Step {step} — {tools.length} tool{tools.length > 1 ? "s" : ""} completed</span>
		{:else}
			<span>Step {step} — {tools.length} tool{tools.length > 1 ? "s" : ""}</span>
		{/if}

		<CarbonChevronDown
			class="ml-auto size-3.5 transition-transform {isCollapsed ? '-rotate-90' : ''}"
		/>
	</button>

	<!-- Content -->
	{#if !isCollapsed}
		<div class="space-y-1 px-2 pb-2">
			{#each tools as tool, i}
				<ToolUpdate
					tool={tool.updates}
					{loading}
					hasNext={i < tools.length - 1}
				/>
			{/each}
		</div>
	{/if}
</div>
