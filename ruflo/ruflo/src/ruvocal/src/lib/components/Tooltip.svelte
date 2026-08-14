<script lang="ts">
	interface Props {
		classNames?: string;
		label?: string;
		position?: string;
	}

	let {
		classNames = "",
		label = "Copied",
		position = "left-1/2 top-full transform -translate-x-1/2 translate-y-2",
	}: Props = $props();
</script>

<div
	class="
		pointer-events-none absolute rounded bg-black px-2 py-1 font-normal leading-tight text-white shadow transition-opacity
		{position}
		{classNames}
	"
>
	<div
		class="absolute bottom-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-4 border-t-0 border-black"
		style="
				border-left-color: transparent;
				border-right-color: transparent;
			"
	></div>
	{label}
</div>
