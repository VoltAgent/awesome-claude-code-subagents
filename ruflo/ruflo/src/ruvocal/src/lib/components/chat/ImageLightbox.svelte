<script lang="ts">
	import { onMount } from "svelte";
	import Portal from "../Portal.svelte";
	import CarbonClose from "~icons/carbon/close";

	interface Props {
		src: string;
		onclose: () => void;
	}

	let { src, onclose }: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			onclose();
		}
	}

	function handleOverlayClick(e: MouseEvent) {
		// Close when clicking the overlay (not the image)
		if (e.target === e.currentTarget) {
			onclose();
		}
	}

	onMount(() => {
		// Prevent body scroll while lightbox is open
		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = originalOverflow;
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<Portal>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/90 backdrop-blur-sm"
		onclick={handleOverlayClick}
	>
		<!-- Close button -->
		<button
			class="absolute right-3 top-3 grid size-8 place-items-center rounded-full border border-white/25 bg-white/20 text-gray-300 hover:bg-white/30 sm:right-6 sm:top-6"
			onclick={onclose}
			aria-label="Close"
		>
			<CarbonClose />
		</button>

		<!-- Image with moon-landing's resize strategy -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<img
			{src}
			alt=""
			class="h-auto max-h-[calc(100vh-160px)] w-auto max-w-full"
			onclick={(e) => e.stopPropagation()}
		/>
	</div>
</Portal>
