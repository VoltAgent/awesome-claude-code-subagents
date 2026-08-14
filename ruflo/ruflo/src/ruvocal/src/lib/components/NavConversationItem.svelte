<script lang="ts">
	import { base } from "$app/paths";
	import { page } from "$app/state";
	import { tick } from "svelte";

	import CarbonTrashCan from "~icons/carbon/trash-can";
	import CarbonEdit from "~icons/carbon/edit";
	import type { ConvSidebar } from "$lib/types/ConvSidebar";

	import EditConversationModal from "$lib/components/EditConversationModal.svelte";
	import DeleteConversationModal from "$lib/components/DeleteConversationModal.svelte";
	import { requireAuthUser } from "$lib/utils/auth";

	interface Props {
		conv: ConvSidebar;
		readOnly?: true;
		ondeleteConversation?: (id: string) => void;
		oneditConversationTitle?: (payload: { id: string; title: string }) => void;
	}

	let { conv, readOnly, ondeleteConversation, oneditConversationTitle }: Props = $props();

	let deleteOpen = $state(false);
	let renameOpen = $state(false);
	let inlineEditing = $state(false);
	let inlineCancelled = $state(false);
	let inlineTitle = $state("");
	let inputEl: HTMLInputElement | undefined = $state();

	async function startInlineEdit() {
		if (readOnly || requireAuthUser()) return;
		inlineTitle = conv.title;
		inlineCancelled = false;
		inlineEditing = true;
		await tick();
		inputEl?.focus();
		inputEl?.select();
	}

	function commitInlineEdit() {
		if (!inlineEditing || inlineCancelled) return;
		const trimmed = inlineTitle.trim();
		inlineEditing = false;
		if (trimmed && trimmed !== conv.title) {
			oneditConversationTitle?.({ id: conv.id.toString(), title: trimmed });
		}
	}

	function cancelInlineEdit() {
		inlineCancelled = true;
		inlineEditing = false;
	}
</script>

<a
	data-sveltekit-noscroll
	data-sveltekit-preload-data="tap"
	href="{base}/conversation/{conv.id}"
	class="group flex h-[2.15rem] flex-none items-center gap-1.5 rounded-lg pl-2.5 pr-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 max-sm:h-10
		{conv.id === page.params.id ? 'bg-gray-100 dark:bg-gray-700' : ''}"
	onclick={(e) => {
		if (e.detail >= 2) {
			e.preventDefault();
			startInlineEdit();
		}
	}}
>
	{#if inlineEditing}
		<!-- svelte-ignore a11y_autofocus -->
		<input
			bind:this={inputEl}
			type="text"
			value={inlineTitle}
			oninput={(e) => (inlineTitle = (e.currentTarget as HTMLInputElement).value)}
			onkeydown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					commitInlineEdit();
				} else if (e.key === "Escape") {
					e.preventDefault();
					cancelInlineEdit();
				}
			}}
			onblur={commitInlineEdit}
			onclick={(e) => e.preventDefault()}
			class="my-0 h-full min-w-0 flex-1 truncate border-none bg-transparent p-0 text-inherit outline-none first-letter:uppercase focus:ring-0"
		/>
	{:else}
		<div class="my-2 min-w-0 flex-1 truncate first-letter:uppercase">
			<span>{conv.title}</span>
		</div>
	{/if}

	{#if !readOnly && !inlineEditing}
		<button
			type="button"
			class="flex h-5 w-5 items-center justify-center rounded md:hidden md:group-hover:flex"
			title="Edit conversation title"
			onclick={(e) => {
				e.preventDefault();
				if (requireAuthUser()) return;
				renameOpen = true;
			}}
		>
			<CarbonEdit class="text-xs text-gray-400 hover:text-gray-500 dark:hover:text-gray-300" />
		</button>

		<button
			type="button"
			class="flex h-5 w-5 items-center justify-center rounded md:hidden md:group-hover:flex"
			title="Delete conversation"
			onclick={(event) => {
				event.preventDefault();
				if (requireAuthUser()) return;
				if (event.shiftKey) {
					ondeleteConversation?.(conv.id.toString());
				} else {
					deleteOpen = true;
				}
			}}
		>
			<CarbonTrashCan class="text-xs text-gray-400  hover:text-gray-500 dark:hover:text-gray-300" />
		</button>
	{/if}
</a>

<!-- Edit title modal -->
{#if renameOpen}
	<EditConversationModal
		open={renameOpen}
		title={conv.title}
		onclose={() => (renameOpen = false)}
		onsave={(payload) => {
			renameOpen = false;
			oneditConversationTitle?.({ id: conv.id.toString(), title: payload.title });
		}}
	/>
{/if}

<!-- Delete confirmation modal -->
{#if deleteOpen}
	<DeleteConversationModal
		open={deleteOpen}
		title={conv.title}
		onclose={() => (deleteOpen = false)}
		ondelete={() => {
			deleteOpen = false;
			ondeleteConversation?.(conv.id.toString());
		}}
	/>
{/if}
