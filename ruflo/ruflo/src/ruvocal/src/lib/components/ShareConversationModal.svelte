<script lang="ts">
	import Modal from "$lib/components/Modal.svelte";
	import { base } from "$app/paths";
	import { page } from "$app/state";
	import CarbonLink from "~icons/carbon/link";
	import CarbonCheckmark from "~icons/carbon/checkmark";
	import EosIconsLoading from "~icons/eos-icons/loading";
	import CopyToClipBoardBtn from "$lib/components/CopyToClipBoardBtn.svelte";
	import { onMount } from "svelte";
	import { createShareLink } from "$lib/createShareLink";

	interface Props {
		open?: boolean;
		onclose?: () => void;
		oncopied?: () => void;
	}

	let { open = false, onclose, oncopied }: Props = $props();

	let creating = $state(false);
	let createdUrl: string | null = $state(null);
	let errorMsg: string | null = $state(null);
	let justCopied = $state(false);

	async function handleCreate() {
		try {
			creating = true;
			errorMsg = null;
			createdUrl = await createShareLink(page.params.id ?? "");
		} catch (e) {
			errorMsg = (e as Error).message || "Could not create link";
		} finally {
			creating = false;
		}
	}

	function close() {
		open = false;
		onclose?.();
	}

	// If the current page is already a shared chat (7-char id), pre-fill the link
	onMount(async () => {
		if (page.params.id && page.params.id.length === 7) {
			try {
				createdUrl = await createShareLink(page.params.id);
			} catch (e) {
				// ignore
			}
		}
	});

	function withLeafId(url: string | null): string | null {
		if (!url) return url;
		try {
			const leafId = localStorage.getItem("leafId");
			if (!leafId) return url;
			const u = new URL(url);
			u.searchParams.set("leafId", leafId);
			return u.toString();
		} catch (e) {
			return url;
		}
	}
</script>

{#if open}
	<Modal onclose={close} width="w-[90dvh] md:w-[500px]">
		<div class="flex w-full flex-col gap-3 p-5 sm:gap-5 sm:p-6">
			<!-- Header + copy -->
			{#if createdUrl}
				<div class="flex items-start justify-between">
					<div class="text-xl font-semibold text-gray-800 dark:text-gray-200">
						Public link created
					</div>
					<button type="button" class="group" onclick={close} aria-label="Close">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 32 32"
							class="size-5 text-gray-700 group-hover:text-gray-500 dark:text-gray-300 dark:group-hover:text-gray-400"
						>
							<path
								d="M24 9.41 22.59 8 16 14.59 9.41 8 8 9.41 14.59 16 8 22.59 9.41 24 16 17.41 22.59 24 24 22.59 17.41 16 24 9.41z"
								fill="currentColor"
							/>
						</svg>
					</button>
				</div>
				<div class="text-sm text-gray-600 dark:text-gray-400">
					A public link to your chat has been created.
				</div>
			{:else}
				<div class="flex items-start justify-between">
					<div class="text-xl font-semibold text-gray-800 dark:text-gray-200">
						Share public link to chat
					</div>
					<button type="button" class="group" onclick={close} aria-label="Close">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 32 32"
							class="size-5 text-gray-700 group-hover:text-gray-500 dark:text-gray-300 dark:group-hover:text-gray-400"
						>
							<path
								d="M24 9.41 22.59 8 16 14.59 9.41 8 8 9.41 14.59 16 8 22.59 9.41 24 16 17.41 22.59 24 24 22.59 17.41 16 24 9.41z"
								fill="currentColor"
							/>
						</svg>
					</button>
				</div>
				<div class="text-sm text-gray-600 dark:text-gray-400">
					Any messages you add after sharing stay private.
				</div>
			{/if}

			{#if errorMsg}
				<div
					class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-500/10 dark:text-red-300"
				>
					{errorMsg}
				</div>
			{/if}

			<!-- URL row -->
			<div
				class="flex h-12 items-center gap-2 whitespace-nowrap rounded-2xl border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-gray-800"
			>
				<input
					class="w-full truncate bg-transparent text-[15px] text-gray-700 outline-none placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-gray-500 max-sm:text-sm"
					readonly
					value={createdUrl ??
						`${page.data.publicConfig.PUBLIC_SHARE_PREFIX || `${page.data.publicConfig.PUBLIC_ORIGIN || page.url.origin}${base}`}/r/...`}
				/>

				{#if createdUrl}
					<CopyToClipBoardBtn
						classNames="inline-flex items-center rounded-xl -mr-1 border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow enabled:hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100 dark:enabled:hover:bg-gray-600"
						showTooltip={false}
						value={withLeafId(createdUrl) ?? createdUrl}
						onClick={() => {
							justCopied = true;
							oncopied?.();
							setTimeout(() => (justCopied = false), 1200);
						}}
					>
						{#snippet children()}
							<span class="inline-flex items-center gap-1.5">
								{#if justCopied}
									<CarbonCheckmark class="text-[.95em] text-green-600 dark:text-green-400" />
									Copied
								{:else}
									<!-- Use the copy icon provided by CopyToClipBoardBtn default otherwise -->
									<svg width="1em" height="1em" viewBox="0 0 32 32" class="text-[.95em]"
										><path
											fill="currentColor"
											d="M28 10v18H10V10zm-2 2H12v14h14zm-4-8v2H6v14H4V4z"
										/></svg
									>
									Copy link
								{/if}
							</span>
						{/snippet}
					</CopyToClipBoardBtn>
				{:else}
					<button
						class="-mr-1 inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
						type="button"
						disabled={creating}
						onclick={handleCreate}
					>
						{#if creating}
							<EosIconsLoading class="text-[1.05em]" />
							Creating…
						{:else}
							<CarbonLink class="text-[1.05em]" />
							Create link
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</Modal>
{/if}
