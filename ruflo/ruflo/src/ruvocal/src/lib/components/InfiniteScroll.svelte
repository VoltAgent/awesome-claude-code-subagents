<script lang="ts">
	import { onMount } from "svelte";
	interface Props {
		onvisible?: () => void;
	}

	let { onvisible }: Props = $props();

	let loader: HTMLDivElement | undefined = $state();
	let observer: IntersectionObserver;
	let intervalId: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		if (!loader) {
			return;
		}

		observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					// Clear any existing interval
					if (intervalId) {
						clearInterval(intervalId);
					}
					// Start new interval that dispatches every 250ms
					intervalId = setInterval(() => {
						onvisible?.();
					}, 250);
				} else {
					// Clear interval when not intersecting
					if (intervalId) {
						clearInterval(intervalId);
						intervalId = undefined;
					}
				}
			});
		});

		observer.observe(loader);

		return () => {
			observer.disconnect();
			if (intervalId) {
				clearInterval(intervalId);
			}
		};
	});
</script>

<div bind:this={loader} class="h-2"></div>
