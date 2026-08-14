import { writable } from "svelte/store";

export interface TitleUpdate {
	convId: string;
	title: string;
}

export default writable<TitleUpdate | null>(null);
