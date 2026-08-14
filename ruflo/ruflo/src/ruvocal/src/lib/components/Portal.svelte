<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	interface Props {
		children?: import("svelte").Snippet;
	}

	let { children }: Props = $props();

	let el: HTMLElement | undefined = $state();

	onMount(() => {
		el?.ownerDocument.body.appendChild(el);
	});

	onDestroy(() => {
		if (el?.parentNode) {
			el.parentNode.removeChild(el);
		}
	});
</script>

<div bind:this={el} class="contents" hidden>
	{@render children?.()}
</div>
