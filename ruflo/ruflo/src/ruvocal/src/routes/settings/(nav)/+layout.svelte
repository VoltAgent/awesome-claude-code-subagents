<script lang="ts">
	import { onMount, tick } from "svelte";
	import { base } from "$app/paths";
	import { afterNavigate, goto } from "$app/navigation";
	import { page } from "$app/state";
	import { useSettingsStore } from "$lib/stores/settings";
	import IconOmni from "$lib/components/icons/IconOmni.svelte";
	import IconBurger from "$lib/components/icons/IconBurger.svelte";
	import IconFast from "$lib/components/icons/IconFast.svelte";
	import IconCheap from "$lib/components/icons/IconCheap.svelte";
	import CarbonClose from "~icons/carbon/close";
	import CarbonTextLongParagraph from "~icons/carbon/text-long-paragraph";
	import CarbonChevronLeft from "~icons/carbon/chevron-left";
	import LucideImage from "~icons/lucide/image";
	import LucideHammer from "~icons/lucide/hammer";
	import IconGear from "~icons/bi/gear-fill";
	import { PROVIDERS_HUB_ORGS } from "@huggingface/inference";
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";

	const publicConfig = usePublicConfig();

	import type { LayoutData } from "../$types";
	import { browser } from "$app/environment";
	import { isDesktop } from "$lib/utils/isDesktop";
	import { debounce } from "$lib/utils/debounce";

	interface Props {
		data: LayoutData;
		children?: import("svelte").Snippet;
	}

	let { data, children }: Props = $props();

	let previousPage: string = $state(base || "/");
	let showContent: boolean = $state(false);

	let navContainer: HTMLDivElement | undefined = $state();

	async function scrollSelectedModelIntoView() {
		await tick();
		const container = navContainer;
		if (!container) return;
		const currentModelId = page.params.model as string | undefined;
		if (!currentModelId) return;
		const buttons = container.querySelectorAll<HTMLButtonElement>("button[data-model-id]");
		let target: HTMLElement | null = null;
		for (const btn of buttons) {
			if (btn.dataset.modelId === currentModelId) {
				target = btn;
				break;
			}
		}
		if (!target) return;
		// Use minimal movement; keep within view if needed
		target.scrollIntoView({ block: "nearest", inline: "nearest" });
	}

	function checkDesktopRedirect() {
		if (
			browser &&
			isDesktop(window) &&
			page.url.pathname === `${base}/settings` &&
			!page.url.pathname.endsWith("/application")
		) {
			goto(`${base}/settings/application`);
		}
	}

	onMount(() => {
		// Show content when not on the root settings page
		showContent = page.url.pathname !== `${base}/settings`;
		// Initial desktop redirect check
		checkDesktopRedirect();

		// Ensure the selected model (if any) is visible in the nav
		void scrollSelectedModelIntoView();

		// Add resize listener for desktop redirect
		if (browser) {
			const debouncedCheck = debounce(checkDesktopRedirect, 100);
			window.addEventListener("resize", debouncedCheck);
			return () => window.removeEventListener("resize", debouncedCheck);
		}
	});

	afterNavigate(({ from }) => {
		if (from?.url && !from.url.pathname.includes("settings")) {
			previousPage = from.url.toString() || previousPage || base || "/";
		}
		// Show content when not on the root settings page
		showContent = page.url.pathname !== `${base}/settings`;
		// Check desktop redirect after navigation
		checkDesktopRedirect();
		// After navigation, keep the selected model in view
		void scrollSelectedModelIntoView();
	});

	const settings = useSettingsStore();

	// Local filter for model list (hyphen/space insensitive)
	let modelFilter = $state("");
	const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
	let queryTokens = $derived(normalize(modelFilter).trim().split(/\s+/).filter(Boolean));
</script>

<div
	class="mx-auto grid h-full w-full max-w-[1400px] grid-cols-1 grid-rows-[auto,1fr] content-start gap-x-6 overflow-hidden p-4 text-gray-800 dark:text-gray-300 md:grid-cols-3 md:grid-rows-[auto,1fr] md:p-4"
