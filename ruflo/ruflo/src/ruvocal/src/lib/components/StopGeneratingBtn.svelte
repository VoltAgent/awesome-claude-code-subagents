<script lang="ts">
	import CarbonStopFilledAlt from "~icons/carbon/stop-filled-alt";

	interface Props {
		classNames?: string;
		onClick?: () => void;
		showBorder?: boolean;
	}

	let { classNames = "", onClick, showBorder = false }: Props = $props();
</script>

<button
	type="button"
	onclick={onClick}
	class={`btn stop-generating-btn ${showBorder ? "stop-generating-btn--spinning" : ""} ${classNames}`}
	aria-label="Stop generating"
>
	<span class="sr-only">Stop generating</span>
	<CarbonStopFilledAlt class="size-3.5 text-gray-500" />
</button>

<style lang="postcss">
	.stop-generating-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		--stop-generating-ring-color: rgba(31, 41, 55, 0.35);
	}

	.stop-generating-btn :global(svg) {
		display: block;
	}

	.stop-generating-btn::after {
		content: "";
		position: absolute;
		inset: -2px;
		border-radius: inherit;
		pointer-events: none;
		background: transparent;
	}

	.stop-generating-btn--spinning::after {
		background: conic-gradient(
			from 0deg,
			transparent 0deg 240deg,
			var(--stop-generating-ring-color) 240deg 360deg
		);
		mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1px));
		animation: stop-generating-rotate 1.2s linear infinite;
	}

	:global(.dark) .stop-generating-btn {
		--stop-generating-ring-color: rgba(255, 255, 255, 0.2);
	}

	@keyframes stop-generating-rotate {
		from {
			transform: rotate(0deg);
		}

		to {
			transform: rotate(360deg);
		}
	}
</style>
