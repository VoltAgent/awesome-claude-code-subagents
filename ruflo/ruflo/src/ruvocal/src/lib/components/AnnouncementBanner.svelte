<script lang="ts">
	interface Props {
		title?: string;
		classNames?: string;
		children?: import("svelte").Snippet;
	}

	let { title = "", classNames = "", children }: Props = $props();
</script>

<div class="flex items-center rounded-xl bg-gray-100 p-1 text-sm dark:bg-gray-800 {classNames}">
	<span
		class="mr-2 inline-flex items-center rounded-lg bg-gradient-to-br from-gray-300 px-2 py-1 text-xxs font-medium uppercase leading-3 text-gray-700 dark:from-gray-900 dark:text-gray-400"
		>New</span
	>
	{title}
	<div class="ml-auto shrink-0">
		{@render children?.()}
	</div>
</div>
