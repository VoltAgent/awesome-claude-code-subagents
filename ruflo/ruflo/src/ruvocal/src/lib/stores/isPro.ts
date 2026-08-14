import { writable } from "svelte/store";

// null = unknown/loading, true = PRO, false = not PRO
export const isPro = writable<boolean | null>(null);
