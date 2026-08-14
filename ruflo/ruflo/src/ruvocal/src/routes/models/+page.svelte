<script lang="ts">
	import type { PageData } from "./$types";
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";

	import { base } from "$app/paths";
	import { page } from "$app/state";

	import CarbonHelpFilled from "~icons/carbon/help-filled";
	import LucideHammer from "~icons/lucide/hammer";
	import LucideImage from "~icons/lucide/image";
	import LucideSettings from "~icons/lucide/settings";
	import IconFast from "$lib/components/icons/IconFast.svelte";
	import IconCheap from "$lib/components/icons/IconCheap.svelte";
	import { PROVIDERS_HUB_ORGS } from "@huggingface/inference";
	import { useSettingsStore } from "$lib/stores/settings";
	import { goto } from "$app/navigation";
	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const settings = useSettingsStore();

	const publicConfig = usePublicConfig();

	// Local filter state for model search (hyphen/space insensitive)
	let modelFilter = $state("");
	const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
	let queryTokens = $derived(normalize(modelFilter).trim().split(/\s+/).filter(Boolean));

	// Filtered models list
	let filteredModels = $derived(
		data.models
			.filter((el) => !el.unlisted)
			.filter((el) => {
				const haystack = normalize(`${el.id} ${el.name ?? ""} ${el.displayName ?? ""}`);
				return queryTokens.every((q) => haystack.includes(q));
			})
	);
</script>

