<script lang="ts">
	import { page } from "$app/state";
	import type { MessageFile } from "$lib/types/Message";
	import CarbonClose from "~icons/carbon/close";
	import CarbonDocumentBlank from "~icons/carbon/document-blank";
	import CarbonDownload from "~icons/carbon/download";
	import CarbonDocument from "~icons/carbon/document";
	import Modal from "../Modal.svelte";
	import AudioPlayer from "../players/AudioPlayer.svelte";
	import EosIconsLoading from "~icons/eos-icons/loading";
	import { base } from "$app/paths";
	import { TEXT_MIME_ALLOWLIST } from "$lib/constants/mime";

	interface Props {
		file: MessageFile;
		canClose?: boolean;
		onclose?: () => void;
	}

	let { file, canClose = true, onclose }: Props = $props();

	let showModal = $state(false);

	// Capture URL once at component creation to prevent reactive updates during navigation
	let urlNotTrailing = page.url.pathname.replace(/\/$/, "");

	function truncateMiddle(text: string, maxLength: number): string {
		if (text.length <= maxLength) {
			return text;
		}

		const halfLength = Math.floor((maxLength - 1) / 2);
		const start = text.substring(0, halfLength);
		const end = text.substring(text.length - halfLength);

		return `${start}…${end}`;
	}

	const isImage = (mime: string) =>
		mime.startsWith("image/") || mime === "webp" || mime === "jpeg" || mime === "png";

	const isAudio = (mime: string) =>
		mime.startsWith("audio/") || mime === "mp3" || mime === "wav" || mime === "x-wav";
	const isVideo = (mime: string) =>
		mime.startsWith("video/") || mime === "mp4" || mime === "x-mpeg";

	function matchesAllowed(contentType: string, allowed: readonly string[]): boolean {
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

	const isPlainText = (mime: string) =>
		mime === "application/vnd.chatui.clipboard" || matchesAllowed(mime, TEXT_MIME_ALLOWLIST);

	let isClickable = $derived(isImage(file.mime) || isPlainText(file.mime));
</script>

{#if showModal && isClickable}
	<!-- show the image file full screen, click outside to exit -->
	<Modal width="xl:max-w-[75dvw]" onclose={() => (showModal = false)}>
		{#if isImage(file.mime)}
			{#if file.type === "hash"}
				<img
					src={urlNotTrailing + "/output/" + file.value}
					alt="input from user"
					class="aspect-auto"
				/>
			{:else}
				<!-- handle the case where this is a base64 encoded image -->
				<img
					src={`data:${file.mime};base64,${file.value}`}
					alt="input from user"
					class="aspect-auto"
				/>
			{/if}
		{:else if isPlainText(file.mime)}
			<div class="relative flex h-full w-full flex-col gap-2 p-4">
				<div class="flex items-center gap-1">
					<CarbonDocument />
					<h3 class="text-lg font-semibold">{file.name}</h3>
				</div>
				{#if file.mime === "application/vnd.chatui.clipboard"}
					<p class="text-sm text-gray-500">
						If you prefer to inject clipboard content directly in the chat, you can disable this
						feature in the
						<a href={`${base}/settings`} class="underline">settings page</a>.
					</p>
				{/if}
				<button
					class="absolute right-4 top-4 text-xl text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
					onclick={() => (showModal = false)}
				>
					<CarbonClose class="text-xl" />
				</button>
				{#if file.type === "hash"}
					{#await fetch(urlNotTrailing + "/output/" + file.value).then((res) => res.text())}
						<div class="flex h-full w-full items-center justify-center">
							<EosIconsLoading class="text-xl" />
						</div>
					{:then result}
						<pre
							class="w-full whitespace-pre-wrap break-words pt-0 text-xs"
							class:font-sans={file.mime === "text/plain" ||
								file.mime === "application/vnd.chatui.clipboard"}
							class:font-mono={file.mime !== "text/plain" &&
								file.mime !== "application/vnd.chatui.clipboard"}>{result}</pre>
					{/await}
				{:else}
					<pre
						class="w-full whitespace-pre-wrap break-words pt-0 text-xs"
						class:font-sans={file.mime === "text/plain" ||
							file.mime === "application/vnd.chatui.clipboard"}
						class:font-mono={file.mime !== "text/plain" &&
							file.mime !== "application/vnd.chatui.clipboard"}>{atob(file.value)}</pre>
				{/if}
			</div>
		{/if}
	</Modal>
{/if}

<div
	onclick={() => isClickable && (showModal = true)}
	onkeydown={(e) => {
		if (!isClickable) {
			return;
		}
		if (e.key === "Enter" || e.key === " ") {
			showModal = true;
		}
	}}
	class:clickable={isClickable}
	role="button"
	tabindex="0"
>
	<div class="group relative flex items-center rounded-xl shadow-sm">
		{#if isImage(file.mime)}
			<div class="h-36 overflow-hidden rounded-xl">
				<img
					src={file.type === "base64"
						? `data:${file.mime};base64,${file.value}`
						: urlNotTrailing + "/output/" + file.value}
					alt={file.name}
					class="h-36 bg-gray-200 object-cover dark:bg-gray-800"
				/>
			</div>
		{:else if isAudio(file.mime)}
			<AudioPlayer
				src={file.type === "base64"
					? `data:${file.mime};base64,${file.value}`
					: urlNotTrailing + "/output/" + file.value}
				name={truncateMiddle(file.name, 28)}
			/>
		{:else if isVideo(file.mime)}
			<div
				class="border-1 w-72 overflow-clip rounded-xl border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
			>
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					src={file.type === "base64"
						? `data:${file.mime};base64,${file.value}`
						: urlNotTrailing + "/output/" + file.value}
					controls
				></video>
			</div>
		{:else if isPlainText(file.mime)}
			<div
				class="flex h-14 w-64 items-center gap-2 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900 2xl:w-72"
				class:file-hoverable={isClickable}
			>
				<div
					class="grid size-10 flex-none place-items-center rounded-lg bg-gray-100 dark:bg-gray-800"
				>
					<CarbonDocument class="text-base text-gray-700 dark:text-gray-300" />
				</div>
				<dl class="flex flex-col items-start truncate leading-tight">
					<dd class="text-sm">
						{truncateMiddle(file.name, 28)}
					</dd>
					{#if file.mime === "application/vnd.chatui.clipboard"}
						<dt class="text-xs text-gray-400">Clipboard source</dt>
					{:else}
						<dt class="text-xs text-gray-400">{file.mime}</dt>
					{/if}
				</dl>
			</div>
		{:else if file.mime === "application/octet-stream"}
			<div
				class="flex h-14 w-72 items-center gap-2 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
				class:file-hoverable={isClickable}
			>
				<div
					class="grid size-10 flex-none place-items-center rounded-lg bg-gray-100 dark:bg-gray-800"
				>
					<CarbonDocumentBlank class="text-base text-gray-700 dark:text-gray-300" />
				</div>
				<dl class="flex flex-grow flex-col truncate leading-tight">
					<dd class="text-sm">
						{truncateMiddle(file.name, 28)}
					</dd>
					<dt class="text-xs text-gray-400">File type could not be determined</dt>
				</dl>
				<a
					href={file.type === "base64"
						? `data:application/octet-stream;base64,${file.value}`
						: urlNotTrailing + "/output/" + file.value}
					download={file.name}
					class="ml-auto flex-none"
				>
					<CarbonDownload class="text-base text-gray-700 dark:text-gray-300" />
				</a>
			</div>
		{:else}
			<div
				class="flex h-14 w-72 items-center gap-2 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
				class:file-hoverable={isClickable}
			>
				<div
					class="grid size-10 flex-none place-items-center rounded-lg bg-gray-100 dark:bg-gray-800"
				>
					<CarbonDocumentBlank class="text-base text-gray-700 dark:text-gray-300" />
				</div>
				<dl class="flex flex-col items-start truncate leading-tight">
					<dd class="text-sm">
						{truncateMiddle(file.name, 28)}
					</dd>
					<dt class="text-xs text-gray-400">{file.mime}</dt>
				</dl>
			</div>
		{/if}
		<!-- add a button on top that removes the image -->
		{#if canClose}
			<button
				class="absolute -right-2 -top-2 z-10 grid size-6 place-items-center rounded-full border bg-black group-hover:visible dark:border-gray-700"
				class:invisible={navigator.maxTouchPoints === 0}
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onclose?.();
				}}
			>
				<CarbonClose class=" text-xs  text-white" />
			</button>
		{/if}
	</div>
</div>
