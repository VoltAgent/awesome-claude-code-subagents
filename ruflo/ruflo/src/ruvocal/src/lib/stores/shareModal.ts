import { writable } from "svelte/store";

function createShareModalStore() {
	const { subscribe, set } = writable(false);

	return {
		subscribe,
		open: () => set(true),
		close: () => set(false),
	};
}

export const shareModal = createShareModalStore();
