<script lang="ts">
	import { tap } from "$lib/utils/haptics";

	interface Props {
		checked: boolean;
		name: string;
	}

	let { checked = $bindable(), name }: Props = $props();

	function toggle() {
		checked = !checked;
		tap();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === " " || e.key === "Enter") {
			e.preventDefault();
			toggle();
		}
	}
</script>

<input bind:checked type="checkbox" {name} class="peer pointer-events-none absolute opacity-0" />
<div
	aria-checked={checked}
	aria-roledescription="switch"
	aria-label="switch"
	role="switch"
	tabindex="0"
	onclick={toggle}
	onkeydown={onKeydown}
	class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-gray-300 p-1 shadow-inner ring-gray-400 peer-checked:bg-blue-600 hover:bg-gray-400 peer-checked:hover:bg-blue-600 focus-visible:ring focus-visible:ring-offset-1 dark:bg-gray-600 dark:ring-gray-700 dark:hover:bg-gray-500 dark:peer-checked:hover:bg-blue-600 peer-checked:[&>div]:translate-x-3.5"
>
	<div class="h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"></div>
</div>
