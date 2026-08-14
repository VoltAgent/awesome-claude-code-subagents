<script lang="ts">
	import CarbonCaretLeft from "~icons/carbon/caret-left";
	import CarbonCaretRight from "~icons/carbon/caret-right";

	interface Props {
		href: string;
		direction: "next" | "previous";
		isDisabled?: boolean;
	}

	let { href, direction, isDisabled = false }: Props = $props();
</script>

<a
	class="flex items-center rounded-lg px-2.5 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 {isDisabled
		? 'pointer-events-none opacity-50'
		: ''}"
	{href}
>
	{#if direction === "previous"}
		<CarbonCaretLeft classNames="mr-1.5" />
		Previous
	{:else}
		Next
		<CarbonCaretRight classNames="ml-1.5" />
	{/if}
</a>
