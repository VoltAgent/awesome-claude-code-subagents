<script lang="ts">
	import type { Message } from "$lib/types/Message";
	import { tick } from "svelte";

	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";
	const publicConfig = usePublicConfig();
	import CopyToClipBoardBtn from "../CopyToClipBoardBtn.svelte";
	import IconLoading from "../icons/IconLoading.svelte";
	import CarbonRotate360 from "~icons/carbon/rotate-360";
	// import CarbonDownload from "~icons/carbon/download";

	import CarbonPen from "~icons/carbon/pen";
	import UploadedFile from "./UploadedFile.svelte";

	import MarkdownRenderer from "./MarkdownRenderer.svelte";
	import OpenReasoningResults from "./OpenReasoningResults.svelte";
	import Alternatives from "./Alternatives.svelte";
	import MessageAvatar from "./MessageAvatar.svelte";
	import { PROVIDERS_HUB_ORGS } from "@huggingface/inference";
	import { requireAuthUser } from "$lib/utils/auth";
	import ToolUpdate from "./ToolUpdate.svelte";
	import TaskGroup from "./TaskGroup.svelte";
	import { isMessageToolUpdate } from "$lib/utils/messageUpdates";
	import { MessageUpdateType, type MessageToolUpdate } from "$lib/types/MessageUpdate";
	import ImageLightbox from "./ImageLightbox.svelte";

	interface Props {
		message: Message;
		loading?: boolean;
		isAuthor?: boolean;
		readOnly?: boolean;
		isTapped?: boolean;
		alternatives?: Message["id"][];
		editMsdgId?: Message["id"] | null;
		isLast?: boolean;
		onretry?: (payload: { id: Message["id"]; content?: string }) => void;
		onshowAlternateMsg?: (payload: { id: Message["id"] }) => void;
	}

	let {
		message,
		loading = false,
		isAuthor: _isAuthor = true,
		readOnly: _readOnly = false,
		isTapped = $bindable(false),
		alternatives = [],
		editMsdgId = $bindable(null),
		isLast = false,
		onretry,
		onshowAlternateMsg,
	}: Props = $props();

	let contentEl: HTMLElement | undefined = $state();
	let isCopied = $state(false);
	let messageWidth: number = $state(0);
	let messageInfoWidth: number = $state(0);
	let lightboxSrc: string | null = $state(null);

	function handleContentClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.tagName === "IMG" && target instanceof HTMLImageElement) {
			e.preventDefault();
			e.stopPropagation();
			lightboxSrc = target.src;
		}
	}

	$effect(() => {
		// referenced to appease linter for currently-unused props
		void _isAuthor;
		void _readOnly;
	});
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			editFormEl?.requestSubmit();
		}
		if (e.key === "Escape") {
			editMsdgId = null;
		}
	}

	function handleCopy(event: ClipboardEvent) {
		if (!contentEl) return;

		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) return;
		if (!selection.anchorNode || !selection.focusNode) return;

		const anchorInside = contentEl.contains(selection.anchorNode);
		const focusInside = contentEl.contains(selection.focusNode);
		if (!anchorInside && !focusInside) return;

		if (!event.clipboardData) return;

		const range = selection.getRangeAt(0);
		const wrapper = document.createElement("div");
		wrapper.appendChild(range.cloneContents());

		wrapper.querySelectorAll("[data-exclude-from-copy]").forEach((el) => {
			el.remove();
		});

		wrapper.querySelectorAll("*").forEach((el) => {
			el.removeAttribute("style");
			el.removeAttribute("class");
			el.removeAttribute("color");
			el.removeAttribute("bgcolor");
			el.removeAttribute("background");

			for (const attr of Array.from(el.attributes)) {
				if (attr.name === "id" || attr.name.startsWith("data-")) {
					el.removeAttribute(attr.name);
				}
			}
		});

		const html = wrapper.innerHTML;
		const text = wrapper.textContent ?? "";

		event.preventDefault();
		event.clipboardData.setData("text/html", html);
		event.clipboardData.setData("text/plain", text);
	}

	let editContentEl: HTMLTextAreaElement | undefined = $state();
	let editFormEl: HTMLFormElement | undefined = $state();

	// Zero-config reasoning autodetection: detect <think> blocks in content
	const THINK_BLOCK_REGEX = /(<think>[\s\S]*?(?:<\/think>|$))/gi;
	// Non-global version for .test() calls to avoid lastIndex side effects
	const THINK_BLOCK_TEST_REGEX = /(<think>[\s\S]*?(?:<\/think>|$))/i;
	let hasClientThink = $derived(message.content.split(THINK_BLOCK_REGEX).length > 1);

	// Strip think blocks for clipboard copy (always, regardless of detection)
	let contentWithoutThink = $derived.by(() =>
		message.content.replace(THINK_BLOCK_REGEX, "").trim()
	);

	type Block =
		| { type: "text"; content: string }
		| { type: "tool"; uuid: string; updates: MessageToolUpdate[] }
		| { type: "taskgroup"; step: number; tools: { uuid: string; updates: MessageToolUpdate[] }[] };

	type ToolBlock = Extract<Block, { type: "tool" }>;

	let blocks = $derived.by(() => {
		const updates = message.updates ?? [];
		const res: Block[] = [];
		const hasTools = updates.some(isMessageToolUpdate);
		let contentCursor = 0;
		let sawFinalAnswer = false;

		// Fast path: no tool updates at all
		if (!hasTools && updates.length === 0) {
			if (message.content) return [{ type: "text" as const, content: message.content }];
			return [];
		}

		for (const update of updates) {
			if (update.type === MessageUpdateType.Stream) {
				const token =
					typeof update.token === "string" && update.token.length > 0 ? update.token : null;
				const len = token !== null ? token.length : (update.len ?? 0);
				const chunk =
					token ??
					(message.content ? message.content.slice(contentCursor, contentCursor + len) : "");
				contentCursor += len;
				if (!chunk) continue;
				const last = res.at(-1);
				if (last?.type === "text") last.content += chunk;
				else res.push({ type: "text" as const, content: chunk });
			} else if (isMessageToolUpdate(update)) {
				const existingBlock = res.find(
					(b): b is ToolBlock => b.type === "tool" && b.uuid === update.uuid
				);
				if (existingBlock) {
					existingBlock.updates.push(update);
				} else {
					res.push({ type: "tool" as const, uuid: update.uuid, updates: [update] });
				}
			} else if (update.type === MessageUpdateType.FinalAnswer) {
				sawFinalAnswer = true;
				const finalText = update.text ?? "";
				const currentText = res
					.filter((b) => b.type === "text")
					.map((b) => (b as { type: "text"; content: string }).content)
					.join("");

				let addedText = "";
				if (finalText.startsWith(currentText)) {
					addedText = finalText.slice(currentText.length);
				} else if (!currentText.endsWith(finalText)) {
					const needsGap = !/\n\n$/.test(currentText) && !/^\n/.test(finalText);
					addedText = (needsGap ? "\n\n" : "") + finalText;
				}

				if (addedText) {
					const last = res.at(-1);
					if (last?.type === "text") {
						last.content += addedText;
					} else {
						res.push({ type: "text" as const, content: addedText });
					}
				}
			}
		}

		// If content remains unmatched (e.g., persisted stream markers), append the remainder
		// Skip when a FinalAnswer already provided the authoritative text.
		if (!sawFinalAnswer && message.content && contentCursor < message.content.length) {
			const remaining = message.content.slice(contentCursor);
			if (remaining.length > 0) {
				const last = res.at(-1);
				if (last?.type === "text") last.content += remaining;
				else res.push({ type: "text" as const, content: remaining });
			}
		} else if (!res.some((b) => b.type === "text") && message.content) {
			// Fallback: no text produced at all
			res.push({ type: "text" as const, content: message.content });
		}

		// Group consecutive tool blocks into TaskGroups for parallel display
		const grouped: Block[] = [];
		let pendingTools: { uuid: string; updates: MessageToolUpdate[] }[] = [];
		let stepCounter = 0;

		const flushTools = () => {
			if (pendingTools.length === 0) return;
			if (pendingTools.length === 1) {
				// Single tool — render as regular ToolUpdate (no group wrapper)
				grouped.push({ type: "tool", ...pendingTools[0] });
			} else {
				// Multiple consecutive tools — group them
				stepCounter++;
				grouped.push({ type: "taskgroup", step: stepCounter, tools: [...pendingTools] });
			}
			pendingTools = [];
		};

		for (const block of res) {
			if (block.type === "tool") {
				pendingTools.push({ uuid: block.uuid, updates: block.updates });
			} else {
				flushTools();
				grouped.push(block);
			}
		}
		flushTools();

		return grouped;
	});

	$effect(() => {
		if (isCopied) {
			setTimeout(() => {
				isCopied = false;
			}, 1000);
		}
	});

	let editMode = $derived(editMsdgId === message.id);
	$effect(() => {
		if (editMode) {
			tick();
			if (editContentEl) {
				editContentEl.value = message.content;
				editContentEl?.focus();
			}
		}
	});
