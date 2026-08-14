<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { page } from "$app/state";
	import { base } from "$app/paths";
	import type { Model } from "$lib/types/Model";

	interface Props {
		models: Model[];
		currentModel: Model;
	}

	let { models, currentModel }: Props = $props();

	let selectedModelId = $state(
		models.map((m) => m.id).includes(currentModel.id) ? currentModel.id : models[0].id
	);

	async function handleModelChange() {
		if (!page.params.id) return;

		try {
			const response = await fetch(`${base}/conversation/${page.params.id}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ model: selectedModelId }),
			});

			if (!response.ok) {
				throw new Error("Failed to update model");
			}

			await invalidateAll();
		} catch (error) {
			console.error(error);
		}
	}
</script>

<div
	class="mx-auto mt-0 flex w-fit flex-col items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-500/20 p-4 dark:border-gray-800"
>
	<span>
		This model is no longer available. Switch to a new one to continue this conversation:
	</span>
	<div class="flex items-center space-x-2">
		<select
			bind:value={selectedModelId}
			class="rounded-md bg-gray-100 px-2 py-1 dark:bg-gray-900 max-sm:max-w-32"
		>
			{#each models as model}
				<option value={model.id}>{model.name}</option>
			{/each}
		</select>
		<button
			onclick={handleModelChange}
			disabled={selectedModelId === currentModel.id}
			class="rounded-md bg-gray-100 px-2 py-1 dark:bg-gray-900"
		>
			Accept
		</button>
	</div>
</div>
