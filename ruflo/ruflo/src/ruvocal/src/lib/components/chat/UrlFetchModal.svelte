<script lang="ts">
	import Modal from "../Modal.svelte";
	import { base } from "$app/paths";
	import { tick } from "svelte";
	import { pickSafeMime } from "$lib/utils/mime";

	interface Props {
		open?: boolean;
		acceptMimeTypes?: string[]; // optional client-side validation
		onclose?: () => void;
		onfiles?: (files: File[]) => void;
	}

	let { open = $bindable(false), acceptMimeTypes = [], onclose, onfiles }: Props = $props();

	let urlValue = $state("");
	let loading = $state(false);
	let errorMsg = $state("");
	let inputEl: HTMLInputElement | undefined = $state();

	async function focusInputSoon() {
		// Wait for modal and content to mount, then focus and select
		await tick();
		await tick();
		setTimeout(() => {
			inputEl?.focus();
			inputEl?.select();
		}, 0);
	}

	$effect(() => {
		if (open) {
			// reset state when opening
			urlValue = "";
			errorMsg = "";
			void focusInputSoon();
		}
	});

	function isHttpsUrl(url: string) {
		try {
			const u = new URL(url);
			return u.protocol === "https:";
		} catch {
			return false;
		}
	}

	function matchesAllowed(contentType: string, allowed: string[]): boolean {
		const ct = contentType.split(";")[0]?.trim().toLowerCase();
		if (!ct) return false;
		const [ctType, ctSubtype] = ct.split("/");
		for (const a of allowed) {
			const [aType, aSubtype] = a.toLowerCase().split("/");
			const typeOk = aType === "*" || aType === ctType;
			const subOk = aSubtype === "*" || aSubtype === ctSubtype;
			if (typeOk && subOk) return true;
		}
		return false;
	}

	function close() {
		open = false;
		onclose?.();
	}

	async function handleSubmit() {
		errorMsg = "";
		const trimmed = urlValue.trim();
		if (!isHttpsUrl(trimmed)) {
			errorMsg = "Enter a valid HTTPS URL.";
			return;
		}
		loading = true;
		try {
			// Use server proxy directly for one URL to validate size/types before creating File
			const params = new URLSearchParams({ url: trimmed });
			if (acceptMimeTypes.length > 0) params.set("accept", acceptMimeTypes.join(","));
			const proxyUrl = `${base}/api/fetch-url?${params}`;
			const res = await fetch(proxyUrl);
			if (!res.ok) {
				const txt = await res.text();
				throw new Error(txt || `Failed to fetch (${res.status})`);
			}
			const forwardedType = res.headers.get("x-forwarded-content-type");
			const blob = await res.blob();
			const mimeType = pickSafeMime(forwardedType, blob.type, trimmed);
			// Optional client-side mime filter (same wildcard semantics as dropzone)
			if (acceptMimeTypes.length > 0 && mimeType && !matchesAllowed(mimeType, acceptMimeTypes)) {
				throw new Error("File type not allowed.");
			}
			const disp = res.headers.get("content-disposition");
			const filename = (() => {
				const filenameStar = disp?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
				if (filenameStar) {
					const cleaned = filenameStar.trim().replace(/['"]/g, "");
					try {
						return decodeURIComponent(cleaned);
					} catch {
						return cleaned;
					}
				}
				const filenameMatch = disp?.match(/filename="?([^";]+)"?/i)?.[1];
				if (filenameMatch) return filenameMatch.trim();
				try {
					const u = new URL(trimmed);
					const last = u.pathname.split("/").pop() || "attachment";
					return decodeURIComponent(last);
				} catch {
					return "attachment";
				}
			})();
			const file = new File([blob], filename, { type: mimeType });
			onfiles?.([file]);
			close();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : "Failed to fetch URL";
		} finally {
			loading = false;
		}
	}
</script>

{#if open}
	<Modal onclose={close} width="w-[90dvh] md:w-[480px]">
		{#snippet children()}
			<form
				class="flex w-full flex-col gap-5 p-6"
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<div class="flex items-start justify-between">
					<h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">Add from URL</h2>
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

				<div class="flex flex-col gap-2">
					<label class="text-sm text-gray-600 dark:text-gray-400" for="fetch-url-input"
						>Enter URL</label
					>
					<input
						id="fetch-url-input"
						bind:this={inputEl}
						bind:value={urlValue}
						type="url"
						placeholder="https://example.com/file.txt"
						class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[15px] text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-gray-700"
						aria-invalid={errorMsg ? "true" : "false"}
						onkeydown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleSubmit();
							}
						}}
					/>
				</div>

				{#if errorMsg}
					<p class="-mt-1 text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
				{/if}
				<p class="-mt-2 text-xs text-gray-500 dark:text-gray-400">Only HTTPS. Max 10MB.</p>

				<div class="flex items-center justify-end gap-2">
					<button
						type="button"
						class="inline-flex items-center rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
						onclick={close}
					>
						Cancel
					</button>
					<button
						type="submit"
						class="inline-flex items-center rounded-xl border border-gray-900 bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
						disabled={loading || urlValue.trim() === ""}
					>
						{#if loading}Fetching…{:else}Add{/if}
					</button>
				</div>
			</form>
		{/snippet}
	</Modal>
{/if}

<style lang="postcss">
	:global(input) {
		font-family: inherit;
	}
	/* Uses app-level colors and rounded/blur styles via utility classes */
	/* The Modal itself provides consistent container + scrollbar-custom styling */
</style>
