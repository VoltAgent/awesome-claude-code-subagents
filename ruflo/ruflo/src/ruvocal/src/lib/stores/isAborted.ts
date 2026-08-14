import { writable } from "svelte/store";

export const isAborted = writable<boolean>(false);
