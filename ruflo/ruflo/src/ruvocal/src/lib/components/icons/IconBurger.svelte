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
	fill="none"
	viewBox="0 0 16 16"
	><path
		d="M8.795 10.418a.84.84 0 1 1 0 1.681H1.907a.84.84 0 0 1 0-1.681h6.888ZM14.093 3.9a.841.841 0 0 1 0 1.682H1.907a.84.84 0 0 1 0-1.682h12.186Z"
		fill="currentColor"
	/>
</svg>
