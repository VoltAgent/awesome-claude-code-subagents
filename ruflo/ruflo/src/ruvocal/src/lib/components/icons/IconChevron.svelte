<script lang="ts">
	interface Props {
		classNames?: string;
	}

	let { classNames = "" }: Props = $props();
</script>

<svg
	width="1em"
	height="1em"
	viewBox="0 0 15 6"
	class={classNames}
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
>
	<path
		d="M1.67236 1L7.67236 7L13.6724 1"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
