<script lang="ts">
	import { onDestroy } from "svelte";
	import { confirm as hapticConfirm } from "$lib/utils/haptics";

	import CarbonCopy from "~icons/carbon/copy";
	import Tooltip from "./Tooltip.svelte";

	interface Props {
		classNames?: string;
		iconClassNames?: string;
		value: string;
		children?: import("svelte").Snippet;
		onClick?: () => void;
		showTooltip?: boolean;
	}

	let {
		classNames = "",
		iconClassNames = "",
		value,
		children,
		onClick,
		showTooltip = true,
	}: Props = $props();

	let isSuccess = $state(false);
	let timeout: ReturnType<typeof setTimeout>;

	const unsecuredCopy = (text: string) => {
		//Old or insecure browsers

		const textArea = document.createElement("textarea");
		textArea.value = text;
		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();
		document.execCommand("copy");
		document.body.removeChild(textArea);

		return Promise.resolve();
	};

	const copy = async (text: string) => {
		if (window.isSecureContext && navigator.clipboard) {
			return navigator.clipboard.writeText(text);
		}
		return unsecuredCopy(text);
	};

	const handleClick = async () => {
		try {
			await copy(value);
			hapticConfirm();

			isSuccess = true;
			if (timeout) {
				clearTimeout(timeout);
			}
			timeout = setTimeout(() => {
				isSuccess = false;
			}, 1000);
		} catch (err) {
			console.error(err);
		}
	};

	onDestroy(() => {
		if (timeout) {
			clearTimeout(timeout);
		}
	});
</script>

<button
	class={classNames}
	title={"Copy to clipboard"}
	type="button"
	onclick={() => {
		onClick?.();
		handleClick();
	}}
>
	<div class="relative">
		{#if children}{@render children()}{:else}
			<CarbonCopy class={iconClassNames} />
		{/if}

		{#if showTooltip}
			<Tooltip classNames={isSuccess ? "opacity-100" : "opacity-0"} />
		{/if}
	</div>
</button>