>
	<div class="col-span-1 mb-3 flex items-center justify-between md:col-span-3 md:mb-4">
		{#if showContent && browser}
			<button
				class="btn rounded-lg md:hidden"
				aria-label="Back to menu"
				onclick={() => {
					showContent = false;
					goto(`${base}/settings`);
				}}
			>
				<IconBurger
					classNames="text-xl text-gray-900 hover:text-black dark:text-gray-200 dark:hover:text-white sm:hidden"
				/>
				<CarbonChevronLeft
					class="text-xl text-gray-900 hover:text-black dark:text-gray-200 dark:hover:text-white max-sm:hidden"
				/>
			</button>
		{/if}
		<h2 class=" left-0 right-0 mx-auto w-fit text-center text-xl font-bold md:hidden">Settings</h2>
		<button
			class="btn rounded-lg"
			aria-label="Close settings"
			onclick={() => {
				goto(previousPage);
			}}
		>
			<CarbonClose
				class="text-xl text-gray-900 hover:text-black dark:text-gray-200 dark:hover:text-white"
			/>
		</button>
	</div>
	{#if !(showContent && browser && !isDesktop(window))}
		<div
			class="scrollbar-custom col-span-1 flex flex-col overflow-y-auto whitespace-nowrap rounded-r-xl bg-gradient-to-l from-gray-50 to-10% dark:from-gray-700/40 max-md:-mx-4 max-md:h-full md:pr-6"
			class:max-md:hidden={showContent && browser}
			bind:this={navContainer}
		>
			<!-- Section Headers -->
			<h3
				class="px-3 pb-1 pt-2 text-xs font-semibold tracking-wide text-gray-600 dark:text-gray-400 md:text-left"
			>
				Models
			</h3>

			<!-- Filter input -->
			<div class="px-2 py-2">
				<input
					bind:value={modelFilter}
					type="search"
					placeholder="Search by name"
					aria-label="Search models by name or id"
					class="w-full rounded-full border border-gray-300 bg-white px-4 py-1 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:ring-gray-700"
				/>
			</div>

			{#each data.models
				.filter((el) => !el.unlisted)
				.filter((el) => {
					const haystack = normalize(`${el.id} ${el.name ?? ""} ${el.displayName ?? ""}`);
					return queryTokens.every((q) => haystack.includes(q));
				}) as model}
				<button
					type="button"
					onclick={() => goto(`${base}/settings/${model.id}`)}
					class="group flex h-9 w-full flex-none items-center gap-1 rounded-lg px-3 text-[13px] text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60 md:rounded-xl md:px-3 {model.id ===
					page.params.model
						? '!bg-gray-100 !text-gray-800 dark:!bg-gray-700 dark:!text-gray-200'
						: ''}"
					data-model-id={model.id}
					aria-label="Configure {model.displayName}"
				>
					<div class="mr-auto flex items-center gap-1 truncate">
						<span class="truncate">{model.displayName}</span>
						{#if model.isRouter}
							<IconOmni />
						{/if}
					</div>

					{#if publicConfig.isHuggingChat && !model.isRouter && $settings.providerOverrides?.[model.id] && $settings.providerOverrides[model.id] !== "auto"}
						{@const providerOverride = $settings.providerOverrides[model.id]}
						{@const hubOrg =
							PROVIDERS_HUB_ORGS[providerOverride as keyof typeof PROVIDERS_HUB_ORGS]}
						{#if providerOverride === "fastest"}
							<span
								title="Provider: {providerOverride}"
								class="grid size-[21px] flex-none place-items-center rounded-md bg-green-500/10 text-green-600 dark:text-green-500"
								aria-label="Provider: {providerOverride}"
								role="img"
							>
								<IconFast classNames="size-3" />
							</span>
						{:else if providerOverride === "cheapest"}
							<span
								title="Provider: {providerOverride}"
								class="grid size-[21px] flex-none place-items-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-500"
								aria-label="Provider: {providerOverride}"
								role="img"
							>
								<IconCheap classNames="size-3" />
							</span>
						{:else if hubOrg}
							<span
								title="Provider: {providerOverride}"
								class="flex size-[21px] flex-none items-center justify-center rounded-md bg-gray-500/10 p-[0.225rem]"
							>
								<img
									src="https://huggingface.co/api/avatars/{hubOrg}"
									alt={providerOverride}
									class="size-full rounded"
								/>
							</span>
						{/if}
					{/if}

					{#if $settings.toolsOverrides?.[model.id] ?? (model as { supportsTools?: boolean }).supportsTools}
						<span
							title="Tool calling supported"
							class="grid size-[21px] flex-none place-items-center rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-500"
							aria-label="Model supports tools"
							role="img"
						>
							<LucideHammer class="size-3" />
						</span>
					{/if}

					{#if $settings.multimodalOverrides?.[model.id] ?? model.multimodal}
						<span
							title="Multimodal support (image inputs)"
							class="grid size-[21px] flex-none place-items-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-500"
							aria-label="Model is multimodal"
							role="img"
						>
							<LucideImage class="size-3" />
						</span>
					{/if}

					{#if $settings.customPrompts?.[model.id]}
						<CarbonTextLongParagraph
							class="size-6 rounded-md border border-gray-300 p-1 text-gray-800 dark:border-gray-600 dark:text-gray-200"
						/>
					{/if}
					{#if model.id === $settings.activeModel}
						<div
							class="flex h-[21px] items-center rounded-md bg-black/90 px-2 text-[11px] font-semibold leading-none text-white dark:bg-white dark:text-black"
						>
							Active
						</div>
					{/if}
				</button>
			{/each}

			<button
				type="button"
				onclick={() => goto(`${base}/settings/application`)}
				class="group sticky bottom-0 mt-1 flex h-9 w-full flex-none items-center gap-1 rounded-lg px-3 text-[13px] text-gray-600 dark:text-gray-300 max-md:order-first md:rounded-xl md:px-3 {page
					.url.pathname === `${base}/settings/application`
					? '!bg-gray-100 !text-gray-800 dark:!bg-gray-700 dark:!text-gray-200'
					: 'bg-white dark:bg-gray-800'}"
				aria-label="Configure application settings"
			>
				<IconGear class="mr-0.5 text-xxs" />
				Application Settings
			</button>
		</div>
	{/if}
	{#if showContent}
		<div
			class="scrollbar-custom col-span-1 w-full overflow-y-auto overflow-x-clip px-1 md:col-span-2 md:row-span-2"
			class:max-md:hidden={!showContent && browser}
		>
			{@render children?.()}
		</div>
	{/if}
</div>