</script>

{#if message.from === "assistant"}
	<div
		bind:offsetWidth={messageWidth}
		class="group relative -mb-4 flex w-fit max-w-full items-start justify-start gap-4 pb-4 leading-relaxed max-sm:mb-1 {message.routerMetadata &&
		messageInfoWidth >= messageWidth
			? 'mb-1'
			: ''}"
		data-message-id={message.id}
		data-message-role="assistant"
		role="presentation"
		onclick={() => (isTapped = !isTapped)}
		onkeydown={() => (isTapped = !isTapped)}
	>
		<MessageAvatar
			classNames="mt-5 size-3.5 flex-none select-none rounded-full shadow-lg max-sm:hidden"
			animating={isLast && loading}
		/>
		<div
			class="relative flex min-w-[60px] flex-col gap-2 break-words rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 px-5 py-3.5 text-gray-600 prose-pre:my-2 dark:border-gray-800 dark:from-gray-800/80 dark:text-gray-300"
		>
			{#if message.files?.length}
				<div class="flex h-fit flex-wrap gap-x-5 gap-y-2">
					{#each message.files as file (file.value)}
						<UploadedFile {file} canClose={false} />
					{/each}
				</div>
			{/if}

			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div bind:this={contentEl} oncopy={handleCopy} onclick={handleContentClick}>
				{#if isLast && loading && blocks.length === 0}
					<IconLoading classNames="loading inline ml-2 first:ml-0" />
				{/if}
				{#each blocks as block, blockIndex (block.type === "tool" ? `${block.uuid}-${blockIndex}` : block.type === "taskgroup" ? `tg-${block.step}-${blockIndex}` : `text-${blockIndex}`)}
					{@const nextBlock = blocks[blockIndex + 1]}
					{@const nextBlockHasThink =
						nextBlock?.type === "text" && THINK_BLOCK_TEST_REGEX.test(nextBlock.content)}
					{@const nextIsLinkable = nextBlock?.type === "tool" || nextBlock?.type === "taskgroup" || nextBlockHasThink}
					{#if block.type === "taskgroup"}
						<div data-exclude-from-copy class="has-[+.prose]:mb-3 [.prose+&]:mt-4">
							<TaskGroup step={block.step} tools={block.tools} {loading} />
						</div>
					{:else if block.type === "tool"}
						<div data-exclude-from-copy class="has-[+.prose]:mb-3 [.prose+&]:mt-4">
							<ToolUpdate tool={block.updates} {loading} hasNext={nextIsLinkable} />
						</div>
					{:else if block.type === "text"}
						{#if isLast && loading && block.content.length === 0}
							<IconLoading classNames="loading inline ml-2 first:ml-0" />
						{/if}

						{#if hasClientThink}
							{@const parts = block.content.split(THINK_BLOCK_REGEX)}
							{#each parts as part, partIndex}
								{@const remainingParts = parts.slice(partIndex + 1)}
								{@const hasMoreLinkable =
									remainingParts.some((p) => p && THINK_BLOCK_TEST_REGEX.test(p)) || nextIsLinkable}
								{#if part && part.startsWith("<think>")}
									{@const isClosed = part.endsWith("</think>")}
									{@const thinkContent = part.slice(7, isClosed ? -8 : undefined)}

									<OpenReasoningResults
										content={thinkContent}
										loading={isLast && loading && !isClosed}
										hasNext={hasMoreLinkable}
									/>
								{:else if part && part.trim().length > 0}
									<div
										class="prose max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-base prose-pre:bg-gray-800 prose-img:my-0 prose-img:cursor-pointer prose-img:rounded-lg dark:prose-pre:bg-gray-900"
									>
										<MarkdownRenderer content={part} loading={isLast && loading} />
									</div>
								{/if}
							{/each}
						{:else}
							<div
								class="prose max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-base prose-pre:bg-gray-800 prose-img:my-0 prose-img:cursor-pointer prose-img:rounded-lg dark:prose-pre:bg-gray-900"
							>
								<MarkdownRenderer content={block.content} loading={isLast && loading} />
							</div>
						{/if}
					{/if}
				{/each}
			</div>
		</div>

		{#if message.routerMetadata || (!loading && message.content)}
			<div
				class="absolute -bottom-3.5 {message.routerMetadata && messageInfoWidth > messageWidth
					? 'left-1 pl-1 lg:pl-7'
					: 'right-1'} flex max-w-[calc(100dvw-40px)] items-center gap-0.5"
				bind:offsetWidth={messageInfoWidth}
			>
				{#if message.routerMetadata && (message.routerMetadata.route || message.routerMetadata.model || message.routerMetadata.provider) && (!isLast || !loading)}
					<div
						class="mr-2 flex items-center gap-1.5 truncate whitespace-nowrap text-[.65rem] text-gray-400 dark:text-gray-400 sm:text-xs"
					>
						{#if message.routerMetadata.route && message.routerMetadata.model}
							<span class="truncate rounded bg-gray-100 px-1 font-mono dark:bg-gray-800 sm:py-px">
								{message.routerMetadata.route}
							</span>
							<span class="text-gray-500">with</span>
							{#if publicConfig.isHuggingChat}
								<a
									href="/chat/settings/{message.routerMetadata.model}"
									class="flex items-center gap-1 truncate rounded bg-gray-100 px-1 font-mono hover:text-gray-500 dark:bg-gray-800 dark:hover:text-gray-300 sm:py-px"
								>
									{message.routerMetadata.model.split("/").pop()}
								</a>
							{:else}
								<span
									class="truncate rounded bg-gray-100 px-1.5 font-mono dark:bg-gray-800 sm:py-px"
								>
									{message.routerMetadata.model.split("/").pop()}
								</span>
							{/if}
						{/if}
						{#if message.routerMetadata.provider}
							{@const hubOrg = PROVIDERS_HUB_ORGS[message.routerMetadata.provider]}
							<span class="text-gray-500 max-sm:hidden">via</span>
							<a
								target="_blank"
								href="https://huggingface.co/{hubOrg}"
								class="flex items-center gap-1 truncate rounded bg-gray-100 px-1 font-mono hover:text-gray-500 dark:bg-gray-800 dark:hover:text-gray-300 max-sm:hidden sm:py-px"
							>
								<img
									src="https://huggingface.co/api/avatars/{hubOrg}"
									alt="{message.routerMetadata.provider} logo"
									class="size-2.5 flex-none rounded-sm"
									onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
								/>
								{message.routerMetadata.provider}
							</a>
						{/if}
					</div>
				{/if}
				{#if !isLast || !loading}
					<CopyToClipBoardBtn
						onClick={() => {
							isCopied = true;
						}}
						classNames="btn rounded-sm p-1 text-sm text-gray-400 hover:text-gray-500 focus:ring-0 dark:text-gray-400 dark:hover:text-gray-300"
						value={contentWithoutThink}
						iconClassNames="text-xs"
					/>
					<button
						class="btn rounded-sm p-1 text-xs text-gray-400 hover:text-gray-500 focus:ring-0 dark:text-gray-400 dark:hover:text-gray-300"
						title="Retry"
						type="button"
						onclick={() => {
							onretry?.({ id: message.id });
						}}
					>
						<CarbonRotate360 />
					</button>
					{#if alternatives.length > 1 && editMsdgId === null}
						<Alternatives
							{message}
							{alternatives}
							{loading}
							onshowAlternateMsg={(payload) => onshowAlternateMsg?.(payload)}
						/>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
	{#if lightboxSrc}
		<ImageLightbox src={lightboxSrc} onclose={() => (lightboxSrc = null)} />
	{/if}
{/if}
{#if message.from === "user"}
	<div
		class="group relative {alternatives.length > 1 && editMsdgId === null
			? 'mb-7'
			: ''} w-full items-start justify-start gap-4"
		data-message-id={message.id}
		data-message-type="user"
		role="presentation"
		onclick={() => (isTapped = !isTapped)}
		onkeydown={() => (isTapped = !isTapped)}
	>
		<div class="flex w-full flex-col gap-2">
			{#if message.files?.length}
				<div class="flex w-fit gap-4 px-5">
					{#each message.files as file}
						<UploadedFile {file} canClose={false} />
					{/each}
				</div>
			{/if}

			<div class="flex w-full flex-row flex-nowrap">
				{#if !editMode}
					<p
						class="disabled w-full appearance-none whitespace-break-spaces text-wrap break-words bg-inherit px-5 py-3.5 text-gray-500 dark:text-gray-400"
					>
						{message.content.trim()}
					</p>
				{:else}
					<form
						class="mt-3 flex w-full flex-col"
						bind:this={editFormEl}
						onsubmit={(e) => {
							e.preventDefault();
							onretry?.({ content: editContentEl?.value, id: message.id });
							editMsdgId = null;
						}}
					>
						<textarea
							class="w-full whitespace-break-spaces break-words rounded-xl bg-gray-100 px-5 py-3.5 text-gray-500 *:h-max focus:outline-none dark:bg-gray-800 dark:text-gray-400"
							rows="5"
							bind:this={editContentEl}
							value={message.content.trim()}
							onkeydown={handleKeyDown}
							required
						></textarea>
						<div class="flex w-full flex-row flex-nowrap items-center justify-center gap-2 pt-2">
							<button
								type="submit"
								class="btn rounded-lg px-3 py-1.5 text-sm
                                {loading
									? 'bg-gray-300 text-gray-400 dark:bg-gray-700 dark:text-gray-600'
									: 'bg-gray-200 text-gray-600 hover:text-gray-800   focus:ring-0 dark:bg-gray-800 dark:text-gray-300 dark:hover:text-gray-200'}
								"
								disabled={loading}
							>
								Send
							</button>
							<button
								type="button"
								class="btn rounded-sm p-2 text-sm text-gray-400 hover:text-gray-500 focus:ring-0 dark:text-gray-400 dark:hover:text-gray-300"
								onclick={() => {
									editMsdgId = null;
								}}
							>
								Cancel
							</button>
						</div>
					</form>
				{/if}
			</div>
			<div class="absolute -bottom-4 ml-3.5 flex w-full gap-1.5">
				{#if alternatives.length > 1 && editMsdgId === null}
					<Alternatives
						{message}
						{alternatives}
						{loading}
						onshowAlternateMsg={(payload) => onshowAlternateMsg?.(payload)}
					/>
				{/if}
				{#if (alternatives.length > 1 && editMsdgId === null) || (!loading && !editMode)}
					<button
						class="hidden cursor-pointer items-center gap-1 rounded-md border border-gray-200 px-1.5 py-0.5 text-xs text-gray-400 group-hover:flex hover:flex hover:text-gray-500 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-300 lg:-right-2"
						title="Edit"
						type="button"
						onclick={() => {
							if (requireAuthUser()) return;
							editMsdgId = message.id;
						}}
					>
						<CarbonPen />
						Edit
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes loading {
		to {
			stroke-dashoffset: 122.9;
		}
	}
</style>
