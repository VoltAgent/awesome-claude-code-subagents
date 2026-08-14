<script lang="ts">
	import { page } from "$app/state";
	import { base } from "$app/paths";
	import { goto, replaceState } from "$app/navigation";
	import { onMount, tick } from "svelte";
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";

	import ChatWindow from "$lib/components/chat/ChatWindow.svelte";
	import { findCurrentModel } from "$lib/utils/models";
	import { useSettingsStore } from "$lib/stores/settings";
	import { ERROR_MESSAGES, error } from "$lib/stores/errors";
	import { pendingMessage } from "$lib/stores/pendingMessage";
	import { sanitizeUrlParam } from "$lib/utils/urlParams";
	import { loadAttachmentsFromUrls } from "$lib/utils/loadAttachmentsFromUrls";
	import { requireAuthUser } from "$lib/utils/auth";

	let { data } = $props();

	let loading = $state(false);
	let files: File[] = $state([]);
	let draft = $state("");

	const settings = useSettingsStore();
	let modelId = $derived(page.params.model ?? "");
	const publicConfig = usePublicConfig();
	let modelPath = $derived(
		modelId
			.split("/")
			.map((segment) => encodeURIComponent(segment))
			.join("/")
	);

	async function createConversation(message: string) {
		try {
			loading = true;

			const res = await fetch(`${base}/conversation`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: modelId,
					preprompt: $settings.customPrompts[modelId],
				}),
			});

			if (!res.ok) {
				error.set("Error while creating conversation, try again.");
				console.error("Error while creating conversation: " + (await res.text()));
				return;
			}

			const { conversationId } = await res.json();

			// Ugly hack to use a store as temp storage, feel free to improve ^^
			pendingMessage.set({
				content: message,
				files,
			});

			// invalidateAll to update list of conversations
			await goto(`${base}/conversation/${conversationId}`, { invalidateAll: true });
		} catch (err) {
			error.set(ERROR_MESSAGES.default);
			console.error(err);
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		try {
			// Check if auth is required before processing any query params
			const hasQ = page.url.searchParams.has("q");
			const hasPrompt = page.url.searchParams.has("prompt");
			const hasAttachments = page.url.searchParams.has("attachments");

			if ((hasQ || hasPrompt || hasAttachments) && requireAuthUser()) {
				return; // Redirecting to login, will return to this URL after
			}

			// Handle attachments parameter first
			if (hasAttachments) {
				const result = await loadAttachmentsFromUrls(page.url.searchParams);
				files = result.files;

				// Show errors if any
				if (result.errors.length > 0) {
					console.error("Failed to load some attachments:", result.errors);
					error.set(
						`Failed to load ${result.errors.length} attachment(s). Check console for details.`
					);
				}

				// Clean up URL
				const url = new URL(page.url);
				url.searchParams.delete("attachments");
				history.replaceState({}, "", url);
			}

			const query = sanitizeUrlParam(page.url.searchParams.get("q"));
			if (query) {
				void createConversation(query);
				const url = new URL(page.url);
				url.searchParams.delete("q");
				tick().then(() => {
					replaceState(url, page.state);
				});
				return;
			}

			const promptQuery = sanitizeUrlParam(page.url.searchParams.get("prompt"));
			if (promptQuery && !draft) {
				draft = promptQuery;
				const url = new URL(page.url);
				url.searchParams.delete("prompt");
				tick().then(() => {
					replaceState(url, page.state);
				});
			}
		} catch (err) {
			console.error("Failed to process URL parameters:", err);
		}

		settings.instantSet({ activeModel: modelId });
	});
</script>

<svelte:head>
	<title>{modelId} - {publicConfig.PUBLIC_APP_NAME}</title>
	<meta property="og:title" content="{modelId} - {publicConfig.PUBLIC_APP_NAME}" />
	<meta property="og:type" content="website" />
	<meta property="og:description" content="Use {modelId} with {publicConfig.PUBLIC_APP_NAME}" />
	<meta
		property="og:image"
		content="{publicConfig.PUBLIC_ORIGIN || page.url.origin}{base}/models/{modelPath}/thumbnail.png"
	/>
	<meta property="og:image:alt" content="{modelId} - {publicConfig.PUBLIC_APP_NAME}" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="648" />
	<meta property="og:url" content={page.url.href} />
	<meta property="og:site_name" content={publicConfig.PUBLIC_APP_NAME} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="{modelId} - {publicConfig.PUBLIC_APP_NAME}" />
	<meta name="twitter:description" content="Use {modelId} with {publicConfig.PUBLIC_APP_NAME}" />
	<meta
		name="twitter:image"
		content="{publicConfig.PUBLIC_ORIGIN || page.url.origin}{base}/models/{modelPath}/thumbnail.png"
	/>
	<meta name="twitter:image:alt" content="{modelId} - {publicConfig.PUBLIC_APP_NAME}" />
</svelte:head>

<ChatWindow
	onmessage={(message) => createConversation(message)}
	{loading}
	currentModel={findCurrentModel(data.models, data.oldModels, modelId)}
	models={data.models}
	bind:files
	bind:draft
/>
