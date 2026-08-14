<script lang="ts">
	import { onMount, onDestroy } from "svelte";

	interface Props {
		frequencyData: Uint8Array;
		minHeight?: number;
		maxHeight?: number;
	}

	let { frequencyData, minHeight = 4, maxHeight = 40 }: Props = $props();

	const PILL_WIDTH = 2; // w-0.5 = 2px
	const PILL_GAP = 2;
	const SAMPLE_INTERVAL_MS = 50; // Sample every 50ms (~20 samples/sec)

	let containerRef: HTMLDivElement | undefined = $state();
	let timeline: number[] = $state([]);
	let pillCount = $state(60); // Default, will be calculated from container width
	let intervalId: ReturnType<typeof setInterval> | undefined;
	let smoothedAmplitude = 0;

	// Calculate average amplitude from frequency data
	function getAmplitude(): number {
		if (!frequencyData.length) return 0;
		let sum = 0;
		for (let i = 0; i < frequencyData.length; i++) {
			sum += frequencyData[i];
		}
		return sum / frequencyData.length / 255; // Normalize to 0-1
	}

	function addSample() {
		const rawAmplitude = getAmplitude();
		// Smooth the amplitude for less jittery visualization
		smoothedAmplitude = smoothedAmplitude * 0.3 + rawAmplitude * 0.7;

		// Boost amplitude by 1.5x and apply slight curve for better visibility
		const boostedAmplitude = Math.min(1, Math.pow(smoothedAmplitude * 1.5, 0.85));

		const height = minHeight + boostedAmplitude * (maxHeight - minHeight);

		// Push new sample, keep only pillCount samples (sliding window)
		timeline = [...timeline, height].slice(-pillCount);
	}

	function calculatePillCount() {
		if (containerRef) {
			const width = containerRef.clientWidth;
			pillCount = Math.max(20, Math.floor(width / (PILL_WIDTH + PILL_GAP)));
		}
	}

	onMount(() => {
		calculatePillCount();

		// Initialize timeline with minimum height dots
		timeline = Array(pillCount).fill(minHeight);

		// Start sampling at fixed intervals
		intervalId = setInterval(addSample, SAMPLE_INTERVAL_MS);

		// Handle resize
		const resizeObserver = new ResizeObserver(() => {
			const oldCount = pillCount;
			calculatePillCount();
			// Adjust timeline buffer if container size changed
			if (pillCount > oldCount) {
				// Pad with min height on the left
				timeline = [...Array(pillCount - oldCount).fill(minHeight), ...timeline];
			} else if (pillCount < oldCount) {
				timeline = timeline.slice(-pillCount);
			}
		});

		if (containerRef) {
			resizeObserver.observe(containerRef);
		}

		return () => {
			resizeObserver.disconnect();
		};
	});

	onDestroy(() => {
		if (intervalId) clearInterval(intervalId);
	});
</script>

<div bind:this={containerRef} class="flex h-12 w-full items-center justify-start gap-[2px]">
	{#each timeline as height, i (i)}
		<div
			class="w-0.5 shrink-0 rounded-full bg-gray-400 dark:bg-white/60"
			style="height: {Math.max(minHeight, Math.round(height))}px;"
		></div>
	{/each}
</div>
