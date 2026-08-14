<script lang="ts">
	import Logo from "$lib/components/icons/Logo.svelte";
	import type { Model } from "$lib/types/Model";
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";

	const publicConfig = usePublicConfig();

	interface Props {
		currentModel: Model;
		onmessage?: (content: string) => void;
	}

	let { currentModel: _currentModel, onmessage }: Props = $props();

	$effect(() => {
		// referenced to appease linter while UI blocks are commented out
		void _currentModel;
		void onmessage;
	});
</script>

<div class="my-auto grid items-center justify-center gap-8 text-center">
	<div
		class="relative flex -translate-y-16 select-none items-center rounded-xl text-3xl font-semibold md:-translate-y-12 md:text-5xl"
	>
		<Logo classNames="size-12 md:size-20 mr-0.5" />
		{publicConfig.PUBLIC_APP_NAME}
		<!-- Quantum dots floating over "lo" -->
		<span class="pointer-events-none absolute right-[-4px] top-[-2px] flex gap-[4px] md:right-[-6px] md:top-[-4px] md:gap-[5px]">
			<span class="quantum-dot qd1"></span>
			<span class="quantum-dot qd2"></span>
			<span class="quantum-dot qd3"></span>
		</span>
	</div>
	<!-- <div class="lg:col-span-1">
		<div>
			<div class="mb-3 flex items-center text-2xl font-semibold">
				<Logo classNames="mr-1 flex-none" />
				{publicConfig.PUBLIC_APP_NAME}
				<div
					class="ml-3 flex h-6 items-center rounded-lg border border-gray-100 bg-gray-50 px-2 text-base text-gray-400 dark:border-gray-700/60 dark:bg-gray-800"
				>
					{publicConfig.PUBLIC_VERSION}
				</div>
			</div>
			<p class="text-base text-gray-600 dark:text-gray-400">
				{publicConfig.PUBLIC_APP_DESCRIPTION ||
					"Making the community's best AI chat models available to everyone."}
			</p>
		</div>
	</div>
	<div class="lg:col-span-2 lg:pl-24">
		{#each JSON5.parse(publicConfig.PUBLIC_ANNOUNCEMENT_BANNERS || "[]") as banner}
			<AnnouncementBanner classNames="mb-4" title={banner.title}>
				<a
					target={banner.external ? "_blank" : "_self"}
					href={banner.linkHref}
					class="mr-2 flex items-center underline hover:no-underline">{banner.linkTitle}</a
				>
			</AnnouncementBanner>
		{/each}
		<div class="overflow-hidden rounded-xl border dark:border-gray-800">
			<div class="flex p-3">
				<div>
					<div class="text-sm text-gray-600 dark:text-gray-400">Current Model</div>
					<div class="flex items-center gap-1.5 font-semibold max-sm:text-smd">
						{#if currentModel.logoUrl}
							<img
								class="aspect-square size-4 rounded border bg-white dark:border-gray-700"
								src={currentModel.logoUrl}
								alt=""
							/>
						{:else}
							<div
								class="size-4 rounded border border-transparent bg-gray-300 dark:bg-gray-800"
							></div>
						{/if}
						{currentModel.displayName}
					</div>
				</div>
				<a
					href="{base}/settings/{currentModel.id}"
					aria-label="Settings"
					class="btn ml-auto flex h-7 w-7 self-start rounded-full bg-gray-100 p-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-600"
					><IconGear /></a
				>
			</div>
			<ModelCardMetadata variant="dark" model={currentModel} />
		</div>
	</div>
	<div class="h-40 sm:h-24"></div> -->
</div>

<style>
	.quantum-dot {
		display: block;
		width: 5px;
		height: 5px;
		border-radius: 50%;
	}
	@media (min-width: 768px) {
		.quantum-dot {
			width: 7px;
			height: 7px;
		}
	}
	.qd1 {
		background: #3b82f6;
		animation: qdot 2.2s ease-in-out infinite;
	}
	.qd2 {
		background: #818cf8;
		animation: qdot 2.2s ease-in-out infinite 0.35s;
	}
	.qd3 {
		background: #06b6d4;
		animation: qdot 2.2s ease-in-out infinite 0.7s;
	}
	@keyframes qdot {
		0%, 100% { transform: translateY(0); opacity: 0.4; }
		50% { transform: translateY(-5px); opacity: 1; }
	}
</style>
