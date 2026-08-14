<script lang="ts">
	import { requireAuthUser } from "$lib/utils/auth";
	import CarbonImage from "~icons/carbon/image";

	interface Props {
		// import EosIconsLoading from "~icons/eos-icons/loading";
		files: File[];
		mimeTypes?: string[];
		onDrag?: boolean;
		onDragInner?: boolean;
	}

	let {
		files = $bindable(),
		mimeTypes = [],
		onDrag = $bindable(false),
		onDragInner = $bindable(false),
	}: Props = $props();

	async function dropHandle(event: DragEvent) {
		event.preventDefault();
		if (!requireAuthUser() && event.dataTransfer && event.dataTransfer.items) {
			// Use DataTransferItemList interface to access the file(s)
			if (files.length > 0) {
				files = [];
			}
			if (event.dataTransfer.items[0].kind === "file") {
				for (let i = 0; i < event.dataTransfer.items.length; i++) {
					const file = event.dataTransfer.items[i].getAsFile();

					if (file) {
						// check if the file matches the mimeTypes
						// else abort
						if (
							!mimeTypes.some((mimeType: string) => {
								const [type, subtype] = mimeType.split("/");
								const [fileType, fileSubtype] = file.type.split("/");
								return (
									(type === "*" || type === fileType) &&
									(subtype === "*" || subtype === fileSubtype)
								);
							})
						) {
							setErrorMsg(
								`Some file type not supported. Only allowed: ${mimeTypes.join(
									", "
								)}. Uploaded document is of type ${file.type}`
							);
							files = [];
							return;
						}

						// if file is bigger than 10MB abort
						if (file.size > 10 * 1024 * 1024) {
							setErrorMsg("Some file is too big. (10MB max)");
							files = [];
							return;
						}

						// add the file to the files array
						files = [...files, file];

						// Tools removed: no settings update for document parser
					}
				}
				onDrag = false;
			}
		}
	}

	function setErrorMsg(errorMsg: string) {
		onDrag = false;
		alert(errorMsg);
	}
</script>

<div
	id="dropzone"
	role="form"
	ondrop={dropHandle}
	ondragenter={() => (onDragInner = true)}
	ondragleave={() => (onDragInner = false)}
	ondragover={(e) => {
		e.preventDefault();
	}}
	class="relative flex h-28 w-full max-w-4xl flex-col items-center justify-center gap-1 rounded-xl border-2 border-dotted {onDragInner
		? 'border-blue-200 !bg-blue-600/10 text-blue-600 *:pointer-events-none dark:border-blue-600 dark:bg-blue-600/20 dark:text-blue-600'
		: 'bg-gray-100 text-gray-500 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-400'}"
>
	<CarbonImage class="text-xl" />
	<p>Drop File to add to chat</p>
</div>
