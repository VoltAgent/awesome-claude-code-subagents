<script lang="ts">
	interface Props {
		isCollapsed: boolean;
		onClick: () => void;
		classNames: string;
	}

	let { isCollapsed, classNames, onClick }: Props = $props();
</script>

<button
	onclick={onClick}
	title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
	class="{classNames} group flex h-16 w-6 flex-col items-center justify-center -space-y-1 outline-none *:h-3 *:w-1 *:rounded-full *:hover:bg-gray-400 dark:*:hover:bg-gray-400 max-md:hidden {!isCollapsed
		? '*:bg-gray-300/70 dark:*:bg-gray-600'
		: '*:bg-gray-300/70 dark:*:bg-gray-600'}"
	name="sidebar-toggle"
	aria-label="Toggle sidebar navigation"
>
	<div class={!isCollapsed ? "group-hover:rotate-[20deg]" : "group-hover:-rotate-[20deg]"}></div>
	<div class={!isCollapsed ? "group-hover:-rotate-[20deg]" : "group-hover:rotate-[20deg]"}></div>
</button>
