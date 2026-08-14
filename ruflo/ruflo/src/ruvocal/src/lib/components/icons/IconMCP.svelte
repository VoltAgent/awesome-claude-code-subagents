<script lang="ts">
	interface Props {
		classNames?: string;
	}

	let { classNames = "" }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	class={classNames}
	width="1em"
	height="1em"
	viewBox="0 0 24 24"
>
	<g
		fill="none"
		stroke="currentColor"
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width="1.5"
	>
		<path
			d="m3.5 11.75l8.172-8.171a2.828 2.828 0 1 1 4 4m0 0L9.5 13.75m6.172-6.171a2.828 2.828 0 0 1 4 4l-6.965 6.964a1 1 0 0 0 0 1.414L14 21.25"
		/>
		<path d="m17.5 9.75l-6.172 6.171a2.829 2.829 0 0 1-4-4L13.5 5.749" />
	</g>
</svg>
