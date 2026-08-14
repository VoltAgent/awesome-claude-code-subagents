<script lang="ts">
	import MarkdownRenderer from "./MarkdownRenderer.svelte";
	import BlockWrapper from "./BlockWrapper.svelte";

	interface Props {
		content: string;
		loading?: boolean;
		hasNext?: boolean;
	}

	let { content, loading = false, hasNext = false }: Props = $props();
	let isOpen = $state(false);
	let wasLoading = $state(false);
	let initialized = $state(false);

	// Track loading transitions to auto-expand/collapse
	$effect(() => {
		// Auto-expand on first render if already loading
		if (!initialized) {
			initialized = true;
			if (loading) {
				isOpen = true;
				wasLoading = true;
				return;
			}
		}

		if (loading && !wasLoading) {
			// Loading started - auto-expand
			isOpen = true;
		} else if (!loading && wasLoading) {
			// Loading finished - auto-collapse
			isOpen = false;
		}
		wasLoading = loading;
	});
</script>

{#snippet icon()}
	<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32">
		<path
			class="stroke-gray-500 dark:stroke-gray-400"
			style="stroke-width: 1.9; fill: none; stroke-linecap: round; stroke-linejoin: round;"
			d="M16 6v3.33M16 6c0-2.65 3.25-4.3 5.4-2.62 1.2.95 1.6 2.65.95 4.04a3.63 3.63 0 0 1 4.61.16 3.45 3.45 0 0 1 .46 4.37 5.32 5.32 0 0 1 1.87 4.75c-.22 1.66-1.39 3.6-3.07 4.14M16 6c0-2.65-3.25-4.3-5.4-2.62a3.37 3.37 0 0 0-.95 4.04 3.65 3.65 0 0 0-4.6.16 3.37 3.37 0 0 0-.49 4.27 5.57 5.57 0 0 0-1.85 4.85 5.3 5.3 0 0 0 3.07 4.15M16 9.33v17.34m0-17.34c0 2.18 1.82 4 4 4m6.22 7.5c.67 1.3.56 2.91-.27 4.11a4.05 4.05 0 0 1-4.62 1.5c0 1.53-1.05 2.9-2.66 2.9A2.7 2.7 0 0 1 16 26.66m10.22-5.83a4.05 4.05 0 0 0-3.55-2.17m-16.9 2.18a4.05 4.05 0 0 0 .28 4.1c1 1.44 2.92 2.09 4.59 1.5 0 1.52 1.12 2.88 2.7 2.88A2.7 2.7 0 0 0 16 26.67M5.78 20.85a4.04 4.04 0 0 1 3.55-2.18"
		/>
	</svg>
{/snippet}

<BlockWrapper
	{icon}
	{hasNext}
	iconBg="bg-gray-100 dark:bg-gray-700"
	iconRing="ring-gray-200 dark:ring-gray-600"
>
	<!-- Collapsed view (clickable to expand) -->
	<button
		type="button"
		class="group/text w-full cursor-pointer text-left"
		onclick={() => (isOpen = !isOpen)}
	>
		{#if isOpen}
			<!-- Expanded: show full content -->
			<div
				class="prose prose-sm max-w-none text-sm leading-relaxed text-gray-500 dark:prose-invert dark:text-gray-400"
			>
				<MarkdownRenderer {content} {loading} />
			</div>
		{:else}
			<!-- Collapsed: 2-line preview (plain text, strip markdown) -->
			<div
				class="line-clamp-2 max-h-[3.25em] text-sm leading-relaxed text-gray-500 dark:text-gray-400"
				class:animate-pulse={loading}
			>
				{content
					.replace(/[#*`~[\]]/g, "")
					.replace(/\n+/g, " ")
					.trim()}
			</div>
		{/if}
	</button>
</BlockWrapper>
