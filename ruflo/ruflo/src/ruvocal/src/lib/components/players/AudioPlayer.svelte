<script lang="ts">
	import CarbonPause from "~icons/carbon/pause";
	import CarbonPlay from "~icons/carbon/play";
	interface Props {
		src: string;
		name: string;
	}

	let { src, name }: Props = $props();

	let time = $state(0);
	let duration = $state(0);
	let paused = $state(true);

	function format(time: number) {
		if (isNaN(time)) return "...";

		const minutes = Math.floor(time / 60);
		const seconds = Math.floor(time % 60);

		return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
	}

	function seek(e: PointerEvent) {
		if (!e.currentTarget) return;
		const { left, width } = (e.currentTarget as HTMLElement).getBoundingClientRect();

		let p = (e.clientX - left) / width;
		if (p < 0) p = 0;
		if (p > 1) p = 1;

		time = p * duration;
	}
</script>

<div
	class="flex h-14 w-72 items-center gap-4 rounded-2xl border border-gray-200 bg-white p-2.5 text-gray-600 shadow-sm transition-all dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
>
	<audio
		{src}
		bind:currentTime={time}
		bind:duration
		bind:paused
		preload="metadata"
		onended={() => {
			time = 0;
		}}
	></audio>

	<button
		class="mx-auto my-auto aspect-square size-8 rounded-full border border-gray-400 bg-gray-100 dark:border-gray-800 dark:bg-gray-700"
		aria-label={paused ? "play" : "pause"}
		onclick={() => (paused = !paused)}
	>
		{#if paused}
			<CarbonPlay class="mx-auto my-auto text-gray-600 dark:text-gray-300" />
		{:else}
			<CarbonPause class="mx-auto my-auto text-gray-600 dark:text-gray-300" />
		{/if}
	</button>
	<div class="overflow-hidden">
		<div class="truncate font-medium">{name}</div>
		{#if duration !== Infinity}
			<div class="flex items-center gap-2">
				<span class="text-xs">{format(time)}</span>
				<div
					class="relative h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-700"
					onpointerdown={() => {
						paused = true;
					}}
					onpointerup={seek}
				>
					<div
						class="absolute inset-0 h-full bg-gray-400 dark:bg-gray-600"
						style="width: {(time / duration) * 100}%"
					></div>
				</div>
				<span class="text-xs">{duration ? format(duration) : "--:--"}</span>
			</div>
		{/if}
	</div>
</div>
