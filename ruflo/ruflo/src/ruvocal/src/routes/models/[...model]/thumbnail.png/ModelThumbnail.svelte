<script lang="ts">
	import logo from "../../../../../static/huggingchat/fulltext-logo.svg?raw";

	interface Props {
		name: string;
		isHuggingChat?: boolean;
		backgroundImage?: string;
	}

	let { name, isHuggingChat = false }: Props = $props();
</script>

<div
	class=" flex h-[648px] w-full flex-col items-center justify-center bg-black text-white"
	style="background-image: url(https://cdn-uploads.huggingface.co/production/uploads/5f17f0a0925b9863e28ad517/L4XVRJ7MsfFDD7ROx_geO.png);"
>
	<h1 class="mb-8 text-7xl font-bold text-white">
		{name.split("/")[1]}
	</h1>

	{#if isHuggingChat}
		<div class="flex items-center text-5xl text-white">
			<div class="mr-4 text-4xl">Chat with it on</div>
			<!-- eslint-disable-next-line -->
			{@html logo}
		</div>
	{/if}
</div>
