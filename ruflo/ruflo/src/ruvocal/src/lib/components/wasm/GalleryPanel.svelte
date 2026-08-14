<script lang="ts">
	import { onMount } from "svelte";
	import {
		allMcpServers,
		selectedServerIds,
		healthCheckServer,
		loadWasmTemplate,
		getWasmGalleryTemplates,
		WASM_SERVER_ID,
	} from "$lib/stores/mcpServers";
	import {
		wasmLoaded,
		wasmLoading,
		wasmError,
		initWasmMcp,
		searchGalleryTemplates,
		getGalleryCategories,
		saveTemplateAsRvf,
	} from "$lib/stores/wasmMcp";
	import type { GalleryTemplate, SearchResult } from "$lib/wasm";
	import IconSearch from "~icons/carbon/Search";
	import IconDownload from "~icons/carbon/Download";
	import IconCheckmark from "~icons/carbon/Checkmark";
	import IconCode from "~icons/carbon/Code";
	import IconSearch16 from "~icons/carbon/Search";
	import IconFolder from "~icons/carbon/Folder";

	let searchQuery = $state("");
	let selectedCategory = $state<string | null>(null);
	let templates = $state<GalleryTemplate[]>([]);
	let searchResults = $state<SearchResult[]>([]);
	let categories = $state<Record<string, number>>({});
	let loading = $state(false);

	// Get WASM server from MCP servers
	const wasmServer = $derived($allMcpServers.find((s) => s.id === WASM_SERVER_ID));
	const isWasmEnabled = $derived($selectedServerIds.has(WASM_SERVER_ID));
	const activeTemplateId = $derived(wasmServer?.wasmTemplateId);
	const activeTemplateName = $derived(wasmServer?.wasmTemplateName);

	// Category icons mapping
	const categoryIcons: Record<string, typeof IconCode> = {
		development: IconCode,
		research: IconSearch16,
		custom: IconFolder,
	};

	// Category colors
	const categoryColors: Record<string, string> = {
		development: "bg-blue-500",
		research: "bg-purple-500",
		testing: "bg-green-500",
		security: "bg-red-500",
		orchestration: "bg-yellow-500",
		documentation: "bg-cyan-500",
		devops: "bg-orange-500",
		custom: "bg-gray-500",
	};

	function getCategoryIcon(category: string) {
		return categoryIcons[category.toLowerCase()] || IconFolder;
	}

	function getCategoryColor(category: string) {
		return categoryColors[category.toLowerCase()] || "bg-gray-500";
	}

	async function loadTemplates() {
		if (!$wasmLoaded) return;
		templates = getWasmGalleryTemplates();
		categories = getGalleryCategories();
	}

	function handleSearch() {
		if (!searchQuery.trim()) {
			searchResults = [];
			return;
		}
		searchResults = searchGalleryTemplates(searchQuery);
	}

	async function handleLoadTemplate(id: string) {
		loading = true;
		const success = await loadWasmTemplate(id);
		if (success) {
			loadTemplates();
		}
		loading = false;
	}

	async function handleSaveRvf(id: string) {
		loading = true;
		const containerId = await saveTemplateAsRvf(id);
		if (containerId) {
			alert(`RVF container saved with ID: ${containerId}`);
		}
		loading = false;
	}

	async function handleHealthCheck() {
		if (wasmServer) {
			await healthCheckServer(wasmServer);
		}
	}

	function getFilteredTemplates(): GalleryTemplate[] {
		if (searchQuery.trim()) {
			const ids = new Set(searchResults.map((r) => r.id));
			return templates.filter((t) => ids.has(t.id));
		}
		const category = selectedCategory;
		if (category) {
			return templates.filter((t) => t.category.toLowerCase() === category.toLowerCase());
		}
		return templates;
	}

	onMount(async () => {
		if (!$wasmLoaded) {
			await initWasmMcp();
		}
		loadTemplates();
	});

	$effect(() => {
		if ($wasmLoaded) {
			loadTemplates();
		}
	});

	$effect(() => {
		handleSearch();
	});
</script>