<svelte:head>
	{#if publicConfig.isHuggingChat}
		<title>{publicConfig.PUBLIC_APP_NAME} - Models</title>
		<meta property="og:title" content="{publicConfig.PUBLIC_APP_NAME} - Models" />
		<meta property="og:type" content="website" />
		<meta
			property="og:description"
			content="Browse {publicConfig.PUBLIC_APP_NAME} available models"
		/>
		<meta property="og:url" content={page.url.href} />
		<meta property="og:image" content="{publicConfig.assetPath}/thumbnail.png" />
		<meta property="og:image:alt" content="{publicConfig.PUBLIC_APP_NAME} preview" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="{publicConfig.PUBLIC_APP_NAME} - Models" />
		<meta
			name="twitter:description"
			content="Browse {publicConfig.PUBLIC_APP_NAME} available models"
		/>
		<meta name="twitter:image" content="{publicConfig.assetPath}/thumbnail.png" />
		<meta name="twitter:image:alt" content="{publicConfig.PUBLIC_APP_NAME} preview" />
	{/if}
</svelte:head>

<div class="scrollbar-custom h-full overflow-y-auto py-12 max-sm:pt-8 md:py-24">
	<div class="pt-42 mx-auto flex flex-col px-5 xl:w-[60rem] 2xl:w-[64rem]">
		<div class="flex items-center">
			<h1 class="text-xl font-bold sm:text-2xl">Models</h1>
			{#if publicConfig.isHuggingChat}
				<a
					href="https://huggingface.co/docs/inference-providers"
					class="ml-auto text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
					target="_blank"
					aria-label="Hub discussion about models"
				>
					<CarbonHelpFilled />
				</a>
			{/if}
		</div>
		<h2 class="text-gray-500">
			All models available{#if publicConfig.isHuggingChat}&nbsp;via <a
					target="_blank"
					href="https://huggingface.co/inference/models"
					class="underline decoration-gray-300 hover:decoration-gray-500 dark:decoration-gray-600 dark:hover:decoration-gray-500"
					>Inference Providers</a
				>{/if}
		</h2>

		<!-- Filter input -->
		<input
			type="search"
			bind:value={modelFilter}
			placeholder="Search by name"
			aria-label="Search models by name or id"
			class="mt-4 w-full rounded-3xl border border-gray-300 bg-white px-5 py-2 text-[15px]
				placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300
				dark:border-gray-700 dark:bg-gray-900 dark:focus:ring-gray-700"
		/>

		<div class="mt-6 min-h-[50vh]">
			<div
				class="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
			>
				{#each filteredModels as model, index (model.id)}
					{@const isActive = model.id === $settings.activeModel}
					{@const isLast = index === filteredModels.length - 1}
					<a
						href="{base}/models/{model.id}"
						aria-label="Model card for {model.displayName}"
						class="group flex cursor-pointer items-center gap-2 p-3 sm:gap-4 sm:p-4
							{isActive
							? 'bg-gray-50 dark:bg-gray-800'
							: 'bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800'}
							{isLast ? '' : 'border-b border-gray-100 dark:border-gray-800'}"
					>
						<!-- Avatar -->
						<div class="flex-shrink-0">
							{#if model.logoUrl}
								<img
									alt={model.displayName}
									class="size-8 rounded-lg border border-gray-100 bg-gray-50 object-cover dark:border-gray-700 dark:bg-gray-100 sm:size-10"
									src={model.logoUrl}
								/>
							{:else}
								<div
									class="h-10 w-10 rounded-lg border border-gray-100 bg-gray-200 dark:border-gray-700 dark:bg-gray-700"
									aria-hidden="true"
								></div>
							{/if}
						</div>

						<!-- Content -->
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<h3
									class="truncate font-medium text-gray-900 dark:text-gray-200 max-sm:text-xs"
									class:font-bold={isActive}
									class:dark:text-white={isActive}
								>
									{model.displayName}
								</h3>
								{#if index === 0 && model.isRouter && !isActive}
									<span
										class="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500 dark:border-gray-700 dark:text-gray-400"
									>
										Default
									</span>
								{/if}
							</div>
							<p class="truncate pr-4 text-xs text-gray-500 dark:text-gray-400 sm:text-[13px]">
								{model.isRouter
									? "Routes your messages to the best model for your request."
									: model.description || "-"}
							</p>
						</div>

						<!-- Icons and badges -->
						<div class="flex flex-shrink-0 items-center gap-1.5">
							{#if publicConfig.isHuggingChat && !model.isRouter && $settings.providerOverrides?.[model.id] && $settings.providerOverrides[model.id] !== "auto"}
								{@const providerOverride = $settings.providerOverrides[model.id]}
								{@const hubOrg =
									PROVIDERS_HUB_ORGS[providerOverride as keyof typeof PROVIDERS_HUB_ORGS]}
								{#if providerOverride === "fastest"}
									<div
										title="Provider: Fastest"
										class="rounded-md bg-green-50 p-1.5 text-green-600 dark:bg-green-900/20 dark:text-green-400"
									>
										<IconFast classNames="size-3 sm:size-3.5" />
									</div>
								{:else if providerOverride === "cheapest"}
									<div
										title="Provider: Cheapest"
										class="rounded-md bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
									>
										<IconCheap classNames="size-3 sm:size-3.5" />
									</div>
								{:else if hubOrg}
									<div
										title="Provider: {providerOverride}"
										class="flex size-[26px] items-center justify-center rounded-md bg-gray-100 p-1 dark:bg-gray-800 sm:size-[30px]"
									>
										<img
											src="https://huggingface.co/api/avatars/{hubOrg}"
											alt={providerOverride}
											class="size-full rounded"
										/>
									</div>
								{/if}
							{/if}
							{#if $settings.toolsOverrides?.[model.id] ?? (model as { supportsTools?: boolean }).supportsTools}
								<div
									title="This model supports tool calling (functions)."
									class="rounded-md bg-purple-50 p-1.5 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
								>
									<LucideHammer class="size-3 sm:size-3.5" />
								</div>
							{/if}
							{#if $settings.multimodalOverrides?.[model.id] ?? model.multimodal}
								<div
									title="This model is multimodal and supports image inputs natively."
									class="rounded-md bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
								>
									<LucideImage class="size-3 sm:size-3.5" />
								</div>
							{/if}
							<button
								type="button"
								title="Model settings"
								aria-label="Model settings for {model.displayName}"
								class="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									goto(`${base}/settings/${model.id}`);
								}}
							>
								<LucideSettings class="size-3 sm:size-3.5" />
							</button>
							{#if isActive}
								<span
									class="rounded-full bg-black px-2.5 py-1 text-xs font-bold text-white shadow-md dark:bg-white dark:text-black"
								>
									Active
								</span>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		</div>
	</div>
</div>
