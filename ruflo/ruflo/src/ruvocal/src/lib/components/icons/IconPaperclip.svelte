<script lang="ts">
	interface Props {
		classNames?: string;
	}

	let { classNames = "" }: Props = $props();
</script>

<svg
	class={classNames}
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
	focusable="false"
	role="img"
	width="1em"
	height="1em"
	fill="currentColor"
	preserveAspectRatio="xMidYMid meet"
	viewBox="0 0 32 32"
	><path
		d="M19.02 5.57a5.77 5.77 0 1 1 8.56 7.74L16.6 25.45l-.02.01v.01A7.87 7.87 0 0 1 4.92 14.9L12.95 6A1.18 1.18 0 0 1 14.7 7.6l-8.03 8.87a5.51 5.51 0 1 0 8.19 7.4l10.97-12.14a3.41 3.41 0 1 0-5.06-4.58l-9.32 10.3a1.27 1.27 0 1 0 1.88 1.7l6.28-6.94a1.18 1.18 0 0 1 1.75 1.59l-6.28 6.94a3.63 3.63 0 0 1-5.41-4.83l.02-.02 9.33-10.32Z"
		fill="currentColor"
	/></svg
>