<div class="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
	<!-- Header -->
	<div class="p-4 border-b border-gray-200 dark:border-gray-700">
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-gray-900 dark:text-white">RVF Agent Gallery</h2>
			{#if wasmServer}
				<div class="flex items-center gap-2">
					<span
						class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
                        {wasmServer.status === 'connected'
							? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
							: wasmServer.status === 'connecting'
								? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
								: wasmServer.status === 'error'
									? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
									: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}"
					>
						{wasmServer.status === "connected" ? "WASM Ready" : wasmServer.status || "Disconnected"}
					</span>
					<button
						onclick={handleHealthCheck}
						class="text-xs text-blue-500 hover:text-blue-600"
						disabled={loading}
					>
						Refresh
					</button>
				</div>
			{/if}
		</div>

		{#if $wasmLoading}
			<div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
				<div
					class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
				></div>
				Loading WASM module...
			</div>
		{:else if $wasmError}
			<div class="text-sm text-red-500 dark:text-red-400">
				Error: {$wasmError}
			</div>
		{:else if $wasmLoaded}
			<!-- Search -->
			<div class="relative">
				<IconSearch
					class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
				/>
				<input
					type="text"
					placeholder="Search templates..."
					bind:value={searchQuery}
					class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				/>
			</div>

			<!-- Active Template Badge -->
			{#if activeTemplateId}
				<div class="mt-3 flex items-center gap-2">
					<span class="text-xs text-gray-500 dark:text-gray-400">Active:</span>
					<span
						class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-medium"
					>
						<IconCheckmark class="w-3 h-3" />
						{activeTemplateName}
					</span>
					{#if wasmServer?.tools?.length}
						<span class="text-xs text-gray-400">
							({wasmServer.tools.length} tools)
						</span>
					{/if}
				</div>
			{/if}
		{/if}
	</div>

	{#if $wasmLoaded}
		<!-- Categories -->
		<div class="p-4 border-b border-gray-200 dark:border-gray-700">
			<div class="flex flex-wrap gap-2">
				<button
					class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                       {selectedCategory === null
						? 'bg-blue-500 text-white'
						: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}"
					onclick={() => (selectedCategory = null)}
				>
					All ({templates.length})
				</button>
				{#each Object.entries(categories) as [category, count]}
					<button
						class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                           {selectedCategory === category
							? 'bg-blue-500 text-white'
							: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}"
						onclick={() => (selectedCategory = category)}
					>
						{category} ({count})
					</button>
				{/each}
			</div>
		</div>

		<!-- Templates List -->
		<div class="flex-1 overflow-y-auto p-4 space-y-3">
			{#each getFilteredTemplates() as template (template.id)}
				{@const CategoryIcon = getCategoryIcon(template.category)}
				<div
					class="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700
                       hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
				>
					<div class="flex items-start gap-3">
						<!-- Category Icon -->
						<div
							class="flex-shrink-0 w-10 h-10 rounded-lg {getCategoryColor(
								template.category
							)} flex items-center justify-center"
						>
							<CategoryIcon class="w-5 h-5 text-white" />
						</div>

						<!-- Content -->
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<h3 class="font-medium text-gray-900 dark:text-white truncate">
									{template.name}
								</h3>
								{#if template.builtin}
									<span
										class="px-1.5 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
									>
										Built-in
									</span>
								{/if}
								{#if activeTemplateId === template.id}
									<span
										class="px-1.5 py-0.5 rounded text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
									>
										Active
									</span>
								{/if}
							</div>
							<p class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
								{template.description}
							</p>

							<!-- Tags -->
							<div class="mt-2 flex flex-wrap gap-1">
								{#each template.tags.slice(0, 4) as tag}
									<span
										class="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
									>
										{tag}
									</span>
								{/each}
								{#if template.tags.length > 4}
									<span class="px-2 py-0.5 text-xs text-gray-400">
										+{template.tags.length - 4} more
									</span>
								{/if}
							</div>

							<!-- Stats -->
							<div class="mt-2 flex items-center gap-4 text-xs text-gray-400">
								{#if template.tools?.length}
									<span>{template.tools.length} tools</span>
								{/if}
								{#if template.skills?.length}
									<span>{template.skills.length} skills</span>
								{/if}
								{#if template.mcp_tools?.length}
									<span>{template.mcp_tools.length} MCP tools</span>
								{/if}
								{#if template.orchestrator}
									<span>Multi-agent</span>
								{/if}
							</div>
						</div>

						<!-- Actions -->
						<div class="flex-shrink-0 flex flex-col gap-2">
							<button
								onclick={() => handleLoadTemplate(template.id)}
								disabled={loading || activeTemplateId === template.id}
								class="px-3 py-1.5 rounded text-xs font-medium transition-colors
                               {activeTemplateId === template.id
									? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 cursor-default'
									: 'bg-blue-500 hover:bg-blue-600 text-white'}"
							>
								{#if activeTemplateId === template.id}
									<IconCheckmark class="w-3 h-3 inline" />
									Loaded
								{:else}
									Load
								{/if}
							</button>
							<button
								onclick={() => handleSaveRvf(template.id)}
								disabled={loading}
								class="px-3 py-1.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700
                               text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
								title="Save as RVF container"
							>
								<IconDownload class="w-3 h-3 inline" />
								RVF
							</button>
						</div>
					</div>
				</div>
			{:else}
				<div class="text-center py-8 text-gray-500 dark:text-gray-400">
					{#if searchQuery}
						No templates match your search.
					{:else}
						No templates available.
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
