<script lang="ts">
	import Modal from "$lib/components/Modal.svelte";
	import RuFloUniverse from "$lib/components/RuFloUniverse.svelte";
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";

	const publicConfig = usePublicConfig();

	interface Props {
		close: () => void;
	}

	let { close }: Props = $props();
</script>

<Modal closeOnBackdrop={false} onclose={close} width="!max-w-[420px] !m-4">
	<div
		class="flex w-full flex-col gap-8 bg-white bg-gradient-to-b to-transparent px-6 pb-7 dark:bg-black dark:from-white/10 dark:to-white/5"
	>
		<div class="relative -mx-6 h-48 select-none overflow-hidden">
			<RuFloUniverse width={420} height={192} />
			<div
				class="absolute bottom-3 right-3 rounded-lg border border-indigo-500/30 bg-indigo-500/20 px-2 py-0.5 text-sm font-semibold text-indigo-400"
			>
				MCP Tools
			</div>
		</div>

		<div class="text-gray-700 dark:text-gray-200">
			<p class="text-[15px] leading-relaxed">
				Welcome to <strong>{publicConfig.PUBLIC_APP_NAME}</strong>, your intelligent workflow
				automation assistant.
			</p>
			<p class="mt-3 text-[15px] leading-relaxed">
				Powered by AI models with MCP tool integration for search, analysis, and workflow
				execution.
			</p>
		</div>

		<button
			class="k w-full rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
			onclick={close}
		>
			Start chatting
		</button>
	</div>
</Modal>
