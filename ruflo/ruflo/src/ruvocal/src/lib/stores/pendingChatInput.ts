import { writable } from "svelte/store";

export const pendingChatInput = writable<string | undefined>(undefined);
