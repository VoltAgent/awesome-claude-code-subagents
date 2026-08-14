<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		icon: Snippet;
		iconBg?: string;
		iconRing?: string;
		hasNext?: boolean;
		loading?: boolean;
		children: Snippet;
	}

	let {
		icon,
		iconBg = "bg-gray-50 dark:bg-gray-800",
		iconRing = "ring-gray-100 dark:ring-gray-700",
		hasNext = false,
		loading = false,
		children,
	}: Props = $props();
</script>

<div class="group flex gap-2 has-[+.prose]:mb-1.5 [.prose+&]:mt-3">
	<!-- Left column: icon + connector line -->
	<div class="flex w-[22px] flex-shrink-0 flex-col items-center">
		<div
			class="relative z-0 flex h-[22px] w-[22px] items-center justify-center rounded-md ring-1 {iconBg} {iconRing}"
		>
			{@render icon()}
			{#if loading}
				<svg
					class="pointer-events-none absolute inset-0 h-[22px] w-[22px]"
					viewBox="0 0 22 22"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<rect
						x="0.5"
						y="0.5"
						width="21"
						height="21"
						rx="5.5"
						class="loading-path stroke-current text-purple-500/20"
						stroke-width="1"
						fill="none"
					/>
				</svg>
			{/if}
		</div>
		{#if hasNext}
			<div class="my-1 w-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
		{/if}
	</div>

	<!-- Right column: content -->
	<div class="min-w-0 flex-1 pb-2 pt-px">
		{@render children()}
	</div>
</div>

<style>
	@keyframes loading {
		to {
			stroke-dashoffset: -100;
		}
	}

	.loading-path {
		stroke-dasharray: 60 40;
		animation: loading 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}
</style>
