<script lang="ts">
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";

	const publicConfig = usePublicConfig();

	interface Props {
		classNames?: string;
	}

	let { classNames = "" }: Props = $props();
</script>

<svg
	width="32"
	height="32"
	viewBox="0 0 32 32"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	class="logo {classNames}"
	aria-label="{publicConfig.PUBLIC_APP_NAME} logo"
	role="img"
>
	<defs>
		<linearGradient id="wave-grad-1" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0%" stop-color="#3b82f6" />
			<stop offset="100%" stop-color="#06b6d4" />
		</linearGradient>
		<linearGradient id="wave-grad-2" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0%" stop-color="#818cf8" />
			<stop offset="100%" stop-color="#a78bfa" />
		</linearGradient>
		<linearGradient id="wave-grad-3" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0%" stop-color="#06b6d4" />
			<stop offset="100%" stop-color="#2dd4bf" />
		</linearGradient>
	</defs>

	<!-- Flow waves -->
	<path class="wave w1" d="M2 14 Q8 9, 16 14 Q24 19, 30 14" stroke="url(#wave-grad-1)" stroke-width="2" stroke-linecap="round" fill="none" />
	<path class="wave w2" d="M2 18 Q8 13, 16 18 Q24 23, 30 18" stroke="url(#wave-grad-2)" stroke-width="1.5" stroke-linecap="round" fill="none" />
	<path class="wave w3" d="M2 22 Q8 17, 16 22 Q24 27, 30 22" stroke="url(#wave-grad-3)" stroke-width="1" stroke-linecap="round" fill="none" />

</svg>

<style>
	.wave {
		transform-origin: center;
	}
	.w1 {
		animation: wave-shift 3s ease-in-out infinite;
	}
	.w2 {
		animation: wave-shift 3s ease-in-out infinite 0.5s;
		opacity: 0.6;
	}
	.w3 {
		animation: wave-shift 3s ease-in-out infinite 1s;
		opacity: 0.4;
	}

	@keyframes wave-shift {
		0%, 100% { transform: translateX(0); }
		50% { transform: translateX(2px); }
	}

	:global(.dark) .w2 { opacity: 0.7; }
	:global(.dark) .w3 { opacity: 0.5; }
</style>
